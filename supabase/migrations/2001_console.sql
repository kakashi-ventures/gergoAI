-- 2001_console.sql — cantiere CONSOLE (prefisso 2xxx, vedi CANTIERI.md "Richieste" [13:00] BRIDGE → CONSOLE).
-- Tabelle della memoria: routines, routine_runs, bindings, observations, proposals; view v_* del resoconto.
-- Colonne = campi di contracts-v1 (bridge/contracts.py: Routine, RoutineStep, Binding, Observation, Proposal,
-- ProposalChange). commands, events, bridge_status, guard_status, skills, ontology_versions li crea BRIDGE (1xxx_).
-- Niente RLS né grant qui: li applica public.fondamenta_harden() di FONDAMENTA dopo il lotto (migration 9xxx_),
-- come per 1001/1002. Niente seed. Idempotente: si può rieseguire.

-- ---------------------------------------------------------------- routines (memoria procedurale, versionata)

create table if not exists public.routines (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (length(name) > 0),
  version             int  not null check (version >= 1),
  parent_version      int  check (parent_version is null or parent_version >= 1),
  edited_from_version int  check (edited_from_version is null or edited_from_version >= 1),
  -- list[RoutineStep]: [{skill, place?, prompt?, params?}], almeno un passo (il validatore li controlla)
  steps               jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) >= 1),
  taught_by_voice     boolean not null default false,
  source_utterance    text,
  status              text not null default 'draft' check (status in ('draft','active','deprecated')),
  created_at          timestamptz not null default now(),
  created_by          text,
  unique (name, version)
);
-- Al massimo una versione attiva per nome.
create unique index if not exists routines_one_active on public.routines (name) where status = 'active';

-- ---------------------------------------------------------------- routine_runs ("fai la frontale tre volte")
-- id è uuid come commands.routine_run_id ed events.routine_run_id (1002). Nessuna FK aggiunta da qui sulle
-- tabelle di BRIDGE: 1002 dichiara routine_run_id volutamente senza FK, e il bridge può scrivere events prima
-- che la run esista. La conferma è unica all'inizio: una run che parte o finisce deve averla.

create table if not exists public.routine_runs (
  id              uuid primary key default gen_random_uuid(),
  routine_name    text not null,
  routine_version int  not null,
  repetitions     int  not null default 1 check (repetitions >= 1),
  status          text not null default 'queued'
                  check (status in ('queued','running','done','failed','cancelled')),
  confirmed_at    timestamptz,
  started_at      timestamptz,
  ended_at        timestamptz,
  cycle_time_ms   int check (cycle_time_ms is null or cycle_time_ms >= 0),
  created_at      timestamptz not null default now(),
  foreign key (routine_name, routine_version) references public.routines (name, version),
  constraint routine_run_confirmed_at check (status not in ('running','done') or confirmed_at is not null),
  constraint routine_run_times check (ended_at is null or started_at is null or ended_at >= started_at)
);
create index if not exists routine_runs_routine_idx on public.routine_runs (routine_name, routine_version, status);
create index if not exists routine_runs_created_idx on public.routine_runs (created_at desc);

-- ---------------------------------------------------------------- bindings (lessico della postazione)

create table if not exists public.bindings (
  expression text primary key check (length(expression) > 0),
  means      jsonb not null check (jsonb_typeof(means) = 'object'),
  alpha      double precision not null default 1 check (alpha >= 0),
  beta       double precision not null default 1 check (beta >= 0),
  regime     text not null default 'WORKING' check (regime in ('WORKING','CANONICAL')),
  uses       int  not null default 0 check (uses >= 0),
  last_used  timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- observations (pattern miner, deterministico)

create table if not exists public.observations (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('anomaly','pattern')),
  rule           text not null check (rule in ('slow_step','repeated_failure','repeated_correction',
                                               'repeated_sequence','redundant_step','safety_pattern')),
  -- list[str] di id di events, almeno uno
  evidence       text[] not null check (cardinality(evidence) >= 1),
  summary        text not null,
  routine_run_id uuid references public.routine_runs (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists observations_created_idx on public.observations (created_at desc);

-- ---------------------------------------------------------------- proposals (ottimizzazione da approvare a voce)

create table if not exists public.proposals (
  id             uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.observations (id),
  -- ProposalChange: {routine, from_version, to_version, diff}
  change         jsonb not null check (jsonb_typeof(change) = 'object'
                   and change ?& array['routine','from_version','to_version','diff']),
  status         text not null default 'pending' check (status in ('pending','approved','rejected','reverted')),
  metric         text not null default 'cycle_time_ms',
  before         double precision,
  after          double precision,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     text,
  constraint proposal_decided_at check (status = 'pending' or decided_at is not null)
);
create index if not exists proposals_status_idx on public.proposals (status, created_at desc);

-- ---------------------------------------------------------------- view del resoconto (numeri solo da SQL)

-- Cicli per routine e versione (v1 vs v2). Una riga per ogni versione esistente, anche con 0 cicli.
create or replace view public.v_cycle_stats with (security_invoker = true) as
select
  r.name                                                         as routine_name,
  r.version                                                      as routine_version,
  r.status                                                       as routine_status,
  count(rr.id)                                                   as cycles,
  avg(rr.cycle_time_ms)::double precision                        as avg_cycle_time_ms,
  percentile_cont(0.5) within group (order by rr.cycle_time_ms)  as median_cycle_time_ms,
  min(rr.cycle_time_ms)                                          as min_cycle_time_ms,
  max(rr.cycle_time_ms)                                          as max_cycle_time_ms,
  max(rr.ended_at)                                               as last_cycle_at
from public.routines r
left join public.routine_runs rr
  on rr.routine_name = r.name and rr.routine_version = r.version and rr.status = 'done'
group by r.name, r.version, r.status;

-- Turno di oggi (giorno di Europe/Rome): una sola riga.
create or replace view public.v_shift_summary with (security_invoker = true) as
with bounds as (
  select (now() at time zone 'Europe/Rome')::date                                         as day,
         (date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome') as t0,
         ((date_trunc('day', now() at time zone 'Europe/Rome') + interval '1 day')
            at time zone 'Europe/Rome')                                                   as t1
),
runs as (
  select count(*)                          as cycles_done,
         avg(rr.cycle_time_ms)::double precision as avg_cycle_time_ms
  from public.routine_runs rr, bounds b
  where rr.status = 'done' and coalesce(rr.ended_at, rr.created_at) >= b.t0
    and coalesce(rr.ended_at, rr.created_at) < b.t1
),
ev as (
  select count(*) filter (where e.type in ('correction','feedback'))                            as corrections,
         count(*) filter (where e.type = 'stop')                                                as stops,
         count(*) filter (where e.type = 'anomaly')                                             as anomalies,
         count(*) filter (where e.type = 'safety_trigger')                                      as safety_triggers,
         count(*) filter (where e.type = 'motion_check' and e.payload->>'geofence_ok' = 'false') as motion_rejected_geofence
  from public.events e, bounds b
  where e.ts >= b.t0 and e.ts < b.t1
),
prop as (
  select count(*) as proposals_approved
  from public.proposals p, bounds b
  where p.status = 'approved' and p.decided_at >= b.t0 and p.decided_at < b.t1
),
cmd as (
  -- Deve essere 0. Oggi e da sempre.
  select count(*) filter (where c.created_at >= b.t0 and c.created_at < b.t1) as commands_unconfirmed_executed,
         count(*)                                                             as commands_unconfirmed_executed_all_time
  from public.commands c, bounds b
  where c.confirmed_at is null and (c.status in ('running','done') or c.started_at is not null)
)
select b.day, b.t0 as shift_start, b.t1 as shift_end,
       runs.cycles_done, runs.avg_cycle_time_ms,
       ev.corrections, ev.stops, ev.anomalies, ev.safety_triggers,
       prop.proposals_approved,
       cmd.commands_unconfirmed_executed, cmd.commands_unconfirmed_executed_all_time,
       ev.motion_rejected_geofence
from bounds b, runs, ev, prop, cmd;

-- Ontologia attiva: l'ultima versione confermata, altrimenti l'ultima in draft. Una sola riga (nessuna se vuota).
create or replace view public.v_ontology_status with (security_invoker = true) as
with active as (
  select ov.*
  from public.ontology_versions ov
  order by (ov.status = 'confirmed') desc, ov.version desc
  limit 1
)
select a.version                                               as ontology_version,
       a.status                                                as ontology_status,
       a.confirmed_by,
       a.confirmed_at,
       count(s.id)                                             as skills_total,
       count(s.id) filter (where s.status = 'draft')           as skills_draft,
       count(s.id) filter (where s.status = 'confirmed')       as skills_confirmed,
       count(s.id) filter (where s.status = 'deprecated')      as skills_deprecated,
       count(s.id) filter (where s.sim_ok)                     as skills_sim_ok,
       count(s.id) filter (where s.real_ok)                    as skills_real_ok
from active a
left join public.skills s on s.ontology_version = a.version
group by a.version, a.status, a.confirmed_by, a.confirmed_at;

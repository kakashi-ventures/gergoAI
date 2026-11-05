-- 2002_console_runs_align — allinea routine_runs a bridge/composer.py (richiesta BRIDGE → CONSOLE delle 12:53)
-- e conta i cicli dagli event step_end {cycle: true}, perché un run con repetitions > 1 fa più cicli.
-- Idempotente.

-- routine_version null = la versione active al momento del run
alter table public.routine_runs alter column routine_version drop not null;

-- il web crea il run già "confirmed" dopo il "sì"
alter table public.routine_runs drop constraint if exists routine_runs_status_check;
alter table public.routine_runs add constraint routine_runs_status_check
  check (status in ('queued','confirmed','running','done','failed','cancelled'));
alter table public.routine_runs drop constraint if exists routine_run_confirmed_at;
alter table public.routine_runs add constraint routine_run_confirmed_at
  check (status not in ('confirmed','running','done') or confirmed_at is not null);

-- il composer scrive finished_at, current_step, current_repetition
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'routine_runs' and column_name = 'ended_at')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'routine_runs' and column_name = 'finished_at') then
    alter table public.routine_runs rename column ended_at to finished_at;
  end if;
end $$;
alter table public.routine_runs add column if not exists finished_at timestamptz;
alter table public.routine_runs add column if not exists current_step int;
alter table public.routine_runs add column if not exists current_repetition int;

-- Cicli per routine e versione, dagli event di fine ciclo (stesse colonne della 2001).
create or replace view public.v_cycle_stats with (security_invoker = true) as
with cyc as (
  select e.payload->>'routine'                       as routine_name,
         (e.payload->>'version')::int                as routine_version,
         round((e.payload->>'cycle_time_ms')::numeric)::int as cycle_time_ms,
         e.ts
  from public.events e
  where e.type = 'step_end' and e.payload->>'cycle' = 'true' and coalesce(e.payload->>'ok', 'true') = 'true'
)
select
  r.name                                                         as routine_name,
  r.version                                                      as routine_version,
  r.status                                                       as routine_status,
  count(c.ts)                                                    as cycles,
  avg(c.cycle_time_ms)::double precision                         as avg_cycle_time_ms,
  percentile_cont(0.5) within group (order by c.cycle_time_ms)   as median_cycle_time_ms,
  min(c.cycle_time_ms)                                           as min_cycle_time_ms,
  max(c.cycle_time_ms)                                           as max_cycle_time_ms,
  max(c.ts)                                                      as last_cycle_at
from public.routines r
left join cyc c on c.routine_name = r.name and c.routine_version = r.version
group by r.name, r.version, r.status;

-- Turno di oggi. Cicli dagli event; le correzioni non contano i feedback di servizio di attendi_operatore.
create or replace view public.v_shift_summary with (security_invoker = true) as
with bounds as (
  select (now() at time zone 'Europe/Rome')::date                                         as day,
         (date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome') as t0,
         ((date_trunc('day', now() at time zone 'Europe/Rome') + interval '1 day')
            at time zone 'Europe/Rome')                                                   as t1
),
runs as (
  select count(*)                                       as cycles_done,
         avg((e.payload->>'cycle_time_ms')::double precision) as avg_cycle_time_ms
  from public.events e, bounds b
  where e.type = 'step_end' and e.payload->>'cycle' = 'true' and coalesce(e.payload->>'ok', 'true') = 'true'
    and e.ts >= b.t0 and e.ts < b.t1
),
ev as (
  select count(*) filter (where e.type = 'correction'
                             or (e.type = 'feedback'
                                 and coalesce(e.payload->>'awaiting', 'false') <> 'true'
                                 and coalesce(e.payload->>'done', 'false') <> 'true'
                                 and lower(coalesce(e.payload->>'text', '')) not in ('fatto', '')))  as corrections,
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

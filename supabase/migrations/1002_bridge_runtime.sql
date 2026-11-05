-- 1002_bridge_runtime.sql — cantiere BRIDGE. Tabelle che il bridge legge e scrive: commands, events,
-- bridge_status, guard_status. Colonne = campi di contracts-v1 (shared/contracts.md).
-- CONSOLE crea routines, routine_runs, bindings, observations, proposals e le view v_* (2xxx_).
-- routine_run_id resta senza foreign key: routine_runs è di CONSOLE.

create table if not exists public.commands (
  id             uuid primary key default gen_random_uuid(),
  skill          text not null check (skill in ('solleva','deposita','porta','applica','home','stop',
                                                'sposta','piu_piano','piu_veloce')),
  params         jsonb not null default '{}'::jsonb,
  routine_run_id uuid,
  step           int,
  status         text not null default 'queued'
                 check (status in ('queued','confirmed','running','done','failed','cancelled')),
  readback       text,
  created_at     timestamptz not null default now(),
  confirmed_at   timestamptz,
  started_at     timestamptz,
  finished_at    timestamptz,
  constraint command_confirmed_at check (status not in ('confirmed','running','done') or confirmed_at is not null),
  -- Grok non emette coordinate: nessuna chiave di posa nei params
  constraint command_no_coordinates check (not (params ?| array['x','y','z','rx','ry','rz','pose','target_pose','joints']))
);
create index if not exists commands_status_idx on public.commands (status, created_at);

create table if not exists public.events (
  id             uuid primary key default gen_random_uuid(),
  ts             timestamptz not null default now(),
  type           text not null check (type in ('utterance','interpretation','confirmation','correction',
                   'step_start','step_end','feedback','stop','anomaly','proposal','approval',
                   'safety_trigger','motion_check','speed_change')),
  routine_run_id uuid,
  command_id     uuid,
  step           int,
  payload        jsonb not null default '{}'::jsonb
);
create index if not exists events_ts_idx on public.events (ts desc);
create index if not exists events_type_idx on public.events (type, ts desc);

create table if not exists public.bridge_status (
  bridge_id         text primary key,
  mode              text not null check (mode in ('sim','elite')),
  ontology_version  int,
  adapter           text not null,
  last_command_id   uuid,
  velocita_mm_s     double precision not null default 50 check (velocita_mm_s between 10 and 100),
  guard_alive       boolean not null default false,
  station           jsonb not null default '{}'::jsonb,
  pose_mm           double precision[],
  last_heartbeat_at timestamptz not null default now()
);

-- Heartbeat di audio_guard (BRACCIO, /safety), ogni 250 ms. Il bridge rifiuta i movimenti se è più vecchio di 1 s.
create table if not exists public.guard_status (
  bridge_id         text primary key,
  alive             boolean not null default false,
  last_heartbeat_at timestamptz not null default now(),
  last_trigger      jsonb
);

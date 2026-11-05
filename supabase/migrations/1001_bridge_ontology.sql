-- 1001_bridge_ontology.sql — cantiere BRIDGE (contracts-v1). Ontologia confermabile della postazione.
-- Regola: una skill passa a "confirmed" solo con sim_ok = true e una persona che conferma (confirmed_by/at).
-- real_ok lo imposta solo il bridge dopo uno step_end ok in mode elite.

create table if not exists public.ontology_versions (
  version       int primary key check (version >= 1),
  status        text not null default 'draft' check (status in ('draft','confirmed')),
  confirmed_by  text,
  confirmed_at  timestamptz,
  note          text,
  created_at    timestamptz not null default now(),
  constraint ontology_confirmed_has_who check (status <> 'confirmed' or (confirmed_by is not null and confirmed_at is not null))
);

create table if not exists public.places (
  ontology_version int not null references public.ontology_versions(version),
  name   text not null check (name in ('INGRESSO','STAZIONE','USCITA','SCARTI','HOME')),
  label  text,
  primary key (ontology_version, name)
);

create table if not exists public.skills (
  id               uuid primary key default gen_random_uuid(),
  ontology_version int not null references public.ontology_versions(version),
  name             text not null check (name in ('solleva','deposita','porta','applica','home','stop',
                                                 'sposta','piu_piano','piu_veloce')),
  kind             text not null check (kind in ('primitive','composite','motion','session')),
  params_schema    jsonb not null default '{}'::jsonb,
  preconditions    text[] not null default '{}',
  effects          text[] not null default '{}',
  jbi              text,
  status           text not null default 'draft' check (status in ('draft','confirmed','deprecated')),
  confirmed_by     text,
  confirmed_at     timestamptz,
  deprecated_reason text,
  sim_ok           boolean not null default false,
  real_ok          boolean not null default false,
  updated_at       timestamptz not null default now(),
  unique (ontology_version, name),
  constraint skill_confirmed_needs_sim check (status <> 'confirmed' or
    (sim_ok and confirmed_by is not null and confirmed_at is not null))
);

-- Tool montato: il bridge rifiuta i movimenti relativi se il TCP del controller non coincide.
create table if not exists public.tools (
  nome          text primary key,
  tcp_atteso_mm double precision[] not null check (array_length(tcp_atteso_mm, 1) = 3),
  attivo        boolean not null default false,
  updated_at    timestamptz not null default now()
);
create unique index if not exists tools_one_active on public.tools (attivo) where attivo;

-- Box di lavoro nel frame utente. source = 'sim' per la demo in simulazione; in mode elite vale solo 'taught'
-- (insegnato con "salva angolo" portando il TCP in jog su due angoli opposti).
create table if not exists public.workspace (
  id         uuid primary key default gen_random_uuid(),
  frame      int not null check (frame between 0 and 7),
  min_mm     double precision[] not null check (array_length(min_mm, 1) = 3),
  max_mm     double precision[] not null check (array_length(max_mm, 1) = 3),
  source     text not null default 'taught' check (source in ('sim','taught')),
  attivo     boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  constraint workspace_box check (min_mm[1] < max_mm[1] and min_mm[2] < max_mm[2] and min_mm[3] < max_mm[3])
);
create unique index if not exists workspace_one_active on public.workspace (attivo) where attivo;

-- Seed della postazione di etichettatura: tutto in draft.
insert into public.ontology_versions (version, status, note)
values (1, 'draft', 'postazione di etichettatura, seed contracts-v1')
on conflict do nothing;

insert into public.places (ontology_version, name, label) values
  (1,'INGRESSO','ingresso'), (1,'STAZIONE','stazione di etichettatura'), (1,'USCITA','uscita'),
  (1,'SCARTI','scarti'), (1,'HOME','home')
on conflict do nothing;

insert into public.skills (ontology_version, name, kind, params_schema, preconditions, effects, jbi) values
  (1,'solleva','primitive','{"place":"PlaceName"}', '{forchetta_libera}', '{forchetta_occupata,at=place}', null),
  (1,'deposita','primitive','{"place":"PlaceName"}', '{forchetta_occupata}', '{forchetta_libera,at=place}', null),
  (1,'porta','primitive','{"place":"PlaceName"}', '{}', '{at=place}', null),
  (1,'applica','primitive','{}', '{at=STAZIONE,forchetta_occupata}', '{}', null),
  (1,'home','primitive','{}', '{}', '{at=HOME}', null),
  (1,'stop','primitive','{}', '{}', '{}', null),
  (1,'sposta','motion','{"$ref":"SpostaParams"}', '{guard_alive,workspace,tcp_coincide,geofence,cinematica}', '{pose+=delta}', null),
  (1,'piu_piano','session','{}', '{}', '{velocita*=0.5,min 10}', null),
  (1,'piu_veloce','session','{}', '{}', '{velocita*=1.5,max 100}', null)
on conflict do nothing;

-- Oggi il TCP è a zero, cioè la flangia [dichiarato: tecnico]. Gli altri tool si aggiungono quando il tecnico
-- imposta il loro TCP sul pendant.
insert into public.tools (nome, tcp_atteso_mm, attivo) values ('flangia', '{0,0,0}', true)
on conflict do nothing;

-- Box di simulazione (non vale in mode elite).
insert into public.workspace (frame, min_mm, max_mm, source, attivo, created_by)
select 1, '{-200,-300,30}', '{300,300,400}', 'sim', true, 'seed'
where not exists (select 1 from public.workspace);

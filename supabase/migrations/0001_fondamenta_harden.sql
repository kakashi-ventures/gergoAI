-- 0001_fondamenta_harden.sql — cantiere FONDAMENTA (prefissi 0xxx e 9xxx, vedi CANTIERI.md "Richieste").
-- Definisce public.fondamenta_harden(): idempotente, si richiama con una migration 9xxx_ dopo ogni lotto
-- di migration di BRIDGE (1xxx_) e CONSOLE (2xxx_). Regole (DEPLOY.md prompt 3):
--   * RLS attiva su TUTTE le tabelle di public;
--   * anon/authenticated: solo SELECT sulle tabelle in lettura (lista sotto) e sulle view v_*;
--   * nessuna INSERT/UPDATE/DELETE per anon/authenticated (revoca dei privilegi, non solo assenza di policy);
--   * le view v_* girano con security_invoker, così rispettano la RLS delle tabelle sottostanti;
--   * events, commands, bridge_status, proposals (e guard_status se esiste) nella publication supabase_realtime.
-- Le scritture passano dalle route server (service role) o dal bridge (service role), che bypassano la RLS.

create or replace function public.fondamenta_harden()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  read_tables text[] := array[
    -- DEPLOY.md prompt 3
    'events','commands','bridge_status','skills','routines','observations','proposals',
    -- MOTION_SAFETY.md: la console mostra ontologia, tool, box di lavoro e stato di audio_guard
    'ontology_versions','tools','workspace','guard_status'
  ];
  realtime_tables text[] := array['events','commands','bridge_status','proposals','guard_status'];
  t record;
  v record;
  n_rls int := 0; n_pol int := 0; n_rt int := 0; n_view int := 0;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r','p') loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated', t.relname);
    n_rls := n_rls + 1;
    if t.relname = any(read_tables) then
      execute format('grant select on public.%I to anon, authenticated', t.relname);
      if not exists (select 1 from pg_policies where schemaname='public' and tablename=t.relname
                     and policyname='fondamenta_anon_read') then
        execute format('create policy fondamenta_anon_read on public.%I for select to anon, authenticated using (true)', t.relname);
        n_pol := n_pol + 1;
      end if;
    else
      execute format('revoke select on public.%I from anon, authenticated', t.relname);
    end if;
    if t.relname = any(realtime_tables) and not exists (
         select 1 from pg_publication_tables where pubname='supabase_realtime'
         and schemaname='public' and tablename=t.relname) then
      execute format('alter publication supabase_realtime add table public.%I', t.relname);
      n_rt := n_rt + 1;
    end if;
  end loop;

  for v in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'v' loop
    execute format('alter view public.%I set (security_invoker = on)', v.relname);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated', v.relname);
    if v.relname like 'v\_%' then
      execute format('grant select on public.%I to anon, authenticated', v.relname);
    else
      execute format('revoke select on public.%I from anon, authenticated', v.relname);
    end if;
    n_view := n_view + 1;
  end loop;

  return jsonb_build_object('tables_rls', n_rls, 'policies_created', n_pol,
                            'realtime_added', n_rt, 'views', n_view);
end $$;

revoke all on function public.fondamenta_harden() from public, anon, authenticated;

-- Le tabelle create in futuro non danno scrittura ad anon per default.
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon, authenticated;

select public.fondamenta_harden();

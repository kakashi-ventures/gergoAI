# Regole per Claude Code — gergoAI

Contesto: hackathon, consegna alle 16:00 del 05/11/2026. Una cosa funzionante end to end batte cinque a metà.
Prodotto: allenare un braccio a voce nella sua postazione, con memoria di lessico, routine, anomalie e pattern.

- Stack: Next.js App Router + TS su Vercel (/web), Supabase (DB, Realtime), bridge Python (/bridge), SDK Elite (/sdk),
  arresto vocale e acustico locale (/safety), misura contro baseline (/eval).
- I contratti in /shared sono la verità: li cambia solo BRIDGE, e mai senza aggiornare zod, pydantic e fixtures nello
  stesso commit (nuovo tag `contracts-vN`).
- Grok Voice per il dialogo e le function call; ogni function call passa da /api/tools e dal validatore.
- Il modello interpreta, il codice decide: validazione, conversione in millimetri, geofence, conteggi, regole del
  pattern miner e numeri del report sono deterministici. Grok racconta numeri che riceve, non li calcola.
- Sicurezza del braccio (MOTION_SAFETY.md vince su DEPLOY.md):
  - Grok non emette coordinate: solo intenti a enum (`sposta {direzione, quantita, unita, intensita}`); i millimetri
    li calcola il codice, con clamp a 100 mm, geofence e controllo di cinematica.
  - Il bridge esegue solo skill della whitelist con `confirmed_at`, una alla volta, con timeout; rifiuta i movimenti
    se l'heartbeat di audio_guard manca da più di 1 s.
  - Nessun comando reale al robot senza averlo mostrato a una persona e ricevuto il suo ok, la prima volta in ogni
    sessione. Accensione, servo, freni, reset di allarmi e collisioni, payload e TCP si fanno dal pendant.
  - Lo stop software non è l'e-stop: l'e-stop è fisico ed è dello staff. Si chiama "arresto vocale e acustico".
- Ogni ottimizzazione è una nuova versione di routine approvata da una persona; mai modifiche automatiche.
- Vercel non modifica codice Python: scrive righe versionate su Supabase, che il bridge rivalida.
- Database: le migration in supabase/migrations le applica solo FONDAMENTA (prefissi 0xxx/9xxx FONDAMENTA, 1xxx BRIDGE,
  2xxx CONSOLE); dopo ogni lotto `public.fondamenta_harden()` (RLS, anon solo SELECT, realtime). Il DB non è il repo:
  dopo ogni applicazione si confronta `list_migrations` con i file.
- Segreti: XAI_API_KEY e SUPABASE_SERVICE_ROLE_KEY mai nel client né nel repo; `.env*` in .gitignore (tranne
  `.env.example`). Nessuna variabile segreta con il prefisso NEXT_PUBLIC_.
- Coordinamento: CANTIERI.md è vincolante (chi possiede cosa, "Richieste", riga di stato). Commit piccoli,
  `git pull --rebase origin main` prima di ogni push, niente force push su main.
- Dopo ogni milestone: test verdi, commit, push. Il lavoro che resta sul disco non esiste.
- Prima di dire "fatto", esegui il check di accettazione della fase e riportane l'output.

# Contratti di Gergo · `contracts-v1`

Fonte di verità: `bridge/contracts.py` (pydantic v2). Gli schemi in `shared/schemas/*.json` sono **generati**
(`python -m bridge.gen_schemas`; il test fallisce se non sono aggiornati). Le fixtures sono in
`shared/fixtures/valid/*.json` e `shared/fixtures/invalid/*.json`, formato `{ "model": "<Nome>", "data": {…},
"why": "…" }`: zod (CONSOLE) e pydantic (BRIDGE) devono dare lo stesso esito su ogni file.

I contratti li cambia solo BRIDGE. Chi ha bisogno di un campo lo chiede in "Richieste" di CANTIERI.md.
Ogni modifica: schema, pydantic e fixtures nello stesso commit, nuovo tag `contracts-vN`, avviso in Richieste.

## Modelli

| Modello | Note |
|---|---|
| `Place` | `name`: INGRESSO · STAZIONE · USCITA · SCARTI · HOME |
| `Skill` | `kind`: primitive · composite · motion · session; `status`: draft · confirmed · deprecated; `jbi` nome del JBI EC o null; `sim_ok`, `real_ok` |
| `OntologyVersion` | `version`, `places[]`, `skills[]`, `tools[]`, `workspace`, `status` draft · confirmed |
| `Tool` | `{nome, tcp_atteso_mm: [x, y, z]}` |
| `Workspace` | `{frame: 0–7, min_mm: [x,y,z], max_mm: [x,y,z]}` nel frame utente |
| `Binding`, `Routine`, `Observation`, `Proposal` | come PLAN.md §3 (Routine: status draft · active · deprecated, `edited_from_version`) |
| `Command` | `skill` ∈ whitelist, `params` validati per skill (sotto), `readback` = frase scritta dal codice |
| `SessionState` | `velocita_mm_s` ∈ [10, 100], default 50; `tool` |
| `Event` | `type` ∈ utterance · interpretation · confirmation · correction · step_start · step_end · feedback · stop · anomaly · proposal · approval · **safety_trigger** · **motion_check** · **speed_change** |
| `SafetyTriggerPayload` | `{trigger: parola|botta|urlo|sfregamento|heartbeat, latency_ms, features}` |
| `MotionCheckPayload` | `{command_id, delta_mm[3], pose_mm?, target_mm?, geofence_ok, fuori_di_mm?, kinematics_ok?, kinematics_reason?, velocita_mm_s, ok, reason?}` |
| `BridgeStatus` | heartbeat del bridge: `mode`, `adapter`, `velocita_mm_s`, `guard_alive` |

## Skill e params (regole che lo schema JSON da solo non esprime: replicarle in zod)

| Skill | Params ammessi (nessun altro campo) |
|---|---|
| `solleva`, `deposita`, `porta` | `{place}` |
| `applica`, `home`, `stop`, `piu_piano`, `piu_veloce` | `{}` |
| `sposta` | `SpostaParams` |

`SpostaParams = {direzione: su|giu|avanti|indietro|destra|sinistra, quantita: number|null (>0), unita: mm|cm|null,
intensita: poco|un_po|tanto|null}`. **Mai coordinate.** Regole: `quantita` e `unita` o entrambe o nessuna;
`quantita` e `intensita` sono alternative. Altre regole cross-field: un `Command` con status confirmed · running ·
done richiede `confirmed_at`; una `Skill` confirmed richiede `sim_ok`, `confirmed_by`, `confirmed_at`; nel
`Workspace` `min_mm < max_mm` su ogni asse; l'`Event` di tipo safety_trigger · motion_check · speed_change ha il
payload del suo modello.

## Dall'intento ai millimetri (MOTION_SAFETY.md §2.1, lo calcola il codice)

`cm → ×10` · `mm → ×1` · `poco = 10 mm` · `un_po = 20 mm` · `tanto = 50 mm` · niente quantità né intensità = 20 mm ·
**clamp a 100 mm per comando**. Velocità di sessione: default 50 mm/s, `piu_piano` ×0,5 (min 10), `piu_veloce`
×1,5 (max 100). La rilettura è del codice: "Scendo di 10 centimetri a 50 millimetri al secondo. Confermi?".

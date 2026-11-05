# xai-notes.md — Grok Voice, verifiche di P0 (cantiere CONSOLE)

Verificato il 05/11/2026 sulle pagine `.md` elencate in https://docs.x.ai/llms.txt. Marker come in HACK.md.
Pagine: **S2S** = https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech.md ·
**REF** = https://docs.x.ai/developers/rest-api-reference/inference/voice.md ·
**EPH** = https://docs.x.ai/developers/model-capabilities/audio/ephemeral-tokens.md

## Decisione di P0

**Client voce nel browser della console**, non `/voice`. Motivo: esistono i token effimeri e il browser si
autentica col subprotocol WebSocket. `/api/voice/token` emette il token (XAI_API_KEY resta sul server), il browser
apre `wss://api.x.ai/v1/realtime` e ogni function call va a `/api/tools/*`.
Kill criterion (PLAN.md P0): meno di 8 frasi su 10 con la function call giusta, o latenza mediana fine parlato →
function call oltre 2,5 s → push-to-talk (`turn_detection: null` + `input_audio_buffer.commit`). Si misura con
`/console/probe` (vedi sotto): **esito non ancora misurato** (serve XAI_API_KEY su Vercel e un microfono).

## Modello ed endpoint
- `wss://api.x.ai/v1/realtime?model=<modello>` `[verificato: REF, S2S]`
- Modelli: `grok-voice-latest` (alias di `grok-voice-3.0`), `grok-voice-3.0`, `grok-voice-2.0` (deprecato). Senza
  `model` vale `grok-voice-latest`. `[verificato: S2S#model-selection]`
- **`XAI_VOICE_MODEL=grok-voice-3.0`** (versione fissata per la demo). `[verificato]`
- Query `reasoning.effort`: `"high"` (default) o `"none"`. Da provare `none` se la latenza sfora. `[verificato: REF]`

## Italiano e voci
- `it` è tra le lingue supportate; il modello riconosce la lingua e risponde nella stessa. `[verificato: S2S#supported-languages]`
- Bias dell'ASR: `audio.input.transcription.language_hint: "it"`. `[verificato: S2S#language-hint]`
- Tutte le voci parlano tutte le lingue; default `eve`. Elenco autorevole: `GET /v1/tts/voices` `[non verificato: 504 senza chiave]`.

## Function calling
- Tool piatti in `session.tools`: `{"type":"function","name":…,"description":…,"parameters":{JSON Schema}}`. `[verificato: S2S#custom-function-tools]`
- Evento: `response.function_call_arguments.done` con `name`, `call_id`, `arguments` (stringa JSON). `[verificato: REF]`
- Risposta: `conversation.item.create {item:{type:"function_call_output", call_id, output:"<stringa JSON>"}}` poi
  `response.create`. Con più call parallele: un output per call, un solo `response.create`. `[verificato: S2S]`
- Aspettare la fine dell'audio in riproduzione prima di `response.create`, o le voci si sovrappongono. `[verificato: S2S#avoid-audio-overlap]`

## Turni, inizio parlato, interruzione
- `turn_detection: {"type":"server_vad"}` oppure `null` (turni manuali). Niente soglie configurabili nello schema. `[verificato: REF, voice-realtime.ws.json]`
- Eventi `input_audio_buffer.speech_started` / `speech_stopped` / `committed`. `[verificato: REF]`
- Con server_vad il barge-in è automatico; il client ferma comunque la riproduzione locale su `speech_started`
  `[non verificato: inferenza]`. **Gergo:** `speech_started` durante un movimento → `/api/tools/stop` (PLAN.md §4).
  È uno stop software in più, non l'arresto vocale e acustico locale (`/safety/audio_guard.py`) né l'e-stop.

## Token effimeri (browser)
- `POST https://api.x.ai/v1/realtime/client_secrets`, `Authorization: Bearer $XAI_API_KEY`,
  body `{"expires_after":{"seconds":300}}` (max 3600, default 600). `[verificato: REF, EPH]`
- Risposta `{"value":"xai-realtime-client-secret-…","expires_at":<unix s>}`. `[verificato: REF]`
- Il campo `session` nel body è contraddittorio tra REF ed EPH: non lo usiamo; il modello va nella query del wss.
- Browser: `new WebSocket("wss://api.x.ai/v1/realtime?model=…", ["xai-client-secret." + token])`. `[verificato: EPH]`
- WebRTC diretto browser→xAI non documentato (solo relay via server proprio). `[verificato: cookbook voice-agent-webrtc]`

## Audio
- `audio.input|output.format`: `{"type":"audio/pcm","rate":24000}` (PCM16 LE, 24 kHz consigliato). Anche pcmu/pcma 8 kHz, opus 24 kHz. `[verificato: S2S#audio]`
- Trasporto `json` (base64 in `input_audio_buffer.append` / `response.output_audio.delta`) o `binary`. `[verificato]`
- Compatibile con OpenAI Realtime; trascrizione utente cumulativa in `conversation.item.input_audio_transcription.updated`. `[verificato: S2S]`

## Costo
- `grok-voice-3.0`: **0,08 $/min** (4,80 $/h) più 0,004 $ per input testuale. `[verificato: https://docs.x.ai/developers/pricing.md]`

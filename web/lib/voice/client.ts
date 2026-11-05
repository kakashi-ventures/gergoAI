"use client";
// Client Grok Voice nel browser (decisione di P0, shared/xai-notes.md). Token effimero da /api/voice/token,
// subprotocol "xai-client-secret.<token>", PCM16 a 24 kHz in base64, server VAD, function calling.
import { VOICE_INSTRUCTIONS, VOICE_TOOLS } from "./tools";

export interface CallMeta { latency_ms: number | null; transcript: string }
export interface VoiceHandlers {
  onCall: (name: string, args: Record<string, unknown>, meta: CallMeta) => Promise<Record<string, unknown>>;
  onSpeechStarted?: () => void;
  onTranscript?: (text: string) => void;
  onLog?: (line: string) => void;
  onState?: (s: "connessione" | "in ascolto" | "chiusa" | "errore") => void;
  onActivity?: (a: Activity) => void;
  onLevel?: (rms: number) => void; // 0..1, livello del microfono
  onReply?: (text: string) => void; // ciò che Grok sta dicendo (trascrizione dell'audio in uscita)
}

export type Activity = "ascolto" | "parli" | "penso" | "risponde";

const WORKLET = `class P extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor("pcm-capture",P)`;
const RATE = 24000;

function f32ToB64(f: Float32Array): string {
  const b = new Uint8Array(f.length * 2);
  const v = new DataView(b.buffer);
  for (let i = 0; i < f.length; i++) v.setInt16(i * 2, Math.max(-1, Math.min(1, f[i])) * 0x7fff, true);
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

function b64ToF32(b64: string): Float32Array {
  const bin = atob(b64);
  const out = new Float32Array(bin.length / 2);
  for (let i = 0; i < out.length; i++) {
    let x = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
    if (x >= 0x8000) x -= 0x10000;
    out[i] = x / 0x8000;
  }
  return out;
}

export class VoiceSession {
  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private playhead = 0;
  private sources: AudioBufferSourceNode[] = [];
  private speechStoppedAt: number | null = null;
  private transcript = "";
  private pendingOutputs = 0;
  private reply = "";
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  private activity(a: Activity) { this.h.onActivity?.(a); }
  private scheduleIdle() {
    if (!this.ctx) return;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const ms = Math.max(0, (this.playhead - this.ctx.currentTime) * 1000) + 150;
    this.idleTimer = setTimeout(() => this.activity("ascolto"), ms);
  }

  constructor(private h: VoiceHandlers) {}

  private log(s: string) { this.h.onLog?.(s); }
  private send(o: unknown) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o)); }

  async start() {
    this.h.onState?.("connessione");
    const tr = await fetch("/api/voice/token", { method: "POST" });
    const tok = (await tr.json()) as { token?: string; model?: string; error?: string };
    if (!tr.ok || !tok.token) { this.h.onState?.("errore"); throw new Error(tok.error ?? `token ${tr.status}`); }

    this.ctx = new AudioContext({ sampleRate: RATE });
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    await this.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" })));
    const src = this.ctx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(this.ctx, "pcm-capture");
    let buf: Float32Array[] = [], n = 0;
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      buf.push(e.data); n += e.data.length;
      if (this.h.onLevel) {
        let sum = 0; for (let k = 0; k < e.data.length; k++) sum += e.data[k] * e.data[k];
        this.h.onLevel(Math.min(1, Math.sqrt(sum / e.data.length) * 6));
      }
      if (n >= RATE / 10) { // ~100 ms per pacchetto
        const all = new Float32Array(n); let o = 0;
        for (const c of buf) { all.set(c, o); o += c.length; }
        buf = []; n = 0;
        this.send({ type: "input_audio_buffer.append", audio: f32ToB64(all) });
      }
    };
    src.connect(node);

    const model = encodeURIComponent(tok.model ?? "grok-voice-3.0");
    this.ws = new WebSocket(`wss://api.x.ai/v1/realtime?model=${model}`, [`xai-client-secret.${tok.token}`]);
    this.ws.onopen = () => {
      this.send({
        type: "session.update",
        session: {
          instructions: VOICE_INSTRUCTIONS,
          voice: "eve",
          turn_detection: { type: "server_vad" },
          tools: VOICE_TOOLS,
          audio: {
            input: { format: { type: "audio/pcm", rate: RATE }, transcription: { language_hint: "it" } },
            output: { format: { type: "audio/pcm", rate: RATE } },
          },
        },
      });
      this.h.onState?.("in ascolto");
    };
    this.ws.onclose = (e) => { this.log(`ws chiusa ${e.code} ${e.reason}`); this.h.onState?.("chiusa"); };
    this.ws.onerror = () => { this.h.onState?.("errore"); };
    this.ws.onmessage = (e) => void this.onMessage(JSON.parse(e.data as string));
  }

  stopPlayback() {
    for (const s of this.sources) { try { s.stop(); } catch { /* già finita */ } }
    this.sources = [];
    this.playhead = 0;
  }

  private play(b64: string) {
    if (!this.ctx) return;
    const f = b64ToF32(b64);
    const ab = this.ctx.createBuffer(1, f.length, RATE);
    ab.copyToChannel(f as Float32Array<ArrayBuffer>, 0);
    const s = this.ctx.createBufferSource();
    s.buffer = ab; s.connect(this.ctx.destination);
    const t = Math.max(this.ctx.currentTime, this.playhead);
    s.start(t); this.playhead = t + ab.duration;
    this.sources.push(s);
    s.onended = () => { this.sources = this.sources.filter((x) => x !== s); };
  }

  private async onMessage(m: { type: string; [k: string]: unknown }) {
    switch (m.type) {
      case "input_audio_buffer.speech_started":
        this.stopPlayback();
        this.transcript = "";
        this.activity("parli");
        this.h.onSpeechStarted?.();
        break;
      case "input_audio_buffer.speech_stopped":
        this.speechStoppedAt = performance.now();
        this.activity("penso");
        break;
      case "response.created":
        this.reply = "";
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        this.reply += String(m.delta ?? "");
        this.h.onReply?.(this.reply);
        break;
      case "response.done":
        this.scheduleIdle();
        break;
      case "conversation.item.input_audio_transcription.updated":
      case "conversation.item.input_audio_transcription.completed":
        this.transcript = String(m.transcript ?? m.text ?? this.transcript);
        this.h.onTranscript?.(this.transcript);
        break;
      case "response.output_audio.delta":
      case "response.audio.delta":
        this.play(String(m.delta));
        this.activity("risponde");
        this.scheduleIdle();
        break;
      case "response.function_call_arguments.done": {
        const latency = this.speechStoppedAt != null ? Math.round(performance.now() - this.speechStoppedAt) : null;
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(String(m.arguments || "{}")); } catch { /* args vuoti */ }
        this.pendingOutputs++;
        const out = await this.h.onCall(String(m.name), args, { latency_ms: latency, transcript: this.transcript }).catch((err: Error) => ({ ok: false, frase: "Errore del server, non faccio niente.", errore: err.message }));
        this.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: m.call_id, output: JSON.stringify(out) } });
        this.pendingOutputs--;
        if (this.pendingOutputs === 0) {
          // Aspetta la fine dell'audio in riproduzione, poi chiedi la risposta (xai-notes: avoid audio overlap).
          const wait = this.ctx ? Math.max(0, (this.playhead - this.ctx.currentTime) * 1000) : 0;
          setTimeout(() => this.send({ type: "response.create" }), wait);
        }
        break;
      }
      case "error":
        this.log(`errore xAI: ${JSON.stringify(m.error ?? m)}`);
        break;
    }
  }

  /** Fa dire a Grok una frase scritta dal codice (es. una proposta del miner). */
  say(text: string) {
    this.send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: `[sistema, non è l'operatore] Di' all'operatore esattamente questa frase e aspetta la risposta: «${text}»` }] } });
    this.send({ type: "response.create" });
  }

  close() {
    this.stopPlayback();
    this.ws?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.ws = null; this.ctx = null; this.stream = null;
  }
}

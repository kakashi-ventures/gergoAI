"use client";
// Scena illustrata della landing: una postazione in fabbrica con il cobot, l'operatore con l'headset,
// il tecnico con il pendant e la chat vocale. Cambia con il capitolo attivo (0–5). Solo SVG, niente immagini esterne.

export const CHAPTERS = 6;

type Pose = { base: number; shoulder: number; elbow: number; wrist: number; drop: number };
// Angoli del braccio per capitolo (gradi): riposo, insegnamento, solleva, scende di 10 cm, ciclo ottimizzato, fermo.
const POSES: Pose[] = [
  { base: 0, shoulder: -38, elbow: 70, wrist: 148, drop: 0 },
  { base: 0, shoulder: -20, elbow: 55, wrist: 145, drop: 0 },
  { base: 0, shoulder: -52, elbow: 95, wrist: 137, drop: 0 },
  { base: 0, shoulder: -30, elbow: 80, wrist: 130, drop: 26 },
  { base: 0, shoulder: -60, elbow: 100, wrist: 140, drop: 0 },
  { base: 0, shoulder: -30, elbow: 80, wrist: 130, drop: 14 },
];

const T = "transition-all duration-700 ease-out";
const show = (on: boolean) => `${T} ${on ? "opacity-100" : "opacity-0"}`;

function Tag({ x, y, text, color = "#1d3fd6", on }: { x: number; y: number; text: string; color?: string; on: boolean }) {
  const w = text.length * 6.6 + 28;
  return (
    <g className={show(on)} transform={`translate(${x} ${y})`}>
      <rect width={w} height="22" rx="4" fill="#fff" stroke="#d7dbe0" />
      <circle cx="11" cy="11" r="3.5" fill={color} />
      <text x="20" y="15" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="10.5" fill="#1f2937" letterSpacing="0.6">{text}</text>
    </g>
  );
}

function Bubble({ x, y, w, lines, who, on, accent = false }: { x: number; y: number; w: number; lines: string[]; who: string; on: boolean; accent?: boolean }) {
  const h = 26 + lines.length * 17;
  return (
    <g className={show(on)} transform={`translate(${x} ${y})`}>
      <rect width={w} height={h} rx="14" fill={accent ? "#1d3fd6" : "#ffffff"} stroke={accent ? "none" : "#d7dbe0"} />
      <text x="14" y="17" fontSize="9.5" fontWeight="700" fill={accent ? "#c7d2fe" : "#6b7280"} letterSpacing="1">{who}</text>
      {lines.map((l, i) => (
        <text key={i} x="14" y={34 + i * 17} fontSize="13" fill={accent ? "#ffffff" : "#111827"}>{l}</text>
      ))}
    </g>
  );
}

function Person({ x, y, shirt, headset = false, tablet = false, scale = 1 }: { x: number; y: number; shirt: string; headset?: boolean; tablet?: boolean; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="0" cy="150" rx="34" ry="7" fill="#000" opacity="0.08" />
      <rect x="-14" y="92" width="11" height="58" rx="5" fill="#2b3442" />
      <rect x="3" y="92" width="11" height="58" rx="5" fill="#2b3442" />
      <path d="M-24 40 q24 -14 48 0 l4 58 h-56 z" fill={shirt} />
      <rect x="-24" y="60" width="48" height="5" fill="#000" opacity="0.08" />
      <circle cx="0" cy="22" r="17" fill="#f1c7a5" />
      <path d="M-17 18 q2 -20 19 -19 q16 1 15 18 q-6 -9 -17 -9 q-11 0 -17 10z" fill="#3b2a20" />
      {headset && (
        <g>
          <path d="M-18 20 q0 -26 18 -26 q18 0 18 26" fill="none" stroke="#111827" strokeWidth="3.5" />
          <rect x="-22" y="16" width="7" height="13" rx="3" fill="#111827" />
          <rect x="15" y="16" width="7" height="13" rx="3" fill="#111827" />
          <path d="M-18 28 q6 14 16 12" fill="none" stroke="#111827" strokeWidth="2.5" />
          <circle cx="-2" cy="40" r="3" fill="#ff7a1a" />
        </g>
      )}
      {tablet ? (
        <g>
          <path d="M-22 48 q-10 22 8 34" fill="none" stroke={shirt} strokeWidth="11" strokeLinecap="round" />
          <path d="M22 48 q10 22 -8 34" fill="none" stroke={shirt} strokeWidth="11" strokeLinecap="round" />
          <rect x="-20" y="70" width="40" height="28" rx="4" fill="#1f2937" />
          <rect x="-16" y="74" width="32" height="16" rx="2" fill="#60a5fa" />
          <circle cx="12" cy="94" r="2.5" fill="#ef4444" />
        </g>
      ) : (
        <g>
          <path d="M-22 48 q-12 26 -4 46" fill="none" stroke={shirt} strokeWidth="11" strokeLinecap="round" />
          <path d="M22 48 q16 18 22 4" fill="none" stroke={shirt} strokeWidth="11" strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

export function Scene({ ch, paused }: { ch: number; paused: boolean }) {
  const p = POSES[Math.max(0, Math.min(POSES.length - 1, ch))];
  const anim = paused ? "[animation-play-state:paused]" : "";
  const rot = (deg: number, ox: number, oy: number) => ({ transform: `rotate(${deg}deg)`, transformOrigin: `${ox}px ${oy}px`, transformBox: "view-box" as const });
  const stop = ch === 5;

  return (
    <svg viewBox="0 0 800 620" preserveAspectRatio="xMidYMid meet" className="h-full w-full" role="img"
      aria-label="Una postazione in fabbrica: un braccio robotico su un banco con i vassoi, l'operatore con l'headset che gli parla, il tecnico con il pendant, e la chat vocale che rilegge ogni comando prima di eseguirlo.">
      <defs>
        <linearGradient id="g-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#eef0f3" /><stop offset="1" stopColor="#e2e6ea" /></linearGradient>
        <linearGradient id="g-arm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff9a4d" /><stop offset="1" stopColor="#f26a0d" /></linearGradient>
        <pattern id="p-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#d9dde2" strokeWidth="1" /></pattern>
      </defs>

      {/* Capannone: parete, finestre, scaffali, nastro sullo sfondo */}
      <rect width="800" height="620" fill="#f6f7f9" />
      <rect y="0" width="800" height="330" fill="#eceef1" />
      {[60, 230, 400, 570].map((x) => (
        <g key={x}>
          <rect x={x} y="40" width="130" height="90" rx="4" fill="#dfe3e8" />
          <rect x={x + 6} y="46" width="56" height="78" fill="#f8fafc" opacity="0.9" />
          <rect x={x + 68} y="46" width="56" height="78" fill="#f8fafc" opacity="0.9" />
        </g>
      ))}
      <g opacity="0.55">
        <rect x="30" y="170" width="150" height="150" fill="none" stroke="#c9ced5" strokeWidth="4" />
        {[200, 240, 280].map((y) => <rect key={y} x="30" y={y} width="150" height="4" fill="#c9ced5" />)}
        {[45, 95, 140].map((x) => <rect key={x} x={x} y="176" width="30" height="22" fill="#d5b48a" />)}
        <rect x="610" y="250" width="190" height="16" rx="8" fill="#c9ced5" />
        {[620, 660, 700, 740, 780].map((x) => <circle key={x} cx={x} cy="258" r="6" fill="#b7bdc5" />)}
      </g>
      <rect y="330" width="800" height="290" fill="url(#g-floor)" />
      <rect y="330" width="800" height="290" fill="url(#p-grid)" opacity="0.6" />
      <path d="M0 600 L800 600" stroke="#facc15" strokeWidth="6" strokeDasharray="22 14" opacity="0.6" />

      {/* Banco di lavoro con i luoghi */}
      <path d="M150 400 L650 400 L700 470 L100 470 Z" fill="#d3d8de" />
      <path d="M100 470 L700 470 L700 488 L100 488 Z" fill="#b9c0c8" />
      <rect x="130" y="488" width="14" height="80" fill="#9aa3ad" /><rect x="656" y="488" width="14" height="80" fill="#9aa3ad" />
      {[
        { x: 205, l: "INGRESSO" }, { x: 400, l: "STAZIONE" }, { x: 590, l: "USCITA" },
      ].map((s) => (
        <g key={s.l}>
          <path d={`M${s.x - 55} 418 L${s.x + 55} 418 L${s.x + 62} 452 L${s.x - 62} 452 Z`} fill="none" stroke="#9aa3ad" strokeDasharray="5 4" />
          <text x={s.x} y="466" textAnchor="middle" fontFamily="ui-monospace, Menlo, monospace" fontSize="9" fill="#6b7280" letterSpacing="1.2">{s.l}</text>
        </g>
      ))}
      {/* Vassoi con il pack */}
      <g className={T} style={{ transform: `translateX(${ch >= 4 ? 195 : 0}px)` }}>
        <path d="M168 424 L242 424 L248 444 L162 444 Z" fill="#5b6675" />
        <rect x="182" y="414" width="46" height="14" rx="2" fill="#f5f5f4" stroke="#d6d3d1" />
        <rect x="196" y="417" width="18" height="8" rx="1" fill={ch >= 4 ? "#ff7a1a" : "#e7e5e4"} className={T} />
      </g>
      <path d="M553 424 L627 424 L633 444 L547 444 Z" fill="#5b6675" />

      {/* Area di lavoro (geofence) */}
      <g className={show(ch === 3 || ch === 5)}>
        <path d="M300 300 L520 300 L540 448 L280 448 Z" fill="#1d3fd6" opacity="0.06" stroke="#1d3fd6" strokeDasharray="6 5" />
        <line x1="400" y1="262" x2="400" y2="322" stroke="#1d3fd6" strokeWidth="2" strokeDasharray="3 4" />
        <path d="M393 314 L400 326 L407 314" fill="none" stroke="#1d3fd6" strokeWidth="2" />
        <text x="412" y="300" fontSize="12" fontWeight="700" fill="#1d3fd6">−10 cm</text>
      </g>

      {/* Il cobot: base, spalla, braccio, avambraccio, polso, spintore */}
      <g style={{ transform: `translateY(${p.drop}px)`, transition: "transform 700ms ease-out" }}>
        <ellipse cx="400" cy="408" rx="46" ry="10" fill="#000" opacity="0.12" />
        <rect x="368" y="372" width="64" height="36" rx="8" fill="#374151" />
        <rect x="378" y="350" width="44" height="28" rx="10" fill="url(#g-arm)" />
        <g style={{ ...rot(p.shoulder, 400, 356), transition: "transform 700ms ease-out" }}>
          <rect x="388" y="250" width="24" height="110" rx="12" fill="url(#g-arm)" />
          <circle cx="400" cy="356" r="16" fill="#1f2937" /><circle cx="400" cy="356" r="7" fill="#9ca3af" />
          <g style={{ ...rot(p.elbow, 400, 256), transition: "transform 700ms ease-out" }}>
            <rect x="391" y="166" width="18" height="96" rx="9" fill="url(#g-arm)" />
            <circle cx="400" cy="256" r="13" fill="#1f2937" /><circle cx="400" cy="256" r="5" fill="#9ca3af" />
            <g style={{ ...rot(p.wrist, 400, 170), transition: "transform 700ms ease-out" }}>
              <rect x="393" y="128" width="14" height="44" rx="6" fill="#ff8a33" />
              <circle cx="400" cy="170" r="10" fill="#1f2937" />
              <rect x="390" y="112" width="20" height="18" rx="3" fill="#374151" />
              <rect x="397" y="100" width="6" height="14" rx="2" fill="#9ca3af" />
            </g>
          </g>
        </g>
      </g>
      {/* LED di stato sulla base */}
      <circle cx="420" cy="390" r="4" fill={stop ? "#ef4444" : "#22c55e"} className={T} />

      {/* Operatore con headset, e la sua onda vocale */}
      <g className={show(ch !== 1)}>
        <Person x={150} y={400} shirt="#0f766e" headset />
        <g className={`${show(ch === 2 || ch === 3 || ch === 5)}`} transform="translate(190 400)">
          {[0, 1, 2, 3, 4].map((k) => (
            <rect key={k} x={k * 7} y={-6} width="4" height="12" rx="2" fill={stop ? "#ef4444" : "#0f766e"}
              className={`origin-center motion-safe:animate-[pulse_0.9s_ease-in-out_infinite] ${anim}`} style={{ animationDelay: `${k * 120}ms`, transformBox: "fill-box" }} />
          ))}
        </g>
      </g>
      {/* Tecnico con il pendant */}
      <g className={show(ch === 0 || ch === 1)}>
        <Person x={640} y={400} shirt="#1d3fd6" tablet scale={0.95} />
      </g>

      {/* Capitolo 1: il tecnico insegna le primitive sul pendant */}
      <g className={show(ch === 1)}>
        <rect x="490" y="150" width="190" height="132" rx="12" fill="#fff" stroke="#d7dbe0" />
        <text x="506" y="172" fontSize="9.5" fontWeight="700" fill="#6b7280" letterSpacing="1">PENDANT · TASK INSEGNATI</text>
        {["solleva · INGRESSO", "porta · STAZIONE", "applica", "deposita · USCITA"].map((t, i) => (
          <g key={t} transform={`translate(506 ${186 + i * 22})`}>
            <rect width="158" height="17" rx="4" fill="#eef2ff" />
            <text x="8" y="12.5" fontSize="11" fill="#1e3a8a">✓ {t}</text>
          </g>
        ))}
      </g>

      {/* Capitolo 2: la chat vocale che insegna la routine */}
      <Bubble on={ch === 2} x={40} y={150} w={300} who="OPERATORE" lines={["Ti insegno la frontale: prendi", "dall'ingresso, portalo in stazione,", "aspetta l'etichetta e applica."]} />
      <Bubble on={ch === 2} x={455} y={150} w={300} accent who="GERGO" lines={["La routine «frontale»: sollevo,", "porto in stazione, aspetto te,", "applico, deposito. La salvo?"]} />

      {/* Capitolo 3: rilettura e sì */}
      <Bubble on={ch === 3} x={40} y={160} w={210} who="OPERATORE" lines={["Scendi di 10 centimetri."]} />
      <Bubble on={ch === 3} x={455} y={120} w={300} accent who="GERGO" lines={["Scendo di 10 centimetri", "a 50 millimetri al secondo.", "Confermi?"]} />
      <Bubble on={ch === 3} x={40} y={222} w={90} who="OPERATORE" lines={["Sì."]} />

      {/* Capitolo 4: memoria, proposta, v1 contro v2 */}
      <g className={show(ch === 4)}>
        <rect x="455" y="110" width="300" height="168" rx="14" fill="#fff" stroke="#d7dbe0" />
        <text x="471" y="132" fontSize="9.5" fontWeight="700" fill="#a21caf" letterSpacing="1">LA MEMORIA HA NOTATO</text>
        <text x="471" y="152" fontSize="13" fill="#111827">Tra un ciclo e l&apos;altro torno</text>
        <text x="471" y="169" fontSize="13" fill="#111827">sempre a casa. Lo tolgo?</text>
        <text x="471" y="196" fontSize="10" fill="#6b7280">tempo di ciclo</text>
        <rect x="471" y="204" width="230" height="16" rx="4" fill="#cbd5e1" /><text x="708" y="216" fontSize="10.5" fill="#111827">v1</text>
        <rect x="471" y="228" width="160" height="16" rx="4" fill="#ff7a1a" /><text x="638" y="240" fontSize="10.5" fill="#111827">v2</text>
        <text x="471" y="266" fontSize="9" fill="#9ca3af">illustrazione: i numeri veri si misurano in console</text>
      </g>
      <Bubble on={ch === 4} x={40} y={170} w={150} who="OPERATORE" lines={["Sì, toglilo."]} />

      {/* Capitolo 5: stop */}
      <g className={show(stop)}>
        <rect x="455" y="130" width="300" height="104" rx="14" fill="#fef2f2" stroke="#fca5a5" />
        <text x="471" y="152" fontSize="9.5" fontWeight="700" fill="#b91c1c" letterSpacing="1">ARRESTO VOCALE E ACUSTICO</text>
        <text x="471" y="176" fontSize="20" fontWeight="800" fill="#991b1b">«Fermo!»</text>
        <text x="471" y="200" fontSize="12" fill="#7f1d1d">Riconosciuto in locale, senza cloud.</text>
        <text x="471" y="218" fontSize="12" fill="#7f1d1d">Stop diretto al controller.</text>
      </g>

      {/* Cartellini tecnici, come in una scheda di collaudo */}
      <Tag on={ch === 0} x={470} y={318} text="POSTAZIONE · ETICHETTATURA PACK" />
      <Tag on={ch === 1} x={490} y={296} text="PRIMITIVE · UNA PER LUOGO" />
      <Tag on={ch === 2} x={455} y={240} text="ROUTINE · FRONTALE V1" color="#0f766e" />
      <Tag on={ch === 3} x={548} y={318} text="GEOFENCE OK · CINEMATICA OK" />
      <Tag on={ch === 4} x={455} y={292} text="NUOVA VERSIONE · APPROVATA DA TE" color="#a21caf" />
      <Tag on={stop} x={455} y={250} text="E-STOP FISICO · SEMPRE DELLO STAFF" color="#ef4444" />
    </svg>
  );
}

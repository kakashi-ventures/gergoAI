const PIPELINE = [
  { name: "Voce", note: "l'operatore parla, in italiano", color: "border-sky-400/50 text-sky-300" },
  { name: "Grok", note: "capisce e sceglie un intento", color: "border-fuchsia-400/50 text-fuchsia-300" },
  { name: "Validatore", note: "il codice controlla, rilegge, chiede «sì»", color: "border-emerald-400/50 text-emerald-300" },
  { name: "Bridge", note: "processo locale accanto al braccio", color: "border-white/30 text-[#e6e8eb]" },
  { name: "Braccio", note: "esegue primitive insegnate dal tecnico", color: "border-white/30 text-[#e6e8eb]" },
];

/** Catena voce → Grok → validatore → bridge → braccio. Orizzontale su desktop, verticale su mobile. */
export function PipelineDiagram() {
  return (
    <figure aria-labelledby="pipeline-caption">
      <ol
        className="flex flex-col items-stretch gap-2 md:flex-row md:items-stretch md:gap-0"
        aria-label="Catena di un comando: voce, Grok, validatore, bridge, braccio"
      >
        {PIPELINE.map((s, i) => (
          <li key={s.name} className="flex flex-col items-stretch md:flex-1 md:flex-row md:items-center">
            <div className={`flex-1 rounded-lg border bg-white/[0.03] px-3 py-3 ${s.color}`}>
              <p className="text-sm font-semibold">{s.name}</p>
              <p className="mt-1 text-xs leading-snug text-[#9aa1a9]">{s.note}</p>
            </div>
            {i < PIPELINE.length - 1 && (
              <span aria-hidden="true" className="self-center py-1 text-[#5d646c] md:px-1.5 md:py-0">
                <span className="md:hidden">↓</span>
                <span className="hidden md:inline">→</span>
              </span>
            )}
          </li>
        ))}
      </ol>
      <figcaption id="pipeline-caption" className="mt-3 text-xs text-[#9aa1a9]">
        Grok emette solo intenti da un elenco chiuso, mai coordinate. Il validatore decide se un comando si esegue.
        Lo stop vocale e acustico (audio_guard) non passa da Grok né dal cloud: va diretto al controller.
      </figcaption>
    </figure>
  );
}

const LOOP = ["Osserva", "Propone a voce", "L'operatore approva", "Misura prima e dopo", "Tiene o torna indietro"];

/** Ciclo di ottimizzazione: cinque nodi su un anello (SVG), con elenco testuale per i lettori di schermo. */
export function LoopDiagram() {
  const cx = 160;
  const cy = 150;
  const r = 105;
  const pts = LOOP.map((_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / LOOP.length;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  return (
    <figure className="mx-auto w-full max-w-sm" aria-labelledby="loop-caption">
      <svg viewBox="0 0 320 300" role="img" aria-labelledby="loop-title" className="h-auto w-full">
        <title id="loop-title">
          Ciclo: osserva, propone a voce, l&apos;operatore approva, misura prima e dopo, tiene o torna indietro, poi
          di nuovo osserva.
        </title>
        <defs>
          <marker id="loop-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#5d646c" />
          </marker>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a2f36" strokeWidth="2" strokeDasharray="4 6" />
        {pts.map((p, i) => {
          const q = pts[(i + 1) % pts.length];
          const mx = p.x + (q.x - p.x) * 0.3;
          const my = p.y + (q.y - p.y) * 0.3;
          const nx = p.x + (q.x - p.x) * 0.7;
          const ny = p.y + (q.y - p.y) * 0.7;
          return (
            <line
              key={`a${i}`}
              x1={mx}
              y1={my}
              x2={nx}
              y2={ny}
              stroke="#5d646c"
              strokeWidth="1.5"
              markerEnd="url(#loop-arrow)"
            />
          );
        })}
        {pts.map((p, i) => {
          const human = i === 2;
          return (
            <g key={LOOP[i]}>
              <circle
                cx={p.x}
                cy={p.y}
                r="9"
                fill={human ? "#34d399" : "#0b0d10"}
                stroke={human ? "#34d399" : "#38bdf8"}
                strokeWidth="2"
              />
              <text
                x={p.x}
                y={p.y + (p.y < cy ? -16 : 24)}
                textAnchor="middle"
                fontSize="12"
                fill={human ? "#6ee7b7" : "#e6e8eb"}
              >
                {LOOP[i]}
              </text>
            </g>
          );
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="13" fontWeight="600" fill="#e6e8eb">
          routine vN
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="11" fill="#9aa1a9">
          versionata e reversibile
        </text>
      </svg>
      <figcaption id="loop-caption" className="mt-2 text-center text-xs text-[#9aa1a9]">
        In verde il passo umano: senza «sì» non nasce nessuna versione nuova.
      </figcaption>
    </figure>
  );
}

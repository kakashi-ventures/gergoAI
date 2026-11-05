"use client";
import type { Workspace } from "@/lib/mock";

// Box di lavoro visto dall'alto (x, y nel frame utente) con la posizione del TCP e la sua quota z.
export function WorkspaceBox({ ws, tcp, onSaveCorner }: { ws: Workspace; tcp: [number, number, number]; onSaveCorner?: () => void }) {
  const W = 260, H = 180, pad = 16;
  const [x0, y0] = ws.min_mm, [x1, y1] = ws.max_mm;
  const sx = (x: number) => pad + ((x - x0) / (x1 - x0)) * (W - 2 * pad);
  const sy = (y: number) => H - pad - ((y - y0) / (y1 - y0)) * (H - 2 * pad);
  const inside = tcp.every((v, i) => v >= ws.min_mm[i] && v <= ws.max_mm[i]);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded bg-black/30" role="img" aria-label="Area di lavoro vista dall'alto">
        <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} fill="none" stroke="#38bdf8" strokeDasharray="4 3" />
        <text x={pad} y={pad - 4} fill="#94a3b8" fontSize="9">frame «{ws.frame}» · vista dall&apos;alto</text>
        <circle cx={sx(tcp[0])} cy={sy(tcp[1])} r="6" fill={inside ? "#34d399" : "#ef4444"} />
        <text x={sx(tcp[0]) + 9} y={sy(tcp[1]) + 3} fill="#e2e8f0" fontSize="9">TCP</text>
      </svg>
      <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-xs text-white/70">
        <span>x {tcp[0].toFixed(1)} mm</span><span>y {tcp[1].toFixed(1)} mm</span><span>z {tcp[2].toFixed(1)} mm</span>
      </div>
      <div className="mt-1 font-mono text-[11px] text-white/40">
        box [{ws.min_mm.join(", ")}] → [{ws.max_mm.join(", ")}] · z_min = tavolo + 30
      </div>
      <button onClick={onSaveCorner} className="mt-3 rounded border border-sky-400/40 px-3 py-1.5 text-sm text-sky-300 hover:bg-sky-400/10">
        salva angolo
      </button>
    </div>
  );
}

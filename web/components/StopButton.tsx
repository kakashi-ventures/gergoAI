"use client";
import { useCallback, useEffect, useState } from "react";

// STOP sempre visibile, anche da tastiera (barra spaziatrice). È uno stop software: l'e-stop è fisico ed è dello staff.
export function StopButton() {
  const [sent, setSent] = useState<string | null>(null);
  const stop = useCallback(async () => {
    setSent("invio…");
    try {
      const r = await fetch("/api/tools/stop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "console" }) });
      setSent(r.ok ? "stop inviato" : `errore ${r.status}`);
    } catch {
      setSent("rete assente");
    }
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.code === "Space" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        void stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stop]);
  return (
    <div className="flex items-center gap-3">
      {sent && <span className="text-xs text-white/60">{sent}</span>}
      <button onClick={stop} className="rounded-lg bg-red-600 px-8 py-3 text-xl font-black tracking-widest text-white shadow-lg shadow-red-900/50 hover:bg-red-500 active:scale-95" title="Barra spaziatrice">
        STOP
      </button>
    </div>
  );
}

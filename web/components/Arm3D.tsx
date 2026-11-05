"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ARM, fkPoints, inBox, schematicArm, type V3 } from "@/lib/arm3d";

// Spazio percepito del braccio: posa attuale, scia dal registro, area di lavoro e percorso del movimento in prova
// (versione precedente contro versione corretta). mm nel frame utente; Three.js con l'asse Z verso l'alto.
export interface Plan { name: string; prevVersion?: number; nextVersion: number; prev?: V3[]; next: V3[] }

const K = 1 / 1000; // mm → unità della scena (m)
const v = (p: V3) => new THREE.Vector3(p[0] * K, p[1] * K, p[2] * K);

export function Arm3D({ tcp, joints, workspace, trail, plan }: {
  tcp: V3 | null; joints?: number[] | null; workspace: { min_mm: number[]; max_mm: number[] } | null; trail: V3[]; plan: Plan | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ setArm: (tcp: V3 | null, joints?: number[] | null, ghost?: V3 | null) => void; setScene: (trail: V3[], plan: Plan | null, ws: typeof workspace) => void } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [info, setInfo] = useState<string>("");

  // Scena, una volta sola
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 20);
    camera.up.set(0, 0, 1);
    camera.position.set(1.15, -0.95, 0.85);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0.15, -0.05, 0.2);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(1, -1, 2); scene.add(sun);

    // banco e assi del frame utente
    const grid = new THREE.GridHelper(1.4, 28, 0x475569, 0x1e293b); grid.rotation.x = Math.PI / 2; scene.add(grid);
    const axes = new THREE.AxesHelper(0.12); scene.add(axes); // x rosso = avanti, y verde = sinistra, z blu = su
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.04, 32), new THREE.MeshStandardMaterial({ color: 0x374151 }));
    base.rotation.x = Math.PI / 2; base.position.z = 0.02; scene.add(base);

    const dyn = new THREE.Group(); scene.add(dyn);      // scia, percorsi, box
    const armG = new THREE.Group(); scene.add(armG);    // braccio attuale
    const ghostG = new THREE.Group(); scene.add(ghostG); // braccio in anteprima
    const orange = new THREE.MeshStandardMaterial({ color: 0xf97316, metalness: 0.2, roughness: 0.45 });
    const ghostM = new THREE.MeshStandardMaterial({ color: 0x34d399, transparent: true, opacity: 0.45 });
    const joint = new THREE.MeshStandardMaterial({ color: 0x111827 });

    const wipe = (g: THREE.Group) => {
      g.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; if (mat && !Array.isArray(mat) && mat !== orange && mat !== ghostM && mat !== joint) mat.dispose(); });
      g.clear();
    };
    const link = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) => {
      const len = a.distanceTo(b);
      const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 16), m);
      g.position.copy(a).add(b).multiplyScalar(0.5);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      return g;
    };
    const drawArm = (g: THREE.Group, pts: V3[], m: THREE.Material, withJoints: boolean) => {
      wipe(g);
      const P = pts.map(v);
      for (let i = 0; i < P.length - 1; i++) if (P[i].distanceTo(P[i + 1]) > 1e-4) g.add(link(P[i], P[i + 1], i === P.length - 2 ? 0.012 : 0.022, m));
      if (withJoints) for (const p of P.slice(1, -1)) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), joint); s.position.copy(p); g.add(s); }
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 12), new THREE.MeshStandardMaterial({ color: withJoints ? 0xfacc15 : 0x34d399 }));
      tip.position.copy(P[P.length - 1]); g.add(tip);
    };
    const line = (pts: V3[], color: number, dashed = false) => {
      const geo = new THREE.BufferGeometry().setFromPoints(pts.map(v));
      const mat = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.01, gapSize: 0.008 }) : new THREE.LineBasicMaterial({ color });
      const l = new THREE.Line(geo, mat); if (dashed) l.computeLineDistances(); return l;
    };
    const addAll = (objs: THREE.Object3D[]) => { if (objs.length) dyn.add(...objs); };
    const dots = (pts: V3[], color: number, r = 0.006) => pts.map((p) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ color })); s.position.copy(v(p)); return s; });

    let framed = false;
    api.current = {
      setArm: (t, q, ghost) => {
        if (q && q.length === 6) drawArm(armG, fkPoints(q).points, orange, true);
        else if (t) drawArm(armG, schematicArm(t).points, orange, true);
        else wipe(armG);
        if (ghost) drawArm(ghostG, schematicArm(ghost).points, ghostM, false); else wipe(ghostG);
      },
      setScene: (tr, pl, ws) => {
        wipe(dyn);
        if (ws) {
          const min = ws.min_mm, max = ws.max_mm;
          if (!framed) { // inquadra l'area di lavoro la prima volta
            framed = true;
            const c = new THREE.Vector3(((min[0] + max[0]) / 2) * K, ((min[1] + max[1]) / 2) * K, ((min[2] + max[2]) / 2) * K);
            controls.target.copy(c.clone().multiplyScalar(0.6));
            camera.position.copy(c.clone().add(new THREE.Vector3(1.25, -0.85, 0.6)));
          }
          const box = new THREE.Box3(v(min as V3), v(max as V3));
          const helper = new THREE.Box3Helper(box, new THREE.Color(0x38bdf8)); dyn.add(helper);
          const floor = new THREE.Mesh(new THREE.PlaneGeometry((max[0] - min[0]) * K, (max[1] - min[1]) * K), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.06, side: THREE.DoubleSide }));
          floor.position.set(((min[0] + max[0]) / 2) * K, ((min[1] + max[1]) / 2) * K, min[2] * K); dyn.add(floor);
        }
        if (tr.length > 1) dyn.add(line(tr, 0x94a3b8));
        addAll(dots(tr, 0x64748b, 0.004));
        if (pl) {
          if (pl.prev && pl.prev.length > 1) { dyn.add(line(pl.prev, 0x9ca3af, true)); addAll(dots(pl.prev, 0x9ca3af)); }
          const out = ws ? pl.next.map((p) => !inBox(p, ws.min_mm, ws.max_mm)) : pl.next.map(() => false);
          dyn.add(line(pl.next, 0x34d399)); pl.next.forEach((p, i) => addAll(dots([p], out[i] ? 0xef4444 : 0x34d399, 0.008)));
        }
      },
    };

    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);
    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, []);

  // Aggiornamenti dai dati
  useEffect(() => { if (!playing) api.current?.setArm(tcp, joints, null); }, [tcp, joints, playing]);
  useEffect(() => { api.current?.setScene(trail, plan, workspace); }, [trail, plan, workspace]);
  useEffect(() => {
    if (!tcp) { setInfo("Posa del TCP non disponibile: il bridge è acceso?"); return; }
    const a = schematicArm(tcp);
    setInfo(`${joints && joints.length === 6 ? "Braccio dai giunti letti dal controller" : `Braccio schematico dalla posa del TCP (${ARM.fonte})`}${a.reachable ? "" : " · posa oltre lo sbraccio dello schema"}`);
  }, [tcp, joints]);

  // Anteprima: un braccio fantasma percorre la versione corretta
  const preview = () => {
    if (!plan || plan.next.length < 2 || playing) return;
    setPlaying(true);
    const pts = plan.next; let seg = 0, t = 0;
    const tick = () => {
      t += 0.04;
      if (t >= 1) { t = 0; seg++; }
      if (seg >= pts.length - 1) { api.current?.setArm(tcp, joints, pts[pts.length - 1]); setTimeout(() => { setPlaying(false); }, 900); return; }
      const a = pts[seg], b = pts[seg + 1];
      api.current?.setArm(tcp, joints, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      requestAnimationFrame(tick);
    };
    tick();
  };

  return (
    <section className="rounded-xl border border-white/10 bg-gradient-to-b from-[#0f172a] to-[#0b0d10] p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">Spazio percepito del braccio · 3D</h2>
        {plan && <span className="font-mono text-[11px] text-white/60">«{plan.name}» {plan.prevVersion ? `v${plan.prevVersion} → ` : ""}v{plan.nextVersion}</span>}
        <button onClick={preview} disabled={!plan || plan.next.length < 2 || playing} className="ml-auto rounded bg-emerald-600 px-3 py-1 text-xs font-semibold disabled:opacity-30">
          {playing ? "anteprima…" : "▶ Anteprima della correzione"}
        </button>
      </div>
      <div ref={host} className="h-[380px] w-full cursor-grab overflow-hidden rounded-lg bg-black/30 active:cursor-grabbing" aria-label="Vista 3D del braccio, dell'area di lavoro e dei percorsi" />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/60">
        <span><i className="mr-1 inline-block h-2 w-3 rounded bg-orange-500" />braccio ora</span>
        <span><i className="mr-1 inline-block h-2 w-3 rounded bg-slate-400" />scia dal registro</span>
        <span><i className="mr-1 inline-block h-2 w-3 rounded border border-dashed border-gray-400" />versione precedente</span>
        <span><i className="mr-1 inline-block h-2 w-3 rounded bg-emerald-400" />versione corretta</span>
        <span><i className="mr-1 inline-block h-2 w-3 rounded border border-sky-400" />area di lavoro</span>
        <span className="text-red-300">● punto fuori area</span>
        <span className="text-white/40">assi: rosso avanti · verde sinistra · blu su · trascina per ruotare</span>
      </div>
      <p className="mt-1 text-[11px] text-white/40">{info}</p>
    </section>
  );
}

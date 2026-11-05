// Spazio percepito del braccio, funzioni pure (mm, frame utente: x avanti, y sinistra, z su; shared/fixtures/frame.json).
// Il bridge oggi pubblica solo la posa del TCP: il braccio si disegna in modo SCHEMATICO con una cinematica inversa
// di posizione (utensile verso il basso). Se arrivano i giunti veri (bridge_status.joints_deg) si usa la FK MDH.
import { amountMm, DEFAULT_FRAME, type Frame } from "./motion";
import type { MoveStep } from "./movement";

export type V3 = [number, number, number];

// [non verificato] Proporzioni del CS66 nominale (sdk/gergo_sdk/kinematics.py) scalate allo sbraccio del CS63:
// 624 mm [verificato: etichetta] / 914 mm. I parametri veri si leggono dal controller (KinematicsInfo, porta 30001).
const S = 624 / 914;
export const ARM = {
  d1: 162.5 * S, upper: 427 * S, fore: 393 * S, wrist: (102.5 + 94) * S, // tratto verticale del polso (d5 + d6) con l'utensile in giù; d4 è laterale
  reach_mm: 624, fonte: "proporzioni del CS66 nominale scalate a 624 mm [non verificato]",
};
const MDH = { // CS66 nominale scalato, per la FK dai giunti
  alpha: [0, Math.PI / 2, 0, 0, Math.PI / 2, -Math.PI / 2],
  a: [0, 0, -427 * S, -393 * S, 0, 0],
  d: [162.5 * S, 0, 0, 140.5 * S, 102.5 * S, 94 * S],
};

export interface ArmPose { points: V3[]; reachable: boolean; source: "schematico" | "giunti" }

/** Braccio schematico: base → spalla → gomito → polso → TCP, con il polso sopra il TCP (utensile in giù). */
export function schematicArm(tcp: V3): ArmPose {
  const wrist: V3 = [tcp[0], tcp[1], tcp[2] + ARM.wrist];
  const yaw = Math.atan2(wrist[1], wrist[0]);
  const r = Math.hypot(wrist[0], wrist[1]);
  const h = wrist[2] - ARM.d1;
  const L1 = ARM.upper, L2 = ARM.fore;
  let D = Math.hypot(r, h);
  const reachable = D <= L1 + L2 - 1 && D >= Math.abs(L1 - L2) + 1;
  D = Math.min(L1 + L2 - 1, Math.max(Math.abs(L1 - L2) + 1, D));
  const ang = Math.atan2(h, r);
  const cosA = (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D);
  const shoulderAng = ang + Math.acos(Math.max(-1, Math.min(1, cosA))); // gomito in alto
  const er = L1 * Math.cos(shoulderAng), eh = L1 * Math.sin(shoulderAng);
  const toXYZ = (rr: number, hh: number): V3 => [rr * Math.cos(yaw), rr * Math.sin(yaw), ARM.d1 + hh];
  const shoulder: V3 = [0, 0, ARM.d1];
  const elbow = toXYZ(er, eh);
  const wReal = toXYZ(D * Math.cos(ang), D * Math.sin(ang));
  return { points: [[0, 0, 0], shoulder, elbow, wReal, reachable ? tcp : [wReal[0], wReal[1], wReal[2] - ARM.wrist]], reachable, source: "schematico" };
}

/** FK MDH (stessa convenzione di gergo_sdk.kinematics._joint_frames), giunti in gradi → punti dei giunti in mm. */
export function fkPoints(qDeg: number[]): ArmPose {
  type M = number[][];
  const mul = (A: M, B: M): M => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
  const rx = (t: number): M => [[1, 0, 0, 0], [0, Math.cos(t), -Math.sin(t), 0], [0, Math.sin(t), Math.cos(t), 0], [0, 0, 0, 1]];
  const rz = (t: number): M => [[Math.cos(t), -Math.sin(t), 0, 0], [Math.sin(t), Math.cos(t), 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  const tr = (x: number, y: number, z: number): M => [[1, 0, 0, x], [0, 1, 0, y], [0, 0, 1, z], [0, 0, 0, 1]];
  let T: M = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  const pts: V3[] = [[0, 0, 0]];
  for (let i = 0; i < 6; i++) {
    T = mul(T, mul(rx(MDH.alpha[i]), tr(MDH.a[i], 0, MDH.d[i])));
    T = mul(T, rz((qDeg[i] * Math.PI) / 180));
    pts.push([T[0][3], T[1][3], T[2][3]]);
  }
  return { points: pts, reachable: true, source: "giunti" };
}

/** Percorso di una versione del movimento a partire dalla posa attuale: un punto per passo. */
export function pathFrom(start: V3, steps: MoveStep[], frame: Frame = DEFAULT_FRAME): V3[] {
  const AX = { x: 0, y: 1, z: 2 } as const;
  const pts: V3[] = [[...start] as V3];
  let cur: V3 = [...start] as V3;
  for (const s of steps) {
    const { mm } = amountMm({ direzione: s.direzione, quantita: s.quantita, unita: s.unita, intensita: null });
    const [axis, sign] = frame[s.direzione];
    const next = [...cur] as V3;
    next[AX[axis]] += sign * mm;
    pts.push(next);
    cur = next;
  }
  return pts;
}

/** Scia del TCP dal registro: le pose prima/dopo dei controlli di movimento e i target dei passi, in ordine di tempo. */
export function trailFromEvents(events: { ts: string; type: string; payload?: Record<string, unknown> }[], limit = 40): V3[] {
  const pts: V3[] = [];
  const isV3 = (v: unknown): v is V3 => Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every((x) => typeof x === "number");
  for (const e of [...events].sort((a, b) => a.ts.localeCompare(b.ts))) {
    const p = e.payload ?? {};
    if (e.type === "motion_check" && p.ok === true) { if (isV3(p.pose_mm)) pts.push(p.pose_mm.slice(0, 3) as V3); if (isV3(p.target_mm)) pts.push(p.target_mm.slice(0, 3) as V3); }
    else if (e.type === "step_end" && isV3(p.pose_mm)) pts.push(p.pose_mm.slice(0, 3) as V3);
  }
  return pts.filter((p, i) => i === 0 || p.some((v, k) => Math.abs(v - pts[i - 1][k]) > 0.5)).slice(-limit);
}

export function inBox(p: V3, min: number[], max: number[]): boolean {
  return p.every((v, i) => v >= min[i] && v <= max[i]);
}

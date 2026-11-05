import { NextResponse } from "next/server";
import { z } from "zod";
import { RoutineStep, SkillName, SpostaParams } from "@/lib/contracts";
import { annulla, approvaProposta, conferma, confermaSkill, definisciRoutine, deprecaSkill, eseguiRoutine, fatto, mina, modificaRoutine, passoTest, presaVisione, proponi, resoconto, salvaAngolo, salvaRoutine, segnala, stop, type ToolResult } from "@/lib/server/tools";
import type { Vec3 } from "@/lib/validator";
import { proposeScript, type TestInput } from "@/lib/server/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Una route per ogni function call di Grok (lib/voice/tools.ts ne dichiara gli schemi).
// Input validato con zod; nessuna route muove il braccio.
const Utt = { utterance: z.string().max(500).optional() };
const Inputs = {
  propone_azione: z.strictObject({ skill: SkillName, params: z.record(z.string(), z.unknown()).default({}), ...Utt }),
  sposta: z.strictObject({ direzione: SpostaParams.shape.direzione, quantita: z.number().nullable().optional(), unita: z.enum(["mm", "cm"]).nullable().optional(), intensita: z.enum(["poco", "un_po", "tanto"]).nullable().optional(), ...Utt }),
  piu_piano: z.strictObject({ ...Utt }),
  piu_veloce: z.strictObject({ ...Utt }),
  conferma: z.strictObject({ command_id: z.uuid().optional() }),
  annulla: z.strictObject({}),
  stop: z.strictObject({ source: z.string().max(40).optional() }),
  salva_angolo: z.strictObject({}),
  definisci_routine: z.strictObject({ name: z.string().min(1).max(40), steps: z.array(RoutineStep).min(1).max(20), ...Utt }),
  salva_routine: z.strictObject({ name: z.string().min(1).max(40) }),
  esegui_routine: z.strictObject({ name: z.string().min(1).max(40), ripetizioni: z.int().min(1).max(10).default(1), ...Utt }),
  fatto: z.strictObject({}),
  segnala: z.strictObject({ text: z.string().min(1).max(200) }),
  resoconto: z.strictObject({}),
  mina: z.strictObject({}),
  proponi_script: z.strictObject({ kind: z.enum(["routine", "movimento", "test"]), name: z.string().min(1).max(40).optional(), by: z.string().min(1).max(60).default("operatore"),
    test: z.strictObject({ id: z.string().regex(/^[a-z0-9_-]{1,40}$/), name: z.string().min(1).max(60), version: z.int().min(1).max(99), steps: z.array(z.strictObject({ direzione: SpostaParams.shape.direzione, quantita: z.number().gt(0).lte(10), unita: z.literal("cm").or(z.literal("mm")) })).min(1).max(8), history: z.array(z.string().max(200)).max(20).optional(), command_ids: z.array(z.uuid()).min(1).max(8) }).optional() }),
  passo_test: z.strictObject({ step: z.strictObject({ direzione: SpostaParams.shape.direzione, quantita: z.number().gt(0).lte(10), unita: z.literal("cm").or(z.literal("mm")) }), test: z.string().min(1).max(80), passo: z.int().min(1).max(8), totale: z.int().min(1).max(8) }),
  modifica_routine: z.strictObject({ name: z.string().min(1).max(40), from_version: z.int().min(1), steps: z.array(RoutineStep).min(1).max(20), by: z.string().min(1).max(60).default("operatore"), motivo: z.string().min(3).max(300) }),
  presa_visione: z.strictObject({ alert_id: z.string().min(1).max(80), livello: z.enum(["critico", "attenzione", "info"]), titolo: z.string().max(200), by: z.string().min(1).max(60).default("operatore") }),
  approva_proposta: z.strictObject({ approva: z.boolean(), by: z.string().max(60).default("operatore") }),
  conferma_skill: z.strictObject({ name: SkillName, by: z.string().min(1).max(60).default("operatore") }),
  depreca_skill: z.strictObject({ name: SkillName, motivo: z.string().min(3).max(300), by: z.string().min(1).max(60).default("operatore") }),
} as const;

type Name = keyof typeof Inputs;

export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!(name in Inputs)) return NextResponse.json({ ok: false, frase: "Questo non lo so fare." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const parsed = Inputs[name as Name].safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, frase: "Non ho capito i dettagli. Me lo ripeti?", errore: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const a = parsed.data as Record<string, unknown>;
  try {
    let r: ToolResult;
    switch (name as Name) {
      case "propone_azione": r = await proponi(a.skill as z.infer<typeof SkillName>, a.params as Record<string, unknown>, a.utterance as string | undefined); break;
      case "sposta": {
        const { utterance, ...p } = a;
        r = await proponi("sposta", p, utterance as string | undefined);
        break;
      }
      case "piu_piano": case "piu_veloce": r = await proponi(name as "piu_piano" | "piu_veloce", {}, a.utterance as string | undefined); break;
      case "conferma": r = await conferma(a.command_id as string | undefined); break;
      case "annulla": r = await annulla(); break;
      case "stop": r = await stop((a.source as string) ?? "console"); break;
      case "conferma_skill": r = await confermaSkill(a.name as string, a.by as string); break;
      case "depreca_skill": r = await deprecaSkill(a.name as string, a.motivo as string, a.by as string); break;
      case "definisci_routine": r = await definisciRoutine(a.name as string, a.steps as never, a.utterance as string | undefined); break;
      case "salva_routine": r = await salvaRoutine(a.name as string); break;
      case "esegui_routine": r = await eseguiRoutine(a.name as string, a.ripetizioni as number); break;
      case "fatto": r = await fatto(); break;
      case "segnala": r = await segnala(a.text as string); break;
      case "resoconto": r = await resoconto(); break;
      case "mina": r = await mina(); break;
      case "proponi_script": r = (await proposeScript(a.kind as "routine" | "movimento" | "test", a.name as string | undefined, a.by as string, a.test as TestInput | undefined)) as ToolResult; break;
      case "passo_test": r = await passoTest(a.step as { direzione: string; quantita: number; unita: string }, a.test as string, a.passo as number, a.totale as number); break;
      case "modifica_routine": r = await modificaRoutine(a.name as string, a.from_version as number, a.steps as never, a.by as string, a.motivo as string); break;
      case "presa_visione": r = await presaVisione(a.alert_id as string, a.livello as string, a.titolo as string, a.by as string); break;
      case "approva_proposta": r = await approvaProposta(a.approva as boolean, a.by as string); break;
      case "salva_angolo": {
        const cookie = req.headers.get("cookie")?.match(/gergo_corner=([^;]+)/)?.[1];
        const primo = cookie ? (JSON.parse(decodeURIComponent(cookie)) as Vec3) : null;
        const out = await salvaAngolo(primo);
        const res = NextResponse.json(out);
        if (out.angolo) res.cookies.set("gergo_corner", JSON.stringify(out.angolo), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
        if (out.fatto) res.cookies.delete("gergo_corner");
        return res;
      }
    }
    return NextResponse.json(r);
  } catch (e) {
    // Lo stop non deve mai fallire in silenzio: si dice, e restano il tasto del bridge e l'e-stop fisico.
    const frase = name === "stop" ? "Non riesco a mandare lo stop dal server: usa il tasto sul bridge o l'e-stop." : "C'è un problema col server, non faccio niente.";
    return NextResponse.json({ ok: false, frase, errore: (e as Error).message }, { status: 500 });
  }
}

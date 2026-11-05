import { NextResponse } from "next/server";
import { z } from "zod";
import { SkillName, SpostaParams } from "@/lib/contracts";
import { annulla, conferma, proponi, salvaAngolo, stop, type ToolResult } from "@/lib/server/tools";
import type { Vec3 } from "@/lib/validator";

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

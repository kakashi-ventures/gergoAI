import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODELS, type ModelName } from "./contracts";

const ROOT = join(__dirname, "..", "..", "shared", "fixtures");
const load = (dir: string) =>
  readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(".json")).map((f) => ({
    f, ...(JSON.parse(readFileSync(join(ROOT, dir, f), "utf8")) as { model: ModelName; data: unknown; why?: string }),
  }));

describe("fixtures valide (stesso esito di pydantic)", () => {
  for (const fx of load("valid")) {
    it(fx.f, () => {
      const r = MODELS[fx.model].safeParse(fx.data);
      expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
    });
  }
});

describe("fixtures non valide (stesso esito di pydantic)", () => {
  for (const fx of load("invalid")) {
    it(`${fx.f} — ${fx.why ?? ""}`, () => {
      expect(MODELS[fx.model], `modello ${fx.model}`).toBeDefined();
      expect(MODELS[fx.model].safeParse(fx.data).success).toBe(false);
    });
  }
});

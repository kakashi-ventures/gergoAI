import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const pass = String(form.get("passphrase") ?? "");
  const next = String(form.get("next") ?? "/console");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/console";
  const expected = process.env.CONSOLE_PASSPHRASE;
  if (!expected || pass !== expected) {
    return NextResponse.redirect(new URL(`/login?err=1&next=${encodeURIComponent(safeNext)}`, req.url), 303);
  }
  const res = NextResponse.redirect(new URL(safeNext, req.url), 303);
  res.cookies.set("gergo_pass", pass, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
  return res;
}

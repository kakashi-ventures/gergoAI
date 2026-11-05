import { NextResponse, type NextRequest } from "next/server";

// Auth minima di postazione (DEPLOY.md prompt 2 §5): cookie httpOnly con la passphrase.
// Se CONSOLE_PASSPHRASE non è impostata, in produzione si nega tutto (fail-closed); in dev si lascia passare.
export const config = { matcher: ["/console/:path*", "/api/tools/:path*", "/api/voice/:path*"] };

export function middleware(req: NextRequest) {
  const pass = process.env.CONSOLE_PASSPHRASE;
  if (!pass) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("CONSOLE_PASSPHRASE non configurata", { status: 503 });
  }
  if (req.cookies.get("gergo_pass")?.value === pass) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

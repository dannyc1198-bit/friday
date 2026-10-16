import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { demoCookieEnabled } from "./lib/demo-boundary";
import { hudGate } from "./lib/hud-session";

export async function middleware(request: NextRequest) {
  const decision = await hudGate({
    method: request.method,
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    cookie: request.cookies.get("friday_hud")?.value ?? null,
    demo: demoCookieEnabled(request.headers.get("cookie")) ? "1" : null,
    secret: process.env.FRIDAY_API_KEY || "",
    now: Date.now(),
    secFetchSite: request.headers.get("sec-fetch-site"),
  });
  if (!decision.ok) {
    return NextResponse.json({ error: decision.reason }, { status: decision.status || 403 });
  }
  const response = NextResponse.next();
  if (decision.setCookie) {
    response.cookies.set("friday_hud", decision.setCookie, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 12 * 60 * 60,
    });
  }
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};

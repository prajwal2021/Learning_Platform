import { NextResponse, type NextRequest } from "next/server";

/** First gate: no session cookie, no page. The API checks the cookie for real on every call (signature, revoked code);
 *  this only keeps visitors without one from loading the app shell. */
const PUBLIC = /^\/(login|signup|access)(\/|$)/;

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.test(pathname) || req.cookies.has("lp_session")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // everything except the API proxy and Next's own assets
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};

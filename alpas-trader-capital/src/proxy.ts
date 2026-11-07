import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE } from "./i18n/config";

/** `?lang=tr|en` sets the language cookie (used by shared links and certificate QR codes). */
export function proxy(request: NextRequest) {
  const lang = request.nextUrl.searchParams.get("lang");
  if (lang !== "en" && lang !== "tr") return NextResponse.next();
  const url = request.nextUrl.clone();
  url.searchParams.delete("lang");
  const res = NextResponse.redirect(url);
  res.cookies.set(LOCALE_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|fonts|favicon.ico|.*\\.(?:png|svg|ico|ttf|pdf|txt)$).*)"],
};

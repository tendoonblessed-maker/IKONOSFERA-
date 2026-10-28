import { NextResponse, type NextRequest } from "next/server";

/**
 * ChatGPT and some other platforms append attribution parameters to shared links.
 * Keep the address bar clean without touching authentication or invite parameters.
 */
export function proxy(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  const source = url.searchParams.get("utm_source");
  if (!source || !/^chatgpt(?:\.com)?$/i.test(source)) {
    return NextResponse.next();
  }

  url.searchParams.delete("utm_source");
  const response = NextResponse.redirect(url, 307);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/", "/u/:username"],
};

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const BOT_PATTERN =
  /bot|crawler|spider|crawling|slurp|baidu|yandex|sogou|semrush|ahrefs|dotbot|mj12bot|bytespider|gptbot|claudebot|facebookexternalhit|linkedinbot|twitterbot|pinterestbot|applebot|bingpreview|petalbot|dataforseo|ccbot|amazonbot/i;

export async function middleware(request: NextRequest) {
  // Block bots immediately — no Supabase call, no SSR, no CPU burned
  const ua = request.headers.get("user-agent") || "";
  if (BOT_PATTERN.test(ua)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session token
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is not authenticated and trying to access protected routes
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/api") &&
    !request.nextUrl.pathname.startsWith("/estimates/approve") &&
    request.nextUrl.pathname !== "/"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // If user is authenticated and on login page, redirect to dashboard
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon)
     * - public files (icons, manifest, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|manifest\\.json|.*\\.svg$|api/).*)",
  ],
};

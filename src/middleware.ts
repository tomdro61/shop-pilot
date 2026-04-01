import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const BOT_PATTERN =
  /bot|crawler|spider|crawling|slurp|baidu|yandex|sogou|semrush|ahrefs|dotbot|mj12bot|bytespider|gptbot|claudebot|facebookexternalhit|linkedinbot|twitterbot|pinterestbot|applebot|bingpreview|petalbot|dataforseo|ccbot|amazonbot/i;

// Routes techs are allowed to access
const TECH_ALLOWED = ["/dvi", "/parking"];

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

  const pathname = request.nextUrl.pathname;

  // Public routes — no auth required
  const isPublicRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/estimates/approve") ||
    pathname.startsWith("/inspect") ||
    pathname === "/";

  // Redirect old /tech/* URLs to /dvi/*
  if (pathname.startsWith("/tech")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/tech/, "/dvi");
    return NextResponse.redirect(url);
  }

  // If not authenticated and trying to access protected routes
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authenticated user — check role for login redirect and tech route restriction
  if (user && !isPublicRoute) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("auth_id", user.id)
      .single();

    const role = profile?.role;

    // Login page → redirect to appropriate home
    if (pathname.startsWith("/login")) {
      const url = request.nextUrl.clone();
      url.pathname = role === "tech" ? "/dvi" : "/dashboard";
      return NextResponse.redirect(url);
    }

    // Tech role restriction — only allowed on TECH_ALLOWED routes
    if (role === "tech") {
      const isAllowed = TECH_ALLOWED.some((route) => pathname.startsWith(route));
      if (!isAllowed) {
        const url = request.nextUrl.clone();
        url.pathname = "/dvi";
        return NextResponse.redirect(url);
      }
    }
  }

  // Handle login redirect for authenticated users hitting /login
  if (user && pathname.startsWith("/login")) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("auth_id", user.id)
      .single();

    const url = request.nextUrl.clone();
    url.pathname = profile?.role === "tech" ? "/dvi" : "/dashboard";
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

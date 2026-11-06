import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google redirects here via Supabase with a one-time ?code=
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    // Supabase/Google report failures as ?error_description=...; pass it on so it's visible
    const detail = request.nextUrl.searchParams.get("error_description");
    const url = new URL("/login", request.url);
    url.searchParams.set("error", detail ? "auth_failed" : "missing_code");
    if (detail) url.searchParams.set("detail", detail);
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "auth_failed");
    url.searchParams.set("detail", error.message);
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", data.user.id)
    .maybeSingle<{ is_superadmin: boolean }>();

  // Don't leave a session lying around for someone who isn't allowed in
  if (!profile?.is_superadmin) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=not_admin", request.url));
  }

  return NextResponse.redirect(new URL("/", request.url));
}

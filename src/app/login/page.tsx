import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/admin";
import EmailLogin from "./EmailLogin";
import GoogleButton from "./GoogleButton";
import ThemeToggle from "../ThemeToggle";

const ERRORS: Record<string, string> = {
  not_admin: "That account isn't a superadmin. Access is limited to profiles with is_superadmin = true.",
  setup: "Couldn't check admin access. Is this app pointed at a database with profiles.is_superadmin?",
  auth_failed: "Sign-in failed. Please try again.",
  missing_code: "Sign-in was interrupted. Please try again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { user, profile } = await getAdmin();
  if (user && profile) {
    redirect("/");
  }

  const { error, detail } = await searchParams;
  const base = typeof error === "string" ? ERRORS[error] : undefined;
  const message = base && typeof detail === "string" ? `${base} (${detail})` : base;

  return (
    <main className="login">
      <div className="login-card">
        <p className="eyebrow">The Humor Project</p>
        <h1>Prompt Chain Tool</h1>
        <p className="muted">Restricted to superadmins (profiles.is_superadmin = true).</p>
        <EmailLogin />
        <div className="or">or</div>
        <GoogleButton />
        {message && <p className="alert alert-error">{message}</p>}
        <div className="login-theme">
          <ThemeToggle />
        </div>
        {user && !profile && (
          <form action="/auth/signout" method="post">
            <button type="submit" className="link-btn">Signed in as {user.email}. Sign out</button>
          </form>
        )}
      </div>
    </main>
  );
}

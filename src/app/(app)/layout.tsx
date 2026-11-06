import Link from "next/link";
import { displayName, requireAdmin } from "@/lib/admin";
import ThemeToggle from "../ThemeToggle";

export const dynamic = "force-dynamic";

// Every page except /login renders inside this layout, which re-checks superadmin access
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requireAdmin();

  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">
          <span aria-hidden="true">⛓️</span> Prompt Chain Tool
        </Link>
        <div className="topbar-right">
          <ThemeToggle />
          <span className="muted small">{displayName(profile)}</span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="link-btn">Sign out</button>
          </form>
        </div>
      </header>
      <main className="content">{children}</main>
    </>
  );
}

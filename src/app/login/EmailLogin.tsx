"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Email + password sign-in (for accounts created in the Supabase dashboard).
// The proxy still checks is_superadmin before letting anyone past /login.
export default function EmailLogin() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError(null);

    const { error } = await createClient().auth.signInWithPassword({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="form">
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" className="input" autoComplete="email" required />
      </label>
      <label className="field">
        <span>Password</span>
        <input name="password" type="password" className="input" autoComplete="current-password" required />
      </label>
      <button type="submit" className="btn btn-block" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
      {error && <p className="alert alert-error">{error}</p>}
    </form>
  );
}

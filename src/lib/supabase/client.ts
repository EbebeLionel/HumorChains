import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

// Supabase client for Client Components (runs in the browser)
export function createClient() {
  return createBrowserClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );
}

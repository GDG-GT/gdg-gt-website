import { createClient } from "@supabase/supabase-js";
import { unavailable } from "../lib/http.mjs";
import { timeDependency } from "../lib/telemetry.mjs";

export function serverDatabase(env = process.env) {
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !key) throw unavailable();
  const url = new URL(env.SUPABASE_URL);
  if (
    url.protocol !== "https:" &&
    !(
      env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw unavailable();
  if (url.username || url.password) throw unavailable();
  // A dedicated server client, never a browser instance or forwarded user JWT.
  return createClient(url.href, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "X-Client-Info": "gdg-gt-server" },
      fetch: (...args) => timeDependency("database", () => fetch(...args)),
    },
  });
}

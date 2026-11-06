import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
import { serverDatabase } from "../../server/db/client.mjs";
let shared;
export async function localHttp() {
  const reuse = process.env.GDG_LOCAL_TEST_SHARED_SESSION === "true";
  if (reuse && shared) return shared;
  const env = parseEnv(
    await readFile(new URL("../../.env.server.local", import.meta.url), "utf8"),
  );
  if (
    env.NODE_ENV !== "development" ||
    env.APP_ORIGIN !== "http://127.0.0.1:8080" ||
    env.SUPABASE_URL !== "http://127.0.0.1:54361"
  )
    throw new Error(
      "Restricted to the dedicated loopback development database.",
    );
  const credentials = JSON.parse(
    await readFile(
      new URL("../../.docs/local-auth.local", import.meta.url),
      "utf8",
    ),
  );
  const cookies = new Map();
  let csrf;
  async function call(
    path,
    {
      method = "GET",
      body,
      key,
      anonymous = false,
      redirect = "follow",
      accessToken,
      sessionBinding,
    } = {},
  ) {
    // Content/event mutations require explicit retry intent. A null key
    // deliberately omits the header for negative contract checks.
    const requestKey =
      key === undefined &&
      method !== "GET" &&
      /^\/admin\/(?:(?:site-content|content-records)\/|(?:events|users|teams)(?:\/|$))/.test(
        path,
      )
        ? randomUUID()
        : key;
    const response = await fetch(env.APP_ORIGIN + "/api/v1" + path, {
      method,
      redirect,
      headers: {
        Origin: env.APP_ORIGIN,
        ...(!anonymous
          ? {
              Cookie: [...cookies].map(([k, v]) => k + "=" + v).join("; "),
              ...(csrf ? { "X-CSRF-Token": csrf } : {}),
            }
          : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(requestKey ? { "Idempotency-Key": requestKey } : {}),
        ...(accessToken ? { "X-Form-Access": accessToken } : {}),
        ...(sessionBinding ? { "X-Session-Binding": sessionBinding } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    if (!anonymous)
      for (const value of response.headers.getSetCookie()) {
        const pair = value.split(";")[0],
          i = pair.indexOf("=");
        if (value.includes("Max-Age=0")) cookies.delete(pair.slice(0, i));
        else cookies.set(pair.slice(0, i), pair.slice(i + 1));
      }
    const bytes = new Uint8Array(await response.arrayBuffer()),
      content = new TextDecoder().decode(bytes);
    let json;
    try {
      json = JSON.parse(content);
    } catch {
      /* Non-JSON calendar and redirect responses. */
    }
    if (!anonymous && json?.data?.csrfToken) csrf = json.data.csrfToken;
    return {
      status: response.status,
      json,
      text: content,
      bytes,
      headers: response.headers,
    };
  }
  async function login() {
    if (reuse && cookies.size) {
      const existing = await call("/auth/session");
      if (existing.status === 200) return existing.json.data;
    }
    let r = await call("/auth/gate", {
      method: "POST",
      body: { code: credentials.gateCode },
    });
    if (r.status !== 200)
      throw new Error("Local gate unavailable: " + r.status);
    r = await call("/auth/login", {
      method: "POST",
      body: { email: credentials.email, password: credentials.password },
    });
    if (r.status !== 200)
      throw new Error("Local login unavailable: " + r.status);
    return r.json.data;
  }
  const result = {
    env,
    credentials,
    call,
    login,
    db: serverDatabase(env),
    logout: async (force = false) => {
      if (!reuse || force) await call("/auth/session", { method: "DELETE" });
    },
  };
  if (reuse) shared = result;
  return result;
}

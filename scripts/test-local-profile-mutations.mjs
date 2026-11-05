import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret, verifySecret } from "../server/lib/security.mjs";
if (process.env.GDG_LOCAL_TEST_SHARED_SESSION === "true")
  throw Error("Requires independent fictional sessions.");
const h = await localHttp(),
  second = await localHttp(),
  third = await localHttp(),
  { db, call } = h,
  actor = randomUUID(),
  email = "fictional-profile-mutation-" + actor + "@example.test",
  password = "Fictional-current-" + randomUUID(),
  nextPassword = "Fictional-next-" + randomUUID(),
  tests = [];
let created = false,
  completed = false;
const checked = (result) => {
  if (result.error)
    throw Error("Profile fixture database error " + result.error.code);
  return result.data;
};
const data = (result) => {
  if (result.status !== 200)
    throw Error(
      "Profile fixture request failed " +
        result.status +
        " " +
        result.json?.error?.code,
    );
  return result.json.data;
};
const check = (condition, name) => {
  if (!condition) throw Error(name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
async function login(client, value = password) {
  data(
    await client.call("/auth/gate", {
      method: "POST",
      body: { code: h.credentials.gateCode },
    }),
  );
  const response = await client.call("/auth/login", {
    method: "POST",
    body: { email, password: value },
  });
  data(response);
  return response;
}
try {
  checked(
    await db
      .from("admin_users")
      .insert({
        id: actor,
        email,
        display_name: "Fictional profile mutation reviewer",
        password_hash: await hashSecret(password),
        role: "admin",
        is_active: true,
      }),
  );
  created = true;
  const initial = await login(h);
  const oldCookie = initial.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .filter((value) => value.startsWith("gdg_dev_session="))
    .join("; ");
  if (!oldCookie) throw Error("Expected the dedicated local session cookie.");
  await login(second);
  const wrong = await call("/auth/password", {
    method: "POST",
    body: {
      currentPassword: "Fictional-incorrect-current",
      newPassword: nextPassword,
    },
  });
  check(
    wrong.status === 400 &&
      wrong.json.error.code === "VALIDATION_ERROR" &&
      !!wrong.json.error.fields.currentPassword,
    "incorrect current password produces field validation rather than a missing-session response",
  );
  check(
    data(await call("/auth/session")).user.id === actor,
    "incorrect current password leaves the authenticated current session valid",
  );
  check(
    data(await second.call("/auth/session")).user.id === actor,
    "incorrect current password does not revoke another session",
  );
  data(
    await call("/admin/me", {
      method: "PATCH",
      body: { display_name: "Fictional updated display name" },
    }),
  );
  check(
    data(await call("/admin/me")).user.display_name ===
      "Fictional updated display name",
    "own display-name save is visible through the actual private account read",
  );
  data(
    await call("/admin/me", {
      method: "PATCH",
      body: {
        profile: {
          name: "Fictional unpublished profile",
          role: "Fictional builder",
          bio: "Private test profile awaiting approval",
          imageUrl: "",
          linkedinUrl: "",
          githubUrl: "",
        },
      },
    }),
  );
  const own = data(await call("/admin/me"));
  check(
    own.profile?.name === "Fictional unpublished profile" &&
      own.profile.is_active === false,
    "new own team profile stays unpublished after save",
  );
  const before = data(await call("/admin/me/sessions"));
  check(
    before.items.length === 2 &&
      before.items.filter((row) => row.current).length === 1,
    "independent fictional sessions are represented before reviewed revocation",
  );
  data(await call("/auth/sessions", { method: "DELETE" }));
  check(
    (await second.call("/auth/session")).status === 401,
    "other-session sign-out revokes the other fictional browser",
  );
  check(
    data(await call("/auth/session")).user.id === actor,
    "other-session sign-out preserves the current browser",
  );
  await login(third);
  const reused = await call("/auth/password", {
    method: "POST",
    body: { currentPassword: password, newPassword: password },
  });
  check(
    reused.status === 400 && !!reused.json.error.fields.newPassword,
    "password reuse is associated with the new-password field",
  );
  const changed = await call("/auth/password", {
    method: "POST",
    body: { currentPassword: password, newPassword: nextPassword },
  });
  check(
    changed.status === 200 &&
      changed.json.data.changed &&
      changed.headers.get("cache-control")?.includes("no-store") &&
      !/password_hash|token_hash|Fictional-current-|Fictional-next-/.test(
        changed.text,
      ),
    "accepted password rotation returns only private safe confirmation material",
  );
  check(
    (await third.call("/auth/session")).status === 401,
    "accepted password rotation revokes the other newly opened session",
  );
  const replay = await fetch(h.env.APP_ORIGIN + "/api/v1/auth/session", {
    headers: { Origin: h.env.APP_ORIGIN, Cookie: oldCookie },
    signal: AbortSignal.timeout(10000),
  });
  check(
    replay.status === 401,
    "the pre-rotation current cookie cannot be replayed",
  );
  check(
    data(await call("/auth/session")).user.id === actor,
    "the rotated current browser remains signed in",
  );
  const account = checked(
    await db
      .from("admin_users")
      .select("password_hash")
      .eq("id", actor)
      .single(),
  );
  check(
    (await verifySecret(nextPassword, account.password_hash)) &&
      !(await verifySecret(password, account.password_hash)),
    "only the new fictional password matches the stored hash",
  );
  await h.logout(true);
  check(
    (await call("/admin/me")).status === 401,
    "the final fictional current session is logged out",
  );
  completed = true;
} finally {
  if (created) {
    checked(
      await db
        .from("team_members")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("admin_user_id", actor),
    );
    checked(
      await db
        .from("admin_users")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", actor),
    );
    checked(
      await db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("admin_user_id", actor)
        .is("revoked_at", null),
    );
  }
  await writeFile(
    new URL("../.docs/phase0/local-profile-mutations.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback profile/password/session operations affect only one fresh fictional account, its new unpublished profile and its three owned browser sessions. Account disabled, profile archived, sessions revoked. Existing account/password/session/content and bootstrap login untouched. No mail/provider, quota reset, publication or production changes. Passwords/cookies/response bodies are not retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}

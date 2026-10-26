import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { createInterface } from "node:readline";
import { localHttp } from "./lib/local-http.mjs";
import { token, tokenHash } from "../server/lib/security.mjs";
const { db, call } = await localHttp(),
  hold = process.argv.includes("--hold-for-browser"),
  id = randomUUID(),
  confirm = token(),
  unsubscribe = token(),
  tests = [];
const ledger = new URL(
  "../.docs/local-newsletter-review.local",
  import.meta.url,
);
let seeded = false,
  ledgerOwned = false,
  terminal;
if (hold && !process.stdin.isTTY)
  throw Error("Browser review requires an interactive terminal");
const checked = (r) => {
  if (r.error) throw Error("Newsletter review fixture: " + r.error.code);
  return r.data;
};
const check = (ok, name) => {
  if (!ok) throw Error("FAIL " + name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
const read = async () =>
  checked(
    await db
      .from("newsletter_subscribers")
      .select("state,revision")
      .eq("id", id)
      .single(),
  );
const post = async (path, secret) => {
  const r = await call(path, {
    method: "POST",
    body: { token: secret },
    anonymous: true,
  });
  if (r.status !== 200) throw Error("Review request failed: " + r.status);
  return r.json.data;
};
const wait = (label) =>
  new Promise((resolve, reject) => {
    console.info(label);
    const line = (value) => {
      if (value.trim() === "next") {
        terminal.off("line", line);
        terminal.off("close", closed);
        resolve();
      }
    };
    const closed = () => {
      terminal.off("line", line);
      reject(Error("Browser review ended before all phases completed"));
    };
    terminal.on("line", line);
    terminal.once("close", closed);
  });
try {
  checked(
    await db.from("newsletter_subscribers").insert({
      id,
      email: "fictional-newsletter-review-" + id + "@example.test",
      state: "pending",
      is_active: false,
      consent_at: new Date().toISOString(),
    }),
  );
  seeded = true;
  checked(
    await db.from("newsletter_tokens").insert([
      {
        subscriber_id: id,
        purpose: "confirm",
        token_hash: tokenHash(confirm),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
      {
        subscriber_id: id,
        purpose: "unsubscribe",
        token_hash: tokenHash(unsubscribe),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    ]),
  );
  const before = await read(),
    review = await post("/newsletter/confirm/validate", confirm);
  check(
    review.valid &&
      !review.applied &&
      (await read()).revision === before.revision,
    "read-only confirmation validation leaves the fictional subscriber pending",
  );
  check(
    !(await post("/newsletter/unsubscribe/validate", confirm)).valid,
    "a confirmation token cannot review an unsubscribe action",
  );
  if (hold) {
    await writeFile(ledger, JSON.stringify({ confirm, unsubscribe }), {
      mode: 0o600,
      flag: "wx",
    });
    ledgerOwned = true;
    terminal = createInterface({ input: process.stdin });
    await wait(
      "Private fixture ledger ready. Open the confirmation review, then type next.",
    );
    check(
      (await read()).state === "pending",
      "browser opening the confirmation page does not activate its subscription",
    );
    await wait("Choose Confirm subscription in the browser, then type next.");
  } else await post("/newsletter/confirm", confirm);
  const active = await read();
  check(
    active.state === "active",
    "explicit confirmation commits an active subscription",
  );
  await post("/newsletter/confirm", confirm);
  check(
    (await read()).revision === active.revision,
    "confirmation retry does not write the subscriber again",
  );
  check(
    (await post("/newsletter/confirm/validate", confirm)).applied,
    "a reloaded confirmation review reports already applied without mutation",
  );
  if (hold) {
    await wait(
      "Open the unsubscribe review without choosing its action, then type next.",
    );
    check(
      (await read()).state === "active",
      "browser opening the unsubscribe page leaves its subscription active",
    );
    await wait("Choose Unsubscribe in the browser, then type next.");
  } else await post("/newsletter/unsubscribe", unsubscribe);
  const optedOut = await read();
  check(
    optedOut.state === "unsubscribed",
    "explicit unsubscribe commits the opt-out",
  );
  await post("/newsletter/unsubscribe", unsubscribe);
  check(
    (await read()).revision === optedOut.revision,
    "unsubscribe retry does not write the subscriber again",
  );
  check(
    (await post("/newsletter/unsubscribe/validate", unsubscribe)).applied,
    "reloaded unsubscribe review reports already applied",
  );
  const replay = await call("/newsletter/confirm", {
    method: "POST",
    body: { token: confirm },
    anonymous: true,
  });
  check(
    replay.status === 410 && (await read()).state === "unsubscribed",
    "a former confirmation cannot reactivate an opted-out subscriber",
  );
} finally {
  terminal?.close();
  if (seeded) {
    checked(
      await db
        .from("newsletter_tokens")
        .update({
          consumed_at: new Date().toISOString(),
          expires_at: new Date().toISOString(),
        })
        .eq("subscriber_id", id),
    );
    checked(
      await db
        .from("newsletter_subscribers")
        .update({
          deleted_at: new Date().toISOString(),
          state: "unsubscribed",
          is_active: false,
        })
        .eq("id", id),
    );
  }
  if (ledgerOwned) await unlink(ledger);
  console.info(
    "Revoked and archived the exact fictional review fixture; unrelated subscriptions untouched.",
  );
}
await writeFile(
  new URL(hold ? "../.docs/phase0/local-newsletter-review-browser.json" : "../.docs/phase0/local-newsletter-review.json", import.meta.url),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note:
        "Fictional loopback-only token review; tokens were private in-memory/ignored mode-0600 ledger and were revoked after review. No email was queued by this read-path fixture. Browser phases: " +
        hold,
      tests,
    },
    null,
    2,
  ) + "\n",
);

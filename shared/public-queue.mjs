export const QUEUE_TTL = 48 * 3600000;
const maxAttempts = 8;
export function queueDocument(kind, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw Error("Check the pending submission.");
  const allowed =
    kind === "event"
      ? ["slug", "name", "email", "notes", "consent", "website"]
      : kind === "newsletter"
        ? ["email", "name", "website"]
        : [];
  if (
    !allowed.length ||
    Object.keys(payload).some((k) => !allowed.includes(k)) ||
    payload.website
  )
    throw Error(
      "Only public event registrations and newsletter signups can be queued.",
    );
  const email = String(payload.email || "")
      .trim()
      .toLowerCase(),
    name = String(payload.name || "").trim();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 255 ||
    name.length > 100
  )
    throw Error("Check your name and email.");
  if (kind === "newsletter")
    return { email, ...(name ? { name } : {}), website: "" };
  const slug = String(payload.slug || ""),
    notes = String(payload.notes || "");
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    slug.length > 150 ||
    name.length < 2 ||
    notes.length > 2000 ||
    payload.consent !== true
  )
    throw Error(
      "Check event details and consent before saving a pending registration.",
    );
  return { slug, name, email, notes, consent: true, website: "" };
}
export function queueOutcome(kind, status, data) {
  if (
    status >= 200 &&
    status < 300 &&
    ((kind === "event" &&
      data?.status === "registered" &&
      data?.registrationId) ||
      (kind === "newsletter" && data?.accepted === true))
  )
    return { state: "accepted", reason: "" };
  if (!status || status >= 500)
    return {
      state: "pending",
      reason: "Network or server unavailable. Retry is scheduled.",
    };
  if (status >= 400 && status < 500)
    return {
      state: "failed",
      reason: `The server declined this submission (${status}). Review the original page; it will not retry automatically.`,
    };
  return {
    state: "failed",
    reason:
      "The server did not confirm this submission. Review the original page before trying again.",
  };
}
async function browserTransaction(operation) {
  if (typeof indexedDB === "undefined")
    throw Error(
      "Pending submissions need IndexedDB in this browser. Keep your details and reconnect.",
    );
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("gdg-gt-public-submissions-v1", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("queue", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(Error("Pending submission storage is unavailable."));
    request.onblocked = () =>
      reject(
        Error(
          "Close older GDG tabs before updating pending-submission storage.",
        ),
      );
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("queue", "readwrite"),
        store = tx.objectStore("queue"),
        request = store.getAll();
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () =>
        reject(Error("The pending-submission update could not be saved."));
      request.onsuccess = () => {
        try {
          const all = request.result,
            control = all.find((r) => r.id === "_control") || {
              id: "_control",
              epoch: 0,
            };
          result = operation({
            items: all.filter((r) => r.id !== "_control"),
            epoch: control.epoch,
            put: (r) => store.put(r),
            remove: (id) => store.delete(id),
            setEpoch: (epoch) => store.put({ id: "_control", epoch }),
          });
        } catch (e) {
          tx.abort();
          reject(e);
        }
      };
    });
  } finally {
    db.close();
  }
}
export function createPublicQueue({
  transact = browserTransaction,
  fetcher = (...args) => fetch(...args),
  clock = () => Date.now(),
} = {}) {
  let running;
  const expire = (tx, now) => {
    for (const item of tx.items) {
      if (item.expiresAt <= now && item.state !== "expired") {
        item.state = "expired";
        item.payload = {};
        item.reason =
          "This device record expired after 48 hours and will not be retried. Check the original page before starting a new submission.";
        item.lease = null;
        item.leaseUntil = 0;
        tx.put(item);
      } else if (
        item.state === "pending" &&
        item.attempts >= maxAttempts &&
        (!item.lease || item.leaseUntil <= now)
      ) {
        // A tab/worker may stop after claiming its final attempt. Do not leave
        // an unreplayable row looking pending or erase an active request early.
        item.state = "failed";
        item.payload = {};
        item.reason =
          "The final attempt could not be confirmed. Check the original page before starting a new submission.";
        item.lease = null;
        item.leaseUntil = 0;
        tx.put(item);
      }
    }
  };
  return {
    /** @param {string} [id] */
    async add(kind, input, id = crypto.randomUUID()) {
      const payload = queueDocument(kind, input);
      if (!/^[a-f0-9-]{36}$/.test(id))
        throw Error("Use a valid submission reference.");
      return transact((tx) => {
        expire(tx, clock());
        const existing = tx.items.find((r) => r.id === id);
        if (existing) {
          if (
            existing.kind !== kind ||
            JSON.stringify(existing.payload) !== JSON.stringify(payload)
          )
            throw Error(
              "This reference already belongs to another submission.",
            );
          return existing;
        }
        if (tx.items.length >= 50)
          throw Error(
            "Review or discard older pending submissions before adding another.",
          );
        const item = {
          id,
          kind,
          slug: kind === "event" ? payload.slug : null,
          payload,
          state: "pending",
          reason: "Pending submission — not accepted by the server yet.",
          createdAt: clock(),
          expiresAt: clock() + QUEUE_TTL,
          nextAt: clock(),
          attempts: 0,
          lease: null,
          leaseUntil: 0,
          epoch: tx.epoch,
        };
        tx.put(item);
        return item;
      });
    },
    async list() {
      return transact((tx) => {
        expire(tx, clock());
        return tx.items
          .map(({ payload, lease, ...r }) => r)
          .sort((a, b) => b.createdAt - a.createdAt);
      });
    },
    async discard(id) {
      return transact((tx) => tx.remove(id));
    },
    async clear() {
      return transact((tx) => {
        tx.setEpoch(tx.epoch + 1);
        for (const item of tx.items) tx.remove(item.id);
      });
    },
    async retry(id) {
      return transact((tx) => {
        expire(tx, clock());
        const item = tx.items.find((r) => r.id === id);
        if (!item || item.state !== "pending" || item.expiresAt <= clock())
          throw Error(
            "This submission cannot be retried. Review its original page.",
          );
        if (item.attempts >= maxAttempts)
          throw Error(
            "Automatic retries are exhausted. Open the original page and check your submission before starting again.",
          );
        item.nextAt = clock();
        tx.put(item);
      });
    },
    replay() {
      if (running) return running;
      running = (async () => {
        for (let n = 0; n < 5; n++) {
          const item = await transact((tx) => {
            expire(tx, clock());
            const row = tx.items.find(
              (r) =>
                r.epoch === tx.epoch &&
                r.state === "pending" &&
                r.expiresAt > clock() &&
                r.nextAt <= clock() &&
                r.attempts < maxAttempts &&
                (!r.lease || r.leaseUntil <= clock()),
            );
            if (!row) return null;
            row.lease = crypto.randomUUID();
            row.leaseUntil = clock() + 60000;
            row.attempts++;
            tx.put(row);
            return { ...row };
          });
          if (!item) break;
          let outcome;
          try {
            const payload = queueDocument(item.kind, item.payload),
              path =
                item.kind === "event"
                  ? `/api/v1/events/${payload.slug}/registrations`
                  : "/api/v1/newsletter/subscriptions",
              { slug, ...body } = payload,
              response = await fetcher(path, {
                method: "POST",
                credentials: "omit",
                cache: "no-store",
                redirect: "error",
                signal: AbortSignal.timeout(15000),
                headers: {
                  "Content-Type": "application/json",
                  "Idempotency-Key": item.id,
                },
                body: JSON.stringify(body),
              }),
              json = await response.json().catch(() => null);
            outcome = queueOutcome(item.kind, response.status, json?.data);
          } catch {
            outcome = queueOutcome(item.kind, 0);
          }
          await transact((tx) => {
            const row = tx.items.find((r) => r.id === item.id);
            if (!row || tx.epoch !== item.epoch || row.lease !== item.lease)
              return;
            if (row.expiresAt <= clock()) {
              expire(tx, clock());
              return;
            }
            row.lease = null;
            row.leaseUntil = 0;
            row.state = outcome.state;
            row.reason = outcome.reason;
            if (row.state === "pending" && row.attempts >= maxAttempts) {
              row.state = "failed";
              row.reason =
                "Retry limit reached. Check the original page before starting a new submission.";
            }
            if (row.state !== "pending") row.payload = {};
            row.nextAt =
              clock() +
              Math.min(30 * 60000, 30000 * 2 ** Math.min(row.attempts - 1, 6));
            tx.put(row);
          });
        }
      })().finally(() => {
        running = undefined;
      });
      return running;
    },
  };
}
export const publicQueue = createPublicQueue();

import https from "node:https";
import { resolve4 } from "node:dns/promises";
import { isIP } from "node:net";
import { ApiError } from "./lib/http.mjs";
import { adapterResult } from "../shared/reward-events.mjs";
const unavailable = () =>
  new ApiError(
    503,
    "EVENT_UNAVAILABLE",
    "The event could not confirm registration. Nothing has been confirmed here; retry the same check-in.",
  );
export function publicIPv4(value) {
  if (isIP(value) !== 4) return false;
  const [a, b, c] = value.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export async function eventAdapterRequest(
  event,
  secret,
  action,
  body,
  { resolve = resolve4, request = https.request } = {},
) {
  const u = new URL(event.origin);
  if (
    u.protocol !== "https:" ||
    u.href !== u.origin + "/" ||
    u.username ||
    u.password ||
    u.port ||
    isIP(u.hostname) ||
    u.hostname.endsWith(".") ||
    !u.hostname.includes(".") ||
    !["lookup", "checkin", "health"].includes(action)
  )
    throw unavailable();
  let addresses, dnsTimer;
  try {
    addresses = await Promise.race([
      resolve(u.hostname),
      new Promise((_, reject) => {
        dnsTimer = setTimeout(() => reject(unavailable()), 3000);
      }),
    ]);
  } catch {
    throw unavailable();
  } finally {
    clearTimeout(dnsTimer);
  }
  if (!addresses.length || !addresses.every(publicIPv4)) throw unavailable();
  const payload = JSON.stringify({ eventId: event.id, action, ...body });
  try {
    return await new Promise((accept, reject) => {
      const req = request(
        new URL("/api/gdg-membership/v1", u),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(payload),
            authorization: "Bearer " + event.id + "." + secret,
          },
          lookup: (_host, opts, cb) =>
            opts?.all
              ? cb(null, [{ address: addresses[0], family: 4 }])
              : cb(null, addresses[0], 4),
        },
        (res) => {
          let size = 0;
          const chunks = [];
          res.on("data", (chunk) => {
            size += chunk.length;
            if (size > 8192) {
              req.destroy();
              reject(unavailable());
            } else chunks.push(chunk);
          });
          res.on("end", () => {
            try {
              if (res.statusCode !== 200) throw Error();
              const data = JSON.parse(Buffer.concat(chunks).toString());
              if (action === "health") {
                if (
                  data?.eventId !== event.id ||
                  data?.protocol !== "gdg-membership-v1"
                )
                  throw Error();
                accept({ connected: true });
              } else {
                const result = adapterResult.parse(data);
                if (action === "checkin" && result.status !== "registered")
                  throw new ApiError(
                    409,
                    "REGISTRATION_INELIGIBLE",
                    "Registration is no longer eligible for check-in.",
                  );
                if (
                  action === "checkin" &&
                  (!result.checkedIn || !result.checkinId)
                )
                  throw Error();
                accept(result);
              }
            } catch (error) {
              reject(error instanceof ApiError ? error : unavailable());
            }
          });
          res.on("error", () => reject(unavailable()));
          res.on("aborted", () => reject(unavailable()));
          res.on("close", () => {
            if (res.complete === false) reject(unavailable());
          });
        },
      );
      const timer = setTimeout(() => {
        req.destroy();
        reject(unavailable());
      }, 5000);
      req.on("close", () => clearTimeout(timer));
      req.on("error", () => reject(unavailable()));
      req.end(payload);
    });
  } catch (error) {
    throw error instanceof ApiError ? error : unavailable();
  }
}

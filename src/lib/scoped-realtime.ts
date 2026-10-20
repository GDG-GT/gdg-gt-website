import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { api, ApiFailure } from "./api";

export type LiveScope =
  { kind: "notifications" } | { kind: "channel" | "whiteboard" | "direct-thread"; id: string };
export type LiveStatus = "connecting" | "live" | "fallback" | "denied";
type Grant = {
  token: string;
  expiresAt: number;
  topic: string;
  url: string;
  key: string;
};
type Options = {
  scope: LiveScope;
  onChange: () => void;
  onDenied: () => void;
  onStatus: (status: LiveStatus) => void;
  onAccessChange?: () => void;
};
// Dependency injection keeps transport lifecycle tests independent of a browser.
type Dependencies = {
  issue: (scope: LiveScope, signal: AbortSignal) => Promise<Grant>;
  load: () => Promise<
    Pick<typeof import("@supabase/supabase-js"), "createClient">
  >;
};
const dependencies: Dependencies = {
  issue: (scope, signal) =>
    api<Grant>("/auth/realtime-token", {
      method: "POST",
      protected: true,
      body: scope,
      signal,
    }),
  load: () => import("@supabase/supabase-js"),
};

/** One private topic per client. No database queries, writes, presence or storage. */
export function startScopedRealtime(options: Options, deps = dependencies) {
  let stopped = false,
    denied = false,
    client: SupabaseClient | undefined;
  let grant: Grant | undefined,
    retryCount = 0,
    running = false;
  let reauthorizePending = false;
  let subscription: RealtimeChannel | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController();
  const status = (value: LiveStatus) => {
    if (!stopped) options.onStatus(value);
  };
  function disconnect() {
    const previous = client;
    const previousChannel = subscription;
    subscription = undefined;
    client = undefined; // Ignore CLOSED callbacks caused by our own cleanup.
    grant = undefined;
    if (previous) {
      previousChannel?.teardown();
      const channels = previous.getChannels();
      previous.realtime.disconnect();
      void previous
        .removeAllChannels()
        .catch(() => {})
        .finally(() => {
          for (const channel of channels) channel.teardown();
          previous.realtime.disconnect();
        });
    }
  }
  function fail(error: unknown) {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    disconnect();
    if (error instanceof ApiFailure && [401, 403, 404].includes(error.status)) {
      denied = true;
      status("denied");
      options.onDenied();
      return;
    }
    status("fallback");
    // No anonymous/public fallback. Retry slowly; protected API polling continues.
    timer = setTimeout(
      () => void connect(),
      Math.min(120000, 30000 * 2 ** retryCount++),
    );
  }
  function valid(next: Grant) {
    const remaining = next.expiresAt * 1000 - Date.now();
    return (
      next.token &&
      remaining > 1000 &&
      remaining <= 300000 &&
      (options.scope.kind !== "notifications"
        ? next.topic === `gdg:${options.scope.kind}:${options.scope.id}`
        : /^gdg:user:[0-9a-f-]{36}$/.test(next.topic))
    );
  }
  function scheduleRenewal() {
    if (timer) clearTimeout(timer);
    const remaining = grant!.expiresAt * 1000 - Date.now();
    timer = setTimeout(
      () => void renew(),
      // A review-scoped expiry cannot be extended. Avoid issuing once a second
      // for its entire final minute while retaining a bounded expiry recheck.
      Math.max(1000, remaining > 60000 ? remaining - 60000 : remaining * 0.8),
    );
  }
  async function renew() {
    if (stopped || denied || running || !client) return;
    running = true;
    const current = client;
    try {
      const next = await deps.issue(options.scope, abort.signal);
      if (stopped || current !== client) return;
      if (
        !valid(next) ||
        next.topic !== grant?.topic ||
        next.url !== grant.url ||
        next.key !== grant.key
      )
        throw new Error("Live transport configuration changed.");
      grant = next;
      await current.realtime.setAuth(next.token);
      if (!stopped && client === current) scheduleRenewal();
    } catch (error) {
      fail(error);
    } finally {
      running = false;
      if (reauthorizePending && !stopped && !denied) {
        reauthorizePending = false;
        void connect();
      }
    }
  }
  async function connect() {
    if (stopped || denied || running) return;
    running = true;
    status("connecting");
    try {
      const [next, sdk] = await Promise.all([
        deps.issue(options.scope, abort.signal),
        deps.load(),
      ]);
      if (stopped || reauthorizePending) return;
      if (!valid(next)) throw new Error("Live authorization is unavailable.");
      grant = next;
      const current = sdk.createClient(next.url, next.key, {
        accessToken: async () => grant?.token || null,
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        realtime: { timeout: 10000, heartbeatIntervalMs: 25000 },
      });
      client = current;
      // The SDK's initial channel join must already carry the scoped JWT.
      await current.realtime.setAuth(next.token);
      if (stopped || client !== current) return;
      subscription = current
        .channel(next.topic, { config: { private: true } })
        .on("broadcast", { event: "changed" }, ({ payload }) => {
          if (
            stopped ||
            client !== current ||
            !payload ||
            typeof payload !== "object"
          )
            return;
          if (
            (options.scope.kind !== "notifications" &&
              payload.kind === options.scope.kind &&
              payload.id === options.scope.id) ||
            (options.scope.kind === "notifications" &&
              [
                "notifications",
                "channel-directory",
                "whiteboard-directory",
                "direct-directory",
                "announcement-directory",
              ].includes(payload.kind))
          )
            options.onChange(); // Fetch content through the independently authorized API.
          if (
            options.scope.kind === "notifications" &&
            payload.kind === "authorization"
          )
            options.onAccessChange?.();
        });
      subscription.subscribe((state) => {
        if (stopped || client !== current) return;
        if (state === "SUBSCRIBED") {
          retryCount = 0;
          status("live");
          options.onChange(); // Close the read-versus-subscribe race on every rejoin.
        } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(state)) {
          fail(new Error("Live connection interrupted."));
        }
      });
      if (!stopped && client === current) scheduleRenewal();
    } catch (error) {
      fail(error);
    } finally {
      running = false;
      if (reauthorizePending && !stopped && !denied) {
        reauthorizePending = false;
        void connect();
      }
    }
  }
  void connect();
  return {
    stop() {
      stopped = true;
      abort.abort();
      if (timer) clearTimeout(timer);
      disconnect();
    },
    refresh() {
      if (stopped || denied || running) return;
      if (!client) {
        if (timer) clearTimeout(timer);
        void connect();
      } else if (grant && grant.expiresAt * 1000 - Date.now() < 90000)
        void renew();
    },
    reauthorize() {
      if (!stopped && !denied) {
        disconnect();
        if (timer) clearTimeout(timer);
        if (running) reauthorizePending = true;
        else void connect();
      }
    },
  };
}

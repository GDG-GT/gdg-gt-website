import { api } from "@/lib/api";
export class PublicNewsletterService {
  static async subscribe(
    email: string,
    name?: string,
    key: string = crypto.randomUUID(),
  ) {
    const data = await api<{
      accepted?: boolean;
      message?: string;
      gateValid?: boolean;
    }>("/newsletter/subscriptions", {
      method: "POST",
      idempotencyKey: key,
      body: { email, ...(name ? { name } : {}), website: "" },
    });
    return {
      success: !!data.accepted,
      message: data.message || "",
      gateValid: data.gateValid === true,
    };
  }
  static async inspectToken(
    kind: "confirm" | "unsubscribe",
    token: string,
    signal?: AbortSignal,
  ) {
    return api<{ valid: boolean; applied: boolean }>(
      "/newsletter/" + kind + "/validate",
      { method: "POST", body: { token }, signal },
    );
  }
  static async confirmSubscription(token: string, signal?: AbortSignal) {
    return this.consume("confirm", token, signal);
  }
  static async unsubscribe(token: string, signal?: AbortSignal) {
    return this.consume("unsubscribe", token, signal);
  }
  private static async consume(
    kind: "confirm" | "unsubscribe",
    token: string,
    signal?: AbortSignal,
  ) {
    return (
      await api<{ updated: boolean }>("/newsletter/" + kind, {
        method: "POST",
        body: { token },
        signal,
      })
    ).updated;
  }
}

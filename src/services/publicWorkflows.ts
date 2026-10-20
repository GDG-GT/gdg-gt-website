import { api } from "@/lib/api";
const pending = new Map<string, Promise<boolean>>();
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
  static async confirmSubscription(token: string) {
    return this.consume("confirm", token);
  }
  static async unsubscribe(token: string) {
    return this.consume("unsubscribe", token);
  }
  private static consume(kind: "confirm" | "unsubscribe", token: string) {
    const key = kind + ":" + token;
    if (!pending.has(key))
      pending.set(
        key,
        api<{ updated: boolean }>("/newsletter/" + kind, {
          method: "POST",
          body: { token },
        })
          .then((r) => r.updated)
          .catch((error) => {
            pending.delete(key);
            throw error;
          }),
      );
    return pending.get(key)!;
  }
}

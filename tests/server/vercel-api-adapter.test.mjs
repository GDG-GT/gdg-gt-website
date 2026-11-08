import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { vercelApiAdapter } from "../../server/lib/vercel-api-adapter.mjs";

const response = () => ({ statusCode: 200, setHeader: vi.fn(), end: vi.fn() });
describe("hosted Vercel API dispatch", () => {
  it.each([
    ["/api/v1/auth/session", "/api/v1/auth/session"],
    ["/api/v1?__gdg_api_route=auth%2Fsession", "/api/v1/auth/session"],
    ["/api/v1.mjs?__gdg_api_route=auth%2Fsession", "/api/v1/auth/session"],
    ["/api/v1?__gdg_api_route=jobs%2Fdelivery&path=jobs%2Fdelivery", "/api/v1/jobs/delivery"],
    ["/api/v1/forms/example?__gdg_api_route=forms%2Fexample&page=2&q=a%2Bb", "/api/v1/forms/example?page=2&q=a%2Bb"],
  ])("preserves the canonical route and ordinary query: %s", async (url, expected) => {
    const handler = vi.fn(), request = { url, headers: {}, method: "GET" };
    await vercelApiAdapter(handler)(request, response());
    expect(handler).toHaveBeenCalledWith(request, expect.any(Object));
    expect(request.url).toBe(expected);
  });
  it.each([
    "/api/v1?__gdg_api_route=auth/session&__gdg_api_route=admin/users",
    "/api/v1/auth/session?__gdg_api_route=admin/users",
    "/api/v1?__gdg_api_route=../admin/users",
    "/api/v1?__gdg_api_route=https://example.test",
    "/other?__gdg_api_route=auth/session",
    "/api/v1",
  ])("rejects conflicting or malformed dispatch without invoking application: %s", async (url) => {
    const handler = vi.fn(), result = response();
    await vercelApiAdapter(handler)({ url }, result);
    expect(result.statusCode).toBe(400);
    expect(result.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(handler).not.toHaveBeenCalled();
  });
  it("retains the exact webhook stream, body and signature headers", async () => {
    const stream = { [Symbol.asyncIterator]: vi.fn() }, body = Buffer.from('{"exact":  "spacing"}\n'),
      headers = { "svix-signature": "fictional-signature" },
      request = { ...stream, url: "/api/v1?__gdg_api_route=webhooks/resend", body, headers, method: "POST" },
      handler = vi.fn();
    await vercelApiAdapter(handler)(request, response());
    expect(request.body).toBe(body);
    expect(request.headers).toBe(headers);
    expect(request[Symbol.asyncIterator]).toBe(stream[Symbol.asyncIterator]);
    expect(stream[Symbol.asyncIterator]).not.toHaveBeenCalled();
  });
  it("packages TypeScript imports and explicitly routes the homepage and nested API", async () => {
    const config = JSON.parse(await readFile(new URL("../../vercel.json", import.meta.url), "utf8"));
    expect(config.rewrites).toContainEqual({ source: "/", destination: "/api/site?__route=/" });
    expect(config.rewrites).toContainEqual({ source: "/api/v1/:path*", destination: "/api/v1?__gdg_api_route=:path*" });
    expect(config.outputDirectory).toBe(".build/public");
    expect(config.trailingSlash).toBe(false);
    expect(config.redirects || []).not.toContainEqual({ source: "/admin", destination: "/admin/", permanent: true });
    expect(config.functions["api/site.mjs"].includeFiles).toContain("shared/**");
    expect(config.functions["api/v1.mjs"].includeFiles).toBe("shared/**");
    const entry = await import("../../api/v1.mjs");
    expect(entry.config.api.bodyParser).toBe(false);
  });
});

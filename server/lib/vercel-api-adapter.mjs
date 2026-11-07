// Vercel's standalone Node functions do not provide Next's [...path] routing.
// One explicit rewrite dispatches all versioned routes to this adapter. Handle
// either original-path or destination-path request URLs without accepting a
// conflicting route override, and leave the body stream completely untouched.
export function vercelApiAdapter(handler) {
  return async function versionedApi(request, response) {
    const url = new URL(request.url, "https://adapter.invalid"),
      routes = url.searchParams.getAll("__gdg_api_route"),
      original = url.pathname.startsWith("/api/v1/")
        ? url.pathname.slice("/api/v1/".length)
        : null;
    const route = routes[0] ?? original;
    if (
      routes.length > 1 ||
      !route ||
      !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(route) ||
      (original !== null && original !== route) ||
      (original === null && url.pathname !== "/api/v1")
    ) {
      response.statusCode = 400;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ error: { code: "INVALID_ROUTE", message: "This API route is not available." } }));
      return;
    }
    url.searchParams.delete("__gdg_api_route");
    request.url = "/api/v1/" + route + url.search;
    return handler(request, response);
  };
}

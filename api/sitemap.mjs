import handler from "../server/handler.mjs";
export default function sitemap(request, response) {
  request.url = "/api/v1/public/sitemap.xml";
  return handler(request, response);
}

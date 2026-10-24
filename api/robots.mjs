import handler from "../server/handler.mjs";
export default function robots(request, response) {
  request.url = "/api/v1/public/robots.txt";
  return handler(request, response);
}

import handler from "../server/handler.mjs";
import { vercelApiAdapter } from "../server/lib/vercel-api-adapter.mjs";

export default vercelApiAdapter(handler);
// Standalone @vercel/node uses `helpers`, while `api.bodyParser` applies to
// Next.js-style handlers. Production must set NODEJS_HELPERS=0 for the host
// builder; the application reads and verifies the original stream itself.
export const config = { api: { bodyParser: false } };

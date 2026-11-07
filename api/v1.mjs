import handler from "../server/handler.mjs";
import { vercelApiAdapter } from "../server/lib/vercel-api-adapter.mjs";

export default vercelApiAdapter(handler);
// Provider signatures must be verified over the original request byte stream.
export const config = { api: { bodyParser: false } };

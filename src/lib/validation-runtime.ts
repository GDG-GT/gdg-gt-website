import { config } from "zod";

// Keep validation compatible with the site's strict CSP. Even a caught eval
// capability probe produces a browser security report; no JIT is needed here.
config({ jitless: true });

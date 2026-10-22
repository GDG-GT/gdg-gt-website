export { default } from "../../server/handler.mjs";
// Keep provider signatures over the original byte stream. Application JSON
// handlers parse their own bounded bodies. Verify hosted behavior before launch.
export const config = { api: { bodyParser: false } };

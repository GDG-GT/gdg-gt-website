import { readPublicHome } from "./public-content.mjs";
import { databaseResult as checked } from "./lib/validation.mjs";
import { publicSiteStatus } from "../shared/site-status.mjs";
export async function readPublicBootstrap(db) {
  const [home, status] = await Promise.all([
    readPublicHome(db),
    db.rpc("read_site_status", { p_actor: null, p_private: false }),
  ]);
  return { home, status: publicSiteStatus.parse(checked(status)) };
}

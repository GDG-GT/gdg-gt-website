import { renderToPipeableStream } from "react-dom/server";
import { PassThrough } from "node:stream";
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router-dom";
import App, { RoutedApplication } from "./App";
import { PublicHydrationBoundary } from "./ui/PublicHydrationBoundary";
import { readHomeContent } from "./lib/content-snapshot";
import { readPublicSiteStatus } from "../shared/public-site-status-read.mjs";
export async function renderPublicPage(path: string, raw: { home: unknown; status: unknown }) {
  if (!["/", "/events", "/contact"].includes(path)) throw Error("Unsupported public rendering path.");
  const status = readPublicSiteStatus(raw.status);
  if (!status) throw Error("Invalid public availability snapshot.");
  const bootstrap = { home: readHomeContent(raw.home), status };
  const handler = createStaticHandler([{ path: "*", element: <RoutedApplication /> }]);
  const context = await handler.query(new Request("https://public-render.invalid" + path));
  if (context instanceof Response) throw Error("Unexpected public render redirect.");
  const router = createStaticRouter(handler.dataRoutes, context);
  const markup = await new Promise<string>((resolve, reject) => {
    const output = new PassThrough(), chunks: Buffer[] = [];
    let failed = false;
    let stream: ReturnType<typeof renderToPipeableStream> | undefined;
    const timer = setTimeout(() => { failed = true; stream?.abort(); reject(Error("Public rendering timed out.")); }, 10000);
    output.on("data", (chunk: Buffer) => chunks.push(chunk));
    output.on("error", (error) => { clearTimeout(timer); reject(error); });
    output.on("end", () => { clearTimeout(timer); if (!failed) resolve(Buffer.concat(chunks).toString("utf8")); });
    try { stream = renderToPipeableStream(<PublicHydrationBoundary><App bootstrap={bootstrap} routerView={<StaticRouterProvider router={router} context={context} hydrate={false} />} /></PublicHydrationBoundary>, {
      onAllReady() { if (!failed) stream?.pipe(output); },
      onError(error) { if (failed) return; failed = true; clearTimeout(timer); stream?.abort(); reject(error); },
    }); } catch (error) { clearTimeout(timer); reject(error); }
  });
  if (Buffer.byteLength(markup) > 256000 || /<script\b/i.test(markup)) throw Error("Unexpected public render output.");
  return { markup, bootstrap };
}

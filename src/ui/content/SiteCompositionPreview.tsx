import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import {
  ContentSnapshotProvider,
  type ContentSnapshot,
} from "@/contexts/ContentContext";
import { managedPublicPages } from "../../../shared/site-content";
import SiteShell from "../SiteShell";
import {
  HomePage,
  EventsPage,
  TeamPage,
  ResourcesPage,
  SponsorsPage,
  GalleryPage,
  ContactPage,
} from "../PublicPages";
import { Button, Field } from "../primitives";
type Preview = ContentSnapshot & {
  draftCount: number;
  omitted: number;
  generatedAt: string;
};
const components = {
  home: HomePage,
  events: EventsPage,
  team: TeamPage,
  resources: ResourcesPage,
  sponsors: SponsorsPage,
  gallery: GalleryPage,
  contact: ContactPage,
};
export default function SiteCompositionPreview() {
  const [params, setParams] = useSearchParams(),
    requested = params.get("page") || "home",
    page = managedPublicPages.find((p) => p === requested) || "home",
    Page = components[page];
  const [data, setData] = useState<Preview>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [tick, setTick] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setData(undefined);
    setError("");
    api<Preview>("/admin/site-content/preview?page=" + page, {
      signal: controller.signal,
    })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [page, tick]);
  return (
    <>
      <header className="gt-composition-toolbar">
        <div>
          <strong>Private draft preview</strong>
          <p>
            Saved drafts in the actual page layout. Links and submissions are
            disabled. Unsaved editor changes are excluded.
          </p>
        </div>
        <Field label="Preview page">
          <select
            value={page}
            onChange={(event) =>
              setParams({ mode: "preview", page: event.target.value })
            }
          >
            {managedPublicPages.map((p) => (
              <option key={p} value={p}>
                {p === "home" ? "Home" : p[0].toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => setTick((t) => t + 1)}
        >
          Reload saved drafts
        </Button>
        <Link className="gt-button gt-button-secondary" to="/admin/content">
          Back to editor
        </Link>
      </header>
      {busy && (
        <p role="status" className="gt-container">
          Loading private preview…
        </p>
      )}
      {error && (
        <p role="alert" className="gt-container gt-form-error">
          {error}
        </p>
      )}
      {data && (
        <>
          <p className="gt-composition-note">
            Includes {data.draftCount} saved drafts. Snapshot{" "}
            {new Date(data.generatedAt).toLocaleString()}.
            {data.omitted
              ? ` ${data.omitted} invalid legacy records were omitted; review them in the editor.`
              : ""}
          </p>
          <ContentSnapshotProvider snapshot={data}>
            <fieldset
              disabled
              className="gt-composition-canvas"
              aria-label="Read-only public page composition"
              onClickCapture={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onAuxClickCapture={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onSubmitCapture={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              <SiteShell>
                <Page />
              </SiteShell>
            </fieldset>
          </ContentSnapshotProvider>
        </>
      )}
    </>
  );
}

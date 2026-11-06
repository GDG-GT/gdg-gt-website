import { Button } from "../primitives";

export default function TeamReadFeedback({
  name,
  read,
  offline,
  retry,
  busy,
}: {
  name: string;
  read: { loading: boolean; error: string; at?: string };
  offline: boolean;
  retry: () => void;
  busy: boolean;
}) {
  return (
    <>
      {read.loading && <p role="status">Loading {name}…</p>}
      {(read.error || offline) && (
        <div role={read.error ? "alert" : "status"} className="gt-form-error">
          <p>{read.error || "You are offline. Changes are paused."}</p>
          {read.at && (
            <p>
              Showing the last successful {name} read from{" "}
              <time dateTime={read.at}>
                {new Date(read.at).toLocaleString()}
              </time>
              . Recheck before making changes.
            </p>
          )}
        </div>
      )}
      <Button
        type="button"
        variant="secondary"
        disabled={busy || read.loading || offline}
        onClick={retry}
      >
        Reload {name}
      </Button>
    </>
  );
}

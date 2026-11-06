import { Button } from "../primitives";
type Read = { data?: unknown; loading: boolean; error: string; at?: string };
export default function MemberReadFeedback({
  name,
  read,
  offline,
  disabled,
  retry,
}: {
  name: string;
  read: Read;
  offline: boolean;
  disabled: boolean;
  retry: () => void;
}) {
  return (
    <>
      {read.loading && !read.data && (
        <div role="status" aria-label={`Loading ${name}`}>
          <div className="gt-skeleton gt-detail-skeleton" />
          <span className="sr-only">Loading {name}…</span>
        </div>
      )}
      {(read.error || (offline && read.at)) && (
        <div
          className={read.error ? "gt-form-error" : "gt-helper"}
          role={read.error ? "alert" : "status"}
        >
          {read.error && (
            <p>
              {name} could not {read.at ? "refresh" : "load"}. {read.error}
            </p>
          )}
          {read.at && (
            <p>
              Showing {name} from{" "}
              <time dateTime={read.at}>
                {new Date(read.at).toLocaleString()}
              </time>
              . This snapshot may be out of date.
            </p>
          )}
          {read.error && (
            <Button
              type="button"
              variant="secondary"
              disabled={disabled || read.loading}
              onClick={retry}
            >
              Retry {name}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

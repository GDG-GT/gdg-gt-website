import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Field } from "../primitives";
import type { MediaListing } from "./types";
export default function DestinationPicker({
  teams,
  chapter,
  initialTeam,
  fixedTeam = false,
  disabled,
  onChange,
  gallery = false,
}: {
  teams: MediaListing["teams"];
  chapter: boolean;
  initialTeam: string | null;
  fixedTeam?: boolean;
  disabled?: boolean;
  gallery?: boolean;
  onChange: (destination: {
    teamId: string | null;
    folderId: string | null;
  }) => void;
}) {
  const [team, setTeam] = useState(initialTeam || "chapter"),
    [folder, setFolder] = useState<string | null>(null),
    [list, setList] = useState<MediaListing>(),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setList(undefined);
    setError("");
    api<MediaListing>(
      `/admin/media?view=${gallery ? "gallery" : "library"}&team=${team}&folder=${folder || "root"}`,
      {
        signal: controller.signal,
      },
    )
      .then((v) => {
        if (!controller.signal.aborted) setList(v);
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [team, folder, gallery, retry]);
  return (
    <div className="gt-media-destination">
      <Field label="Library">
        <select
          disabled={disabled || fixedTeam}
          value={team}
          onChange={(e) => {
            setTeam(e.target.value);
            setFolder(null);
          }}
        >
          {(chapter || !initialTeam) && (
            <option value="chapter">Chapter library</option>
          )}
          {teams
            .filter((t) => t.canCreate || t.id === initialTeam)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
      </Field>
      {error && (
        <p role="alert" className="gt-form-error">
          {error}{" "}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setRetry((v) => v + 1)}
          >
            Retry destination folders
          </button>
        </p>
      )}
      {!list && !error && <p role="status">Loading authorized folders…</p>}
      {list && (
        <>
          <p>
            Destination: <strong>{list.folder?.name || "Library root"}</strong>
          </p>
          <div className="gt-inline-actions">
            <Button
              type="button"
              variant="ghost"
              disabled={disabled || !folder}
              onClick={() => setFolder(list.folder?.parentId || null)}
            >
              ↑ Parent folder
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={disabled}
              onClick={() =>
                onChange({
                  teamId: team === "chapter" ? null : team,
                  folderId: folder,
                })
              }
            >
              Use this destination
            </Button>
          </div>
          {list.folders.length > 0 && (
            <ul>
              {list.folders.map((f) => (
                <li key={f.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => setFolder(f.id)}
                  >
                    Open {f.name} →
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="gt-helper">
            Opening a folder does not select it. Choose “Use this destination”
            to confirm.
          </p>
        </>
      )}
    </div>
  );
}

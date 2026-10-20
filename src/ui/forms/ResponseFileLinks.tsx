import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "../primitives";
export default function ResponseFileLinks({
  formId,
  responseId,
  ids,
}: {
  formId: string;
  responseId: string;
  ids: string[];
}) {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  return (
    <div>
      {ids.length === 0 ? (
        <p>Not answered</p>
      ) : (
        ids.map((id, index) => (
          <Button
            key={id}
            type="button"
            disabled={!!busy}
            variant="secondary"
            onClick={async () => {
              setBusy(id);
              setError("");
              try {
                const result = await api<{ url: string; expiresIn: number }>(
                  `/admin/forms/${formId}/responses/${responseId}/files/${id}`,
                );
                const link = document.createElement("a");
                link.href = result.url;
                link.rel = "noopener noreferrer";
                link.referrerPolicy = "no-referrer";
                link.click();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy("");
              }
            }}
          >
            {busy === id
              ? "Preparing…"
              : `Download private attachment ${index + 1}`}
          </Button>
        ))
      )}
      {error && (
        <p role="alert" className="gt-form-error">
          {error}
        </p>
      )}
    </div>
  );
}

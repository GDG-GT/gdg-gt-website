import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import type { PreviewForm, FormResponse } from "./store";
type Library = {
  items: PreviewForm[];
  total: number;
  page: number;
  pageSize: number;
  canCreate?: boolean;
};
export function draftDefinition(form: PreviewForm) {
  return {
    title: form.title,
    description: form.description,
    fields: form.fields.map((field) => ({
      ...field,
      optionIds: field.options.map(
        (_, i) => field.optionIds?.[i] || crypto.randomUUID(),
      ),
      ...(field.columns
        ? {
            columnIds: field.columns.map(
              (_, i) => field.columnIds?.[i] || crypto.randomUUID(),
            ),
          }
        : {}),
    })),
    sections: form.sections,
    settings: {
      ...form.settings,
      opensAt: form.settings.opensAt
        ? new Date(form.settings.opensAt).toISOString()
        : "",
      closesAt: form.settings.closesAt
        ? new Date(form.settings.closesAt).toISOString()
        : "",
    },
  };
}
export type FormLibraryAction =
  | "create"
  | "duplicate"
  | "archive"
  | "restore"
  | "state";
export type FormLibraryIntent = {
  action: FormLibraryAction;
  sourceId?: string;
  snapshot: PreviewForm;
  key: string;
  startedAt: number;
  body: {
    revision?: number;
    slug?: string;
    teamId?: string | null;
    template?: PreviewForm["templateKey"];
    definition?: ReturnType<typeof draftDefinition>;
    state?: "Open" | "Closed" | "Scheduled";
  };
};
export const formLibraryWriteLabel = (intent: FormLibraryIntent) =>
  intent.action === "state"
    ? intent.body.state === "Closed"
      ? "close"
      : intent.body.state === "Scheduled"
        ? "schedule"
        : "reopen"
    : intent.action;
export function prepareFormLibraryWrite(
  action: FormLibraryAction,
  form: PreviewForm,
  state?: "Open" | "Closed" | "Scheduled",
): FormLibraryIntent {
  const snapshot = structuredClone(form);
  let body: FormLibraryIntent["body"];
  if (action === "create") {
    const definition = draftDefinition(snapshot);
    Object.assign(snapshot, definition);
    body = {
      slug: snapshot.slug,
      teamId: snapshot.teamId || null,
      ...(snapshot.templateKey ? { template: snapshot.templateKey } : {}),
      definition,
    };
  } else if (action === "duplicate")
    body = {
      slug: snapshot.slug.slice(0, 112) + "-" + crypto.randomUUID().slice(0, 6),
      revision: snapshot.revision,
    };
  else
    body = {
      revision: snapshot.revision,
      ...(action === "state" ? { state } : {}),
    };
  return {
    action,
    sourceId: action === "create" ? undefined : snapshot.id,
    snapshot,
    body,
    key: crypto.randomUUID(),
    startedAt: Date.now(),
  };
}
export async function submitFormLibraryWrite(
  intent: FormLibraryIntent,
  signal?: AbortSignal,
) {
  const path =
    "/admin/forms" +
    (intent.sourceId ? "/" + intent.sourceId : "") +
    (intent.action === "duplicate" ||
    intent.action === "restore" ||
    intent.action === "state"
      ? "/" + intent.action
      : "");
  const result = await api<{ form: PreviewForm }>(path, {
    method: intent.action === "archive" ? "DELETE" : "POST",
    protected: true,
    signal,
    idempotencyKey: intent.key,
    body: intent.body,
  });
  if (!validLibraryResult(result.form))
    throw new ApiFailure(
      503,
      "UNCONFIRMED_RESULT",
      "The saved form result could not be confirmed. Recheck the original change.",
    );
  return result.form;
}
function validLibraryResult(form: PreviewForm | null | undefined) {
  return (
    !!form &&
    typeof form.id === "string" &&
    Number.isInteger(form.revision) &&
    form.revision! >= 1 &&
    typeof form.status === "string" &&
    Array.isArray(form.actions) &&
    Array.isArray(form.versions)
  );
}
export async function inspectFormLibraryWrite(
  intent: FormLibraryIntent,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    action: intent.action,
    ...(intent.sourceId ? { source: intent.sourceId } : {}),
    ...(intent.action === "create" && intent.body.teamId
      ? { team: intent.body.teamId }
      : {}),
  });
  const result = await api<{
    committed: boolean;
    canCreate: boolean;
    receipt?: {
      id: string;
      sourceId: string | null;
      action: FormLibraryAction;
      revision: number;
    };
    form: PreviewForm | null;
  }>("/admin/forms/recovery?" + query, { signal, idempotencyKey: intent.key });
  if (
    typeof result.committed !== "boolean" ||
    typeof result.canCreate !== "boolean" ||
    (result.form !== null && !validLibraryResult(result.form)) ||
    (result.committed && !result.form)
  )
    throw new ApiFailure(
      503,
      "UNCONFIRMED_RESULT",
      "The original form outcome could not be verified. Recheck before retrying.",
    );
  return result;
}
export const formsApi = {
  async create(
    form: PreviewForm,
    signal?: AbortSignal,
    key: string = crypto.randomUUID(),
  ) {
    return (
      await api<{ form: PreviewForm }>("/admin/forms", {
        method: "POST",
        protected: true,
        signal,
        idempotencyKey: key,
        body: {
          slug: form.slug,
          teamId: form.teamId || null,
          ...(form.templateKey ? { template: form.templateKey } : {}),
          definition: draftDefinition(form),
        },
      })
    ).form;
  },
  async load(id: string, signal?: AbortSignal) {
    return (await api<{ form: PreviewForm }>("/admin/forms/" + id, { signal }))
      .form;
  },
  async save(
    form: PreviewForm,
    signal?: AbortSignal,
    key: string = crypto.randomUUID(),
  ) {
    return (
      await api<{ form: PreviewForm }>("/admin/forms/" + form.id + "/draft", {
        method: "PATCH",
        protected: true,
        signal,
        idempotencyKey: key,
        body: {
          revision: form.revision,
          slug: form.slug,
          teamId: form.teamId || null,
          definition: draftDefinition(form),
        },
      })
    ).form;
  },
  async publish(
    form: PreviewForm,
    signal?: AbortSignal,
    key: string = crypto.randomUUID(),
  ) {
    return (
      await api<{ form: PreviewForm }>("/admin/forms/" + form.id + "/publish", {
        method: "POST",
        protected: true,
        signal,
        idempotencyKey: key,
        body: { revision: form.revision },
      })
    ).form;
  },
  async inspectWrite(
    id: string,
    action: "draft" | "publish",
    key: string,
    signal?: AbortSignal,
  ) {
    return api<{
      committed: boolean;
      receipt?: { revision: number; versionId: string | null };
      form: PreviewForm;
    }>("/admin/forms/" + id + "?mutation=" + action, {
      idempotencyKey: key,
      signal,
    });
  },
  async duplicate(
    form: PreviewForm,
    signal?: AbortSignal,
    key: string = crypto.randomUUID(),
    copySlug = form.slug.slice(0, 112) + "-" + crypto.randomUUID().slice(0, 6),
  ) {
    return (
      await api<{ form: PreviewForm }>(
        "/admin/forms/" + form.id + "/duplicate",
        {
          method: "POST",
          protected: true,
          signal,
          idempotencyKey: key,
          body: { slug: copySlug, revision: form.revision },
        },
      )
    ).form;
  },
  async state(
    form: PreviewForm,
    state: "Open" | "Closed" | "Scheduled",
    signal?: AbortSignal,
    key: string = crypto.randomUUID(),
  ) {
    return api("/admin/forms/" + form.id + "/state", {
      method: "POST",
      protected: true,
      signal,
      idempotencyKey: key,
      body: { revision: form.revision, state },
    });
  },
  async archive(
    form: PreviewForm,
    signal?: AbortSignal,
    key: string = crypto.randomUUID(),
  ) {
    return api("/admin/forms/" + form.id, {
      method: "DELETE",
      protected: true,
      signal,
      idempotencyKey: key,
      body: { revision: form.revision },
    });
  },
  async restore(
    form: PreviewForm,
    signal?: AbortSignal,
    key: string = crypto.randomUUID(),
  ) {
    return api("/admin/forms/" + form.id + "/restore", {
      method: "POST",
      protected: true,
      signal,
      idempotencyKey: key,
      body: { revision: form.revision },
    });
  },
  async responses(id: string, params = "") {
    return api<{
      items: FormResponse[];
      total: number;
      page: number;
      pageSize: number;
    }>("/admin/forms/" + id + "/responses?" + params);
  },
};
export function useFormLibrary(params: string, enabled = true) {
  const { currentAdmin } = useAdmin(),
    actorId = currentAdmin?.id,
    authorityScope = JSON.stringify([actorId, currentAdmin?.role]),
    scope = JSON.stringify([
      currentAdmin?.id,
      currentAdmin?.role,
      params,
      enabled,
    ]);
  const [snapshot, setSnapshot] = useState<{
      scope: string;
      data: Library;
      at: string;
    }>(),
    [request, setRequest] = useState({
      scope,
      error: "",
      loading: enabled,
      denied: false,
    });
  const activeRequest = useRef<AbortController>(),
    activeScope = useRef(scope),
    mounted = useRef(true),
    blockedScope = useRef<string>();
  activeScope.current = scope;
  const clear = useCallback(() => {
    if (!mounted.current || activeScope.current !== scope) return;
    activeRequest.current?.abort();
    blockedScope.current = authorityScope;
    setSnapshot(undefined);
    setRequest({
      scope,
      error:
        "Private form library data has been cleared. Recheck current access before continuing.",
      loading: false,
      denied: true,
    });
  }, [scope, authorityScope]);
  const load = useCallback(
    async (explicit = true) => {
      if (!mounted.current || activeScope.current !== scope) return;
      activeRequest.current?.abort();
      if (!enabled || !actorId) return;
      if (!explicit && blockedScope.current === authorityScope) {
        setRequest({
          scope,
          error:
            "Private form library data has been cleared. Recheck current access before continuing.",
          loading: false,
          denied: true,
        });
        return;
      }
      blockedScope.current = undefined;
      const controller = new AbortController();
      activeRequest.current = controller;
      setRequest({ scope, error: "", loading: true, denied: false });
      try {
        const data = await api<Library>("/admin/forms?" + params, {
          signal: controller.signal,
        });
        if (
          !controller.signal.aborted &&
          mounted.current &&
          activeScope.current === scope
        )
          setSnapshot({ scope, data, at: new Date().toISOString() });
      } catch (e) {
        if (
          !controller.signal.aborted &&
          mounted.current &&
          activeScope.current === scope
        ) {
          const denied =
            e instanceof ApiFailure && [401, 403, 404].includes(e.status);
          if (denied) {
            setSnapshot(undefined);
            blockedScope.current = authorityScope;
          }
          setRequest({
            scope,
            loading: false,
            denied,
            error:
              e instanceof Error
                ? e.message
                : "The form library could not load. Try again.",
          });
        }
      } finally {
        if (
          !controller.signal.aborted &&
          mounted.current &&
          activeScope.current === scope
        )
          setRequest((previous) =>
            previous.scope === scope
              ? { ...previous, loading: false }
              : previous,
          );
      }
    },
    [scope, params, enabled, actorId, authorityScope],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, [clear]);
  useEffect(() => {
    void load(false);
    return () => activeRequest.current?.abort();
  }, [load]);
  const matching = enabled && snapshot?.scope === scope ? snapshot : undefined,
    data: Library = matching?.data || {
      items: [],
      total: 0,
      page: 1,
      pageSize: 30,
    },
    current = request.scope === scope,
    loading = enabled && !!currentAdmin && (!current || request.loading),
    error = current ? request.error : "",
    denied =
      (current && request.denied) || blockedScope.current === authorityScope;
  return {
    ...data,
    scope,
    at: matching?.at,
    canCreate: !!data.canCreate && !loading && !error && !denied,
    error,
    denied,
    loading,
    clear,
    reload: load,
  };
}
export function useServerForm(id: string | undefined) {
  const { currentAdmin } = useAdmin(),
    scope = JSON.stringify([currentAdmin?.id, currentAdmin?.role, id]);
  const [snapshot, setSnapshot] = useState<{
      scope: string;
      form: PreviewForm;
      at: string;
    }>(),
    [request, setRequest] = useState({
      scope,
      error: "",
      loading: !!id,
      denied: false,
    });
  const activeRequest = useRef<AbortController>(),
    blockedScope = useRef<string>(),
    mounted = useRef(true),
    activeScope = useRef(scope);
  activeScope.current = scope;
  const clear = useCallback(() => {
    activeRequest.current?.abort();
    blockedScope.current = scope;
    setSnapshot(undefined);
    setRequest({
      scope,
      error:
        "Private form data has been cleared. Recheck current access before continuing.",
      loading: false,
      denied: true,
    });
  }, [scope]);
  useEffect(() => {
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, [clear]);
  const load = useCallback(
    async (explicit = true) => {
      if (!mounted.current || activeScope.current !== scope) return;
      activeRequest.current?.abort();
      if (!id) return;
      if (!explicit && blockedScope.current === scope) return;
      blockedScope.current = undefined;
      const controller = new AbortController();
      activeRequest.current = controller;
      setRequest({ scope, loading: true, error: "", denied: false });
      try {
        const form = await formsApi.load(id, controller.signal);
        if (
          !controller.signal.aborted &&
          mounted.current &&
          activeScope.current === scope
        )
          setSnapshot({ scope, form, at: new Date().toISOString() });
      } catch (e) {
        if (
          !controller.signal.aborted &&
          mounted.current &&
          activeScope.current === scope
        ) {
          const denied =
            e instanceof ApiFailure && [401, 403, 404].includes(e.status);
          if (denied) {
            setSnapshot(undefined);
            blockedScope.current = scope;
          }
          setRequest({
            scope,
            loading: false,
            denied,
            error:
              e instanceof Error
                ? e.message
                : "This form could not load. Try again.",
          });
        }
      } finally {
        if (
          !controller.signal.aborted &&
          mounted.current &&
          activeScope.current === scope
        )
          setRequest((previous) => ({ ...previous, loading: false }));
      }
    },
    [id, scope],
  );
  useEffect(() => {
    mounted.current = true;
    void load(false);
    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
    };
  }, [load]);
  return {
    form: id && snapshot?.scope === scope ? snapshot.form : undefined,
    at: id && snapshot?.scope === scope ? snapshot.at : undefined,
    denied: request.scope === scope && request.denied,
    clear,
    error: request.scope === scope ? request.error : "",
    loading: !!id && (request.scope !== scope || request.loading),
    reload: load,
  };
}

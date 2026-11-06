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
export const formsApi = {
  async create(form: PreviewForm) {
    return (
      await api<{ form: PreviewForm }>("/admin/forms", {
        method: "POST",
        protected: true,
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
  async save(form: PreviewForm, signal?: AbortSignal) {
    return (
      await api<{ form: PreviewForm }>("/admin/forms/" + form.id + "/draft", {
        method: "PATCH",
        protected: true,
        signal,
        body: {
          revision: form.revision,
          slug: form.slug,
          teamId: form.teamId || null,
          definition: draftDefinition(form),
        },
      })
    ).form;
  },
  async publish(form: PreviewForm, signal?: AbortSignal) {
    return (
      await api<{ form: PreviewForm }>("/admin/forms/" + form.id + "/publish", {
        method: "POST",
        protected: true,
        signal,
        body: { revision: form.revision },
      })
    ).form;
  },
  async duplicate(form: PreviewForm) {
    return (
      await api<{ form: PreviewForm }>(
        "/admin/forms/" + form.id + "/duplicate",
        {
          method: "POST",
          protected: true,
          body: { slug: form.slug + "-" + crypto.randomUUID().slice(0, 6) },
        },
      )
    ).form;
  },
  async state(form: PreviewForm, state: "Open" | "Closed" | "Scheduled") {
    return api("/admin/forms/" + form.id + "/state", {
      method: "POST",
      protected: true,
      body: { revision: form.revision, state },
    });
  },
  async archive(form: PreviewForm) {
    return api("/admin/forms/" + form.id, {
      method: "DELETE",
      protected: true,
      body: { revision: form.revision },
    });
  },
  async restore(form: PreviewForm) {
    return api("/admin/forms/" + form.id + "/restore", {
      method: "POST",
      protected: true,
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
  const { currentAdmin } = useAdmin();
  const scope = JSON.stringify([
    currentAdmin?.id,
    currentAdmin?.role,
    params,
    enabled,
  ]);
  const [snapshot, setSnapshot] = useState<{ scope: string; data: Library }>(),
    [request, setRequest] = useState({ scope, error: "", loading: true }),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setRequest({ scope, loading: true, error: "" });
    setSnapshot(undefined);
    if (!enabled) {
      setRequest({ scope, loading: false, error: "" });
      return () => controller.abort();
    }
    api<Library>("/admin/forms?" + params, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setSnapshot({ scope, data: result });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setRequest({
            scope,
            loading: false,
            error:
              e instanceof Error
                ? e.message
                : "The form library could not load. Try again.",
          });
      })
      .finally(() => {
        if (!controller.signal.aborted)
          setRequest((previous) => ({ ...previous, loading: false }));
      });
    return () => controller.abort();
  }, [params, enabled, refresh, scope]);
  const data =
    snapshot?.scope === scope && enabled
      ? snapshot.data
      : { items: [], total: 0, page: 1, pageSize: 30 };
  return {
    ...data,
    canCreate: !!data.canCreate,
    error: request.scope === scope ? request.error : "",
    loading: enabled && (request.scope !== scope || request.loading),
    reload: () => setRefresh((v) => v + 1),
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

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import type { PreviewForm, FormResponse } from "./store";
type Library = {
  items: PreviewForm[];
  total: number;
  page: number;
  pageSize: number;
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
  async load(id: string) {
    return (await api<{ form: PreviewForm }>("/admin/forms/" + id)).form;
  },
  async save(form: PreviewForm) {
    return (
      await api<{ form: PreviewForm }>("/admin/forms/" + form.id + "/draft", {
        method: "PATCH",
        protected: true,
        body: {
          revision: form.revision,
          slug: form.slug,
          teamId: form.teamId || null,
          definition: draftDefinition(form),
        },
      })
    ).form;
  },
  async publish(form: PreviewForm) {
    return (
      await api<{ form: PreviewForm }>("/admin/forms/" + form.id + "/publish", {
        method: "POST",
        protected: true,
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
  const [data, setData] = useState<Library>({
      items: [],
      total: 0,
      page: 1,
      pageSize: 30,
    }),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData({ items: [], total: 0, page: 1, pageSize: 30 });
    if (!enabled) {
      setLoading(false);
      return () => controller.abort();
    }
    api<Library>("/admin/forms?" + params, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [params, enabled, refresh, currentAdmin?.id, currentAdmin?.role]);
  return { ...data, error, loading, reload: () => setRefresh((v) => v + 1) };
}
export function useServerForm(id: string | undefined) {
  const [form, setForm] = useState<PreviewForm>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      setForm(await formsApi.load(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  return { form, error, loading, reload: load };
}

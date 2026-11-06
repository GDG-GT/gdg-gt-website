import { vi } from "vitest";
import { applicationHandler } from "../../server/handler.mjs";
import {
  createTemplate,
  newField,
  formDefinitionSchema,
} from "../../shared/forms.ts";
import { token, tokenHash } from "../../server/lib/security.mjs";
export const ids = Object.fromEntries(
  [
    "actor",
    "session",
    "form",
    "version",
    "response",
    "team",
    "peer",
    "access",
  ].map((name, index) => [
    name,
    `fc000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  ]),
);
export const address = "fictional-respondent@example.test";
export function fixture() {
  const template = createTemplate("Fictional route fixture", "blank");
  template.fields = [newField("short", template.sections[0].id)];
  template.fields[0].required = true;
  const { title, description, fields, sections, settings } = template;
  const definition = formDefinitionSchema.parse({
    title,
    description,
    fields,
    sections,
    settings: { ...settings, resume: true, editing: true },
  });
  const row = {
    id: ids.form,
    slug: "fictional-route-fixture",
    title,
    state: "Open",
    team_id: null,
    owner_id: ids.actor,
    draft_revision: 3,
    draft_definition: definition,
    settings: definition.settings,
    access_mode: "public",
    published_version_id: ids.version,
  };
  const published = {
    id: ids.version,
    version: 1,
    definition,
    schema_hash: tokenHash(JSON.stringify(definition)),
    published_at: "2026-10-22T12:00:00Z",
  };
  const csrf = token(),
    raw = token(),
    key = token();
  const config = {
    origin: "https://chapter.example.test",
    sessionCookie: "__Host-gdg_session",
    riskSecret: "fictional-forms-route-risk",
    encryptionSecret: "fictional-forms-route-encryption-".repeat(2),
  };
  const store = {
    validateSession: vi.fn(async () => ({
      sessionId: ids.session,
      user: { id: ids.actor, email: address, role: "admin", is_active: true },
    })),
    csrf: vi.fn(async () => ({
      token_hash: tokenHash(csrf),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    })),
    memberships: vi.fn(async () => [
      { team_id: ids.team, team: { is_active: true } },
    ]),
    rateLimit: vi.fn(async () => ({ allowed: true })),
    audit: vi.fn(),
  };
  const single = new Map([
    ["forms", row],
    ["form_versions", published],
    [
      "form_response_drafts",
      {
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        created_at: new Date().toISOString(),
      },
    ],
  ]);
  const lists = new Map([
    ["form_versions", [published]],
    ["form_responses", []],
    ["form_answers", []],
    ["form_collaborators", []],
  ]);
  const results = new Map([
    ["can_operate_form", true],
    ["list_form_library", { items: [row], total: 1 }],
    ["list_form_library_options", { items: [], total: 0 }],
    ["create_form_from_template", row],
    ["mutate_form", row],
    ["mutate_form_library", row],
    [
      "inspect_form_library_write",
      { committed: false, canCreate: true, form: row },
    ],
    ["mutate_form_authoring", row],
    ["inspect_form_authoring_write", { committed: false, form: row }],
    ["mutate_form_collaborator", {}],
    ["form_receipt_ready", true],
    ["save_identified_form_draft", {}],
    [
      "edit_identified_form_response",
      { responseId: ids.response, revision: 1 },
    ],
    [
      "submit_identified_form_response",
      {
        responseId: ids.response,
        submittedAt: "2026-10-22T12:00:00Z",
        copyQueued: false,
      },
    ],
  ]);
  const queries = [];
  const db = {
    rpc: vi.fn(async (name, args) => {
      const value = results.get(name),
        result = typeof value === "function" ? value(args) : value;
      return result?.error
        ? { data: null, error: result.error }
        : { data: structuredClone(result), error: null };
    }),
    from: vi.fn((table) => {
      const query = { table, steps: [] };
      queries.push(query);
      const chain = {};
      for (const method of [
        "select",
        "eq",
        "is",
        "gt",
        "in",
        "order",
        "range",
        "ilike",
        "limit",
        "single",
        "maybeSingle",
      ])
        chain[method] = (...args) => {
          query.steps.push([method, ...args]);
          return chain;
        };
      chain.then = (resolve, reject) => {
        const individual = query.steps.some(([method]) =>
          ["single", "maybeSingle"].includes(method),
        );
        const source = individual ? single.get(table) : lists.get(table) || [];
        const supplied = typeof source === "function" ? source(query) : source;
        if (supplied?.error)
          return Promise.resolve({ data: null, error: supplied.error }).then(
            resolve,
            reject,
          );
        // Model explicit SELECT projection: a fake row must not conceal omitted columns.
        const selected = query.steps.find(
          ([method]) => method === "select",
        )?.[1];
        const project = (row) =>
          row == null || !selected || selected === "*"
            ? row
            : Object.fromEntries(
                selected
                  .split(",")
                  .filter((key) => Object.hasOwn(row, key))
                  .map((key) => [key, row[key]]),
              );
        const data = individual ? project(supplied) : supplied.map(project);
        return Promise.resolve({
          data: structuredClone(data),
          count: Array.isArray(supplied) ? supplied.length : 0,
          error: null,
        }).then(resolve, reject);
      };
      return chain;
    }),
  };
  const app = applicationHandler({ db, store, config });
  async function call(
    path = `/admin/forms/${ids.form}`,
    method = "GET",
    body,
    headers = {},
    socket = { remoteAddress: "127.0.0.1" },
  ) {
    const response = {
      statusCode: 200,
      headers: new Map(),
      setHeader(name, value) {
        this.headers.set(name.toLowerCase(), value);
      },
      end(value) {
        this.body = JSON.parse(value);
      },
    };
    await app(
      {
        url: "/api/v1" + path,
        method,
        body,
        headers: {
          origin: config.origin,
          cookie: `${config.sessionCookie}=${raw}`,
          "x-csrf-token": csrf,
          "idempotency-key": key,
          "content-type": "application/json",
          ...headers,
        },
        socket,
      },
      response,
    );
    return response;
  }
  const answers = { [definition.fields[0].id]: "Fictional answer" };
  const submission = {
    versionId: ids.version,
    answers,
    respondent: { name: "Fictional Respondent", email: address },
  };
  return {
    row,
    published,
    definition,
    single,
    lists,
    results,
    queries,
    store,
    db,
    config,
    call,
    key,
    answers,
    submission,
  };
}
export function withLocalMail() {
  vi.stubEnv("MAIL_MODE", "local");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54361");
  vi.stubEnv("FROM_EMAIL", "fictional-sender@example.test");
}

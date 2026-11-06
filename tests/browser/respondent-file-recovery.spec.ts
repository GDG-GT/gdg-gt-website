import { test, expect, accessibility } from "./public-fixture";
import { createTemplate, newField } from "../../shared/forms";
import type { Page } from "@playwright/test";
const slug = "fictional-upload-recovery",
  formId = "f1300000-0000-4000-8000-000000000011",
  versionId = "f1300000-0000-4000-8000-000000000012",
  fieldId = "f1300000-0000-4000-8000-000000000013",
  uploadId = "f1300000-0000-4000-8000-000000000014",
  bytes = Buffer.from("Fictional private upload. No real respondent data.");
async function setup(page: Page, loss: string) {
  const template = createTemplate("Fictional respondent upload form", "blank"),
    field = {
      ...newField("file", template.sections[0].id),
      id: fieldId,
      label: "Fictional private attachment",
      required: true,
      maxFiles: 1,
      allowedMime: ["text/plain"],
    };
  const state = {
    loss,
    accepted: false,
    stage: "pending",
    removed: false,
    preparations: 0,
    puts: 0,
    completes: 0,
    attempts: [] as { body: string; key: string | undefined }[],
    inspect: 0,
  };
  await page.route("**/api/v1/forms/" + slug, (route) =>
    route.fulfill({
      json: {
        data: {
          form: {
            ...template,
            id: formId,
            slug,
            versionId,
            version: 1,
            status: "Open",
            fields: [field],
            settings: { ...template.settings, review: false },
            respondentContext: { source: "self_reported" },
            copyAvailable: false,
          },
        },
      },
    }),
  );
  await page.route("https://storage.example.test/**", (route) => {
    if (route.request().method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "PUT,OPTIONS",
          "Access-Control-Allow-Headers": "content-type,x-amz-meta-sha256",
        },
      });
    state.puts++;
    expect(route.request().method()).toBe("PUT");
    expect(route.request().postDataBuffer()).toEqual(bytes);
    if (state.loss === "put") {
      state.loss = "";
      return route.abort("connectionfailed");
    }
    return route.fulfill({
      status: 200,
      body: "",
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.route("**/api/v1/forms/" + slug + "/uploads/**", (route) => {
    const r = route.request(),
      path = new URL(r.url()).pathname,
      body = r.postDataJSON(),
      reply = (value: unknown) => route.fulfill({ json: { data: value } }),
      record = () => ({
        uploadId,
        state: state.stage,
        scanState: state.stage === "clean" ? "clean" : "pending",
        filename: "fictional.txt",
        bytes: bytes.length,
      });
    if (path.endsWith("/prepare")) {
      state.attempts.push({
        body: JSON.stringify(body),
        key: r.headers()["idempotency-key"],
      });
      if (state.loss === "prepare-before") {
        state.loss = "";
        return route.abort("connectionfailed");
      }
      if (!state.accepted) {
        state.accepted = true;
        state.preparations++;
      }
      if (state.loss === "prepare-after") {
        state.loss = "";
        return route.abort("connectionfailed");
      }
      return reply({
        uploadId,
        state: state.stage,
        url: "https://storage.example.test/quarantine/fictional?signature=fictional",
        headers: {
          "Content-Type": body.mime,
          "x-amz-meta-sha256": body.sha256,
        },
      });
    }
    if (path.endsWith("/recovery")) {
      state.inspect++;
      expect(JSON.stringify(body)).toBe(state.attempts[0].body);
      expect(r.headers()["idempotency-key"]).toBe(state.attempts[0].key);
      return reply({
        committed: state.accepted,
        canRetry: !state.accepted,
        uploadId: state.accepted ? uploadId : null,
        state: state.accepted ? state.stage : null,
      });
    }
    if (path.endsWith("/complete")) {
      state.completes++;
      if (state.loss === "complete-before") {
        state.loss = "";
        return route.abort("connectionfailed");
      }
      state.stage = "clean";
      if (state.loss === "complete-after") {
        state.loss = "";
        return route.abort("connectionfailed");
      }
      return reply(record());
    }
    if (path.endsWith("/status"))
      return state.removed
        ? route.fulfill({
            status: 404,
            json: {
              error: {
                code: "UPLOAD_NOT_FOUND",
                message: "Fictional unavailable attachment",
              },
            },
          })
        : reply(record());
    if (path.endsWith("/remove")) {
      if (state.loss === "remove-before") {
        state.loss = "";
        return route.abort("connectionfailed");
      }
      state.removed = true;
      if (state.loss === "remove-after") {
        state.loss = "";
        return route.abort("connectionfailed");
      }
      return reply({ removed: true });
    }
    throw Error("Unexpected fictional upload route");
  });
  await page.goto("/forms/" + slug);
  await expect(
    page.getByRole("heading", { name: template.title, exact: true }),
  ).toBeVisible();
  return state;
}
async function upload(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "fictional.txt",
    mimeType: "text/plain",
    buffer: bytes,
  });
}
for (const loss of [
  "prepare-before",
  "prepare-after",
  "put",
  "complete-before",
  "complete-after",
])
  test(`respondent file recovers ${loss} without changing its file request or creating another intent`, async ({
    page,
    fixture,
  }, info) => {
    const state = await setup(page, loss);
    await upload(page);
    const region = page.getByRole("region", {
      name: "Unconfirmed file operation",
    });
    await expect(region).toBeVisible();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(
      region.getByRole("button", {
        name: "Continue original upload",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Submit response", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Save and resume later", exact: true }),
    ).toBeDisabled();
    if (loss === "complete-after") {
      expect(await accessibility(page)).toEqual([]);
      await page.screenshot({
        path: info.outputPath("respondent-file-unconfirmed.png"),
        fullPage: true,
        animations: "disabled",
      });
    }
    await region
      .getByRole("button", { name: "Check original file outcome", exact: true })
      .click();
    if (loss !== "complete-after")
      await region
        .getByRole("button", { name: "Continue original upload", exact: true })
        .click();
    await expect(region).toHaveCount(0);
    await expect(
      page.getByText("Ready for submission", { exact: true }),
    ).toBeVisible();
    expect(state.preparations).toBe(1);
    expect(
      state.attempts.every(
        (attempt) =>
          JSON.stringify(attempt) === JSON.stringify(state.attempts[0]),
      ),
    ).toBe(true);
    expect(state.inspect).toBe(1);
    expect(state.attempts).toHaveLength(loss === "complete-after" ? 1 : 2);
    expect(fixture.unexpected).toEqual([]);
    expect(await accessibility(page)).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
for (const loss of ["remove-before", "remove-after"])
  test(`respondent file ${loss} requires status reconciliation before a repeat removal`, async ({
    page,
    fixture,
  }) => {
    const state = await setup(page, "");
    await upload(page);
    await expect(
      page.getByText("Ready for submission", { exact: true }),
    ).toBeVisible();
    state.loss = loss;
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    const region = page.getByRole("region", {
      name: "Unconfirmed file operation",
    });
    await expect(
      region.getByRole("button", {
        name: "Retry removing this file",
        exact: true,
      }),
    ).toBeDisabled();
    await region
      .getByRole("button", { name: "Check removal status", exact: true })
      .click();
    if (loss === "remove-before")
      await region
        .getByRole("button", { name: "Retry removing this file", exact: true })
        .click();
    await expect(region).toHaveCount(0);
    await expect(
      page.getByText("Ready for submission", { exact: true }),
    ).toHaveCount(0);
    expect(state.removed).toBe(true);
    expect(state.preparations).toBe(1);
    expect(fixture.unexpected).toEqual([]);
    expect(await accessibility(page)).toEqual([]);
  });

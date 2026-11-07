import { captureSecondaryComposition as capture } from "./composition-capture";
import { test, expect, fictionalTeam } from "./public-fixture";

const actor = "fbbb0000-0000-4000-8000-000000000001";
const peer = "fbbf0000-0000-4000-8000-000000000011";
const taskId = "fbbf0000-0000-4000-8000-000000000012";
const threadId = "fbbf0000-0000-4000-8000-000000000013";
const at = "2026-11-05T12:00:00Z";
const task = {
  id: taskId,
  title: "Fictional accessible workshop checklist",
  description:
    "Review captions, keyboard access and the demo instructions together before the fictional workshop. Record the agreed next step in the task history.",
  team_id: fictionalTeam.id,
  assigned_to_id: actor,
  assigned_by_id: peer,
  assigneeName: "Fictional chapter reviewer",
  creatorName: "Fictional workshop lead",
  due_date: "2030-11-15",
  status: "in-progress",
  priority: "high",
  tags: ["accessibility", "workshop"],
  revision: 3,
  archived_at: null,
  updated_at: at,
  actions: ["read", "update", "assign", "delete", "status", "comment"],
  commentCount: 1,
};
const thread = {
  id: threadId,
  subject: "Fictional workshop handoff",
  revision: 1,
  created_at: at,
  updated_at: at,
  participant: true,
  participantA: actor,
  participantB: peer,
  nameA: "Fictional chapter reviewer",
  nameB: "Fictional workshop lead",
  archived: false,
  stateRevision: 1,
  unread: 1,
  canReply: true,
};
const states = [
  "task inventory",
  "task discussion",
  "task editor",
  "private conversation",
  "private message compose",
  "private review request",
] as const;

for (const state of states)
  test(`secondary ${state} keeps context and actions readable`, async ({
    page,
    fixture,
  }, info) => {
    fixture.authenticated = true;
    const writes: string[] = [],
      unexpected: string[] = [],
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/v1/**", (route) => {
      const request = route.request();
      const p = new URL(request.url()).pathname.replace("/api/v1", "");
      if (request.method() !== "GET") {
        if (["/auth/realtime-token", "/realtime/token"].includes(p))
          return route.fallback();
        writes.push(request.method() + " " + p);
        return route.fulfill({
          status: 403,
          json: { error: { code: "FORBIDDEN", message: "Read-only review" } },
        });
      }
      const reply = (data: unknown) => route.fulfill({ json: { data } });
      const tasks = "/admin/communications/tasks";
      const messages = "/admin/communications/messages";
      if (p === tasks) return reply({ items: [task], total: 1, pageSize: 30 });
      if (p === tasks + "/capabilities")
        return reply({
          personalCreate: true,
          globalCreate: true,
          actorId: actor,
          teams: [{ id: fictionalTeam.id, name: fictionalTeam.name }],
        });
      if (p === tasks + "/" + taskId) return reply({ record: task });
      if (p === tasks + "/" + taskId + "/comments")
        return reply({
          items: [
            {
              id: "fbbf0000-0000-4000-8000-000000000014",
              user_id: peer,
              authorName: "Fictional workshop lead",
              comment: "Fictional progress: captions are ready for review.",
              comment_type: "comment",
              revision: 1,
              deleted_at: null,
              created_at: at,
              updated_at: at,
              canEdit: false,
              canDelete: true,
            },
          ],
          nextCursor: null,
        });
      if (p === messages)
        return reply({
          items: [thread],
          total: 1,
          unread: 1,
          nextCursor: null,
          actorId: actor,
          canReview: true,
        });
      if (p === messages + "/review")
        return reply({ active: false, expiresAt: null });
      if (p === messages + "/" + threadId) return reply({ record: thread });
      if (p === messages + "/" + threadId + "/history")
        return reply({
          items: [
            {
              id: "fbbf0000-0000-4000-8000-000000000015",
              from_user_id: peer,
              authorName: "Fictional workshop lead",
              message: "Fictional handoff: the caption checklist is ready.",
              revision: 1,
              deleted_at: null,
              created_at: at,
              updated_at: at,
              read_at: null,
              replyToId: null,
              replyPreview: null,
              own: false,
            },
          ],
          nextCursor: null,
        });
      if (p.startsWith(tasks) || p.startsWith(messages)) {
        unexpected.push(p);
        return route.fulfill({
          status: 404,
          json: { error: { code: "NOT_FOUND" } },
        });
      }
      return route.fallback();
    });
    const taskState = state.startsWith("task");
    await page.goto(
      "/admin/communications?tab=" + (taskState ? "tasks" : "messages"),
    );
    if (taskState) {
      const open = page.getByRole("button", {
        name: "Open task " + task.title,
      });
      await expect(open).toBeVisible();
      if (state !== "task inventory") {
        await open.click();
        const discussion = page.getByRole("region", {
          name: "Task comments and history",
        });
        await expect(discussion).toContainText(
          "Fictional progress: captions are ready for review.",
        );
        await expect(
          page.getByRole("textbox", { name: /^Add a comment(?:\s|$)/ }),
        ).toBeVisible();
        if (state === "task editor") {
          await page
            .getByRole("button", { name: "Edit task", exact: true })
            .click();
          await expect(
            page.getByRole("textbox", { name: /^Task title(?:\s|$)/ }),
          ).toHaveValue(task.title);
          await expect(
            page.getByRole("heading", { name: "Edit task details" }),
          ).toBeVisible();
        }
      }
    } else {
      await expect(
        page.getByRole("region", { name: "Conversation inbox" }),
      ).toContainText(thread.subject);
      if (state === "private conversation") {
        await page
          .getByRole("button", { name: new RegExp(thread.subject) })
          .click();
        await expect(
          page.getByRole("region", { name: "Selected conversation" }),
        ).toContainText("Fictional handoff: the caption checklist is ready.");
        await expect(
          page.getByRole("textbox", { name: /^Your reply(?:\s|$)/ }),
        ).toBeVisible();
      } else if (state === "private message compose") {
        await page
          .getByRole("button", { name: "New message", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: "New private conversation" }),
        ).toBeVisible();
        await expect(
          page.getByRole("textbox", { name: /^Recipient email(?:\s|$)/ }),
        ).toHaveValue("");
      } else {
        await page.getByText("Super Admin review", { exact: true }).click();
        await page
          .getByRole("button", { name: "Request review", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: "Request five-minute review" }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Start audited review" }),
        ).toBeVisible();
      }
    }
    await capture(page, info, state);
    expect(writes).toEqual([]);
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.writes).toEqual([]);
  });

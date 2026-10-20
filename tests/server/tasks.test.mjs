import { describe, expect, it } from "vitest";
import {
  taskDate,
  taskCreate,
  taskMutation,
  taskComment,
  taskCommentMutation,
} from "../../shared/tasks.mjs";
describe("task and comment input boundaries", () => {
  it("validates actual date-only calendar values without timezone conversion", () => {
    for (const value of ["2028-02-29", "2026-10-20"])
      expect(taskDate.safeParse(value).success).toBe(true);
    for (const value of [
      "2026-02-29",
      "2026-02-30",
      "2026-13-01",
      "0000-01-01",
      "2026-10-20T00:00:00Z",
    ])
      expect(taskDate.safeParse(value).success).toBe(false);
  });
  it("creates pending tasks through safe defaults without accepting forged ownership or state", () => {
    expect(taskCreate.parse({ title: "Fictional task" })).toMatchObject({
      teamId: null,
      description: "",
      dueDate: null,
      priority: "medium",
      tags: [],
    });
    for (const change of [
      { assigned_by_id: "forged" },
      { status: "overdue" },
      { attachments: ["https://other.test/private"] },
      { teamId: "not-a-uuid" },
    ])
      expect(taskCreate.safeParse({ title: "Task", ...change }).success).toBe(
        false,
      );
  });
  it("limits tags and text and normalizes the requested assignee email", () => {
    expect(
      taskCreate.parse({
        title: "Task",
        assigneeEmail: "  Fictional@Example.test ",
      }).assigneeEmail,
    ).toBe("fictional@example.test");
    expect(
      taskCreate.safeParse({ title: "Task", tags: Array(13).fill("tag") })
        .success,
    ).toBe(false);
    expect(taskCreate.safeParse({ title: "Task\u0000" }).success).toBe(false);
  });
  it("requires positive revisions and leaves overdue transitions to the scheduler", () => {
    expect(
      taskMutation.safeParse({
        action: "status",
        revision: 1,
        status: "completed",
      }).success,
    ).toBe(true);
    expect(
      taskMutation.safeParse({
        action: "status",
        revision: 0,
        status: "pending",
      }).success,
    ).toBe(false);
    expect(
      taskMutation.safeParse({
        action: "status",
        revision: 1,
        status: "overdue",
      }).success,
    ).toBe(false);
  });
  it("separates private reassignment from ordinary edits and requires confirmation", () => {
    const body = {
      action: "assign",
      revision: 1,
      assigneeEmail: "fictional@example.test",
      currentPassword: "fixture",
      confirmation: "Fictional task",
    };
    expect(taskMutation.safeParse(body).success).toBe(true);
    expect(
      taskMutation.safeParse({ ...body, currentPassword: undefined }).success,
    ).toBe(false);
    expect(
      taskMutation.safeParse({ ...body, confirmation: undefined }).success,
    ).toBe(false);
  });
  it("comments are plaintext, bounded, revision-checked and cannot forge attribution", () => {
    expect(
      taskComment.parse({ comment: "Plain <script>text</script>" }).comment,
    ).toContain("<script>");
    expect(
      taskComment.safeParse({ comment: "", user_id: "forged" }).success,
    ).toBe(false);
    expect(
      taskCommentMutation.safeParse({
        action: "edit",
        revision: 1,
        comment: "Updated",
      }).success,
    ).toBe(true);
    expect(
      taskCommentMutation.safeParse({ action: "delete", revision: 0 }).success,
    ).toBe(false);
  });
});

import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { blogReference } from "../shared/blog.mjs";
const root = await localHttp(),
  db = root.db,
  accounts = [],
  owned = [],
  tests = [],
  suffix = randomUUID().slice(0, 8);
let admin, editor, other, member, teamId, postId, submissionId;
const base = "/admin/blog",
  record = {
    title: "Fictional editorial article " + suffix,
    slug: "fictional-editorial-" + suffix,
    content:
      "# Fictional writing\n\nSafe content.\n\n<script>unsafe-fictional()</script>\n\n![pixel](https://example.com/pixel.png)\n\n[unsafe](javascript:alert)",
    author_name: "Fictional contributor",
    author_email: "private-author-" + suffix + "@example.test",
    tags: ["Web"],
  };
function check(ok, name) {
  if (!ok) throw Error("FAIL " + name);
  tests.push({ name, passed: true });
  console.info("PASS", name);
}
function data(r) {
  if (r.status !== 200)
    throw Error(
      "Editorial request failed " + r.status + " " + r.json?.error?.code,
    );
  return r.json.data;
}
async function actor(role) {
  const h = await localHttp(),
    id = randomUUID(),
    email = "fictional-blog-" + id + "@example.test",
    password = "Fictional-editorial-" + randomUUID();
  const r = await db
    .from("admin_users")
    .insert({
      id,
      email,
      password_hash: await hashSecret(password),
      role,
      is_active: true,
      display_name: "Fictional editorial " + role,
    });
  if (r.error) throw Error("Editorial account fixture failed");
  accounts.push(id);
  data(
    await h.call("/auth/gate", {
      method: "POST",
      body: { code: root.credentials.gateCode },
    }),
  );
  data(
    await h.call("/auth/login", { method: "POST", body: { email, password } }),
  );
  return { ...h, id, password };
}
const post = (h, path, body, key = randomUUID(), method = "POST") =>
  h.call(path, { method, body, key });
const detail = async (kind, id, h = admin) =>
  data(await h.call(base + "/" + kind + "/" + id)).record;
async function create(
  kind,
  fields,
  h = admin,
  team = null,
  key = randomUUID(),
) {
  const r = data(
    await post(h, base + "/" + kind, { record: fields, teamId: team }, key),
  );
  if (!owned.some((x) => x.id === r.id)) owned.push({ kind, id: r.id });
  return r.id;
}
async function change(
  kind,
  id,
  action,
  extra = {},
  h = admin,
  key = randomUUID(),
) {
  const r = await detail(kind, id, h);
  return post(
    h,
    base + "/" + kind + "/" + id,
    {
      action,
      revision: r.revision,
      ...(!["update", "submit", "comment"].includes(action)
        ? { currentPassword: h.password, confirmation: r.reference }
        : {}),
      ...extra,
    },
    key,
  );
}
try {
  admin = await actor("admin");
  editor = await actor("blog_editor");
  other = await actor("blog_editor");
  member = await actor("team_member");
  teamId = randomUUID();
  for (const r of [
    await db
      .from("admin_teams")
      .insert({
        id: teamId,
        name: "Fictional editorial team " + suffix,
        slug: "fictional-editorial-" + teamId,
        created_by: admin.id,
      }),
    await db
      .from("team_memberships")
      .insert({ team_id: teamId, admin_user_id: member.id, role: "member" }),
    await db
      .from("team_page_access")
      .insert({ team_id: teamId, page_path: "/admin/blog", can_access: true }),
    await db
      .from("team_permissions")
      .insert({
        team_id: teamId,
        resource_type: "blog",
        permission: "crud",
        can_read: true,
        can_create: true,
        can_update: true,
        can_delete: true,
      }),
  ])
    if (r.error) throw Error("Editorial team fixture failed");
  check(
    (await editor.call(base + "/posts", { anonymous: true })).status === 401,
    "anonymous Blog inventory denied",
  );
  check(
    (
      await post(editor, base + "/posts", {
        teamId: null,
        record: { ...record, status: "published" },
      })
    ).status === 400,
    "editor cannot inject publishing state",
  );
  const createKey = randomUUID();
  postId = await create("posts", record, editor, null, createKey);
  check(
    (await create("posts", record, editor, null, createKey)) === postId,
    "editorial creation replays without duplication",
  );
  check(
    (
      await post(
        editor,
        base + "/posts",
        {
          teamId: null,
          record: { ...record, title: "Changed fictional title" },
        },
        createKey,
      )
    ).status === 409,
    "changed editorial payload conflicts with reused key",
  );
  let p = await detail("posts", postId, editor);
  check(
    p.status === "draft" &&
      p.approval_status === "pending" &&
      !!p.pending_changes,
    "editor article starts as an approval-required private draft",
  );
  check(
    !p.pending_changes.content.includes("<script") &&
      !p.pending_changes.content.includes("javascript:") &&
      !p.pending_changes.content.includes("example.com/pixel"),
    "write sanitization removes raw HTML unsafe links and remote-image loads",
  );
  const list = data(await editor.call(base + "/posts"));
  check(
    !("content" in list.items[0]) &&
      !("author_email" in list.items[0]) &&
      !("pending_changes" in list.items[0]),
    "article summary omits body private email and proposed changes",
  );
  check(
    (await other.call(base + "/posts/" + postId)).status === 404 &&
      data(await other.call(base + "/posts")).total === 0,
    "other editors cannot infer unassigned article details or totals",
  );
  check(
    (await change("posts", postId, "approve", {}, editor)).status === 403 &&
      (await change("posts", postId, "publish", {}, editor)).status === 403,
    "editor cannot approve or publish own article",
  );
  check(
    (await change("posts", postId, "publish")).status === 409,
    "publication requires approval of the current proposal",
  );
  data(await change("posts", postId, "approve"));
  data(await change("posts", postId, "publish"));
  p = await detail("posts", postId);
  check(
    p.status === "published" &&
      p.approval_status === "approved" &&
      !p.pending_changes,
    "administrator approval and internal publication preserve the explicit lifecycle",
  );
  const initialBody = p.content;
  const approvedFields = {
    ...record,
    content: "Fictional proposed replacement",
    title: p.title,
  };
  data(
    await change(
      "posts",
      postId,
      "update",
      { record: approvedFields, summary: "Fictional revision" },
      editor,
    ),
  );
  p = await detail("posts", postId);
  check(
    p.content === initialBody &&
      p.pending_changes.content === "Fictional proposed replacement" &&
      p.status === "published",
    "published base content survives an editor proposal unchanged",
  );
  check(
    (
      await post(admin, base + "/posts/" + postId, {
        action: "approve",
        revision: p.revision - 1,
        currentPassword: admin.password,
        confirmation: p.reference,
      })
    ).status === 409,
    "stale editorial approval cannot overwrite newer work",
  );
  data(
    await change("posts", postId, "reject", {
      reason: "Fictional revision feedback",
    }),
  );
  check(
    (await detail("posts", postId)).content === initialBody &&
      !!(await detail("posts", postId)).pending_changes,
    "rejection preserves both retained base and proposal",
  );
  data(
    await change(
      "posts",
      postId,
      "submit",
      { summary: "Fictional resubmission" },
      editor,
    ),
  );
  data(await change("posts", postId, "approve"));
  check(
    (await detail("posts", postId)).content ===
      "Fictional proposed replacement",
    "reviewed proposal becomes the retained base version",
  );
  const categoryId = await create("categories", {
    name: "Fictional category " + suffix,
    slug: "fictional-category-" + suffix,
  });
  check(
    (
      await post(editor, base + "/categories", {
        teamId: null,
        record: {
          name: "Forged editor category",
          slug: "forged-editor-" + suffix,
        },
      })
    ).status === 403,
    "editors cannot administer chapter taxonomy",
  );
  data(await change("categories", categoryId, "archive"));
  data(await change("categories", categoryId, "restore"));
  check(
    !(await detail("categories", categoryId)).is_active,
    "category recovery does not silently reactivate taxonomy",
  );
  const scoped = await create(
    "posts",
    { ...record, slug: "fictional-team-article-" + suffix },
    member,
    teamId,
  );
  check(
    data(await member.call(base + "/posts")).items.some(
      (x) => x.id === scoped,
    ) &&
      !data(await member.call(base + "/posts")).items.some(
        (x) => x.id === postId,
      ),
    "team grant scopes editorial lists and totals",
  );
  const assigned = await create(
    "posts",
    { ...record, slug: "fictional-assigned-article-" + suffix },
    admin,
    teamId,
  );
  data(await change("posts", assigned, "assign", { editorId: editor.id }));
  check(
    (await editor.call(base + "/posts/" + assigned)).status === 200,
    "explicit assignment grants only the assigned editorial record",
  );
  data(await change("posts", assigned, "assign", { editorId: other.id }));
  check(
    (await editor.call(base + "/posts/" + assigned)).status === 404,
    "editorial reassignment immediately revokes former assignee",
  );
  const sub = await db
    .from("blog_submissions")
    .insert({
      file_path: "fictional-unverified/" + randomUUID() + ".pdf",
      original_name: "fictional-editorial-" + suffix + ".pdf",
      submitter_name: "Fictional submitter",
      submitter_email: "private-submitter-" + suffix + "@example.test",
      file_size: 100,
      mime_type: "application/pdf",
      assigned_editor_id: editor.id,
      admin_notes: "Private fictional administrator note",
    })
    .select("id")
    .single();
  if (sub.error) throw Error("Submission metadata fixture failed");
  submissionId = sub.data.id;
  owned.push({ kind: "submissions", id: submissionId });
  data(
    await change("submissions", submissionId, "comment", {
      comment: "Fictional internal note",
      type: "internal",
    }),
  );
  data(
    await change(
      "submissions",
      submissionId,
      "comment",
      { comment: "Fictional visible feedback", type: "feedback" },
      editor,
    ),
  );
  const subDetail = data(
    await editor.call(base + "/submissions/" + submissionId),
  );
  check(
    subDetail.discussionTotal === 1 &&
      subDetail.discussion[0].type === "feedback" &&
      !("admin_notes" in subDetail.record) &&
      !("submitter_email" in subDetail.record) &&
      !("file_path" in subDetail.record),
    "assigned submission view excludes administrator-only thread notes contact and storage path",
  );
  check(
    (
      await change(
        "submissions",
        submissionId,
        "comment",
        { comment: "Forged internal note", type: "internal" },
        editor,
      )
    ).status === 403,
    "editors cannot create administrator-only discussion",
  );
  check(
    (await other.call(base + "/submissions/" + submissionId)).status === 404,
    "unassigned submission access is denied",
  );
  check(
    (await editor.call(base + "/submissions/" + submissionId + "/download"))
      .status === 404,
    "unverified legacy submission has no download bypass",
  );
  data(
    await change("submissions", submissionId, "review", {
      status: "reviewed",
      notes: "Fictional retained review",
    }),
  );
  check(
    (await detail("submissions", submissionId)).status === "reviewed",
    "administrator submission review persists with revision",
  );
  const comment = await db
    .from("blog_comments")
    .insert({
      post_id: postId,
      author_name: "Fictional commenter",
      author_email: "private-commenter-" + suffix + "@example.test",
      content: "Retained fictional comment",
    })
    .select("id")
    .single();
  if (comment.error) throw Error("Comment fixture failed");
  owned.push({ kind: "comments", id: comment.data.id });
  check(
    !("author_email" in (await detail("comments", comment.data.id, editor))),
    "editor comment DTO omits private contact",
  );
  check(
    (await change("comments", comment.data.id, "approve", {}, editor))
      .status === 403,
    "editor cannot moderate retained comments",
  );
  data(await change("comments", comment.data.id, "flag"));
  data(await change("comments", comment.data.id, "approve"));
  check(
    (await detail("comments", comment.data.id)).is_approved &&
      (await detail("comments", comment.data.id)).is_flagged,
    "administrator comment moderation preserves separate approval and flag states",
  );
  const like = await db
    .from("blog_likes")
    .insert({
      post_id: postId,
      user_identifier: "fictional-private-voter-" + suffix,
    });
  if (like.error) throw Error("Like fixture failed");
  p = await detail("posts", postId, editor);
  check(
    p.actualLikes === "1" &&
      !JSON.stringify(p).includes("fictional-private-voter"),
    "editor analytics count retained likes without exposing identifiers",
  );
  check(
    data(await editor.call(base + "/posts/" + postId)).versionTotal >= 7,
    "editorial revisions are retained separately from audit metadata",
  );
  if (process.argv.includes("--hold-for-browser")) {
    if (!process.stdin.isTTY) throw Error("Browser review needs a terminal");
    console.info(
      "BROWSER_ARTICLE http://127.0.0.1:8080/admin/blog?record=" + postId,
    );
    console.info(
      "BROWSER_SUBMISSION " + submissionId + "; type change or done.",
    );
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    for await (const line of rl) {
      if (line.trim() === "done") {
        rl.close();
        break;
      }
      if (line.trim() === "change") {
        data(
          await change("posts", postId, "update", {
            record: {
              ...record,
              content: "Independent fictional editorial update",
            },
            summary: "Independent browser conflict fixture",
          }),
        );
        check(
          true,
          "independent editorial change delivered during browser review",
        );
      }
    }
  }
  const team = await db
    .from("admin_teams")
    .select("revision")
    .eq("id", teamId)
    .single();
  if (team.error) throw Error("Team fixture unavailable");
  let update = await db
    .from("admin_teams")
    .update({ is_active: false, revision: team.data.revision + 1 })
    .eq("id", teamId);
  if (update.error) throw Error("Team fixture transition failed");
  check(
    (await member.call(base + "/posts/" + scoped)).status === 404 &&
      (await other.call(base + "/posts/" + assigned)).status === 404,
    "team archival revokes team and assigned-editor private access",
  );
  update = await db
    .from("admin_teams")
    .update({ is_active: true, revision: team.data.revision + 2 })
    .eq("id", teamId);
  if (update.error) throw Error("Team fixture restore failed");
  data(await change("posts", postId, "archive"));
  check(
    data(await editor.call(base + "/posts?state=trash")).items.some(
      (x) => x.id === postId,
    ),
    "soft archival retains scoped article history",
  );
  data(await change("posts", postId, "restore"));
  check(
    (await detail("posts", postId)).status === "draft",
    "article restore never republishes",
  );
  const revocation = await db
    .from("admin_users")
    .update({ is_active: false })
    .eq("id", editor.id);
  if (revocation.error) throw Error("Editor fixture revocation failed");
  check(
    (await editor.call(base + "/posts/" + postId)).status === 401,
    "editor deactivation revokes the next private request",
  );
} finally {
  if (teamId) {
    const t = await db
      .from("admin_teams")
      .select("revision,is_active")
      .eq("id", teamId)
      .maybeSingle();
    if (t.data && !t.data.is_active) {
      const r = await db
        .from("admin_teams")
        .update({ is_active: true, revision: t.data.revision + 1 })
        .eq("id", teamId);
      if (r.error) throw Error("Fixture team recovery failed");
    }
  }
  if (admin)
    for (const item of owned) {
      const r = await admin.call(base + "/" + item.kind + "/" + item.id);
      if (r.status === 200 && !r.json.data.record.deleted_at)
        data(await change(item.kind, item.id, "archive"));
    }
  if (teamId) {
    const t = await db
      .from("admin_teams")
      .select("revision")
      .eq("id", teamId)
      .single();
    if (t.error) throw Error("Fixture team missing");
    const r = await db
      .from("admin_teams")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        revision: t.data.revision + 1,
      })
      .eq("id", teamId);
    if (r.error) throw Error("Fixture team archive failed");
  }
  if (accounts.length) {
    for (const r of [
      await db
        .from("admin_users")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .in("id", accounts),
      await db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .in("admin_user_id", accounts)
        .is("revoked_at", null),
    ])
      if (r.error) throw Error("Fictional editorial account retention failed");
  }
}
await writeFile(
  new URL("../.docs/phase0/local-blog-integration.json", import.meta.url),
  JSON.stringify(
    {
      note: "Actual loopback private-editorial workflows with fictional isolated accounts, team, writing, unverified submission metadata, comments and likes. Exact fixtures recoverably archived. No real file uploaded, public Blog, external provider or email.",
      tests,
    },
    null,
    2,
  ) + "\n",
);

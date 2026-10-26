import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { localHttp } from "./lib/local-http.mjs";
// Controlled read-path fixtures, not evidence that admin publication was tested.
const { db, call } = await localHttp(),
  suffix = randomUUID().slice(0, 8),
  prefix = "Fictional public " + suffix,
  tag = "fictional-" + suffix,
  owned = [],
  tests = [];
const check = (ok, name) => {
  if (!ok) throw Error("FAIL " + name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
const checked = (result) => {
  if (result.error) throw Error("Fixture database: " + result.error.code);
  return result.data;
};
const read = async (path) => {
  const r = await call(path, { anonymous: true });
  if (r.status !== 200) throw Error("Public read failed: " + r.status);
  return r.json.data;
};
async function seed(table, rows) {
  checked(await db.from(table).insert(rows));
  owned.push({ table, ids: rows.map((row) => row.id) });
}
try {
  const resources = Array.from({ length: 101 }, (_, index) => ({
    id: randomUUID(),
    title: `${prefix} resource ${String(index).padStart(3, "0")}`,
    description: "Fictional local pagination fixture; not chapter content.",
    type: index % 2 ? "documentation" : "study_jam",
    level: "Beginner",
    status: index % 3 ? "Available" : "Coming Soon",
    url: "https://developers.google.com/",
    tags: [tag],
    is_active: true,
    order_index: index,
  }));
  await seed("resources", resources);
  await seed(
    "team_members",
    Array.from({ length: 25 }, (_, index) => ({
      id: randomUUID(),
      name: `${prefix} person ${index}`,
      role: "Fictional reviewer",
      team_section: "Fictional verification",
      is_active: true,
      order_index: index,
    })),
  );
  await seed(
    "sponsors",
    Array.from({ length: 25 }, (_, index) => ({
      id: randomUUID(),
      name: `${prefix} partner ${index}`,
      logo_url: "/assets/event-workshop.jpg",
      tier: index % 2 ? "gold" : "bronze",
      is_active: true,
      order_index: index,
    })),
  );
  await seed(
    "sponsor_impact_stats",
    Array.from({ length: 13 }, (_, index) => ({
      id: randomUUID(),
      stat_label: `${prefix} impact ${index}`,
      stat_value: "Test only",
      stat_description:
        "Fictional test data; never a verified organization figure.",
      is_active: true,
      order_index: index,
    })),
  );
  const q = encodeURIComponent(prefix),
    first = await read(`/resources?q=${q}&pageSize=12`),
    last = await read(`/resources?q=${q}&pageSize=12&page=9`);
  check(
    first.total === 101 && first.items.length === 12 && last.items.length === 5,
    "resource pagination reaches records beyond the previous 100-item cap",
  );
  const filtered = await read(
    `/resources?q=${q}&tag=${tag}&type=study_jam&level=Beginner&status=Coming%20Soon`,
  );
  check(
    filtered.total === 17 &&
      filtered.items.every(
        (r) => r.type === "study_jam" && r.status === "Coming Soon",
      ),
    "combined tag/type/level/status filters apply before total and pagination",
  );
  check(
    (await read(`/resources?q=${q}&tag=not-${tag}`)).total === 0,
    "unmatched exact tag produces an actual filtered empty state",
  );
  const team1 = await read(`/team?q=${q}&pageSize=24`),
    team2 = await read(`/team?q=${q}&pageSize=24&page=2`);
  check(
    team1.total === 25 && team1.items.length === 24 && team2.items.length === 1,
    "public team paging retains every approved profile",
  );
  check(
    !JSON.stringify(team1).includes("email") &&
      !JSON.stringify(team1).includes("created_by"),
    "public profiles omit private identity and authorship fields",
  );
  const sponsors = await read(`/sponsors?q=${q}&pageSize=24`),
    sponsors2 = await read(`/sponsors?q=${q}&pageSize=24&page=2`);
  check(
    sponsors.total === 25 &&
      sponsors.items.length === 24 &&
      sponsors2.items.length === 1,
    "tier-ordered sponsor inventory pages without lost or duplicated records",
  );
  check(
    new Set([...sponsors.items, ...sponsors2.items].map((row) => row.id))
      .size === 25,
    "sponsor pagination has stable unique identity across pages",
  );
  const impact = await read(`/sponsor-stats?q=${q}&pageSize=12&page=2`);
  check(
    impact.total === 13 && impact.items.length === 1,
    "impact inventory is independent of the four-metric homepage cap",
  );
  const sample = resources[0];
  check(
    (
      await call(`/resources/${sample.id}/view`, {
        method: "POST",
        anonymous: true,
      })
    ).status === 204,
    "resource navigation uses the dedicated no-content view action",
  );
  await call(`/resources/${sample.id}/view`, {
    method: "POST",
    anonymous: true,
  });
  const row = checked(
    await db.from("resources").select("views").eq("id", sample.id).single(),
  );
  check(
    row.views === 1,
    "rapid repeated view actions cannot mutate an arbitrary counter",
  );
  const archived = {};
  for (const table of ["team_members", "sponsors"]) {
    archived[table] = owned.find((entry) => entry.table === table).ids[0];
    checked(
      await db
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", archived[table]),
    );
  }
  const home = await read("/public/home");
  check(
    home.sponsors.length <= 12 &&
      home.sponsors.some((partner) =>
        owned
          .find((entry) => entry.table === "sponsors")
          .ids.includes(partner.id),
      ),
    "homepage acknowledges a bounded selection of active approved partners",
  );
  check(
    !home.team.some((person) => person.id === archived.team_members) &&
      !home.sponsors.some((partner) => partner.id === archived.sponsors),
    "archived team and sponsor rows cannot reappear in homepage selections",
  );
  check(
    !JSON.stringify({ team: home.team, sponsors: home.sponsors }).includes(
      "deleted_at",
    ) &&
      !JSON.stringify({ team: home.team, sponsors: home.sponsors }).includes(
        "created_by",
      ),
    "homepage partner and team selections omit private lifecycle metadata",
  );
  await writeFile(
    new URL("../.docs/phase0/local-public-collections.json", import.meta.url),
    JSON.stringify(
      {
        note: "Actual loopback public HTTP/PostgreSQL read-path verification with invocation-owned fictional fixtures. Does not certify admin publication, hosted cache, accessibility or full PRD acceptance.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
  if (process.argv.includes("--hold-for-browser")) {
    console.info(
      "Browser resource URL: http://127.0.0.1:8080/resources?q=" +
        encodeURIComponent(prefix),
    );
    console.info("Exact fixture tag: " + tag);
    console.info(
      "Type done to recoverably archive only this invocation's fictional fixtures.",
    );
    const input = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    for await (const line of input)
      if (line.trim() === "done") {
        input.close();
        break;
      }
  }
} finally {
  for (const { table, ids } of owned)
    checked(
      await db
        .from(table)
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .in("id", ids),
    );
  console.info(
    "Recoverably archived this invocation's fictional public fixtures; unrelated records untouched.",
  );
}

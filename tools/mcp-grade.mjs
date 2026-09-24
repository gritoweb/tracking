#!/usr/bin/env node
// Live grader for every MCP tool: static rubric (description/fields/annotations/visibility)
// plus one real call per tool against a running dev server. Reusable — see CLAUDE.md "Commands".
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const NOISE_KEYS = ["workspaceId", "userImage", "boardOrder", "sortOrder"];
const MIN_DESC_LEN = 60;
const PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function parseArgs(argv) {
  const args = { url: "http://localhost:5173/mcp" };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    args[name] = argv[++i];
  }
  return args;
}

/** Tests write data: only ever against a local dev server, never production. */
function assertLocal(url) {
  const host = new URL(url).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") throw new Error(`Refusing to run against ${host}: this grader writes data and only targets a local dev server.`);
}

async function makeClient(label, url, keyFile) {
  const key = readFileSync(keyFile, "utf8").trim();
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
  });
  const client = new Client({ name: `mcp-grade-${label}`, version: "1.0.0" });
  await client.connect(transport);
  return client;
}

function resultText(raw) {
  return (raw.content ?? []).map((c) => c.text ?? "").join("\n");
}

function resultData(raw) {
  try {
    return JSON.parse(resultText(raw));
  } catch {
    return null;
  }
}

/** One recorded tool invocation, scored against what the scenario expected. */
function recordCall(stats, name, expect, raw) {
  const entry = stats.get(name);
  if (!entry) throw new Error(`Scenario called undeclared tool "${name}"`);
  const matched = expect === "refuse" ? raw.isError === true : raw.isError !== true;
  const text = resultText(raw);
  const noise = NOISE_KEYS.some((k) => text.includes(k));
  entry.calls.push({ expect, matched, noise, error: raw.isError ? text : null });
}

async function call(client, stats, name, args, expect = "ok") {
  if (!client) {
    console.log(`  - SKIP ${name} (no key for this role)`);
    return { raw: null, data: null };
  }
  const raw = await client.callTool({ name, arguments: args });
  recordCall(stats, name, expect, raw);
  const ok = expect === "refuse" ? raw.isError === true : raw.isError !== true;
  const shape = Array.isArray(args.items) ? ` [items: ${args.items.length}]` : "";
  console.log(`  ${ok ? "✔" : "✘"} ${name}${shape}${expect === "refuse" ? " (expects refusal)" : ""} → ${resultText(raw).replace(/\s+/g, " ").slice(0, 110)}`);
  return { raw, data: resultData(raw) };
}

/** A condition the scenario checks on the data itself, logged like a call. */
function check(stats, label, pass, detail = "") {
  stats.checks.push({ label, pass });
  console.log(`  ${pass ? "✔" : "✘"} CHECK ${label}${detail ? ` → ${detail}` : ""}`);
}

function scoreDescription(tool) {
  return typeof tool.description === "string" && tool.description.length >= MIN_DESC_LEN ? 2 : 0;
}

function scoreFields(tool) {
  const props = tool.inputSchema?.properties ?? {};
  for (const [, schema] of Object.entries(props)) {
    if (typeof schema?.description !== "string" || schema.description.length === 0) return 0;
  }
  return 2;
}

function scoreAnnotations(tool) {
  const a = tool.annotations ?? {};
  if (typeof a.readOnlyHint !== "boolean") return 0;
  if (a.openWorldHint !== false) return 0;
  if (/^(delete_|archive_)/.test(tool.name) && a.destructiveHint !== true) return 0;
  return 1;
}

function scoreLive(entry) {
  return entry.calls.length > 0 && entry.calls.every((c) => c.matched) ? 3 : 0;
}

function scoreCompact(entry) {
  return entry.calls.length > 0 && entry.calls.every((c) => !c.noise) ? 1 : 0;
}

function scoreVisibility(tool, readNames, rwNames) {
  const isRead = tool.annotations?.readOnlyHint === true;
  const ok = isRead
    ? readNames.has(tool.name) && rwNames.has(tool.name)
    : !readNames.has(tool.name) && rwNames.has(tool.name);
  return ok ? 1 : 0;
}

async function runScenario(owner, member, stats) {
  const state = {};
  const ts = Date.now();
  state.today = new Date().toISOString().slice(0, 10);

  // ── catalog ─────────────────────────────────────────────────────────────
  await call(owner, stats, "list_projects", {});
  await call(owner, stats, "list_clients", {});
  await call(owner, stats, "list_tags", {});
  await call(owner, stats, "get_project_pacing", {});
  {
    const { data } = await call(owner, stats, "whoami", {});
    state.ownerUserId = data.userId;
  }
  {
    const { data } = await call(owner, stats, "list_members", {});
    state.memberUserId = data.find((m) => m.role === "member")?.userId ?? null;
  }
  await call(owner, stats, "list_api_keys", {});
  {
    const { data } = await call(owner, stats, "create_client", { name: `MCP Grader Client ${ts}` });
    state.clientId = data.id;
  }
  await call(owner, stats, "update_client", { clientId: state.clientId, notes: "Grader-managed client" });
  {
    const { data } = await call(owner, stats, "create_project", {
      name: `MCP Grader Project ${ts}`,
      clientId: state.clientId,
      billable: true,
    });
    state.projectId = data.id;
  }
  await call(owner, stats, "update_project", { projectId: state.projectId, rate: 100 });
  {
    const { data } = await call(owner, stats, "create_tag", { name: `mcp-grader-${ts}` });
    state.tagId = data.id;
    state.tagName = data.name;
  }
  await call(owner, stats, "update_tag", { tagId: state.tagId, color: "#336699" });

  // ── entries (a far-past week so demo data stays untouched) ────────────────
  {
    const { data } = await call(owner, stats, "log_time", {
      description: "MCP grader entry",
      start: "2025-01-06T09:00:00-03:00",
      stop: "2025-01-06T10:00:00-03:00",
      projectId: state.projectId,
      tags: [state.tagName],
    });
    state.entryId = data.id;
  }
  await call(owner, stats, "get_time_entry", { entryId: state.entryId });
  await call(owner, stats, "update_time_entry", { entryId: state.entryId, description: "MCP grader entry (edited)" });
  {
    // Several entries in one call, edited and deleted in one call each: one approval instead of one per entry.
    const { data } = await call(owner, stats, "log_time", {
      items: [
        { description: "MCP grader batch A", start: "2025-01-08T09:00:00-03:00", stop: "2025-01-08T09:30:00-03:00", projectId: state.projectId },
        { description: "MCP grader batch B", start: "2025-01-08T10:00:00-03:00", stop: "2025-01-08T10:30:00-03:00", projectId: state.projectId },
      ],
    });
    check(stats, "log_time items created 2 entries", data?.done === 2, `done=${data?.done}`);
    const ids = (data?.results ?? []).map((e) => e.id);
    const edited = await call(owner, stats, "update_time_entry", { items: ids.map((entryId) => ({ entryId, billable: false })) });
    check(stats, "update_time_entry items edited 2 entries", edited.data?.done === 2, `done=${edited.data?.done}`);
    await call(owner, stats, "delete_time_entry", { items: ids.map((entryId) => ({ entryId })) });
    const left = await call(owner, stats, "list_time_entries", { since: "2025-01-08", until: "2025-01-08", timezoneOffsetMinutes: 180 });
    const remaining = JSON.stringify(left.data ?? "").includes("MCP grader batch");
    check(stats, "delete_time_entry items removed both entries", !remaining);
  }
  await call(owner, stats, "list_time_entries", { since: "2025-01-06", until: "2025-01-06" });
  await call(owner, stats, "get_time_summary", { since: "2025-01-06", until: "2025-01-06" });
  await call(owner, stats, "run_report", { kind: "summary", since: "2025-01-06", until: "2025-01-06" });
  {
    const { data } = await call(owner, stats, "copy_week", {
      sourceWeekStart: "2025-01-06",
      targetWeekStart: "2025-01-13",
      timezoneOffsetMinutes: 180,
    });
    for (const entry of data.entries) {
      await call(owner, stats, "delete_time_entry", { entryId: entry.id });
    }
  }
  await call(owner, stats, "draft_day", { date: "2025-01-07", timezoneOffsetMinutes: 180 });
  await call(owner, stats, "list_drafts", { date: "2025-01-07" });
  await call(owner, stats, "get_running_timer", {});
  await call(owner, stats, "delete_time_entry", { entryId: state.entryId });

  // ── tasks ───────────────────────────────────────────────────────────────
  {
    const { data } = await call(owner, stats, "list_task_statuses", {});
    state.statuses = data;
    state.defaultStatusId = data.find((s) => s.isDefault)?.id ?? data[0].id;
    state.otherStatusId = data.find((s) => !s.isDefault && s.category !== "completed")?.id ?? data[0].id;
  }
  {
    const { data } = await call(owner, stats, "create_task", {
      name: `MCP Grader Task ${ts}`,
      projectId: state.projectId,
      dueDate: state.today,
    });
    state.taskId = data.id;
  }
  // The owner on purpose: the local seed gives them two `member` rows, which crashed setAssignees before currentMemberIds deduplicated.
  await call(owner, stats, "update_task", {
    taskId: state.taskId,
    priority: 1,
    assigneeIds: [state.ownerUserId, ...(state.memberUserId ? [state.memberUserId] : [])],
  });
  {
    const { data } = await call(owner, stats, "get_task", { taskId: state.taskId });
    check(stats, "update_task set priority and the assignee", data?.priority === 1 && (data?.assignees ?? []).some((a) => a.userId === state.ownerUserId));
  }
  await call(owner, stats, "list_tasks", { assignee: "me", dueBy: state.today });
  {
    const { data } = await call(owner, stats, "list_tasks", { projectId: state.projectId });
    check(stats, "list_tasks with no date returns the task, linked", Array.isArray(data) && data.some((t) => t.id === state.taskId && t.url));
  }
  await call(owner, stats, "move_task", { taskId: state.taskId, statusId: state.otherStatusId });
  {
    // Board rules through the MCP: a parent closed with move_task takes its subtask along; reopening brings it back.
    const closedId = state.statuses.find((s) => s.category === "completed").id;
    const { data: parent } = await call(owner, stats, "create_task", { name: `MCP Grader Parent ${ts}`, projectId: state.projectId });
    const { data: kid } = await call(owner, stats, "create_task", { name: `MCP Grader Kid ${ts}`, projectId: state.projectId, parentId: parent.id });
    await call(owner, stats, "move_task", { taskId: parent.id, statusId: closedId });
    const closedKid = (await call(owner, stats, "get_task", { taskId: kid.id })).data;
    check(stats, "move_task closing a parent closes its subtask", closedKid?.done === true, `kid status=${closedKid?.status?.name}`);
    await call(owner, stats, "move_task", { taskId: parent.id, statusId: state.otherStatusId });
    const reopenedKid = (await call(owner, stats, "get_task", { taskId: kid.id })).data;
    check(stats, "move_task reopening a parent reopens its subtask", reopenedKid?.done === false);
    const { data: history } = await call(owner, stats, "list_task_activity", { taskId: parent.id });
    check(stats, "list_task_activity recorded both moves", Array.isArray(history) && history.filter((h) => h.change === "status").length >= 2, `${history?.length} lines`);

    // A repeating task closed with completedOn schedules its next occurrence.
    const { data: daily } = await call(owner, stats, "create_task", { name: `MCP Grader Daily ${ts}`, projectId: state.projectId, recurRule: "daily", dueDate: "2025-01-06" });
    await call(owner, stats, "move_task", { taskId: daily.id, statusId: closedId, completedOn: "2025-01-06" });
    const { data: list } = await call(owner, stats, "list_tasks", { projectId: state.projectId });
    const next = (list ?? []).find((t) => t.name === daily.name && t.id !== daily.id);
    check(stats, "move_task with completedOn spawned the next occurrence", next?.dueDate === "2025-01-07", `next due=${next?.dueDate}`);

    // Several tasks created, edited, moved and deleted, one call each.
    const { data: made } = await call(owner, stats, "create_task", {
      items: [
        { name: `MCP Grader Batch 1 ${ts}`, projectId: state.projectId },
        { name: `MCP Grader Batch 2 ${ts}`, projectId: state.projectId },
        { name: `MCP Grader Batch 3 ${ts}`, projectId: state.projectId },
      ],
    });
    check(stats, "create_task items created 3 tasks", made?.done === 3, `done=${made?.done}`);
    const batchIds = (made?.results ?? []).map((t) => t.id);
    const assigned = await call(owner, stats, "update_task", { items: batchIds.map((taskId) => ({ taskId, assigneeIds: [state.ownerUserId] })) });
    check(stats, "update_task items assigned 3 tasks", assigned.data?.done === 3);
    const moved = await call(owner, stats, "move_task", { items: batchIds.map((taskId) => ({ taskId, statusId: state.otherStatusId })) });
    check(stats, "move_task items moved 3 tasks", moved.data?.done === 3);
    await call(owner, stats, "delete_task", { items: [...batchIds, parent.id, daily.id, ...(next ? [next.id] : [])].map((taskId) => ({ taskId })) });
  }
  {
    const { data } = await call(owner, stats, "fork_task_statuses", { projectId: state.projectId });
    check(stats, "fork_task_statuses gave the project its own columns", Array.isArray(data) && data.length > 0 && data.every((s) => s.projectId === state.projectId));
  }
  {
    const { data } = await call(owner, stats, "add_task_comment", { taskId: state.taskId, body: "Owner comment from the grader" });
    state.ownerCommentId = data.id;
  }
  await call(owner, stats, "edit_task_comment", { taskId: state.taskId, commentId: state.ownerCommentId, body: "Owner comment (edited)" });
  await call(owner, stats, "list_task_comments", { taskId: state.taskId });
  {
    const { data } = await call(member, stats, "add_task_comment", {
      taskId: state.taskId,
      body: "Member comment mentioning the owner",
      mentionedUserIds: [state.ownerUserId],
    });
    state.memberCommentId = data?.id;
  }
  await call(member, stats, "delete_task_comment", { taskId: state.taskId, commentId: state.memberCommentId });
  await call(owner, stats, "delete_task_comment", { taskId: state.taskId, commentId: state.ownerCommentId });
  {
    const { data } = await call(owner, stats, "upload_task_attachment", {
      taskId: state.taskId,
      filename: "pixel.png",
      contentBase64: PIXEL_PNG_BASE64,
    });
    state.attachmentId = data.id;
  }
  await call(owner, stats, "list_task_attachments", { taskId: state.taskId });
  await call(owner, stats, "delete_task_attachment", { attachmentId: state.attachmentId });
  {
    const { data } = await call(owner, stats, "create_task_status", {
      name: `MCP Grader Status ${ts}`,
      category: "not_started",
    });
    state.newStatusId = data.id;
  }
  await call(owner, stats, "update_task_status", { statusId: state.newStatusId, name: `MCP Grader Status ${ts} (renamed)` });
  await call(owner, stats, "archive_task_status", { statusId: state.newStatusId, moveTo: state.defaultStatusId });
  await call(member, stats, "delete_task", { taskId: state.taskId }, "refuse");
  await call(owner, stats, "delete_task", { taskId: state.taskId });

  // ── productivity ────────────────────────────────────────────────────────
  {
    const { data } = await call(owner, stats, "create_favorite", {
      description: `MCP Grader Favorite ${ts}`,
      projectId: state.projectId,
    });
    state.favoriteId = data.id;
  }
  await call(owner, stats, "list_favorites", {});
  await call(owner, stats, "delete_favorite", { favoriteId: state.favoriteId });
  {
    const { data } = await call(owner, stats, "create_recurring", {
      description: `MCP Grader Recurring ${ts}`,
      projectId: state.projectId,
      durationMinutes: 30,
      localDays: [1],
      localTime: "09:00",
      timezoneOffsetMinutes: 180,
    });
    state.recurringId = data.id;
  }
  await call(owner, stats, "update_recurring", { recurringId: state.recurringId, active: false });
  await call(owner, stats, "list_recurring", {});
  await call(owner, stats, "delete_recurring", { recurringId: state.recurringId });
  {
    const { data } = await call(owner, stats, "create_saved_report", {
      name: `MCP Grader Report ${ts}`,
      config: { since: "2025-01-06", until: "2025-01-06" },
    });
    state.savedReportId = data.id;
  }
  await call(owner, stats, "list_saved_reports", {});
  await call(owner, stats, "delete_saved_report", { reportId: state.savedReportId });
  await call(owner, stats, "set_planner_hours", { projectId: state.projectId, date: state.today, plannedSeconds: 3600 });
  await call(owner, stats, "get_planner", { since: state.today, until: state.today });
  await call(owner, stats, "set_planner_hours", { projectId: state.projectId, date: state.today, plannedSeconds: 0 });

  // ── account ─────────────────────────────────────────────────────────────
  {
    const { data } = await call(owner, stats, "list_notifications", {});
    state.notificationId = data.notifications[0].id;
  }
  await call(owner, stats, "mark_notification_read", { notificationId: state.notificationId });
  await call(owner, stats, "mark_all_notifications_read", {});
  await call(owner, stats, "delete_notification", { notificationId: state.notificationId });
  {
    const { data } = await call(owner, stats, "get_settings", {});
    state.settings = data;
  }
  await call(owner, stats, "update_settings", { currency: state.settings.currency });
  await call(owner, stats, "get_calendar_status", {});
  await call(owner, stats, "set_calendar_auto_track", { enabled: false, provider: "google" });

  // ── cleanup ─────────────────────────────────────────────────────────────
  await call(member, stats, "update_project", { projectId: state.projectId, name: "should be refused" }, "refuse");
  await call(owner, stats, "delete_tag", { tagId: state.tagId });
  await call(owner, stats, "archive_project", { projectId: state.projectId });
  await call(owner, stats, "archive_client", { clientId: state.clientId });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args["owner-key-file"]) throw new Error("Missing --owner-key-file (an owner/admin read_write key)");
  assertLocal(args.url);

  // The read and member keys are optional: without them their checks are reported as SKIP, never as passing.
  const ownerRw = await makeClient("owner-rw", args.url, args["owner-key-file"]);
  const ownerRo = args["read-key-file"] ? await makeClient("owner-ro", args.url, args["read-key-file"]) : null;
  const memberRw = args["member-key-file"] ? await makeClient("member-rw", args.url, args["member-key-file"]) : null;

  const ownerRwTools = await ownerRw.listTools();
  const ownerRoTools = ownerRo ? await ownerRo.listTools() : null;
  const rwNames = new Set(ownerRwTools.tools.map((t) => t.name));
  const readNames = new Set((ownerRoTools?.tools ?? ownerRwTools.tools.filter((t) => t.annotations?.readOnlyHint === true)).map((t) => t.name));

  const stats = new Map(ownerRwTools.tools.map((t) => [t.name, { tool: t, calls: [] }]));
  stats.checks = [];

  console.log(`Target: ${args.url}`);
  console.log(`Catalog: ${ownerRwTools.tools.length} tools on the rw key${ownerRoTools ? `, ${ownerRoTools.tools.length} on the read key` : ""}.`);
  console.log("Running the live scenario...");
  try {
    await runScenario(ownerRw, memberRw, stats);
  } catch (err) {
    console.error("Scenario aborted:", err instanceof Error ? err.stack : err);
  }

  await Promise.all([ownerRw, ownerRo, memberRw].filter(Boolean).map((c) => c.close()));

  const rows = [];
  for (const [name, entry] of stats) {
    const tool = entry.tool;
    const parts = {
      desc: scoreDescription(tool),
      fields: scoreFields(tool),
      annotations: scoreAnnotations(tool),
      live: scoreLive(entry),
      compact: scoreCompact(entry),
      visibility: scoreVisibility(tool, readNames, rwNames),
    };
    const score = Object.values(parts).reduce((a, b) => a + b, 0);
    const failed = Object.entries(parts)
      .filter(([, v]) => v === 0)
      .map(([k]) => k);
    if (entry.calls.some((c) => c.error)) {
      failed.push(...entry.calls.filter((c) => c.error).map((c) => `error: ${c.error.slice(0, 120)}`));
    }
    rows.push({ name, score, failed });
  }
  rows.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));

  console.log("\ntool | score | failed criteria");
  console.log("-".repeat(80));
  for (const r of rows) {
    console.log(`${r.name.padEnd(28)} | ${String(r.score).padStart(2)}/10 | ${r.failed.join(", ") || "-"}`);
  }

  // ── global checks ──────────────────────────────────────────────────────
  const readOnlyToolNames = new Set(
    ownerRwTools.tools.filter((t) => t.annotations?.readOnlyHint === true).map((t) => t.name)
  );
  const globalChecks = [
    {
      name: "read key lists exactly the 26 read tools",
      skip: !ownerRoTools,
      pass: readNames.size === 26 && [...readNames].every((n) => readOnlyToolNames.has(n)) &&
        [...readOnlyToolNames].every((n) => readNames.has(n)),
    },
    { name: "owner rw key lists 66 tools", pass: rwNames.size === 66 },
    { name: "no duplicated batch twins in the catalog", pass: !["create_tasks", "move_tasks", "update_tasks", "delete_tasks", "log_times"].some((n) => rwNames.has(n)) },
    ...stats.checks.map((c) => ({ name: c.label, pass: c.pass })),
    {
      name: "member key gets isError from update_project on the grader's project",
      skip: !memberRw,
      pass: (stats.get("update_project")?.calls ?? []).some((c) => c.expect === "refuse" && c.matched),
    },
    {
      name: "member key gets isError from delete_task on the owner's task",
      skip: !memberRw,
      pass: (stats.get("delete_task")?.calls ?? []).some((c) => c.expect === "refuse" && c.matched),
    },
  ];

  console.log("\nGlobal checks:");
  for (const g of globalChecks) console.log(`  [${g.skip ? "SKIP" : g.pass ? "PASS" : "FAIL"}] ${g.name}`);

  const below10 = rows.filter((r) => r.score < 10);
  const globalFail = globalChecks.some((g) => !g.skip && !g.pass);

  console.log("");
  if (below10.length === 0 && !globalFail) {
    console.log(`GRADE: all ${rows.length} at 10`);
  } else {
    console.log("GRADE: below 10 —", below10.length ? below10.map((r) => `${r.name} (${r.score})`).join(", ") : "none");
    if (globalFail) console.log("GLOBAL CHECK FAILURE — see above");
  }

  process.exit(below10.length > 0 || globalFail ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});

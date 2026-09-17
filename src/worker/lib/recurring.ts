// Cron materializer for recurring entries: creates each active template's
// occurrence for today once the scheduled UTC time has passed. last_materialized
// (UTC date) keeps it idempotent across the 5-minute cron cycles.

import { z } from "zod";
import { broadcast, upsertTags } from "../db/queries";
import type { RecurringEntryRow } from "../db/rows";
import { findActiveProject } from "./projects";
import { resolveEntryBillable } from "@shared/billable";
import { parseJsonColumn } from "./json";

const stringArray = z.array(z.string());

export async function runRecurring(env: Env): Promise<void> {
  const now = new Date();
  const todayDay = now.getUTCDay();
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const todayStr = now.toISOString().slice(0, 10); // UTC yyyy-mm-dd

  // Filter in SQL so the every-5-min sweep returns zero rows on no-op ticks
  // (wrong weekday / time not reached / already materialized today) instead of
  // scanning every active template into JS. The per-row checks below repeat
  // these guards as a readable second layer.
  const { results } = await env.DB.prepare(
    `SELECT * FROM recurring_entries
     WHERE active = 1
       AND time_utc <= ?
       AND (last_materialized IS NULL OR last_materialized <> ?)
       AND instr(',' || days_of_week || ',', ?) > 0`
  )
    .bind(nowMinutes, todayStr, `,${todayDay},`)
    .all<RecurringEntryRow>();

  for (const row of results) {
    try {
      const days = row.days_of_week
        .split(",")
        .filter(Boolean)
        .map(Number);
      if (!days.includes(todayDay)) continue;

      const timeUtc = row.time_utc;
      if (nowMinutes < timeUtc) continue; // scheduled time hasn't passed yet today
      if (row.last_materialized === todayStr) continue; // already created today

      const userId = row.user_id ?? null;
      const project = row.project_id
        ? await findActiveProject(env.DB, row.workspace_id, row.project_id)
        : null;
      // Hours need an author (0037) and an active project (D3); a template missing either is skipped and warned once a day.
      if (!userId || !project) {
        console.warn("recurring: template skipped", {
          templateId: row.id,
          missing: !userId ? "author" : "active project",
        });
        await env.DB.prepare(`UPDATE recurring_entries SET last_materialized = ? WHERE id = ?`)
          .bind(todayStr, row.id)
          .run();
        continue;
      }

      const startMs =
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0) +
        timeUtc * 60_000;
      const duration = row.duration_seconds;
      const startIso = new Date(startMs).toISOString();
      const stopIso = new Date(startMs + duration * 1000).toISOString();
      const workspaceId = row.workspace_id;
      const entryId = crypto.randomUUID();
      const nowIso = new Date().toISOString();

      await env.DB.prepare(
        `INSERT INTO time_entries
           (id, workspace_id, user_id, project_id, task_id, description, start, stop, duration, billable, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          entryId,
          workspaceId,
          userId,
          project.id,
          row.task_id ?? null,
          row.description ?? "",
          startIso,
          stopIso,
          duration,
          resolveEntryBillable(Boolean(row.billable)) ? 1 : 0,
          nowIso,
          nowIso
        )
        .run();

      const tags = parseJsonColumn(row.tags, stringArray, [], "recurring_entries.tags");
      if (tags.length) await upsertTags(env.DB, workspaceId, entryId, tags);

      await env.DB.prepare(
        `UPDATE recurring_entries SET last_materialized = ? WHERE id = ?`
      )
        .bind(todayStr, row.id)
        .run();

      await broadcast(env, workspaceId, "entries:changed", { source: "recurring" }, null, userId);
    } catch (e) {
      // One template failing (deleted project FK, etc.) must not abort the
      // rest — but log it, or the template silently never materializes again.
      console.error("recurring: template materialization failed", {
        templateId: row.id,
        workspaceId: row.workspace_id,
        error: String(e),
      });
    }
  }
}

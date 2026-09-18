import { z } from "zod";
import { CreateRecurringEntrySchema } from "@shared/schemas";

// durationSeconds' own bounds (60s..86400s), reused in minutes so the message stays the schema's own.
const DURATION_SECONDS_SCHEMA = CreateRecurringEntrySchema.shape.durationSeconds;

export const recurringFormSchema = z
  .object({
    // `.removeDefault()`: the form always supplies a value, so the resolver's input/output types stay in sync.
    description: CreateRecurringEntrySchema.shape.description.removeDefault(),
    projectId: z.string().nullable(),
    taskId: z.string().nullable(),
    tags: CreateRecurringEntrySchema.shape.tags.removeDefault(),
    billable: CreateRecurringEntrySchema.shape.billable.removeDefault(),
    durationMinutes: z.number(),
    days: CreateRecurringEntrySchema.shape.daysOfWeek,
    time: z.string(),
  })
  .superRefine((val, ctx) => {
    if (!val.projectId) {
      // Every recurring template needs a project (D3), same rule CreateRecurringEntrySchema's projectId carries.
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["projectId"], message: "Choose a project" });
    }
    const secondsResult = DURATION_SECONDS_SCHEMA.safeParse(val.durationMinutes * 60);
    if (!secondsResult.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["durationMinutes"],
        message: secondsResult.error.issues[0].message,
      });
    }
  });

export type RecurringFormValues = z.infer<typeof recurringFormSchema>;

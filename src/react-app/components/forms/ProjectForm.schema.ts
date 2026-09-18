import { z } from "zod";
import { hasClient } from "@/lib/clientChoice";
import { CreateProjectSchema } from "@shared/schemas";

// Derived from the schema itself, so a future rename of its message doesn't leave this one stale.
const CLIENT_REQUIRED_MESSAGE =
  CreateProjectSchema.shape.clientId.safeParse("").error?.issues[0]?.message ?? "Choose a client";

const clientChoiceSchema = z
  .object({ clientId: z.string(), newName: z.string() })
  .refine(hasClient, { message: CLIENT_REQUIRED_MESSAGE });

export const projectFormSchema = z.object({
  name: CreateProjectSchema.shape.name,
  // The picker always sets a real hex value, so unwrap the server's `.optional()` (for API callers that skip it).
  color: CreateProjectSchema.shape.color.unwrap(),
  client: clientChoiceSchema,
  rate: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  estimatedHours: z.string(),
  integrationId: z.string(),
  externalProjectId: z.string(),
  externalTaskId: z.string(),
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;

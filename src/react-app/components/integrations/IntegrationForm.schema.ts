import { z } from "zod";
import {
  CreateIntegrationSchema,
  WorkfrontCredentialsSchema,
  DynamicsCredentialsSchema,
} from "@shared/schemas";
import type { IntegrationType } from "@shared/schemas";

// Both discriminated-union branches share the same name/baseUrl shape.
const { name: NameSchema, baseUrl: BaseUrlSchema } = CreateIntegrationSchema.options[0].shape;

export function buildFormSchema(isEdit: boolean) {
  return z
    .object({
      type: z.enum(["workfront", "dynamics"]),
      name: NameSchema,
      baseUrl: BaseUrlSchema,
      apiKey: z.string(),
      tenantId: z.string(),
      clientId: z.string(),
      clientSecret: z.string(),
    })
    .superRefine((val, ctx) => {
      // Edit mode: blank credentials mean "keep the current ones", so only validate what was touched.
      const addFrom = (result: {
        success: boolean;
        error?: { issues: { path: PropertyKey[]; message: string }[] };
      }) => {
        if (result.success || !result.error) return;
        for (const issue of result.error.issues) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.message });
        }
      };

      if (val.type === "workfront") {
        const touched = val.apiKey.trim().length > 0;
        if (!isEdit || touched) addFrom(WorkfrontCredentialsSchema.safeParse({ apiKey: val.apiKey }));
      } else {
        const touched = Boolean(val.tenantId.trim() || val.clientId.trim() || val.clientSecret.trim());
        if (!isEdit || touched) {
          addFrom(
            DynamicsCredentialsSchema.safeParse({
              tenantId: val.tenantId,
              clientId: val.clientId,
              clientSecret: val.clientSecret,
            })
          );
        }
      }
    });
}

export interface IntegrationFormValues {
  type: IntegrationType;
  name: string;
  baseUrl: string;
  apiKey: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

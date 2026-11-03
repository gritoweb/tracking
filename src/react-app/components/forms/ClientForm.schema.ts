import { z } from "zod";
import { CreateClientSchema } from "@shared/schemas";

// A blank <input> is "", not the server's own nullable/undefined for an unset optional field.
function blankable<T extends z.ZodTypeAny>(schema: T) {
  return z.union([z.literal(""), schema]);
}

export const clientFormSchema = z.object({
  name: CreateClientSchema.shape.name,
  email: blankable(CreateClientSchema.shape.email.unwrap().unwrap()),
  phone: blankable(CreateClientSchema.shape.phone.unwrap().unwrap()),
  address: blankable(CreateClientSchema.shape.address.unwrap().unwrap()),
  notes: blankable(CreateClientSchema.shape.notes.unwrap().unwrap()),
  // Blank = use the workspace default rate.
  // MoneyInput hands over NaN while the text isn't a number.
  rate: z.number().nullable().refine((v) => v === null || v >= 0, "Enter an amount of zero or more"),
  // Null = the workspace's invoice currency.
  currency: z.string().nullable(),
  // Fixed: the invoice bills `fixedFee` for the hours instead of hours × rate.
  billing: z.enum(["hourly", "fixed"]),
  fixedFee: z.number().nullable(),
}).refine((v) => v.billing === "hourly" || (v.fixedFee !== null && v.fixedFee >= 0), {
  message: "Enter the fixed amount",
  path: ["fixedFee"],
});

export type ClientFormValues = z.infer<typeof clientFormSchema>;

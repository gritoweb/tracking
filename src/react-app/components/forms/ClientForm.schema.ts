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
});

export type ClientFormValues = z.infer<typeof clientFormSchema>;

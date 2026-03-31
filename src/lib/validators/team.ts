import { z } from "zod";

// Base fields shared between create and update
const baseFields = {
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Valid email is required").max(255),
  role: z.enum(["manager", "tech"]),
};

// Create: email + password required (creates Supabase Auth account)
export const teamMemberCreateSchema = z.object({
  ...baseFields,
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

// Update: no password field, email still required
export const teamMemberUpdateSchema = z.object({
  ...baseFields,
});

export type TeamMemberCreateData = z.infer<typeof teamMemberCreateSchema>;
export type TeamMemberUpdateData = z.infer<typeof teamMemberUpdateSchema>;

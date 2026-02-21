import { z } from "zod";

export const teamMemberSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.union([z.string().email("Invalid email address").max(255), z.literal("")]),
  role: z.enum(["manager", "tech"]),
});

export type TeamMemberFormData = z.infer<typeof teamMemberSchema>;

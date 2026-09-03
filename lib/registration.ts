import { z } from "zod";

export const STAFF_CREATION_ROLES = ["recruiter", "reviewer"] as const;
export function canCreateStaffRole(role: string): boolean {
  return STAFF_CREATION_ROLES.some((allowed) => allowed === role);
}

export const registrationCredentials = z.object({
  email: z.string().trim().toLowerCase().max(254).email("Enter a valid email address."),
  password: z.string().min(12, "Use at least 12 characters for your password.")
    .max(72, "Password must be at most 72 bytes.")
    .refine((value) => new TextEncoder().encode(value).length <= 72, "Password must be at most 72 bytes."),
});

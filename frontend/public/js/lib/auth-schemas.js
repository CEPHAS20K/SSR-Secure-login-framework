import { z } from "/vendor/zod/index.js";

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password must be less than 128 characters."),
});

export const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, "Username must be at least 3 characters.")
      .max(60, "Username must be less than 60 characters."),
    email: z.string().trim().email("Enter a valid email address."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(128, "Password must be less than 128 characters."),
    confirmPassword: z
      .string()
      .min(8, "Confirm password must be at least 8 characters.")
      .max(128, "Confirm password must be less than 128 characters."),
    gender: z.enum(["male", "female", "other"], {
      error: "Select a valid gender option.",
    }),
    agreeTerms: z.boolean().refine((value) => value === true, {
      message: "You must accept terms and privacy policy.",
    }),
  })
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

export const otpSchema = z.string().regex(/^\d{5}$/, "OTP should contain exactly 5 digits.");

export const resetAccountSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email address."),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters.")
      .max(128, "New password must be less than 128 characters."),
    confirmPassword: z
      .string()
      .min(8, "Confirm password must be at least 8 characters.")
      .max(128, "Confirm password must be less than 128 characters."),
  })
  .superRefine((value, context) => {
    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "New password and confirm password must match.",
      });
    }
  });

export const adminLoginSchema = z.object({
  username: z.string().trim().min(1, "Username is required."),
  password: z
    .string()
    .min(1, "Password is required.")
    .max(128, "Password must be less than 128 characters."),
});

export function firstSchemaError(parseResult, fallback = "Please review form fields.") {
  if (parseResult.success) return "";
  return parseResult.error?.issues?.[0]?.message || fallback;
}

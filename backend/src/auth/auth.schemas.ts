import { z } from "zod";
export const requestOtpSchema = z.object({ mobile: z.string().regex(/^\+91[6-9]\d{9}$/, "Enter a valid Indian mobile number") });
export const verifyOtpSchema = requestOtpSchema.extend({ code: z.string().regex(/^\d{6}$/, "OTP must contain 6 digits"), challengeId: z.string().uuid() });
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

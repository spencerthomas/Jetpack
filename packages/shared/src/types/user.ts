import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  createdAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  user: UserSchema,
  token: z.string(),
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const LogoutResponseSchema = z.object({
  success: z.boolean(),
});

export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

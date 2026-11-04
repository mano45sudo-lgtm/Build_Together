import { z } from 'zod';

/**
 * zod input-validation schemas for the Phase 2 endpoints. Validation happens at the route
 * edge (never in services), returning field-level details in the shared error envelope.
 *
 * Password policy is aligned to OWASP ASVS guidance for/authenticated services: a minimum
 * length of 10 (OWASP recommends >=12; we require >=10 and let users go longer), plus basic
 * shape checks. Strength meters / breach screening are future hardening, not Phase 2.
 */

/** Normalize an email to a canonical form for storage + comparison (lower-case, trimmed). */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// `meta` is the transform target: it strips surrounding whitespace before validation.
const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

const emailSchema = z
  .string({ error: 'Email is required' })
  .trim()
  .email('Enter a valid email address')
  .transform((v) => normalizeEmail(v));

const passwordSchema = z
  .string({ error: 'Password is required' })
  .min(10, 'Password must be at least 10 characters')
  .max(256, 'Password must be at most 256 characters')
  .refine((v) => /\S/.test(v), 'Password must contain a non-space character');

const optionalUrl = z.string().trim().url('Must be a valid URL').max(2048, 'URL is too long');

export const registerSchema = z.object({
  name: trimmed(1, 120, 'Name'),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: 'Current password is required' })
      .min(1, 'Current password is required'),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'New password must differ from the current password',
    path: ['newPassword'],
  });

export const updateProfileSchema = z
  .object({
    name: trimmed(1, 120, 'Name').optional(),
    avatarUrl: z.union([optionalUrl, z.null()]).optional(),
  })
  .refine((v) => v.name !== undefined || v.avatarUrl !== undefined, {
    message: 'Provide at least one field to update',
  });

export const createWorkspaceSchema = z.object({
  name: trimmed(1, 120, 'Workspace name'),
  description: z.string().trim().max(500, 'Description must be at most 500 characters').optional(),
  iconUrl: z.union([optionalUrl, z.null()]).optional(),
});

export const updateWorkspaceSchema = z
  .object({
    name: trimmed(1, 120, 'Workspace name').optional(),
    description: z
      .string()
      .trim()
      .max(500, 'Description must be at most 500 characters')
      .nullable()
      .optional(),
    iconUrl: z.union([optionalUrl, z.null()]).optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined || v.iconUrl !== undefined, {
    message: 'Provide at least one field to update',
  });

// Invitations may be created for ADMIN or MEMBER. OWNER is never assignable via invitation —
// ownership is established only by workspace creation / transfer (privilege-escalation guard).
export const createInvitationSchema = z.object({
  email: emailSchema,
  role: z.enum(['ADMIN', 'MEMBER'], { error: 'Role must be ADMIN or MEMBER' }),
});

export const acceptInvitationSchema = z.object({
  token: z.string({ error: 'Invitation token is required' }).min(10, 'Invalid invitation token'),
});

/** Refresh + logout prove identity with the refresh token (main process only), not the access token. */
export const refreshSchema = z.object({
  refreshToken: z.string({ error: 'Refresh token is required' }).min(10, 'Invalid refresh token'),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER'], { error: 'Role must be ADMIN or MEMBER' }),
});

// ---- Phase 3 chat (workspace-scoped conversations over Nexconn — ADR-0004) ----
// Shape only; the conversation SERVICE enforces the semantic rules (group title required, DIRECT is
// exactly one peer, every participant must be a workspace member) so no rule can be bypassed here.

export const createConversationSchema = z.object({
  kind: z.enum(['GROUP', 'DIRECT'], { error: 'Kind must be GROUP or DIRECT' }),
  title: z.string().trim().max(120, 'Title must be at most 120 characters').optional(),
  participantUserIds: z
    .array(z.string().min(1, 'Invalid participant id'))
    .max(100, 'Too many participants'),
});

export const addConversationMembersSchema = z.object({
  userIds: z
    .array(z.string().min(1, 'Invalid user id'))
    .min(1, 'Provide at least one user to add')
    .max(100, 'Too many members'),
});

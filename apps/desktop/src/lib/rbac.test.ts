import { describe, expect, it } from 'vitest';
import type { DecisionView, ProjectView } from '@buildtogether/shared';
import {
  canChangeRole,
  canManageDecision,
  canManageTeam,
  canRemove,
  canTransferTo,
  parseInviteToken,
} from './rbac';

/**
 * Client-side visibility rules (brief §7/§13). These mirror the server's authoritative checks; the
 * server is the real boundary, but the UI must not offer actions a role cannot perform, and must
 * never let an ADMIN escalate themselves or a MEMBER manage the team.
 */

describe('canManageTeam', () => {
  it('allows OWNER and ADMIN only', () => {
    expect(canManageTeam('OWNER')).toBe(true);
    expect(canManageTeam('ADMIN')).toBe(true);
    expect(canManageTeam('MEMBER')).toBe(false);
  });
});

describe('canChangeRole', () => {
  it('never targets the OWNER', () => {
    expect(canChangeRole('OWNER', 'OWNER', false)).toBe(false);
  });
  it('OWNER changes any non-owner role', () => {
    expect(canChangeRole('OWNER', 'ADMIN', false)).toBe(true);
    expect(canChangeRole('OWNER', 'MEMBER', false)).toBe(true);
  });
  it('ADMIN demotes/promotes a plain MEMBER but never themselves (no self-escalation)', () => {
    expect(canChangeRole('ADMIN', 'MEMBER', false)).toBe(true);
    expect(canChangeRole('ADMIN', 'MEMBER', true)).toBe(false);
    expect(canChangeRole('ADMIN', 'ADMIN', false)).toBe(false);
  });
  it('MEMBER changes nothing', () => {
    expect(canChangeRole('MEMBER', 'MEMBER', false)).toBe(false);
  });
});

describe('canRemove', () => {
  it('OWNER is never removed here (transfer first)', () => {
    expect(canRemove('OWNER', 'OWNER', true)).toBe(false);
  });
  it('anyone may remove themselves (leave)', () => {
    expect(canRemove('MEMBER', 'MEMBER', true)).toBe(true);
    expect(canRemove('ADMIN', 'ADMIN', true)).toBe(true);
  });
  it('OWNER removes others; ADMIN removes plain MEMBERs only', () => {
    expect(canRemove('OWNER', 'ADMIN', false)).toBe(true);
    expect(canRemove('OWNER', 'MEMBER', false)).toBe(true);
    expect(canRemove('ADMIN', 'MEMBER', false)).toBe(true);
    expect(canRemove('ADMIN', 'ADMIN', false)).toBe(false);
    expect(canRemove('MEMBER', 'MEMBER', false)).toBe(false);
  });
});

describe('canTransferTo', () => {
  it('only OWNER transfers, to a non-owner', () => {
    expect(canTransferTo('OWNER', 'ADMIN')).toBe(true);
    expect(canTransferTo('OWNER', 'MEMBER')).toBe(true);
    expect(canTransferTo('OWNER', 'OWNER')).toBe(false);
    expect(canTransferTo('ADMIN', 'MEMBER')).toBe(false);
  });
});

describe('canManageDecision', () => {
  const actor = (id: string) => ({ id, name: id });
  const decision = (createdBy: string, owner: string): DecisionView =>
    ({ createdBy: actor(createdBy), owner: actor(owner) }) as DecisionView;
  const project = (ownerId: string, createdById: string): ProjectView =>
    ({ owner: actor(ownerId), createdById }) as ProjectView;

  it('OWNER and ADMIN manage every decision', () => {
    const d = decision('wendy', 'wendy');
    expect(canManageDecision(d, { role: 'OWNER', userId: 'olivia' })).toBe(true);
    expect(canManageDecision(d, { role: 'ADMIN', userId: 'mark' })).toBe(true);
  });
  it('a plain MEMBER manages only decisions they created or own', () => {
    const created = decision('wendy', 'peter');
    const owned = decision('peter', 'wendy');
    const stranger = decision('olivia', 'mark');
    expect(canManageDecision(created, { role: 'MEMBER', userId: 'wendy' })).toBe(true);
    expect(canManageDecision(owned, { role: 'MEMBER', userId: 'wendy' })).toBe(true);
    expect(canManageDecision(stranger, { role: 'MEMBER', userId: 'wendy' })).toBe(false);
  });
  it('a MEMBER who manages the linked project manages its decision', () => {
    const d = decision('olivia', 'mark'); // neither creator nor owner is wendy
    const managed = project('wendy', 'wendy'); // wendy owns + created the project
    const foreign = project('olivia', 'olivia');
    expect(canManageDecision(d, { role: 'MEMBER', userId: 'wendy' }, managed)).toBe(true);
    expect(canManageDecision(d, { role: 'MEMBER', userId: 'wendy' }, foreign)).toBe(false);
  });
});

describe('parseInviteToken', () => {
  const token = 'Ab3dEf6hIjklMn0pQr5tVwXyZ';
  it('extracts from an accept link query', () => {
    expect(parseInviteToken(`https://app.local/invite/accept?token=${token}`)).toBe(token);
  });
  it('accepts a bare high-entropy token', () => {
    expect(parseInviteToken(token)).toBe(token);
  });
  it('rejects empty or non-token input', () => {
    expect(parseInviteToken('   ')).toBeNull();
    expect(parseInviteToken('hello world')).toBeNull();
    expect(parseInviteToken('short')).toBeNull();
  });
});

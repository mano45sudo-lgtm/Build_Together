import { describe, expect, it } from 'vitest';
import type { DecisionStatus, MyTaskView, TaskPriority, TaskStatus } from '@buildtogether/shared';
import type { DecisionSignal, TaskSignal } from '../repositories/intelligence.repo.js';
import { computeHealth, computeMetrics } from '../services/intelligence/health.js';
import { detectBlockers } from '../services/intelligence/blockers.js';
import { detectRisks } from '../services/intelligence/risk.js';
import { buildRecommendations } from '../services/intelligence/recommendations.js';
import { computeDecisionImpacts } from '../services/intelligence/impacts.js';
import { buildPersonalIntelligence } from '../services/intelligence/personal.js';

/**
 * Pure unit tests for the deterministic intelligence engine. No database, no clock drift — every
 * detector is a total function over signal rows and an explicit `now`, so the rules are verified in
 * isolation and are perfectly reproducible. Integration tests (intelligence.test.ts) then prove the
 * authorization + envelope + dedup wiring on the real HTTP surface.
 */

const NOW = Date.parse('2026-06-01T12:00:00.000Z');
const DAY = 86_400_000;
const at = (offsetDays: number): Date => new Date(NOW + offsetDays * DAY);

function mkTask(over: Partial<TaskSignal> & { id: string }): TaskSignal {
  return {
    title: over.id,
    status: 'TODO' as TaskStatus,
    priority: 'MEDIUM' as TaskPriority,
    dueDate: null,
    createdAt: new Date(NOW - 30 * DAY),
    completedAt: null,
    assignee: null,
    prerequisites: [],
    dueDateChanges: 0,
    ...over,
  };
}

function mkDecision(over: Partial<DecisionSignal> & { id: string }): DecisionSignal {
  return {
    title: over.id,
    status: 'APPROVED' as DecisionStatus,
    projectId: 'P1',
    taskId: null,
    linkedTaskIds: [],
    supersededById: null,
    supersededByTitle: null,
    supersededAt: null,
    ...over,
  };
}

function mkMy(over: Partial<MyTaskView> & { id: string }): MyTaskView {
  return {
    workspaceId: 'WS',
    projectId: 'P1',
    title: over.id,
    description: null,
    status: 'TODO' as TaskStatus,
    priority: 'MEDIUM' as TaskPriority,
    createdBy: { id: 'u', name: 'U' },
    assignee: { id: 'me', name: 'Me', avatarUrl: null },
    startDate: null,
    dueDate: null,
    completedAt: null,
    createdAt: new Date(NOW - 30 * DAY).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    blocked: false,
    project: { id: 'P1', name: 'Proj', projectKey: 'PRJ' },
    ...over,
  };
}

describe('project health', () => {
  it('escalates to AT_RISK when the overdue count is severe', () => {
    const tasks = [
      mkTask({ id: 't1', dueDate: at(-1) }),
      mkTask({ id: 't2', dueDate: at(-2) }),
      mkTask({ id: 't3', dueDate: at(-3) }),
    ];
    const metrics = computeMetrics(tasks, [], NOW, 7);
    expect(metrics.overdueTasks).toBe(3);
    const health = computeHealth(metrics, { highRiskCount: 0, impactedTaskCount: 0, now: NOW });
    expect(health.state).toBe('AT_RISK');
    expect(health.factors.some((f) => f.code === 'OVERDUE_TASKS' && f.severity === 'RISK')).toBe(
      true,
    );
  });

  it('is ON_TRACK when every task is complete', () => {
    const metrics = computeMetrics([mkTask({ id: 'd', status: 'DONE' })], [], NOW, 7);
    const health = computeHealth(metrics, { highRiskCount: 0, impactedTaskCount: 0, now: NOW });
    expect(health.state).toBe('ON_TRACK');
    expect(health.factors.some((f) => f.code === 'ALL_COMPLETE')).toBe(true);
  });

  it('is NEEDS_ATTENTION for a small number of overdue tasks (not yet severe)', () => {
    const tasks = [
      mkTask({ id: 'a', dueDate: at(-1) }),
      mkTask({ id: 'b', dueDate: at(-2) }),
      mkTask({ id: 'c', dueDate: at(30) }),
      mkTask({ id: 'd', dueDate: at(30) }),
      mkTask({ id: 'e', dueDate: at(30) }),
    ];
    const metrics = computeMetrics(tasks, [], NOW, 7);
    const health = computeHealth(metrics, { highRiskCount: 0, impactedTaskCount: 0, now: NOW });
    expect(health.state).toBe('NEEDS_ATTENTION');
  });

  it('reports NO_TASKS for an empty project', () => {
    const metrics = computeMetrics([], [], NOW, 7);
    const health = computeHealth(metrics, { highRiskCount: 0, impactedTaskCount: 0, now: NOW });
    expect(health.factors.some((f) => f.code === 'NO_TASKS')).toBe(true);
    expect(health.metrics.completionRatio).toBe(0);
  });
});

describe('blocker detection', () => {
  it('derives unfinished and overdue prerequisite blockers (escalated)', () => {
    const unfinished = mkTask({
      id: 'a',
      prerequisites: [{ id: 'p', title: 'P', status: 'TODO', dueDate: null }],
    });
    const overduePrereq = mkTask({
      id: 'b',
      prerequisites: [{ id: 'q', title: 'Q', status: 'TODO', dueDate: at(-2) }],
    });
    const blockers = detectBlockers('WS', 'P1', [unfinished, overduePrereq], [], NOW);
    expect(blockers.find((x) => x.taskId === 'a')?.source).toBe('UNFINISHED_PREREQUISITE');
    expect(blockers.find((x) => x.taskId === 'b')?.source).toBe('OVERDUE_PREREQUISITE');
  });

  it('flags a task awaiting a proposed decision and the decision itself', () => {
    const t = mkTask({ id: 'a' });
    const d = mkDecision({ id: 'd1', status: 'PROPOSED', linkedTaskIds: ['a'] });
    const blockers = detectBlockers('WS', 'P1', [t], [d], NOW);
    expect(blockers.some((x) => x.source === 'AWAITING_DECISION' && x.taskId === 'a')).toBe(true);
    expect(blockers.some((x) => x.source === 'DECISION_NEEDS_REVIEW' && x.taskId === null)).toBe(
      true,
    );
  });
});

describe('risk detection', () => {
  it('rates an overdue high-priority task HIGH', () => {
    const rs = detectRisks(
      'WS',
      'P1',
      [mkTask({ id: 'a', dueDate: at(-1), priority: 'HIGH' })],
      [],
      null,
      NOW,
      7,
    );
    const r = rs.find((x) => x.taskId === 'a');
    expect(r?.level).toBe('HIGH');
    expect(r?.signals).toContain('OVERDUE');
  });

  it('rates a task simply due soon LOW', () => {
    const rs = detectRisks('WS', 'P1', [mkTask({ id: 'a', dueDate: at(3) })], [], null, NOW, 7);
    expect(rs.find((x) => x.taskId === 'a')?.level).toBe('LOW');
  });

  it('raises a milestone risk when the target date passed with open work', () => {
    const rs = detectRisks('WS', 'P1', [mkTask({ id: 'a' })], [], at(-1), NOW, 7);
    expect(rs.some((x) => x.taskId === null && x.level === 'HIGH')).toBe(true);
  });
});

describe('recommendations', () => {
  it('are deduplicated, evidence-backed and sorted HIGH-first', () => {
    const tasks = [mkTask({ id: 'a', dueDate: at(-1), priority: 'HIGH' })];
    const decisions = [mkDecision({ id: 'd1', status: 'PROPOSED', linkedTaskIds: ['a'] })];
    const blockers = detectBlockers('WS', 'P1', tasks, decisions, NOW);
    const risks = detectRisks('WS', 'P1', tasks, decisions, null, NOW, 7);
    const recs = buildRecommendations('WS', 'P1', tasks, decisions, blockers, risks, [], NOW, 7);
    const ids = recs.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(recs[0]?.priority).toBe('HIGH');
    expect(recs.some((r) => r.actionCode === 'REVIEW_OVERDUE_TASK')).toBe(true);
    expect(recs.some((r) => r.actionCode === 'APPROVE_DECISION')).toBe(true);
  });
});

describe('decision-revision impact', () => {
  it('surfaces live affected tasks and skips deleted ones', () => {
    const superseded = mkDecision({
      id: 'd1',
      status: 'SUPERSEDED',
      supersededById: 'd2',
      supersededByTitle: 'Newer',
      linkedTaskIds: ['t1', 't2'],
    });
    const briefs = new Map([
      ['t1', { id: 't1', title: 'Keep', status: 'TODO' as TaskStatus, assigneeName: null }],
    ]);
    const impacts = computeDecisionImpacts([superseded, mkDecision({ id: 'd0' })], briefs);
    expect(impacts).toHaveLength(1);
    expect(impacts[0]?.decisionId).toBe('d1');
    expect(impacts[0]?.affectedTasks.map((t) => t.taskId)).toEqual(['t1']);
  });

  it('is empty when no decision was superseded', () => {
    expect(computeDecisionImpacts([mkDecision({ id: 'd0' })], new Map())).toHaveLength(0);
  });
});

describe('personal intelligence', () => {
  it("buckets the caller's own visible work", () => {
    const rows = [
      mkMy({ id: 'over', dueDate: new Date(NOW - DAY).toISOString() }),
      mkMy({ id: 'soon', dueDate: new Date(NOW + 3 * DAY).toISOString() }),
      mkMy({ id: 'blocked', blocked: true }),
      mkMy({ id: 'rev', status: 'IN_REVIEW' }),
      mkMy({ id: 'done', status: 'DONE' }),
    ];
    const p = buildPersonalIntelligence('WS', 'me', rows, NOW, 7);
    expect(p.userId).toBe('me');
    expect(p.overdue.map((t) => t.id)).toContain('over');
    expect(p.upcoming.map((t) => t.id)).toContain('soon');
    expect(p.blocked.map((t) => t.id)).toContain('blocked');
    expect(p.awaitingMyReview.map((t) => t.id)).toContain('rev');
    expect(p.overdue.map((t) => t.id)).not.toContain('done');
    expect(p.recommendations.some((r) => r.entityId === 'over')).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  DesktopBridge,
  IpcOutcome,
  PersonalIntelligence,
  ProjectIntelligenceOverview,
} from '@buildtogether/shared';
import { ProjectIntelligencePanel } from '../features/intelligence/ProjectIntelligencePanel';
import { FocusCard } from '../features/intelligence/FocusCard';

const ok = <T,>(data: T): Promise<IpcOutcome<T>> => Promise.resolve({ ok: true, data });
const dest = { kind: 'TASK' as const, workspaceId: 'w1', projectId: 'p1', entityId: 't1' };

const overview: ProjectIntelligenceOverview = {
  project: { id: 'p1', name: 'Launch', projectKey: 'LCH', status: 'ACTIVE' },
  health: {
    state: 'AT_RISK',
    factors: [
      {
        code: 'OVERDUE_TASKS',
        severity: 'RISK',
        label: '2 overdue tasks',
        count: 2,
        evidenceEntityIds: [],
      },
    ] as ProjectIntelligenceOverview['health']['factors'],
    metrics: {
      totalTasks: 4,
      completedTasks: 1,
      inProgressTasks: 1,
      todoTasks: 2,
      overdueTasks: 2,
      blockedTasks: 1,
      upcomingDeadlineTasks: 0,
      nextDueDate: null,
      decisionsAwaitingReview: 0,
      completionRatio: 0.25,
    },
    computedAt: '2026-11-13T10:00:00.000Z',
  },
  blockers: [
    {
      id: 'blk-1',
      source: 'UNFINISHED_PREREQUISITE',
      status: 'OPEN',
      description: 'Ship API is blocked',
      projectId: 'p1',
      taskId: 't1',
      responsible: { id: 'u2', name: 'Grace' },
      evidence: 'Prerequisite "Write spec" is not done',
      suggestedAction: 'Finish "Write spec"',
      destination: dest,
    },
  ] as ProjectIntelligenceOverview['blockers'],
  risks: [
    {
      id: 'risk-1',
      level: 'HIGH',
      what: 'Ship API may miss its deadline',
      signals: ['OVERDUE'],
      evidence: 'Due 2026-11-10',
      recommendedAction: 'Re-plan the due date',
      projectId: 'p1',
      taskId: 't1',
      destination: dest,
    },
  ] as ProjectIntelligenceOverview['risks'],
  recommendations: [
    {
      id: 'rec-1',
      action: 'Review the overdue task "Ship API"',
      actionCode: 'REVIEW_OVERDUE_TASK',
      reason: 'It is 3 days overdue',
      evidence: 'Due 2026-11-10',
      priority: 'HIGH',
      entityKind: 'TASK',
      entityId: 't1',
      projectId: 'p1',
      destination: dest,
    },
  ],
  decisionImpacts: [
    {
      decisionId: 'd1',
      decisionTitle: 'Use REST',
      revisedAt: '2026-11-12T00:00:00.000Z',
      supersededBy: { id: 'd2', title: 'Use GraphQL' },
      projectId: 'p1',
      affectedTasks: [
        {
          taskId: 't3',
          title: 'Client SDK',
          status: 'TODO',
          assignee: null,
          reason: 'Linked decision was superseded',
        },
      ],
    },
  ],
};

function installBridge(intelligence: Partial<DesktopBridge['intelligence']>) {
  const bridge = {
    intelligence: {
      overview: vi.fn(() => ok(overview)),
      personal: vi.fn(() =>
        ok<PersonalIntelligence>({
          userId: 'u1',
          overdue: [],
          upcoming: [],
          blocked: [],
          awaitingMyReview: [],
          recommendations: [],
        }),
      ),
      dismiss: vi.fn(() =>
        ok({ kind: 'RECOMMENDATION', dedupKey: 'rec-1', state: 'DISMISSED', updatedAt: '' }),
      ),
      undismiss: vi.fn(() => ok(null)),
      ...intelligence,
    },
  };
  Object.defineProperty(window, 'bt', { value: bridge, configurable: true, writable: true });
  return bridge.intelligence;
}

afterEach(() => {
  Object.defineProperty(window, 'bt', { value: undefined, configurable: true, writable: true });
});

describe('ProjectIntelligencePanel', () => {
  it('shows health, actions, blockers, risks and decision impact with their evidence', async () => {
    installBridge({});
    render(<ProjectIntelligencePanel workspaceId="w1" projectId="p1" />);

    expect(await screen.findByText('At risk')).toBeInTheDocument();
    expect(screen.getByText('1 of 4 tasks done')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByText('2 overdue tasks')).toBeInTheDocument();
    expect(screen.getByText('Review the overdue task "Ship API"')).toBeInTheDocument();
    expect(screen.getByText('Ship API is blocked')).toBeInTheDocument();
    expect(screen.getByText('High risk')).toBeInTheDocument();
    expect(screen.getByText(/superseded by Use GraphQL/)).toBeInTheDocument();
    expect(screen.getByText('Client SDK')).toBeInTheDocument();
  });

  it('dismisses a signal without touching the task, then undoes it', async () => {
    const intel = installBridge({});
    render(<ProjectIntelligencePanel workspaceId="w1" projectId="p1" />);
    await screen.findByText('Ship API is blocked');

    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[1]!);
    await screen.findByText('Dismissed.');
    expect(intel.dismiss).toHaveBeenCalledWith('w1', {
      kind: 'BLOCKER',
      dedupKey: 'blk-1',
      state: 'DISMISSED',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(intel.undismiss).toHaveBeenCalledWith('w1', 'BLOCKER', 'blk-1'));
    expect(await screen.findByText('Ship API is blocked')).toBeInTheDocument();
  });

  it('marks a recommendation resolved', async () => {
    const intel = installBridge({});
    render(<ProjectIntelligencePanel workspaceId="w1" projectId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark resolved' }));
    await screen.findByText('Marked resolved.');
    expect(intel.dismiss).toHaveBeenCalledWith('w1', {
      kind: 'RECOMMENDATION',
      dedupKey: 'rec-1',
      state: 'RESOLVED',
    });
  });

  it('shows an error with retry when the overview fails', async () => {
    const overviewFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { code: 'NETWORK_ERROR', message: 'offline' } })
      .mockImplementation(() => ok(overview));
    installBridge({ overview: overviewFn });
    render(<ProjectIntelligencePanel workspaceId="w1" projectId="p1" />);

    expect(await screen.findByText("Couldn't load project intelligence")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('At risk')).toBeInTheDocument();
  });
});

describe('FocusCard', () => {
  it('renders nothing when there is nothing beyond the task lanes', async () => {
    const intel = installBridge({});
    const { container } = render(<FocusCard workspaceId="w1" />);
    await waitFor(() => expect(intel.personal).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows blocked work and recommendations', async () => {
    installBridge({
      personal: vi.fn(() =>
        ok<PersonalIntelligence>({
          userId: 'u1',
          overdue: [],
          upcoming: [],
          blocked: [
            {
              id: 't1',
              title: 'Ship API',
              project: { id: 'p1', name: 'Launch', projectKey: 'LCH' },
            } as PersonalIntelligence['blocked'][number],
          ],
          awaitingMyReview: [],
          recommendations: overview.recommendations,
        }),
      ),
    });
    render(<FocusCard workspaceId="w1" />);
    expect(await screen.findByText('Blocked · 1')).toBeInTheDocument();
    expect(screen.getByText('LCH')).toBeInTheDocument();
    expect(screen.getByText('Review the overdue task "Ship API"')).toBeInTheDocument();
  });
});

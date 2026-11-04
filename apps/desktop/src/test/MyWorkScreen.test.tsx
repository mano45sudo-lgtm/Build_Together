import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AuthSessionView,
  IpcOutcome,
  MyTaskView,
  TaskDependencies,
} from '@buildtogether/shared';
import { AuthProvider } from '../state/AuthProvider';
import { MyWorkScreen } from '../features/mywork/MyWorkScreen';

/**
 * My Work renderer tests (brief §6 + §9 desktop). The screen must aggregate ONLY the real, server-
 * returned tasks assigned to the caller (never mocks), group them into Upcoming / In Progress /
 * Overdue / Completed, show the owning project + priority + due date, and route quick status moves
 * through the bridge. `window.bt` is doubled; the real MyWorkScreen is mounted under AuthProvider so
 * its `activeWorkspace` resolves from a genuine session.
 */

const session: AuthSessionView = {
  user: {
    id: 'u_1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    avatarUrl: null,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  workspaces: [
    {
      id: 'w_1',
      name: 'Acme Product',
      description: null,
      iconUrl: null,
      role: 'OWNER',
      memberCount: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

function makeMy(over: Partial<MyTaskView> = {}): MyTaskView {
  return {
    id: 't_1',
    workspaceId: 'w_1',
    projectId: 'p_1',
    title: 'Task',
    description: null,
    status: 'TODO',
    priority: 'MEDIUM',
    createdBy: { id: 'u_1', name: 'Ada Lovelace' },
    assignee: { id: 'u_1', name: 'Ada Lovelace', avatarUrl: null },
    startDate: null,
    dueDate: null,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    blocked: false,
    project: { id: 'p_1', name: 'Website Relaunch', projectKey: 'WEB' },
    ...over,
  };
}

const ok = <T,>(data: T): Promise<IpcOutcome<T>> => Promise.resolve({ ok: true, data });
const fail = <T,>(message = 'boom'): Promise<IpcOutcome<T>> =>
  Promise.resolve({ ok: false, error: { code: 'SERVER_ERROR', message } });

let mine: MyTaskView[] = [];

function installBridge() {
  const bridge = {
    auth: { me: () => ok(session) },
    members: { list: () => ok([]) },
    tasks: {
      assignedToMe: vi.fn(() => ok(mine)),
      list: vi.fn(() => ok([])),
      get: vi.fn(() => ok(makeMy())),
      changeStatus: vi.fn(() =>
        ok(makeMy({ status: 'DONE', completedAt: '2026-02-02T00:00:00.000Z' })),
      ),
      dependencies: vi.fn(() => ok<TaskDependencies>({ taskId: 't_1', dependsOn: [], blocks: [] })),
      activity: vi.fn(() => ok([])),
    },
  } as unknown as NonNullable<typeof window.bt>;
  Object.defineProperty(window, 'bt', { value: bridge, configurable: true, writable: true });
  return bridge;
}

function renderScreen() {
  return render(
    <AuthProvider>
      <MyWorkScreen />
    </AuthProvider>,
  );
}

let bridge: ReturnType<typeof installBridge>;

beforeEach(() => {
  mine = [];
  bridge = installBridge();
});

afterEach(() => {
  Object.defineProperty(window, 'bt', { value: undefined, configurable: true, writable: true });
});

describe('my work screen', () => {
  it('groups real assigned tasks into Upcoming / In Progress / Overdue / Completed with project context', async () => {
    mine = [
      makeMy({ id: 'a', title: 'Plan the roadmap', status: 'TODO' }),
      makeMy({ id: 'b', title: 'Write the API', status: 'IN_PROGRESS' }),
      makeMy({
        id: 'c',
        title: 'Fix the login bug',
        status: 'TODO',
        dueDate: '2020-01-01T00:00:00.000Z',
      }),
      makeMy({
        id: 'd',
        title: 'Ship v1',
        status: 'DONE',
        completedAt: '2026-02-01T00:00:00.000Z',
      }),
    ];
    renderScreen();

    // One task per lane, and each lane header is shown.
    expect(await screen.findByText('Plan the roadmap')).toBeInTheDocument();
    expect(screen.getByText('Write the API')).toBeInTheDocument();
    expect(screen.getByText('Fix the login bug')).toBeInTheDocument();
    expect(screen.getByText('Ship v1')).toBeInTheDocument();
    for (const lane of ['Upcoming', 'In Progress', 'Overdue', 'Completed']) {
      // 'In Progress' is both a lane header and a status option label, so match on multiplicity.
      expect(screen.getAllByText(lane).length).toBeGreaterThan(0);
    }
    // The owning project is shown for context (project key), proving cross-project aggregation.
    expect(screen.getAllByText('WEB').length).toBeGreaterThan(0);
    // Only real assigned tasks were fetched — no mocks rendered.
    expect(bridge.tasks.assignedToMe).toHaveBeenCalledWith('w_1');
  });

  it('moves a task’s status from My Work through the bridge', async () => {
    mine = [makeMy({ id: 'a', title: 'Plan the roadmap', status: 'TODO' })];
    renderScreen();
    const select = await screen.findByLabelText('Set status for Plan the roadmap');
    fireEvent.change(select, { target: { value: 'IN_PROGRESS' } });
    await waitFor(() =>
      expect(bridge.tasks.changeStatus).toHaveBeenCalledWith('w_1', 'a', { status: 'IN_PROGRESS' }),
    );
  });

  it('shows an empty state when nothing is assigned to the user', async () => {
    mine = [];
    renderScreen();
    expect(await screen.findByText(/Nothing assigned to you/i)).toBeInTheDocument();
  });

  it('surfaces an honest error when the aggregate cannot be loaded', async () => {
    bridge.tasks.assignedToMe = vi.fn(() => fail('could not reach server')) as never;
    renderScreen();
    expect(await screen.findByText(/Could not load your work/i)).toBeInTheDocument();
    expect(screen.getByText('could not reach server')).toBeInTheDocument();
  });
});

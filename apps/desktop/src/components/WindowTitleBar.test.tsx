import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopBridge, DesktopWindowState, IpcOutcome } from '@buildtogether/shared';
import { WindowTitleBar } from './WindowTitleBar';

const ok = <T,>(data: T): IpcOutcome<T> => ({ ok: true, data });

describe('WindowTitleBar', () => {
  let stateListener: ((state: DesktopWindowState) => void) | undefined;
  let bridge: DesktopBridge;

  beforeEach(() => {
    stateListener = undefined;
    const windowApi = {
      minimize: vi.fn(async () => ok(null)),
      toggleMaximize: vi.fn(async () => {
        stateListener?.({ isMaximized: true, isFullScreen: false });
        return ok(null);
      }),
      toggleFullScreen: vi.fn(async () => ok(null)),
      getState: vi.fn(async () => ok({ isMaximized: false, isFullScreen: false })),
      onStateChanged: vi.fn((listener: (state: DesktopWindowState) => void) => {
        stateListener = listener;
        return () => {
          stateListener = undefined;
        };
      }),
      close: vi.fn(async () => ok(null)),
    };
    bridge = {
      getConfig: vi.fn(),
      getPlatformInfo: vi.fn(async () => ok({ platform: 'win32', arch: 'x64' })),
      openExternal: vi.fn(),
      window: windowApi,
    } as unknown as DesktopBridge;
    Object.defineProperty(window, 'bt', { configurable: true, value: bridge });
  });

  it('renders Cue branding and working window controls on Windows', async () => {
    render(<WindowTitleBar platform="win32" />);

    expect(screen.getByText('CUE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Minimize window' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Maximize window' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Maximize window' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Restore window' })).toBeInTheDocument(),
    );
    expect(bridge.window.toggleMaximize).toHaveBeenCalledOnce();
  });

  it('toggles maximize on title-bar double click and fullscreen with F11', async () => {
    render(<WindowTitleBar platform="win32" />);

    fireEvent.doubleClick(screen.getByRole('banner', { name: 'Cue window title bar' }));
    expect(bridge.window.toggleMaximize).toHaveBeenCalledOnce();

    fireEvent.keyDown(window, { key: 'F11' });
    expect(bridge.window.toggleFullScreen).toHaveBeenCalledOnce();
  });

  it('hides custom chrome outside Windows', () => {
    const { rerender } = render(<WindowTitleBar platform="darwin" />);
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();

    rerender(<WindowTitleBar platform="win32" />);
    act(() => stateListener?.({ isMaximized: false, isFullScreen: true }));
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });
});

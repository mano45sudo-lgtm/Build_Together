import { useEffect, useState, type MouseEvent } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import type { DesktopWindowState, IpcOutcome } from '@buildtogether/shared';

const INITIAL_STATE: DesktopWindowState = { isMaximized: false, isFullScreen: false };
type WindowAction = () => Promise<IpcOutcome<null>>;

function runWindowAction(action: WindowAction | undefined): void {
  if (!action) return;
  void action()
    .then((result) => {
      if (!result.ok) console.error('[desktop] window control failed', result.error.message);
    })
    .catch((error: unknown) => {
      console.error('[desktop] window control failed', error);
    });
}

interface WindowTitleBarProps {
  platform: string;
}

/** Windows-only custom chrome; native window controls remain in use on other platforms. */
export function WindowTitleBar({ platform }: WindowTitleBarProps) {
  const [state, setState] = useState(INITIAL_STATE);
  const isWindows = platform === 'win32';
  const windowBridge = isWindows ? window.bt?.window : undefined;

  useEffect(() => {
    if (!windowBridge) return;
    const unsubscribe = windowBridge.onStateChanged(setState);
    void windowBridge
      .getState()
      .then((result) => {
        if (result.ok) setState(result.data);
      })
      .catch((error: unknown) => {
        console.error('[desktop] unable to read window state', error);
      });
    return unsubscribe;
  }, [windowBridge]);

  useEffect(() => {
    if (!windowBridge) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F11') {
        event.preventDefault();
        runWindowAction(windowBridge.toggleFullScreen);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [windowBridge]);

  if (!isWindows || state.isFullScreen) return null;

  const toggleMaximize = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('[data-window-controls]')) return;
    runWindowAction(windowBridge?.toggleMaximize);
  };

  const controlClass =
    'window-no-drag inline-flex h-9 w-11 items-center justify-center text-secondary transition-colors hover:bg-surface-3 hover:text-primary active:bg-surface-2 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <header
      role="banner"
      className="window-drag-region relative z-50 flex h-9 shrink-0 items-center border-b border-border-subtle bg-[#0d0d0d] text-primary"
      onDoubleClick={toggleMaximize}
      aria-label="Cue window title bar"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
        <span className="grid size-5 shrink-0 place-items-center rounded border border-border-default bg-surface-2 text-[10px] font-semibold tracking-tight">
          C
        </span>
        <span className="truncate text-xs font-medium tracking-wide text-secondary">CUE</span>
      </div>

      <div className="window-no-drag flex h-full shrink-0" data-window-controls>
        <button
          type="button"
          className={controlClass}
          aria-label="Minimize window"
          title="Minimize"
          disabled={!windowBridge}
          onClick={() => runWindowAction(windowBridge?.minimize)}
        >
          <Minus className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={controlClass}
          aria-label={state.isMaximized ? 'Restore window' : 'Maximize window'}
          aria-pressed={state.isMaximized}
          title={state.isMaximized ? 'Restore' : 'Maximize'}
          disabled={!windowBridge}
          onClick={() => runWindowAction(windowBridge?.toggleMaximize)}
        >
          {state.isMaximized ? (
            <Copy className="size-3" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Square className="size-3" strokeWidth={1.5} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className={`${controlClass} hover:bg-[#c42b1c] hover:text-white active:bg-[#a92317]`}
          aria-label="Close window"
          title="Close"
          disabled={!windowBridge}
          onClick={() => runWindowAction(windowBridge?.close)}
        >
          <X className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

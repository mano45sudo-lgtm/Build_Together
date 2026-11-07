import { useEffect, useState, type ReactNode } from 'react';
import { WindowTitleBar } from './WindowTitleBar';

export function DesktopWindowFrame({ children }: { children: ReactNode }) {
  const [platform, setPlatform] = useState('');

  useEffect(() => {
    void window.bt
      ?.getPlatformInfo()
      .then((result) => {
        if (result.ok) setPlatform(result.data.platform);
      })
      .catch((error: unknown) => {
        console.error('[desktop] unable to detect window platform', error);
      });
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-canvas text-primary">
      <WindowTitleBar platform={platform} />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

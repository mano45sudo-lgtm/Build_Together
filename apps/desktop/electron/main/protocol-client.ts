export interface ProtocolClientRegistrationInput {
  protocol: string;
  platform: NodeJS.Platform;
  isPackaged: boolean;
  executablePath: string;
  appPath: string;
}

export type ProtocolClientRegistration =
  | { protocol: string; executablePath: string; args: string[] }
  | { protocol: string };

/**
 * Electron's generic executable needs the app path when it handles a custom URL in Windows dev.
 * Packaged apps are registered against their own executable by Electron / the installer.
 */
export function getProtocolClientRegistration({
  protocol,
  platform,
  isPackaged,
  executablePath,
  appPath,
}: ProtocolClientRegistrationInput): ProtocolClientRegistration {
  if (platform === 'win32' && !isPackaged) {
    return { protocol, executablePath, args: [appPath] };
  }
  return { protocol };
}

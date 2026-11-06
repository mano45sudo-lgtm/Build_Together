import { describe, expect, it } from 'vitest';
import { getProtocolClientRegistration } from '../../electron/main/protocol-client';

describe('Windows custom protocol registration', () => {
  it('passes the Electron app path while running un-packaged on Windows', () => {
    expect(getProtocolClientRegistration({
      protocol: 'app',
      platform: 'win32',
      isPackaged: false,
      executablePath: 'C:/Program Files/Electron/electron.exe',
      appPath: 'C:/BuildTogether/apps/desktop',
    })).toEqual({
      protocol: 'app',
      executablePath: 'C:/Program Files/Electron/electron.exe',
      args: ['C:/BuildTogether/apps/desktop'],
    });
  });

  it('leaves packaged Windows protocol registration to the packaged executable', () => {
    expect(getProtocolClientRegistration({
      protocol: 'app',
      platform: 'win32',
      isPackaged: true,
      executablePath: 'C:/Program Files/BuildTogether/BuildTogether.exe',
      appPath: 'C:/Program Files/BuildTogether/resources/app.asar',
    })).toEqual({ protocol: 'app' });
  });
});

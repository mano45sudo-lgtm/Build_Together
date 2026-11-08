import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertNoSharedEnvironmentValues, buildEnvironmentForMode } from './build-env';

const dirs: string[] = [];

function envDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'cue-env-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('buildEnvironmentForMode', () => {
  it('maps the two supported Vite modes', () => {
    expect(buildEnvironmentForMode('development')).toBe('development');
    expect(buildEnvironmentForMode('production')).toBe('production');
  });

  it('rejects any other mode instead of guessing', () => {
    expect(() => buildEnvironmentForMode('staging')).toThrow(/Unsupported desktop build mode/);
  });
});

describe('assertNoSharedEnvironmentValues', () => {
  it('passes when only mode files hold environment values', () => {
    const dir = envDir({
      '.env': '# shared notes only\nSOME_SHARED_FLAG=1\n',
      '.env.development': 'BT_API_BASE_URL="http://localhost:4000"\n',
      '.env.production': 'BT_API_BASE_URL="https://api.example.com"\n',
    });
    expect(() => assertNoSharedEnvironmentValues(dir)).not.toThrow();
  });

  it('passes when no env files exist (CI injects process env)', () => {
    expect(() => assertNoSharedEnvironmentValues(envDir({}))).not.toThrow();
  });

  it('ignores keys that are present but empty', () => {
    const dir = envDir({ '.env': 'BT_API_BASE_URL=""\n' });
    expect(() => assertNoSharedEnvironmentValues(dir)).not.toThrow();
  });

  it('names every leaking key in .env and .env.local', () => {
    const dir = envDir({
      '.env': 'BT_API_BASE_URL="http://localhost:4000"\nVITE_CLERK_PUBLISHABLE_KEY="pk_test_x"\n',
      '.env.local': 'VITE_API_BASE_URL=http://localhost:4000\n',
    });
    expect(() => assertNoSharedEnvironmentValues(dir)).toThrow(
      /\.env: BT_API_BASE_URL.*\.env: VITE_CLERK_PUBLISHABLE_KEY.*\.env\.local: VITE_API_BASE_URL.*\.env\.development/,
    );
  });
});

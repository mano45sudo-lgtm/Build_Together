import { describe, expect, it } from 'vitest';
import { resolveRuntimeEnvironment } from './runtime-environment.js';

describe('resolveRuntimeEnvironment', () => {
  it.each(['development', 'test', 'production'] as const)('accepts %s', (value) => {
    expect(resolveRuntimeEnvironment(value)).toBe(value);
  });

  it('keeps the existing development default when NODE_ENV is unset or empty', () => {
    expect(resolveRuntimeEnvironment(undefined)).toBe('development');
    expect(resolveRuntimeEnvironment('')).toBe('development');
  });

  it.each(['staging', 'prod', 'qa'])(
    'rejects unsupported value %s instead of defaulting',
    (value) => {
      expect(() => resolveRuntimeEnvironment(value)).toThrow(/NODE_ENV must be one of/);
    },
  );

  it.each(['Production', 'PRODUCTION', ' production', 'production ', 'Development'])(
    'rejects wrong casing or surrounding whitespace (%j)',
    (value) => {
      expect(() => resolveRuntimeEnvironment(value)).toThrow(/exact, lowercase/);
    },
  );

  it('never echoes the rejected value', () => {
    let message = '';
    try {
      resolveRuntimeEnvironment('secret-looking-value');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/NODE_ENV/);
    expect(message).not.toContain('secret-looking-value');
  });
});

import { describe, expect, it } from 'vitest';
import { resolveRequestId } from './request-log.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('reuses a plain client id (UUID or trace id)', () => {
    const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    expect(resolveRequestId(uuid)).toBe(uuid);
    expect(resolveRequestId('trace.abc_123:span-9')).toBe('trace.abc_123:span-9');
  });

  it('generates one when absent', () => {
    expect(resolveRequestId(undefined)).toMatch(UUID);
  });

  it.each([
    '',
    'x'.repeat(129),
    'has space',
    'line\nbreak',
    '<script>',
    '{"json":true}',
    'ünïcode',
  ])('replaces an unsafe or oversized id (%j)', (value) => {
    expect(resolveRequestId(value)).toMatch(UUID);
  });

  it('accepts the 128-character maximum', () => {
    const max = 'a'.repeat(128);
    expect(resolveRequestId(max)).toBe(max);
  });
});

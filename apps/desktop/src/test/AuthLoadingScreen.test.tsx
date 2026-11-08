import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthLoadingScreen } from '../features/auth/AuthLoadingScreen';

describe('AuthLoadingScreen', () => {
  it.each([
    ['restoring', /starting cue/i],
    ['verifying', /signing you in/i],
    ['workspace', /loading your workspace/i],
  ] as const)('announces the %s phase', (phase, text) => {
    render(<AuthLoadingScreen phase={phase} />);
    expect(screen.getByRole('status')).toHaveTextContent(text);
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  });
});

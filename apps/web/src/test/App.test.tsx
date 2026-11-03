import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';

// Toolchain smoke test: confirms the Vitest + jsdom + Testing Library + React render path
// works. Feature/component tests are added with real UI in later phases.
describe('web scaffold', () => {
  it('renders the BuildTogether placeholder', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /buildtogether/i })).toBeInTheDocument();
  });
});

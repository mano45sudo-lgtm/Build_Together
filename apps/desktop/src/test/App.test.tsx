import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';

describe('desktop shell', () => {
  it('renders the project-centric primary navigation', async () => {
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: /primary/i });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /projects/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decision vault/i })).toBeInTheDocument();
  });

  it('shows an honest placeholder instead of fake product data', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: /placeholder/i })).toBeInTheDocument();
    expect(screen.getByText(/no product data is shown/i)).toBeInTheDocument();
  });
});

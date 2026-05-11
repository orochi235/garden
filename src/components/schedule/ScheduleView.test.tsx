import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScheduleView } from './ScheduleView';

describe('ScheduleView', () => {
  it('renders nothing meaningful when no plants supplied', () => {
    render(<ScheduleView plants={[]} targetTransplantDate="2026-05-15" />);
    expect(screen.getByText(/no plants/i)).toBeDefined();
  });

  it('renders a transplant action for a single tomato plant', () => {
    render(
      <ScheduleView
        plants={[{ id: 'p1', cultivarId: 'tomato.brandywine', label: 'My Brandywine' }]}
        targetTransplantDate="2026-05-15"
        lastFrostDate="2026-04-30"
      />,
    );
    expect(screen.getByText(/transplant outdoors/i)).toBeDefined();
    expect(screen.getByText(/my brandywine/i)).toBeDefined();
  });

  it('toggles between flat / by-date / by-plant views', () => {
    const { container } = render(
      <ScheduleView
        plants={[{ id: 'p1', cultivarId: 'tomato.brandywine' }]}
        targetTransplantDate="2026-05-15"
        lastFrostDate="2026-04-30"
      />,
    );
    expect(screen.getByRole('button', { name: /flat/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /by date/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /by plant/i })).toBeDefined();
    expect(container).toBeDefined();
  });
});

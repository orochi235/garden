import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Boom({ explode }: { explode: boolean }): React.ReactElement {
  if (explode) throw new Error('kaboom');
  return <div>alive</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error itself; keep the test output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary label="Canvas">
        <Boom explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('alive')).toBeTruthy();
  });

  it('shows a labeled fallback instead of unmounting the tree', () => {
    render(
      <ErrorBoundary label="Canvas">
        <Boom explode={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Canvas stopped working');
    expect(screen.getByRole('alert').textContent).toContain('kaboom');
  });

  it('contains the crash: a sibling region keeps rendering', () => {
    render(
      <div>
        <ErrorBoundary label="Canvas">
          <Boom explode={true} />
        </ErrorBoundary>
        <ErrorBoundary label="Sidebar">
          <div>sidebar content</div>
        </ErrorBoundary>
      </div>,
    );
    // This is the whole point — one crashed region must not take the app with
    // it, so the user can still save and reload.
    expect(screen.getByText('sidebar content')).toBeTruthy();
  });

  it('"Try again" remounts the subtree once the cause is gone', async () => {
    const user = userEvent.setup();

    function Harness(): React.ReactElement {
      const [explode, setExplode] = useState(true);
      return (
        <div>
          <button type="button" onClick={() => setExplode(false)}>
            fix it
          </button>
          <ErrorBoundary label="Canvas">
            <Boom explode={explode} />
          </ErrorBoundary>
        </div>
      );
    }

    render(<Harness />);
    expect(screen.getByRole('alert')).toBeTruthy();

    await user.click(screen.getByText('fix it'));
    await user.click(screen.getByText('Try again'));

    expect(screen.getByText('alive')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

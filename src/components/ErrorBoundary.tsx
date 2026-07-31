import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';

interface Props {
  /** Shown in the fallback so a user can say *what* broke. */
  label: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Contains a render/commit crash to one region of the app.
 *
 * Without a boundary anywhere, React unmounts the whole tree on any thrown
 * render — one bad click blanks the entire page, losing the unsaved garden
 * along with it. With one, the rest of the app (menu bar, palette, save) keeps
 * working while the broken region shows a retry.
 *
 * `Try again` remounts the subtree by clearing the error. That is a real fix
 * for a transient crash (a stale ref, an animation reading past the end of an
 * array mid-transition) and a no-op loop for a deterministic one — which is
 * why the fallback also says what to do when it keeps failing.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the component stack — the message alone rarely names the culprit.
    console.error(`[${this.props.label}] crashed:`, error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className={styles.fallback} role="alert">
        <div className={styles.title}>{this.props.label} stopped working</div>
        <div className={styles.detail}>{error.message}</div>
        <button type="button" className={styles.retry} onClick={this.reset}>
          Try again
        </button>
        <div className={styles.hint}>
          If it keeps failing, save your garden and reload the page.
        </div>
      </div>
    );
  }
}

import type { ReactNode } from 'react';

interface CardProps {
  title: string;
  description: string;
  hint?: string;
  canvas: ReactNode;
  source: string;
}

export function Card({ title, description, hint, canvas, source }: CardProps) {
  return (
    <section className="ckd-card">
      <h2>{title}</h2>
      <p className="ckd-desc">{description}</p>
      <div className="ckd-body">
        <div className="ckd-canvas-wrap">
          {canvas}
          {hint && <span className="ckd-hint">{hint}</span>}
        </div>
        <div className="ckd-source">
          <pre><code>{source}</code></pre>
        </div>
      </div>
    </section>
  );
}

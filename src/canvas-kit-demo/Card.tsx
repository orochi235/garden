import type { ReactNode } from 'react';
import { Highlight, themes } from 'prism-react-renderer';

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
          <Highlight code={source.trim()} language="tsx" theme={themes.vsDark}>
            {({ className, style, tokens, getLineProps, getTokenProps }) => (
              <pre className={className} style={{ ...style, background: 'transparent', margin: 0 }}>
                {tokens.map((line, i) => {
                  const { key: _lk, ...lineProps } = getLineProps({ line });
                  return (
                    <div key={i} {...lineProps}>
                      {line.map((token, j) => {
                        const { key: _tk, ...tokenProps } = getTokenProps({ token });
                        return <span key={j} {...tokenProps} />;
                      })}
                    </div>
                  );
                })}
              </pre>
            )}
          </Highlight>
        </div>
      </div>
    </section>
  );
}

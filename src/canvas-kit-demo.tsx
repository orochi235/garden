import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CanvasKitDemo } from './canvas-kit-demo/CanvasKitDemo';
import './canvas-kit-demo/canvas-kit-demo.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CanvasKitDemo />
  </StrictMode>,
);

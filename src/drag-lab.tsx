import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DragLab } from './drag-lab/DragLab';
import './drag-lab/drag-lab.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DragLab />
  </StrictMode>,
);

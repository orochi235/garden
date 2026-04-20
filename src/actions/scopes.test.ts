// src/actions/scopes.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { getActiveScopePath } from './scopes';
import { useUiStore } from '../store/uiStore';

describe('getActiveScopePath', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
  });

  it('returns [structures, canvas, global] when structures layer is active and no input focused', () => {
    useUiStore.getState().setActiveLayer('structures');
    const path = getActiveScopePath();
    expect(path).toEqual(['structures', 'canvas', 'global']);
  });

  it('returns [global] when an input element is focused', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const path = getActiveScopePath();
    expect(path).toEqual(['sidebar', 'global']);
    document.body.removeChild(input);
  });

  it('returns [zones, canvas, global] when zones layer is active', () => {
    useUiStore.getState().setActiveLayer('zones');
    const path = getActiveScopePath();
    expect(path).toEqual(['zones', 'canvas', 'global']);
  });

  it('prefers canvas branch over sidebar even when properties is active', () => {
    useUiStore.getState().select('some-id');
    useUiStore.getState().setActiveLayer('structures');
    const path = getActiveScopePath();
    // Canvas branch wins because it appears first in the tree
    expect(path).toEqual(['structures', 'canvas', 'global']);
  });

  it('returns properties path when input is focused and selection exists', () => {
    useUiStore.getState().select('some-id');
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const path = getActiveScopePath();
    expect(path).toEqual(['properties', 'sidebar', 'global']);
    document.body.removeChild(input);
  });
});

// @vitest-environment jsdom
import { StrictMode } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import DiagramCanvas from './DiagramCanvas';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('retains graph nodes through StrictMode effect replay', async () => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  render(<StrictMode><DiagramCanvas diagram={{
    title: '学习路径',
    nodes: [{ id: 'a', label: '基础概念' }, { id: 'b', label: '应用实践' }],
    edges: [{ source: 'a', target: 'b', label: '应用' }],
  }} /></StrictMode>);
  expect(await screen.findByText('基础概念')).toBeTruthy();
  expect(screen.getByText('应用实践')).toBeTruthy();
  expect(document.querySelectorAll('.react-flow__node')).toHaveLength(2);
  expect(screen.getByText('基础概念').closest('.react-flow__node')?.getAttribute('style'))
    .toContain('translate(0px,0px)');
  expect(screen.getByText('应用实践').closest('.react-flow__node')?.getAttribute('style'))
    .toContain('translate(0px,150px)');
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { api } from './api';

const chapters = Array.from({ length: 7 }, (_, i) => ({
  id: `chapter-${i + 1}`, title: `第${i + 1}章 计算机组成`, filename: 'a.pptx', slideCount: 3,
}));
beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(api, 'chapters').mockResolvedValue(chapters);
  vi.spyOn(api, 'health').mockResolvedValue({ status: 'ok', mode: 'ai', missing: [] });
  vi.spyOn(api, 'chapter').mockImplementation(async id => ({
    ...chapters.find(c => c.id === id)!, slides: [{ number: 1, title: '概述', text: '正文', notes: '' }],
  }));
  vi.spyOn(api, 'outline').mockResolvedValue({ chapterId: 'chapter-5', title: '大纲', nodes: [], edges: [] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('root always opens the seven-chapter home and preserves resume pages', async () => {
  localStorage.setItem('chapter-tutor:last-chapter', 'chapter-5');
  localStorage.setItem('chapter-tutor:v1:chapter-5', JSON.stringify({ slide: 2, messages: [] }));
  render(<App />);
  expect(await screen.findByRole('heading', { name: '学习空间' })).toBeTruthy();
  expect(screen.getAllByRole('link', { name: /打开章节/ })).toHaveLength(7);
  expect(screen.getByText('上次读到第 2 页')).toBeTruthy();
  expect(api.chapter).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('link', { name: `打开章节：${chapters[4].title}` }));
  expect(await screen.findByRole('heading', { name: chapters[4].title })).toBeTruthy();
  expect(window.location.hash).toBe('#/chapter/chapter-5');
  fireEvent.click(screen.getByRole('button', { name: '返回学习空间' }));
  expect(await screen.findByRole('heading', { name: '学习空间' })).toBeTruthy();
});

it('shows missing configuration and rechecks after restart', async () => {
  vi.mocked(api.health).mockResolvedValueOnce({ status: 'ok', mode: 'unconfigured', missing: ['OPENAI_API_KEY'] });
  render(<App />);
  expect(await screen.findByText('Copy-Item .env.example .env')).toBeTruthy();
  expect(screen.getByText(/OPENAI_API_KEY/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '重新检查连接' }));
  await waitFor(() => expect(screen.queryByText('Copy-Item .env.example .env')).toBeNull());
});

it('keeps chapter reading available when health cannot be reached', async () => {
  vi.mocked(api.health).mockRejectedValue(new TypeError('Failed to fetch'));
  render(<App />);
  expect(await screen.findByRole('heading', { name: '学习空间' })).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: `打开章节：${chapters[0].title}` }));
  expect(await screen.findByRole('heading', { name: chapters[0].title })).toBeTruthy();
  expect(screen.getByRole('button', { name: '开始讲解' })).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('button', { name: '打开课件' }));
  expect(screen.getByLabelText('课件页码')).toBeTruthy();
});

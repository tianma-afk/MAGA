// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import GlobalSearch from './GlobalSearch';
import { api } from './api';

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function openPanel(onOpen = vi.fn()) {
  render(<GlobalSearch onOpen={onOpen} />);
  fireEvent.click(screen.getByRole('button', { name: '搜索课件' }));
  return screen.getByRole('searchbox', { name: '跨章搜索' });
}

function edit(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

function searchClick() {
  fireEvent.click(screen.getByRole('button', { name: '搜索' }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

const results = [{
  chapterId: 'chapter-5', chapterTitle: 'Chapter 5: Availability', slide: 17,
  slideTitle: 'Heartbeat', snippet: 'Heartbeat detects failure.', score: 4,
}];

it('searches and opens a result', async () => {
  const search = vi.spyOn(api, 'search').mockResolvedValue({ query: 'heartbeat', results });
  const onOpen = vi.fn();
  const input = openPanel(onOpen);
  edit(input, ' heartbeat ');
  searchClick();
  expect(await screen.findByText('Heartbeat')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain('搜索词：heartbeat');
  expect(search).toHaveBeenCalledWith('heartbeat', expect.any(AbortSignal));
  edit(input, '另一关键词');
  expect(screen.queryByText('Heartbeat')).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('关键词已修改');
  edit(input, 'heartbeat');
  searchClick();
  await screen.findByText('Heartbeat');
  fireEvent.click(screen.getByRole('button', { name: /Chapter 5.*第 17 页/ }));
  expect(onOpen).toHaveBeenCalledWith('chapter-5', 17);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('shows empty and error states', async () => {
  vi.spyOn(api, 'search').mockResolvedValueOnce({ query: 'none', results: [] })
    .mockRejectedValueOnce(new Error('搜索失败'));
  const input = openPanel();
  edit(input, 'none');
  searchClick();
  expect(await screen.findByText('没有找到相关内容。')).toBeTruthy();
  edit(input, 'boom');
  searchClick();
  expect(await screen.findByRole('alert')).toHaveProperty('textContent',
    expect.stringContaining('搜索失败'));
});

it('keeps the new response when the cancelled request resolves late', async () => {
  const old = deferred<Awaited<ReturnType<typeof api.search>>>();
  const search = vi.spyOn(api, 'search').mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce({ query: 'new', results: [] });
  const input = openPanel();
  edit(input, 'heartbeat');
  searchClick();
  expect(screen.getByRole('status').textContent).toContain('正在搜索');
  edit(input, 'new');
  expect(search.mock.calls[0][1]?.aborted).toBe(true);
  searchClick();
  await screen.findByText('没有找到相关内容。');
  await act(async () => { old.resolve({ query: 'heartbeat', results }); });
  expect(screen.queryByText('Heartbeat')).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('搜索词：new');
});

it.each(['清空', '关闭'])('%s cancels pending work and prevents stale errors', async action => {
  const pending = deferred<Awaited<ReturnType<typeof api.search>>>();
  const search = vi.spyOn(api, 'search').mockReturnValue(pending.promise);
  const input = openPanel();
  edit(input, 'heartbeat');
  searchClick();
  fireEvent.click(screen.getByRole('button', { name: action }));
  expect(search.mock.calls[0][1]?.aborted).toBe(true);
  await act(async () => { pending.reject(new Error('已过期的请求错误')); });
  if (action === '关闭') {
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '搜索课件' }));
  }
  expect(screen.getByRole('searchbox')).toHaveProperty('value', '');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: '搜索' })).toHaveProperty('disabled', true);
});

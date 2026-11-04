// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import GlobalSearch from './GlobalSearch';
import { api } from './api';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const results = [{
  chapterId: 'chapter-5', chapterTitle: 'Chapter 5: Availability', slide: 17,
  slideTitle: 'Heartbeat', snippet: 'Heartbeat detects failure.', score: 4,
}];

it('searches and opens a result', async () => {
  const search = vi.spyOn(api, 'search').mockResolvedValue({ query: 'heartbeat', results });
  const onOpen = vi.fn();
  render(<GlobalSearch onOpen={onOpen} />);
  fireEvent.change(screen.getByRole('searchbox', { name: '跨章搜索' }), {
    target: { value: 'heartbeat' },
  });
  fireEvent.submit(screen.getByRole('search'));
  expect(await screen.findByText('Heartbeat')).toBeTruthy();
  expect(search).toHaveBeenCalledWith('heartbeat', expect.any(AbortSignal));
  fireEvent.click(screen.getByRole('button', { name: /Chapter 5.*第 17 页/ }));
  expect(onOpen).toHaveBeenCalledWith('chapter-5', 17);
  expect(screen.queryByText('Heartbeat')).toBeNull();
});

it('shows empty and error states', async () => {
  vi.spyOn(api, 'search').mockResolvedValueOnce({ query: 'none', results: [] })
    .mockRejectedValueOnce(new Error('搜索失败'));
  render(<GlobalSearch onOpen={vi.fn()} />);
  const input = screen.getByRole('searchbox', { name: '跨章搜索' });
  fireEvent.change(input, { target: { value: 'none' } });
  fireEvent.submit(screen.getByRole('search'));
  expect(await screen.findByText('没有找到相关内容。')).toBeTruthy();
  fireEvent.change(input, { target: { value: 'boom' } });
  fireEvent.submit(screen.getByRole('search'));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent',
    expect.stringContaining('搜索失败'));
});

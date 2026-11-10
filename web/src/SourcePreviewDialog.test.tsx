// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SourcePreviewDialog from './SourcePreviewDialog';
import { api } from './api';
import type { ChapterDetail } from './types';

const chapter: ChapterDetail = {
  id: 'chapter-5', title: '第5章 可用性', filename: 'chapter5.pptx', slideCount: 2,
  slides: [
    { number: 1, title: '可用性概述', text: '可用性正文', notes: '' },
    { number: 2, title: '心跳检测', text: '心跳正文', notes: '讲者备注', ocrText: 'OCR 文本' },
  ],
};

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true; }) },
    close: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = false; }) },
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each([0, -1, 3, 1.5, NaN])('rejects stale or noninteger citation %s without fabricating a page', async slide => {
  vi.spyOn(api, 'chapter').mockResolvedValue(chapter);
  render(<SourcePreviewDialog chapterId="chapter-5" slide={slide} onClose={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent',
    expect.stringContaining('引用来源已失效，课件可能更新'));
  expect(screen.queryByText(/此页未提取到文字/)).toBeNull();
  expect(screen.queryByLabelText('课件页码')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '查看当前课件首页' }));
  expect(screen.getByRole('heading', { name: '可用性概述' })).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain('原引用');
  expect(screen.getByRole('alert').textContent).toContain('当前浏览');
});

it('rejects missing pages and allows only existing pages after explicit recovery', async () => {
  vi.spyOn(api, 'chapter').mockResolvedValue({ ...chapter, slideCount: 3,
    slides: [chapter.slides[0], { ...chapter.slides[1], number: 3 }] });
  render(<SourcePreviewDialog chapterId="chapter-5" slide={2} onClose={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('引用来源已失效'));
  fireEvent.click(screen.getByRole('button', { name: '查看当前课件首页' }));
  expect(screen.queryByRole('option', { name: /^2$/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  expect(screen.getByRole('heading', { name: '心跳检测' })).toBeTruthy();
  expect(screen.getByLabelText('课件页码')).toHaveProperty('value', '3');
});

it('does not reuse recovery across targets or accept an aborted chapter response', async () => {
  let old!: (value: ChapterDetail) => void;
  const load = vi.spyOn(api, 'chapter').mockImplementationOnce(() => new Promise(resolve => { old = resolve; }))
    .mockResolvedValue(chapter);
  const view = render(<SourcePreviewDialog chapterId="old" slide={1} onClose={vi.fn()} />);
  view.rerender(<SourcePreviewDialog chapterId="chapter-5" slide={9} onClose={vi.fn()} />);
  expect(load.mock.calls[0][1].aborted).toBe(true);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('引用来源已失效'));
  old({ ...chapter, title: '过期响应' });
  fireEvent.click(screen.getByRole('button', { name: '查看当前课件首页' }));
  view.rerender(<SourcePreviewDialog chapterId="chapter-5" slide={2} onClose={vi.fn()} />);
  expect(await screen.findByRole('heading', { name: '心跳检测' })).toBeTruthy();
  expect(screen.queryByText(/过期响应/)).toBeNull();
  view.rerender(<SourcePreviewDialog chapterId="chapter-5" slide={8} onClose={vi.fn()} />);
  expect(screen.getByRole('alert').textContent).toContain('引用来源已失效');
  expect(screen.queryByLabelText('课件页码')).toBeNull();
});

it('uses the latest citation when the same chapter finishes loading', async () => {
  let resolve!: (value: ChapterDetail) => void;
  const load = vi.spyOn(api, 'chapter').mockReturnValue(new Promise(done => { resolve = done; }));
  const view = render(<SourcePreviewDialog chapterId="chapter-5" slide={1} onClose={vi.fn()} />);
  view.rerender(<SourcePreviewDialog chapterId="chapter-5" slide={2} onClose={vi.fn()} />);
  resolve(chapter);
  expect(await screen.findByRole('heading', { name: '心跳检测' })).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(1);
});

it('opens on the cited slide and keeps its own page while browsing', async () => {
  vi.spyOn(api, 'chapter').mockResolvedValue(chapter);
  const onClose = vi.fn();
  render(<SourcePreviewDialog chapterId="chapter-5" slide={2} onClose={onClose} />);

  expect(await screen.findByRole('heading', { name: '心跳检测' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: '第5章 可用性 · 第 2 页' })).toBeTruthy();
  expect(screen.getByText('讲者备注')).toBeTruthy();
  expect(screen.getByText('OCR 识别文本（可能有误）')).toBeTruthy();

  fireEvent.change(screen.getByLabelText('课件页码'), { target: { value: '1' } });
  expect(screen.getByRole('heading', { name: '可用性概述' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: '第5章 可用性 · 第 1 页' })).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: '关闭来源' }));
  expect(onClose).toHaveBeenCalled();
});

it('shows a safe error and retries loading the source', async () => {
  const load = vi.spyOn(api, 'chapter')
    .mockRejectedValueOnce(new Error('请求失败（502），请稍后重试。'))
    .mockResolvedValueOnce(chapter);
  render(<SourcePreviewDialog chapterId="chapter-5" slide={1} onClose={vi.fn()} />);

  expect(await screen.findByRole('alert')).toHaveProperty('textContent',
    expect.stringContaining('请求失败（502）'));
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(await screen.findByRole('heading', { name: '可用性概述' })).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(2);
});

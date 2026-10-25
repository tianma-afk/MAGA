// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Tutor from './Tutor';
import { api } from './api';
import type { ChapterDetail, ChatResponse } from './types';

const chapter: ChapterDetail = {
  id: 'chapter4', title: '第4章 处理器', filename: 'chapter4.pptx', slideCount: 2,
  slides: [
    { number: 1, title: '处理器概述', text: '课件正文', notes: '', imageUrl: '/api/slide.png' },
    { number: 2, title: '指令执行', text: '执行过程', notes: '' },
  ],
};
const response: ChatResponse = {
  content: '这是处理器的讲解。', slide: 2, citations: [{ slide: 1, title: '处理器概述' }], mode: 'offline',
};
beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount() {
  return render(<StrictMode><Tutor chapter={chapter} mode="offline" onMode={() => {}} /></StrictMode>);
}
function submit(text = '解释当前页') {
  fireEvent.change(screen.getByRole('textbox', { name: '向助教提问' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
}

it('sends a question, renders its answer and restores chapter history', async () => {
  vi.spyOn(api, 'chat').mockResolvedValue(response);
  const view = mount();
  submit();
  expect(await screen.findByText(response.content)).toBeTruthy();
  expect(screen.getByText('解释当前页', { selector: '.message-body' })).toBeTruthy();
  await waitFor(() => expect(JSON.parse(localStorage.getItem('chapter-tutor:v1:chapter4')!).messages).toHaveLength(2));
  view.unmount();
  mount();
  expect(screen.getByText(response.content)).toBeTruthy();
});

it('keeps failed input and retries without duplicating the exchange', async () => {
  vi.spyOn(api, 'chat').mockRejectedValueOnce(new Error('网络中断')).mockResolvedValue(response);
  mount();
  submit();
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('网络中断'));
  fireEvent.click(screen.getByRole('button', { name: '重试回复' }));
  expect(await screen.findByText(response.content)).toBeTruthy();
  expect(screen.getAllByText('解释当前页', { selector: '.message-body' })).toHaveLength(1);
});

it('aborts on unmount and ignores a late reply even when transport ignores cancellation', async () => {
  let resolve!: (value: ChatResponse) => void;
  let signal!: AbortSignal;
  vi.spyOn(api, 'chat').mockImplementation((_id, _text, _slide, _history, suppliedSignal) => {
    signal = suppliedSignal;
    return new Promise(done => { resolve = done; });
  });
  const view = mount();
  submit();
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(response));
  expect(JSON.parse(localStorage.getItem('chapter-tutor:v1:chapter4')!).messages).toEqual([]);
});

it('stops a reply without accepting stale output and permits another request', async () => {
  let resolve!: (value: ChatResponse) => void;
  vi.spyOn(api, 'chat').mockImplementationOnce(() => new Promise(done => { resolve = done; }))
    .mockResolvedValue({ ...response, content: '新回答' });
  mount();
  submit();
  fireEvent.click(screen.getByRole('button', { name: '停止回复' }));
  submit('新问题');
  expect(await screen.findByText('新回答')).toBeTruthy();
  await act(async () => resolve(response));
  expect(screen.queryByText(response.content)).toBeNull();
});

it('shows backend image URLs without substituting a fabricated slide', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: '打开课件' }));
  expect(screen.getByRole('img', { name: '第 1 页：处理器概述' }).getAttribute('src')).toBe('/api/slide.png');
});

it.each([
  ['开始讲解', '讲解本页'],
  ['本页自测', '自测'],
  ['继续学习', '继续学习'],
])('quick action %s sends the exact supported intent %s', async (label, intent) => {
  const chat = vi.spyOn(api, 'chat').mockResolvedValue(response);
  mount();
  fireEvent.click(screen.getByRole('button', { name: label }));
  await screen.findByText(response.content);
  expect(chat).toHaveBeenCalledWith('chapter4', intent, 1, [], expect.any(AbortSignal));
});

it('keeps study materials closed on initial desktop load', () => {
  const original = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  try {
    mount();
    expect(screen.queryByRole('complementary', { name: '学习资料' })).toBeNull();
  } finally {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: original });
  }
});

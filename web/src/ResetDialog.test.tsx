// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ResetDialog from './ResetDialog';

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true; }) },
    close: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = false; }) },
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('states the full clearing scope and honours both actions', () => {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(<ResetDialog onCancel={onCancel} onConfirm={onConfirm} />);

  expect(screen.getByRole('heading', { name: '重新开始本章？' })).toBeTruthy();
  expect(screen.getByText('对话记录与当前阅读页')).toBeTruthy();
  expect(screen.getByText('未提交的练习及其答案')).toBeTruthy();
  expect(screen.getByText('自测历史、错题回顾与大纲掌握度')).toBeTruthy();
  expect(screen.getByText('已记录的阅读进度')).toBeTruthy();
  expect(screen.getByText(/架构实践草稿和其他章节不受影响/)).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: '保留记录' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '清空本章' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

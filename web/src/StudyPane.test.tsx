// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import StudyPane from './StudyPane';
import type { ChapterDetail } from './types';

const chapter: ChapterDetail = {
  id: 'chapter5', title: '第5章 可用性', filename: 'chapter5.pptx', slideCount: 1,
  slides: [{
    number: 1, title: 'Checksum', text: '', notes: '',
    ocrText: 'Checksum 示例：0xA8 + 0x50 + 0x3F + 0x2D，最终结果 0x64。',
  }],
};

afterEach(cleanup);

it('shows OCR text honestly when present', () => {
  render(<StudyPane chapter={chapter} page={1} onPage={vi.fn()} pane="slides"
    onPane={vi.fn()} onClose={vi.fn()} busy={false} mode="ai" onMode={vi.fn()}
    onSource={vi.fn()} roadmap={{ outline: undefined, error: '', onRetry: vi.fn() }} />);
  expect(screen.getByText('OCR 识别文本（可能有误）')).toBeTruthy();
  expect(screen.getByText(/Checksum 示例/)).toBeTruthy();
  expect(screen.getByText(/含 OCR 文本/)).toBeTruthy();
});

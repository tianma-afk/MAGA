// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ConfirmDialog from './ConfirmDialog';
import SourcePreviewDialog from './SourcePreviewDialog';
import { api } from './api';

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true; }) },
    close: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = false; }) },
  });
  vi.spyOn(api, 'chapter').mockReturnValue(new Promise(() => {}));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

for (const kind of ['source', 'confirm']) {
  it(`${kind}: Escape stops at dialog without preventing native cancel`, () => {
    const close = vi.fn();
    render(kind === 'source' ? <SourcePreviewDialog chapterId="c" slide={1} onClose={close} />
      : <ConfirmDialog title="确认" cancelLabel="取消" confirmLabel="确认" onCancel={close} onConfirm={vi.fn()}>正文</ConfirmDialog>);
    const modal = screen.getByRole('dialog');
    const windowKey = vi.fn();
    window.addEventListener('keydown', windowKey);
    try {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      modal.dispatchEvent(event);
      expect(windowKey).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
      fireEvent(modal, new Event('cancel', { cancelable: true }));
      expect(close).toHaveBeenCalledTimes(1);
    } finally { window.removeEventListener('keydown', windowKey); }
  });

  it(`${kind}: requires both ends on backdrop and ignores dialog padding`, () => {
    const close = vi.fn();
    render(kind === 'source' ? <SourcePreviewDialog chapterId="c" slide={1} onClose={close} />
      : <ConfirmDialog title="确认" cancelLabel="取消" confirmLabel="确认" onCancel={close} onConfirm={vi.fn()}>正文</ConfirmDialog>);
    const modal = screen.getByRole('dialog');
    vi.spyOn(modal, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 500, top: 100, bottom: 500 } as DOMRect);
    const gesture = (start: number, end: number) => {
      fireEvent.mouseDown(modal, { button: 0, clientX: start, clientY: 200 });
      fireEvent.mouseUp(modal, { button: 0, clientX: end, clientY: 200 });
      fireEvent.click(modal, { button: 0, clientX: end, clientY: 200 });
    };
    gesture(200, 20); // browser retargets cross-backdrop clicks to dialog
    gesture(20, 200);
    gesture(110, 110); // padding targets dialog too
    expect(close).not.toHaveBeenCalled();
    gesture(20, 20);
    expect(close).toHaveBeenCalledTimes(1);
  });
}

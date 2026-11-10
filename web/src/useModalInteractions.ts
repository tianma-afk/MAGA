import { useEffect, useRef, type MouseEvent } from 'react';

/** Keep Escape's native cancel behavior; only a complete backdrop gesture closes. */
export default function useModalInteractions(onDismiss: () => void) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pressedOutside = useRef(false);
  const outside = (event: MouseEvent<HTMLDialogElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.target === event.currentTarget && (event.clientX < rect.left
      || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
  };
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, []);
  return {
    ref: dialog,
    onKeyDown: (event: React.KeyboardEvent<HTMLDialogElement>) => {
      if (event.key === 'Escape') event.stopPropagation();
    },
    onCancel: onDismiss,
    onMouseDown: (event: MouseEvent<HTMLDialogElement>) => {
      pressedOutside.current = event.button === 0 && outside(event);
    },
    onMouseUp: (event: MouseEvent<HTMLDialogElement>) => {
      const dismiss = pressedOutside.current && event.button === 0 && outside(event);
      pressedOutside.current = false;
      if (dismiss) onDismiss();
    },
  };
}

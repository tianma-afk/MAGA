import type { ReactNode } from 'react';
import useModalInteractions from './useModalInteractions';

interface Props {
  title: string;
  children: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Native modal confirmation so the destructive scope is stated before it runs. */
export default function ConfirmDialog({
  title, children, cancelLabel, confirmLabel, onCancel, onConfirm,
}: Props) {
  const interactions = useModalInteractions(onCancel);
  return <dialog {...interactions} className="reset-dialog" aria-labelledby="confirm-title">
    <div className="dialog-content">
      <h2 id="confirm-title">{title}</h2>
      <div className="dialog-scope">{children}</div>
      <div className="dialog-actions">
        <button className="text-button" autoFocus onClick={onCancel}>{cancelLabel}</button>
        <button className="danger-button" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  </dialog>;
}

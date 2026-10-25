import { useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';

export default function ResetDialog({ onCancel, onConfirm }:
  { onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="reset-dialog" aria-labelledby="reset-title"
    onCancel={onCancel} onClick={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <div className="dialog-content">
      <RotateCcw size={22} />
      <h2 id="reset-title">重新开始本章？</h2>
      <p>本章的对话记录将被清空，课件回到第 1 页。其他章节不受影响。</p>
      <div className="dialog-actions">
        <button className="text-button" autoFocus onClick={onCancel}>保留记录</button>
        <button className="danger-button" onClick={onConfirm}>清空本章</button>
      </div>
    </div>
  </dialog>;
}

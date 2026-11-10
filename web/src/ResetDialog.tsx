import { RotateCcw } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

export default function ResetDialog({ onCancel, onConfirm }:
  { onCancel: () => void; onConfirm: () => void }) {
  return <ConfirmDialog title="重新开始本章？" cancelLabel="保留记录"
    confirmLabel="清空本章" onCancel={onCancel} onConfirm={onConfirm}>
    <RotateCcw size={22} />
    <p>本章的以下本地记录将被清除，且无法恢复：</p>
    <ul>
      <li>对话记录与当前阅读页</li>
      <li>未提交的练习及其答案</li>
      <li>自测历史、错题回顾与大纲掌握度</li>
      <li>已记录的阅读进度</li>
    </ul>
    <p>架构实践草稿和其他章节不受影响。</p>
  </ConfirmDialog>;
}

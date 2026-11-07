import { BookOpen } from 'lucide-react';
import type { DesignCitation } from './types';

export default function DesignCitations({ citations, onOpen }: {
  citations: DesignCitation[];
  onOpen: (chapterId: string, slide: number) => void;
}) {
  return <div className="design-citations">
    {citations.map((citation, index) => <button
      key={`${citation.chapterId}-${citation.slide}-${index}`}
      title={citation.title}
      onClick={() => onOpen(citation.chapterId, citation.slide)}>
      <BookOpen size={12} />
      {citation.chapterId} · 第 {citation.slide} 页
    </button>)}
  </div>;
}

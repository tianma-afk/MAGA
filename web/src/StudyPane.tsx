import { lazy, Suspense } from 'react';
import { X } from 'lucide-react';
import type { ChapterDetail, Diagram, Mode, QuizStore } from './types';
import IconButton from './IconButton';
import QuizPane from './QuizPane';
import Roadmap, { type RoadmapProps } from './Roadmap';
import SlideReader from './SlideReader';

const DiagramCanvas = lazy(() => import('./DiagramCanvas'));

export type Pane = 'slides' | 'diagram' | 'outline' | 'quiz';
interface Props {
  chapter: ChapterDetail;
  page: number;
  onPage: (page: number) => void;
  pane: Pane;
  onPane: (pane: Pane) => void;
  onClose: () => void;
  diagram?: Diagram;
  busy: boolean;
  mode?: Mode;
  onMode: (mode: Mode) => void;
  onSource: (slide: number) => void;
  roadmap: Pick<RoadmapProps, 'outline' | 'error' | 'onRetry'>;
  quizStore?: QuizStore;
  onQuizChange?: () => void;
}
export default function StudyPane({
  chapter, page, onPage, pane, onPane, onClose, diagram, busy, mode, onMode,
  onSource, roadmap, quizStore, onQuizChange,
}: Props) {
  const slide = chapter.slides.find(s => s.number === page);
  return <aside className="study-pane" aria-label="学习资料">
    <header className="pane-header">
      <div className="tabs" role="tablist" aria-label="资料视图">
        <button role="tab" aria-selected={pane === 'slides'} onClick={() => onPane('slides')}>课件</button>
        <button role="tab" aria-selected={pane === 'outline'} onClick={() => onPane('outline')}>大纲</button>
        <button role="tab" aria-selected={pane === 'quiz'} onClick={() => onPane('quiz')}>自测</button>
        <button role="tab" aria-selected={pane === 'diagram'} onClick={() => onPane('diagram')}>画布</button>
      </div>
      <IconButton label="关闭资料" onClick={onClose}><X size={18} /></IconButton>
    </header>
    {pane === 'slides' ? <SlideReader chapter={chapter} page={page} onPage={onPage}
      disabled={busy} /> : pane === 'outline' ? <div className="outline-scroll">
      <Roadmap {...roadmap} page={page} onPage={onPage} busy={busy} quizStore={quizStore} />
    </div> : pane === 'quiz' ? <QuizPane chapter={chapter} page={page} mode={mode}
      onMode={onMode} onSource={onSource} onQuizChange={onQuizChange} /> : <>
      <div className="canvas-heading"><h2>{diagram?.title || '章节画布'}</h2></div>
      {diagram ? <Suspense fallback={<div className="pane-empty" role="status">正在打开画布…</div>}>
        <DiagramCanvas key={JSON.stringify(diagram)} diagram={diagram} />
      </Suspense>
        : <div className="pane-empty">当前对话还没有图解。</div>}
    </>}
  </aside>;
}

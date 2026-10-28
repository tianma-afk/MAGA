import { lazy, Suspense, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import type { ChapterDetail, Diagram } from './types';
import IconButton from './IconButton';
import Roadmap, { type RoadmapProps } from './Roadmap';

const DiagramCanvas = lazy(() => import('./DiagramCanvas'));

export type Pane = 'slides' | 'diagram' | 'outline';
interface Props {
  chapter: ChapterDetail;
  page: number;
  onPage: (page: number) => void;
  pane: Pane;
  onPane: (pane: Pane) => void;
  onClose: () => void;
  diagram?: Diagram;
  busy: boolean;
  roadmap: Pick<RoadmapProps, 'outline' | 'error' | 'onRetry'>;
}
export default function StudyPane({ chapter, page, onPage, pane, onPane, onClose, diagram, busy, roadmap }: Props) {
  const slide = chapter.slides.find(s => s.number === page);
  const [failedImage, setFailedImage] = useState<string>();
  const image = slide?.imageUrl && failedImage !== slide.imageUrl;
  return <aside className="study-pane" aria-label="学习资料">
    <header className="pane-header">
      <div className="tabs" role="tablist" aria-label="资料视图">
        <button role="tab" aria-selected={pane === 'slides'} onClick={() => onPane('slides')}>课件</button>
        <button role="tab" aria-selected={pane === 'outline'} onClick={() => onPane('outline')}>大纲</button>
        <button role="tab" aria-selected={pane === 'diagram'} onClick={() => onPane('diagram')}>画布</button>
      </div>
      <IconButton label="关闭资料" onClick={onClose}><X size={18} /></IconButton>
    </header>
    {pane === 'slides' ? <>
      <div className="slide-scroll">
        <div className="preview-label">
          <span>{image ? '原始课件预览' : '文本预览'}</span><span>第 {page} 页</span>
        </div>
        {image ? <img className="slide-image" src={slide.imageUrl}
          alt={`第 ${page} 页：${slide.title}`} onError={() => setFailedImage(slide.imageUrl)} />
          : <section className="slide-text" aria-label="文本预览">
            <span className="slide-number">{String(page).padStart(2, '0')}</span>
            <h2>{slide?.title || `第 ${page} 页`}</h2>
            <p>{slide?.text || '此页未提取到文字，请下载原始课件查看。'}</p>
          </section>}
        {!image && <p className="preview-note">根据课件文字重建，不代表原始排版。</p>}
        {slide?.notes && <details className="notes"><summary>课件备注</summary><p>{slide.notes}</p></details>}
        <a className="download" href={`/api/chapters/${encodeURIComponent(chapter.id)}/file`} download>
          <Download size={15} />下载原始课件
        </a>
      </div>
      <footer className="page-controls">
        <IconButton label="上一页" disabled={page <= 1 || busy} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={18} />
        </IconButton>
        <label>第 <select aria-label="课件页码" value={page} disabled={busy}
          onChange={event => onPage(Number(event.target.value))}>
          {Array.from({ length: chapter.slideCount }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
        </select> / {chapter.slideCount} 页</label>
        <IconButton label="下一页" disabled={page >= chapter.slideCount || busy} onClick={() => onPage(page + 1)}>
          <ChevronRight size={18} />
        </IconButton>
      </footer>
    </> : pane === 'outline' ? <div className="outline-scroll">
      <Roadmap {...roadmap} page={page} onPage={onPage} busy={busy} />
    </div> : <>
      <div className="canvas-heading"><h2>{diagram?.title || '章节画布'}</h2></div>
      {diagram ? <Suspense fallback={<div className="pane-empty" role="status">正在打开画布…</div>}>
        <DiagramCanvas key={JSON.stringify(diagram)} diagram={diagram} />
      </Suspense>
        : <div className="pane-empty">当前对话还没有图解。</div>}
    </>}
  </aside>;
}

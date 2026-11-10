import { useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import type { ChapterDetail } from './types';
import IconButton from './IconButton';

interface Props {
  chapter: ChapterDetail;
  page: number;
  onPage: (page: number) => void;
  disabled?: boolean;
}

/** Original slide image with the honest text/OCR fallback used everywhere a
 *  course source is read. */
export default function SlideReader({ chapter, page, onPage, disabled = false }: Props) {
  const slide = chapter.slides.find(item => item.number === page);
  const [failedImage, setFailedImage] = useState<string>();
  const image = slide?.imageUrl && failedImage !== slide.imageUrl;
  const ocr = slide?.ocrText?.trim();
  return <>
    <div className="slide-scroll">
      <div className="preview-label">
        <span>{image ? '原始课件预览' : '文本预览'}{ocr ? ' · 含 OCR 文本' : ''}</span>
        <span>第 {page} 页</span>
      </div>
      {image ? <img className="slide-image" src={slide.imageUrl}
        alt={`第 ${page} 页：${slide.title}`} onError={() => setFailedImage(slide.imageUrl)} />
        : <section className="slide-text" aria-label="文本预览">
          <span className="slide-number">{String(page).padStart(2, '0')}</span>
          <h2>{slide?.title || `第 ${page} 页`}</h2>
          <p>{slide?.text || (ocr ? '此页未提取到文字，请查看下方 OCR 文本。' : '此页未提取到文字，请下载原始课件查看。')}</p>
        </section>}
      {!image && <p className="preview-note">根据课件文字重建，不代表原始排版。</p>}
      {ocr && <details className="notes">
        <summary>OCR 识别文本（可能有误）</summary>
        <p>{ocr}</p>
      </details>}
      {slide?.notes && <details className="notes"><summary>课件备注</summary><p>{slide.notes}</p></details>}
      <a className="download" href={`/api/chapters/${encodeURIComponent(chapter.id)}/file`} download>
        <Download size={15} />下载原始课件
      </a>
    </div>
    <footer className="page-controls">
      <IconButton label="上一页" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft size={18} />
      </IconButton>
      <label>第 <select aria-label="课件页码" value={page} disabled={disabled}
        onChange={event => onPage(Number(event.target.value))}>
        {Array.from({ length: chapter.slideCount }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
      </select> / {chapter.slideCount} 页</label>
      <IconButton label="下一页" disabled={disabled || page >= chapter.slideCount}
        onClick={() => onPage(page + 1)}>
        <ChevronRight size={18} />
      </IconButton>
    </footer>
  </>;
}

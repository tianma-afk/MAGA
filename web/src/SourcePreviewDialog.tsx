import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { api, errorText } from './api';
import IconButton from './IconButton';
import useModalInteractions from './useModalInteractions';
import type { ChapterDetail } from './types';
import './source.css';

interface Props {
  chapterId: string;
  slide: number;
  onClose: () => void;
}

// Source browsing has sparse page controls; SlideReader assumes contiguous pages.
function SourcePage({ chapter, page }: { chapter: ChapterDetail; page: number }) {
  const item = chapter.slides.find(item => item.number === page)!;
  const [failedImage, setFailedImage] = useState(false);
  const image = item.imageUrl && !failedImage;
  const ocr = item.ocrText?.trim();
  return <div className="slide-scroll">
    <div className="preview-label"><span>{image ? '原始课件预览' : '文本预览'}{ocr ? ' · 含 OCR 文本' : ''}</span><span>第 {page} 页</span></div>
    {image ? <img className="slide-image" src={item.imageUrl} alt={`第 ${page} 页：${item.title}`} onError={() => setFailedImage(true)} />
      : <section className="slide-text" aria-label="文本预览"><span className="slide-number">{String(page).padStart(2, '0')}</span>
        <h2>{item.title || `第 ${page} 页`}</h2>
        <p>{item.text || (ocr ? '此页未提取到文字，请查看下方 OCR 文本。' : '此页未提取到文字，请下载原始课件查看。')}</p>
      </section>}
    {!image && <p className="preview-note">根据课件文字重建，不代表原始排版。</p>}
    {ocr && <details className="notes"><summary>OCR 识别文本（可能有误）</summary><p>{ocr}</p></details>}
    {item.notes && <details className="notes"><summary>课件备注</summary><p>{item.notes}</p></details>}
    <a className="download" href={`/api/chapters/${encodeURIComponent(chapter.id)}/file`} download>下载原始课件</a>
  </div>;
}

/** Original citation and explicitly chosen browsing page remain distinct. */
export default function SourcePreviewDialog({ chapterId, slide, onClose }: Props) {
  const interactions = useModalInteractions(onClose);
  const [result, setResult] = useState<{
    chapterId: string; attempt: number; chapter?: ChapterDetail; error?: string;
  }>();
  const [browse, setBrowse] = useState<{ target: string; page: number }>();
  const [attempt, setAttempt] = useState(0);
  const target = JSON.stringify([chapterId, String(slide)]);
  const current = result?.chapterId === chapterId && result.attempt === attempt ? result : undefined;
  const chapter = current?.chapter;
  const pages = [...new Set(chapter?.slides.map(item => item.number).filter(number =>
    Number.isInteger(number) && number >= 1 && number <= chapter.slideCount) ?? [])].sort((a, b) => a - b);
  const stale = !!chapter && (!Number.isInteger(slide) || !pages.includes(slide));
  const page = browse?.target === target ? browse.page : stale ? undefined : slide;
  const index = page === undefined ? -1 : pages.indexOf(page);

  useEffect(() => { setBrowse(undefined); }, [chapterId, slide]);
  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    api.chapter(chapterId, controller.signal)
      .then(chapter => {
        if (!controller.signal.aborted) setResult({ chapterId, attempt, chapter });
      })
      .catch(caught => {
        if (!controller.signal.aborted) setResult({ chapterId, attempt, error: errorText(caught) });
      });
    return () => controller.abort();
  }, [chapterId, attempt]);

  const visit = (next: number) => {
    if (pages.includes(next)) setBrowse({ target, page: next });
  };
  return <dialog {...interactions} className="source-dialog" aria-labelledby="source-title">
    <div className="source-dialog-content">
      <header className="source-dialog-head">
        <h2 id="source-title">{chapter ? `${chapter.title} · ${index >= 0 ? `第 ${page} 页` : '引用来源'}` : '课件来源'}</h2>
        <IconButton label="关闭来源" onClick={onClose}><X size={18} /></IconButton>
      </header>
      {current?.error ? <div className="source-dialog-error" role="alert">
        <p>{current.error}</p>
        <button className="text-button" onClick={() => setAttempt(value => value + 1)}>
          <RefreshCw size={14} />重试
        </button>
      </div> : chapter ? <>
        {stale && <div className="source-dialog-error" role="alert">
          <p>引用来源已失效，课件可能更新。原引用：第 {String(slide)} 页。
            {index >= 0 && `当前浏览：第 ${page} 页（并非原引用）。`}</p>
          {index < 0 && (pages.length ? <button className="text-button" onClick={() => visit(pages[0])}>
            查看当前课件首页
          </button> : <p>当前课件没有可浏览的有效页。</p>)}
        </div>}
        {index >= 0 && <>
          <SourcePage key={`${chapterId}:${page}`} chapter={chapter} page={page!} />
          <footer className="page-controls">
            <button aria-label="上一页" disabled={index === 0} onClick={() => visit(pages[index - 1])}>上一页</button>
            <label>第 <select aria-label="课件页码" value={page} onChange={event => visit(Number(event.target.value))}>
              {pages.map(number => <option key={number} value={number}>{number}</option>)}
            </select> / {chapter.slideCount} 页</label>
            <button aria-label="下一页" disabled={index === pages.length - 1} onClick={() => visit(pages[index + 1])}>下一页</button>
          </footer>
        </>}
      </> : <p className="source-dialog-loading" role="status">正在读取来源…</p>}
    </div>
  </dialog>;
}

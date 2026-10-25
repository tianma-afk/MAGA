import { useEffect, useState } from 'react';
import { BookOpen, PanelLeftClose, PanelLeftOpen, RefreshCw } from 'lucide-react';
import { api, errorText } from './api';
import type { Chapter, ChapterDetail, Mode } from './types';
import IconButton from './IconButton';
import Tutor from './Tutor';

function rememberedChapter() {
  try { return localStorage.getItem('chapter-tutor:last-chapter') ?? ''; } catch { return ''; }
}
export default function App() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selected, setSelected] = useState('');
  const [chapter, setChapter] = useState<ChapterDetail>();
  const [mode, setMode] = useState<Mode>();
  const [sidebar, setSidebar] = useState(() => window.innerWidth > 760);
  const [error, setError] = useState('');
  const [chapterError, setChapterError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    Promise.all([api.chapters(controller.signal), api.health(controller.signal)])
      .then(([items, health]) => {
        if (controller.signal.aborted) return;
        setChapters(items);
        setMode(health.mode);
        const remembered = rememberedChapter();
        setSelected(current => items.some(c => c.id === current) ? current
          : items.find(c => c.id === remembered)?.id ?? items[0]?.id ?? '');
      }).catch(error => { if (!controller.signal.aborted) setError(errorText(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setChapter(undefined);
    setChapterError('');
    api.chapter(selected, controller.signal).then(detail => {
      if (controller.signal.aborted) return;
      setChapter(detail);
      try { localStorage.setItem('chapter-tutor:last-chapter', selected); } catch { /* Optional preference. */ }
    }).catch(error => { if (!controller.signal.aborted) setChapterError(errorText(error)); });
    return () => controller.abort();
  }, [selected, retry]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && window.innerWidth <= 760) setSidebar(false);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const pickChapter = (id: string) => {
    if (id !== selected) setChapter(undefined);
    setSelected(id);
    if (window.innerWidth <= 760) setSidebar(false);
  };
  return <div className={`app ${sidebar ? 'sidebar-open' : ''}`}>
    {sidebar && <>
      <button className="drawer-shade" aria-label="关闭章节目录" onClick={() => setSidebar(false)} />
      <aside className="sidebar" aria-label="章节目录">
        <div className="sidebar-brand"><BookOpen size={21} /><strong>章节助教</strong>
          <IconButton label="收起章节目录" onClick={() => setSidebar(false)}><PanelLeftClose size={18} /></IconButton>
        </div>
        <div className="sidebar-label">课程章节 <span>{chapters.length}</span></div>
        <nav aria-label="选择章节">
          {chapters.map(item => <button key={item.id}
            className={`chapter-button ${selected === item.id ? 'selected' : ''}`}
            aria-label={`章节：${item.title}`} aria-current={selected === item.id ? 'page' : undefined}
            onClick={() => pickChapter(item.id)}>
            <BookOpen className="chapter-index" size={17} />
            <span className="chapter-text">{item.title}<small>{item.slideCount} 页</small></span>
          </button>)}
        </nav>
        <footer className="sidebar-footer"><span className={`status-dot ${mode || 'unknown'}`} />
          {mode === 'offline' ? '离线模式' : mode === 'ai' ? 'AI 模式' : '连接中'}
          <span className="local-label">本地学习记录</span>
        </footer>
      </aside>
    </>}
    <div className="workspace">
      <header className="topbar">
        <IconButton label={sidebar ? '收起章节目录' : '展开章节目录'} onClick={() => setSidebar(!sidebar)}>
          {sidebar ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
        </IconButton>
        <div className="breadcrumb"><span>学习空间</span><span>/</span>
          <strong>{chapters.find(c => c.id === selected)?.title || '章节助教'}</strong>
        </div>
        {mode && <span className={`mode-badge ${mode}`}>{mode === 'offline' ? '离线模式' : 'AI 模式'}</span>}
      </header>
      {loading ? <div className="center-state" role="status">正在读取章节…</div>
        : error ? <div className="center-state" role="alert"><p>{error}</p>
          <button className="text-button" onClick={() => setReload(v => v + 1)}><RefreshCw size={16} />重新连接</button></div>
          : !selected ? <div className="center-state">暂无可用章节。</div>
            : chapterError ? <div className="center-state" role="alert"><p>{chapterError}</p>
              <button className="text-button" onClick={() => setRetry(v => v + 1)}><RefreshCw size={16} />重试加载</button></div>
              : chapter && chapter.id === selected ? <Tutor key={chapter.id} chapter={chapter} mode={mode}
                onMode={setMode} /> : <div className="center-state" role="status">正在打开课件…</div>}
    </div>
  </div>;
}

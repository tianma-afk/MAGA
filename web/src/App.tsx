import { useEffect, useState } from 'react';
import { BookOpen, PanelLeftClose, PanelLeftOpen, RefreshCw } from 'lucide-react';
import { api, errorText } from './api';
import type { Chapter, ChapterDetail, Health, Mode } from './types';
import IconButton from './IconButton';
import Tutor from './Tutor';
import Home from './Home';
import ConnectionBanner from './ConnectionBanner';

function routeChapter() {
  try { return decodeURIComponent(window.location.hash.match(/^#\/chapter\/([^/]+)$/)?.[1] ?? ''); }
  catch { return ''; }
}
export default function App() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selected, setSelected] = useState(routeChapter);
  const [chapter, setChapter] = useState<ChapterDetail>();
  const [health, setHealth] = useState<Health>();
  const [healthError, setHealthError] = useState('');
  const [checking, setChecking] = useState(true);
  const [connectionRetry, setConnectionRetry] = useState(0);
  const mode = health?.mode;
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
    api.chapters(controller.signal)
      .then(items => {
        if (controller.signal.aborted) return;
        setChapters(items);
      }).catch(error => { if (!controller.signal.aborted) setError(errorText(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    setHealthError('');
    setHealth(undefined);
    api.health(controller.signal).then(value => {
      if (!controller.signal.aborted) setHealth(value);
    }).catch(error => {
      if (!controller.signal.aborted) setHealthError(errorText(error));
    }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [connectionRetry, reload]);

  useEffect(() => {
    const changed = () => {
      setSelected(routeChapter());
      if (window.innerWidth <= 760) setSidebar(false);
    };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setChapter(undefined);
    setChapterError('');
    api.chapter(selected, controller.signal).then(detail => {
      if (controller.signal.aborted) return;
      setChapter(detail);
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
    window.location.hash = id ? `/chapter/${encodeURIComponent(id)}` : '/';
    if (window.innerWidth <= 760) setSidebar(false);
  };
  const setMode = (next: Mode) => setHealth({ status: 'ok', mode: next,
    missing: next === 'unconfigured' ? health?.missing ?? [] : [] });
  return <div className={`app ${sidebar ? 'sidebar-open' : ''}`}>
    {sidebar && <>
      <button className="drawer-shade" aria-label="关闭章节目录" onClick={() => setSidebar(false)} />
      <aside className="sidebar" aria-label="章节目录">
        <div className="sidebar-brand"><BookOpen size={21} /><strong>章节助教</strong>
          <IconButton label="收起章节目录" onClick={() => setSidebar(false)}><PanelLeftClose size={18} /></IconButton>
        </div>
        <div className="sidebar-label">课程章节 <span>{chapters.length}</span></div>
        <nav aria-label="选择章节">
          <button className={`chapter-button ${!selected ? 'selected' : ''}`}
            onClick={() => pickChapter('')}><BookOpen size={17} />学习空间</button>
          {chapters.map(item => <button key={item.id}
            className={`chapter-button ${selected === item.id ? 'selected' : ''}`}
            aria-label={`章节：${item.title}`} aria-current={selected === item.id ? 'page' : undefined}
            onClick={() => pickChapter(item.id)}>
            <BookOpen className="chapter-index" size={17} />
            <span className="chapter-text">{item.title}<small>{item.slideCount} 页</small></span>
          </button>)}
        </nav>
        <footer className="sidebar-footer"><span className={`status-dot ${mode || 'unknown'}`} />
          {mode === 'unconfigured' ? 'AI 未配置' : mode === 'ai' ? 'AI 已连接' : healthError ? '连接异常' : '连接中'}
          <span className="local-label">本地学习记录</span>
        </footer>
      </aside>
    </>}
    <div className="workspace">
      <header className="topbar">
        <IconButton label={sidebar ? '收起章节目录' : '展开章节目录'} onClick={() => setSidebar(!sidebar)}>
          {sidebar ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
        </IconButton>
        <div className="breadcrumb"><button aria-label="返回学习空间" onClick={() => pickChapter('')}>学习空间</button>
          {selected && <><span>/</span><strong>{chapters.find(c => c.id === selected)?.title || '章节'}</strong></>}
        </div>
        {mode && <span className={`mode-badge ${mode}`}>{mode === 'unconfigured' ? 'AI 未配置' : 'AI 模式'}</span>}
      </header>
      <ConnectionBanner health={health} error={healthError} checking={checking}
        onRecheck={() => setConnectionRetry(v => v + 1)} />
      {loading ? <div className="center-state" role="status">正在读取章节…</div>
        : error ? <div className="center-state" role="alert"><p>{error}</p>
          <button className="text-button" onClick={() => setReload(v => v + 1)}><RefreshCw size={16} />重新连接</button></div>
          : !selected ? <Home chapters={chapters} />
            : chapterError ? <div className="center-state" role="alert"><p>{chapterError}</p>
              <button className="text-button" onClick={() => setRetry(v => v + 1)}><RefreshCw size={16} />重试加载</button></div>
              : chapter && chapter.id === selected ? <Tutor key={chapter.id} chapter={chapter} mode={mode}
                onMode={setMode} /> : <div className="center-state" role="status">正在打开课件…</div>}
    </div>
  </div>;
}

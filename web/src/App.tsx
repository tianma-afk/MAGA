import { useEffect, useRef, useState } from 'react';
import { BookOpen, Compass, PanelLeftClose, PanelLeftOpen, RefreshCw } from 'lucide-react';
import { api, errorText } from './api';
import type { Chapter, ChapterDetail, Health, Mode } from './types';
import IconButton from './IconButton';
import Tutor from './Tutor';
import Home from './Home';
import GlobalSearch from './GlobalSearch';
import DesignStudio from './DesignStudio';
import ConnectionBanner from './ConnectionBanner';
import SourcePreviewDialog from './SourcePreviewDialog';

function routeChapter() {
  try { return decodeURIComponent(window.location.hash.match(/^#\/chapter\/([^/?]+)(?:\?view=quiz)?$/)?.[1] ?? ''); }
  catch { return ''; }
}
function routeStudio() {
  return window.location.hash === '#/studio';
}
export default function App() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selected, setSelected] = useState(routeChapter);
  const [quizView, setQuizView] = useState(() => window.location.hash.endsWith('?view=quiz'));
  const [studio, setStudio] = useState(routeStudio);
  const [jump, setJump] = useState<{ chapterId: string; slide: number; token: number }>();
  const [source, setSource] = useState<{ chapterId: string; slide: number }>();
  const jumpToken = useRef(0);
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
      setQuizView(window.location.hash.endsWith('?view=quiz'));
      setStudio(routeStudio());
      setSource(undefined);
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
      if (event.key !== 'Escape' || event.defaultPrevented
        || document.querySelector('dialog[open]')) return;
      if (window.innerWidth <= 760) setSidebar(false);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const pickChapter = (id: string) => {
    window.location.hash = id ? `/chapter/${encodeURIComponent(id)}` : '/';
    if (window.innerWidth <= 760) setSidebar(false);
  };
  const pickStudio = () => {
    window.location.hash = '/studio';
    setStudio(true);
    setSelected('');
    if (window.innerWidth <= 760) setSidebar(false);
  };
  const openSearchResult = (chapterId: string, slide: number) => {
    setJump({ chapterId, slide, token: ++jumpToken.current });
    window.location.hash = `/chapter/${encodeURIComponent(chapterId)}`;
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
          <button className={`chapter-button ${!selected && !studio ? 'selected' : ''}`}
            onClick={() => pickChapter('')}><BookOpen size={17} />学习空间</button>
          <button className={`chapter-button ${studio ? 'selected' : ''}`}
            onClick={pickStudio}>
            <Compass size={17} />
            <span className="chapter-text">架构实践<small>场景 → 方案 → 评审</small></span>
          </button>
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
          {studio ? <><span>/</span><strong>架构实践</strong></>
            : selected && <><span>/</span><strong>{chapters.find(c => c.id === selected)?.title || '章节'}</strong></>}
        </div>
        <GlobalSearch onOpen={openSearchResult} />
        {mode && <span className={`mode-badge ${mode}`}>{mode === 'unconfigured' ? 'AI 未配置' : 'AI 模式'}</span>}
      </header>
      <ConnectionBanner health={health} error={healthError} checking={checking}
        onRecheck={() => setConnectionRetry(v => v + 1)} />
      {loading ? <div className="center-state" role="status">正在读取章节…</div>
        : error ? <div className="center-state" role="alert"><p>{error}</p>
          <button className="text-button" onClick={() => setReload(v => v + 1)}><RefreshCw size={16} />重新连接</button></div>
          : studio ? <DesignStudio mode={mode} onMode={setMode}
            onOpenSource={(chapterId, slide) => setSource({ chapterId, slide })} />
            : !selected ? <Home chapters={chapters} />
              : chapterError ? <div className="center-state" role="alert"><p>{chapterError}</p>
                <button className="text-button" onClick={() => setRetry(v => v + 1)}><RefreshCw size={16} />重试加载</button></div>
                : chapter && chapter.id === selected ? <Tutor key={chapter.id} chapter={chapter} mode={mode}
                  resumeQuiz={quizView}
                  onMode={setMode} onOpenSource={(chapterId, slide) => setSource({ chapterId, slide })}
                  jump={jump?.chapterId === chapter.id ? jump : undefined}
                  onJumpHandled={() => setJump(undefined)} />
                  : <div className="center-state" role="status">正在打开课件…</div>}
    </div>
    {source && <SourcePreviewDialog chapterId={source.chapterId} slide={source.slide}
      onClose={() => setSource(undefined)} />}
  </div>;
}

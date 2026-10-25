import { useEffect, useReducer, useRef, useState } from 'react';
import { ArrowUp, BookOpen, ChevronRight, ClipboardCheck, GitBranch, LoaderCircle, RefreshCw, RotateCcw, Square } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { api, errorText } from './api';
import { clampPage, emptySession, loadSession, saveSession, sessionReducer } from './state';
import type { ChapterDetail, Diagram, Mode } from './types';
import IconButton from './IconButton';
import StudyPane, { type Pane } from './StudyPane';
import ResetDialog from './ResetDialog';

interface Props { chapter: ChapterDetail; mode?: Mode; onMode: (mode: Mode) => void }

export default function Tutor({ chapter, mode, onMode }: Props) {
  const [session, dispatch] = useReducer(sessionReducer, undefined, () => {
    try { return loadSession(localStorage, chapter.id, chapter.slideCount); }
    catch { return emptySession(); }
  });
  const [draft, setDraft] = useState('');
  const [attempt, setAttempt] = useState<{ text: string; slide: number }>();
  const [pane, setPane] = useState<Pane>('slides');
  const [paneOpen, setPaneOpen] = useState(false);
  const [chosenDiagram, setChosenDiagram] = useState<Diagram>();
  const [confirmReset, setConfirmReset] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const busy = session.pending !== null;
  const diagram = chosenDiagram ?? [...session.messages].reverse().find(m => m.diagram)?.diagram;

  useEffect(() => () => { request.current?.abort(); }, []);
  useEffect(() => {
    try { setStorageFailed(!saveSession(localStorage, chapter.id, session)); }
    catch { setStorageFailed(true); }
  }, [chapter.id, session.slide, session.messages]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [session.messages, session.pending, session.error]);
  useEffect(() => {
    if (!input.current) return;
    input.current.style.height = 'auto';
    input.current.style.height = `${Math.min(input.current.scrollHeight, 180)}px`;
  }, [draft]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !confirmReset) setPaneOpen(false);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [confirmReset]);

  function openPane(next: Pane) { setPane(next); setPaneOpen(true); }
  function stop() {
    request.current?.abort();
    request.current = null;
    dispatch({ type: 'cancel' });
  }
  async function send(value: string, page = session.slide) {
    const text = value.trim();
    if (!text || text.length > 8000 || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const requestId = crypto.randomUUID();
    setDraft(text);
    setAttempt({ text, slide: page });
    dispatch({ type: 'start', requestId });
    try {
      const result = await api.chat(chapter.id, text, page, session.messages, controller.signal);
      // Also guard transports that resolve after abort, including a chapter unmount.
      if (controller.signal.aborted || request.current !== controller) return;
      dispatch({ type: 'complete', requestId, slide: clampPage(result.slide, chapter.slideCount),
        user: { id: `${requestId}-user`, role: 'user', content: text },
        message: { id: requestId, role: 'assistant', ...result } });
      onMode(result.mode);
      setDraft('');
      setAttempt(undefined);
      if (result.diagram) {
        setChosenDiagram(result.diagram);
        openPane('diagram');
      }
    } catch (error) {
      if (!controller.signal.aborted && request.current === controller) {
        dispatch({ type: 'fail', requestId, error: errorText(error) });
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }
  function reset() {
    stop();
    dispatch({ type: 'reset' });
    setDraft('');
    setAttempt(undefined);
    setChosenDiagram(undefined);
    setPane('slides');
    setConfirmReset(false);
  }
  function goToPage(page: number) {
    dispatch({ type: 'page', slide: clampPage(page, chapter.slideCount) });
    openPane('slides');
  }

  return <main className={`tutor ${paneOpen ? 'pane-open' : ''}`}>
    <section className="conversation" aria-label="章节对话">
      <header className="conversation-toolbar">
        <span className="conversation-label"><span className="status-dot ai" />本章对话</span>
        <div className="toolbar-actions">
          <IconButton label="打开课件" onClick={() => openPane('slides')}><BookOpen size={18} /></IconButton>
          <IconButton label="打开画布" onClick={() => openPane('diagram')}><GitBranch size={18} /></IconButton>
          <IconButton label="重置本章" onClick={() => setConfirmReset(true)}><RotateCcw size={17} /></IconButton>
        </div>
      </header>
      <div className="message-scroll">
        {session.messages.length === 0 && !busy ? <div className="welcome">
          <BookOpen className="welcome-icon" size={30} strokeWidth={1.5} />
          <h1>{chapter.title}</h1>
          <p>{chapter.slideCount} 页课件 <span>·</span> 从第 {session.slide} 页开始</p>
          <div className="starter-actions">
            <button onClick={() => void send('讲解本页')}>
              <BookOpen size={17} /><span>开始讲解</span><ChevronRight size={16} />
            </button>
            <button onClick={() => void send('自测')}>
              <ClipboardCheck size={17} /><span>本页自测</span><ChevronRight size={16} />
            </button>
          </div>
        </div> : null}
        <div className="messages" role="log" aria-label="对话记录" aria-live="polite">
          {session.messages.map(message => <article className={`message ${message.role}`} key={message.id}>
            <div className="message-meta">{message.role === 'user' ? '你' : '章节助教'}
              {message.mode === 'offline' && <span>离线讲解</span>}
            </div>
            <div className="message-body">
              {message.role === 'user' ? message.content : <ReactMarkdown
                components={{ img: ({ alt }) => <span>{alt}</span> }}>{message.content}</ReactMarkdown>}
            </div>
            {!!message.citations?.length && <div className="citations">
              {message.citations.map((citation, i) => <button key={`${citation.slide}-${i}`}
                disabled={busy} title={citation.title} onClick={() => goToPage(citation.slide)}>
                <BookOpen size={13} />第 {citation.slide} 页 · {citation.title}
              </button>)}
            </div>}
            {message.diagram && <button className="text-button diagram-link" onClick={() => {
              setChosenDiagram(message.diagram); openPane('diagram');
            }}><GitBranch size={15} />{message.diagram.title}</button>}
          </article>)}
          {busy && <>
            <article className="message user"><div className="message-meta">你</div>
              <div className="message-body">{attempt?.text}</div></article>
            <div className="thinking" role="status"><LoaderCircle size={17} className="spin" />正在整理本章内容…</div>
          </>}
        </div>
        <div ref={bottom} />
      </div>
      <div className="composer-region">
        {session.error && <div className="error-banner" role="alert">
          <span>{session.error}</span>
          <button className="text-button" onClick={() => attempt && void send(attempt.text, attempt.slide)}>
            <RefreshCw size={15} />重试回复
          </button>
        </div>}
        {storageFailed && <p className="storage-warning" role="status">无法保存到本地；关闭页面后可能丢失本次记录。</p>}
        <form className="composer" onSubmit={event => { event.preventDefault(); void send(draft); }}>
          <textarea ref={input} aria-label="向助教提问" placeholder="向助教提问，或继续本章学习…"
            value={draft} rows={2} disabled={busy} maxLength={8000}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                event.preventDefault(); void send(draft);
              }
            }} />
          <div className="composer-bottom">
            <button type="button" className="page-chip" onClick={() => openPane('slides')}>
              <BookOpen size={14} />第 {session.slide} / {chapter.slideCount} 页
            </button>
            <div className="composer-actions">
              {draft.length > 7000 && <span className="character-count">{draft.length} / 8000</span>}
              {busy ? <IconButton label="停止回复" onClick={stop}><Square size={16} /></IconButton>
                : <button type="submit" className="send-button" aria-label="发送消息" title="发送消息"
                  disabled={!draft.trim()}><ArrowUp size={19} /></button>}
            </div>
          </div>
        </form>
        <div className="composer-footer"><span>{mode === 'offline' ? '离线课件讲解' : '基于本章课件'}</span>
          <button className="continue-button" disabled={busy} onClick={() => void send('继续学习')}>
            继续学习<ChevronRight size={14} />
          </button>
        </div>
      </div>
    </section>
    {paneOpen && <>
      <button className="pane-shade" aria-label="关闭资料抽屉" onClick={() => setPaneOpen(false)} />
      <StudyPane chapter={chapter} page={session.slide} onPage={goToPage} pane={pane}
        onPane={setPane} onClose={() => setPaneOpen(false)} diagram={diagram} busy={busy} />
    </>}
    {confirmReset && <ResetDialog onCancel={() => setConfirmReset(false)} onConfirm={reset} />}
  </main>;
}

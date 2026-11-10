import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { LoaderCircle, Search } from 'lucide-react';
import { api, errorText } from './api';
import type { SearchResult } from './types';
import useModalInteractions from './useModalInteractions';
import './search.css';

type OpenResult = (chapterId: string, slide: number) => void;
type SearchState =
  | { kind: 'idle' | 'edited' }
  | { kind: 'loading'; query: string }
  | { kind: 'error'; query: string; message: string }
  | { kind: 'done'; query: string; results: SearchResult[] };

export default function GlobalSearch({ onOpen }: { onOpen: OpenResult }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="search-trigger" type="button" aria-haspopup="dialog"
      aria-expanded={open} onClick={() => setOpen(true)}>
      <Search size={16} aria-hidden="true" />搜索课件
    </button>
    {open && <SearchPanel onClose={() => setOpen(false)} onOpen={onOpen} />}
  </>;
}

function SearchPanel({ onClose, onOpen }: { onClose: () => void; onOpen: OpenResult }) {
  const titleId = useId();
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ kind: 'idle' });
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const interactions = useModalInteractions(dismiss);

  useEffect(() => {
    input.current?.focus();
    return cancelRequest;
  }, []);

  function cancelRequest() {
    const active = request.current;
    request.current = null;
    active?.abort();
  }

  function dismiss() {
    cancelRequest();
    interactions.ref.current?.close();
    onClose();
  }

  function edit(text: string) {
    setQuery(text);
    if (text.trim() === query.trim()) return;
    cancelRequest();
    if (state.kind !== 'idle') setState({ kind: 'edited' });
  }

  function clear() {
    cancelRequest();
    setQuery('');
    setState({ kind: 'idle' });
    input.current?.focus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (!text || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setState({ kind: 'loading', query: text });
    try {
      const { results } = await api.search(text, controller.signal);
      if (request.current === controller) setState({ kind: 'done', query: text, results });
    } catch (caught) {
      if (request.current === controller) {
        setState({ kind: 'error', query: text, message: errorText(caught) });
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  function pick(result: SearchResult) {
    dismiss();
    onOpen(result.chapterId, result.slide);
  }

  return <dialog {...interactions} className="search-dialog" aria-labelledby={titleId}
    onKeyDown={event => {
      if (event.key !== 'Escape') return;
      interactions.onKeyDown(event);
      if (event.nativeEvent.isComposing) return;
      // Chromium clears a nonempty search input on Escape before native dialog cancellation.
      event.preventDefault();
      dismiss();
    }}
    onCancel={event => { event.preventDefault(); dismiss(); }}>
    <div className="search-header">
      <h2 id={titleId}>跨章搜索</h2>
      <button type="button" onClick={dismiss}>关闭</button>
    </div>
    <form className="search-form" onSubmit={submit} role="search">
      <input ref={input} type="search" aria-label="跨章搜索" placeholder="例如：心跳或 heartbeat"
        maxLength={200} value={query} onChange={event => edit(event.target.value)} />
      <button className="search-submit" type="submit"
        disabled={!query.trim() || state.kind === 'loading'}>搜索</button>
      <button type="button" onClick={clear} disabled={!query && state.kind === 'idle'}>清空</button>
    </form>
    <div className="search-results" role="region" aria-label="搜索结果">
      <div className="search-status" role="status">
        {'query' in state && <p>搜索词：<strong>{state.query}</strong></p>}
        {state.kind === 'edited' && <p>关键词已修改。按回车或点击搜索查看新结果。</p>}
        {state.kind === 'loading' && <p>
          <LoaderCircle size={14} className="spin" aria-hidden="true" />正在搜索…
        </p>}
        {state.kind === 'done' && <p>{state.results.length
          ? `显示 ${state.results.length} 条结果` : '没有找到相关内容。'}</p>}
      </div>
      {state.kind === 'error' && <p className="search-error" role="alert">{state.message}</p>}
      {state.kind === 'done' && state.results.length > 0 && <ul>
        {state.results.map(result => <li key={`${result.chapterId}-${result.slide}`}>
          <button type="button" onClick={() => pick(result)}>
            <span className="search-result-meta">{result.chapterTitle} · 第 {result.slide} 页</span>
            <span className="search-result-title">{result.slideTitle}</span>
            <span className="search-result-snippet">{result.snippet}</span>
          </button>
        </li>)}
      </ul>}
    </div>
  </dialog>;
}

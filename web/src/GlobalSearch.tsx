import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LoaderCircle, Search } from 'lucide-react';
import { api, errorText } from './api';
import type { SearchResult } from './types';
import './search.css';

export default function GlobalSearch({ onOpen }: {
  onOpen: (chapterId: string, slide: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => { request.current?.abort(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    setResults(undefined);
    setOpen(true);
    try {
      const response = await api.search(text, controller.signal);
      if (controller.signal.aborted || request.current !== controller) return;
      setResults(response.results);
    } catch (caught) {
      if (!controller.signal.aborted && request.current === controller) {
        setError(errorText(caught));
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }

  function pick(result: SearchResult) {
    setOpen(false);
    setResults(undefined);
    onOpen(result.chapterId, result.slide);
  }

  return <div className="global-search" onKeyDown={event => {
    if (event.key === 'Escape') setOpen(false);
  }}>
    <form onSubmit={submit} role="search">
      <Search size={15} aria-hidden="true" />
      <input type="search" aria-label="跨章搜索" placeholder="搜索全书课件…"
        value={query} onChange={event => setQuery(event.target.value)} />
      {loading && <LoaderCircle size={14} className="spin" aria-hidden="true" />}
    </form>
    {open && <div className="search-results" role="region" aria-label="搜索结果">
      {loading ? <p className="search-status" role="status">正在搜索…</p>
        : error ? <p className="search-status search-error" role="alert">{error}</p>
          : results && results.length ? <ul>
            {results.map(result => <li key={`${result.chapterId}-${result.slide}`}>
              <button onClick={() => pick(result)}>
                <span className="search-result-meta">
                  {result.chapterTitle} · 第 {result.slide} 页
                </span>
                <span className="search-result-title">{result.slideTitle}</span>
                <span className="search-result-snippet">{result.snippet}</span>
              </button>
            </li>)}
          </ul> : results ? <p className="search-status">没有找到相关内容。</p> : null}
    </div>}
  </div>;
}

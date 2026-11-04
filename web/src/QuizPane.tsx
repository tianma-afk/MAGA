import { useEffect, useRef, useState } from 'react';
import { ClipboardCheck, LoaderCircle, RefreshCw } from 'lucide-react';
import { api, ConfigurationError, errorText } from './api';
import {
  MAX_RECORDS, emptyQuizStore, formatQuizDate, loadQuizStore, newQuizRecord,
  saveQuizRecord, scoreRecord,
} from './quiz';
import type { ChapterDetail, Mode, QuizQuestion, QuizStore } from './types';
import QuizQuestionCard from './QuizQuestionCard';
import QuizReview from './QuizReview';
import QuizWrongReview from './QuizWrongReview';

interface Props {
  chapter: ChapterDetail;
  page: number;
  mode?: Mode;
  onMode: (mode: Mode) => void;
  onPage: (page: number) => void;
}

export default function QuizPane({ chapter, page, mode, onMode, onPage }: Props) {
  const [store, setStore] = useState<QuizStore>(() => {
    try { return loadQuizStore(localStorage, chapter.id); }
    catch { return emptyQuizStore(); }
  });
  const [activeId, setActiveId] = useState<string>();
  const [draft, setDraft] = useState<QuizQuestion[]>();
  const [answers, setAnswers] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  const unavailable = mode !== 'ai';
  const active = store.records.find(record => record.id === activeId);
  const currentRecord = store.records.find(record => record.slide === page);
  const complete = !!draft && answers.length === draft.length && answers.every(answer => answer >= 0);

  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setLoading(false);
    setError('');
    setDraft(undefined);
    setAnswers([]);
    let latest = undefined;
    try {
      latest = loadQuizStore(localStorage, chapter.id).records.find(record => record.slide === page);
    } catch { /* Storage is optional. */ }
    setActiveId(latest?.id);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [chapter.id, page]);

  async function generate() {
    if (unavailable || loading) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    setDraft(undefined);
    setAnswers([]);
    setActiveId(undefined);
    try {
      const result = await api.quiz(chapter.id, page, controller.signal);
      if (controller.signal.aborted || request.current !== controller) return;
      setDraft(result.questions);
      setAnswers(Array(result.questions.length).fill(-1));
    } catch (caught) {
      if (!controller.signal.aborted && request.current === controller) {
        if (caught instanceof ConfigurationError) onMode('unconfigured');
        setError(errorText(caught));
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }

  function stop() {
    request.current?.abort();
    request.current = null;
    setLoading(false);
  }

  function submit() {
    if (!draft || !complete) return;
    const record = newQuizRecord(page, draft, answers);
    const saved = saveQuizRecord(localStorage, chapter.id, record);
    setStorageFailed(!saved);
    setStore(saved
      ? loadQuizStore(localStorage, chapter.id)
      : { records: [record, ...store.records].slice(0, MAX_RECORDS) });
    setActiveId(record.id);
    setDraft(undefined);
    setAnswers([]);
  }

  return <div className="quiz-pane">
    <div className="quiz-toolbar">
      <div>
        <h2>自测</h2>
        <p>第 {page} 页 · AI 生成，请对照课件核对</p>
      </div>
      {loading
        ? <button className="text-button" onClick={stop}>停止</button>
        : <button className="quiz-generate" disabled={unavailable}
          title={unavailable ? 'AI 尚未配置' : undefined} onClick={() => void generate()}>
          <ClipboardCheck size={15} />{currentRecord || draft ? '重新生成本页自测' : '生成本页自测'}
        </button>}
    </div>
    {unavailable && <p className="quiz-disabled" role="status">
      AI 尚未配置，完成 .env 配置并重新检查连接后可生成自测。已保存的历史仍可查看。
    </p>}
    {loading && <p className="quiz-loading" role="status">
      <LoaderCircle size={15} className="spin" />正在根据本页课件生成题目…
    </p>}
    {error && <div className="quiz-error" role="alert">
      <span>{error}</span>
      <button className="text-button" disabled={unavailable} onClick={() => void generate()}>
        <RefreshCw size={14} />重试
      </button>
    </div>}
    {storageFailed && <p className="quiz-warning" role="status">
      无法保存到本地；关闭页面后本次结果可能丢失。
    </p>}
    {draft ? <>
      <p className="quiz-progress">已作答 {answers.filter(answer => answer >= 0).length} / {draft.length}</p>
      <ol className="quiz-draft">
        {draft.map((question, index) => <li key={index}>
          <QuizQuestionCard question={question} index={index} selected={answers[index]}
            disabled={loading} onChange={value => setAnswers(previous =>
              previous.map((answer, answerIndex) => answerIndex === index ? value : answer))} />
        </li>)}
      </ol>
      <button className="quiz-submit" disabled={!complete} onClick={submit}>提交自测</button>
    </> : active ? <>
      <p className="quiz-review-meta">第 {active.slide} 页 · {formatQuizDate(active.createdAt)}</p>
      <QuizReview record={active} onPage={onPage} />
    </> : <div className="quiz-empty">
      <p>还没有本次自测。</p>
      {currentRecord && <button className="text-button"
        onClick={() => setActiveId(currentRecord.id)}>查看本页上次自测</button>}
    </div>}
    {store.records.length > 0 && <section className="quiz-history" aria-label="本章自测历史">
      <h3>本章自测历史</h3>
      <ul>
        {store.records.map(record => <li key={record.id}>
          <button aria-current={record.id === activeId ? 'true' : undefined}
            onClick={() => setActiveId(record.id)}>
            <span>第 {record.slide} 页</span>
            <span>{scoreRecord(record)} / {record.questions.length}</span>
            <span>{formatQuizDate(record.createdAt)}</span>
          </button>
        </li>)}
      </ul>
    </section>}
    <QuizWrongReview store={store} onPage={onPage} />
  </div>;
}

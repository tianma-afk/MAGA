import { useState } from 'react';
import { ClipboardCheck, LoaderCircle, RefreshCw } from 'lucide-react';
import { formatQuizDate, scoreRecord, wrongAnswersMarkdown } from './quiz';
import type { ChapterDetail, Mode } from './types';
import { useQuizWorkspace } from './useQuizWorkspace';
import QuizQuestionCard from './QuizQuestionCard';
import QuizReview from './QuizReview';
import QuizWrongReview from './QuizWrongReview';
import './quiz.css';

interface Props {
  chapter: ChapterDetail;
  page: number;
  mode?: Mode;
  onMode: (mode: Mode) => void;
  onSource: (slide: number) => void;
  onQuizChange?: () => void;
}

export default function QuizPane({
  chapter, page, mode, onMode, onSource, onQuizChange,
}: Props) {
  const task = useQuizWorkspace({
    chapterId: chapter.id,
    slideCount: chapter.slideCount,
    page,
    mode,
    onMode,
    onQuizChange,
  });
  const [replaceAction, setReplaceAction] = useState<'generate' | 'retry' | null>(null);
  const draft = task.draft;

  function beginGenerate() {
    if (draft) {
      setReplaceAction('generate');
      return;
    }
    void task.generate();
  }

  function beginRetry() {
    if (draft) {
      setReplaceAction('retry');
      return;
    }
    task.retryWrong();
  }

  function confirmReplace() {
    const action = replaceAction;
    setReplaceAction(null);
    if (action === 'generate') void task.generate(true);
    if (action === 'retry') task.retryWrong(true);
  }

  function exportWrong() {
    const active = task.active;
    if (!active) return;
    const content = wrongAnswersMarkdown(active, chapter.title);
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${chapter.id}-page-${active.slide}-wrong-answers.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const sourceLabel = draft && draft.sourceSlide !== page
    ? `正在练习第 ${draft.sourceSlide} 页内容 · 当前浏览第 ${page} 页`
    : `第 ${page} 页 · AI 生成，请对照课件核对`;
  const hiddenDraft = !!draft && !task.showDraft;

  return <div className="quiz-pane" ref={task.paneRef} onScroll={task.handleScroll}>
    <div className="quiz-toolbar">
      <div>
        <h2>自测</h2>
        <p>{sourceLabel}</p>
      </div>
      {task.loading
        ? <button className="text-button" onClick={task.stop}>停止</button>
        : <button className="quiz-generate" disabled={task.unavailable}
          title={task.unavailable ? 'AI 尚未配置' : undefined} onClick={beginGenerate}>
          <ClipboardCheck size={15} />{draft || task.currentRecord ? '重新生成本页自测' : '生成本页自测'}
        </button>}
    </div>
    {task.unavailable && <p className="quiz-disabled" role="status">
      AI 尚未配置，完成 .env 配置并重新检查连接后可生成自测。已保存的历史仍可查看。
    </p>}
    {task.loading && <p className="quiz-loading" role="status">
      <LoaderCircle size={15} className="spin" />正在根据本页课件生成题目…
    </p>}
    {task.error && <div className="quiz-error" role="alert">
      <span>{task.error}</span>
      <button className="text-button" disabled={task.unavailable} onClick={beginGenerate}>
        <RefreshCw size={14} />重试
      </button>
    </div>}
    {task.storageFailed && <p className="quiz-warning" role="status">
      无法保存到本地；关闭页面后本次练习可能丢失。
    </p>}
    {replaceAction && <div className="quiz-replace" role="alertdialog" aria-label="替换当前练习">
      <p>当前还有未提交的练习（第 {draft?.sourceSlide} 页，已作答 {task.answered} / {draft?.questions.length}）。
        继续将替换它。</p>
      <div className="quiz-result-actions">
        <button className="text-button" onClick={confirmReplace}>替换当前练习</button>
        <button className="text-button" onClick={() => setReplaceAction(null)}>取消</button>
      </div>
    </div>}
    {hiddenDraft && <div className="quiz-resume" role="status">
      <p>有未提交的练习：第 {draft?.sourceSlide} 页，已作答 {task.answered} / {draft?.questions.length}。</p>
      <button className="text-button" onClick={task.resumeDraft}>回到练习</button>
    </div>}
    {draft && task.showDraft ? <>
      <p className="quiz-progress">题目来源：第 {draft.sourceSlide} 页 · 已作答 {task.answered} / {draft.questions.length}</p>
      <ol className="quiz-draft">
        {draft.questions.map((question, index) => <li key={index}>
          <QuizQuestionCard question={question} index={index} selected={draft.answers[index]}
            disabled={task.loading} onChange={value => task.setAnswer(index, value)} />
        </li>)}
      </ol>
      <button className="quiz-submit" disabled={!task.complete} onClick={task.submit}>提交自测</button>
      <div className="quiz-result-actions">
        <button className="text-button" onClick={task.discardDraft}>放弃当前练习</button>
      </div>
    </> : task.active ? <>
      <p className="quiz-review-meta">第 {task.active.slide} 页 · {formatQuizDate(task.active.createdAt)}</p>
      <QuizReview record={task.active} onSource={onSource} />
      {task.wrongCount > 0 && <div className="quiz-result-actions">
        <button className="text-button" onClick={beginRetry}>只练错题（{task.wrongCount}）</button>
        <button className="text-button" onClick={exportWrong}>导出错题</button>
      </div>}
    </> : <div className="quiz-empty">
      <p>还没有本次自测。</p>
      {task.currentRecord && <button className="text-button"
        onClick={() => task.selectRecord(task.currentRecord!.id)}>查看本页上次自测</button>}
    </div>}
    {task.store.records.length > 0 && <section className="quiz-history" aria-label="本章自测历史">
      <h3>本章自测历史</h3>
      <ul>
        {task.store.records.map(record => <li key={record.id} className="quiz-history-row">
          <button className="quiz-history-open"
            aria-current={record.id === task.active?.id ? 'true' : undefined}
            onClick={() => task.selectRecord(record.id)}>
            <span>第 {record.slide} 页</span>
            <span>{scoreRecord(record)} / {record.questions.length}</span>
            <span>{formatQuizDate(record.createdAt)}</span>
          </button>
          <button className="quiz-history-delete"
            aria-label={`删除第 ${record.slide} 页自测记录`}
            onClick={() => task.removeRecord(record.id)}>×</button>
        </li>)}
      </ul>
    </section>}
    <QuizWrongReview store={task.store} onSource={onSource} />
  </div>;
}

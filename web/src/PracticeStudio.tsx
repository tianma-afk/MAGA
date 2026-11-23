import { useEffect, useRef, useState } from 'react';
import { Compass, Download, RotateCcw } from 'lucide-react';
import { api, ConfigurationError, errorText } from './api';
import { loadPractice, savePractice, practiceMarkdown } from './practice';
import type { PracticeCase, PracticeSession } from './practice';
import type { Mode } from './types';
import { useRetrievalIndex } from './useRetrievalIndex';
import DesignRetrievalMode from './DesignRetrievalMode';
import DesignCitations from './DesignCitations';
import './studio.css';
import './practice.css';

interface Props {
  mode?: Mode; onMode?: (mode: Mode) => void;
  onOpenSource: (chapterId: string, slide: number) => void;
}

export default function PracticeStudio({ mode, onMode, onOpenSource }: Props) {
  const [cases, setCases] = useState<PracticeCase[]>([]);
  const [session, setSession] = useState<PracticeSession | null>(() => loadPractice());
  const [caseId, setCaseId] = useState(() => loadPractice()?.caseId || '');
  const [analysis, setAnalysis] = useState(() => loadPractice()?.analysis || '');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const running = useRef<AbortController | null>(null);
  const { strategy, status, error: indexError, count: indexCount, blocked,
    select, retry } = useRetrievalIndex();

  useEffect(() => {
    const controller = new AbortController();
    api.practiceCases(controller.signal).then(setCases).catch(caught => {
      if (!controller.signal.aborted) setError(errorText(caught));
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const prior = loadPractice();
    if (prior && prior.retrievalStrategy !== 'baseline') select(prior.retrievalStrategy);
    return () => running.current?.abort();
    // Restore selection only once; switching mid-practice is disallowed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = cases.find(item => item.id === caseId);
  const decisionIndex = session?.decisions.findIndex(item => item.assessment?.action !== 'complete') ?? -1;
  const current = decisionIndex >= 0 ? session?.decisions[decisionIndex] : undefined;
  const completed = !!session && session.decisions.every(item => item.assessment?.action === 'complete');

  function update(next: PracticeSession) {
    next = { ...next, updatedAt: new Date().toISOString() };
    if (!savePractice(next)) setSaveError(true);
    else setSaveError(false);
    setSession(next);
  }

  async function run<T>(execute: (signal: AbortSignal) => Promise<T>,
    apply: (result: T) => void) {
    if (loading || running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setLoading(true);
    setError('');
    try {
      const result = await execute(controller.signal);
      if (!controller.signal.aborted && running.current === controller) {
        apply(result);
        onMode?.('ai');
      }
    } catch (caught) {
      if (!controller.signal.aborted && running.current === controller) {
        if (caught instanceof ConfigurationError) onMode?.('unconfigured');
        setError(errorText(caught));
      }
    } finally {
      if (running.current === controller) {
        running.current = null;
        setLoading(false);
      }
    }
  }

  function start() {
    if (!selected || analysis.trim().length < 20 || blocked || mode !== 'ai') return;
    void run(signal => api.practicePlan({
      caseId: selected.id, analysis: analysis.trim(), retrievalStrategy: strategy,
    }, signal), result => {
      update({
        caseId: selected.id, caseTitle: selected.title, analysis: analysis.trim(), retrievalStrategy: strategy,
        decisions: result.decisions.map(decision => ({ decision, turns: [] })),
        planKnowledge: result.knowledge,
      });
      setAnswer('');
    });
  }

  function submitAnswer() {
    if (!session || !current || !answer.trim() || answer.trim().length < 20
      || blocked || mode !== 'ai') return;
    const question = current.pendingFollowup || current.decision.question;
    const turns = [...current.turns, { question, answer: answer.trim() }];
    const snapshot = session;
    void run(signal => api.practiceAnswer({
      caseId: snapshot.caseId, analysis: snapshot.analysis,
      retrievalStrategy: snapshot.retrievalStrategy,
      decision: current.decision, turns,
    }, signal), result => {
      update({
        ...snapshot,
        decisions: snapshot.decisions.map((item, i) => i !== decisionIndex ? item : {
          ...item, turns, assessment: {
            action: result.action, feedback: result.feedback,
            followup: result.followup, citations: result.citations,
          },
          pendingFollowup: result.followup || undefined, knowledge: result.knowledge,
          knowledgeHistory: [...(item.knowledgeHistory || []), result.knowledge],
        }),
      });
      setAnswer('');
    });
  }

  function finish() {
    if (!session || !completed || session.final || blocked || mode !== 'ai') return;
    const snapshot = session;
    void run(signal => api.practiceFinalize({
      caseId: snapshot.caseId, analysis: snapshot.analysis,
      retrievalStrategy: snapshot.retrievalStrategy,
      decisions: snapshot.decisions.map(item => ({
        decision: item.decision, turns: item.turns,
        assessment: item.assessment!,
      })),
    }, signal), result => update({ ...snapshot, final: result }));
  }

  function reset() {
    if (!window.confirm('重新开始将清空当前架构实践的全部回答。确认继续？')) return;
    running.current?.abort();
    running.current = null;
    setLoading(false);
    setSession(null);
    setAnalysis('');
    setAnswer('');
    setCaseId('');
    setError('');
    setSaveError(!savePractice(null));
  }

  function exportRecord() {
    if (!session) return;
    const content = practiceMarkdown(session, selected?.title || session.caseId);
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'architecture-practice.md';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const inactive = loading || mode !== 'ai' || blocked;
  return <main className="studio">
    <header className="studio-heading">
      <Compass size={24} />
      <div><h1>架构实践</h1>
        <p>从真实项目中识别架构问题，独立提出方案，并通过追问与课程知识评审。</p>
      </div>
    </header>
    <DesignRetrievalMode value={strategy} disabled={loading || !!session} fallback={false}
      indexStatus={status} indexError={indexError} indexCount={indexCount}
      onRetry={() => { void retry(); }} onChange={select} />
    {loading && <p className="studio-loading" role="status">正在检索课程并生成反馈…
      <button className="text-button" onClick={() => {
        running.current?.abort(); running.current = null; setLoading(false);
      }}>停止</button>
    </p>}
    {mode !== 'ai' && <p className="studio-note">AI 未配置。可以查看案例，配置后才能开始训练。</p>}
    {error && <p role="alert" className="studio-error">{error}</p>}
    {saveError && <p role="alert" className="studio-error">本地保存失败，刷新页面可能丢失训练记录。</p>}
    {session && <div className="studio-navigation-actions">
      <button className="text-button" onClick={exportRecord}><Download size={15}/>导出学习记录</button>
      <button className="text-button" disabled={loading} onClick={reset}><RotateCcw size={15}/>重新选择案例</button>
    </div>}

    {!session && <section className="studio-card practice-case">
      <h2>1. 选择项目案例</h2>
      <p className="studio-muted">每个案例包含业务需求、约束与固定的架构考察目标；无需画架构图或编写代码。</p>
      <div className="practice-case-grid">
        {cases.map(item => <button type="button" key={item.id}
          className={'practice-choice' + (caseId === item.id ? ' selected' : '')}
          aria-pressed={caseId === item.id} disabled={loading}
          onClick={() => { setCaseId(item.id); setAnalysis(''); }}>
          <strong>{item.title}</strong><span>{item.level}</span>
          <small>{item.background}</small>
        </button>)}
      </div>
      {selected && <div className="practice-case-info">
        <h3>{selected.title}</h3><p>{selected.background}</p>
        <strong>已知功能需求</strong><ul>{selected.requirements.map(x => <li key={x}>{x}</li>)}</ul>
        <strong>初始约束</strong><ul>{selected.constraints.map(x => <li key={x}>{x}</li>)}</ul>
        <label>2. 你的需求理解、额外约束与潜在风险
          <textarea rows={6} maxLength={4000} value={analysis} disabled={loading}
            onChange={event => setAnalysis(event.target.value)}
            placeholder="请先独立分析：项目中哪些需求最影响架构？还需要明确哪些约束？哪些风险需要提前考虑？" />
        </label>
        <button className="studio-primary" disabled={inactive || analysis.trim().length < 20}
          onClick={start}>生成架构决策问题</button>
      </div>}
    </section>}

    {session && !session.final && <section className="studio-card practice-work">
      <h2>架构决策训练</h2>
      <p className="studio-muted">每个决策点独立作答。课程引用用于支撑问题和评价，而非提前提供参考答案。</p>
      <ol className="studio-steps">
        {session.decisions.map((item, i) => <li key={item.decision.id}
          className={item.assessment?.action === 'complete' ? 'done' : i === decisionIndex ? 'current' : ''}>
          <span>{i+1}</span>{item.decision.id} {item.assessment?.action === 'complete' ? '已完成' : ''}
        </li>)}
      </ol>
      {session.planKnowledge && <details className="practice-queries"><summary>查看本次问题生成的课程检索词</summary>
        <p>{session.planKnowledge.queries.join('；')}</p></details>}
      {session.decisions.map((item, i) => <article key={item.decision.id}
        className="practice-decision">
        <h3>{i+1}. {item.decision.question}</h3>
        {item.decision.citations.length > 0 &&
          <DesignCitations citations={item.decision.citations} onOpen={onOpenSource}/>}
        {item.turns.map((turn, j) => <div className="practice-turn" key={j}>
          <strong>{j ? '追问回答 '+j : '首次独立作答'}</strong>
          <p>{turn.question}</p><p>{turn.answer}</p>
        </div>)}
        {item.assessment && <div className="practice-feedback">
          <strong>助教反馈</strong><p>{item.assessment.feedback}</p>
          <DesignCitations citations={item.assessment.citations} onOpen={onOpenSource}/>
          {!!item.knowledgeHistory?.length && <details><summary>查看各轮课程检索词</summary>
            {item.knowledgeHistory.map((receipt, j) =>
              <p key={j}>第 {j+1} 轮：{receipt.queries.join('；')}</p>)}</details>}
        </div>}
        {i === decisionIndex && <div className="practice-compose">
          {item.pendingFollowup && <p><strong>针对性追问：</strong>{item.pendingFollowup}</p>}
          <label>{item.turns.length ? '回答追问' : '你的架构设计思路'}
            <textarea rows={5} maxLength={4000} value={answer} disabled={loading}
              onChange={event => setAnswer(event.target.value)}
              placeholder="提出你的方案，说明为什么选择它、有哪些风险、可能如何优化。" />
          </label>
          <button className="studio-primary" disabled={inactive || answer.trim().length < 20}
            onClick={submitAnswer}>提交回答并获得反馈</button>
        </div>}
      </article>)}
      {completed && <button className="studio-primary" disabled={inactive} onClick={finish}>
        生成综合评审与参考方案
      </button>}
    </section>}

    {session?.final && <section className="studio-card practice-final">
      <h2>架构实践综合评审</h2>
      <p>{session.final.summary}</p>
      <h3>已有的设计能力</h3><ul>{session.final.strengths.map((x,i) => <li key={i}>{x}</li>)}</ul>
      <h3>需要优化的地方</h3><ul>{session.final.improvements.map((x,i) => <li key={i}>{x}</li>)}</ul>
      <h3>参考架构设计思路</h3><p>{session.final.referenceApproach}</p>
      <DesignCitations citations={session.final.citations} onOpen={onOpenSource}/>
      <details><summary>综合评审检索的课程查询</summary>
        <p>{session.final.knowledge.queries.join('；')}</p></details>
      <p className="studio-muted">评价区分首次独立回答和追问后的修正，不将学习过程中的提示视为独立掌握。</p>
    </section>}
  </main>;
}

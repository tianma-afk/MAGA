import { useEffect, useRef, useState } from 'react';
import { Compass, Download, LoaderCircle, RotateCcw } from 'lucide-react';
import { api, ConfigurationError, errorText } from './api';
import {
  clearDesignProject, designMarkdown, emptyDesignProject, loadDesignProject,
  saveDesignProject, uniqueTactics,
} from './design';
import {
  analysisKey, analysisStatus, blocksNextStage, reviewKey, reviewStatus,
  initialDesignStep, selectedTacticsOf, statusNote, tacticsKey, tacticsStatus,
  type DesignStep,
} from './designValidity';
import type { DesignProject, Mode } from './types';
import DesignCitations from './DesignCitations';
import ConfirmDialog from './ConfirmDialog';
import './studio.css';

type GenerationStage = 'analysis' | 'tactics' | 'review';
const REPLACEMENT_SCOPE: Record<GenerationStage, string> = {
  analysis: '质量属性与场景分析、架构战术、战术选择及 AI 评审',
  tactics: '架构战术、战术选择及 AI 评审',
  review: 'AI 评审',
};

const STEPS: { id: DesignStep; label: string }[] = [
  { id: 'scenario', label: '场景' },
  { id: 'attributes', label: '场景分析' },
  { id: 'tactics', label: '战术' },
  { id: 'review', label: '评审' },
];

function stamp(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  mode?: Mode;
  onMode?: (mode: Mode) => void;
  onOpenSource: (chapterId: string, slide: number) => void;
}

export default function DesignStudio({ mode, onMode, onOpenSource }: Props) {
  const [project, setProject] = useState<DesignProject>(() => {
    try { return loadDesignProject(localStorage); }
    catch { return emptyDesignProject(); }
  });
  const [step, setStep] = useState<DesignStep>(() => initialDesignStep(project));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);
  const [savedAt, setSavedAt] = useState(() => stamp(project.updatedAt));
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmGeneration, setConfirmGeneration] = useState<GenerationStage | null>(null);
  const projectRef = useRef(project);
  const request = useRef<AbortController | null>(null);
  const unavailable = mode !== 'ai';
  const canStart = !!project.title.trim() && !!project.scenario.trim();
  const selectedTactics = project.tactics.filter(
    tactic => project.selectedTactics.includes(tactic.name),
  );
  const analysisState = analysisStatus(project);
  const tacticsState = tacticsStatus(project);
  const reviewState = reviewStatus(project);
  const analysisNote = statusNote(analysisState, 'analysis');
  const tacticsNote = statusNote(tacticsState, 'tactics');
  const reviewNote = statusNote(reviewState, 'review');

  useEffect(() => () => { request.current?.abort(); }, []);

  /** The single boundary for every project change: state, the in-flight
   *  request's view of it, and local storage stay in step. */
  function commit(next: DesignProject, preserveOnFailure = false) {
    const saved = saveDesignProject(localStorage, next);
    setStorageFailed(!saved);
    if (preserveOnFailure && !saved) return false;
    projectRef.current = next;
    setProject(next);
    if (saved) setSavedAt(stamp());
    return saved;
  }

  function patch(changes: Partial<DesignProject>) {
    commit({ ...projectRef.current, ...changes, updatedAt: new Date().toISOString() });
  }

  function navigate(next: DesignStep) {
    if (!loading && !request.current) setStep(next);
  }

  function requestGeneration(stage: GenerationStage) {
    if (unavailable || loading || request.current) return;
    const current = projectRef.current;
    if (stage === 'analysis' && (!current.title.trim() || !current.scenario.trim())) return;
    if (stage === 'tactics' && blocksNextStage(analysisStatus(current))) return;
    if (stage === 'review' && (!selectedTacticsOf(current).length
      || blocksNextStage(tacticsStatus(current)))) return;
    const hasReview = !!current.review;
    const hasTactics = !!current.tactics.length || !!current.selectedTactics.length;
    const replaces = stage === 'analysis'
      ? !!current.qualityAttributes.length || !!current.scenarios.length || hasTactics || hasReview
      : stage === 'tactics' ? hasTactics || hasReview : hasReview;
    if (replaces) setConfirmGeneration(stage);
    else runGeneration(stage);
  }

  function runGeneration(stage: GenerationStage) {
    setConfirmGeneration(null);
    if (stage === 'analysis') void generateScenarios();
    else if (stage === 'tactics') void generateTactics();
    else void generateReview();
  }

  async function generateScenarios() {
    const current = projectRef.current;
    if (unavailable || loading || request.current || !current.title.trim() || !current.scenario.trim()) return;
    const inputs = {
      title: current.title.trim(),
      scenario: current.scenario.trim(),
      requirements: current.requirements.trim(),
    };
    const key = analysisKey(inputs);
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const result = await api.designScenarios(inputs, controller.signal);
      if (controller.signal.aborted || request.current !== controller) return;
      if (!commit({
        ...projectRef.current,
        qualityAttributes: result.qualityAttributes,
        scenarios: result.scenarios,
        tactics: [],
        selectedTactics: [],
        review: undefined,
        versions: { analysis: key },
        updatedAt: new Date().toISOString(),
      }, true)) return;
      onMode?.('ai');
      setStep('attributes');
    } catch (caught) {
      if (!controller.signal.aborted && request.current === controller) {
        if (caught instanceof ConfigurationError) onMode?.('unconfigured');
        setError(errorText(caught));
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }

  async function generateTactics() {
    if (unavailable || loading || request.current || blocksNextStage(analysisState)) return;
    const current = projectRef.current;
    const key = tacticsKey(current);
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const result = await api.designTactics({
        scenario: current.scenario.trim(),
        requirements: current.requirements.trim(),
        qualityAttributes: current.qualityAttributes,
        scenarios: current.scenarios,
      }, controller.signal);
      if (controller.signal.aborted || request.current !== controller) return;
      const tactics = uniqueTactics(result.tactics);
      if (!commit({
        ...projectRef.current,
        tactics,
        selectedTactics: tactics.map(tactic => tactic.name),
        review: undefined,
        versions: { analysis: current.versions?.analysis, tactics: key },
        updatedAt: new Date().toISOString(),
      }, true)) return;
      onMode?.('ai');
      setStep('tactics');
    } catch (caught) {
      if (!controller.signal.aborted && request.current === controller) {
        if (caught instanceof ConfigurationError) onMode?.('unconfigured');
        setError(errorText(caught));
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }

  async function generateReview() {
    if (unavailable || loading || request.current || !selectedTactics.length
      || blocksNextStage(tacticsState)) return;
    const current = projectRef.current;
    const chosen = selectedTacticsOf(current);
    if (!chosen.length) return;
    const key = reviewKey(current, chosen);
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const result = await api.designReview({
        title: current.title.trim(),
        scenario: current.scenario.trim(),
        requirements: current.requirements.trim(),
        qualityAttributes: current.qualityAttributes,
        scenarios: current.scenarios,
        tactics: chosen,
      }, controller.signal);
      if (controller.signal.aborted || request.current !== controller) return;
      if (!commit({
        ...projectRef.current,
        selectedTactics: chosen.map(tactic => tactic.name),
        review: result,
        versions: { ...current.versions, review: key },
        updatedAt: new Date().toISOString(),
      }, true)) return;
      onMode?.('ai');
      setStep('review');
    } catch (caught) {
      if (!controller.signal.aborted && request.current === controller) {
        if (caught instanceof ConfigurationError) onMode?.('unconfigured');
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

  function toggleTactic(name: string) {
    const current = projectRef.current;
    if (loading || request.current || blocksNextStage(tacticsStatus(current))) return;
    const selected = current.selectedTactics.includes(name)
      ? current.selectedTactics.filter(item => item !== name)
      : [...current.selectedTactics, name];
    commit({ ...current, selectedTactics: selected, updatedAt: new Date().toISOString() });
  }

  function reset() {
    request.current?.abort();
    request.current = null;
    clearDesignProject(localStorage);
    projectRef.current = emptyDesignProject();
    setProject(emptyDesignProject());
    setStep('scenario');
    setError('');
    setStorageFailed(false);
    setSavedAt('');
    setConfirmReset(false);
  }

  function exportDesign() {
    const blob = new Blob([designMarkdown(project)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'architecture-design.md';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return <main className="studio">
    <header className="studio-heading">
      <Compass size={24} />
      <div>
        <h1>架构实践</h1>
        <p>把课程中的质量属性、场景和战术用到真实系统设计中。</p>
      </div>
    </header>
    <ol className="studio-steps" aria-label="设计步骤">
      {STEPS.map((item, index) => {
        const current = item.id === step;
        const exists = item.id === 'scenario' || (item.id === 'attributes'
          ? !!project.scenarios.length || !!project.qualityAttributes.length
          : item.id === 'tactics' ? !!project.tactics.length : !!project.review);
        return <li key={item.id} className={current ? 'current' : exists ? 'done' : ''}>
          <button type="button" aria-label={`查看${item.label}`}
            aria-current={current ? 'step' : undefined} disabled={loading || !exists}
            onClick={() => navigate(item.id)}>
            <span aria-hidden="true">{index + 1}</span>{item.label}
          </button>
        </li>;
      })}
    </ol>
    <div className="studio-navigation-actions">
      <button className="text-button" onClick={exportDesign}><Download size={15} />导出 Markdown</button>
    </div>
    {unavailable && <p className="studio-note" role="status">
      AI 尚未配置，完成 .env 配置并重新检查连接后可生成设计分析。已保存的草稿仍可查看和导出。
    </p>}
    {loading && <p className="studio-loading" role="status">
      <LoaderCircle size={15} className="spin" />正在生成…
      <button className="text-button" onClick={stop}>停止</button>
    </p>}
    {error && <div className="studio-error" role="alert">{error}</div>}
    {storageFailed && <p className="studio-warning" role="status">
      无法保存到本地；关闭页面后草稿可能丢失。
    </p>}
    {!storageFailed && savedAt && <p className="studio-saved" role="status">
      已保存到本地 {savedAt} · 输入会自动保存
    </p>}

    {step === 'scenario' ? <section className="studio-card">
      <h2>1. 描述一个真实场景</h2>
      <p className="studio-muted">例如：在线考试系统、外卖订单系统、校园二手交易平台。</p>
      <label>设计标题
        <input value={project.title} maxLength={200} disabled={loading}
          onChange={event => patch({ title: event.target.value })}
          placeholder="例如：在线考试系统" />
      </label>
      <label>场景描述
        <textarea value={project.scenario} maxLength={3000} rows={4} disabled={loading}
          onChange={event => patch({ scenario: event.target.value })}
          placeholder="系统要解决什么问题？用户是谁？主要流程是什么？" />
      </label>
      <label>需求与约束
        <textarea value={project.requirements} maxLength={6000} rows={3} disabled={loading}
          onChange={event => patch({ requirements: event.target.value })}
          placeholder="例如：考试期间不能中断；峰值 1 万人同时在线。" />
      </label>
      <button className="studio-primary" disabled={unavailable || loading || !canStart}
        onClick={() => requestGeneration('analysis')}>
        生成质量属性与场景
      </button>
    </section> : null}

    {step === 'attributes' ? <section>
      <div className="studio-section-head">
        <h2>2. 质量属性与场景</h2>
        <button className="text-button" disabled={loading} onClick={() => navigate('scenario')}>修改场景</button>
      </div>
      {analysisNote && <p className="studio-stale" role="status">{analysisNote}</p>}
      <div className="studio-grid">
        {project.qualityAttributes.map(item => <article className="studio-card" key={item.name}>
          <span className={`studio-priority ${item.priority}`}>{item.priority}</span>
          <h3>{item.name}</h3>
          <p>{item.reason}</p>
        </article>)}
      </div>
      <h3 className="studio-subhead">质量属性场景</h3>
      <div className="studio-list">
        {project.scenarios.map((scenario, index) => <article className="studio-card" key={index}>
          <h3>{index + 1}. {scenario.stimulus}</h3>
          <dl>
            <dt>来源</dt><dd>{scenario.source}</dd>
            <dt>制品</dt><dd>{scenario.artifact}</dd>
            <dt>环境</dt><dd>{scenario.environment}</dd>
            <dt>响应</dt><dd>{scenario.response}</dd>
            <dt>度量</dt><dd>{scenario.measure}</dd>
          </dl>
          <DesignCitations citations={scenario.citations} onOpen={onOpenSource} />
        </article>)}
      </div>
      <button className="studio-primary" disabled={unavailable || loading || blocksNextStage(analysisState)}
        title={blocksNextStage(analysisState) ? '请先重新生成质量属性与场景' : undefined}
        onClick={() => requestGeneration('tactics')}>推荐架构战术</button>
    </section> : null}

    {step === 'tactics' ? <section>
      <div className="studio-section-head">
        <h2>3. 选择架构战术</h2>
        <button className="text-button" disabled={loading} onClick={() => navigate('attributes')}>返回场景</button>
      </div>
      <p className="studio-muted">选择你认为适合当前场景的战术，再生成评审。</p>
      {tacticsNote && <p className="studio-stale" role="status">{tacticsNote}
        {blocksNextStage(tacticsState) && ' 当前为只读回看，不能修改战术选择。'}
      </p>}
      {reviewState === 'stale' && <p className="studio-stale" role="status">{reviewNote}
        <button className="text-button" disabled={loading} onClick={() => navigate('review')}>查看原评审</button>
      </p>}
      <div className="studio-list">
        {project.tactics.map(tactic => <label className="studio-tactic" key={tactic.name}>
          <input type="checkbox" checked={project.selectedTactics.includes(tactic.name)}
            disabled={loading || blocksNextStage(tacticsState)}
            onChange={() => toggleTactic(tactic.name)} />
          <span>
            <strong>{tactic.name}</strong>
            <p>{tactic.rationale}</p>
            <p className="studio-muted">权衡：{tactic.tradeoffs}</p>
            <DesignCitations citations={tactic.citations} onOpen={onOpenSource} />
          </span>
        </label>)}
      </div>
      <button className="studio-primary"
        disabled={unavailable || loading || !selectedTactics.length || blocksNextStage(tacticsState)}
        title={blocksNextStage(tacticsState) ? '请先重新推荐架构战术' : undefined}
        onClick={() => requestGeneration('review')}>生成 AI 评审</button>
    </section> : null}

    {step === 'review' && project.review ? <section>
      <div className="studio-section-head">
        <h2>4. AI 评审</h2>
        <button className="text-button" disabled={loading} onClick={() => setConfirmReset(true)}>
          <RotateCcw size={14} />重新开始</button>
      </div>
      <p className="studio-summary">{project.review.summary}</p>
      {reviewNote && <p className="studio-stale" role="status">{reviewNote}</p>}
      <div className="studio-list">
        {project.review.findings.map((finding, index) => <article className="studio-card" key={index}>
          <span className={`studio-priority ${finding.severity}`}>{finding.severity}</span>
          <h3>{finding.area}</h3>
          <p>{finding.finding}</p>
          <p className="studio-muted">建议：{finding.suggestion}</p>
          <DesignCitations citations={finding.citations} onOpen={onOpenSource} />
        </article>)}
      </div>
      <h3 className="studio-subhead">答辩追问</h3>
      <ul className="studio-questions">
        {project.review.questions.map((question, index) => <li key={index}>{question}</li>)}
      </ul>
      <div className="studio-actions">
        <button className="text-button" disabled={loading} onClick={() => navigate('tactics')}>返回战术</button>
      </div>
    </section> : null}
    {confirmGeneration && <ConfirmDialog title="重新生成并替换现有成果？"
      cancelLabel="取消，保留原成果" confirmLabel="确认重新生成"
      onCancel={() => setConfirmGeneration(null)} onConfirm={() => runGeneration(confirmGeneration)}>
      <p>生成成功后将替换或清除以下已有成果：</p>
      <p>{REPLACEMENT_SCOPE[confirmGeneration]}</p>
      <p>请求失败或停止时，全部旧成果都会保留。建议先导出当前草稿。</p>
      <button className="text-button" onClick={exportDesign}>先导出 Markdown</button>
    </ConfirmDialog>}
    {confirmReset && <ConfirmDialog title="重新开始实践？" cancelLabel="保留草稿"
      confirmLabel="清空实践草稿" onCancel={() => setConfirmReset(false)} onConfirm={reset}>
      <RotateCcw size={22} />
      <p>当前草稿将被清空，且无法恢复：</p>
      <ul>
        <li>已填写的标题、场景与约束</li>
        <li>已生成的质量属性、场景、战术与评审</li>
      </ul>
      <p>如已生成评审，建议先导出 Markdown 再重新开始。</p>
    </ConfirmDialog>}
  </main>;
}

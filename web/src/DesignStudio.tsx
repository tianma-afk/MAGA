import { useEffect, useRef, useState } from 'react';
import { Compass, Download, LoaderCircle, RotateCcw } from 'lucide-react';
import { api, errorText } from './api';
import {
  clearDesignProject, designMarkdown, emptyDesignProject, loadDesignProject,
  saveDesignProject, uniqueTactics,
} from './design';
import type { DesignProject, Mode } from './types';
import DesignCitations from './DesignCitations';
import './studio.css';

type Step = 'scenario' | 'attributes' | 'tactics' | 'review';

const STEPS: { id: Step; label: string }[] = [
  { id: 'scenario', label: '场景' },
  { id: 'attributes', label: '场景分析' },
  { id: 'tactics', label: '战术' },
  { id: 'review', label: '评审' },
];

function initialStep(project: DesignProject): Step {
  if (project.review) return 'review';
  if (project.tactics.length) return 'tactics';
  if (project.scenarios.length) return 'attributes';
  return 'scenario';
}

interface Props {
  mode?: Mode;
  onOpenSource: (chapterId: string, slide: number) => void;
}

export default function DesignStudio({ mode, onOpenSource }: Props) {
  const [project, setProject] = useState<DesignProject>(() => {
    try { return loadDesignProject(localStorage); }
    catch { return emptyDesignProject(); }
  });
  const [step, setStep] = useState<Step>(() => initialStep(project));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  const unavailable = mode !== 'ai';
  const canStart = !!project.title.trim() && !!project.scenario.trim();
  const selectedTactics = project.tactics.filter(
    tactic => project.selectedTactics.includes(tactic.name),
  );

  useEffect(() => () => { request.current?.abort(); }, []);

  function update(next: DesignProject) {
    setProject(next);
    setStorageFailed(!saveDesignProject(localStorage, next));
  }

  function patch(changes: Partial<DesignProject>) {
    setProject(previous => ({ ...previous, ...changes }));
  }

  async function generateScenarios() {
    if (unavailable || loading || !canStart) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const result = await api.designScenarios({
        title: project.title.trim(),
        scenario: project.scenario.trim(),
        requirements: project.requirements.trim(),
      }, controller.signal);
      if (controller.signal.aborted || request.current !== controller) return;
      update({
        ...project,
        qualityAttributes: result.qualityAttributes,
        scenarios: result.scenarios,
        tactics: [],
        selectedTactics: [],
        review: undefined,
        updatedAt: new Date().toISOString(),
      });
      setStep('attributes');
    } catch (caught) {
      if (!controller.signal.aborted && request.current === controller) setError(errorText(caught));
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }

  async function generateTactics() {
    if (unavailable || loading) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const result = await api.designTactics({
        scenario: project.scenario.trim(),
        requirements: project.requirements.trim(),
        qualityAttributes: project.qualityAttributes,
        scenarios: project.scenarios,
      }, controller.signal);
      if (controller.signal.aborted || request.current !== controller) return;
      const tactics = uniqueTactics(result.tactics);
      update({
        ...project,
        tactics,
        selectedTactics: tactics.map(tactic => tactic.name),
        review: undefined,
        updatedAt: new Date().toISOString(),
      });
      setStep('tactics');
    } catch (caught) {
      if (!controller.signal.aborted && request.current === controller) setError(errorText(caught));
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }

  async function generateReview() {
    if (unavailable || loading || !selectedTactics.length) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const result = await api.designReview({
        title: project.title.trim(),
        scenario: project.scenario.trim(),
        requirements: project.requirements.trim(),
        qualityAttributes: project.qualityAttributes,
        scenarios: project.scenarios,
        tactics: selectedTactics,
      }, controller.signal);
      if (controller.signal.aborted || request.current !== controller) return;
      update({
        ...project,
        selectedTactics: selectedTactics.map(tactic => tactic.name),
        review: result,
        updatedAt: new Date().toISOString(),
      });
      setStep('review');
    } catch (caught) {
      if (!controller.signal.aborted && request.current === controller) setError(errorText(caught));
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
    const selected = project.selectedTactics.includes(name)
      ? project.selectedTactics.filter(item => item !== name)
      : [...project.selectedTactics, name];
    update({ ...project, selectedTactics: selected, updatedAt: new Date().toISOString() });
  }

  function reset() {
    request.current?.abort();
    request.current = null;
    clearDesignProject(localStorage);
    setProject(emptyDesignProject());
    setStep('scenario');
    setError('');
    setStorageFailed(false);
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
        const done = STEPS.findIndex(entry => entry.id === step) > index;
        return <li key={item.id} className={current ? 'current' : done ? 'done' : ''}>
          <span>{index + 1}</span>{item.label}
        </li>;
      })}
    </ol>
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
        onClick={() => void generateScenarios()}>
        生成质量属性与场景
      </button>
    </section> : null}

    {step === 'attributes' ? <section>
      <div className="studio-section-head">
        <h2>2. 质量属性与场景</h2>
        <button className="text-button" onClick={() => setStep('scenario')}>修改场景</button>
      </div>
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
      <button className="studio-primary" disabled={unavailable || loading}
        onClick={() => void generateTactics()}>推荐架构战术</button>
    </section> : null}

    {step === 'tactics' ? <section>
      <div className="studio-section-head">
        <h2>3. 选择架构战术</h2>
        <button className="text-button" onClick={() => setStep('attributes')}>返回场景</button>
      </div>
      <p className="studio-muted">选择你认为适合当前场景的战术，再生成评审。</p>
      <div className="studio-list">
        {project.tactics.map(tactic => <label className="studio-tactic" key={tactic.name}>
          <input type="checkbox" checked={project.selectedTactics.includes(tactic.name)}
            disabled={loading}
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
        disabled={unavailable || loading || !selectedTactics.length}
        onClick={() => void generateReview()}>生成 AI 评审</button>
    </section> : null}

    {step === 'review' && project.review ? <section>
      <div className="studio-section-head">
        <h2>4. AI 评审</h2>
        <button className="text-button" onClick={reset}><RotateCcw size={14} />重新开始</button>
      </div>
      <p className="studio-summary">{project.review.summary}</p>
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
        <button className="studio-primary" onClick={exportDesign}><Download size={15} />导出 Markdown</button>
        <button className="text-button" onClick={() => setStep('tactics')}>返回战术</button>
      </div>
    </section> : null}
  </main>;
}

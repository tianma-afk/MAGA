import type { RetrievalStrategy } from './types';

interface Props {
  value: RetrievalStrategy;
  disabled: boolean;
  fallback: boolean;
  indexStatus: 'idle' | 'building' | 'ready' | 'error';
  indexCount: number;
  indexError: string;
  onRetry: () => void;
  onChange: (value: RetrievalStrategy) => void;
}

export default function DesignRetrievalMode({ value, disabled, fallback, indexStatus,
  indexCount, indexError, onRetry, onChange }: Props) {
  return <section className="studio-note studio-retrieval">
    <label>课程来源检索
      <select value={value} disabled={disabled} aria-describedby="retrieval-description"
        onChange={event => onChange(event.target.value as RetrievalStrategy)}>
        <option value="baseline">标准检索（默认）</option>
        <option value="llm_assisted">AI 增强检索</option>
        <option value="hybrid">RAG 混合检索（BM25 + Jina Embedding）</option>
      </select>
    </label>
    <p id="retrieval-description">{value === 'baseline'
      ? '使用原有课程知识检索，响应通常更快。'
      : value === 'hybrid'
        ? '使用英文查询，在持久化 PPT 页面索引中融合 BM25（0.2）和 Jina Embedding（0.5）；选择后自动检查并增量构建索引；构建完成前不可生成，失败可重试。'
        : '先分析设计需求，再检索相关课程知识；可能更慢，结果不保证更准确。每次生成会增加一次 AI 规划调用。'}
      {' '}仅影响后续生成，本页关闭后恢复标准检索。</p>
    {value === 'hybrid' && indexStatus === 'building' &&
      <p role="status" aria-live="polite">正在构建 RAG 索引，请完成后再生成架构分析…</p>}
    {value === 'hybrid' && indexStatus === 'ready' &&
      <p role="status">RAG 索引已就绪，共 {indexCount} 页，可以继续生成。</p>}
    {value === 'hybrid' && indexStatus === 'error' &&
      <div role="alert">
        <p>{indexError}</p>
        <button type="button" disabled={disabled} onClick={onRetry}>重试构建 RAG 索引</button>
      </div>}
    {fallback && <p role="status">增强规划不可用，已使用标准检索。</p>}
  </section>;
}

import type { RetrievalStrategy } from './types';

interface Props {
  value: RetrievalStrategy;
  disabled: boolean;
  fallback: boolean;
  onChange: (value: RetrievalStrategy) => void;
}

export default function DesignRetrievalMode({ value, disabled, fallback, onChange }: Props) {
  return <section className="studio-note studio-retrieval">
    <label>课程来源检索
      <select value={value} disabled={disabled} aria-describedby="retrieval-description"
        onChange={event => onChange(event.target.value as RetrievalStrategy)}>
        <option value="baseline">标准检索（默认）</option>
        <option value="llm_assisted">AI 增强检索</option>
      </select>
    </label>
    <p id="retrieval-description">{value === 'baseline'
      ? '使用原有课程知识检索，响应通常更快。'
      : '先分析设计需求，再检索相关课程知识；可能更慢，结果不保证更准确。每次生成会增加一次 AI 规划调用。'}
      {' '}仅影响后续生成，本页关闭后恢复标准检索。</p>
    {fallback && <p role="status">增强规划不可用，已使用标准检索。</p>}
  </section>;
}

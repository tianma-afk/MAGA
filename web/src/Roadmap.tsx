import { ArrowDown, RefreshCw } from 'lucide-react';
import type { Outline } from './types';

export interface RoadmapProps {
  outline?: Outline;
  error: string;
  onRetry: () => void;
  page: number;
  onPage: (page: number) => void;
  busy: boolean;
}
export default function Roadmap({ outline, error, onRetry, page, onPage, busy }: RoadmapProps) {
  if (error) return <div className="roadmap-status" role="alert">{error}
    <button className="text-button" onClick={onRetry}><RefreshCw size={14} />重试大纲</button>
  </div>;
  if (!outline) return <p className="roadmap-status" role="status">正在读取学习大纲…</p>;
  if (!outline.nodes.length) return <p className="roadmap-status">本章暂无学习大纲。</p>;
  return <section className="roadmap" aria-label="章节学习路线">
    <h2>{outline.title}</h2>
    <ol className="roadmap-nodes">
      {outline.nodes.map((node, index) => {
        const outgoing = outline.edges.filter(edge => edge.source === node.id)
          .map(edge => outline.nodes.find(target => target.id === edge.target))
          .filter(target => target !== undefined);
        const pages = [...new Set(node.slides)].sort((a, b) => a - b);
        return <li key={node.id} aria-current={pages.includes(page) ? 'step' : undefined}>
          <span className="roadmap-marker" aria-hidden="true">{index + 1}</span>
          <div className="roadmap-topic">
            <button className="roadmap-node" aria-label={`学习节点：${node.title}`}
              disabled={busy || !node.slides.length} onClick={() => onPage(node.slides[0])}>
              <strong>{node.title}</strong>
              {!!pages.length && <span>第 {pages[0]}{pages.length > 1 ? `–${pages.at(-1)}` : ''} 页</span>}
            </button>
            <p>{node.summary}</p>
            <div className="roadmap-pages">{pages.map(slide =>
              <button key={slide} disabled={busy} aria-label={`大纲第 ${slide} 页`}
                aria-current={slide === page ? 'page' : undefined} onClick={() => onPage(slide)}>{slide}</button>)}</div>
            {outgoing.map(target => <div className="roadmap-connection" key={target.id}>
              <ArrowDown size={13} aria-hidden="true" />
              <button disabled={busy || !target.slides.length} onClick={() => onPage(target.slides[0])}
                aria-label={`下一节点：${target.title}`}>{target.title}</button>
            </div>)}
          </div>
        </li>;
      })}
    </ol>
  </section>;
}

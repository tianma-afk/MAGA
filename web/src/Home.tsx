import { ArrowUpRight, BookOpen, Compass } from 'lucide-react';
import type { Chapter } from './types';
import { loadSession } from './state';
import { loadProgress } from './progress';
import { loadQuizStore, quizSummary } from './quiz';

export default function Home({ chapters }: { chapters: Chapter[] }) {
  return <main className="home">
    <header className="home-heading"><BookOpen size={23} /><h1>学习空间</h1></header>
    <a className="home-studio" href="#/studio">
      <Compass size={22} />
      <span>
        <strong>架构实践</strong>
        <small>选一个真实场景，用课程中的质量属性和战术完成设计草案</small>
      </span>
      <ArrowUpRight size={18} aria-hidden="true" />
    </a>
    <div className="home-list-label"><h2>课程章节</h2><span>{chapters.length} 章</span></div>
    <div className="home-chapters">
      {chapters.map(chapter => {
        let page = 1;
        let visited = 0;
        let attempts = 0;
        let average = 0;
        try {
          page = loadSession(localStorage, chapter.id, chapter.slideCount).slide;
          visited = loadProgress(localStorage, chapter.id).visited
            .filter(number => number >= 1 && number <= chapter.slideCount).length;
          const summary = quizSummary(loadQuizStore(localStorage, chapter.id));
          attempts = summary.attempts;
          average = summary.averagePercent;
        } catch { /* Storage is optional. */ }
        return <a className="home-chapter" key={chapter.id}
          href={`#/chapter/${encodeURIComponent(chapter.id)}`} aria-label={`打开章节：${chapter.title}`}>
          <BookOpen size={19} />
          <span className="home-chapter-title">{chapter.title}<small>{chapter.slideCount} 页课件</small></span>
          <span className="resume-page">
            上次读到第 {page} 页 · 已学 {visited}/{chapter.slideCount} 页
            {attempts > 0 && <small>自测 {attempts} 次 · 平均 {average}%</small>}
          </span>
          <ArrowUpRight size={18} aria-hidden="true" />
        </a>;
      })}
    </div>
    {!chapters.length && <p className="pane-empty">暂无可用章节。</p>}
  </main>;
}

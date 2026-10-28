import { ArrowUpRight, BookOpen } from 'lucide-react';
import type { Chapter } from './types';
import { loadSession } from './state';

export default function Home({ chapters }: { chapters: Chapter[] }) {
  return <main className="home">
    <header className="home-heading"><BookOpen size={23} /><h1>学习空间</h1></header>
    <div className="home-list-label"><h2>课程章节</h2><span>{chapters.length} 章</span></div>
    <div className="home-chapters">
      {chapters.map(chapter => {
        let page = 1;
        try { page = loadSession(localStorage, chapter.id, chapter.slideCount).slide; } catch { /* Storage is optional. */ }
        return <a className="home-chapter" key={chapter.id}
          href={`#/chapter/${encodeURIComponent(chapter.id)}`} aria-label={`打开章节：${chapter.title}`}>
          <BookOpen size={19} />
          <span className="home-chapter-title">{chapter.title}<small>{chapter.slideCount} 页课件</small></span>
          <span className="resume-page">上次读到第 {page} 页</span>
          <ArrowUpRight size={18} aria-hidden="true" />
        </a>;
      })}
    </div>
    {!chapters.length && <p className="pane-empty">暂无可用章节。</p>}
  </main>;
}

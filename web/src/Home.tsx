import { useEffect, useState } from 'react';
import { ArrowUpRight, BookOpen, ClipboardCheck, Compass } from 'lucide-react';
import type { Chapter } from './types';
import { homeSnapshot } from './resumeTasks';

const icons = { learning: BookOpen, quiz: ClipboardCheck, design: Compass };
function snapshot(chapters: Chapter[]) {
  try { return homeSnapshot(localStorage, chapters); }
  catch { return homeSnapshot(undefined, chapters); }
}

export default function Home({ chapters }: { chapters: Chapter[] }) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const changed = () => refresh(value => value + 1);
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  const { summaries, tasks } = snapshot(chapters);
  const hasDesign = tasks.some(task => task.kind === 'design');
  return <main className="home">
    <header className="home-heading"><BookOpen size={23} /><div>
      <h1>学习空间</h1>
      <p className="home-intro">从上次停下的地方继续，或选择一个章节开始学习。</p>
    </div></header>
    {tasks.length > 0 ? <section className="home-resume" aria-label="继续上次任务">
      <h2>继续上次任务</h2>
      <div className="home-task-grid">
        {tasks.map(task => {
          const Icon = icons[task.kind];
          return <a key={task.kind} className={`home-task ${task.kind}`} href={task.href}
            aria-label={`${task.label}：${task.title}`}>
            <span className="home-task-label"><Icon size={18} />{task.label}</span>
            <strong>{task.title}</strong>
            <span className="home-task-detail">{task.detail}</span>
            <span className="home-task-action">回到任务<ArrowUpRight size={15} aria-hidden="true" /></span>
          </a>;
        })}
      </div>
    </section> : chapters.length > 0 ? <section className="home-start" aria-label="开始学习">
      <h2>从第一章开始</h2>
      <p>先浏览课件和学习大纲，再提问或练习。记录保存在当前浏览器。</p>
      <a href={`#/chapter/${encodeURIComponent(chapters[0].id)}`}
        aria-label={`开始学习：${chapters[0].title}`}>开始学习<ArrowUpRight size={16} /></a>
    </section> : null}
    {!hasDesign && <a className="home-studio" href="#/studio">
      <Compass size={22} />
      <span>
        <strong>架构实践</strong>
        <small>选一个真实场景，用课程中的质量属性和战术完成设计草案</small>
      </span>
      <ArrowUpRight size={18} aria-hidden="true" />
    </a>}
    <div className="home-list-label"><h2>课程章节</h2><span>{chapters.length} 章</span></div>
    <div className="home-chapters">
      {summaries.map(({ chapter, page, visited, hasReading, attempts, average }) =>
        <a className="home-chapter" key={chapter.id}
          href={`#/chapter/${encodeURIComponent(chapter.id)}`} aria-label={`打开章节：${chapter.title}`}>
          <BookOpen size={19} />
          <span className="home-chapter-title">{chapter.title}<small>{chapter.slideCount} 页课件</small></span>
          <span className="resume-page">
            {hasReading ? `上次读到第 ${page} 页 · 已浏览 ${visited}/${chapter.slideCount} 页` : '尚未浏览 · 开始学习'}
            {attempts > 0 && <small>最近 {attempts} 次自测 · 平均正确率 {average}%</small>}
          </span>
          <ArrowUpRight size={18} aria-hidden="true" />
        </a>)}
    </div>
    {!chapters.length && <p className="pane-empty">暂无可用章节。</p>}
  </main>;
}

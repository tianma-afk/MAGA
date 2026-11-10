import type { Chapter } from './types';
import { loadSession } from './state';
import { loadProgress } from './progress';
import { loadQuizStore, quizSummary } from './quiz';
import { answeredCount, loadQuizWorkspace } from './quizWorkspace';
import { loadDesignProject } from './design';
import { analysisStatus, initialDesignStep, reviewStatus, tacticsStatus } from './designValidity';

type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface ResumeTask {
  kind: 'learning' | 'quiz' | 'design';
  label: string;
  title: string;
  detail: string;
  href: string;
  updatedAt: string;
}
export interface ChapterSummary {
  chapter: Chapter;
  page: number;
  visited: number;
  hasReading: boolean;
  attempts: number;
  average: number;
}

function timestamp(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > 0 && time <= Date.now() ? time : 0;
}

const chapterLink = (id: string) => `#/chapter/${encodeURIComponent(id)}`;

/** Use the existing validated loaders; a broken chapter must not hide other tasks. */
export function homeSnapshot(store: StoragePort | undefined, chapters: Chapter[]) {
  const summaries: ChapterSummary[] = [];
  let learning: ResumeTask | undefined;
  let quiz: ResumeTask | undefined;
  for (const chapter of chapters) {
    const summary: ChapterSummary = {
      chapter, page: 1, visited: 0, hasReading: false, attempts: 0, average: 0,
    };
    summaries.push(summary);
    if (!store) continue;
    const session = loadSession(store, chapter.id, chapter.slideCount);
    const progress = loadProgress(store, chapter.id);
    const validVisited = progress.visited.filter(page => page <= chapter.slideCount);
    const history = quizSummary(loadQuizStore(store, chapter.id));
    summary.page = session.slide;
    summary.visited = validVisited.length;
    summary.hasReading = validVisited.length > 0 || session.slide > 1 || session.messages.length > 0;
    summary.attempts = history.attempts;
    summary.average = history.averagePercent;
    const readingTime = timestamp(progress.updatedAt);
    if (summary.hasReading && readingTime
      && readingTime > timestamp(learning?.updatedAt ?? '')) {
      learning = {
        kind: 'learning', label: '继续学习', title: chapter.title,
        detail: `上次读到第 ${session.slide} 页 · 已浏览 ${summary.visited}/${chapter.slideCount} 页`,
        href: chapterLink(chapter.id), updatedAt: progress.updatedAt,
      };
    }
    const workspace = loadQuizWorkspace(store, chapter.id, chapter.slideCount);
    const draft = workspace.draft;
    if (!draft) continue;
    const quizTime = timestamp(workspace.updatedAt) || timestamp(draft.createdAt);
    if (!quizTime || quizTime <= timestamp(quiz?.updatedAt ?? '')) continue;
    quiz = {
      kind: 'quiz', label: '继续练习', title: chapter.title,
      detail: `题目来源：第 ${draft.sourceSlide} 页 · 已作答 ${answeredCount(draft)} / ${draft.questions.length}`,
      href: `${chapterLink(chapter.id)}?view=quiz`,
      updatedAt: timestamp(workspace.updatedAt) ? workspace.updatedAt : draft.createdAt,
    };
  }
  let design: ResumeTask | undefined;
  if (store) {
    const project = loadDesignProject(store);
    const hasContent = project.title.trim() || project.scenario.trim() || project.requirements.trim()
      || project.qualityAttributes.length || project.scenarios.length || project.tactics.length || project.review;
    if (hasContent) {
      const step = initialDesignStep(project);
      const labels = { scenario: '场景输入', attributes: '场景分析', tactics: '战术选择', review: '形成性评审' };
      const states = [analysisStatus(project), tacticsStatus(project), reviewStatus(project)];
      const note = states.includes('stale') ? ' · 有结果待更新'
        : states.includes('unrecorded') ? ' · 历史结果版本未记录' : '';
      design = {
        kind: 'design', label: '继续实践', title: project.title.trim() || '未命名实践草稿',
        detail: `${labels[step]}${note}`, href: '#/studio',
        updatedAt: timestamp(project.updatedAt) ? project.updatedAt : '',
      };
    }
  }
  const tasks = [learning, quiz, design].filter((item): item is ResumeTask => !!item);
  return { summaries, tasks };
}

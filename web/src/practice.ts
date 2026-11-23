import type { DesignCitation, RetrievalStrategy } from './types';

export interface PracticeCase {
  id: string; title: string; level: string; background: string;
  requirements: string[]; constraints: string[];
}
export interface KnowledgeReceipt {
  strategy: RetrievalStrategy; queries: string[]; citations: DesignCitation[];
}
export interface PracticeQuestion {
  id: string; question: string; citations: DesignCitation[];
}
export interface PracticeTurn { question: string; answer: string }
export interface PracticeAssessment {
  action: 'followup' | 'complete'; feedback: string;
  followup: string | null; citations: DesignCitation[];
}
export interface PracticeDecision {
  decision: PracticeQuestion; turns: PracticeTurn[];
  assessment?: PracticeAssessment; pendingFollowup?: string;
  knowledge?: KnowledgeReceipt;
}
export interface PracticeFinal {
  summary: string; strengths: string[]; improvements: string[];
  referenceApproach: string; citations: DesignCitation[];
  knowledge: KnowledgeReceipt;
}
export interface PracticeSession {
  caseId: string; retrievalStrategy: RetrievalStrategy; analysis: string;
  decisions: PracticeDecision[]; final?: PracticeFinal;
}
const KEY = 'chapter-tutor:practice:v2:current';

export function loadPractice(): PracticeSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null') as PracticeSession | null;
    if (!value || typeof value.caseId !== 'string' || typeof value.analysis !== 'string'
      || !['baseline', 'llm_assisted', 'hybrid'].includes(value.retrievalStrategy)
      || !Array.isArray(value.decisions) || value.decisions.length !== 3
      || value.decisions.some(d => !d || typeof d.decision?.id !== 'string'
        || typeof d.decision?.question !== 'string' || !Array.isArray(d.turns)
        || d.turns.length > 3 || d.turns.some(t => typeof t.question !== 'string'
          || typeof t.answer !== 'string'))) return null;
    return value;
  } catch { return null; }
}
export function savePractice(value: PracticeSession | null) {
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
    return true;
  } catch { return false; }
}
export function practiceMarkdown(value: PracticeSession, caseTitle: string): string {
  const lines = ['# '+caseTitle, '', '## 需求理解', value.analysis, '',
    '## 课程来源检索策略', value.retrievalStrategy, ''];
  value.decisions.forEach((record, index) => {
    lines.push('## 决策点 '+(index+1), '', record.decision.question, '');
    record.turns.forEach((turn, i) => {
      lines.push('### '+(i === 0 ? '首次独立作答' : '追问回答 '+i),
        turn.question, '', turn.answer, '');
    });
    if (record.assessment) {
      lines.push('### 形成性反馈', record.assessment.feedback, '');
    }
  });
  if (value.final) {
    lines.push('## 最终评价', value.final.summary, '', '### 优点',
      ...value.final.strengths.map(x => '- '+x), '', '### 改进',
      ...value.final.improvements.map(x => '- '+x), '', '### 参考设计思路',
      value.final.referenceApproach, '');
  }
  return lines.join('\n');
}

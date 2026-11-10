export type Mode = 'unconfigured' | 'ai';
export interface Health { status: 'ok'; mode: Mode; missing: string[] }
export interface Outline {
  chapterId: string;
  title: string;
  nodes: { id: string; title: string; summary: string; slides: number[] }[];
  edges: { source: string; target: string }[];
}
export interface Chapter {
  id: string;
  title: string;
  filename: string;
  slideCount: number;
}
export interface Slide {
  number: number;
  title: string;
  text: string;
  notes: string;
  imageUrl?: string;
  ocrText?: string;
}
export interface ChapterDetail extends Chapter { slides: Slide[] }
export interface Diagram {
  title: string;
  nodes: { id: string; label: string }[];
  edges: { source: string; target: string; label?: string }[];
}
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: { slide: number; title: string }[];
  diagram?: Diagram;
  mode?: 'ai';
}
export interface ChatResponse {
  content: string;
  slide: number;
  citations: { slide: number; title: string }[];
  diagram?: Diagram;
  mode: 'ai';
}
export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  citations: { slide: number; title: string }[];
}
export interface QuizResponse {
  questions: QuizQuestion[];
  mode: 'ai';
}
export interface QuizRecord {
  id: string;
  slide: number;
  createdAt: string;
  questions: QuizQuestion[];
  answers: number[];
}
export interface QuizStore {
  records: QuizRecord[];
}
export interface SearchResult {
  chapterId: string;
  chapterTitle: string;
  slide: number;
  slideTitle: string;
  snippet: string;
  score: number;
}
export interface SearchResponse {
  query: string;
  results: SearchResult[];
}
export interface DesignCitation {
  chapterId: string;
  slide: number;
  title: string;
}
export interface DesignQualityAttribute {
  name: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}
export interface DesignScenario {
  stimulus: string;
  source: string;
  artifact: string;
  environment: string;
  response: string;
  measure: string;
  citations: DesignCitation[];
}
export interface DesignTactic {
  name: string;
  rationale: string;
  tradeoffs: string;
  citations: DesignCitation[];
}
export interface DesignFinding {
  area: string;
  finding: string;
  severity: 'high' | 'medium' | 'low';
  suggestion: string;
  citations: DesignCitation[];
}
export interface DesignReview {
  summary: string;
  findings: DesignFinding[];
  questions: string[];
}

/** Signatures of the inputs each stage was generated from. Absent on legacy drafts. */
export interface DesignVersions {
  analysis?: string;
  tactics?: string;
  review?: string;
}
export interface DesignScenarioResponse {
  qualityAttributes: DesignQualityAttribute[];
  scenarios: DesignScenario[];
  mode: 'ai';
}
export interface DesignTacticResponse {
  tactics: DesignTactic[];
  mode: 'ai';
}
export interface DesignReviewResponse extends DesignReview {
  mode: 'ai';
}
export interface DesignProject {
  title: string;
  scenario: string;
  requirements: string;
  qualityAttributes: DesignQualityAttribute[];
  scenarios: DesignScenario[];
  tactics: DesignTactic[];
  selectedTactics: string[];
  review?: DesignReview;
  versions?: DesignVersions;
  updatedAt: string;
}

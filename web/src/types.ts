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

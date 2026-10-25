export type Mode = 'offline' | 'ai';
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
  mode?: Mode;
}
export interface ChatResponse {
  content: string;
  slide: number;
  citations: { slide: number; title: string }[];
  diagram?: Diagram;
  mode: Mode;
}

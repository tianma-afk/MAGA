import type { Message } from './types';

export interface Session {
  slide: number;
  messages: Message[];
  pending: string | null;
  error: string | null;
}
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
type Action =
  | { type: 'start'; requestId: string }
  | { type: 'complete'; requestId: string; user?: Message; message: Message; slide: number }
  | { type: 'fail'; requestId: string; error: string }
  | { type: 'page'; slide: number }
  | { type: 'restore'; session: Session }
  | { type: 'cancel' | 'reset' };

export const emptySession = (): Session => ({
  slide: 1, messages: [], pending: null, error: null,
});
const key = (id: string) => `chapter-tutor:v2:${id}`;
export function boundedHistory(messages: Message[]): Pick<Message, 'role' | 'content'>[] {
  const result: Pick<Message, 'role' | 'content'>[] = [];
  let remaining = 32000;
  for (const message of messages.slice(-30).reverse()) {
    if (remaining <= 0) break;
    const content = message.content.slice(0, Math.min(8000, remaining));
    result.push({ role: message.role, content });
    remaining -= content.length;
  }
  return result.reverse();
}
export function clampPage(page: number, count: number) {
  return Number.isFinite(page) ? Math.max(1, Math.min(Math.trunc(page), Math.max(1, count))) : 1;
}
function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object') return false;
  const m = value as Message;
  return typeof m.id === 'string' && typeof m.content === 'string'
    && (m.role === 'user' || (m.role === 'assistant' && m.mode === 'ai'));
}
export function loadSession(store: StoragePort, id: string, count: number): Session {
  try {
    const saved = store.getItem(key(id));
    const value = JSON.parse(saved ?? store.getItem(`chapter-tutor:v1:${id}`) ?? 'null');
    if (!value || typeof value !== 'object') return emptySession();
    return {
      ...emptySession(), slide: clampPage(value.slide, count),
      messages: saved && Array.isArray(value.messages) ? value.messages.filter(isMessage).map((m: Message) => ({
        ...m,
        citations: Array.isArray(m.citations)
          ? m.citations.filter(c => Number.isInteger(c?.slide) && typeof c?.title === 'string') : undefined,
        diagram: validDiagram(m.diagram) ? m.diagram : undefined,
      })) : [],
    };
  } catch { return emptySession(); }
}
export function validDiagram(value: unknown): value is NonNullable<Message['diagram']> {
  if (!value || typeof value !== 'object') return false;
  const d = value as NonNullable<Message['diagram']>;
  return typeof d.title === 'string' && Array.isArray(d.nodes) && Array.isArray(d.edges)
    && d.nodes.every(n => typeof n?.id === 'string' && typeof n?.label === 'string')
    && d.edges.every(e => typeof e?.source === 'string' && typeof e?.target === 'string'
      && (e.label === undefined || typeof e.label === 'string'));
}
export function saveSession(store: StoragePort, id: string, session: Session) {
  try {
    store.setItem(key(id), JSON.stringify({ slide: session.slide, messages: session.messages }));
    return true;
  } catch { return false; }
}
export function sessionReducer(state: Session, action: Action): Session {
  switch (action.type) {
    case 'restore': return action.session;
    case 'reset': return emptySession();
    case 'page': return { ...state, slide: action.slide };
    case 'cancel': return { ...state, pending: null, error: null };
    case 'start': return { ...state, pending: action.requestId, error: null };
    case 'fail': return state.pending === action.requestId
      ? { ...state, pending: null, error: action.error } : state;
    case 'complete': return state.pending === action.requestId
      ? { ...state, pending: null, error: null, slide: action.slide,
        messages: [...state.messages, ...(action.user ? [action.user] : []), action.message] } : state;
  }
}

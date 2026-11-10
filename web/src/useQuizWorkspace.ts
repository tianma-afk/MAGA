import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ConfigurationError, api, errorText } from './api';
import {
  deleteQuizRecord, emptyQuizStore, loadQuizStore, saveQuizRecord, wrongAnswers,
} from './quiz';
import {
  QuizDraft, QuizWorkspace, answeredCount, commitDraft, emptyQuizWorkspace,
  isDraftComplete, loadQuizWorkspace, newQuizDraft, retryDraft, saveQuizWorkspace, workspaceKey,
} from './quizWorkspace';
import type { Mode, QuizStore } from './types';

interface Options {
  chapterId: string;
  slideCount: number;
  page: number;
  mode?: Mode;
  onMode: (mode: Mode) => void;
  onQuizChange?: () => void;
}

export type QuizCommand = 'ok' | 'blocked' | 'none';

function safeStore(chapterId: string): QuizStore {
  try { return loadQuizStore(localStorage, chapterId); }
  catch { return emptyQuizStore(); }
}

function safeWorkspace(chapterId: string, slideCount: number): QuizWorkspace {
  try { return loadQuizWorkspace(localStorage, chapterId, slideCount); }
  catch { return emptyQuizWorkspace(); }
}

function now(): string {
  return new Date().toISOString();
}

/** Owns the practice task: the draft outlives the pane, the browsing page does
 *  not move its source, and only an explicit submit ends it. */
export function useQuizWorkspace({
  chapterId, slideCount, page, mode, onMode, onQuizChange,
}: Options) {
  const [initial] = useState(() => ({
    store: safeStore(chapterId),
    workspace: safeWorkspace(chapterId, slideCount),
  }));
  const [store, setStore] = useState(initial.store);
  const [workspace, setWorkspace] = useState(initial.workspace);
  const [showDraft, setShowDraft] = useState(!!initial.workspace.draft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  const workspaceRef = useRef(workspace);
  const paneRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<number | undefined>(undefined);
  const pendingScroll = useRef<number | undefined>(undefined);

  const unavailable = mode !== 'ai';
  const draft = workspace.draft;
  const currentRecord = store.records.find(record => record.slide === page);
  // An explicit selection wins; otherwise the newest record for the browsed
  // page is the one previously shown before workspaces were persisted.
  const active = workspace.activeRecordId
    ? store.records.find(record => record.id === workspace.activeRecordId)
    : currentRecord;
  const complete = isDraftComplete(draft);

  function cancelScrollTimer() {
    if (scrollTimer.current !== undefined) window.clearTimeout(scrollTimer.current);
    scrollTimer.current = undefined;
  }

  function flushScroll(): boolean {
    cancelScrollTimer();
    const top = pendingScroll.current;
    pendingScroll.current = undefined;
    if (top === undefined) return true;
    try {
      // A reset (or another tab clearing/replacing the task) wins over cleanup.
      const raw = localStorage.getItem(workspaceKey(chapterId));
      if (!raw) return true;
      const persisted = JSON.parse(raw) as QuizWorkspace;
      const current = workspaceRef.current;
      if (persisted.version !== 1 || persisted.updatedAt !== current.updatedAt
        || persisted.draft?.id !== current.draft?.id
        || persisted.activeRecordId !== current.activeRecordId) return true;
      const next = { ...current, scrollTop: top };
      const saved = saveQuizWorkspace(localStorage, chapterId, next);
      if (saved) workspaceRef.current = next;
      else pendingScroll.current = top;
      return saved;
    } catch {
      pendingScroll.current = top;
      return false;
    }
  }

  useEffect(() => {
    const leaving = () => { flushScroll(); };
    window.addEventListener('pagehide', leaving);
    return () => {
      window.removeEventListener('pagehide', leaving);
      request.current?.abort();
      request.current = null;
      flushScroll();
    };
  }, [chapterId]);

  const viewId = showDraft && draft ? `draft:${draft.id}` : `record:${active?.id ?? ''}`;
  useLayoutEffect(() => {
    if (paneRef.current) paneRef.current.scrollTop = workspaceRef.current.scrollTop;
  }, [viewId]);

  function applyWorkspace(next: QuizWorkspace): boolean {
    const scroll = pendingScroll.current;
    cancelScrollTimer();
    pendingScroll.current = undefined;
    // Carry the latest scroll through an answer change, not into a new task.
    if (scroll !== undefined && next.draft?.id === workspaceRef.current.draft?.id
      && next.activeRecordId === workspaceRef.current.activeRecordId) {
      next = { ...next, scrollTop: scroll };
    }
    const saved = saveQuizWorkspace(localStorage, chapterId, next);
    workspaceRef.current = next;
    setWorkspace(next);
    setStorageFailed(!saved);
    return saved;
  }

  function applyStore(next: QuizStore) {
    setStore(next);
  }

  function updateDraft(next: QuizDraft) {
    applyWorkspace({ ...workspaceRef.current, draft: next, updatedAt: now() });
  }

  function setAnswer(index: number, value: number) {
    const current = workspaceRef.current.draft;
    if (!current || index < 0 || index >= current.questions.length) return;
    if (value < -1 || value >= current.questions[index].options.length) return;
    updateDraft({
      ...current,
      answers: current.answers.map((answer, i) => (i === index ? value : answer)),
    });
  }

  async function generate(replace = false): Promise<QuizCommand> {
    if (unavailable || loading) return 'none';
    if (workspaceRef.current.draft && !replace) return 'blocked';
    const sourceSlide = page;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const result = await api.quiz(chapterId, sourceSlide, controller.signal);
      if (controller.signal.aborted || request.current !== controller) return 'none';
      // The generated questions belong to the page the request was made for,
      // even if the learner has already browsed elsewhere.
      const next = newQuizDraft(sourceSlide, result.questions);
      applyWorkspace({
        ...workspaceRef.current, draft: next, activeRecordId: undefined, scrollTop: 0,
        updatedAt: now(),
      });
      setShowDraft(true);
      onMode('ai');
      return 'ok';
    } catch (caught) {
      if (!controller.signal.aborted && request.current === controller) {
        if (caught instanceof ConfigurationError) onMode('unconfigured');
        setError(errorText(caught));
      }
      return 'none';
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }

  function stop() {
    request.current?.abort();
    request.current = null;
    setLoading(false);
  }

  function submit(): boolean {
    const current = workspaceRef.current.draft;
    const record = current ? commitDraft(current) : undefined;
    if (!current || !record) return false;
    const saved = saveQuizRecord(localStorage, chapterId, record);
    if (!saved) {
      // Keep the draft so the answer can be retried once storage works again.
      setStorageFailed(true);
      return false;
    }
    applyStore(safeStore(chapterId));
    const workspaceSaved = applyWorkspace({
      ...workspaceRef.current, draft: undefined, activeRecordId: record.id, updatedAt: now(),
    });
    setStorageFailed(!workspaceSaved);
    setShowDraft(false);
    onQuizChange?.();
    return true;
  }

  function removeRecord(id: string) {
    if (!deleteQuizRecord(localStorage, chapterId, id)) {
      setStorageFailed(true);
      return;
    }
    applyStore(safeStore(chapterId));
    const current = workspaceRef.current;
    applyWorkspace({
      ...current,
      activeRecordId: current.activeRecordId === id ? undefined : current.activeRecordId,
      updatedAt: now(),
    });
    onQuizChange?.();
  }

  function selectRecord(id: string) {
    applyWorkspace({ ...workspaceRef.current, activeRecordId: id, updatedAt: now() });
    setShowDraft(false);
  }

  function retryWrong(replace = false): QuizCommand {
    if (!active) return 'none';
    if (workspaceRef.current.draft && !replace) return 'blocked';
    const next = retryDraft(active);
    if (!next) return 'none';
    applyWorkspace({
      ...workspaceRef.current, draft: next, activeRecordId: undefined, scrollTop: 0,
      updatedAt: now(),
    });
    setShowDraft(true);
    return 'ok';
  }

  function discardDraft() {
    applyWorkspace({ ...workspaceRef.current, draft: undefined, updatedAt: now() });
    setShowDraft(false);
  }

  function resumeDraft() {
    if (workspaceRef.current.draft) setShowDraft(true);
  }

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const value = event.currentTarget.scrollTop;
    cancelScrollTimer();
    if (value === workspaceRef.current.scrollTop) {
      pendingScroll.current = undefined;
      return;
    }
    pendingScroll.current = value;
    scrollTimer.current = window.setTimeout(() => {
      setStorageFailed(!flushScroll());
    }, 200);
  }

  return {
    store, draft, active, currentRecord, loading, error, storageFailed,
    unavailable, complete, showDraft,
    answered: answeredCount(draft),
    wrongCount: active ? wrongAnswers(active).length : 0,
    paneRef, handleScroll,
    generate, stop, submit, removeRecord, selectRecord, retryWrong,
    discardDraft, resumeDraft, setAnswer,
  };
}

export interface ChapterProgress {
  visited: number[];
  updatedAt: string;
}

type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (chapterId: string) => `chapter-tutor:progress:v1:${chapterId}`;

export function emptyProgress(): ChapterProgress {
  return { visited: [], updatedAt: '' };
}

function isValid(value: unknown): value is ChapterProgress {
  if (!value || typeof value !== 'object') return false;
  const progress = value as Partial<ChapterProgress>;
  if (typeof progress.updatedAt !== 'string') return false;
  if (!Array.isArray(progress.visited) || progress.visited.length > 10000) return false;
  if (!progress.visited.every(page => typeof page === 'number'
    && Number.isInteger(page) && page >= 1)) return false;
  return new Set(progress.visited).size === progress.visited.length;
}

export function loadProgress(store: StoragePort, chapterId: string): ChapterProgress {
  try {
    const raw = store.getItem(key(chapterId));
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as unknown;
    if (!isValid(parsed)) return emptyProgress();
    return {
      visited: [...parsed.visited].sort((a, b) => a - b),
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return emptyProgress();
  }
}

export function markVisited(
  store: StoragePort, chapterId: string, page: number, slideCount: number,
): ChapterProgress {
  const current = loadProgress(store, chapterId);
  if (!Number.isInteger(page) || page < 1 || page > slideCount) return current;
  const visited = Array.from(new Set([...current.visited, page])).sort((a, b) => a - b);
  const next = { visited, updatedAt: new Date().toISOString() };
  try {
    store.setItem(key(chapterId), JSON.stringify(next));
  } catch { /* Progress is optional. */ }
  return next;
}

export function clearProgress(store: StoragePort, chapterId: string): boolean {
  try {
    store.removeItem(key(chapterId));
    return true;
  } catch {
    return false;
  }
}

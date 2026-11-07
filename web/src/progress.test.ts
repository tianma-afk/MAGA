import { describe, expect, it } from 'vitest';
import { clearProgress, emptyProgress, loadProgress, markVisited } from './progress';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe('chapter progress', () => {
  it('marks unique visited pages in order', () => {
    const store = storage();
    markVisited(store, 'a', 3, 5);
    markVisited(store, 'a', 1, 5);
    markVisited(store, 'a', 3, 5);
    const progress = markVisited(store, 'a', 2, 5);
    expect(progress.visited).toEqual([1, 2, 3]);
    expect(progress.updatedAt).toBeTruthy();
    expect(loadProgress(store, 'a').visited).toEqual([1, 2, 3]);
    expect(loadProgress(store, 'b')).toEqual(emptyProgress());
  });

  it('ignores out-of-range pages and follows the chapter count', () => {
    const store = storage();
    markVisited(store, 'a', 4, 3);
    markVisited(store, 'a', 0, 3);
    expect(loadProgress(store, 'a')).toEqual(emptyProgress());
    expect(markVisited(store, 'a', 3, 3).visited).toEqual([3]);
  });

  it('recovers from corrupt or unavailable storage', () => {
    const store = storage();
    store.setItem('chapter-tutor:progress:v1:a', '{bad');
    expect(loadProgress(store, 'a')).toEqual(emptyProgress());
    store.setItem('chapter-tutor:progress:v1:a', JSON.stringify({
      visited: [2, 2], updatedAt: 'x',
    }));
    expect(loadProgress(store, 'a')).toEqual(emptyProgress());
    const unavailable = {
      getItem() { throw Error(); },
      setItem() { throw Error(); },
      removeItem() { throw Error(); },
    };
    expect(loadProgress(unavailable, 'a')).toEqual(emptyProgress());
    expect(markVisited(unavailable, 'a', 1, 3).visited).toEqual([1]);
    expect(clearProgress(unavailable, 'a')).toBe(false);
  });

  it('clears chapter progress', () => {
    const store = storage();
    markVisited(store, 'a', 1, 3);
    expect(clearProgress(store, 'a')).toBe(true);
    expect(loadProgress(store, 'a')).toEqual(emptyProgress());
  });
});

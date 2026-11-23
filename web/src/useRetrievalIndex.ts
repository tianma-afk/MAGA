import { useEffect, useRef, useState } from 'react';
import { api, errorText } from './api';
import type { RetrievalStrategy } from './types';

export type IndexStatus = 'idle' | 'building' | 'ready' | 'error';

export function useRetrievalIndex() {
  const [strategy, setStrategy] = useState<RetrievalStrategy>('baseline');
  const [status, setStatus] = useState<IndexStatus>('idle');
  const [error, setError] = useState('');
  const [count, setCount] = useState(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);

  async function prepare() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setStatus('building');
    setError('');
    setCount(0);
    try {
      const result = await api.ensureRetrievalIndex(controller.signal);
      if (pending.current !== controller || controller.signal.aborted) return;
      setCount(result.total);
      setStatus('ready');
    } catch (caught) {
      if (pending.current !== controller || controller.signal.aborted) return;
      setError(errorText(caught));
      setStatus('error');
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }

  function select(value: RetrievalStrategy) {
    pending.current?.abort();
    pending.current = null;
    setStrategy(value);
    setStatus('idle');
    setError('');
    setCount(0);
    if (value === 'hybrid') void prepare();
  }

  return {
    strategy, status, error, count, select, retry: prepare,
    blocked: strategy === 'hybrid' && status !== 'ready',
  };
}

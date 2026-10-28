import { useEffect, useState } from 'react';
import { api, errorText } from './api';
import type { Outline } from './types';

export default function useOutline(chapterId: string) {
  const [outline, setOutline] = useState<Outline>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setOutline(undefined);
    setError('');
    api.outline(chapterId, controller.signal).then(value => {
      if (!controller.signal.aborted) setOutline(value);
    }).catch(error => {
      if (!controller.signal.aborted) setError(errorText(error));
    });
    return () => controller.abort();
  }, [chapterId, retry]);
  return { outline, error, onRetry: () => setRetry(value => value + 1) };
}

import { RefreshCw } from 'lucide-react';
import type { Health } from './types';

interface Props { health?: Health; error: string; checking: boolean; onRecheck: () => void }
export default function ConnectionBanner({ health, error, checking, onRecheck }: Props) {
  if (health?.mode === 'ai' && !error) return null;
  return <section className="connection-banner" aria-label="AI 连接状态">
    <div>
      <strong>{error ? '无法确认 AI 连接' : health?.mode === 'unconfigured' ? 'AI 尚未配置' : '正在检查 AI 连接'}</strong>
      {error && <p role="alert">{error}</p>}
      {health?.mode === 'unconfigured' && <>
        <p>在项目根目录执行 <code>Copy-Item .env.example .env</code>，在后端 <code>.env</code> 中填写
          <code> LLM_API_KEY</code> 和 <code>LLM_MODEL</code>；按服务商设置 <code>LLM_BASE_URL</code>，然后重启后端。</p>
        {!!health.missing.length && <p>缺少：{health.missing.join('、')}</p>}
        <p>课件和学习大纲仍可阅读。</p>
      </>}
    </div>
    <button className="text-button" disabled={checking} onClick={onRecheck}>
      <RefreshCw size={15} className={checking ? 'spin' : ''} />重新检查连接
    </button>
  </section>;
}

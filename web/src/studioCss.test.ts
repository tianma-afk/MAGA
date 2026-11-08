import { expect, it } from 'vitest';
// @ts-expect-error the web tsconfig has no Node types; vitest still runs in Node
import { readFileSync } from 'node:fs';

it('styles the citations that DesignCitations renders', () => {
  // The component renders className="design-citations"; the stylesheet must
  // define that class, not a name nothing matches (the old .studio-citations
  // selectors were dead style and left the citation chips unstyled).
  const css = readFileSync(new URL('./studio.css', import.meta.url), 'utf8');
  expect(css).toMatch(/\.design-citations\s*\{/);
  expect(css).toMatch(/\.design-citations button\s*\{/);
  expect(css).not.toMatch(/\.studio-citations/);
});

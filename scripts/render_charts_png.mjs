// Render evaluation SVGs to high-resolution PNGs for the Word report.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '../web/node_modules/playwright/index.mjs';

const charts = ['l1-ndcg', 'l2-ndcg', 'l2-recall5', 'l2-delta', 'l2-hybrid-delta', 'l2-latency', 'l2-ablation'];
const out = resolve('docs/evaluation/charts/png');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  viewport: { width: 820, height: 410 }, deviceScaleFactor: 2,
});
const page = await context.newPage();
for (const name of charts) {
  const source = resolve(`docs/evaluation/charts/${name}.svg`);
  await page.goto(`file:///${source.replace(/\\/g, '/')}`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${name}.png`, clip: { x: 0, y: 0, width: 800, height: 400 } });
  console.log('rendered', name);
}
await browser.close();

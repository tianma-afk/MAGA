// Isolated real frontend with explicit proxy; no production config edits.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');
const [port = '5186', backend = '8016'] = process.argv.slice(2);
const server = await createServer({
  root, configFile: path.join(root, 'vite.config.ts'),
  server: { host: '127.0.0.1', port: Number(port), strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${backend}` } },
});
await server.listen();
console.log(`Acceptance frontend ${port} -> backend ${backend}`);

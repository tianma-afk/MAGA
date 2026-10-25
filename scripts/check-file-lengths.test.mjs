import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkFileLengths, countLines } from './check-file-lengths.mjs';

test('physical line counting handles empty files, final newline, CRLF and CR', () => {
  for (const [text, expected] of [
    ['', 0], ['a', 1], ['a\n', 1], ['a\r\nb\r\n', 2],
    ['a\rb', 2], ['\n\n', 2], ['a\n\nb', 3],
  ]) assert.equal(countLines(text), expected);
});

test('recursive checker enforces 500, excludes generated folders, and sets CLI status', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'maga-lengths-'));
  try {
    await mkdir(path.join(root, 'src', 'nested'), { recursive: true });
    for (const ext of ['py', 'ts', 'tsx', 'js', 'mjs', 'css', 'ps1']) {
      await writeFile(path.join(root, 'src', `okay.${ext}`), 'x\n'.repeat(500));
    }
    await writeFile(path.join(root, 'src', 'nested', 'long.ts'), 'x\r\n'.repeat(501));
    await writeFile(path.join(root, 'ignored.md'), 'x\n'.repeat(600));
    for (const directory of ['node_modules', '.git', 'build', 'dist', 'data', 'deps', '.venv']) {
      await mkdir(path.join(root, directory));
      await writeFile(path.join(root, directory, 'ignored.js'), 'x\n'.repeat(600));
    }
    const result = await checkFileLengths(root);
    assert.equal(result.checked, 8);
    assert.deepEqual(result.violations, [{ file: path.join('src', 'nested', 'long.ts'), lines: 501 }]);
    const cli = fileURLToPath(new URL('./check-file-lengths.mjs', import.meta.url));
    assert.equal(spawnSync(process.execPath, [cli, root]).status, 1);
    await writeFile(path.join(root, 'src', 'nested', 'long.ts'), 'x\n'.repeat(500));
    assert.equal(spawnSync(process.execPath, [cli, root]).status, 0);
    assert.equal(spawnSync(process.execPath, [cli, path.join(root, 'missing')]).status, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

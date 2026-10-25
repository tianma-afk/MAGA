#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensions = new Set(['.py', '.ts', '.tsx', '.js', '.mjs', '.css', '.ps1']);
const excluded = new Set([
  '.git', 'node_modules', 'bower_components', 'vendor', 'deps',
  'build', 'dist', 'out', 'coverage', '.next', '.nuxt', '.output',
  '.venv', 'venv', '__pycache__', 'data',
]);

export function countLines(text) {
  if (!text.length) return 0;
  return text.split(/\r\n|\n|\r/).length - (/(?:\r\n|\n|\r)$/.test(text) ? 1 : 0);
}

export async function checkFileLengths(root, limit = 500) {
  const violations = [];
  let checked = 0;
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      // Never follow symlinks into dependencies or outside the requested root.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!excluded.has(entry.name.toLowerCase())) await visit(fullPath);
      } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
        const lines = countLines(await readFile(fullPath, 'utf8'));
        checked++;
        if (lines > limit) violations.push({ file: path.relative(root, fullPath), lines });
      }
    }
  }
  await visit(path.resolve(root));
  return { checked, violations };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? fileURLToPath(new URL('../', import.meta.url)));
  try {
    const { checked, violations } = await checkFileLengths(root);
    for (const { file, lines } of violations) console.error(`${file}: ${lines} lines (maximum 500)`);
    console.log(`Checked ${checked} authored source files; ${violations.length} over limit.`);
    process.exitCode = violations.length ? 1 : 0;
  } catch (error) {
    console.error(`File length check failed: ${error.message}`);
    process.exitCode = 2;
  }
}

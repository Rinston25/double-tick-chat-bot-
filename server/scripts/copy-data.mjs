// Plain JS (not compiled): copies the static JSON data files next to the
// compiled output so `src/data/repository.ts`'s __dirname-relative reads
// work identically in dev (tsx, running src/) and prod (node, running
// dist/src/, which mirrors src/'s layout 1:1).
import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const from = path.resolve(__dirname, '../src/data');
const to = path.resolve(__dirname, '../dist/src/data');

mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log(`[copy-data] ${from} -> ${to}`);

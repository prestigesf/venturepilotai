#!/usr/bin/env node
/**
 * inject-example.mjs — inline the worked-example bundle into engine-hardening.html.
 *
 * The widget prefers the JSON files on disk, but a page opened straight from the
 * filesystem cannot fetch them. Inlining the example keeps the page honest and
 * useful offline: it always has the clearly-labelled example to fall back on, and
 * it never invents live data.
 *
 *   node engine-hardening/examples/build-example.mjs
 *   node engine-hardening/bin/inject-example.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGE = join(ROOT, 'engine-hardening.html');
const BUNDLE = join(ROOT, 'engine-hardening', 'examples', 'example-widget-data.json');
const OPEN = '<script id="example-bundle" type="application/json">';
const CLOSE = '</script>';

const bundle = JSON.parse(await readFile(BUNDLE, 'utf8'));
if (bundle.data_class !== 'ILLUSTRATIVE_EXAMPLE') {
  throw new Error('refusing to inline a bundle that is not labelled ILLUSTRATIVE_EXAMPLE');
}

// Trim the fields the widget never reads, so the inlined copy stays reviewable.
for (const c of bundle.score?.components || []) {
  delete c.points_exact; delete c.fraction; delete c.measured_terms; delete c.total_terms;
}
delete bundle.score?.raw_unused;

const json = JSON.stringify(bundle).replace(/<\//g, '<\\/');
const page = await readFile(PAGE, 'utf8');
const start = page.indexOf(OPEN);
if (start === -1) throw new Error('example-bundle script tag not found in engine-hardening.html');
const from = start + OPEN.length;
const end = page.indexOf(CLOSE, from);
if (end === -1) throw new Error('unterminated example-bundle script tag');

await writeFile(PAGE, page.slice(0, from) + json + page.slice(end), 'utf8');
process.stdout.write(`Inlined ${(json.length / 1024).toFixed(1)} KB example bundle into engine-hardening.html\n`);

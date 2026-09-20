// Regenerates agent/airports.generated.mjs from the product's airport tables.
//
// The product's own table is generated from OurAirports open data (public
// domain). Only that factual reference data and the curated metro groups are
// copied here. No product logic, credentials or customer material crosses the
// boundary. See SECURITY-BOUNDARY.md.
//
// Usage:
//   node tools/sync-airports.mjs <path-to-flyai-app>/packages/core/src
//
// The generated file is committed, so a clean checkout and CI never need the
// product repository.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const source = process.argv[2];
if (!source) {
  console.error('Usage: node tools/sync-airports.mjs <flyai-app>/packages/core/src');
  process.exit(1);
}

// Values containing an apostrophe are emitted with double quotes upstream
// (e.g. city: "St. John's"), so accept either delimiter. Missing one silently
// drops real airports, CDG among them.
const field = (block, name) => {
  const match = block.match(new RegExp(`${name}: (?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")`));
  const raw = match?.[1] ?? match?.[2];
  return raw === undefined ? null : raw.replace(/\\(['"])/g, '$1').replace(/\\\\/g, '\\');
};

function parseAirports(text) {
  const start = text.indexOf('GENERATED_AIRPORTS');
  const rows = [];
  for (const block of text.slice(start).split(/\}\s*,?\s*\{/)) {
    const code = field(block, 'code');
    const city = field(block, 'city');
    const name = field(block, 'name');
    const country = field(block, 'country');
    const countryCode = field(block, 'countryCode');
    const type = field(block, 'type');
    // OurAirports marks superseded records with a "[Duplicate]" name prefix.
    // They reach customer-facing copy verbatim, so drop them.
    if (name?.startsWith('[Duplicate]')) continue;
    if (code && city && country && type) rows.push([code, city, name ?? city, country, countryCode ?? '', type]);
  }
  return rows;
}

function parseMetroGroups(text) {
  const rows = [];
  for (const block of text.split(/\}\s*,?\s*\{/)) {
    const label = field(block, 'label');
    const code = field(block, 'code');
    const city = field(block, 'city');
    const country = field(block, 'country');
    if (label && code && city && country) rows.push([code, city, label, country]);
  }
  return rows;
}

const airports = parseAirports(readFileSync(join(source, 'airports.generated.ts'), 'utf8'));
const groups = parseMetroGroups(readFileSync(join(source, 'metroGroups.ts'), 'utf8'));
if (airports.length < 1000) throw new Error(`Only parsed ${airports.length} airports. Refusing to write a truncated table.`);
if (groups.length < 15) throw new Error(`Only parsed ${groups.length} metro groups. Refusing to write a truncated table.`);

const quote = value => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const row = values => `[${values.map(quote).join(',')}]`;

const out = `// GENERATED FILE. Do not edit by hand.
// Regenerate with: node tools/sync-airports.mjs <flyai-app>/packages/core/src
//
// Airport rows originate from OurAirports open data (public domain) by way of
// the product's generated table. Metro groups are the product's curated list.
// This file carries reference data only: no product logic crosses the boundary.
//
// Rows: [code, city, name, country, countryCode, type]
export const GENERATED_AIRPORT_ROWS = [
${airports.map(row).join(',\n')},
];

// Rows: [code, city, label, country]
export const GENERATED_METRO_ROWS = [
${groups.map(row).join(',\n')},
];
`;

writeFileSync(new URL('../airports.generated.mjs', import.meta.url), out);
console.log(`Wrote ${airports.length} airports and ${groups.length} metro groups.`);

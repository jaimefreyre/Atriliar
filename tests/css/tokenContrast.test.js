import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Resolves the :root custom properties of tokens.css (hex literals and
// var() references) and checks WCAG AA contrast for text/background pairs.
const source = readFileSync(new URL('../../public/css/tokens.css', import.meta.url), 'utf8');
const rootBlock = source.slice(source.indexOf(':root {'), source.indexOf('@media (forced-colors'));
const declarations = Object.fromEntries([...rootBlock.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));

function resolve(name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`referencia circular en ${name}`);
  seen.add(name);
  const value = declarations[name];
  if (!value) throw new Error(`token inexistente ${name}`);
  const reference = value.match(/^var\((--[\w-]+)\)$/);
  return reference ? resolve(reference[1], seen) : value;
}

function luminance(hex) {
  const [r, g, b] = hex.replace('#', '').match(/../g).map((part) => parseInt(part, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground, background) {
  const [light, dark] = [luminance(resolve(foreground)), luminance(resolve(background))].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const SURFACES = ['--color-page', '--color-stage', '--color-surface-1', '--color-surface-2', '--color-surface-3'];
const PAIRS = [
  ...['--color-text', '--color-text-secondary', '--color-text-muted', '--color-harmony', '--color-accent', '--color-now',
    '--color-estimated', '--color-confirmed', '--color-danger', '--color-loop']
    .flatMap((text) => SURFACES.map((surface) => [text, surface])),
  ['--color-on-accent', '--color-accent'],
  ['--color-harmony', '--color-harmony-bg'],
  ['--color-text', '--color-harmony-bg'],
  ['--color-estimated', '--color-estimated-bg'],
  ['--color-confirmed', '--color-confirmed-bg'],
  ['--color-danger', '--color-danger-bg'],
  ['--color-loop', '--color-loop-bg'],
  ['--color-text', '--color-loop-bg'],
  ['--color-text', '--color-danger-strong'],
];

test('todo par de texto y fondo del sistema de diseño cumple WCAG AA (4,5:1)', () => {
  const failing = PAIRS.map(([text, background]) => ({ text, background, ratio: contrast(text, background) }))
    .filter(({ ratio }) => ratio < 4.5)
    .map(({ text, background, ratio }) => `${text} sobre ${background}: ${ratio.toFixed(2)}`);
  assert.deepEqual(failing, []);
});

test('los bordes de controles se distinguen del fondo (≥ 1,5:1 como mínimo de separación visual)', () => {
  assert.ok(contrast('--color-border-strong', '--color-surface-1') >= 1.5);
});

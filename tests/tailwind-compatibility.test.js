import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '@tailwindcss/node';
import postcss from 'postcss';
import { MARKET_COLOR_MODES, marketHexColor, marketTextClass } from '../src/lib/marketColorMode.js';

const sourceDirectory = fileURLToPath(new URL('../src/', import.meta.url));
const entry = join(sourceDirectory, 'index.css');
const compatibility = readFileSync(join(sourceDirectory, 'styles/quote-utility-compat.css'), 'utf8');
const excludedCandidates = new Set();
postcss.parse(compatibility).walkAtRules('source', rule => {
  const match = rule.params.match(/^not inline\((["'])(.*?)\1\)$/);
  if (match) for (const candidate of match[2].split(/\s+/)) excludedCandidates.add(candidate);
});

const colorExpectations = new Map([
  ['text-[#ff4b1f]', '#ff4b1f'],
  ['text-[#34d399]', '#34d399'],
  ['text-emerald-400', '#34d399'],
  ['text-slate-500', '#64748b'],
  ['text-blue-400', '#60a5fa'],
]);
const spacingAmounts = new Map([['0.5', '0.125'], ['1', '0.25'], ['1.5', '0.375'], ['2', '0.5'], ['2.5', '0.625'], ['3', '0.75']]);
const dividerOpacities = ['0.045', '0.055', '0.06', '0.07'];
const gradientDirections = new Map([
  ['bg-gradient-to-r', 'to right in srgb'],
  ['bg-gradient-to-br', 'to bottom right in srgb'],
]);
const gradientEndpoints = new Map([
  ['from-blue-500', ['--tw-gradient-from', '#3b82f6']],
  ['to-cyan-400', ['--tw-gradient-to', '#22d3ee']],
  ['from-red-700', ['--tw-gradient-from', '#b91c1c']],
  ['to-black', ['--tw-gradient-to', 'var(--color-black)']],
  ['from-[#0b7dff]', ['--tw-gradient-from', '#0b7dff']],
  ['to-[#18d2d5]', ['--tw-gradient-to', '#18d2d5']],
]);
const transformExpectations = new Map([
  ['-translate-x-1', { '--tw-translate-x': '-0.25rem' }],
  ['-translate-x-1/2', { '--tw-translate-x': '-50%' }],
  ['-translate-x-full', { '--tw-translate-x': '-100%' }],
  ['-translate-y-1', { '--tw-translate-y': '-0.25rem' }],
  ['-translate-y-1/2', { '--tw-translate-y': '-50%' }],
  ['translate-x-0', { '--tw-translate-x': '0px' }],
  ['-rotate-90', { '--tw-rotate': '-90deg' }],
  ['rotate-180', { '--tw-rotate': '180deg' }],
  ['rotate-90', { '--tw-rotate': '90deg' }],
  ...[
    ['scale-110', 1.1], ['scale-[1.15]', 1.15],
    ['active:scale-90', 0.9], ['active:scale-95', 0.95],
    ['active:scale-[0.98]', 0.98], ['active:scale-[0.995]', 0.995],
    ['active:scale-[0.99]', 0.99], ['disabled:active:scale-100', 1],
  ].map(([candidate, amount]) => [candidate, { '--tw-scale-x': amount, '--tw-scale-y': amount }]),
]);
const compatibilityCandidates = [
  ...[...spacingAmounts.keys()].map(suffix => `space-y-${suffix}`),
  'divide-x', 'divide-y', ...dividerOpacities.map(opacity => `divide-white/[${opacity}]`),
  'outline-none', 'focus:outline-none', 'flex-shrink-0',
  ...transformExpectations.keys(), ...gradientDirections.keys(),
];
const compiler = await compile(readFileSync(entry, 'utf8'), {
  base: dirname(entry), from: entry, onDependency() {},
});
// Use the production entry and installed compiler, including real CSS imports
// and candidate exclusions. No generated declarations are mocked here.
const compiled = postcss.parse(compiler.build([
  ...colorExpectations.keys(), ...gradientEndpoints.keys(), ...compatibilityCandidates, ...excludedCandidates,
  'bg-emerald-400', 'border-blue-400', 'border', 'p-4',
]));

const classSelector = candidate => `.${candidate.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`)}`;
const siblingSelector = candidate => `${classSelector(candidate)} > :not([hidden]) ~ :not([hidden])`;

function ruleFor(selector) {
  const matches = [];
  compiled.walkRules(rule => { if (rule.selector === selector) matches.push(rule); });
  assert.equal(matches.length, 1, `Expected exactly one compiled rule for ${selector}`);
  return matches[0];
}

function declaration(selector, property) {
  const values = ruleFor(selector).nodes
    .filter(node => node.type === 'decl' && node.prop === property)
    .map(node => node.value);
  assert.equal(values.length, 1, `Expected exactly one ${property} in ${selector}`);
  return values[0];
}

test('compiled financial text and preserved theme colors retain the exact existing hex values', () => {
  for (const [candidate, hex] of colorExpectations) {
    assert.equal(declaration(classSelector(candidate), 'color'), hex, candidate);
  }
  for (const mode of Object.values(MARKET_COLOR_MODES)) {
    for (const value of [-1, 0, 1]) {
      assert.equal(declaration(classSelector(marketTextClass(value, mode)), 'color'), marketHexColor(value, mode));
    }
  }
  assert.equal(declaration('.bg-emerald-400', 'background-color'), '#34d399');
  assert.equal(declaration('.border-blue-400', 'border-color'), '#60a5fa');
});

test('compiled gradients retain sRGB interpolation and the existing login and risk color endpoints', () => {
  for (const [candidate, direction] of gradientDirections) {
    const selector = classSelector(candidate);
    assert.equal(declaration(selector, '--tw-gradient-position'), direction);
    assert.equal(declaration(selector, 'background-image'), 'linear-gradient(var(--tw-gradient-stops))');
  }
  for (const [candidate, [property, expected]] of gradientEndpoints) {
    const selector = classSelector(candidate);
    assert.equal(declaration(selector, property), expected);
    assert.match(declaration(selector, '--tw-gradient-stops'), /var\(--tw-gradient-position\)/,
      `${candidate} must consume the preserved sRGB direction rather than introduce another interpolation space`);
  }
  assert.equal(declaration(':root, :host', '--color-black'), '#000');
});

test('compiled reset retains existing border and placeholder defaults', () => {
  assert.equal(declaration('*, ::before, ::after', 'border-width'), '0');
  assert.equal(declaration('*, ::before, ::after', 'border-style'), 'solid');
  assert.equal(declaration('*, ::before, ::after', 'border-color'), '#e5e7eb');
  assert.equal(declaration('input::placeholder, textarea::placeholder', 'opacity'), '1');
  assert.equal(declaration('input::placeholder, textarea::placeholder', 'color'), '#9ca3af');
  assert.equal(declaration('.border', 'border-width'), '1px');
  assert.equal(ruleFor('.border').nodes.some(node => node.type === 'decl' && node.prop === 'border-color'), false,
    'an uncolored border must inherit the preserved reset, not override it with currentColor');
});

test('compiled spacing and divider rules retain the previous sibling behavior without duplicate v4 rules', () => {
  for (const [suffix, amount] of spacingAmounts) {
    const selector = siblingSelector(`space-y-${suffix}`);
    assert.equal(declaration(selector, '--tw-space-y-reverse'), '0');
    assert.equal(declaration(selector, 'margin-top'), `calc(${amount}rem * calc(1 - var(--tw-space-y-reverse)))`);
    assert.equal(declaration(selector, 'margin-bottom'), `calc(${amount}rem * var(--tw-space-y-reverse))`);
  }
  assert.equal(declaration(siblingSelector('divide-x'), 'border-left-width'), 'calc(1px * calc(1 - var(--tw-divide-x-reverse)))');
  assert.equal(declaration(siblingSelector('divide-x'), 'border-right-width'), 'calc(1px * var(--tw-divide-x-reverse))');
  assert.equal(declaration(siblingSelector('divide-y'), 'border-top-width'), 'calc(1px * calc(1 - var(--tw-divide-y-reverse)))');
  assert.equal(declaration(siblingSelector('divide-y'), 'border-bottom-width'), 'calc(1px * var(--tw-divide-y-reverse))');
  for (const opacity of dividerOpacities) {
    assert.equal(declaration(siblingSelector(`divide-white/[${opacity}]`), 'border-color'), `rgb(255 255 255 / ${opacity})`);
  }
  compiled.walkRules(rule => {
    assert.ok(!rule.selector.includes(':not(:last-child)'), `Unexpected second v4 child selector: ${rule.selector}`);
    if (/^\.(?:space-|divide-)/.test(rule.selector)) {
      assert.ok(rule.selector.endsWith(' > :not([hidden]) ~ :not([hidden])'), `Unexpected spacing/divider wrapper: ${rule.selector}`);
    }
  });
});

test('compiled focus and shrink compatibility preserve the existing controls', () => {
  for (const selector of ['.outline-none', '.focus\\:outline-none:focus']) {
    assert.equal(declaration(selector, 'outline'), '2px solid transparent');
    assert.equal(declaration(selector, 'outline-offset'), '2px');
    assert.equal(ruleFor(selector).nodes.some(node => node.type === 'decl' && node.prop === 'outline-style' && node.value === 'none'), false);
  }
  assert.equal(declaration('.flex-shrink-0', 'flex-shrink'), '0');
});

test('compiled translate, rotate and pressed scale preserve transform transitions without individual properties', () => {
  const legacyTransform = 'translate(var(--tw-translate-x, 0), var(--tw-translate-y, 0)) rotate(var(--tw-rotate, 0)) skewX(var(--tw-skew-x, 0)) skewY(var(--tw-skew-y, 0)) scaleX(var(--tw-scale-x, 1)) scaleY(var(--tw-scale-y, 1))';
  for (const [candidate, variables] of transformExpectations) {
    const variants = candidate.split(':').slice(0, -1).reverse();
    const selector = classSelector(candidate) + variants.map(variant => `:${variant}`).join('');
    assert.equal(declaration(selector, 'transform'), legacyTransform,
      `${candidate} must still animate through transform and have defaults for every unset component`);
    for (const [property, expected] of Object.entries(variables)) {
      const value = declaration(selector, property);
      assert.equal(typeof expected === 'number' ? Number(value) : value, expected, `${candidate} ${property}`);
    }
  }
  compiled.walkDecls(/^(?:translate|rotate|scale)$/, declaration => {
    assert.fail(`Individual ${declaration.prop} would change the preserved transform/transition behavior in ${declaration.parent.selector}`);
  });
});

test('compiled theme, reset and utilities keep the existing unlayered page cascade', () => {
  compiled.walkAtRules('layer', rule => {
    assert.equal(rule.params, 'properties', `Unexpected native cascade layer: ${rule.params}`);
  });
  for (const selector of [':root, :host', '*, ::before, ::after', '.p-4', '.border', classSelector('text-[#34d399]'), siblingSelector('space-y-2')]) {
    assert.equal(ruleFor(selector).parent.type, 'root', `${selector} must remain outside cascade layers`);
  }
});

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.[cm]?[jt]sx?$/.test(extname(path)) ? [path] : [];
  });
}

test('new spacing, divider, focus, transform and gradient variants require an explicit compatibility decision', () => {
  for (const candidate of compatibilityCandidates) {
    assert.ok(excludedCandidates.has(candidate), `${candidate} needs an explicit compiler exclusion as well as its legacy rule`);
  }
  for (const candidate of excludedCandidates) {
    const selector = classSelector(candidate);
    const matches = [];
    compiled.walkRules(rule => {
      if (rule.selector === selector || rule.selector.startsWith(`${selector}:`) || rule.selector.startsWith(`${selector} >`)) matches.push(rule);
    });
    assert.equal(matches.length, 1, `${candidate} must retain exactly one compiled rule after being excluded`);
  }
  const uncovered = [];
  for (const path of [...sourceFiles(sourceDirectory), fileURLToPath(new URL('../index.html', import.meta.url))]) {
    const text = readFileSync(path, 'utf8');
    // Preserve complete variant prefixes rather than silently accepting a known
    // base class inside a new md:/focus:/arbitrary variant.
    for (const match of text.matchAll(/[^\s"'`{}<>;=]+/g)) {
      const candidate = match[0];
      if (!/(?:^|:)!?-?(?:space-[xy]-|divide-|outline-none(?:!|$)|flex-shrink-|translate-|rotate-|scale-|bg-gradient-to-)/.test(candidate)) continue;
      if (excludedCandidates.has(candidate)) continue;
      const line = text.slice(0, match.index).split('\n').length;
      uncovered.push(`${relative(sourceDirectory, path)}:${line} ${candidate}`);
    }
  }
  assert.deepEqual(uncovered, [], 'Review new compatibility-sensitive classes: preserve spacing, transform transitions and gradient interpolation with an explicit @source not inline exclusion, matching legacy rule, and compiled regression case; use gap where appropriate.');
});

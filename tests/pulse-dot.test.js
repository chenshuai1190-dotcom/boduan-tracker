import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('SVG and DOM halos share the report rhythm, keep cores fixed, and become static under reduced motion', () => {
  const source = read('src/components/PulseDot.css');
  const css = postcss.parse(source);
  const declarations = node => Object.fromEntries(node.nodes.filter(item => item.type === 'decl').map(item => [item.prop, item.value]));
  const normal = selector => css.nodes.find(node => node.type === 'rule' && node.selectors.includes(selector));
  const svgMotion = normal('.quote-pulse-halo');
  const domMotion = normal('.quote-pulse-dot::before');
  assert.ok(svgMotion);
  assert.ok(domMotion);
  const rules = selector => css.nodes.filter(node => node.type === 'rule' && node.selectors.includes(selector));
  const styles = selector => Object.assign({}, ...rules(selector).map(declarations));
  for (const selector of ['.quote-pulse-halo', '.quote-pulse-dot::before']) {
    const style = styles(selector);
    assert.equal(style.animation, 'quote-dot-breathe 2.4s ease-in-out infinite');
    assert.equal(Number(style.opacity), .45);
    assert.equal(style['transform-origin'], 'center');
    assert.equal(style['transform-box'], 'fill-box');
  }
  const core = styles('.quote-pulse-dot');
  assert.equal(core.position, 'relative');
  assert.equal(core.animation, undefined, 'only the surrounding ring pulses, never the solid DOM core');
  assert.equal(core.transform, undefined, 'core position and size stay fixed');
  assert.equal(core['pointer-events'], 'none');
  const ring = styles('.quote-pulse-dot::before');
  assert.equal(ring.position, 'absolute');
  assert.equal(ring.border, '1.2px solid currentColor');
  assert.equal(ring['border-radius'], '50%');
  assert.equal(ring.background, undefined, 'the DOM halo stays hollow');
  assert.doesNotMatch(source, /box-shadow|filter:/, 'the thin ring must not regress to a glow');

  const keyframes = css.nodes.filter(node => node.type === 'atrule' && node.name === 'keyframes');
  assert.equal(keyframes.length, 1, 'both renderers must use one motion definition');
  assert.equal(keyframes[0].params, 'quote-dot-breathe');
  const rest = keyframes[0].nodes.find(node => node.selectors.includes('0%') && node.selectors.includes('100%'));
  const peak = keyframes[0].nodes.find(node => node.selectors.includes('50%'));
  assert.deepEqual(declarations(rest), { opacity: '.2', transform: 'scale(.75)' });
  assert.deepEqual(declarations(peak), { opacity: '.7', transform: 'scale(1.15)' });
  const reduced = css.nodes.find(node => node.type === 'atrule' && node.name === 'media' && /prefers-reduced-motion:\s*reduce/.test(node.params));
  assert.ok(reduced);
  for (const selector of ['.quote-pulse-halo', '.quote-pulse-dot::before']) {
    const style = Object.assign({}, ...reduced.nodes.filter(node => node.type === 'rule' && node.selectors.includes(selector)).map(declarations));
    assert.equal(style.animation, 'none');
    assert.equal(Number(style.opacity), .45, 'reduced motion retains a visible static ring');
  }

  const trades = read('src/tabs/TradesTab.jsx');
  const activeWave = trades.slice(trades.indexOf('{activeWave ? (() => {'));
  assert.match(activeWave, /className="quote-pulse-dot h-1\.5 w-1\.5 shrink-0 rounded-full bg-emerald-300 text-emerald-300"/,
    'the existing active-wave branch retains its small green status dot and uses the same halo');
  assert.doesNotMatch(activeWave, /animate-pulse/, 'the active-wave dot must not retain a separate opacity pulse');
});

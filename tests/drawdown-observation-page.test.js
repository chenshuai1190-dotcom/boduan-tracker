import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';
import { buildObservationUniverse, deriveObservation } from '../src/lib/drawdownObservationModel.js';

const source = readFileSync(new URL('../src/pages/DrawdownObservationPage.jsx', import.meta.url), 'utf8');
const transformed = await transformWithOxc(source, 'DrawdownObservationPage.jsx', { jsx: { runtime: 'classic' } });
const compiled = transformed.code.replace(/^import\s[^\n]+;?\n/gm, '').replace('export default function ', 'function ');

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const complete = (request, prices = {}) => ({ instruments: request.args.instruments.map(item => ({
  ...item, status: 'ready', source: 'EODHD_EOD', priceBasis: 'adjusted_close', currency: 'USD',
  asOfDate: '2026-09-08', expectedAsOfDate: '2026-09-08', stale: false,
  points: [{ date: '2025-09-08', close: 80 }, { date: '2026-09-04', close: 100 }, { date: '2026-09-08', close: prices[item.symbol] || 90 }],
})) });
const symbols = page => page.tree.props.observations.map(item => item.symbol);
const row = (page, symbol) => page.tree.props.observations.find(item => item.symbol === symbol);

// The production controller and pure finance helpers execute unchanged. Only
// React hook storage, the presentation boundary and asynchronous transport are
// supplied so renders can be inspected before passive effects run.
function harness(initialProps = {}, { dev = false } = {}) {
  let props = initialProps, cursor = 0, dirty = false, tree, unmounted = false, writesAfterUnmount = 0;
  const slots = [], requests = [];
  let pendingEffects = [];
  const sameDependencies = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => {
        if (unmounted) writesAfterUnmount += 1;
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        dirty ||= !Object.is(next, slots[index].value);
        slots[index].value = next;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: { current: initial } };
      return slots[index].value;
    },
    useMemo(factory, dependencies) {
      const index = cursor++;
      if (!sameDependencies(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, value: factory() };
      return slots[index].value;
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!sameDependencies(previous?.dependencies, dependencies)) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          slots[index] = { dependencies, cleanup: effect() };
        });
      }
    },
  };
  function DrawdownObservation() { return null; }
  function loadDrawdownObservation(args) {
    const request = { args, ...deferred() };
    requests.push(request);
    return request.promise;
  }
  const factory = new Function('React', 'DrawdownObservation', 'buildObservationUniverse', 'deriveObservation', 'loadDrawdownObservation',
    `${compiled.replaceAll('import.meta.env.DEV', String(dev))}\nreturn DrawdownObservationPage;`);
  const Page = factory(hooks, DrawdownObservation, buildObservationUniverse, deriveObservation, loadDrawdownObservation);
  const page = {
    requests,
    get tree() { return tree; },
    get writesAfterUnmount() { return writesAfterUnmount; },
    renderOnly(nextProps = props) {
      props = nextProps;
      cursor = 0;
      dirty = false;
      pendingEffects = [];
      tree = Page(props);
      assert.equal(tree.type, DrawdownObservation);
      return tree;
    },
    commit() {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const effects = pendingEffects;
        pendingEffects = [];
        effects.forEach(effect => effect());
        if (!dirty) return tree;
        this.renderOnly();
      }
      assert.fail('controller effects did not settle');
    },
    render(nextProps = props) { this.renderOnly(nextProps); return this.commit(); },
    async flush() {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      if (!unmounted) this.render();
    },
    unmount() {
      slots.forEach(slot => slot?.cleanup?.());
      pendingEffects = [];
      unmounted = true;
    },
  };
  page.render();
  return page;
}

test('identity changes synchronously hide prior prices and membership before effect cleanup', async () => {
  const page = harness({ ctx: { userId: 'alice', watchlist: [{ symbol: 'NVDA', name: 'Nvidia' }] } });
  const first = page.requests[0];
  first.resolve(complete(first, { NVDA: 75 }));
  await page.flush();
  assert.equal(row(page, 'NVDA').price, 75);
  const oldKey = page.tree.key;
  page.renderOnly({ ctx: { userId: 'bob', watchlist: [{ symbol: 'AAPL', name: 'Apple' }] } });
  assert.notEqual(page.tree.key, oldKey, 'presentation state must remount across identities');
  assert.deepEqual(symbols(page), ['SPY', 'QQQ', 'AAPL']);
  assert.ok(page.tree.props.observations.every(item => item.price === null && item.status === 'loading'));
  assert.equal(page.tree.props.loading, true);
  assert.equal(first.args.signal.aborted, false, 'this assertion runs before passive effect cleanup');
  page.commit();
  assert.equal(first.args.signal.aborted, true);
  assert.equal(page.requests[1].args.userId, 'bob');
  page.unmount();
});

test('changed personal universe hides removed rows immediately and equivalent input objects do not refetch', async () => {
  const props = { ctx: { userId: 'alice', watchlist: [{ symbol: 'NVDA', name: 'Nvidia' }], positions: [{ symbol: 'MSFT', name: 'Microsoft', quantity: 5 }] } };
  const page = harness(props);
  const first = page.requests[0];
  first.resolve(complete(first));
  await page.flush();
  assert.equal(row(page, 'MSFT').inHoldings, true);
  page.render({ ctx: { ...props.ctx, watchlist: [{ symbol: 'NVDA', name: 'Nvidia', price: 99 }], positions: [{ symbol: 'MSFT', name: 'Microsoft', quantity: 8 }], marketColorMode: 'green-up' } });
  assert.equal(page.requests.length, 1, 'price ticks, array identities and positive share quantity do not change membership');
  page.renderOnly({ ctx: { ...props.ctx, positions: [{ symbol: 'MSFT', name: 'Microsoft', quantity: 0 }] } });
  assert.deepEqual(symbols(page), ['SPY', 'QQQ', 'NVDA']);
  assert.ok(page.tree.props.observations.every(item => item.price === null));
  page.commit();
  assert.equal(first.args.signal.aborted, true);
  assert.equal(page.requests.length, 2);
  page.unmount();
});

test('unready or failed portfolio input never exposes retained position membership', () => {
  const props = { ctx: { userId: 'alice', positions: [{ symbol: 'NVDA', quantity: 4 }], portfolioReady: true, portfolioError: '' } };
  const page = harness(props);
  page.renderOnly({ ctx: { ...props.ctx, portfolioReady: false } });
  assert.deepEqual(symbols(page), ['SPY', 'QQQ']);
  assert.equal(page.tree.props.portfolioReady, false);
  page.commit();
  page.render({ ctx: { ...props.ctx, portfolioError: 'holdings unavailable' } });
  assert.deepEqual(symbols(page), ['SPY', 'QQQ']);
  assert.equal(page.tree.props.portfolioError, 'holdings unavailable');
  page.unmount();
});

test('aborted older requests cannot commit late progress or completion over the new identity', async () => {
  const page = harness({ ctx: { userId: 'alice', watchlist: [{ symbol: 'NVDA' }] } });
  const old = page.requests[0];
  old.args.onProgress(complete(old, { NVDA: 50 }));
  page.render();
  assert.equal(row(page, 'NVDA').price, 50);
  page.render({ ctx: { userId: 'bob', watchlist: [{ symbol: 'AAPL' }] } });
  const current = page.requests[1];
  assert.equal(old.args.signal.aborted, true);
  current.resolve(complete(current, { AAPL: 88 }));
  await page.flush();
  old.args.onProgress(complete(old, { NVDA: 60 }));
  old.resolve(complete(old, { NVDA: 65 }));
  await page.flush();
  assert.deepEqual(symbols(page), ['SPY', 'QQQ', 'AAPL']);
  assert.equal(row(page, 'AAPL').price, 88);
  assert.equal(page.tree.props.loading, false);
  assert.equal(page.tree.props.error, '');
  page.unmount();
});

test('unmount aborts the caller and ignores both later progress and rejection without state writes', async () => {
  const page = harness({ ctx: { userId: 'alice' } });
  const request = page.requests[0];
  page.unmount();
  assert.equal(request.args.signal.aborted, true);
  request.args.onProgress(complete(request));
  request.reject(new Error('late abort rejection'));
  await page.flush();
  assert.equal(page.writesAfterUnmount, 0);
});

test('fatal transport rejection discards already successful progress instead of retaining partial identity data', async () => {
  const page = harness({ ctx: { userId: 'alice', watchlist: [{ symbol: 'NVDA' }] } });
  const request = page.requests[0];
  request.args.onProgress(complete(request, { NVDA: 70 }));
  page.render();
  assert.equal(row(page, 'NVDA').price, 70);
  assert.equal(page.tree.props.loading, true);
  request.reject(Object.assign(new Error('identity changed'), { code: 'AUTH_REQUIRED' }));
  await page.flush();
  assert.equal(page.tree.props.loading, false);
  assert.match(page.tree.props.error, /登录状态/);
  assert.ok(page.tree.props.observations.every(item => item.status === 'error' && item.price === null && item.points.length === 0));
  page.unmount();
});

test('ordinary partial failures preserve healthy rows and manual refresh starts one forced guarded request', async () => {
  const page = harness({ ctx: { userId: 'alice', watchlist: [{ symbol: 'NVDA' }] } });
  const first = page.requests[0];
  const partial = complete(first);
  partial.instruments[2] = { ...partial.instruments[2], status: 'error', points: [], error: { code: 'PROVIDER_ERROR' } };
  first.resolve(partial);
  await page.flush();
  assert.equal(first.args.force, false);
  assert.equal(row(page, 'SPY').price, 90);
  assert.equal(row(page, 'NVDA').price, null);
  assert.equal(page.tree.props.loading, false);
  assert.match(page.tree.props.error, /部分标的/);
  page.tree.props.onRefresh();
  page.render();
  assert.equal(page.requests.length, 2);
  const second = page.requests[1];
  assert.equal(second.args.force, true);
  assert.equal(first.args.signal.aborted, true);
  assert.equal(page.tree.props.loading, true);
  assert.ok(page.tree.props.observations.every(item => item.price === null));
  first.args.onProgress(partial);
  page.render();
  assert.equal(row(page, 'SPY').price, null, 'prior progress cannot flash back during explicit refresh');
  second.resolve(complete(second, { NVDA: 95 }));
  await page.flush();
  assert.equal(row(page, 'NVDA').price, 95);
  assert.equal(page.tree.props.error, '');
  assert.equal(page.tree.props.loading, false);
  page.unmount();
});

test('production build cannot select a preview transport while DEV preview may inject an explicit source', () => {
  const previewLoad = () => Promise.reject(new Error('test stub is never invoked by transport harness'));
  const props = { ctx: { userId: 'alice' }, previewSource: { load: previewLoad, initialSymbol: 'NVDA' } };
  const production = harness(props);
  assert.equal(production.requests[0].args.loadHistory, undefined);
  assert.equal(production.tree.props.initialSymbol, '', 'production must ignore preview detail shortcuts');
  production.unmount();
  const preview = harness(props, { dev: true });
  assert.equal(preview.requests[0].args.loadHistory, previewLoad);
  assert.equal(preview.tree.props.initialSymbol, 'NVDA');
  preview.unmount();
});

test('manual force is consumed once and does not follow later universe changes, restored universes or identities', () => {
  const firstProps = { ctx: { userId: 'alice', watchlist: [{ symbol: 'NVDA' }] } };
  const page = harness(firstProps);
  assert.equal(page.requests[0].args.force, false);
  page.tree.props.onRefresh();
  page.render();
  assert.equal(page.requests[1].args.force, true);
  page.render({ ctx: { userId: 'alice', watchlist: [{ symbol: 'AAPL' }] } });
  assert.equal(page.requests[2].args.force, false, 'new membership must reuse shared cache');
  page.render(firstProps);
  assert.equal(page.requests[3].args.force, false, 'returning to an already-refreshed universe must not replay the retry');
  page.tree.props.onRefresh();
  page.render();
  assert.equal(page.requests[4].args.force, true, 'a second explicit refresh still forces exactly its own request');
  page.render({ ctx: { ...firstProps.ctx, userId: 'bob' } });
  assert.equal(page.requests[5].args.force, false, 'even without the App remount, another identity cannot inherit forced retry');
  assert.equal(page.requests[5].args.userId, 'bob');
  page.unmount();
});

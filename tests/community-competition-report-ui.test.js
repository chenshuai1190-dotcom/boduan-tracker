import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { t } from '../src/lib/i18n.js';

// Render the real presentation components; only the CSS import is omitted.
// No API, account, ranking or snapshot fixture is substituted in production.
const pageUrl = new URL('../src/pages/CommunityCompetitionPage.jsx', import.meta.url);
let source = readFileSync(pageUrl, 'utf8').replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
source += '\nexport { CompetitionContent, RankRow, HoldingPopover, JoinSheet, StatusCard, TrendChart };';
const transformed = await transformWithOxc(source, pageUrl.pathname, { jsx: { runtime: 'classic' } });
const code = transformed.code.replace(/from\s+(['"])([^'"]+)\1/g, (_match, _quote, specifier) => (
  `from ${JSON.stringify(specifier.startsWith('.') ? new URL(specifier, pageUrl).href : import.meta.resolve(specifier))}`
));
const { default: Page, CompetitionContent, RankRow, HoldingPopover, JoinSheet, StatusCard, TrendChart } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const tt = (key, fallback, vars) => t('zh', key, fallback, vars);

function nodes(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => nodes(child, predicate))];
}

function render(Component, props) {
  let tree;
  function Capture() { tree = Component(props); return tree; }
  const originalError = console.error;
  const warnings = [];
  let html;
  try {
    console.error = (...args) => warnings.push(String(args[0]));
    html = renderToStaticMarkup(React.createElement(Capture));
  } finally { console.error = originalError; }
  assert.ok(warnings.every(message => message.startsWith('Warning: useLayoutEffect does nothing on the server')), warnings.join('\n'));
  return { html, tree };
}

const rows = [
  { nickname: '第一名', avatarKey: 'blue', rank: 1, returnPct: .12456, outperformancePct: .10, holdingSymbols: ['NVDA', 'QQQ'] },
  { nickname: '这是一个十六字长度的测试用户昵称', avatarKey: 'gold', rank: 2, returnPct: -.025, outperformancePct: -.04956, holdingSymbols: [] },
];
const ready = {
  state: 'ready', self: rows[1], leaders: rows, asOfDate: '2026-09-09', calculationStartDate: '2026-09-08', benchmarkReturnPct: .02456,
  stats: { participants: 12, joinedParticipants: 12, rankedParticipants: 10, beatRatePct: .4, profitableRatePct: .7, averageReturnPct: .03, top10AverageReturnPct: .04 },
  trend: { benchmark: [{ date: '2026-09-08', value: 0 }, { date: '2026-09-09', value: .02456 }] },
};
const contentProps = overrides => ({ data: ready, period: 'day', language: 'zh', tt, ...overrides });

test('new competition report preserves server ordering, exact rates and one self row', () => {
  const { tree, html } = render(CompetitionContent, contentProps());
  const ranks = nodes(tree, node => node.type === RankRow);
  assert.deepEqual(ranks.map(node => node.props.row.nickname), rows.map(row => row.nickname));
  assert.equal(ranks.filter(node => node.props.self).length, 1);
  assert.ok(html.includes('+12.46%'));
  assert.ok(html.includes('-2.50%'));
  assert.ok(html.includes('-4.96%'));
  assert.ok(html.includes('12/10'), 'joined participants are not confused with ranked accounts');
  assert.match(html, /数据截至 09\.09 收盘/);
  assert.ok(html.indexOf('cc-leaderboard') < html.indexOf('cc-baseline'), 'first screen prioritizes the leaderboard');
  assert.doesNotMatch(html, /NaN|Infinity/);
  const outside = { ...ready, self: { ...rows[1], rank: 22, nickname: '我在榜外' } };
  const outsideRows = nodes(render(CompetitionContent, contentProps({ data: outside })).tree, node => node.type === RankRow);
  assert.equal(outsideRows.length, 3);
  assert.equal(outsideRows.at(-1).props.self, true);
});

test('unknown competition data never becomes zero or simulated returns', () => {
  for (const data of [null, { state: 'waiting_snapshot' }, { state: 'ready', stats: {}, leaders: [] }]) {
    const { html } = render(CompetitionContent, contentProps({ data }));
    assert.ok(html.includes('--'));
    assert.doesNotMatch(html, /[+-]?0\.00%|NaN|Infinity|aria-label="Return trend"/);
  }
  const { html } = render(RankRow, { row: { ...rows[0], returnPct: 0, outperformancePct: null } });
  assert.ok(html.includes('0.00%'), 'a recorded zero is different from a missing rate');
  assert.ok(html.includes('--'));
});

test('rank rows preserve red up, green down, readable names and selected state', () => {
  for (const [returnPct, expected] of [[.1, '#ff4b1f'], [-.1, '#36c49a'], [0, 'rgba(255,255,255,0.58)'], [null, 'rgba(255,255,255,0.58)']]) {
    const { tree, html } = render(RankRow, { row: { ...rows[1], returnPct }, self: true, selected: true });
    assert.equal(tree.props['aria-expanded'], true);
    assert.match(tree.props.className, /cc-rank-self.*cc-rank-selected/);
    assert.equal(nodes(tree, node => node.props.className === 'cc-rank-return')[0].props.style.color, expected);
    assert.ok(html.includes(rows[1].nickname), 'CSS truncation must not remove the accessible name');
  }
});

test('public holdings keep unavailable, empty and symbol-only states distinct', () => {
  for (const [holdingSymbols, expected] of [[null, '持仓暂不可用'], [[], '当前空仓'], [['nvda', 'qqq'], 'NVDA']]) {
    const { html } = render(HoldingPopover, {
      selection: { row: { ...rows[0], holdingSymbols, shares: 7000, cash: 123456 } },
      periodMetricLabel: '当日收益率', snapshotDate: '2026-09-09', language: 'zh', tt, onClose() {},
    });
    assert.ok(html.includes(expected));
    assert.doesNotMatch(html, /7000|123456/);
    assert.ok(html.includes('关闭用户资料卡'));
  }
});

test('joining stays explicit, decline and close do not join, busy controls remain disabled', () => {
  let joined = 0;
  let declined = 0;
  const props = { tt, onJoin() { joined++; }, onDecline() { declined++; } };
  const { tree } = render(JoinSheet, props);
  const buttons = nodes(tree, node => node.type === 'button');
  assert.equal(buttons.length, 3);
  assert.equal(joined, 0);
  buttons.find(node => node.props.className === 'cc-dialog-close').props.onClick();
  buttons.find(node => node.props.className === 'cc-secondary-action').props.onClick();
  assert.equal(declined, 2);
  assert.equal(joined, 0);
  buttons.find(node => node.props.className === 'cc-primary-action').props.onClick();
  assert.equal(joined, 1);
  const busy = render(JoinSheet, { ...props, joining: true, error: '测试失败提示' });
  assert.ok(nodes(busy.tree, node => node.type === 'button').every(node => node.props.disabled));
  assert.ok(busy.html.includes('role="alert"'));
});

test('all periods and statuses retain their labels and no sample ranking appears during loading', () => {
  for (const period of ['day', 'week', 'month', 'year']) {
    const { html } = render(CompetitionContent, contentProps({ period }));
    assert.ok(html.includes(tt(`competition.periodMetric.${period}`)));
    assert.ok(html.includes(tt(`competition.baseline.${period}`)));
  }
  const { html, tree } = render(Page, { ctx: { disableCommunityCompetitionCache: true } });
  assert.ok(html.includes('正在读取真实收盘快照'));
  assert.doesNotMatch(html, /data-competition-rank-row/);
  assert.equal(nodes(tree, node => node.props.className === 'cc-period').length, 4);
  assert.ok(nodes(tree, node => node.props.className === 'cc-period').every(node => node.props.disabled));
  assert.match(render(StatusCard, { title: '等待快照', desc: '尚无真实收盘快照' }).html, /role="status"/);
});

test('QQQ mini trend only plots available observed points', () => {
  assert.doesNotMatch(render(TrendChart, { benchmark: [{ date: '2026-09-09', value: null }], compact: true }).html, /<path /);
  const { html } = render(TrendChart, { benchmark: ready.trend.benchmark, compact: true });
  assert.match(html, /d="M4\.00 66\.00 L164\.00 6\.00"/);
});

test('competition page owns identical safe-area and side gutters in production and preview', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const css = read('src/pages/CommunityCompetitionPage.css');
  const app = read('src/App.jsx');
  const preview = read('src/DevVisualPreview.jsx');
  assert.match(css, /\.cc-page\s*\{[^}]*max-width:\s*792px;[^}]*padding:\s*0 16px calc\(env\(safe-area-inset-bottom\) \+ 92px\);/);
  assert.match(css, /\.cc-header\s*\{[^}]*top:\s*0;[^}]*padding:\s*calc\(env\(safe-area-inset-top\) \+ 12px\) 0 16px;/);
  assert.match(app, /const isFullBleedPage = [^;]*isCommunityCompetitionPage/);
  assert.ok(preview.match(/\$\{\[([^\]]+)\]\.includes\(activeTab\) \? 'px-0' : 'px-4'\}/)?.[1].includes("'community-competition'"));
  assert.ok(preview.match(/paddingTop:\s*\[([^\]]+)\]\.includes\(activeTab\) \? 0 :/)?.[1].includes("'community-competition'"));
});

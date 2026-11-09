import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { normalizeReviewPreferences } from '../src/lib/reviewPreferences.js';

const source = readFileSync(new URL('../src/components/ReviewPreferences.jsx',import.meta.url),'utf8');
let Component;
async function component(){
  if(Component)return Component;
  const text=source.replace("from 'react'",`from ${JSON.stringify(import.meta.resolve('react'))}`)
    .replace("from 'lucide-react'",`from ${JSON.stringify(import.meta.resolve('lucide-react'))}`)
    .replace("from '../lib/reviewPreferences.js'",`from ${JSON.stringify(new URL('../src/lib/reviewPreferences.js',import.meta.url).href)}`)
    .replace("import './ReviewPreferences.css';",'');
  const compiled=await transformWithOxc(text,'ReviewPreferences.jsx',{jsx:{runtime:'classic'}});
  Component=(await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`)).default;return Component;
}
async function render(patch={}){const C=await component();return renderToStaticMarkup(React.createElement(C,{identityNode:React.createElement('strong',null,'示例用户'),preferences:normalizeReviewPreferences(null),ready:true,canEdit:true,onChange:()=>{},onRetry:()=>{},...patch}));}

test('settings expose the avatar identity, master switch, eleven display groups and currency choice',async()=>{
  const html=await render();
  assert.match(html,/动态设置/);assert.match(html,/示例用户/);
  assert.equal((html.match(/role="switch"/g)||[]).length,12);
  for(const text of ['净资产新高','累计收益新高','年内收益新高','年内收益新低','净资产回撤与恢复','收益率高点回落','单日涨跌纪录','持仓个股年内最大单日跌幅','月度总结','季度总结','年度总结','美元 USD','人民币 CNY'])assert.ok(html.includes(text),text);
  assert.doesNotMatch(html,/累计收益率新高|累计盈利新高|年内收益率新高|年内收益率新低|年内收益金额新高|年内收益金额新低/);
  assert.match(html,/aria-pressed="true"[^>]*>美元 USD/);
});

test('disabled master retains selected event types but prevents child toggles',async()=>{
  const html=await render({preferences:{showTimeline:false,currency:'USD',eventTypes:['drawdown']}});
  assert.match(html,/aria-checked="true" aria-label="净资产回撤与恢复" disabled=""/);
  assert.match(html,/aria-checked="false" aria-label="净资产新高" disabled=""/);
  assert.doesNotMatch(html,/aria-label="在“全部”中显示时间线" disabled=""/);
});

test('loading and saving prevent changes and errors offer a visible retry',async()=>{
  const html=await render({loading:true,canEdit:false,error:'设置暂时无法读取'});
  assert.match(html,/role="status"/);assert.match(html,/role="alert"/);
  assert.equal((html.match(/disabled=""/g)||[]).length,15);
  assert.match(await render({saving:true}),/正在保存/);
  assert.match(await render({preferences:{showTimeline:true,currency:'CNY',eventTypes:[]}}),/当前未选择任何事件/);
});

test('stock loss setting is independent from account daily return records', async () => {
  for (const account of [false, true]) for (const stock of [false, true]) {
    const eventTypes=[account && 'daily_record',stock && 'stock_daily_record'].filter(Boolean);
    const html=await render({preferences:{showTimeline:true,currency:'USD',eventTypes}});
    assert.match(html,new RegExp(`aria-checked="${account}" aria-label="单日涨跌纪录"`));
    assert.match(html,new RegExp(`aria-checked="${stock}" aria-label="持仓个股年内最大单日跌幅"`));
  }
});

test('net-asset and return-decline switches render all four independent selections', async () => {
  for (const net of [false, true]) for (const returns of [false, true]) {
    const eventTypes = [net && 'drawdown', returns && 'return_drawdown'].filter(Boolean);
    const html = await render({ preferences: { showTimeline: true, currency: 'USD', eventTypes } });
    assert.match(html, new RegExp(`aria-checked="${net}" aria-label="净资产回撤与恢复"`));
    assert.match(html, new RegExp(`aria-checked="${returns}" aria-label="收益率高点回落"`));
  }
  const english = await render({ language: 'en' });
  assert.match(english, /Net asset drawdowns and recovery/);
  assert.match(english, /Decline from annual return high/);
  const disabled = await render({ preferences: { showTimeline: false, currency: 'USD', eventTypes: ['return_drawdown'] } });
  assert.match(disabled, /aria-checked="false" aria-label="净资产回撤与恢复" disabled=""/);
  assert.match(disabled, /aria-checked="true" aria-label="收益率高点回落" disabled=""/);
});

test('annual high and low groups are on if either legacy metric was enabled and stay distinct from cumulative highs', async () => {
  const ids = ['annual_return_high', 'annual_return_low', 'annual_pnl_high', 'annual_pnl_low'];
  for (let selection = 0; selection < 16; selection++) {
    const eventTypes = ids.filter((_, index) => selection & 1 << index);
    const html = await render({ preferences: { showTimeline: true, currency: 'CNY', eventTypes } });
    assert.match(html, new RegExp(`aria-checked="${Boolean(selection & 5)}" aria-label="年内收益新高"`));
    assert.match(html, new RegExp(`aria-checked="${Boolean(selection & 10)}" aria-label="年内收益新低"`));
    assert.match(html, /aria-checked="false" aria-label="累计收益新高"/);
  }
  const disabled = await render({ preferences: { showTimeline: false, currency: 'USD', eventTypes: ['annual_return_low', 'annual_pnl_high'] } });
  assert.match(disabled, /aria-checked="true" aria-label="年内收益新低" disabled=""/);
  assert.match(disabled, /aria-checked="true" aria-label="年内收益新高" disabled=""/);
  const english = await render({ language: 'en' });
  for (const text of ['Cumulative earnings highs', 'Annual earnings highs', 'Annual earnings lows']) assert.ok(english.includes(text));
});

test('group switches update all member IDs together without changing unrelated choices or master and currency', async () => {
  const C = await component();
  const walk = tree => !React.isValidElement(tree) ? Array.isArray(tree) ? tree.flatMap(walk) : [] : [tree, ...walk(tree.props.children)];
  const cases = [
    ['累计收益新高', ['return_high', 'pnl_high']],
    ['年内收益新高', ['annual_return_high', 'annual_pnl_high']],
    ['年内收益新低', ['annual_return_low', 'annual_pnl_low']],
  ];
  for (const [title, members] of cases) for (const previous of [[], [members[0]], [members[1]], members]) {
    const eventTypes = [...previous, 'drawdown', 'month'];
    const preferences = { showTimeline: true, currency: 'CNY', eventTypes };
    const changes = [];
    const tree = C({ preferences, ready: true, onChange: patch => changes.push(patch) });
    const group = walk(tree).find(node => node.props.title === title);
    const control = group.type(group.props);
    assert.equal(control.props['aria-checked'], previous.length > 0);
    control.props.onClick();
    assert.equal(changes.length, 1);
    assert.deepEqual(Object.keys(changes[0]), ['eventTypes']);
    const result = changes[0].eventTypes;
    assert.ok(result.includes('drawdown')); assert.ok(result.includes('month'));
    for (const id of members) assert.equal(result.includes(id), previous.length === 0);
    assert.deepEqual(eventTypes, [...previous, 'drawdown', 'month'], 'the rendered selection remains immutable');
    assert.equal(preferences.currency, 'CNY'); assert.equal(preferences.showTimeline, true);
  }
});

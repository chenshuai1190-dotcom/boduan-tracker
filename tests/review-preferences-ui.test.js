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

test('settings expose the avatar identity, master switch, thirteen categories and currency choice',async()=>{
  const html=await render();
  assert.match(html,/动态设置/);assert.match(html,/示例用户/);
  assert.equal((html.match(/role="switch"/g)||[]).length,14);
  for(const text of ['净资产新高','累计收益率新高','累计盈利新高','年内收益率新高','年内收益率新低','年内收益金额新高','年内收益金额新低','净资产回撤与恢复','收益率高点回落','单日涨跌纪录','月度总结','季度总结','年度总结','美元 USD','人民币 CNY'])assert.ok(html.includes(text),text);
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
  assert.equal((html.match(/disabled=""/g)||[]).length,17);
  assert.match(await render({saving:true}),/正在保存/);
  assert.match(await render({preferences:{showTimeline:true,currency:'CNY',eventTypes:[]}}),/当前未选择任何事件/);
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

test('annual return and P&L high and low choices remain distinct from cumulative highs', async () => {
  const labels = ['年内收益率新高', '年内收益率新低', '年内收益金额新高', '年内收益金额新低'];
  const ids = ['annual_return_high', 'annual_return_low', 'annual_pnl_high', 'annual_pnl_low'];
  for (let selection = 0; selection < 16; selection++) {
    const eventTypes = ids.filter((_, index) => selection & 1 << index);
    const html = await render({ preferences: { showTimeline: true, currency: 'CNY', eventTypes } });
    labels.forEach((label, index) => assert.match(html, new RegExp(`aria-checked="${Boolean(selection & 1 << index)}" aria-label="${label}"`)));
    assert.match(html, /aria-checked="false" aria-label="累计收益率新高"/);
    assert.match(html, /aria-checked="false" aria-label="累计盈利新高"/);
  }
  const disabled = await render({ preferences: { showTimeline: false, currency: 'USD', eventTypes: ['annual_return_low', 'annual_pnl_high'] } });
  assert.match(disabled, /aria-checked="true" aria-label="年内收益率新低" disabled=""/);
  assert.match(disabled, /aria-checked="true" aria-label="年内收益金额新高" disabled=""/);
  const english = await render({ language: 'en' });
  for (const text of ['Annual return highs', 'Annual return lows', 'Annual P&amp;L highs', 'Annual P&amp;L lows']) assert.ok(english.includes(text));
});

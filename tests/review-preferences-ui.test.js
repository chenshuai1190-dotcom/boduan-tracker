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

test('settings expose the avatar identity, master switch, eight categories and currency choice',async()=>{
  const html=await render();
  assert.match(html,/动态设置/);assert.match(html,/示例用户/);
  assert.equal((html.match(/role="switch"/g)||[]).length,9);
  for(const text of ['净资产新高','累计收益率新高','累计盈利新高','回撤与恢复','单日涨跌纪录','月度总结','季度总结','年度总结','美元 USD','人民币 CNY'])assert.ok(html.includes(text),text);
  assert.match(html,/aria-pressed="true"[^>]*>美元 USD/);
});

test('disabled master retains selected event types but prevents child toggles',async()=>{
  const html=await render({preferences:{showTimeline:false,currency:'USD',eventTypes:['drawdown']}});
  assert.match(html,/aria-checked="true" aria-label="回撤与恢复" disabled=""/);
  assert.match(html,/aria-checked="false" aria-label="净资产新高" disabled=""/);
  assert.doesNotMatch(html,/aria-label="在“全部”中显示时间线" disabled=""/);
});

test('loading and saving prevent changes and errors offer a visible retry',async()=>{
  const html=await render({loading:true,canEdit:false,error:'设置暂时无法读取'});
  assert.match(html,/role="status"/);assert.match(html,/role="alert"/);
  assert.equal((html.match(/disabled=""/g)||[]).length,12);
  assert.match(await render({saving:true}),/正在保存/);
  assert.match(await render({preferences:{showTimeline:true,currency:'CNY',eventTypes:[]}}),/当前未选择任何事件/);
});

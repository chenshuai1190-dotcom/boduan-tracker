import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { transformWithOxc } from 'vite';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/ReportBottomNav.css', import.meta.url), 'utf8');
const start = app.indexOf('{!hideBottomNavigation && (');
const end = app.indexOf('\n      </div>', start);
const navigation = app.slice(start, end);
const result = await transformWithOxc(`
  import React from ${JSON.stringify(import.meta.resolve('react'))};
  import { t } from ${JSON.stringify(new URL('../src/lib/i18n.js', import.meta.url).href)};
  const WifiOff=()=>null;
  export function Navigation({count,language='zh'}) {
    const reviewFeedUnread={unreadCount:count},hideBottomNavigation=false,reviewNavigationHidden=false,
      activeTab='home',darkShell=true,showQuoteFetchError=false,fetchError='',handleBottomTabClick=()=>{};
    return <>${navigation}</>;
  }
`, 'review-feed-unread-ui.jsx', { jsx: { runtime: 'classic' } });
const { Navigation } = await import(`data:text/javascript;base64,${Buffer.from(result.code).toString('base64')}`);

test('production Dynamic badge hides zero/unavailable and caps display at 99+', () => {
  for (const count of [0,null,undefined]) {
    const html = renderToStaticMarkup(React.createElement(Navigation, { count }));
    assert.doesNotMatch(html, /class="report-bottom-nav-new-posts"/);
  }
  for (const [count,display] of [[3,'3'],[12,'12'],[99,'99'],[100,'99+']]) {
    const html = renderToStaticMarkup(React.createElement(Navigation, { count }));
    assert.equal((html.match(/class="report-bottom-nav-new-posts"/g)||[]).length, 1);
    assert.ok(html.includes(`aria-label="${count} 条新帖子">${display}</span>`));
    const english = renderToStaticMarkup(React.createElement(Navigation,{ count,language:'en' }));
    assert.ok(english.includes(`aria-label="${count} new posts"`));
  }
});

test('badge uses its own solid background and isolated tab layer without blur or opacity', () => {
  const badge = css.match(/\.report-bottom-nav-new-posts\s*\{([^}]+)\}/)?.[1];
  assert.ok(badge); assert.match(badge,/background:\s*#ed4b4f/); assert.match(badge,/color:\s*#fff/);
  assert.match(badge,/font-variant-numeric:\s*tabular-nums/); assert.match(badge,/white-space:\s*nowrap/);
  assert.match(badge,/z-index:\s*1/); assert.doesNotMatch(badge,/filter|opacity/);
  assert.match(css,/\.report-bottom-nav-tab\s*\{[^}]*isolation:\s*isolate/);
});

test('Dynamic requests the All root so the page can restore its saved scope without clearing counts on the tap itself', () => {
  const handler = app.slice(app.indexOf('const handleBottomTabClick ='),app.indexOf('const [portfolioCurrencyMode,'));
  assert.match(handler,/if \(tabId === 'review'\) setReviewOpenAllRequest\(value => value \+ 1\)/);
  assert.doesNotMatch(handler,/markSeen|markReviewFeedSeen|unreadCount/);
  assert.match(app,/useReviewFeedUnread\(\{ db, userId: user\?\.id \|\| '' \}\)/);
  assert.match(app,/navigationTab: true, reviewPublicRefreshRef, reviewFeedUnread, reviewOpenAllRequest/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/tabs/EarningsCalendar.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/tabs/EarningsCalendarReport.css', import.meta.url), 'utf8');
const report = source.slice(source.indexOf("if (visualVariant === 'report')"), source.indexOf('className={`mt-3 rounded-2xl'));

test('home earnings report is an optional presentation of the existing selected calendar events', () => {
  assert.ok(source.includes("visualVariant = 'default'"));
  assert.ok(source.indexOf('if (standalone)') < source.indexOf("if (visualVariant === 'report')"));
  assert.ok(source.includes('const previewEvents = displayEvents.slice(0, 5)'));
  assert.ok(report.includes('previewEvents.map((event) =>'));
  assert.ok(report.includes('const published = isEarningsPublished(event)'));
  assert.ok(report.includes('earningsSessionText(event.session, language)'));
  assert.ok(report.includes("language === 'en' ? 'Published' : '已发布'"));
  assert.ok(report.includes('eventDisplayName(event, displayStockName, language)'));
  assert.doesNotMatch(report, /fetch\(|useEffect|sort\(|setEvents\(/);
});

test('report time-strip items keep calendar and published-detail navigation plus explicit unavailable states', () => {
  assert.ok(report.includes("onClick={() => openModal('list')}"));
  assert.ok(report.includes('onClick={() => openPreviewEvent(event)}'));
  assert.ok(report.includes('error || t(language, \'earningsCalendar.noEvents\''));
  assert.ok(report.includes("loading ? t(language, 'earningsCalendar.loading'"));
  assert.ok(report.includes('<EarningsModal'));
  assert.ok(report.includes('open={modalOpen}'));
  assert.ok(report.includes('data-home-earnings-placement="fixed"'));
});

test('report earnings use a manually scrollable fixed-width time strip instead of a vertical company list', () => {
  assert.match(css, /\.home-earnings-report\s*\{[^}]*background:\s*transparent;/);
  assert.match(css, /\.her-events\s*\{[^}]*display:\s*flex;[^}]*overflow-x:\s*auto;[^}]*scroll-snap-type:\s*x proximity;/);
  assert.match(css, /\.her-event\s*\{[^}]*flex:\s*0 0 74px;/);
  assert.match(css, /\.her-event\s*\{[^}]*flex-direction:\s*column;/);
  assert.match(css, /\.her-event\s*\{[^}]*scroll-snap-align:\s*start;/);
  assert.doesNotMatch(css, /@media/, 'small screens should preserve 74px items and scroll locally rather than shrink text');
  const fontSizes = [...css.matchAll(/font-size:\s*([\d.]+)px/g)].map((match) => Number(match[1]));
  assert.ok(fontSizes.length > 0 && fontSizes.every((size) => size >= 10), 'all fixed text sizes should remain at least 10px');
  assert.doesNotMatch(report, /scrollIntoView|scrollTo\(|scrollBy\(|scrollLeft|setInterval|setTimeout|requestAnimationFrame/, 'the time strip must not automatically scroll or cycle');
  assert.doesNotMatch(css, /animation:|@keyframes/, 'the time strip must not introduce an animated carousel');
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|box-shadow|#f6b54b|#ffd18a/);
  assert.doesNotMatch(report, /EarningsResultMarker|CalendarDays/);
  assert.doesNotMatch(report, /her-company|her-name|her-chevron/, 'full company-name rows and per-item chevrons should be removed from the visible strip');
  const eventStart = report.indexOf('<button', report.indexOf('previewEvents.map('));
  const eventMarkup = report.slice(eventStart, report.indexOf('</button>', eventStart));
  assert.ok(eventStart >= 0 && eventMarkup.includes('className="her-event"'), 'each time-strip item should remain a real button');
  assert.match(eventMarkup, /her-date[\s\S]*her-logo[\s\S]*her-symbol[\s\S]*her-session/, 'each item should read date, logo, ticker, status from top to bottom');
  assert.doesNotMatch(eventMarkup, /<ChevronRight/, 'event buttons should not add redundant chevrons');
  const accessibleLabel = eventMarkup.match(/aria-label=\{(`[^`]*`)\}/)?.[1] || '';
  for (const identity of ['shortDateLabel(event.reportDate)', 'event.symbol', 'eventDisplayName(event, displayStockName, language)', 'published ?', 'earningsSessionText(event.session, language)']) {
    assert.ok(accessibleLabel.includes(identity), `the compact event button must preserve accessible identity: ${identity}`);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { keepReviewComposerInputVisible } from '../src/lib/reviewComposerVisibility.js';

function fixture({ inputTop = 450, inputHeight = 104, naturalHeight = 52, caretTop = 26,
  value = '第一行\n第二行', scrollTop = 0, innerScroll = 0, viewport, collapsedEmpty = false, throwRange = false } = {}) {
  const mirrors = [], positions = [], ranges = [];
  let attached = 0;
  const computed = { fontFamily: 'system-ui', fontSize: '17px', fontWeight: '400', lineHeight: '26px',
    paddingTop: '0px', paddingRight: '4px', paddingBottom: '0px', paddingLeft: '4px',
    borderLeftWidth: '1px', borderRightWidth: '1px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', letterSpacing: '0px' };
  const scroller = { scrollTop, scrollHeight: 3000, clientHeight: 400,
    getBoundingClientRect: () => ({ top: 100, bottom: 500, width: 390, height: 400 }),
    contains: element => element === input || element === context };
  const input = { tagName: 'TEXTAREA', value, selectionStart: value.length, selectionEnd: value.length,
    selectionDirection: 'none', scrollTop: innerScroll, clientWidth: 300,
    getBoundingClientRect: () => ({ top: inputTop - scroller.scrollTop, bottom: inputTop - scroller.scrollTop + inputHeight, width: 302, height: inputHeight }) };
  const context = { contains: element => element === input,
    getBoundingClientRect: () => ({ top: 400 - scroller.scrollTop, bottom: 540 - scroller.scrollTop, width: 350, height: 140 }) };
  const doc = { activeElement: input, defaultView: { getComputedStyle: () => computed, visualViewport: viewport },
    body: { appendChild(node) { attached++; node.parentNode = this; } },
    createElement() {
      const mirror = { style: {}, setAttribute() {}, appendChild(node) { this.text = node; },
        getBoundingClientRect: () => ({ top: 0, height: naturalHeight }),
        remove() { if (this.parentNode) { attached--; this.parentNode = null; } } };
      mirrors.push(mirror); return mirror;
    },
    createTextNode: text => ({ textContent: text }),
    createRange() {
      const range = { setStart(node, offset) { this.node = node; this.start = offset; positions.push(offset); },
        setEnd(node, offset) { this.end = offset; },
        getClientRects() {
          if (throwRange) throw new Error('layout unavailable');
          if (collapsedEmpty && this.end === this.start) return [];
          const top = typeof caretTop === 'function' ? caretTop(this.start) : caretTop;
          return [{ top, bottom: top + 26, height: 26, width: 0 }];
        } };
      ranges.push(range); return range;
    } };
  input.ownerDocument = doc;
  return { scroller, input, context, doc, mirrors, positions, ranges, attached: () => attached };
}

test('keyboard shrink reveals the active short body and four lines using only its scroll container', () => {
  const f = fixture({ inputTop: 450, viewport: { height: 420, offsetTop: 0 } });
  assert.equal(keepReviewComposerInputVisible(f.scroller, f.input), true);
  assert.equal(f.scroller.scrollTop, 148); // 450 + 104 - (420 - 14)
  assert.equal(f.doc.activeElement, f.input);
  assert.equal(f.attached(), 0);
  assert.equal(keepReviewComposerInputVisible(f.scroller, f.input), false);
  assert.equal(f.scroller.scrollTop, 148, 'a second settled measurement must not move again');
});

test('long text follows a caret in the middle rather than scrolling the whole textarea to its bottom', () => {
  const f = fixture({ inputTop: 480, inputHeight: 1200, naturalHeight: 1200, caretTop: offset => offset === 5 ? 420 : 1100, scrollTop: 300 });
  f.input.selectionStart = 5; f.input.selectionEnd = 5;
  assert.equal(keepReviewComposerInputVisible(f.scroller, f.input), true);
  assert.equal(f.scroller.scrollTop, 440); // caret 180 + 420 + 26 - 486
  assert.deepEqual(f.positions, [5]); assert.equal(f.attached(), 0);
});

test('end-of-text after a newline uses a full mirror and zero-width sentinel, including inner textarea scroll', () => {
  const f = fixture({ inputTop: 100, inputHeight: 1400, naturalHeight: 1400, caretTop: 1100,
    value: '第一段\n第二段\n', innerScroll: 200, collapsedEmpty: true });
  assert.equal(keepReviewComposerInputVisible(f.scroller, f.input), true);
  assert.equal(f.scroller.scrollTop, 540); // 100 + 1100 - 200 + 26 - 486
  assert.equal(f.mirrors[0].text.textContent, `${f.input.value}\u200b`);
  assert.equal(f.ranges[0].start, f.input.value.length);
  assert.equal(f.ranges[0].end, f.input.value.length + 1);
  assert.equal(f.mirrors[0].style.width, '302px');
  assert.equal(f.mirrors[0].style.fontFamily, 'system-ui');
  assert.equal(f.mirrors[0].style.whiteSpace, 'pre-wrap');
  assert.equal(f.mirrors[0].style.overflowWrap, 'anywhere');
  assert.equal(f.attached(), 0);
});

test('a backward selection tracks its start and scrolls upward when that caret is obscured', () => {
  const f = fixture({ inputTop: 100, inputHeight: 1400, naturalHeight: 1400, caretTop: offset => offset === 2 ? 52 : 800, scrollTop: 200 });
  f.input.selectionDirection = 'backward'; f.input.selectionStart = 2; f.input.selectionEnd = 8;
  assert.equal(keepReviewComposerInputVisible(f.scroller, f.input), true);
  assert.equal(f.scroller.scrollTop, 38); // caret -100 + 52, visible top 114
  assert.deepEqual(f.positions, [2]);
});

test('a visible caret, inactive input and unrelated scrollport remain untouched', () => {
  const f = fixture({ inputTop: 100, inputHeight: 1400, naturalHeight: 1400, caretTop: 208 });
  assert.equal(keepReviewComposerInputVisible(f.scroller, f.input), false);
  assert.equal(f.scroller.scrollTop, 0);
  const before = f.mirrors.length;
  f.doc.activeElement = {};
  assert.equal(keepReviewComposerInputVisible(f.scroller, f.input), false);
  f.doc.activeElement = f.input; f.scroller.contains = () => false;
  assert.equal(keepReviewComposerInputVisible(f.scroller, f.input), false);
  assert.equal(f.mirrors.length, before, 'unfocused or unrelated fields must not create a mirror');
});

test('a fitting custom-tag form is kept visible as a whole instead of just its input', () => {
  const f = fixture({ inputTop: 430, inputHeight: 36 }); f.input.tagName = 'INPUT';
  assert.equal(keepReviewComposerInputVisible(f.scroller, f.input, { contextElement: f.context }), true);
  assert.equal(f.scroller.scrollTop, 54); // context bottom 540 - 486
  assert.equal(f.mirrors.length, 0);
  assert.equal(keepReviewComposerInputVisible(f.scroller, f.input, { contextElement: f.context }), false);
});

test('failed long-text measurement cleans its mirror and falls back to the first visible input line', () => {
  const f = fixture({ throwRange: true, inputTop: 490, inputHeight: 1200, naturalHeight: 1200, value: '很长的正文'.repeat(50) });
  assert.equal(keepReviewComposerInputVisible(f.scroller, f.input), true);
  assert.equal(f.scroller.scrollTop, 30); // first line 490 + 26 - 486
  assert.equal(f.attached(), 0);
  const g = fixture({ inputTop: 490 }); delete g.doc.createRange;
  assert.equal(keepReviewComposerInputVisible(g.scroller, g.input), true);
  assert.equal(g.mirrors.length, 0);
});

test('empty and short text still reveal four writing lines when WebKit cannot measure a range', () => {
  for (const value of ['', '准备继续写下去', '第一行\n第二行']) {
    const f = fixture({ throwRange: true, inputTop: 450, inputHeight: 104, value, viewport: { height: 420, offsetTop: 0 } });
    assert.equal(keepReviewComposerInputVisible(f.scroller, f.input), true);
    assert.equal(f.scroller.scrollTop, 148);
    assert.equal(f.attached(), 0);
  }
});

test('SSR, missing owner document and zero-sized scrollports are safe no-ops', () => {
  assert.equal(keepReviewComposerInputVisible(null, null), false);
  assert.equal(keepReviewComposerInputVisible({ getBoundingClientRect() { throw new Error('must not measure'); } }, {}), false);
  const f = fixture(); f.scroller.getBoundingClientRect = () => ({ top: 100, bottom: 100, width: 390 });
  assert.equal(keepReviewComposerInputVisible(f.scroller, f.input), false);
  assert.equal(f.mirrors.length, 0);
});

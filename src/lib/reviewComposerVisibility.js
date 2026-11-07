const GAP = 14;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const pixels = value => Number.parseFloat(value) || 0;
const box = element => {
  const rect = element?.getBoundingClientRect?.();
  return rect && finite(rect.top) && finite(rect.bottom) && finite(rect.width)
    && rect.bottom > rect.top && rect.width > 0 ? rect : null;
};
const textStyles = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch',
  'fontKerning', 'fontFeatureSettings', 'fontVariationSettings', 'letterSpacing', 'lineHeight',
  'textAlign', 'textIndent', 'textTransform', 'textRendering', 'direction', 'unicodeBidi',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
  'wordSpacing', 'wordBreak', 'overflowWrap', 'wordWrap', 'whiteSpace', 'tabSize', 'hyphens'];

function textareaLine(input, rect, computed) {
  const document = input.ownerDocument;
  const parent = document?.body || document?.documentElement;
  if (!parent?.appendChild || !document.createElement || !document.createTextNode || !document.createRange) return null;
  let mirror;
  try {
    mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    for (const name of textStyles) if (computed[name]) mirror.style[name] = computed[name];
    Object.assign(mirror.style, { position: 'fixed', top: '0px', left: '-100000px', visibility: 'hidden',
      pointerEvents: 'none', display: 'block', boxSizing: 'border-box', margin: '0px',
      minWidth: '0px', maxWidth: 'none', height: 'auto', minHeight: '0px', maxHeight: 'none',
      overflow: 'visible', transform: 'none', whiteSpace: computed.whiteSpace || 'pre-wrap',
      overflowWrap: computed.overflowWrap || computed.wordWrap || 'break-word' });
    const borders = pixels(computed.borderLeftWidth) + pixels(computed.borderRightWidth);
    // clientWidth excludes a native textarea scrollbar, matching its text wrap.
    mirror.style.width = `${input.clientWidth > 0 ? input.clientWidth + borders : rect.width}px`;
    const value = typeof input.value === 'string' ? input.value : '';
    const text = document.createTextNode(`${value}\u200b`);
    mirror.appendChild(text); parent.appendChild(mirror);
    const selected = input.selectionDirection === 'backward' ? input.selectionStart : input.selectionEnd;
    const offset = Number.isInteger(selected) ? Math.max(0, Math.min(value.length, selected)) : value.length;
    const range = document.createRange();
    range.setStart(text, offset); range.setEnd(text, offset);
    let caret = [...(range.getClientRects?.() || [])].find(item => finite(item.top) && item.height > 0);
    if (!caret) {
      // Some WebKit versions omit collapsed ranges, especially after a newline.
      // The final zero-width character gives even an empty last line a rect.
      range.setEnd(text, offset + 1);
      caret = [...(range.getClientRects?.() || [])].find(item => finite(item.top) && item.height > 0);
    }
    const measured = mirror.getBoundingClientRect();
    if (!caret || !finite(measured.top) || !(measured.height > 0)) return null;
    const lineHeight = pixels(computed.lineHeight) || pixels(computed.fontSize) * 1.2 || 22;
    const height = Math.max(lineHeight, caret.height);
    const top = rect.top + caret.top - measured.top - (Number(input.scrollTop) || 0) - (height - caret.height) / 2;
    return { top, bottom: top + height, lineHeight, naturalHeight: measured.height };
  } catch {
    return null;
  } finally {
    if (mirror) {
      if (mirror.remove) mirror.remove();
      else mirror.parentNode?.removeChild?.(mirror);
    }
  }
}

/** Keep the active editing position inside its own scrollport. No focus changes,
 * global scrolling, persistent state, or DOM work survives this call. */
export function keepReviewComposerInputVisible(scroller, input, { contextElement } = {}) {
  try {
    if (!scroller || !input || input.ownerDocument?.activeElement !== input || !scroller.contains?.(input)) return false;
    const port = box(scroller), inputBox = box(input);
    if (!port || !inputBox) return false;
    const view = input.ownerDocument?.defaultView;
    const viewport = view?.visualViewport;
    let top = port.top, bottom = port.bottom;
    if (viewport && finite(viewport.height) && viewport.height > 0) {
      const offset = finite(viewport.offsetTop) ? viewport.offsetTop : 0;
      top = Math.max(top, offset); bottom = Math.min(bottom, offset + viewport.height);
    }
    if (bottom - top <= GAP * 2) return false;
    top += GAP; bottom -= GAP;
    const available = bottom - top;
    let target;
    if (contextElement && scroller.contains(contextElement) && contextElement.contains?.(input)) {
      const context = box(contextElement);
      if (context && context.bottom - context.top <= available) target = context;
    }
    if (!target) {
      let computed = {};
      try { computed = view?.getComputedStyle?.(input) || {}; } catch { /* Rect-only fallback. */ }
      const lineHeight = pixels(computed.lineHeight) || pixels(computed.fontSize) * 1.2 || 22;
      const firstLine = inputBox.top + pixels(computed.borderTopWidth) + pixels(computed.paddingTop);
      if (String(input.tagName).toLowerCase() === 'textarea') {
        const caret = textareaLine(input, inputBox, computed);
        if (caret) {
          if (caret.naturalHeight <= available) {
            const height = Math.min(available, inputBox.bottom - inputBox.top,
              Math.max(caret.naturalHeight, caret.lineHeight * 4));
            target = { top: inputBox.top, bottom: inputBox.top + height };
          } else target = caret;
        } else {
          // WebKit may not give an empty textarea a measurable Range. Still
          // reveal a useful writing area instead of leaving only one line.
          const fontSize = pixels(computed.fontSize) || 17;
          const textWidth = (input.clientWidth || inputBox.width) - pixels(computed.paddingLeft) - pixels(computed.paddingRight);
          const charactersPerLine = Math.max(1, Math.floor(textWidth / fontSize));
          const lines = String(input.value || '').split('\n').reduce((count, line) => count
            + Math.max(1, Math.ceil(Array.from(line).length / charactersPerLine)), 0);
          target = lines <= 4
            ? { top: inputBox.top, bottom: inputBox.top + Math.min(available, inputBox.bottom - inputBox.top,
              lineHeight * 4 + pixels(computed.paddingTop) + pixels(computed.paddingBottom)) }
            : { top: firstLine, bottom: Math.min(inputBox.bottom, firstLine + lineHeight) };
        }
      } else target = inputBox.bottom - inputBox.top <= available ? inputBox
        : { top: firstLine, bottom: Math.min(inputBox.bottom, firstLine + lineHeight) };
    }
    const delta = target.top < top ? target.top - top : target.bottom > bottom ? target.bottom - bottom : 0;
    if (Math.abs(delta) < 1) return false;
    const previous = Number(scroller.scrollTop) || 0;
    let next = Math.max(0, previous + delta);
    if (finite(scroller.scrollHeight) && finite(scroller.clientHeight) && scroller.clientHeight > 0) {
      next = Math.min(next, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
    }
    if (Math.abs(next - previous) < 1) return false;
    scroller.scrollTop = next;
    return scroller.scrollTop !== previous;
  } catch {
    return false;
  }
}

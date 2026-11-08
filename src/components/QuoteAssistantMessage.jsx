import React, { useState } from 'react';
import './QuoteAssistantMessage.css';

const MAX_SOURCE_TITLE = 64;

/** Only ordinary web destinations are clickable. HTML and Markdown never enter
 * an HTML parser, and links cannot create a custom-scheme navigation. */
export function safeQuoteAssistantLink(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const candidate = value.trim();
  if (!/^https?:\/\//i.test(candidate)) return null;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function markerEnd(text, marker, start) {
  let index = text.indexOf(marker, start);
  while (index >= 0) {
    let escapes = 0;
    for (let back = index - 1; back >= 0 && text[back] === '\\'; back--) escapes++;
    if (escapes % 2 === 0) return index;
    index = text.indexOf(marker, index + marker.length);
  }
  return -1;
}

function linkEnd(text, start) {
  let level = 1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '(') level++;
    else if (text[i] === ')') { level--; if (level === 0) return i; }
  }
  return -1;
}

// Preserve arithmetic/code-like exponent operators. Stray emphasis delimiters
// in assistant prose are formatting noise, not content for the reader.
const exponentAt = (text, index) => /[A-Za-z0-9_)\]]/.test(text[index - 1] || '') && /[A-Za-z0-9_(]/.test(text[index + 2] || '');

function inline(text, depth = 0, allowLinks = true) {
  if (depth > 4) return text.replace(/\*\*/g, (marker, index) => exponentAt(text, index) ? marker : '');
  const nodes = []; let plain = '', i = 0;
  const flush = () => { if (plain) { nodes.push(plain); plain = ''; } };
  while (i < text.length) {
    if (text[i] === '\\' && /[\\`*_[\]()]/.test(text[i + 1] || '')) { plain += text[i + 1]; i += 2; continue; }
    if (text[i] === '\n') { flush(); nodes.push(<br key={`break-${i}`}/>); i++; continue; }
    if (text[i] === '`') {
      const end = markerEnd(text, '`', i + 1);
      if (end > i + 1) { flush(); nodes.push(<code key={`code-${i}`}>{text.slice(i + 1, end)}</code>); i = end + 1; continue; }
    }
    if (text.startsWith('**', i) && exponentAt(text, i)) { plain += '**'; i += 2; continue; }
    const bold = text.startsWith('**', i) ? '**' : text.startsWith('__', i) ? '__' : null;
    if (bold) {
      const end = markerEnd(text, bold, i + 2);
      if (end > i + 2) { flush(); nodes.push(<strong key={`strong-${i}`}>{inline(text.slice(i + 2, end), depth + 1, allowLinks)}</strong>); i = end + 2; continue; }
      if (bold === '**') { i += 2; continue; }
    }
    if (text[i] === '[' && allowLinks && text[i - 1] !== '!') {
      const labelEnd = markerEnd(text, ']', i + 1);
      if (labelEnd > i + 1 && text[labelEnd + 1] === '(') {
        const end = linkEnd(text, labelEnd + 2);
        if (end !== -1) {
          const href = safeQuoteAssistantLink(text.slice(labelEnd + 2, end).replace(/\\([()])/g, '$1'));
          flush(); const label = inline(text.slice(i + 1, labelEnd), depth + 1, false);
          nodes.push(href ? <a key={`link-${i}`} href={href} target="_blank" rel="noopener noreferrer">{label}</a> : <React.Fragment key={`text-${i}`}>{label}</React.Fragment>);
          i = end + 1; continue;
        }
      }
    }
    plain += text[i++];
  }
  flush(); return nodes;
}

function blocks(value) {
  const lines = value.replace(/\r\n?/g, '\n').split('\n').map(line => /^\s*\*{2,}\s*$/.test(line) ? '' : line), result = [];
  const listLine = line => /^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/.exec(line);
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    const start = i, heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(lines[i]);
    if (heading) { result.push(<p className="qa-markdown-heading" key={`heading-${i}`}><strong>{inline(heading[1])}</strong></p>); i++; continue; }
    const match = listLine(lines[i]);
    if (match) {
      const ordered = /^\d/.test(match[1]), items = [];
      while (i < lines.length) {
        const item = listLine(lines[i]);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        let body = item[2]; const itemStart = i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !listLine(lines[i])) body += `\n${lines[i++].trim()}`;
        items.push(<li key={itemStart}>{inline(body)}</li>);
      }
      result.push(ordered ? <ol key={`list-${start}`} start={Number.parseInt(match[1], 10) || 1}>{items}</ol> : <ul key={`list-${start}`}>{items}</ul>);
      continue;
    }
    const paragraph = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !listLine(lines[i]) && !/^\s{0,3}#{1,6}\s+/.test(lines[i])) paragraph.push(lines[i++]);
    result.push(<p key={`paragraph-${start}`}>{inline(paragraph.join('\n'))}</p>);
  }
  return result;
}

export default function QuoteAssistantMessage({ text = '', className = '' }) {
  return <div className={`qa-markdown${className ? ` ${className}` : ''}`}>{blocks(typeof text === 'string' ? text : '')}</div>;
}

export function quoteAssistantSourceTitle(source, index = 0, language = 'zh') {
  const fallback = String(language).startsWith('en') ? `Source ${index + 1}` : `来源 ${index + 1}`;
  const candidate = [source?.title, source?.label, source?.date].find(value => typeof value === 'string' && value.trim()) || fallback;
  const clean = candidate.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*_#]/g, '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(clean || fallback);
  return chars.length > MAX_SOURCE_TITLE ? `${chars.slice(0, MAX_SOURCE_TITLE - 1).join('')}…` : chars.join('');
}

/** No full source body is rendered until the user opens the disclosure. Even
 * then only short titles are shown; navigation retains the original source. */
export function QuoteAssistantSources({ sources, onOpenPost, language = 'zh', label }) {
  const [open, setOpen] = useState(false);
  const rows = Array.isArray(sources) ? sources.filter(source => source && typeof source === 'object' && !Array.isArray(source)) : [];
  if (!rows.length) return null;
  const en = String(language).startsWith('en');
  return <div className="qa-source-disclosure">
    <button type="button" className="qa-source-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>{typeof label === 'string' && label.trim() ? label : en ? 'Related public materials' : '相关公开资料'} · {rows.length}<span aria-hidden="true">{open ? '⌃' : '⌄'}</span></button>
    {open && <ul className="qa-source-list">{rows.map((source, index) => {
      const title = quoteAssistantSourceTitle(source, index, language), href = safeQuoteAssistantLink(source.url);
      const content = <><span className="qa-source-title">{title}</span>{typeof source.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(source.date) && <span className="qa-source-date">{source.date}</span>}</>;
      return <li key={`${source.postId || source.url || 'source'}:${index}`} className="qa-source-item">{typeof source.postId === 'string' && source.postId && typeof onOpenPost === 'function'
        ? <button type="button" onClick={() => onOpenPost(source.postId, source)}>{content}</button>
        : href ? <a href={href} target="_blank" rel="noopener noreferrer">{content}</a> : <span>{content}</span>}</li>;
    })}</ul>}
  </div>;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSecExhibitUrl, extractExhibit991Url } from '../server/earnings/secOfficialParsers.js';

const filingUrl = 'https://www.sec.gov/Archives/edgar/data/1973239/000197323926000113/0001973239-26-000113-index.html';
const expected = 'https://www.sec.gov/Archives/edgar/data/1973239/000197323926000113/ex992.htm';
const row = (type = 'EX-99.2', href = 'ex992.htm', description = 'Shareholder letter') =>
  `<tr><td>3</td><td>${description}</td><td><a href="${href}">${href}</a></td><td>${type}</td><td>123</td></tr>`;
const select = html => extractSecExhibitUrl(`<table>${html}</table>`, filingUrl, 'EX-99.2');

test('SEC exhibit selection uses an exact Type cell, not a description referencing another exhibit', () => {
  const wrong = row('EX-99.1', 'ex991.htm', 'Announcement referencing EX-99.2');
  assert.equal(select(wrong + row()), expected);
  assert.equal(select(wrong), null);
});

test('exhibit-looking filenames, prose, or neighboring type numbers cannot establish a match', () => {
  for (const html of [
    row('EX-99.1', 'EX-99.2.htm', 'Release'),
    row('EX-99.20', 'ex9920.htm', 'EX-99.2 shareholder letter'),
    row('EX-99.21', 'ex9921.htm', 'EX-99.2'),
    row('8-K', 'ex992.htm', 'Attachment EX-99.2'),
    row('8-K', 'primary.htm', 'EX-99.2'),
    '<tr><td>Release EX-99.2</td><td><a href="ex992.htm">letter</a></td></tr>',
  ]) assert.equal(select(html), null);
});

test('type cell whitespace, inline styling and case normalize without loosening exact identity', () => {
  assert.equal(select(row('&nbsp;<span>ex-99.2</span>&nbsp;')), expected);
  assert.equal(select(row('EX-99.2 amended')), null);
  assert.equal(select(row('EX-99.2 / EX-99.1')), null);
});

test('multiple exact matching type rows with different document URLs fail closed', () => {
  assert.equal(select(row() + row('EX-99.2', 'different.htm')), null);
  assert.equal(select(row() + row()), expected, 'identical links do not invent a second candidate');
});

test('multiple usable document links in one exact type row are also ambiguous', () => {
  assert.equal(select(row().replace('</td><td>EX-99.2', '<a href="different.htm">other</a></td><td>EX-99.2')), null);
});

test('conflicting exact type cells cannot mislabel an attachment', () => {
  assert.equal(select(row('EX-99.1', 'ex991.htm', 'EX-99.2')), null);
  assert.equal(select(row('EX-99.1', 'ex991.htm', 'EX-99.2') + row()), expected);
  assert.equal(select(row('EX-99.2', 'ex992.htm', 'EX-99.1')), expected, 'the real Type column overrides a description that happens to name another exhibit');
});

test('invalid and non-SEC links are ignored without replacing a unique valid document', () => {
  for (const href of ['https://evil.test/ex992.htm', 'javascript:alert(1)', 'not-a-document.pdf', 'https://www.sec.gov/other/ex992.htm']) {
    assert.equal(select(row('EX-99.2', href)), null);
    assert.equal(select(row('EX-99.2', href) + row()), expected);
  }
});

test('existing compact two-column SEC fixtures and EX-99.1 wrapper stay compatible', () => {
  assert.equal(select('<tr><td>EX-99.2</td><td><a href="ex992.htm">release</a></td></tr>'), expected);
  assert.equal(extractExhibit991Url(`<table>${row('EX-99.1', 'ex991.htm')}</table>`, filingUrl), expected.replace('ex992.htm', 'ex991.htm'));
  for (const type of ['', 'PRIMARY', 'EX-99.200', 'EX-99.2 extra']) assert.equal(extractSecExhibitUrl(row(), filingUrl, type), null);
});

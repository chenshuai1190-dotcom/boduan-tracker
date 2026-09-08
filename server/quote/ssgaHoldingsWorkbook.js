import { inflateRawSync } from 'node:zlib';

const MAX_ZIP_BYTES = 2_000_000;
const MAX_XML_BYTES = 2_000_000;
const MAX_EXPANDED_BYTES = 6_000_000;
const MAX_ENTRIES = 64;

function invalid() { throw new Error('SSGA holdings workbook invalid'); }

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Deliberately supports only bounded, single-disk, non-encrypted ZIP/OOXML.
// Never writes entries to disk, executes workbook content, or follows links.
function unzip(input) {
  const data = Buffer.from(input);
  if (data.length < 22 || data.length > MAX_ZIP_BYTES) invalid();
  let end = data.length - 22;
  const minimum = Math.max(0, data.length - 65557);
  while (end >= minimum && data.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < minimum || end + 22 + data.readUInt16LE(end + 20) !== data.length
    || data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6)) invalid();
  const count = data.readUInt16LE(end + 10);
  if (!count || count > MAX_ENTRIES || data.readUInt16LE(end + 8) !== count) invalid();
  let cursor = data.readUInt32LE(end + 16);
  if (cursor + data.readUInt32LE(end + 12) !== end) invalid();
  const files = new Map();
  let expanded = 0;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > end || data.readUInt32LE(cursor) !== 0x02014b50) invalid();
    const flags = data.readUInt16LE(cursor + 8);
    const method = data.readUInt16LE(cursor + 10);
    const crc = data.readUInt32LE(cursor + 16);
    const compressedSize = data.readUInt32LE(cursor + 20);
    const size = data.readUInt32LE(cursor + 24);
    const nameLength = data.readUInt16LE(cursor + 28);
    const extraLength = data.readUInt16LE(cursor + 30);
    const commentLength = data.readUInt16LE(cursor + 32);
    const offset = data.readUInt32LE(cursor + 42);
    if ((flags & 1) || ![0, 8].includes(method) || size > MAX_XML_BYTES
      || data.readUInt16LE(cursor + 34) || cursor + 46 + nameLength + extraLength + commentLength > end) invalid();
    const name = data.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (!name || /\\|(^|\/)\.\.(\/|$)|^\/|\0/.test(name) || files.has(name)
      || /vba|macro|activeX|embeddings|externalLinks/i.test(name)) invalid();
    expanded += size;
    if (expanded > MAX_EXPANDED_BYTES || offset + 30 > data.readUInt32LE(end + 16)
      || data.readUInt32LE(offset) !== 0x04034b50
      || data.readUInt16LE(offset + 6) !== flags || data.readUInt16LE(offset + 8) !== method) invalid();
    const localNameLength = data.readUInt16LE(offset + 26);
    const localExtraLength = data.readUInt16LE(offset + 28);
    const start = offset + 30 + localNameLength + localExtraLength;
    if (data.subarray(offset + 30, offset + 30 + localNameLength).toString('utf8') !== name
      || start + compressedSize > data.readUInt32LE(end + 16)) invalid();
    const compressed = data.subarray(start, start + compressedSize);
    const bytes = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: Math.max(size, 1) });
    if (bytes.length !== size || crc32(bytes) !== crc) invalid();
    files.set(name, bytes);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== end) invalid();
  return files;
}

function decode(value) {
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(value)) invalid();
  const result = value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, entity => {
    const simple = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (simple[entity]) return simple[entity];
    const code = entity.startsWith('&#x') ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
    if (!Number.isInteger(code) || code < 32 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) invalid();
    return String.fromCodePoint(code);
  });
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) invalid();
  return result;
}

// A strict XML subset parser for issuer-generated workbook data; no entities,
// DTD, instructions, comments, external relationships, or formulas evaluated.
function xml(bytes) {
  if (!bytes) invalid();
  let source = bytes.toString('utf8').replace(/^\uFEFF/, '').replace(/^<\?xml[^?]*\?>\s*/, '');
  if (source.includes('\ufffd') || /<!|<\?/.test(source.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, ''))) invalid();
  const root = { name: '#root', children: [], text: '', attributes: {} };
  const stack = [root];
  let consumed = 0;
  let nodes = 0;
  for (const match of source.matchAll(/<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>|[^<]+/g)) {
    if (match.index !== consumed) invalid();
    const token = match[0];
    consumed += token.length;
    if (token.startsWith('<![CDATA[')) { stack.at(-1).text += token.slice(9, -3); continue; }
    if (!token.startsWith('<')) { stack.at(-1).text += decode(token); continue; }
    if (token.startsWith('</')) {
      if (!/^<\/[\w:.-]+\s*>$/.test(token) || stack.length < 2
        || stack.pop().qualifiedName !== token.slice(2, -1).trim()) invalid();
      continue;
    }
    const start = token.match(/^<([\w:.-]+)([\s\S]*?)(\/?)>$/);
    if (!start || ++nodes > 30000 || stack.length > 32) invalid();
    const [, qualifiedName, attrText, selfClosing] = start;
    const attributes = {};
    let remaining = attrText;
    while (remaining.trim()) {
      const attr = remaining.match(/^\s+([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/);
      if (!attr || Object.hasOwn(attributes, attr[1])) invalid();
      attributes[attr[1]] = decode(attr[2] ?? attr[3]);
      remaining = remaining.slice(attr[0].length);
    }
    const node = { name: qualifiedName.split(':').at(-1), qualifiedName, attributes, children: [], text: '' };
    if (node.name === 'f') invalid();
    stack.at(-1).children.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (consumed !== source.length || stack.length !== 1 || root.children.length !== 1 || root.text.trim()) invalid();
  return root.children[0];
}

function children(node, name) { return node?.children.filter(child => child.name === name) || []; }
function one(node, name) { const list = children(node, name); if (list.length !== 1) invalid(); return list[0]; }
function textNodes(node) { return node.name === 't' ? node.text : node.children.map(textNodes).join(''); }

export function parseSsgaHoldingsWorkbook(input) {
  const files = unzip(input);
  const types = files.get('[Content_Types].xml')?.toString('utf8') || '';
  if (/macroEnabled|vbaProject/i.test(types)) invalid();
  const workbook = xml(files.get('xl/workbook.xml'));
  if (workbook.name !== 'workbook') invalid();
  const sheet = one(one(workbook, 'sheets'), 'sheet');
  if (sheet.attributes.name !== 'holdings') invalid();
  const relations = xml(files.get('xl/_rels/workbook.xml.rels'));
  const links = children(relations, 'Relationship').filter(row => row.attributes.Id === sheet.attributes['r:id']);
  if (links.length !== 1 || links[0].attributes.TargetMode === 'External'
    || !/\/worksheet$/.test(links[0].attributes.Type || '')) invalid();
  const target = links[0].attributes.Target.replace(/^\/?xl\//, '');
  if (!/^worksheets\/sheet\d+\.xml$/.test(target)) invalid();
  const sharedRoot = xml(files.get('xl/sharedStrings.xml'));
  if (sharedRoot.name !== 'sst') invalid();
  const shared = children(sharedRoot, 'si').map(textNodes);
  const worksheet = xml(files.get(`xl/${target}`));
  if (worksheet.name !== 'worksheet') invalid();
  const rows = new Map();
  for (const row of children(one(worksheet, 'sheetData'), 'row')) {
    const rowIndex = Number(row.attributes.r);
    if (!Number.isInteger(rowIndex) || rowIndex < 1 || rowIndex > 2000 || rows.has(rowIndex)) invalid();
    const cells = {};
    for (const cell of children(row, 'c')) {
      const ref = cell.attributes.r?.match(/^([A-Z]{1,2})(\d+)$/);
      if (!ref || Number(ref[2]) !== rowIndex || Object.hasOwn(cells, ref[1])) invalid();
      const values = children(cell, 'v');
      const inline = children(cell, 'is');
      if (values.length > 1 || inline.length > 1 || (values.length && inline.length)) invalid();
      let value = null;
      if (cell.attributes.t === 's') {
        if (values.length !== 1 || !/^\d+$/.test(values[0].text)) invalid();
        value = shared[Number(values[0].text)];
        if (value === undefined) invalid();
      } else if (cell.attributes.t === 'inlineStr') {
        if (inline.length !== 1) invalid();
        value = textNodes(inline[0]);
      } else if (['n', undefined].includes(cell.attributes.t)) {
        if (values.length) {
          if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(values[0].text)) invalid();
          value = Number(values[0].text);
          if (!Number.isFinite(value)) invalid();
        }
      } else invalid();
      cells[ref[1]] = value;
    }
    rows.set(rowIndex, cells);
  }
  if (rows.get(1)?.A !== 'Fund Name:' || rows.get(2)?.A !== 'Ticker Symbol:'
    || rows.get(2)?.B !== 'SPY' || rows.get(3)?.A !== 'Holdings:'
    || !/^State Street.*SPDR.*S&P 500.*ETF Trust$/.test(rows.get(1)?.B || '')) invalid();
  const date = String(rows.get(3)?.B || '').match(/^As of (\d{2})-([A-Za-z]{3})-(\d{4})$/);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (!date || !months.includes(date[2])) invalid();
  const asOfDate = `${date[3]}-${String(months.indexOf(date[2]) + 1).padStart(2, '0')}-${date[1]}`;
  const parsedDate = new Date(`${asOfDate}T00:00:00Z`);
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== asOfDate) invalid();
  const expectedHeaders = ['Name', 'Ticker', 'Identifier', 'SEDOL', 'Weight', 'Sector', 'Shares Held', 'Local Currency'];
  if (expectedHeaders.some((value, index) => rows.get(5)?.[String.fromCharCode(65 + index)] !== value)) invalid();
  const holdings = [];
  let ended = false;
  for (let row = 6; row <= Math.max(...rows.keys()); row += 1) {
    const cells = rows.get(row);
    if (!cells || Object.values(cells).every(value => value === null)) { ended = true; continue; }
    if (ended) {
      if (typeof cells.E === 'number') invalid();
      continue;
    }
    if (typeof cells.A !== 'string' || typeof cells.B !== 'string' || typeof cells.E !== 'number'
      || typeof cells.H !== 'string' || !Number.isFinite(cells.E)) invalid();
    holdings.push({ name: cells.A, symbol: cells.B, identifier: cells.C, weightPct: cells.E, currency: cells.H });
  }
  if (holdings.length < 450 || holdings.length > 600) invalid();
  return { fundName: rows.get(1).B, asOfDate, holdings };
}

import { providerFetch, QUOTE_TIMEOUTS } from './http.js';

export const CBOE_HISTORY_URLS = Object.freeze({
  VIX: 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv',
  VIX3M: 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX3M_History.csv',
});
export const VIX_HISTORY_MAX_BYTES = 2 * 1024 * 1024;

export function validVixDateKey(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

export function positiveVixNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function parseCboeHistoryCsv(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > VIX_HISTORY_MAX_BYTES) {
    throw new Error('Cboe history response invalid');
  }
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.shift()?.trim() !== 'DATE,OPEN,HIGH,LOW,CLOSE') throw new Error('Cboe history header invalid');
  const rows = new Map();
  const rejected = new Set();
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = line.split(',').map((value) => value.trim());
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cells[0]);
    const date = match ? validVixDateKey(`${match[3]}-${match[1]}-${match[2]}`) : '';
    if (!date || rejected.has(date)) continue;
    const numbers = cells.slice(1).map(positiveVixNumber);
    if (cells.length !== 5 || numbers.some((value) => value === null)) {
      rejected.add(date); rows.delete(date); continue;
    }
    const previous = rows.get(date);
    if (previous && previous.values.some((value, index) => value !== numbers[index])) {
      rejected.add(date); rows.delete(date); continue;
    }
    rows.set(date, { date, close: numbers[3], values: numbers });
  }
  const result = [...rows.values()].map(({ date, close }) => ({ date, close }));
  if (!result.length) throw new Error('Cboe history has no valid closes');
  return result;
}

async function boundedResponseText(response, maxBytes) {
  const length = response.headers?.get?.('content-length');
  if (length && Number(length) > maxBytes) throw new Error('VIX history response too large');
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    let bytes = 0;
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) throw new Error('VIX history response too large');
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks, bytes).toString('utf8');
    } catch (error) {
      // Do not wait for an unresponsive provider to acknowledge cancellation.
      Promise.resolve(reader.cancel()).catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
  }
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('VIX history response too large');
  return text;
}

// Keep body consumption inside the provider timeout, not just response headers.
export function fetchVixHistoryText(url, { fetchImpl, provider, maxBytes = VIX_HISTORY_MAX_BYTES, timeoutMs = QUOTE_TIMEOUTS.eodhd }) {
  return providerFetch(url, {}, {
    provider,
    timeoutMs,
    fetchImpl: async (input, options) => {
      const response = await fetchImpl(input, options);
      if (!response.ok) throw new Error('VIX history provider unavailable');
      return boundedResponseText(response, maxBytes);
    },
  });
}

export async function fetchCboeHistory(symbol, { fetchImpl }) {
  if (!Object.hasOwn(CBOE_HISTORY_URLS, symbol)) throw new Error('Cboe symbol invalid');
  const text = await fetchVixHistoryText(CBOE_HISTORY_URLS[symbol], { fetchImpl, provider: 'cboe:vix-comparison' });
  return parseCboeHistoryCsv(text);
}

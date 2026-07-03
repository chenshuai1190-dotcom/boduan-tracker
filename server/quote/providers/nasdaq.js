import { providerFetch, QUOTE_TIMEOUTS } from '../http.js';

export async function fetchCalendarQuote(symbol, { eodhdKey }) {
  try {
    const watchSymbols = symbol.includes(':') ? symbol.split(':')[1].split('|') : [];

    const today = new Date();
    const fromDate = today.toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    const toDate = to.toISOString().slice(0, 10);

    const events = [];
    if (watchSymbols.length > 0) {
      const watchSet = new Set(watchSymbols);
      const dates = [];
      for (let i = 0; i < 30; i++) {
        const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
        dates.push(d.toISOString().slice(0, 10));
      }

      const dailyResults = await Promise.all(dates.map(async (d) => {
        try {
          const url = `https://api.nasdaq.com/api/calendar/earnings?date=${d}`;
          const r = await providerFetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json',
              'Origin': 'https://www.nasdaq.com',
              'Referer': 'https://www.nasdaq.com/',
            },
          }, { provider: 'nasdaq:earnings-calendar', timeoutMs: QUOTE_TIMEOUTS.nasdaq });
          if (!r.ok) return { date: d, rows: [] };
          const json = await r.json();
          const rows = json?.data?.rows || [];
          return { date: d, rows };
        } catch (e) {
          return { date: d, rows: [] };
        }
      }));

      for (const { date, rows } of dailyResults) {
        for (const row of rows) {
          const sym = row.symbol;
          if (watchSet.has(sym)) {
            events.push({
              type: 'earnings',
              date,
              time: row.time || 'time-not-supplied',
              symbol: sym,
              name: row.name,
              epsEstimate: row.epsForecast || null,
              epsActual: row.eps || null,
              marketCap: row.marketCap || null,
              fiscalQuarterEnding: row.fiscalQuarterEnding || null,
              noOfEsts: row.noOfEsts || null,
              lastYearEPS: row.lastYearEPS || null,
              lastYearRptDt: row.lastYearRptDt || null,
            });
          }
        }
      }
    }

    try {
      const econUrl = `https://eodhd.com/api/economic-events?api_token=${eodhdKey}&country=US&from=${fromDate}&to=${toDate}&fmt=json`;
      const r = await providerFetch(econUrl, {}, { provider: 'eodhd:economic-calendar', timeoutMs: QUOTE_TIMEOUTS.eodhd });
      if (r.ok) {
        const econData = await r.json();
        if (Array.isArray(econData)) {
          const fomcKeywords = ['fed interest rate', 'fomc', 'federal funds', 'fomc statement'];
          const cpiKeywords = ['cpi', 'consumer price index', 'core cpi', 'inflation rate'];
          const nonfarmKeywords = ['nonfarm', 'non-farm', 'non farm payroll', 'unemployment rate', 'employment rate'];

          for (const e of econData) {
            const eventName = (e.event || '').toLowerCase();
            let econType = null;
            if (fomcKeywords.some(k => eventName.includes(k))) econType = 'fomc';
            else if (cpiKeywords.some(k => eventName.includes(k))) econType = 'cpi';
            else if (nonfarmKeywords.some(k => eventName.includes(k))) econType = 'nonfarm';
            if (!econType) continue;

            events.push({
              type: econType,
              date: e.date ? e.date.slice(0, 10) : '',
              time: e.date ? e.date.slice(11, 16) + ' UTC' : '',
              title: e.event,
              country: e.country || 'US',
              actual: e.actual,
              estimate: e.estimate,
              previous: e.previous,
              change: e.change,
              changePercentage: e.change_percentage,
            });
          }
        }
      }
    } catch (e) {
      console.warn('[Calendar] EODHD Economic Events 失败:', e.message);
    }

    events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    return {
      symbol,
      events,
      fetchedAt: new Date().toISOString(),
      source: 'NASDAQ + FOMC',
      _apiVersion: 'fix34cal',
    };
  } catch (e) {
    return { symbol, error: `日历请求失败: ${e.message}` };
  }
}

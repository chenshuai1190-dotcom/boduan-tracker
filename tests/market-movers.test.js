import test from 'node:test';
import assert from 'node:assert/strict';

import quoteHandler from '../api/quote.js';
import {
  createCommonStockUniverse,
  fetchMarketMovers,
  MARKET_MOVERS_CONFIG,
  resetMarketMoversCacheForTests,
} from '../server/quote/marketMovers.js';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function textResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body;
    },
  };
}

function nasdaqListedText(rows = []) {
  const paddedRows = [...rows];
  let eligibleCount = paddedRows.filter(
    row => (row.testIssue || 'N') === 'N' && (row.etf || 'N') === 'N' && (row.nextShares || 'N') === 'N'
  ).length;
  for (let index = 0; eligibleCount < 1100; index += 1, eligibleCount += 1) {
    paddedRows.push({ symbol: `ZZN${String(index).padStart(4, '0')}` });
  }
  return [
    'Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares',
    ...paddedRows.map(row => [
      row.symbol,
      row.name || `${row.symbol} Holdings Inc. - Common Stock`,
      row.marketCategory || 'Q',
      row.testIssue || 'N',
      row.financialStatus || 'N',
      '100',
      row.etf || 'N',
      row.nextShares || 'N',
    ].join('|')),
    'File Creation Time: 0713202603:02|||||||',
    '',
  ].join('\n');
}

function otherListedText(rows = [], { includeNyse = true, includeNyseAmerican = true } = {}) {
  const paddedRows = [...rows];
  let nyseCount = paddedRows.filter(
    row => (row.exchange || 'N') === 'N' && (row.testIssue || 'N') === 'N' && (row.etf || 'N') === 'N'
  ).length;
  for (let index = 0; includeNyse && nyseCount < 1100; index += 1, nyseCount += 1) {
    paddedRows.push({ symbol: `ZZNYS${String(index).padStart(4, '0')}`, exchange: 'N' });
  }
  let americanCount = paddedRows.filter(
    row => row.exchange === 'A' && (row.testIssue || 'N') === 'N' && (row.etf || 'N') === 'N'
  ).length;
  for (let index = 0; includeNyseAmerican && americanCount < 150; index += 1, americanCount += 1) {
    paddedRows.push({ symbol: `ZZAMS${String(index).padStart(4, '0')}`, exchange: 'A' });
  }
  return [
    'ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol',
    ...paddedRows.map(row => [
      row.actSymbol || row.symbol,
      row.name || `${row.symbol} Holdings Inc. Common Stock`,
      row.exchange || 'N',
      row.cqsSymbol || row.actSymbol || row.symbol,
      row.etf || 'N',
      '100',
      row.testIssue || 'N',
      row.nasdaqSymbol || row.symbol,
    ].join('|')),
    'File Creation Time: 0713202603:02||||||',
    '',
  ].join('\n');
}

function symbolRow(Code, overrides = {}) {
  return {
    Code,
    Name: `${Code} Holdings Inc.`,
    Exchange: 'NASDAQ',
    Type: 'Common Stock',
    Currency: 'USD',
    ...overrides,
  };
}

function moverRow(code, changePercent, overrides = {}) {
  return {
    code,
    name: `${code} Holdings Inc.`,
    adjusted_close: 25 + Math.abs(changePercent),
    refund_1d_p: changePercent,
    refund_1d: changePercent / 10,
    avgvol_1d: 123_456,
    market_capitalization: 500_000_000,
    currency_symbol: '$',
    last_day_data_date: '2026-07-10',
    ...overrides,
  };
}

function buildProviderFixture() {
  const gainers = Array.from({ length: 35 }, (_, index) => {
    const symbol = `G${String(index + 1).padStart(3, '0')}`;
    return moverRow(symbol, 60 - index, index === 0
      ? { refund_1d: null, avgvol_1d: null, market_capitalization: '' }
      : {});
  });
  const losers = Array.from({ length: 35 }, (_, index) => {
    const symbol = `L${String(index + 1).padStart(3, '0')}`;
    return moverRow(symbol, -60 + index);
  });
  const symbols = [
    ...gainers.map(row => symbolRow(row.code)),
    ...losers.map(row => symbolRow(row.code, { Exchange: 'NYSE' })),
    symbolRow('OLDG'),
    symbolRow('OLDL'),
    symbolRow('WRNG'),
    symbolRow('AACBR', { Name: 'Example Acquisition Corp Rights' }),
    symbolRow('VECA-RI', { Name: 'Vernal Capital Acquisition Corp' }),
    symbolRow('CEROW'),
    symbolRow('UNITU', { Name: 'Example Acquisition Units' }),
    symbolRow('PREF1', { Name: 'Example Corp 6.5% Preferred Stock Series A' }),
    symbolRow('FTAIN', { Name: 'Fortress Transportation and Preferred Series C' }),
    symbolRow('ECCC', { Name: 'Eagle Point Credit Company Inc Preferred' }),
    symbolRow('SOHOB', { Name: 'Sotherly Hotels Inc Series B Pref' }),
    symbolRow('MCHPP', { Name: 'Microchip Technology Incorporated' }),
    symbolRow('ABCDT', { Name: 'Example Acquisition Corp' }),
    symbolRow('BIOCQ', { Name: 'Biocept Inc.' }),
    symbolRow('MSPR', { Name: 'MSP Recovery Inc.' }),
    symbolRow('BLMZF', { Name: 'Harrison Global Holdings Inc.' }),
    symbolRow('SCCC', { Name: 'Sachem Capital Corp. 7.75% Note' }),
    symbolRow('TEST-PA', { Name: 'Example Financial Corp Series A' }),
    symbolRow('TESTX'),
    symbolRow('NEXT'),
    symbolRow('OTCX', { Exchange: 'OTCQX' }),
    symbolRow('ETF1', { Type: 'ETF' }),
  ];
  const nasdaqRows = [
    ...gainers.map(row => ({ symbol: row.code })),
    ...symbols
      .filter(row => row.Exchange === 'NASDAQ')
      .filter(row => !['MSPR', 'BLMZF'].includes(row.Code))
      .map(row => ({
        symbol: row.Code,
        name: row.Name,
        etf: row.Code === 'ETF1' ? 'Y' : 'N',
        testIssue: row.Code === 'TESTX' ? 'Y' : 'N',
        nextShares: row.Code === 'NEXT' ? 'Y' : 'N',
      })),
  ];
  const otherRows = losers.map(row => ({ symbol: row.code, exchange: 'N' }));

  const calls = [];
  const fetchImpl = async (input) => {
    const url = input instanceof URL ? input : new URL(String(input));
    calls.push(url);
    if (url.pathname.includes('/exchange-symbol-list/')) {
      const exchange = url.pathname.split('/').at(-1);
      const accepted = exchange === 'AMEX'
        ? new Set(['AMEX', 'NYSE MKT', 'NYSE AMERICAN'])
        : new Set([exchange]);
      return jsonResponse(symbols.filter(row => accepted.has(row.Exchange)));
    }
    if (url.pathname.endsWith('/nasdaqlisted.txt')) {
      return textResponse(nasdaqListedText(nasdaqRows));
    }
    if (url.pathname.endsWith('/otherlisted.txt')) {
      return textResponse(otherListedText(otherRows));
    }
    if (url.pathname.endsWith('/eod/SPY.US')) {
      return jsonResponse([{ date: '2026-07-09' }, { date: '2026-07-10' }]);
    }
    if (url.pathname.endsWith('/screener')) {
      const descending = url.searchParams.get('sort') === 'refund_1d_p.desc';
      const invalid = descending
        ? [
            moverRow('AACBR', 900),
            moverRow('VECA-RI', 850),
            moverRow('CEROW', 800),
            moverRow('UNITU', 700),
            moverRow('PREF1', 650),
            moverRow('FTAIN', 640),
            moverRow('ECCC', 635),
            moverRow('SOHOB', 630),
            moverRow('MCHPP', 627),
            moverRow('ABCDT', 626),
            moverRow('BIOCQ', 625.75),
            moverRow('MSPR', 625.7),
            moverRow('BLMZF', 625.6),
            moverRow('SCCC', 625.5),
            moverRow('TEST-PA', 625),
            moverRow('OLDG', 600, { last_day_data_date: '2026-07-09' }),
            moverRow('WRNG', -1),
          ]
        : [
            moverRow('AACBR', -99),
            moverRow('VECA-RI', -98.5),
            moverRow('CEROW', -98),
            moverRow('UNITU', -97),
            moverRow('PREF1', -96.75),
            moverRow('FTAIN', -96.7),
            moverRow('ECCC', -96.65),
            moverRow('SOHOB', -96.6),
            moverRow('MCHPP', -96.55),
            moverRow('ABCDT', -96.525),
            moverRow('BIOCQ', -96.515),
            moverRow('MSPR', -96.514),
            moverRow('BLMZF', -96.513),
            moverRow('SCCC', -96.51),
            moverRow('TEST-PA', -96.5),
            moverRow('OLDL', -96, { last_day_data_date: '2026-07-09' }),
            moverRow('WRNG', 1),
          ];
      const validRows = descending ? gainers : losers;
      return jsonResponse({ data: [...invalid, ...[...validRows].reverse()] });
    }
    throw new Error(`unexpected provider path ${url.pathname}`);
  };
  return { calls, fetchImpl };
}

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

test('common-stock universe strictly whitelists venues and removes non-stock instruments', () => {
  const eodhdRows = [
    symbolRow('AAPL'),
    symbolRow('IBM', { Exchange: 'NYSE' }),
    symbolRow('BBAI', { Exchange: 'AMEX' }),
    symbolRow('KULR', { Exchange: 'NYSE MKT' }),
    symbolRow('AACBR', { Name: 'Ares Acquisition Corporation II Rights' }),
    symbolRow('VECA-RI', { Name: 'Vernal Capital Acquisition Corp' }),
    symbolRow('VECA.RT', { Name: 'Vernal Capital Acquisition Corp' }),
    symbolRow('VECA/R', { Name: 'Vernal Capital Acquisition Corp' }),
    symbolRow('CEROW'),
    symbolRow('SPACU', { Name: 'Example Acquisition Units' }),
    symbolRow('BANK-PA', { Name: 'Example Bancorp Series A' }),
    symbolRow('PREF1', { Name: 'Example 6.5% Preferred Stock Series A' }),
    symbolRow('DEPO1', { Name: 'Depositary Shares Each Representing an Interest in Preferred Stock' }),
    symbolRow('FTAIN', { Name: 'Fortress Transportation and Preferred Series C' }),
    symbolRow('ECCC', { Name: 'Eagle Point Credit Company Inc Preferred' }),
    symbolRow('SOHOB', { Name: 'Sotherly Hotels Inc Series B Pref' }),
    symbolRow('MCHPP', { Name: 'Microchip Technology Incorporated' }),
    symbolRow('ABCDT', { Name: 'Example Acquisition Corp' }),
    symbolRow('BIOCQ', { Name: 'Biocept Inc.' }),
    symbolRow('SCCC', { Name: 'Sachem Capital Corp. 7.75% Note' }),
    symbolRow('PFBC', { Name: 'Preferred Bank' }),
    symbolRow('ADRY', { Name: 'Example plc American Depositary Shares' }),
    symbolRow('BRK-B', { Name: 'Berkshire Hathaway Inc Class B', Exchange: 'NYSE' }),
    symbolRow('BHFAL', { Name: 'Brighthouse Financial, Inc.' }),
    symbolRow('GJP', { Name: 'STRATS Trust for Dominion Resources Inc', Exchange: 'NYSE' }),
    symbolRow('EAI', { Name: 'Entergy Arkansas LLC Deb 2066', Exchange: 'NYSE' }),
    symbolRow('BHV', { Name: 'BlackRock Virginia MBT', Exchange: 'NYSE' }),
    symbolRow('GBAB', { Name: 'Guggenheim Taxable Municipal Managed Duration Trust', Exchange: 'NYSE' }),
    symbolRow('KTN', { Name: 'Credit Enhanced Corts Trust For Aon Capital A GIC', Exchange: 'NYSE' }),
    symbolRow('BCAT', { Name: 'BlackRock Capital Allocation Trust', Exchange: 'NYSE' }),
    symbolRow('CEV', { Name: 'Eaton Vance California MIT', Exchange: 'AMEX' }),
    symbolRow('MPV', { Name: 'Barings Participation Investors (the Trust)', Exchange: 'NYSE' }),
    symbolRow('LEO', { Name: 'BNY Mellon Strategic Municipals Inc', Exchange: 'NYSE' }),
    symbolRow('DDT', { Name: 'Dillards Capital Trust I', Exchange: 'NYSE' }),
    symbolRow('JBK', { Name: 'Goldman Sachs Capital I Securities-Backed Series 2004-6 Trust', Exchange: 'NYSE' }),
    symbolRow('OBAI', { Name: 'TG-17, Inc. Common Stock' }),
    symbolRow('VLRS', { Name: 'Volaris', Exchange: 'NYSE' }),
    symbolRow('AAT', { Name: 'American Assets Trust Inc', Exchange: 'NYSE' }),
    symbolRow('ADAM', { Name: 'New York Mortgage Trust, Inc.' }),
    symbolRow('MSPR', { Name: 'MSP Recovery Inc.' }),
    symbolRow('BLMZF', { Name: 'Harrison Global Holdings Inc.' }),
    symbolRow('TESTX'),
    symbolRow('NEXT'),
    symbolRow('OTC1', { Exchange: 'OTCQX' }),
    symbolRow('SPY', { Exchange: 'NYSE ARCA', Type: 'ETF' }),
    symbolRow('FUND1', { Type: 'FUND' }),
    symbolRow('WARRANT1', { Type: 'Warrant' }),
  ];
  const universe = createCommonStockUniverse({
    eodhdRows,
    nasdaqListedText: nasdaqListedText([
      { symbol: 'AAPL', name: 'Apple Inc. - Common Stock' },
      { symbol: 'AACBR', name: 'Ares Acquisition Corporation II - Rights' },
      { symbol: 'VECA-RI', name: 'Vernal Capital Acquisition Corp' },
      { symbol: 'VECA.RT', name: 'Vernal Capital Acquisition Corp' },
      { symbol: 'VECA/R', name: 'Vernal Capital Acquisition Corp' },
      { symbol: 'CEROW', name: 'Example Corp Warrant' },
      { symbol: 'SPACU', name: 'Example Acquisition Units' },
      { symbol: 'PREF1', name: 'Example 6.5% Preferred Stock Series A' },
      { symbol: 'DEPO1', name: 'Depositary Shares Each Representing an Interest in Preferred Stock' },
      { symbol: 'FTAIN', name: 'Fortress Transportation and Preferred Series C' },
      { symbol: 'ECCC', name: 'Eagle Point Credit Company Inc Preferred' },
      { symbol: 'SOHOB', name: 'Sotherly Hotels Inc Series B Pref' },
      { symbol: 'MCHPP', name: 'Microchip Technology Incorporated' },
      { symbol: 'ABCDT', name: 'Example Acquisition Corp' },
      { symbol: 'BIOCQ', name: 'Biocept Inc.' },
      { symbol: 'SCCC', name: 'Sachem Capital Corp. 7.75% Note' },
      { symbol: 'PFBC', name: 'Preferred Bank - Common Stock' },
      { symbol: 'ADRY', name: 'Example plc American Depositary Shares' },
      { symbol: 'TESTX', testIssue: 'Y' },
      { symbol: 'NEXT', nextShares: 'Y' },
      { symbol: 'SPY', etf: 'Y' },
      { symbol: 'BHFAL', name: 'Brighthouse Financial, Inc. - Junior Subordinated Debentures due 2058' },
      { symbol: 'OBAI', name: 'Our Bond, Inc. - Common Stock' },
      { symbol: 'ADAM', name: 'Adamas Trust, Inc. - Common Stock' },
    ]),
    otherListedText: otherListedText([
      { symbol: 'IBM', exchange: 'N' },
      { symbol: 'BBAI', exchange: 'A' },
      { symbol: 'KULR', exchange: 'A' },
      { symbol: 'BRK-B', actSymbol: 'BRK.B', nasdaqSymbol: 'BRK-B', exchange: 'N' },
      { symbol: 'GJP', exchange: 'N', name: 'Synthetic Fixed-Income Securities, Inc. Floating Rate Structured Repackaged Asset-Backed Trust Securities (STRATS) Certificates' },
      { symbol: 'EAI', exchange: 'N', name: 'Entergy Arkansas, LLC First Mortgage Bonds, 4.875% Series Due September 1, 2066' },
      { symbol: 'BHV', exchange: 'N', name: 'BlackRock Virginia Municipal Bond Trust' },
      { symbol: 'GBAB', exchange: 'N', name: 'Guggenheim Taxable Municipal Bond & Investment Grade Debt Trust Common Shares of Beneficial Interest' },
      { symbol: 'KTN', exchange: 'N', name: 'Structured Products Corp 8.205% Corporate Backed Trust Securities (CorTS)' },
      { symbol: 'BCAT', exchange: 'N', name: 'BlackRock Capital Allocation Term Trust Common Shares of Beneficial Interest' },
      { symbol: 'CEV', exchange: 'A', name: 'Eaton Vance California Municipal Income Trust Shares of Beneficial Interest' },
      { symbol: 'MPV', exchange: 'N', name: 'Barings Participation Investors Common Stock' },
      { symbol: 'LEO', exchange: 'N', name: 'BNY Mellon Strategic Municipals, Inc. Common Stock' },
      { symbol: 'DDT', exchange: 'N', name: "Dillard's Capital Trust I" },
      { symbol: 'JBK', exchange: 'N', name: 'Lehman ABS 3.50% Adjustable Corp Backed Tr Certs GS Cap I' },
      { symbol: 'VLRS', exchange: 'N', name: 'Controladora Vuela Compania de Aviacion American Depositary Shares representing Ordinary Participation Certificates' },
      { symbol: 'AAT', exchange: 'N', name: 'American Assets Trust Inc Common Stock' },
      { symbol: 'ARCA1', exchange: 'P' },
    ]),
  });

  assert.deepEqual([...universe.keys()], ['AAPL', 'IBM', 'BBAI', 'KULR', 'PFBC', 'ADRY', 'BRK-B', 'OBAI', 'VLRS', 'AAT', 'ADAM']);
  assert.equal(universe.get('BBAI').exchange, 'NYSE American');
  assert.equal(universe.get('KULR').exchange, 'NYSE American');
  assert.equal(universe.get('BRK-B').exchange, 'NYSE');
  assert.equal(universe.has('MSPR'), false, 'stale EODHD Nasdaq metadata must not admit an OTC symbol');
  assert.equal(universe.has('BLMZF'), false, 'delisted symbols absent from the current official directory must fail closed');
  assert.equal(universe.has('BHFAL'), false, 'junior subordinated debentures must not be treated as common stock');
  assert.equal(universe.has('GJP'), false, 'STRATS structured certificates must not be treated as common stock');
  assert.equal(universe.has('EAI'), false, 'first mortgage bonds must not be treated as common stock');
  assert.equal(universe.has('BHV'), false, 'municipal bond trusts must not be treated as common stock');
  assert.equal(universe.has('GBAB'), false, 'municipal bond and debt trusts must not be treated as common stock');
  assert.equal(universe.has('KTN'), false, 'corporate-backed trust securities must not be treated as common stock');
  assert.equal(universe.has('BCAT'), false, 'closed-end asset-manager trusts must not be treated as common stock');
  assert.equal(universe.has('CEV'), false, 'municipal closed-end trusts must not be treated as common stock');
  assert.equal(universe.has('MPV'), false, 'closed-end participation investors must not be treated as common stock');
  assert.equal(universe.has('LEO'), false, 'strategic municipal funds must not be treated as common stock');
  assert.equal(universe.has('DDT'), false, 'capital-trust debt instruments must not be treated as common stock');
  assert.equal(universe.has('JBK'), false, 'ABS corporate-backed certificates must not be treated as common stock');
  assert.equal(universe.has('OBAI'), true, 'a legitimate company whose name contains Bond must stay eligible');
  assert.equal(universe.has('VLRS'), true, 'a legitimate ADR mentioning participation certificates must stay eligible');
  assert.equal(universe.has('AAT'), true, 'a normal real-estate trust common stock must stay eligible');
  assert.equal(universe.has('ADAM'), true, 'a mortgage REIT common stock must stay eligible');
});

test('current listing directories reject truncated HTTP-200 bodies instead of returning a partial market', () => {
  const eodhdRows = [symbolRow('IBM', { Exchange: 'NYSE' })];
  const nasdaqHeaderOnly = 'Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares\n';
  const validOther = otherListedText([{ symbol: 'IBM', exchange: 'N' }]);
  assert.throws(
    () => createCommonStockUniverse({
      eodhdRows,
      nasdaqListedText: nasdaqHeaderOnly,
      otherListedText: validOther,
    }),
    /Nasdaq Trader nasdaqlisted 缺少完整文件尾/
  );

  const missingTrailer = nasdaqListedText([{ symbol: 'AAPL' }])
    .split('\n')
    .filter(line => !line.startsWith('File Creation Time:'))
    .join('\n');
  assert.throws(
    () => createCommonStockUniverse({
      eodhdRows,
      nasdaqListedText: missingTrailer,
      otherListedText: validOther,
    }),
    /缺少完整文件尾/
  );

  const nyseOnly = otherListedText(
    [{ symbol: 'IBM', exchange: 'N' }],
    { includeNyseAmerican: false }
  );
  assert.throws(
    () => createCommonStockUniverse({
      eodhdRows,
      nasdaqListedText: nasdaqListedText([{ symbol: 'AAPL' }]),
      otherListedText: nyseOnly,
    }),
    /Nasdaq Trader 上市目录数据不完整/,
    'a complete NYSE directory must not mask a missing NYSE American segment'
  );
});

test('market movers returns two real-provider close rankings with the agreed shape', async () => {
  resetMarketMoversCacheForTests();
  const { calls, fetchImpl } = buildProviderFixture();
  const result = await fetchMarketMovers({
    eodhdKey: 'server-secret',
    fetchImpl,
    now: Date.parse('2026-07-13T08:00:00.000Z'),
  });

  assert.equal(result.success, true);
  assert.equal(result.source, 'EODHD_SCREENER');
  assert.equal(result.dataDate, '2026-07-10');
  assert.equal(result.fetchedAt, '2026-07-13T08:00:00.000Z');
  assert.equal(result.gainers.length, 30);
  assert.equal(result.losers.length, 30);
  assert.equal(result.gainers[0].symbol, 'G001');
  assert.equal(result.losers[0].symbol, 'L001');
  assert.deepEqual(Object.keys(result.gainers[0]), [
    'symbol',
    'name',
    'company',
    'price',
    'changePercent',
    'changeAmount',
    'exchange',
    'currency',
    'volume',
    'marketCap',
    'dataDate',
  ]);
  assert.equal(result.gainers.some(row => [
    'AACBR',
    'VECA-RI',
    'CEROW',
    'UNITU',
    'PREF1',
    'FTAIN',
    'ECCC',
    'SOHOB',
    'MCHPP',
    'ABCDT',
    'BIOCQ',
    'MSPR',
    'BLMZF',
    'SCCC',
    'TEST-PA',
  ].includes(row.symbol)), false);
  assert.equal(result.gainers.some(row => ['OLDG', 'WRNG'].includes(row.symbol)), false);
  assert.equal(result.losers.some(row => ['OLDL', 'WRNG'].includes(row.symbol)), false);
  assert.ok(result.gainers.every((row, index, rows) => index === 0 || rows[index - 1].changePercent >= row.changePercent));
  assert.ok(result.losers.every((row, index, rows) => index === 0 || rows[index - 1].changePercent <= row.changePercent));
  assert.deepEqual(
    calls
      .filter(url => url.pathname.includes('/exchange-symbol-list/'))
      .map(url => url.pathname.split('/').at(-1))
      .sort(),
    ['AMEX', 'NASDAQ', 'NYSE']
  );
  assert.equal(calls.filter(url => url.pathname.endsWith('/screener')).length, 2);
  const eodhdCalls = calls.filter(url => url.hostname === 'eodhd.com');
  const officialDirectoryCalls = calls.filter(url => url.hostname === 'www.nasdaqtrader.com');
  assert.ok(eodhdCalls.every(url => url.searchParams.get('api_token') === 'server-secret'));
  assert.equal(officialDirectoryCalls.length, 2);
  assert.ok(officialDirectoryCalls.every(url => url.searchParams.has('api_token') === false));
  assert.equal(JSON.stringify(result).includes('server-secret'), false);
  assert.equal(result.gainers[0].changeAmount, null);
  assert.equal(result.gainers[0].volume, null);
  assert.equal(result.gainers[0].marketCap, null);
});

test('market movers paginates past stale and non-listed screener rows to fill both top thirties', async () => {
  resetMarketMoversCacheForTests();
  const gainers = Array.from({ length: 35 }, (_, index) => moverRow(`PG${String(index + 1).padStart(2, '0')}`, 80 - index));
  const losers = Array.from({ length: 35 }, (_, index) => moverRow(`PL${String(index + 1).padStart(2, '0')}`, -80 + index));
  const eodhdRows = [
    ...gainers.map(row => symbolRow(row.code)),
    ...losers.map(row => symbolRow(row.code, { Exchange: 'NYSE' })),
  ];
  const calls = [];
  const fetchImpl = async (input) => {
    const url = input instanceof URL ? input : new URL(String(input));
    calls.push(url);
    if (url.pathname.includes('/exchange-symbol-list/')) {
      const exchange = url.pathname.split('/').at(-1);
      return jsonResponse(eodhdRows.filter(row => row.Exchange === exchange));
    }
    if (url.pathname.endsWith('/nasdaqlisted.txt')) {
      return textResponse(nasdaqListedText(gainers.map(row => ({ symbol: row.code }))));
    }
    if (url.pathname.endsWith('/otherlisted.txt')) {
      return textResponse(otherListedText(losers.map(row => ({ symbol: row.code, exchange: 'N' }))));
    }
    if (url.pathname.endsWith('/eod/SPY.US')) {
      return jsonResponse([{ date: '2026-07-10' }]);
    }
    if (url.pathname.endsWith('/screener')) {
      const descending = url.searchParams.get('sort') === 'refund_1d_p.desc';
      const offset = Number(url.searchParams.get('offset'));
      const validRows = descending ? gainers : losers;
      if (offset === 0) {
        const staleRows = Array.from({ length: 80 }, (_, index) => moverRow(
          `OTC${String(index).padStart(3, '0')}`,
          descending ? 900 - index : -900 + index
        ));
        return jsonResponse({ data: [...staleRows, ...validRows.slice(0, 20)] });
      }
      return jsonResponse({ data: validRows.slice(20) });
    }
    throw new Error(`unexpected provider path ${url.pathname}`);
  };

  const result = await fetchMarketMovers({ eodhdKey: 'server-secret', fetchImpl });
  assert.equal(result.gainers.length, 30);
  assert.equal(result.losers.length, 30);
  assert.equal(calls.filter(url => url.pathname.endsWith('/screener')).length, 4);
  assert.equal(result.gainers.some(row => row.symbol.startsWith('OTC')), false);
  assert.equal(result.losers.some(row => row.symbol.startsWith('OTC')), false);
});

test('market movers anchors to SPY latest close instead of stopping on thirty eligible old-date rows', async () => {
  resetMarketMoversCacheForTests();
  const oldGainers = Array.from({ length: 30 }, (_, index) => moverRow(
    `OG${String(index + 1).padStart(2, '0')}`,
    200 - index,
    { last_day_data_date: '2026-07-09' }
  ));
  const oldLosers = Array.from({ length: 30 }, (_, index) => moverRow(
    `OL${String(index + 1).padStart(2, '0')}`,
    -200 + index,
    { last_day_data_date: '2026-07-09' }
  ));
  const currentGainers = Array.from({ length: 35 }, (_, index) => moverRow(`CG${String(index + 1).padStart(2, '0')}`, 80 - index));
  const currentLosers = Array.from({ length: 35 }, (_, index) => moverRow(`CL${String(index + 1).padStart(2, '0')}`, -80 + index));
  const allGainers = [...oldGainers, ...currentGainers];
  const allLosers = [...oldLosers, ...currentLosers];
  const eodhdRows = [
    ...allGainers.map(row => symbolRow(row.code)),
    ...allLosers.map(row => symbolRow(row.code, { Exchange: 'NYSE' })),
  ];
  const calls = [];
  const fetchImpl = async (input) => {
    const url = input instanceof URL ? input : new URL(String(input));
    calls.push(url);
    if (url.pathname.includes('/exchange-symbol-list/')) {
      const exchange = url.pathname.split('/').at(-1);
      return jsonResponse(eodhdRows.filter(row => row.Exchange === exchange));
    }
    if (url.pathname.endsWith('/nasdaqlisted.txt')) {
      return textResponse(nasdaqListedText(allGainers.map(row => ({ symbol: row.code }))));
    }
    if (url.pathname.endsWith('/otherlisted.txt')) {
      return textResponse(otherListedText(allLosers.map(row => ({ symbol: row.code, exchange: 'N' }))));
    }
    if (url.pathname.endsWith('/eod/SPY.US')) {
      return jsonResponse([{ date: '2026-07-10' }]);
    }
    if (url.pathname.endsWith('/screener')) {
      const descending = url.searchParams.get('sort') === 'refund_1d_p.desc';
      const offset = Number(url.searchParams.get('offset'));
      if (offset === 0) {
        const oldRows = descending ? oldGainers : oldLosers;
        const filler = Array.from({ length: 70 }, (_, index) => moverRow(
          `STALE${String(index).padStart(3, '0')}`,
          descending ? 150 - index : -150 + index,
          { last_day_data_date: '2026-07-09' }
        ));
        return jsonResponse({ data: [...oldRows, ...filler] });
      }
      return jsonResponse({ data: descending ? currentGainers : currentLosers });
    }
    throw new Error(`unexpected provider path ${url.pathname}`);
  };

  const result = await fetchMarketMovers({
    eodhdKey: 'server-secret',
    fetchImpl,
    now: Date.parse('2026-07-13T08:00:00.000Z'),
  });
  assert.equal(result.dataDate, '2026-07-10');
  assert.ok([...result.gainers, ...result.losers].every(row => row.dataDate === '2026-07-10'));
  assert.equal(result.gainers.some(row => row.symbol.startsWith('OG')), false);
  assert.equal(result.losers.some(row => row.symbol.startsWith('OL')), false);
  assert.equal(calls.filter(url => url.pathname.endsWith('/screener')).length, 4);
});

test('market movers TTL and in-flight merge prevent duplicate provider work', async () => {
  resetMarketMoversCacheForTests();
  assert.equal(MARKET_MOVERS_CONFIG.requestBudgetMs, 25 * 1000);
  assert.equal(MARKET_MOVERS_CONFIG.marketMoversTtlMs, 60 * 60 * 1000);
  assert.equal(MARKET_MOVERS_CONFIG.symbolUniverseTtlMs, 24 * 60 * 60 * 1000);
  assert.deepEqual(MARKET_MOVERS_CONFIG.directoryMinimumRows, {
    nasdaq: 1000,
    nyse: 1000,
    nyseAmerican: 100,
  });
  const { calls, fetchImpl } = buildProviderFixture();
  const now = Date.parse('2026-07-13T08:00:00.000Z');

  const [first, concurrent] = await Promise.all([
    fetchMarketMovers({ eodhdKey: 'server-secret', fetchImpl, now }),
    fetchMarketMovers({ eodhdKey: 'server-secret', fetchImpl, now }),
  ]);
  const cached = await fetchMarketMovers({ eodhdKey: 'server-secret', fetchImpl, now: now + 1000 });

  assert.equal(first, concurrent);
  assert.equal(first, cached);
  assert.equal(calls.length, 8);

  await fetchMarketMovers({
    eodhdKey: 'server-secret',
    fetchImpl,
    now: now + MARKET_MOVERS_CONFIG.marketMoversTtlMs + 1,
  });
  assert.equal(calls.filter(url => url.pathname.includes('/exchange-symbol-list/')).length, 3);
  assert.equal(calls.filter(url => url.hostname === 'www.nasdaqtrader.com').length, 2);
  assert.equal(calls.filter(url => url.pathname.endsWith('/eod/SPY.US')).length, 2);
  assert.equal(calls.filter(url => url.pathname.endsWith('/screener')).length, 4);
});

test('market movers fail closed when the current official listing directory is unavailable', async () => {
  resetMarketMoversCacheForTests();
  const fixture = buildProviderFixture();
  const fetchImpl = async (input, options) => {
    const url = input instanceof URL ? input : new URL(String(input));
    if (url.hostname === 'www.nasdaqtrader.com') return textResponse('unavailable', 503);
    return fixture.fetchImpl(input, options);
  };

  await assert.rejects(
    fetchMarketMovers({ eodhdKey: 'server-secret', fetchImpl }),
    /Nasdaq Trader .* HTTP 503/
  );
});

test('market movers sanitizes provider failures without exposing the server token', async () => {
  resetMarketMoversCacheForTests();
  const secret = 'never-return-this-token';
  const fetchImpl = async (input) => {
    throw new Error(`failed provider request ${String(input)} api_token=${secret}`);
  };

  await assert.rejects(
    fetchMarketMovers({ eodhdKey: secret, fetchImpl }),
    (error) => {
      assert.match(error.message, /请求失败/);
      assert.equal(error.message.includes(secret), false);
      assert.equal(error.message.includes('api_token='), false);
      return true;
    }
  );
});

test('quote market-movers view keeps the existing authentication boundary', async () => {
  resetMarketMoversCacheForTests();
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  const originalKey = process.env.EODHD_API_KEY;
  const originalFetch = globalThis.fetch;
  try {
    delete process.env.QUOTE_API_AUTH_REQUIRED;
    process.env.EODHD_API_KEY = 'server-secret';
    const unauthorized = createResponse();
    await quoteHandler(
      { method: 'GET', headers: {}, query: { view: 'market-movers' } },
      unauthorized
    );
    assert.equal(unauthorized.statusCode, 401);

    process.env.QUOTE_API_AUTH_REQUIRED = 'false';
    const fixture = buildProviderFixture();
    globalThis.fetch = fixture.fetchImpl;
    const success = createResponse();
    await quoteHandler(
      { method: 'GET', headers: {}, query: { view: 'market-movers' } },
      success
    );
    assert.equal(success.statusCode, 200);
    assert.equal(success.body.success, true);
    assert.equal(success.body.gainers.length, 30);
    assert.equal(success.body.losers.length, 30);
  } finally {
    resetMarketMoversCacheForTests();
    globalThis.fetch = originalFetch;
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
    if (originalKey === undefined) delete process.env.EODHD_API_KEY;
    else process.env.EODHD_API_KEY = originalKey;
  }
});

test('quote market-movers view returns a sanitized gateway error on provider failure', async () => {
  resetMarketMoversCacheForTests();
  const originalAuth = process.env.QUOTE_API_AUTH_REQUIRED;
  const originalKey = process.env.EODHD_API_KEY;
  const originalFetch = globalThis.fetch;
  try {
    process.env.QUOTE_API_AUTH_REQUIRED = 'false';
    process.env.EODHD_API_KEY = 'never-return-this-token';
    globalThis.fetch = async (input) => {
      throw new Error(`provider failed ${String(input)}`);
    };
    const res = createResponse();
    await quoteHandler(
      { method: 'GET', headers: {}, query: { view: 'market-movers' } },
      res
    );

    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.body, { error: '美股收盘榜暂不可用' });
    assert.equal(JSON.stringify(res.body).includes(process.env.EODHD_API_KEY), false);
    assert.equal(JSON.stringify(res.body).includes('api_token='), false);
  } finally {
    resetMarketMoversCacheForTests();
    globalThis.fetch = originalFetch;
    if (originalAuth === undefined) delete process.env.QUOTE_API_AUTH_REQUIRED;
    else process.env.QUOTE_API_AUTH_REQUIRED = originalAuth;
    if (originalKey === undefined) delete process.env.EODHD_API_KEY;
    else process.env.EODHD_API_KEY = originalKey;
  }
});

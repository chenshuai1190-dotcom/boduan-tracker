import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockDecisionValuation, STOCK_DECISION_VALUATION_RULES } from '../server/quote/stockDecisionValuationModel.js';

const DAY = 86_400_000;
const ISO = value => new Date(value).toISOString().slice(0, 10);
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const sourceUrl = 'https://www.sec.gov/Archives/edgar/data/1326801/000132680126000001/report.htm';

function fixture({ count = 8, firstYear = 2024, firstQuarter = 3, growths = [0.2, 0.2, 0.2, 0.2], margins = [0.4, 0.4, 0.4, 0.4] } = {}) {
  const seasonal = [100, 120, 140, 180];
  const quarters = Array.from({ length: count }, (_, index) => {
    const ordinal = firstYear * 4 + firstQuarter - 1 + index;
    const fiscalYear = Math.floor(ordinal / 4);
    const fiscalQuarter = ordinal % 4 + 1;
    const start = ISO(Date.UTC(fiscalYear, (fiscalQuarter - 1) * 3, 1));
    const end = ISO(Date.UTC(fiscalYear, fiscalQuarter * 3, 0));
    const revenue = seasonal[fiscalQuarter - 1] * 1e9 * (index < 4 ? 1 : 1 + growths[(index - 4) % 4]);
    const margin = index < 4 ? 0.4 : margins[(index - 4) % 4];
    const operatingIncome = revenue * margin;
    const pretaxIncome = operatingIncome;
    const incomeTax = pretaxIncome * 0.2;
    return { fiscalYear, fiscalQuarter, start, end, revenue, operatingIncome, pretaxIncome, incomeTax,
      netIncome: pretaxIncome - incomeTax, dilutedShares: 2e9, eps: (pretaxIncome - incomeTax) / 2e9,
      accession: `0001326801-${fiscalYear}-${fiscalQuarter}`, filedAt: ISO(Date.parse(end) + 20 * DAY) };
  });
  const latest = quarters.at(-1);
  const input = {
    symbol: 'META', cik: '0001326801', currency: 'USD', quarters,
    report: { accession: latest.accession, periodEnd: latest.end, periodStart: latest.start,
      fiscalYear: latest.fiscalYear, fiscalQuarter: latest.fiscalQuarter, publishedAt: latest.filedAt, sourceUrl },
    latestDilutedShares: { value: 2e9, scope: 'quarter', periodStart: latest.start, periodEnd: latest.end,
      accession: latest.accession, filedAt: latest.filedAt, sourceUrl },
    guidance: { status: 'not_disclosed' },
  };
  return { input, now: Date.parse(latest.filedAt) + DAY };
}

function run(value) { return buildStockDecisionValuation(value.input, { now: value.now }); }
function base(result) { return result.scenarios.find(row => row.id === 'base'); }
function guide(input, extra) {
  const latest = input.quarters.at(-1);
  const ordinal = latest.fiscalYear * 4 + latest.fiscalQuarter;
  input.guidance = { status: 'available', period: { fiscalYear: Math.floor(ordinal / 4), fiscalQuarter: ordinal % 4 + 1 }, sourceUrl, ...extra };
}

test('data-driven scenarios retain quarter seasonality and value four distinct quarters', () => {
  const f = fixture();
  const result = run(f);
  assert.equal(result.status, 'available');
  assert.equal(result.modelVersion, STOCK_DECISION_VALUATION_RULES.version);
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.forecastPeriod.start, '2026-07-01');
  assert.equal(result.forecastPeriod.end, '2027-06-30');
  assert.deepEqual(result.forecastPeriod.quarters.map(row => [row.fiscalYear, row.fiscalQuarter]), [[2026, 3], [2026, 4], [2027, 1], [2027, 2]]);
  const expectedRevenue = f.input.quarters.slice(-4).reduce((total, row) => total + row.revenue * 1.2, 0);
  const expectedEps = expectedRevenue * 0.4 * 0.8 / 2e9;
  for (const scenario of result.scenarios) {
    close(scenario.eps, expectedEps);
    for (const price of scenario.prices) assert.equal(price.price, Math.round(expectedEps * price.pe * 100) / 100);
  }
  assert.notEqual(base(result).eps, f.input.quarters.at(-1).eps * 4);
});

test('successive newly reported quarters roll forecast window and recompute EPS without code changes', () => {
  const old = fixture();
  const next = fixture({ count: 9 });
  const latest = next.input.quarters.at(-1);
  latest.revenue *= 1.3;
  latest.operatingIncome = latest.pretaxIncome = latest.revenue * 0.4;
  latest.incomeTax = latest.pretaxIncome * 0.2;
  latest.netIncome = latest.pretaxIncome - latest.incomeTax;
  const before = run(old);
  const after = run(next);
  assert.equal(after.status, 'available');
  assert.equal(after.reportedPeriod, 'FY2026 Q3');
  assert.equal(after.forecastPeriod.start, '2026-10-01');
  assert.equal(after.forecastPeriod.quarters.at(-1).label, 'FY2027 Q3');
  assert.notEqual(base(before).eps, base(after).eps);
  assert.notEqual(before.reportedAt, after.reportedAt);
});

test('growth and SBC-inclusive margins use transparent min / recent-weighted / max rules', () => {
  const f = fixture({ growths: [0.1, 0.2, 0.3, 0.4], margins: [0.3, 0.35, 0.4, 0.45] });
  const result = run(f);
  assert.equal(result.status, 'available');
  const revenue = f.input.quarters.slice(-4).reduce((total, row) => total + row.revenue, 0);
  const margins = [0.3, (0.3 + 0.7 + 1.2 + 1.8) / 10, 0.45];
  [0.1, 0.3, 0.4].forEach((growth, index) => close(result.scenarios[index].eps, revenue * (1 + growth) * margins[index] * 0.8 / 2e9));
  assert.match(result.notes.en, /SBC/);
});

test('next-quarter revenue, gross margin and operating-expense outlook override only its quarter', () => {
  const f = fixture();
  guide(f.input, { revenue: { low: 200e9, high: 220e9 }, grossMargin: { low: 0.6, high: 0.7 }, operatingExpenses: { low: 30e9, high: 40e9 } });
  const result = run(f);
  assert.equal(result.status, 'available');
  const futureWithoutFirst = f.input.quarters.slice(-3).reduce((total, row) => total + row.revenue * 1.2 * 0.4, 0);
  close(base(result).eps, ((210e9 * 0.65 - 35e9) + futureWithoutFirst) * 0.8 / 2e9);
  const down = structuredClone(f);
  down.input.guidance.revenue = { low: 160e9, high: 180e9 };
  assert.ok(base(run(down)).eps < base(result).eps);
});

test('annual expenses deduct actual YTD before allocating the remaining forecast year', () => {
  const f = fixture();
  guide(f.input, { revenue: { low: 210e9, high: 210e9 }, annualExpenses: { fiscalYear: 2026, low: 400e9, high: 400e9 } });
  const result = run(f);
  assert.equal(result.status, 'available');
  const ytd = f.input.quarters.filter(row => row.fiscalYear === 2026);
  const ytdExpenses = ytd.reduce((total, row) => total + row.revenue - row.operatingIncome, 0);
  const q4Revenue = f.input.quarters.find(row => row.fiscalYear === 2025 && row.fiscalQuarter === 4).revenue * 1.2;
  const nextYearOi = ytd.reduce((total, row) => total + row.revenue * 1.2 * 0.4, 0);
  close(base(result).eps, ((210e9 + q4Revenue - (400e9 - ytdExpenses)) + nextYearOi) * 0.8 / 2e9);
  const impossible = structuredClone(f);
  impossible.input.guidance.annualExpenses = { fiscalYear: 2026, low: 1, high: 2 };
  assert.equal(run(impossible).reason, 'incompatible_annual_guidance');
  assert.deepEqual(run(impossible).scenarios, []);
});

test('annual tax outlook cannot leak into the following fiscal year', () => {
  const f = fixture();
  guide(f.input, { taxRate: { low: 0.1, high: 0.1, fiscalYear: 2026, scope: 'fiscal_year' } });
  const result = run(f);
  assert.equal(result.status, 'available');
  const previous = f.input.quarters.slice(-4);
  const expected = previous.reduce((total, row) => total + row.revenue * 1.2 * 0.4 * (row.fiscalQuarter >= 3 ? 0.9 : 0.8), 0) / 2e9;
  close(base(result).eps, expected);
});

test('annual operating-margin guidance replaces a conflicting historical margin within its complete year', () => {
  const f = fixture({ firstQuarter: 1, firstYear: 2025 });
  guide(f.input, { annualOperatingMargin: { fiscalYear: 2027, low: 0.3, high: 0.31, lowExclusive: true } });
  const result = run(f);
  assert.equal(result.status, 'available');
  const revenue = f.input.quarters.slice(-4).reduce((total, row) => total + row.revenue * 1.2, 0);
  [0.301, 0.305, 0.309].forEach((margin, index) => close(result.scenarios[index].eps, revenue * margin * 0.8 / 2e9));
  assert.match(base(result).assumptions.find(row => row.label.en.includes('annual operating-margin')).value, /30.50%/);
});

test('explicit annual profit floors are checked using actual YTD and forecasts without inventing extra profit', () => {
  const f = fixture();
  guide(f.input, { annualOperatingIncomeFloor: { fiscalYear: 2026, value: 200e9, exclusive: true } });
  assert.equal(run(f).status, 'available');
  f.input.guidance.annualOperatingIncomeFloor.value = 1e12;
  assert.equal(run(f).reason, 'incompatible_annual_guidance');
  assert.deepEqual(run(f).scenarios, []);
});

test('binding annual profit floor chooses only feasible officially disclosed expenses without raising revenue', () => {
  const f = fixture();
  guide(f.input, { annualExpenses: { fiscalYear: 2026, low: 400e9, high: 450e9 },
    annualOperatingIncomeFloor: { fiscalYear: 2026, value: 300e9, exclusive: true } });
  const result = run(f);
  assert.equal(result.status, 'available');
  const q = f.input.quarters;
  const ytd = q.filter(row => row.fiscalYear === 2026);
  const ytdRevenue = ytd.reduce((total, row) => total + row.revenue, 0);
  const ytdExpenses = ytd.reduce((total, row) => total + row.revenue - row.operatingIncome, 0);
  const h2Revenue = q.filter(row => row.fiscalYear === 2025 && row.fiscalQuarter >= 3).reduce((total, row) => total + row.revenue * 1.2, 0);
  const ceiling = ytdRevenue + h2Revenue - 300e9;
  const expenses = 400e9 + (ceiling - 400e9) * 0.9;
  const nextYearProfit = ytdRevenue * 1.2 * 0.4;
  close(result.scenarios[0].eps, (h2Revenue - (expenses - ytdExpenses) + nextYearProfit) * 0.8 / 2e9);
  assert.ok(result.scenarios[0].assumptions.some(row => row.label.en === 'Model-derived feasible expense constraint'));
  assert.ok(expenses >= 400e9 && expenses <= 450e9);
  f.input.guidance.annualOperatingIncomeFloor.value = 400e9;
  assert.equal(run(f).reason, 'incompatible_annual_guidance');
  assert.deepEqual(run(f).scenarios, []);
});

test('a quarterly forecast loss does not manufacture a tax credit', () => {
  const f = fixture();
  guide(f.input, { revenue: { low: 10e9, high: 10e9 }, costOfRevenue: { low: 15e9, high: 15e9 }, operatingExpenses: { low: 5e9, high: 5e9 } });
  const result = run(f);
  assert.equal(result.status, 'available');
  const otherQuarterProfits = f.input.quarters.slice(-3).reduce((total, row) => total + row.revenue * 1.2 * 0.4 * 0.8, 0);
  close(base(result).eps, (-10e9 + otherQuarterProfits) / 2e9);
});

test('negative and exceptional over-50% tax quarters do not become a repeating tax windfall', () => {
  const f = fixture();
  const baseline = base(run(f)).eps;
  f.input.quarters.at(-1).incomeTax = -500e9;
  f.input.quarters.at(-2).incomeTax = f.input.quarters.at(-2).pretaxIncome * 1.2;
  const result = run(f);
  assert.equal(result.status, 'available');
  close(base(result).eps, baseline);
  for (const row of f.input.quarters) row.incomeTax = -1;
  assert.equal(run(f).reason, 'insufficient_tax_history');
  assert.deepEqual(run(f).scenarios, []);
});

test('a disclosed numeric zero tax is valid while missing tax remains missing', () => {
  const f = fixture();
  for (const row of f.input.quarters) row.incomeTax = 0;
  assert.equal(run(f).status, 'available');
  const revenue = f.input.quarters.slice(-4).reduce((total, row) => total + row.revenue * 1.2, 0);
  close(base(run(f)).eps, revenue * 0.4 / 2e9);
  f.input.quarters.at(-1).incomeTax = null;
  assert.equal(run(f).reason, 'invalid_quarter');
});

test('investment EPS and historical split EPS are not projected; shares retain actual unit scale', () => {
  const f = fixture();
  const baseline = base(run(f)).eps;
  for (const row of f.input.quarters) {
    row.pretaxIncome *= 30;
    row.incomeTax *= 30;
    row.netIncome = row.pretaxIncome - row.incomeTax;
    row.eps = row.netIncome / row.dilutedShares;
  }
  close(base(run(f)).eps, baseline);
  f.input.latestDilutedShares.value *= 10;
  close(base(run(f)).eps, baseline / 10);
  const scaled = fixture();
  for (const row of scaled.input.quarters) for (const key of ['revenue', 'operatingIncome', 'pretaxIncome', 'incomeTax', 'netIncome', 'dilutedShares']) row[key] *= 1000;
  scaled.input.latestDilutedShares.value *= 1000;
  close(base(run(scaled)).eps, baseline);
});

test('direct annual weighted diluted shares are explicit; unknown Q4 EPS and shares are never subtracted', () => {
  const f = fixture({ firstQuarter: 1, firstYear: 2025 });
  f.input.quarters.at(-1).eps = null;
  f.input.quarters.at(-1).dilutedShares = null;
  f.input.latestDilutedShares.scope = 'annual';
  f.input.latestDilutedShares.periodStart = '2026-01-01';
  const result = run(f);
  assert.equal(result.status, 'available');
  assert.match(base(result).assumptions.find(row => row.label.en.startsWith('Constant diluted')).value, /annual; 2026-01-01/);
  f.input.latestDilutedShares.value = null;
  assert.equal(run(f).reason, 'missing_diluted_shares');
});

test('losses, missing quarter facts and partial cost outlook never emit zero or positive fabricated valuations', () => {
  const f = fixture();
  f.input.quarters.at(-1).operatingIncome = -1;
  assert.equal(run(f).reason, 'loss_making_business');
  assert.deepEqual(run(f).scenarios, []);
  const short = fixture();
  short.input.quarters.shift();
  assert.equal(run(short).reason, 'incomplete_quarters');
  const partial = fixture();
  guide(partial.input, { operatingExpenses: { low: 10e9, high: 12e9 } });
  assert.equal(run(partial).reason, 'unverified_guidance');
});

test('weakening growth can produce conditional scenarios without asserting high growth', () => {
  const f = fixture({ growths: [-0.1, -0.08, -0.05, -0.03] });
  const result = run(f);
  assert.equal(result.status, 'available');
  assert.equal(result.reason, 'conditional_growth');
  assert.match(result.notes.en, /high growth is not confirmed/);
});

test('identity, chronology and malformed inputs fail closed without mutating inputs', () => {
  const f = fixture();
  const original = structuredClone(f);
  run(f);
  assert.deepEqual(f, original);
  assert.equal(buildStockDecisionValuation({ symbol: 'AAPL' }).status, 'unsupported');
  f.input.cik = '789019';
  assert.equal(run(f).reason, 'identity_mismatch');
  const future = fixture();
  future.input.report.publishedAt = ISO(future.now + DAY);
  assert.equal(run(future).reason, 'invalid_report');
  const malformed = fixture();
  malformed.input.quarters[0] = null;
  assert.equal(run(malformed).status, 'pending');
  assert.equal(buildStockDecisionValuation(original.input, { now: 1e100 }).reason, 'invalid_clock');
});

test('week-based financial calendars retain fiscal labels without invented exact future end dates', () => {
  const f = fixture();
  for (const row of f.input.quarters) row.end = ISO(Date.parse(row.end) - 2 * DAY);
  f.input.report.periodEnd = f.input.quarters.at(-1).end;
  f.input.latestDilutedShares.periodEnd = f.input.report.periodEnd;
  const result = run(f);
  assert.equal(result.status, 'available');
  assert.equal(result.forecastPeriod.end, null);
  assert.equal(result.forecastPeriod.quarters.length, 4);
});

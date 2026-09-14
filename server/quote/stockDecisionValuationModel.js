/** Pure, issuer-independent earnings scenarios from verified quarterly facts. */
export const STOCK_DECISION_VALUATION_RULES = Object.freeze({
  version: 'earnings-valuation-v2',
  historyQuarters: 8,
  forecastQuarters: 4,
  recentWeights: Object.freeze([1, 2, 3, 4]),
  normalTaxMinimum: 0,
  normalTaxMaximum: 0.5,
  minimumNormalTaxQuarters: 2,
  maximumNormalTaxQuarters: 4,
  revenueGrowthReferenceFloor: 0.1,
  annualMarginScenarioQuantiles: Object.freeze([0.1, 0.5, 0.9]),
  bindingExpenseCeilingQuantile: 0.9,
  assumedOtherIncome: 0,
  peSensitivity: Object.freeze([20, 25, 30]),
});

const R = STOCK_DECISION_VALUATION_RULES;
const ISSUERS = Object.freeze({ MSFT: '789019', NVDA: '1045810', META: '1326801' });
const IDS = ['cautious', 'base', 'optimistic'];
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const percent = value => `${(value * 100).toFixed(2)}%`;
const dollars = value => `$${(value / 1e9).toFixed(3)}B`;
const sum = values => values.reduce((total, value) => total + value, 0);
const quarterKey = value => `${value.fiscalYear}Q${value.fiscalQuarter}`;
const quarterLabel = value => `FY${value.fiscalYear} Q${value.fiscalQuarter}`;
const weighted = values => sum(values.map((value, index) => value * R.recentWeights[index])) / sum(R.recentWeights);
const median = values => {
  const ordered = [...values].sort((a, b) => a - b);
  const half = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[half] : (ordered[half - 1] + ordered[half]) / 2;
};

function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return null;
  const result = value.slice(0, 10);
  const timestamp = Date.parse(`${result}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === result ? result : null;
}

function fiscalPeriod(value) {
  return value && Number.isInteger(value.fiscalYear) && value.fiscalYear >= 1900 && value.fiscalYear <= 3000
    && Number.isInteger(value.fiscalQuarter) && value.fiscalQuarter >= 1 && value.fiscalQuarter <= 4;
}

function nextQuarter(period, offset = 1) {
  const count = period.fiscalYear * 4 + period.fiscalQuarter - 1 + offset;
  return { fiscalYear: Math.floor(count / 4), fiscalQuarter: count % 4 + 1 };
}

function nextDay(date) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function calendarYearEnd(rows) {
  // Calendar-month-end issuers retain a known quarter calendar. A 52/53-week
  // issuer gets fiscal-quarter labels rather than an invented future end date.
  const monthEnd = date => {
    const parsed = new Date(`${date}T00:00:00Z`);
    return parsed.getUTCDate() === new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)).getUTCDate();
  };
  if (!rows.every(row => monthEnd(row.end))) return null;
  const latest = new Date(`${rows.at(-1).end}T00:00:00Z`);
  return new Date(Date.UTC(latest.getUTCFullYear() + 1, latest.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

function officialSources(input) {
  const candidates = [
    { title: 'Official financial report', url: input?.report?.sourceUrl },
    { title: 'Official company outlook', url: input?.guidance?.sourceUrl },
    { title: 'Official diluted-share fact', url: input?.latestDilutedShares?.sourceUrl },
    ...(Array.isArray(input?.sources) ? input.sources : []),
  ];
  const urls = new Set();
  return candidates.filter(source => {
    if (typeof source?.url !== 'string' || typeof source.title !== 'string' || urls.has(source.url)) return false;
    try { if (new URL(source.url).protocol !== 'https:') return false; } catch { return false; }
    urls.add(source.url);
    return true;
  });
}

function envelope(input, symbol, status, reason, explanation) {
  return {
    schemaVersion: 2, modelVersion: R.version, symbol, currency: 'USD', status, reason,
    reportedPeriod: fiscalPeriod(input?.report) ? quarterLabel(input.report) : null,
    reportedAt: day(input?.report?.publishedAt), reportPeriodEnd: day(input?.report?.periodEnd),
    forecastPeriod: null, sources: officialSources(input), scenarios: [],
    notes: { zh: explanation, en: `Valuation pending: ${reason}. No unavailable input is replaced with zero.` },
  };
}

function validRange(value, { minimum = 0, maximum = Infinity, strictlyPositive = false } = {}) {
  return value && finite(value.low) && finite(value.high) && value.low <= value.high
    && value.low >= minimum && value.high <= maximum && (!strictlyPositive || value.low > 0);
}

function rangeValue(value, index, cost = false) {
  if (index === 1) return (value.low + value.high) / 2;
  return index === (cost ? 0 : 2) ? value.high : value.low;
}

function guidanceValid(guidance, periods) {
  const fields = ['revenue', 'grossMargin', 'costOfRevenue', 'operatingExpenses', 'taxRate', 'annualExpenses', 'annualOperatingMargin', 'annualOperatingIncomeFloor'];
  if (!guidance || !['available', 'not_disclosed'].includes(guidance.status)) return false;
  if (guidance.status === 'not_disclosed') {
    return !fields.some(key => guidance[key] != null);
  }
  if (!fiscalPeriod(guidance.period) || !periods.some(period => quarterKey(period) === quarterKey(guidance.period))) return false;
  if (!fields.some(key => guidance[key] != null)) return false;
  for (const key of ['revenue', 'costOfRevenue', 'operatingExpenses', 'annualExpenses']) {
    if (guidance[key] != null && !validRange(guidance[key], { strictlyPositive: key === 'revenue' })) return false;
  }
  if (guidance.grossMargin != null && !validRange(guidance.grossMargin, { maximum: 1 })) return false;
  if (guidance.taxRate != null) {
    if (!validRange(guidance.taxRate, { maximum: R.normalTaxMaximum })
      || !['quarter', 'fiscal_year', 'remaining_year'].includes(guidance.taxRate.scope)
      || !Number.isInteger(guidance.taxRate.fiscalYear)) return false;
  }
  if (guidance.annualExpenses != null && (!Number.isInteger(guidance.annualExpenses.fiscalYear)
    || !periods.some(period => period.fiscalYear === guidance.annualExpenses.fiscalYear))) return false;
  if (guidance.annualOperatingMargin != null && (!validRange(guidance.annualOperatingMargin, { maximum: 1 })
    || guidance.annualOperatingMargin.low === guidance.annualOperatingMargin.high && (guidance.annualOperatingMargin.lowExclusive || guidance.annualOperatingMargin.highExclusive)
    || !periods.some(period => period.fiscalYear === guidance.annualOperatingMargin.fiscalYear))) return false;
  if (guidance.annualOperatingIncomeFloor != null && (!finite(guidance.annualOperatingIncomeFloor.value)
    || !periods.some(period => period.fiscalYear === guidance.annualOperatingIncomeFloor.fiscalYear))) return false;
  // An expense-only quarterly outlook cannot be subtracted from an already-net
  // operating margin: that would count expenses twice. Annual total expenses
  // are a complete alternative constraint; partial cost disclosures are not.
  const hasCost = guidance.costOfRevenue != null || guidance.grossMargin != null;
  if ((hasCost !== (guidance.operatingExpenses != null)) && guidance.annualExpenses == null && guidance.annualOperatingMargin == null) return false;
  return true;
}

function officialTaxFor(guidance, period) {
  const tax = guidance.taxRate;
  if (guidance.status !== 'available' || !tax || tax.fiscalYear !== period.fiscalYear) return null;
  if (tax.scope === 'quarter') return quarterKey(period) === quarterKey(guidance.period) ? tax : null;
  if (tax.scope === 'remaining_year' && period.fiscalQuarter < guidance.period.fiscalQuarter) return null;
  return tax;
}

function planScenario({ index, rows, periods, byKey, growth, margin, normalTaxes, shares, guidance }) {
  const historyTax = normalTaxes.length >= R.minimumNormalTaxQuarters
    ? index === 0 ? Math.max(...normalTaxes) : index === 2 ? Math.min(...normalTaxes) : median(normalTaxes) : null;
  const planned = periods.map(period => {
    const prior = byKey.get(quarterKey({ fiscalYear: period.fiscalYear - 1, fiscalQuarter: period.fiscalQuarter }));
    if (!prior) return null;
    const guided = guidance.status === 'available' && quarterKey(guidance.period) === quarterKey(period);
    const revenue = guided && guidance.revenue ? rangeValue(guidance.revenue, index) : prior.revenue * (1 + growth);
    let totalExpenses = revenue * (1 - margin);
    let expensesFromQuarterGuidance = false;
    if (guided && guidance.operatingExpenses && (guidance.costOfRevenue || guidance.grossMargin)) {
      const cogs = guidance.costOfRevenue ? rangeValue(guidance.costOfRevenue, index, true)
        : revenue * (1 - rangeValue(guidance.grossMargin, index));
      totalExpenses = cogs + rangeValue(guidance.operatingExpenses, index, true);
      expensesFromQuarterGuidance = true;
    }
    const officialTax = officialTaxFor(guidance, period);
    return { ...period, revenue, totalExpenses, expensesFromQuarterGuidance,
      tax: officialTax ? rangeValue(officialTax, index, true) : historyTax,
      taxSource: officialTax ? 'official_guidance' : 'historical_normal_range', priorPeriod: quarterLabel(prior) };
  });
  if (planned.some(period => !period)) return { error: 'missing_seasonal_quarter' };
  if (planned.some(period => period.tax === null)) return { error: 'insufficient_tax_history' };

  const annual = guidance.annualExpenses ?? guidance.annualOperatingMargin;
  let annualBudget = null;
  let annualMargin = null;
  let expenseConstraintAdjustment = null;
  if (guidance.status === 'available' && annual) {
    const actual = rows.filter(row => row.fiscalYear === annual.fiscalYear);
    const remaining = Array.from({ length: 4 }, (_, index) => ({ fiscalYear: annual.fiscalYear, fiscalQuarter: index + 1 }))
      .filter(period => !actual.some(row => quarterKey(row) === quarterKey(period)));
    if (!remaining.length || (actual.length && actual.some((row, index) => row.fiscalQuarter !== index + 1))) return { error: 'incomplete_fiscal_ytd' };
    if (guidance.annualExpenses) annualBudget = rangeValue(annual, index, true);
    else {
      const future = planned.filter(period => period.fiscalYear === annual.fiscalYear);
      if (actual.length + future.length !== 4) return { error: 'incomplete_annual_constraint' };
      annualMargin = annual.low + (annual.high - annual.low) * R.annualMarginScenarioQuantiles[index];
      annualBudget = sum([...actual, ...future].map(period => period.revenue)) * (1 - annualMargin);
    }
    const floor = guidance.annualOperatingIncomeFloor;
    if (guidance.annualExpenses && floor?.fiscalYear === annual.fiscalYear) {
      const future = planned.filter(period => period.fiscalYear === annual.fiscalYear);
      if (actual.length + future.length !== 4) return { error: 'incomplete_annual_constraint' };
      const annualRevenue = sum([...actual, ...future].map(period => period.revenue));
      const costCeiling = annualRevenue - floor.value;
      if (floor.exclusive ? annual.low >= costCeiling : annual.low > costCeiling) return { error: 'incompatible_annual_guidance' };
      if (floor.exclusive ? annualBudget >= costCeiling : annualBudget > costCeiling) {
        const feasibleHigh = Math.min(annual.high, costCeiling);
        const constrainedBudget = annual.low + (feasibleHigh - annual.low) * R.bindingExpenseCeilingQuantile;
        expenseConstraintAdjustment = { original: annualBudget, low: annual.low, high: feasibleHigh, constrained: constrainedBudget };
        annualBudget = constrainedBudget;
      }
    }
    const ytdExpenses = sum(actual.map(row => row.revenue - row.operatingIncome));
    const remainingBudget = annualBudget - ytdExpenses;
    if (!(remainingBudget >= 0)) return { error: 'incompatible_annual_guidance' };
    const constrained = planned.filter(period => period.fiscalYear === annual.fiscalYear && period.expensesFromQuarterGuidance);
    const unallocatedBudget = remainingBudget - sum(constrained.map(period => period.totalExpenses));
    const uncovered = remaining.filter(period => !constrained.some(known => quarterKey(known) === quarterKey(period)));
    const weights = uncovered.map(period => {
      const prior = byKey.get(quarterKey({ fiscalYear: period.fiscalYear - 1, fiscalQuarter: period.fiscalQuarter }));
      return prior ? prior.revenue - prior.operatingIncome : null;
    });
    if (weights.some(value => value === null || value < 0) || !(unallocatedBudget >= 0)
      || (uncovered.length && !(sum(weights) > 0)) || (!uncovered.length && Math.abs(unallocatedBudget) > 1)) return { error: 'incompatible_annual_guidance' };
    uncovered.forEach((period, position) => {
      const target = planned.find(candidate => quarterKey(candidate) === quarterKey(period));
      if (target) {
        target.totalExpenses = unallocatedBudget * weights[position] / sum(weights);
        target.expensesFromAnnualGuidance = true;
      }
    });
  }
  if (planned.some(period => !positive(period.revenue) || !finite(period.totalExpenses) || period.totalExpenses < 0)) return { error: 'invalid_forecast' };
  // Exact annual constraints are checked against reported YTD plus forecasts,
  // not a partial-year proxy. Narrative outlook is retained by the source but
  // is not silently converted into a numeric guarantee.
  for (const constraint of [guidance.annualOperatingMargin, guidance.annualOperatingIncomeFloor].filter(Boolean)) {
    const actual = rows.filter(row => row.fiscalYear === constraint.fiscalYear);
    const future = planned.filter(period => period.fiscalYear === constraint.fiscalYear);
    if (actual.length + future.length !== 4) return { error: 'incomplete_annual_constraint' };
    const revenue = sum([...actual, ...future].map(period => period.revenue));
    const operatingIncome = sum(actual.map(period => period.operatingIncome)) + sum(future.map(period => period.revenue - period.totalExpenses));
    if (constraint === guidance.annualOperatingMargin) {
      const margin = operatingIncome / revenue;
      if (constraint.lowExclusive ? margin <= constraint.low : margin < constraint.low - 1e-12) return { error: 'incompatible_annual_guidance' };
      if (constraint.highExclusive ? margin >= constraint.high : margin > constraint.high + 1e-12) return { error: 'incompatible_annual_guidance' };
    } else if (constraint.exclusive ? operatingIncome <= constraint.value : operatingIncome < constraint.value) return { error: 'incompatible_annual_guidance' };
  }
  const netIncome = sum(planned.map(period => {
    const pretax = period.revenue - period.totalExpenses + R.assumedOtherIncome;
    // A forecast loss does not create an unverified deferred-tax benefit.
    return pretax - Math.max(pretax, 0) * period.tax;
  }));
  const eps = netIncome / shares.value;
  if (!positive(eps)) return { error: 'nonpositive_forecast' };
  return { eps, planned, annualBudget, annualMargin, expenseConstraintAdjustment, annualFiscalYear: annual?.fiscalYear ?? null };
}

/** Monetary input is USD and shares are actual shares, never millions/billions. */
export function buildStockDecisionValuation(input, { now = Date.now() } = {}) {
  const symbol = typeof input?.symbol === 'string' ? input.symbol.trim().toUpperCase().replace(/\.US$/, '') : '';
  const fail = (reason, zh) => envelope(input, symbol, 'pending', reason, zh);
  if (!Object.hasOwn(ISSUERS, symbol)) return envelope(input, symbol, 'unsupported', 'unsupported_symbol', '此股票尚未接入已验证的财报来源。');
  if (String(input.cik ?? '').replace(/^0+/, '') !== ISSUERS[symbol] || input.currency !== 'USD') return fail('identity_mismatch', '公司身份或币种尚未通过校验。');
  if (!finite(now) || !Number.isFinite(new Date(now).getTime())) return fail('invalid_clock', '无法确认财报核验时间。');
  const today = new Date(now).toISOString().slice(0, 10);
  const report = input.report;
  if (!fiscalPeriod(report) || !day(report.periodEnd) || !day(report.publishedAt) || day(report.publishedAt) > today
    || day(report.publishedAt) < day(report.periodEnd) || typeof report.accession !== 'string'
    || !officialSources(input).some(source => source.url === report.sourceUrl)) return fail('invalid_report', '财报期间、发布日期或来源不完整。');
  if (!Array.isArray(input.quarters) || input.quarters.length < R.historyQuarters) return fail('incomplete_quarters', '需要八个已验证完整财季才能保留季节性并计算同比。');
  if (input.quarters.some(row => !fiscalPeriod(row))) return fail('invalid_quarter', '财季身份缺失或无效。');
  const rows = [...input.quarters].sort((a, b) => (a.fiscalYear * 4 + a.fiscalQuarter) - (b.fiscalYear * 4 + b.fiscalQuarter)).slice(-R.historyQuarters);
  for (const [index, row] of rows.entries()) {
    if (!fiscalPeriod(row) || !day(row.start) || !day(row.end) || row.start > row.end || row.end > report.periodEnd
      || !day(row.filedAt) || day(row.filedAt) > today || day(row.filedAt) < row.end
      || !positive(row.revenue) || !finite(row.operatingIncome) || row.operatingIncome > row.revenue
      || !finite(row.pretaxIncome) || !finite(row.incomeTax) || !finite(row.netIncome)) return fail('invalid_quarter', '完整财季的金额、期间或披露时间未通过校验。');
    if (index && (quarterKey(nextQuarter(rows[index - 1])) !== quarterKey(row) || rows[index - 1].end >= row.start)) return fail('noncontiguous_quarters', '财季序列不连续，不能跨缺失季度推算同比。');
  }
  const latest = rows.at(-1);
  if (latest.end !== report.periodEnd || quarterKey(latest) !== quarterKey(report)) return fail('report_period_mismatch', '最新报告与财务数据期间不一致。');
  const shares = input.latestDilutedShares ?? {
    value: latest.dilutedShares, scope: 'quarter', periodStart: latest.start, periodEnd: latest.end, filedAt: latest.filedAt,
  };
  if (!positive(shares.value) || !['quarter', 'annual'].includes(shares.scope) || day(shares.periodEnd) !== latest.end
    || !day(shares.periodStart) || shares.periodStart > shares.periodEnd
    || !day(shares.filedAt) || day(shares.filedAt) > today || day(shares.filedAt) < latest.end) return fail('missing_diluted_shares', '缺少最新有效的官方稀释股数；不会倒推季度股数。');
  if (latest.operatingIncome <= 0) return fail('loss_making_business', '最新季度营业利润非正，当前盈利倍数模型不适用。');
  const periods = Array.from({ length: R.forecastQuarters }, (_, index) => nextQuarter(latest, index + 1));
  if (!guidanceValid(input.guidance, periods)) return fail('unverified_guidance', '官方展望未完成解析，或指引期间与预测窗口不匹配。');
  const guidance = input.guidance;
  const byKey = new Map(rows.map(row => [quarterKey(row), row]));
  const recent = rows.slice(-4);
  const growths = recent.map((row, index) => row.revenue / rows[index].revenue - 1);
  const margins = recent.map(row => row.operatingIncome / row.revenue);
  const growthEstimates = [Math.min(...growths), weighted(growths), Math.max(...growths)];
  const marginEstimates = [Math.min(...margins), weighted(margins), Math.max(...margins)];
  const normalTaxes = rows.filter(row => row.pretaxIncome > 0 && row.incomeTax >= 0)
    .map(row => row.incomeTax / row.pretaxIncome)
    .filter(rate => rate >= R.normalTaxMinimum && rate <= R.normalTaxMaximum).slice(-R.maximumNormalTaxQuarters);
  const scenarios = [];
  for (const [index, id] of IDS.entries()) {
    const calculation = planScenario({ index, rows, periods, byKey, growth: growthEstimates[index], margin: marginEstimates[index], normalTaxes, shares, guidance });
    if (calculation.error) return fail(calculation.error, '当前数据或指引不足以可靠计算四季正盈利情景。');
    const assumptions = [
      { label: { zh: '最近四季营收同比', en: 'Latest four quarterly revenue growth rates' }, value: growths.map(percent).join(' / ') },
      { label: { zh: '无官方营收指引时的同比假设', en: 'Revenue growth without applicable guidance' }, value: percent(growthEstimates[index]) },
      { label: { zh: '无完整费用指引时的含SBC营业率', en: 'SBC-inclusive operating margin without complete expense guidance' }, value: percent(marginEstimates[index]) },
      { label: { zh: '未来四季营收合计', en: 'Total revenue across the next four unreported quarters' }, value: dollars(sum(calculation.planned.map(period => period.revenue))) },
      { label: { zh: '各预测财季税率', en: 'Tax rate by forecast fiscal quarter' }, value: calculation.planned.map(period => `${quarterLabel(period)}: ${percent(period.tax)}`).join(' / ') },
      { label: { zh: '固定稀释股数及披露期间', en: 'Constant diluted shares and reported period' }, value: `${shares.value.toLocaleString('en-US')} (${shares.scope}; ${shares.periodStart}–${shares.periodEnd})` },
      { label: { zh: '其他损益假设', en: 'Assumed other income' }, value: '$0' },
    ];
    if (calculation.annualBudget !== null) assumptions.push({ label: { zh: '年度费用约束（先扣实际YTD）', en: 'Annual expense constraint, less actual YTD first' }, value: `FY${calculation.annualFiscalYear}: ${dollars(calculation.annualBudget)}` });
    if (calculation.annualMargin !== null) assumptions.push({ label: { zh: '官方年度营业率范围内情景', en: 'Scenario within the official annual operating-margin range' }, value: `${percent(calculation.annualMargin)} (${R.annualMarginScenarioQuantiles[index] * 100}% of range)` });
    if (calculation.expenseConstraintAdjustment) assumptions.push({ label: { zh: '模型推导的可行费用约束', en: 'Model-derived feasible expense constraint' }, value: `${dollars(calculation.expenseConstraintAdjustment.original)} → ${dollars(calculation.annualBudget)} (${R.bindingExpenseCeilingQuantile * 100}% of ${dollars(calculation.expenseConstraintAdjustment.low)}–${dollars(calculation.expenseConstraintAdjustment.high)})` });
    if (guidance.annualOperatingIncomeFloor) assumptions.push({ label: { zh: '官方年度营业利润下限约束', en: 'Official annual operating-income floor constraint' }, value: `FY${guidance.annualOperatingIncomeFloor.fiscalYear}: ${guidance.annualOperatingIncomeFloor.exclusive ? '>' : '≥'}${dollars(guidance.annualOperatingIncomeFloor.value)}` });
    if (guidance.status === 'available') assumptions.push({ label: { zh: '官方季度指引对应期间', en: 'Fiscal quarter covered by official guidance' }, value: quarterLabel(guidance.period) });
    scenarios.push({ id, eps: calculation.eps, assumptions, prices: R.peSensitivity.map(pe => ({ pe, price: Math.round(calculation.eps * pe * 100) / 100 })) });
  }
  if (scenarios.some((scenario, index) => index > 0 && scenario.eps < scenarios[index - 1].eps)) return fail('inconsistent_scenario_order', '情景之间的官方约束存在冲突，需要重新核验。');
  const lastOperatingGrowth = rows.at(-5).operatingIncome > 0 ? latest.operatingIncome / rows.at(-5).operatingIncome - 1 : null;
  const highGrowthConfirmed = growthEstimates[1] >= R.revenueGrowthReferenceFloor && growths.at(-1) > 0 && growths.at(-2) > 0 && lastOperatingGrowth !== null && lastOperatingGrowth > 0;
  const result = envelope(input, symbol, 'available', highGrowthConfirmed ? guidance.status === 'available' ? 'guidance_constrained' : 'history_based' : 'conditional_growth', '');
  result.forecastPeriod = {
    zh: `${quarterLabel(periods[0])}至${quarterLabel(periods.at(-1))}`,
    en: `${quarterLabel(periods[0])}–${quarterLabel(periods.at(-1))}`,
    start: nextDay(latest.end), end: calendarYearEnd(rows),
    quarters: periods.map(period => ({ ...period, label: quarterLabel(period) })),
  };
  result.scenarios = scenarios;
  result.notes = {
    zh: `${highGrowthConfirmed ? '增长条件满足本模型参考规则。' : '当前仅为条件估值，高增长尚未确认。'}增长参考要求加权营收同比至少10%、最近两季营收同比为正且最新营业利润同比为正。未来四个未报告财季保留去年同季营收季节性；营收同比和含SBC营业率分别取近四季低值、1/2/3/4加权值、高值。已解析的适用营收、成本、费用、税率及明确年度营业约束优先；叙述性展望不转成数字保证。年度营业率范围取10%/50%/90%位置，年度费用先扣已披露YTD，再按去年剩余季费用分摊。费用情景若违反官方营业利润下限，仅在官方费用范围的可行部分内取90%位置，不提高营收；连费用下限也不可行则不估值。无适用税率指引时，仅用已披露0%至50%税率且至少两季；过滤并不保证所有特殊税项均已剔除。股数假设固定，其他损益为零，不外推投资收益。20/25/30倍PE只作敏感性，未校准为公允倍数或技术支撑。`,
    en: `${highGrowthConfirmed ? 'Growth meets this model’s reference rule.' : 'Conditional valuation only; high growth is not confirmed.'} The growth reference requires weighted revenue growth of at least 10%, positive revenue growth in the last two quarters, and positive latest operating-income growth. The next four unreported quarters retain prior-year same-quarter revenue seasonality. Revenue growth and SBC-inclusive operating margins use the recent minimum, 1/2/3/4 weighted estimate, and maximum. Parsed applicable revenue, costs, expenses, taxes and explicit annual operating constraints take precedence; narrative outlook is not a numeric guarantee. Annual margin scenarios use 10%/50%/90% of the disclosed range. Annual expenses subtract actual YTD before seasonal allocation. A binding operating-income floor restricts expenses to 90% of their feasible official range without raising revenue; no feasible disclosed expense means no valuation. Unguided taxes require at least two disclosed rates within 0%–50%; this filter cannot identify every discrete tax item. Shares stay constant and other income is zero. PE 20/25/30 is uncalibrated sensitivity, not fair value or technical support.`,
  };
  return result;
}

import React from 'react';
import './StockBuyReference.css';

const STATES = new Set(['idle', 'watch', 'triggered', 'invalidated', 'expired', 'paused', 'unavailable']);
const STATE_LABELS = {
  idle: ['暂无触发', 'No trigger'],
  watch: ['回调观察', 'Watching pullback'],
  triggered: ['买入参考已触发', 'Entry reference triggered'],
  invalidated: ['参考失效', 'Reference invalidated'],
  expired: ['参考已到期', 'Reference expired'],
  paused: ['暂缓观察', 'Observation paused'],
  unavailable: ['暂不可用', 'Unavailable'],
};
const finite = value => typeof value === 'number' && Number.isFinite(value);
const dateText = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : '—';
const numberText = value => finite(value) ? value.toFixed(1) : '—';
const percentText = value => finite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(1)}%` : '—';
function priceText(value, currency) {
  if (!finite(value) || value <= 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: /^[A-Z]{3}$/.test(currency || '') ? currency : 'USD',
    currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}

function explanation(reference, state, english) {
  const copy = (zh, en) => english ? en : zh;
  if (state === 'unavailable') return copy('等待同一收盘日期的完整行情与指标。', 'Waiting for complete prices and indicators from the same closing date.');
  if (state === 'triggered') return copy('已记录买入参考，仍在本次参考的有效期内。', 'An entry reference was triggered and remains within its validity period.');
  if (state === 'invalidated') return copy('收盘已跌破本次回调低点，原参考条件失效。', 'The close fell below this pullback’s low, invalidating the reference.');
  if (state === 'expired') return reference?.reason === 'observation_expired'
    ? copy('超卖后的 5 个交易日内未完成转强确认，等待新的回调。', 'Recovery was not confirmed within 5 sessions after oversold; waiting for a new pullback.')
    : copy('本次触发已超过有效期，等待新的回调。', 'This trigger has expired; waiting for a new pullback.');
  if (state === 'paused') {
    if (String(reference?.reason).toLowerCase().includes('chas')) return copy('强超买叠加顶背离，暂缓追买观察。', 'Strong overbought conditions with bearish divergence pause this reference.');
    return copy('长期趋势条件尚未满足，暂缓回调观察。', 'The long-term trend conditions are not met; pullback observation is paused.');
  }
  if (state === 'watch') {
    if (reference?.conditions?.rsiRecovered === true && reference?.conditions?.priceConfirmed !== true) return copy('RSI 已回升，等待收盘突破价格确认位。', 'RSI has recovered; waiting for a close above the confirmation price.');
    if (reference?.conditions?.priceConfirmed === true && reference?.conditions?.rsiRecovered !== true) return copy('收盘已突破确认位，等待 RSI 回到 30 以上。', 'Price has cleared the confirmation level; waiting for RSI to recover above 30.');
    return copy('已进入回调观察，等待 RSI 回升与收盘突破确认位。', 'Watching the pullback for RSI recovery and a close above the confirmation price.');
  }
  return copy('尚未出现符合条件的超卖回调，继续观察。', 'No qualifying oversold pullback has formed yet.');
}

export default function StockBuyReference({ reference, language = 'zh', currency = 'USD', asOfDate }) {
  const english = language === 'en';
  const copy = (zh, en) => english ? en : zh;
  const synchronized = reference?.version === 'stock-buy-reference-v1'
    && dateText(asOfDate) !== '—' && reference.asOfDate === asOfDate;
  const state = synchronized && STATES.has(reference.state) ? reference.state : 'unavailable';
  const available = state !== 'unavailable';
  const data = available ? reference : null;
  const conditions = data?.conditions;
  const event = data?.event;
  const conditionRows = [
    ['trend', copy('趋势环境', 'Trend environment'), copy('收盘高于 MA200 · MA60 未明显向下', 'Close above MA200 · MA60 not materially declining')],
    ['rsiRecovered', copy('RSI 回升', 'RSI recovery'), copy('超卖后回到 30 以上', 'Recovered above 30 after oversold')],
    ['priceConfirmed', copy('收盘突破', 'Closing breakout'), copy('收盘高于本次价格确认位', 'Close above this reference’s confirmation price')],
  ];

  return <section className="stock-buy-reference" data-stock-buy-reference={state} lang={english ? 'en' : 'zh-CN'} aria-label={copy('买入参考', 'Entry reference')}>
    <header className="stock-buy-reference-heading">
      <h3>{copy('买入参考', 'Entry reference')}</h3>
      <span>{copy('趋势内回调', 'Trend pullback')}</span>
    </header>
    <div className="stock-buy-reference-state" role="status">{STATE_LABELS[state][english ? 1 : 0]}</div>
    <p className="stock-buy-reference-explanation">{explanation(data, state, english)}</p>

    <dl className="stock-buy-reference-metrics">
      <div><dt>RSI(6)</dt><dd>{numberText(data?.rsi)}</dd></div>
      <div><dt>{copy('价格确认位', 'Confirmation price')}</dt><dd>{priceText(data?.confirmationPrice, currency)}</dd></div>
      <div><dt>{copy('距 MA200', 'From MA200')}</dt><dd>{percentText(data?.distanceMa200Pct)}</dd></div>
    </dl>

    <details className="stock-buy-reference-details">
      <summary><span>{copy('查看条件', 'View conditions')}</span><span className="stock-buy-reference-toggle" aria-hidden="true" /></summary>
      <div className="stock-buy-reference-expanded">
        <p className="stock-buy-reference-conditions-heading">{copy('当前收盘条件', 'Conditions at this close')}</p>
        <ul className="stock-buy-reference-conditions">
          {conditionRows.map(([key, label, description]) => {
            const value = conditions?.[key];
            const status = value === true ? 'met' : value === false ? 'pending' : 'unknown';
            return <li key={key} data-condition={key} data-condition-status={status}>
              <div><span>{label}</span><small>{description}</small></div>
              <span className="stock-buy-reference-condition-status">{value === true ? copy('已满足', 'Met') : value === false ? copy('待满足', 'Pending') : copy('资料不足', 'Missing data')}</span>
            </li>;
          })}
        </ul>
        {event && <dl className="stock-buy-reference-event">
          <div><dt>{copy('观察起始日', 'Observation began')}</dt><dd>{dateText(event.startedAt)}</dd></div>
          <div><dt>{copy('实际触发日', 'Trigger date')}</dt><dd>{dateText(event.triggeredAt)}</dd></div>
          <div><dt>{copy('回调低点 · 收盘', 'Pullback low · close')}</dt><dd>{priceText(event.lowPrice, currency)}</dd></div>
          <div><dt>{copy('剩余有效期', 'Validity remaining')}</dt><dd>{finite(event.remainingTradingDays) && event.remainingTradingDays >= 0 ? `${event.remainingTradingDays} ${copy('个交易日', 'sessions')}` : '—'}</dd></div>
        </dl>}
        <p className="stock-buy-reference-rule">{copy('试验参数 · 待回测', 'Experimental parameters · Awaiting backtest')}</p>
        <p className="stock-buy-reference-rule">{copy(
          '观察规则：收盘高于 MA200，且 MA60 最近 5 个交易日变化不低于 −0.1%。最近一次 RSI(6) ≤30 后，在 5 个交易日内回升至 30 以上，并收盘突破前 3 日最高收盘价，触发买入参考。触发后确认位锁定，触发日起含当日有效 5 个交易日；收盘跌破观察低点则失效。',
          'Rule: close above MA200, with MA60 changing no less than −0.1% over 5 sessions. Within 5 sessions after the latest RSI(6) reading at or below 30, RSI must recover above 30 and the close must exceed the prior 3-session closing high. The confirmation price is then locked for 5 sessions including the trigger date; a close below the observation low invalidates it.',
        )}</p>
        <p className="stock-buy-reference-rule">{copy('参数尚待回测，仅供观察，不构成买卖指令。', 'Parameters await backtesting. For observation, not trade instructions.')}</p>
      </div>
    </details>
    <p className="stock-buy-reference-date">{copy('收盘', 'Close')} · {available ? dateText(data.asOfDate) : '—'}</p>
  </section>;
}

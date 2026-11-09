// Legacy display metadata and the explicit form choice. The settlement RPC
// persists a separate record_kind field; SQL does not infer later financial
// changes from arbitrary note edits. Never infer this label from missing data.
const HISTORICAL_HOLDING_MARKER = '[[quote:stock-trade:record-kind=historical_holding:v1]]';
const RECORD_KIND_LINE = /(?:^|\r?\n)\[\[quote:stock-trade:record-kind=historical_holding:v1\]\](?=\r?\n|$)/g;

function noteText(note) {
  return typeof note === 'string' ? note : '';
}

export function getStockTradeRecordKind(note) {
  return noteText(note).split(/\r?\n/).includes(HISTORICAL_HOLDING_MARKER)
    ? 'historical_holding' : 'trade';
}

/** Strip only our exact, known marker. User text and unknown metadata survive. */
export function stripStockTradeRecordKind(note) {
  return noteText(note).replace(RECORD_KIND_LINE, '');
}

export function withStockTradeRecordKind(note, kind) {
  const text = stripStockTradeRecordKind(note);
  return kind === 'historical_holding'
    ? `${text}${text ? '\n' : ''}${HISTORICAL_HOLDING_MARKER}`
    : text;
}

/** A sell can never be an opening holding; changing sides only clears our tag. */
export function normalizeStockTradeDraftKind(draft) {
  if (draft?.side !== 'sell' || getStockTradeRecordKind(draft.note) === 'trade') return draft;
  return { ...draft, note: withStockTradeRecordKind(draft.note, 'trade') };
}

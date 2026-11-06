import test from 'node:test';
import assert from 'node:assert/strict';
import { findReviewStockMentions, resolveReviewStockLinks } from '../src/lib/reviewStockMentions.js';

test('mentions follow first appearance across known codes, names and duplicates', () => {
  assert.deepEqual(findReviewStockMentions('先看SMH，再看英伟达，最后tsm；NVDA继续观察。'), ['SMH', 'NVDA', 'TSM']);
  assert.deepEqual(findReviewStockMentions('$vgt / 微軟 / 台積電 / 英偉達 / Google / TSMC'), ['VGT', 'MSFT', 'TSM', 'NVDA', 'GOOGL']);
  assert.deepEqual(findReviewStockMentions('NVIDIA、Microsoft、Taiwan Semiconductor'), ['NVDA', 'MSFT', 'TSM']);
});

test('ticker boundaries do not split longer codes or words and allow Chinese adjacency', () => {
  assert.deepEqual(findReviewStockMentions('买TQQQ再GOOGL，不买QQQ和GOOG。'), ['TQQQ', 'GOOGL', 'QQQ', 'GOOG']);
  assert.deepEqual(findReviewStockMentions('XNVDAX NVDA100 myNVDA NVDA.US QQQX SUPERMSFT'), []);
  assert.deepEqual(findReviewStockMentions('买NVDA。MSFT and NVDA.'), ['NVDA', 'MSFT']);
  assert.deepEqual(findReviewStockMentions('$BRK.B, $nOk. $ABCDEFGHIJKLM'), ['BRK.B', 'NOK']);
  assert.deepEqual(findReviewStockMentions('$NVDA.US $VIX $FGI $INDICES $MSFT_extra', ['VIX']), ['NVDA']);
});

test('explicit symbols and user candidates work without promoting arbitrary acronyms', () => {
  assert.deepEqual(findReviewStockMentions('NOK、$abc、TSM', ['NOK']), ['NOK', 'ABC', 'TSM']);
  assert.deepEqual(findReviewStockMentions('AI RSI VIX USD API QQQ'), ['QQQ']);
  assert.deepEqual(findReviewStockMentions('AI ON V T MA; $AI $ON $V $T $MA', ['AI', 'ON', 'T']), ['AI', 'ON', 'V', 'T', 'MA']);
  assert.deepEqual(findReviewStockMentions('now cost arm net team shop snow meta'), []);
  assert.deepEqual(findReviewStockMentions('NOW COST ServiceNow Costco'), ['NOW', 'COST']);
  assert.deepEqual(findReviewStockMentions('Visa 万事达'), ['V', 'MA']);
});

test('specific company names win while index and leveraged descriptions are not guessed', () => {
  assert.deepEqual(findReviewStockMentions('谷歌C、谷歌A、Google Class C'), ['GOOG', 'GOOGL']);
  assert.deepEqual(findReviewStockMentions('纳指 标普 半导体 科技 纳斯达克100 ETF 三倍纳指'), []);
  assert.deepEqual(findReviewStockMentions('2倍英伟达、三倍做多微软、台积电2倍、双倍苹果'), []);
  assert.deepEqual(findReviewStockMentions('做多英伟达、微软涨了2倍'), ['NVDA', 'MSFT']);
  assert.deepEqual(findReviewStockMentions('2倍英伟达 NVDL；之后买英伟达', ['NVDL']), ['NVDL', 'NVDA']);
});

test('new links auto-fill in text order and retain unmentioned manual links', () => {
  assert.deepEqual(resolveReviewStockLinks({ text: 'SMH、英伟达、tsm', selected: ['QQQ'] }), { stocks: ['SMH', 'NVDA', 'TSM', 'QQQ'], omitted: [] });
  assert.deepEqual(resolveReviewStockLinks({ text: '先微软，后NVDA', selected: ['NVDA', 'SPY', 'MSFT', 'QQQ'] }), { stocks: ['MSFT', 'NVDA', 'SPY', 'QQQ'], omitted: [] });
  assert.deepEqual(resolveReviewStockLinks({ text: 'NOK、SMH', suggestions: ['NOK'] }), { stocks: ['NOK', 'SMH'], omitted: [] });
});

test('capacity never evicts existing links and reports omitted mentions in order', () => {
  assert.deepEqual(resolveReviewStockLinks({ text: 'TSM GOOGL SMH NVDA', selected: ['NVDA', 'MSFT', 'QQQ'] }), { stocks: ['TSM', 'NVDA', 'MSFT', 'QQQ'], omitted: ['GOOGL', 'SMH'] });
  const selected = ['NVDA', 'MSFT', 'TSM', 'QQQ', 'SPY', 'BRK_B'];
  assert.deepEqual(resolveReviewStockLinks({ text: 'SPY、SMH', selected }), { stocks: ['SPY', 'NVDA', 'MSFT', 'TSM', 'QQQ', 'BRK_B'], omitted: ['SMH'] });
  assert.deepEqual(resolveReviewStockLinks({ text: 'NVDA', selected: ['TSM'], limit: 0 }), { stocks: ['TSM'], omitted: ['NVDA'] });
});

test('explicit exclusions prevent re-addition, deduplicate and do not mutate inputs', () => {
  const options = { text: 'NVDA TSM $NOK', selected: ['msft', 'NVDA', 'MSFT'], suggestions: ['NOK'], excluded: ['nvda'] };
  const original = structuredClone(options);
  assert.deepEqual(resolveReviewStockLinks(options), { stocks: ['TSM', 'NOK', 'MSFT'], omitted: [] });
  assert.deepEqual(options, original);
  assert.deepEqual(resolveReviewStockLinks({ text: '', selected: ['GOOGL', 'MSFT'] }), { stocks: ['GOOGL', 'MSFT'], omitted: [] });
  assert.deepEqual(resolveReviewStockLinks(), { stocks: [], omitted: [] });
  assert.deepEqual(findReviewStockMentions(null), []);
});

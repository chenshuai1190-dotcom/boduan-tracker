import test from 'node:test';
import assert from 'node:assert/strict';
import { getQuoteMentionQuery, applyQuoteMention } from '../src/lib/quoteAssistantMention.js';

test('typing @ or a Quote prefix at the caret offers the assistant', () => {
  for (const value of ['@', '@q', '@Quo', '@Quote', '@小', '@小助', '@小助手', '你好，@q']) {
    const match = getQuoteMentionQuery(value, value.length);
    assert.ok(match, value);
    const selected = applyQuoteMention(value, match);
    assert.equal(selected.text, value.slice(0, match.start) + '@Quote ');
    assert.equal(selected.selectionStart, selected.text.length);
  }
});

test('email, URL, unrelated handles, selections, completed prose and invalid carets do not suggest', () => {
  for (const value of ['me@q', 'a.b@quote', 'https://site/@q', '@everyone', '@Quote_2', '@Quote hello', '@Quote请分析', 'hello']) {
    assert.equal(getQuoteMentionQuery(value, value.length), null, value);
  }
  assert.equal(getQuoteMentionQuery('@q', 1, 2), null);
  assert.equal(getQuoteMentionQuery('@q', 0), null);
  assert.equal(getQuoteMentionQuery('@q', 9), null);
});

test('insertion edits only the current token, keeps the suffix, and replaces a partial middle token', () => {
  const value = '请帮忙 @Quote 分析回撤';
  const match = getQuoteMentionQuery(value, value.indexOf('@') + 3);
  const result = applyQuoteMention(value, match);
  assert.equal(result.text, value);
  assert.equal(result.selectionStart, value.indexOf('@') + 6);
  const punctuation = '看看 @q，解释一下';
  assert.equal(applyQuoteMention(punctuation, getQuoteMentionQuery(punctuation, punctuation.indexOf('，'))).text, '看看 @Quote ，解释一下');
});

test('a stale or forged suggestion cannot overwrite other text', () => {
  const old = getQuoteMentionQuery('@q', 2);
  assert.equal(applyQuoteMention('hello', old), null);
  assert.equal(applyQuoteMention('@q', { ...old, end: 20 }), null);
  assert.equal(applyQuoteMention('@q', { ...old, query: 'x' }), null);
});

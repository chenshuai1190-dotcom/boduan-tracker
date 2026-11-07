import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { t } from '../src/lib/i18n.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const preview = read('src/DevVisualPreview.jsx');
const goals = read('src/tabs/ReviewTab.jsx');

function runNavigation(name, initial = { tab: 'review', page: null }) {
  const body = app.match(new RegExp(`const ${name} = useCallback\\(\\(\\) => \\{([\\s\\S]*?)\\}, \\[\\]\\);`))?.[1];
  assert.ok(body, `${name} must remain a controlled navigation callback`);
  const state = { ...initial };
  new Function('setActiveTab', 'setActivePage', body)(value => { state.tab = value; }, value => { state.page = value; });
  return state;
}

test('the primary Journal tab and Investment Goals tool open their existing content and return predictably', () => {
  assert.deepEqual(runNavigation('openInvestmentGoals'), { tab: 'trades', page: 'investment-goals' });
  assert.deepEqual(runNavigation('closeInvestmentGoals', { tab: 'trades', page: 'investment-goals' }), { tab: 'trades', page: null });
  assert.deepEqual(runNavigation('openReviewJournal', { tab: 'trades', page: 'investment-goals' }), { tab: 'review', page: null });
  assert.match(app, /const TAB_COMPONENTS = \{[^}]*review:\s*ReviewJournalPage,/);
  assert.match(app, /isInvestmentGoalsPage\s*\? <ReviewTab ctx=\{tabCtx\}/);
  assert.match(goals, /onClick=\{ctx\.closeInvestmentGoals\}/);
  assert.match(goals, /<NorthStarGoalCard\b/);
  assert.match(goals, /<AnnualGoalPlan\b/);
});

test('the Activity tab uses its approved labels while retaining account isolation and investment content', () => {
  assert.equal(t('zh', 'nav.review'), '动态');
  assert.equal(t('en', 'nav.review'), 'Activity');
  assert.match(app, /<ActiveTab key=\{activeTab === 'review' \? user\?\.id \|\| '' : undefined\} ctx=\{activeTabCtx\}/, 'account changes must remount private Journal page state');
  const journalContext = app.match(/const activeTabCtx =[\s\S]*?activeTab === 'review'\s*\? \{([^}]+)\}/)?.[1];
  assert.ok(journalContext);
  assert.match(journalContext, /userId: user\?\.id \|\| ''/);
  assert.match(journalContext, /navigationTab: true/);
  assert.match(journalContext, /\bdisciplines, reviewLogs, setDisciplines, setReviewLogs, stockTrades\b/);
  assert.doesNotMatch(journalContext, /previewData/);
  assert.match(read('src/pages/ReviewJournalPage.jsx'), /language\s*===\s*'en'\s*\?\s*'Investment Activity'\s*:\s*'投资动态'/, 'the module title must match the approved Investment Activity name');
});

test('local previews mirror both navigation entries without changing legacy standalone Journal routes', () => {
  assert.match(preview, /activeTab === 'review'\s*\? <ReviewJournalPreview[^>]*navigationTab/);
  assert.match(preview, /activeTab === 'investment-goals'\s*\? <ReviewTab ctx=\{reviewCtx\}/);
  assert.match(preview, /closeInvestmentGoals: \(\) => \{ setActiveTab\('trades'\)/);
  assert.match(preview, /openReviewJournal: \(\) => \{ setActiveTab\('review'\)/);
  assert.match(preview, /activeTab === 'review-journal'\s*\? <ReviewJournalPreview[^>]*onBack=/);
  assert.match(preview, /activeTab === 'investment-goals' && tab\.id === 'trades'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_REVIEW_PREFERENCES, REVIEW_TIMELINE_TYPES, REVIEW_TIMELINE_DISPLAY_GROUPS, isReviewTimelineGroupEnabled, setReviewTimelineGroupEnabled, normalizeReviewPreferences, patchReviewPreferences } from '../src/lib/reviewPreferences.js';
import { createReviewPreferencesController } from '../src/lib/reviewPreferencesController.js';

const prefs = patch => ({ ...normalizeReviewPreferences(null), ...patch });
const record = (preferences = prefs(), revision = 1) => ({ preferences, revision, exists: true, updatedAt: '2026-11-07T00:00:00Z' });
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a;reject=b; }); return { promise,resolve,reject }; };

test('display defaults include every existing event category and only USD/CNY', () => {
  assert.equal(DEFAULT_REVIEW_PREFERENCES.showTimeline, true);
  assert.equal(DEFAULT_REVIEW_PREFERENCES.currency, 'USD');
  assert.deepEqual(REVIEW_TIMELINE_TYPES.map(type=>type.id), ['net_assets_high','return_high','pnl_high','annual_return_high','annual_return_low','annual_pnl_high','annual_pnl_low','drawdown','return_drawdown','daily_record','stock_daily_record','month','quarter','year']);
  assert.deepEqual(normalizeReviewPreferences(null).eventTypes, REVIEW_TIMELINE_TYPES.map(type=>type.id));
  assert.deepEqual(normalizeReviewPreferences({showTimeline:false,currency:'CNY',eventTypes:['drawdown','unknown','drawdown']}),{showTimeline:false,currency:'CNY',eventTypes:['drawdown']});
  assert.deepEqual(patchReviewPreferences(prefs(),{eventTypes:[]}).eventTypes,[]);
  for(const bad of [null,[],{...prefs(),showTimeline:'false'},{...prefs(),currency:'JPY'},{...prefs(),eventTypes:['unknown']}]) {
    assert.throws(()=>normalizeReviewPreferences(bad,{strict:true}),{code:'REVIEW_PREFERENCES_INVALID'});
  }
  assert.throws(()=>patchReviewPreferences(prefs(),{owner:'other'}),{code:'REVIEW_PREFERENCES_INVALID'});
});

test('display groups cover all fourteen event IDs exactly once', () => {
  const rawIds = REVIEW_TIMELINE_TYPES.map(type => type.id);
  assert.equal(REVIEW_TIMELINE_DISPLAY_GROUPS.length, 11);
  const groupedIds = REVIEW_TIMELINE_DISPLAY_GROUPS.flatMap(group => group.eventTypes);
  assert.deepEqual([...groupedIds].sort(), [...rawIds].sort());
  assert.equal(new Set(groupedIds).size, 14);
  assert.deepEqual(DEFAULT_REVIEW_PREFERENCES.eventTypes, rawIds);
  for (const group of REVIEW_TIMELINE_DISPLAY_GROUPS) assert.equal(isReviewTimelineGroupEnabled(rawIds, group.id), true);
  assert.throws(() => normalizeReviewPreferences(prefs({ eventTypes: ['annual_high'] }), { strict: true }), { code: 'REVIEW_PREFERENCES_INVALID' });
});

test('stock loss records have an independent toggle from account daily records', () => {
  const selected = ['daily_record', 'stock_daily_record'];
  assert.deepEqual(setReviewTimelineGroupEnabled(selected, 'stock_daily_record', false), ['daily_record']);
  assert.deepEqual(setReviewTimelineGroupEnabled(selected, 'daily_record', false), ['stock_daily_record']);
  assert.deepEqual(setReviewTimelineGroupEnabled([], 'stock_daily_record', true), ['stock_daily_record']);
});

test('legacy partial groups display enabled without rewriting settings until explicitly toggled', () => {
  for (const group of REVIEW_TIMELINE_DISPLAY_GROUPS.filter(group => group.eventTypes.length > 1)) {
    const [left, right] = group.eventTypes;
    for (const selected of [[], [left], [right], [left, right]]) {
      const previous = Object.freeze(['net_assets_high', ...selected, 'return_drawdown', 'year']);
      assert.equal(isReviewTimelineGroupEnabled(previous, group.id), selected.length > 0);
      const normalized = normalizeReviewPreferences(prefs({ eventTypes: previous }));
      assert.deepEqual(normalized.eventTypes.filter(id => group.eventTypes.includes(id)), selected, 'normalization does not expand old asymmetric selections');
      for (const enabled of [false, true]) {
        const next = setReviewTimelineGroupEnabled(previous, group.id, enabled);
        assert.deepEqual(next.filter(id => group.eventTypes.includes(id)), enabled ? group.eventTypes : []);
        assert.deepEqual(next.filter(id => !group.eventTypes.includes(id)), ['net_assets_high', 'return_drawdown', 'year']);
        assert.deepEqual(normalizeReviewPreferences(prefs({ eventTypes: next }), { strict: true }).eventTypes, next);
      }
      assert.deepEqual(previous, ['net_assets_high', ...selected, 'return_drawdown', 'year']);
    }
  }
  assert.equal(isReviewTimelineGroupEnabled(undefined, 'annual_high'), false);
  assert.equal(isReviewTimelineGroupEnabled(['return_high'], 'unknown'), false);
  assert.throws(() => setReviewTimelineGroupEnabled([], 'unknown', true), { code: 'REVIEW_PREFERENCES_INVALID' });
});

test('cached hidden categories display immediately without showing defaults while refreshing', async () => {
  const blocked=deferred(), cached=record(prefs({showTimeline:false,eventTypes:['drawdown']}));
  const c=createReviewPreferencesController({userId:'owner',db:{readCachedReviewPreferences:()=>cached,fetchReviewPreferences:()=>blocked.promise}});
  assert.equal(c.getSnapshot().ready,true);
  assert.equal(c.getSnapshot().preferences.showTimeline,false);
  const loading=c.load();
  assert.equal(c.getSnapshot().preferences.showTimeline,false);
  assert.equal(c.getSnapshot().canEdit,false);
  blocked.resolve(cached);await loading;
  assert.equal(c.getSnapshot().preferences.showTimeline,false);
  assert.equal(c.getSnapshot().canEdit,true);
});

test('uncached settings stay unready on read failure instead of exposing defaults', async () => {
  let fails=true;
  const c=createReviewPreferencesController({userId:'owner',db:{fetchReviewPreferences:async()=>{if(fails)throw Error('offline');return record(prefs({currency:'CNY'}));}}});
  assert.equal(c.getSnapshot().ready,false);
  await c.load();assert.equal(c.getSnapshot().ready,false);assert.ok(c.getSnapshot().error);
  fails=false;await c.retry();assert.equal(c.getSnapshot().ready,true);assert.equal(c.getSnapshot().preferences.currency,'CNY');
});

test('same-owner updates are immediate but a pending save cannot start a competing write', async () => {
  const pending=deferred(),calls=[];
  const c=createReviewPreferencesController({userId:'owner',db:{fetchReviewPreferences:async()=>record(),saveReviewPreferences:(...args)=>{calls.push(args);return pending.promise;}}});
  await c.load();const saving=c.updatePreferences({currency:'CNY'});
  assert.equal(c.getSnapshot().preferences.currency,'CNY');assert.equal(c.getSnapshot().saving,true);
  assert.equal(await c.updatePreferences({showTimeline:false}),false);assert.equal(calls.length,1);
  pending.resolve(record(prefs({currency:'CNY'}),2));await saving;
  assert.equal(c.getSnapshot().saving,false);assert.equal(calls[0][1],1);assert.equal(calls[0][2],'owner');
});

test('failed saves roll back; explicit retry merges only failed fields onto a fresh cloud row', async () => {
  let reads=0,writes=0;const saved=[];
  const c=createReviewPreferencesController({userId:'owner',db:{fetchReviewPreferences:async()=>++reads===1?record():record(prefs({eventTypes:['drawdown']}),4),saveReviewPreferences:async(next,revision)=>{
    saved.push({next,revision});if(++writes===1)throw Object.assign(Error('conflict'),{code:'REVIEW_PREFERENCES_CONFLICT'});return record(next,revision+1);
  }}});
  await c.load();await c.updatePreferences({currency:'CNY'});
  assert.equal(c.getSnapshot().preferences.currency,'USD');assert.match(c.getSnapshot().error,/其他页面/);
  await c.retry();assert.equal(c.getSnapshot().error,'');assert.equal(saved[1].revision,4);
  assert.deepEqual(saved[1].next,{showTimeline:true,currency:'CNY',eventTypes:['drawdown']});
});

test('a lost write response followed by retry recognizes the already-saved preference', async () => {
  let row=record(),writes=0;
  const c=createReviewPreferencesController({userId:'owner',db:{fetchReviewPreferences:async()=>row,saveReviewPreferences:async next=>{writes++;row=record(next,2);throw Error('lost response');}}});
  await c.load();await c.updatePreferences({showTimeline:false});assert.equal(c.getSnapshot().preferences.showTimeline,true);
  await c.retry();assert.equal(c.getSnapshot().preferences.showTimeline,false);assert.equal(writes,1);
});

test('cross-tab refresh preserves a failed selection and its retry prompt',async()=>{
 let current=record(),writes=0;const c=createReviewPreferencesController({userId:'owner',db:{fetchReviewPreferences:async()=>current,saveReviewPreferences:async next=>{
  if(++writes===1)throw Error('offline');current=record(next,current.revision+1);return current;
 }}});
 await c.load();await c.updatePreferences({currency:'CNY'});const error=c.getSnapshot().error;
 current=record(prefs({eventTypes:['drawdown']}),4);c.receive(current);
 assert.equal(c.getSnapshot().error,error);assert.deepEqual(c.getSnapshot().preferences.eventTypes,['drawdown']);
 c.receive(record());assert.equal(c.getSnapshot().preferences.eventTypes[0],'drawdown');
 await c.retry();assert.equal(c.getSnapshot().preferences.currency,'CNY');assert.deepEqual(c.getSnapshot().preferences.eventTypes,['drawdown']);
});

test('owner errors disable editing until a fresh authorized read succeeds',async()=>{
 const c=createReviewPreferencesController({userId:'owner',db:{fetchReviewPreferences:async()=>record(),saveReviewPreferences:async()=>{throw Object.assign(Error('switched'),{code:'REVIEW_PREFERENCES_OWNER'});}}});
 await c.load();await c.updatePreferences({currency:'CNY'});
 assert.equal(c.getSnapshot().canEdit,false);assert.equal(c.getSnapshot().preferences.currency,'USD');assert.equal(await c.updatePreferences({showTimeline:false}),false);
});

test('disposed owner requests cannot update observers and StrictMode reactivation reloads safely', async () => {
  const first=deferred();let calls=0,notifications=0;
  const c=createReviewPreferencesController({userId:'owner',db:{fetchReviewPreferences:()=>++calls===1?first.promise:Promise.resolve(record(prefs({showTimeline:false}),2))}});
  c.subscribe(()=>notifications++);const stale=c.load();c.dispose();const before=notifications;
  c.activate();c.subscribe(()=>notifications++);await c.load();first.resolve(record());await stale;
  assert.equal(c.getSnapshot().preferences.showTimeline,false);assert.ok(notifications>before);
});

test('preview changes never call the cloud and preserve type selection when master toggles', async () => {
  const db={fetchReviewPreferences:()=>assert.fail('preview read'),saveReviewPreferences:()=>assert.fail('preview write')};
  const c=createReviewPreferencesController({db,userId:'preview',preview:true});
  await c.updatePreferences({eventTypes:['net_assets_high','return_drawdown']});await c.updatePreferences({showTimeline:false});
  await c.updatePreferences({showTimeline:true});assert.deepEqual(c.getSnapshot().preferences.eventTypes,['net_assets_high','return_drawdown']);
  await c.updatePreferences({currency:'CNY'});assert.equal(c.getSnapshot().preferences.currency,'CNY');
});

test('saving the master switch preserves independent drawdown and annual extrema selections', async () => {
  for (const eventTypes of [[], ['drawdown'], ['return_drawdown'], ['drawdown', 'return_drawdown'], ['annual_return_high', 'annual_pnl_low'], ['annual_return_low', 'annual_pnl_high']]) {
    let stored = record(prefs({ eventTypes }));
    const saved = [];
    const db = { fetchReviewPreferences: async () => stored, saveReviewPreferences: async (next, revision) => {
      saved.push(next); stored = record(next, revision + 1); return stored;
    } };
    const c = createReviewPreferencesController({ userId: 'owner', db });
    await c.load(); await c.updatePreferences({ showTimeline: false }); await c.updatePreferences({ showTimeline: true });
    assert.deepEqual(saved.map(item => item.eventTypes), [eventTypes, eventTypes]);
    assert.deepEqual(c.getSnapshot().preferences.eventTypes, eventTypes);
    assert.equal(c.getSnapshot().preferences.showTimeline, true);
    const reopened = createReviewPreferencesController({ userId: 'owner', db });
    await reopened.load(); assert.deepEqual(reopened.getSnapshot().preferences.eventTypes, eventTypes);
    c.dispose(); reopened.dispose();
  }
});

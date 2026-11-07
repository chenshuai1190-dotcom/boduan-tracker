import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewScrollTracker } from '../src/hooks/useReviewScrollNavigation.js';

test('the feed opens with navigation visible and hides only after intentional downward reading', () => {
  const tracker = createReviewScrollTracker();
  for (const y of [0, 30, 60, 80, 90, 100]) assert.equal(tracker.update(y), false);
  assert.equal(tracker.update(104), true);
  assert.equal(tracker.update(400), true);
  assert.equal(tracker.update(395), true);
  assert.equal(tracker.update(388), false, 'twelve pixels upward restores navigation');
});

test('small alternating movements cannot toggle navigation repeatedly', () => {
  const tracker = createReviewScrollTracker(200);
  for (const y of [204, 201, 207, 203, 209]) assert.equal(tracker.update(y), false);
  assert.equal(tracker.update(231), true);
  for (const y of [227, 230, 225, 228, 220]) assert.equal(tracker.update(y), true);
  assert.equal(tracker.update(216), false);
});

test('iOS overscroll at either edge cannot produce a false direction change', () => {
  const tracker = createReviewScrollTracker();
  for (const y of [-70, -20, 0, 60, 80]) assert.equal(tracker.update(y, 1000), false);
  assert.equal(tracker.update(200, 1000), true);
  assert.equal(tracker.update(1000, 1000), true);
  assert.equal(tracker.update(1060, 1000), true);
  assert.equal(tracker.update(1020, 1000), true);
  assert.equal(tracker.update(1000, 1000), true);
  assert.equal(tracker.update(988, 1000), false);
  assert.equal(tracker.update(80, 1000), false);
});

test('reset on entry or keyboard navigation reveals the bar and discards prior scroll travel', () => {
  const tracker = createReviewScrollTracker(200);
  assert.equal(tracker.update(250), true);
  assert.equal(tracker.reset(500, 1000), false);
  assert.equal(tracker.update(510, 1000), false);
  assert.equal(tracker.update(524, 1000), true);
  assert.equal(tracker.reset(524, 1000), false);
  assert.equal(tracker.update(524, 1000), false);
});

test('short documents and shrinking page height keep edge movements neutral', () => {
  const short = createReviewScrollTracker(100);
  for (const y of [-40, 0, 80, 160]) assert.equal(short.update(y, 0), false);
  const tracker = createReviewScrollTracker(400, 1000);
  assert.equal(tracker.update(450, 1000), true);
  assert.equal(tracker.update(200, 200), true, 'clamp both positions after the document shrinks');
  assert.equal(tracker.update(188, 200), false);
});

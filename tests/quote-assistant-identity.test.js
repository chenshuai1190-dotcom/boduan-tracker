import test from 'node:test';
import assert from 'node:assert/strict';
import { mapReviewPublicPost } from '../src/lib/reviewPublicModel.js';
import { mapReviewCommunityEvaluation, buildReviewCommunityEvaluation } from '../src/lib/reviewCommunityEvaluationModel.js';
import { mapReviewThreadComment } from '../src/lib/reviewInteractionModel.js';
import { mapReviewNotification } from '../src/lib/reviewNotificationModel.js';

const authorId = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const time = '2026-11-08T12:00:00.123456Z';
const author = { nickname: 'Quote', avatarKey: 'gold', avatarPath: null };
const post = { id: 'log:42', sourceId: '42', type: 'log', authorId, author,
  text: 'Hello', date: '2026-11-08', publishedAt: time, updatedAt: time,
  stocks: [], images: [], replies: [], market: null, likeCount: 0, liked: false };
const reply = { id, postId: post.id, authorId, author, text: 'Hello', date: post.date,
  createdAt: time, updatedAt: time, revision: 1, replyTo: null };
const notification = { id, postId: post.id, actorId: authorId, actor: author,
  kind: 'reply', commentId: id, createdAt: time, readAt: null, score: null,
  excerpt: 'Hello', postExcerpt: 'Hello' };
const mappers = [
  value => mapReviewPublicPost({ ...post, author: value }).author,
  value => mapReviewCommunityEvaluation({ ...reply, author: value }, post.id).author,
  value => mapReviewThreadComment({ ...reply, author: value, kind: 'community', sortCreatedAt: time,
    deleted: false, directReplyCount: 0, liked: false, likeCount: 0 }, post.id).author,
  value => mapReviewNotification({ ...notification, actor: value }).actor,
];
test('server-projected assistant identity survives feed, evaluation, thread and notification normalization', () => {
  for (const map of mappers) assert.equal(map({ ...author, isAssistant: true }).isAssistant, true);
});
test('a nickname or truthy nonboolean cannot give a normal author the assistant identity', () => {
  for (const map of mappers) for (const value of [undefined, false, 'true', 1, {}]) {
    assert.equal(map({ ...author, isAssistant: value }).isAssistant, undefined);
  }
});
test('human evaluation writes cannot submit an assistant identity or choose another author', () => {
  const payload = buildReviewCommunityEvaluation({ ...reply, isAssistant: true, author: { ...author, isAssistant: true } }, authorId);
  assert.equal(payload.author, undefined);
  assert.equal(payload.authorId, undefined);
  assert.equal(payload.isAssistant, undefined);
});

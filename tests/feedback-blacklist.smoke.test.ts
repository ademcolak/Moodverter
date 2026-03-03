import assert from 'node:assert/strict';
import test, { before, beforeEach } from 'node:test';
import {
  analyzeTrackWithHeuristicV1,
  clearTransitionData,
  findTransitionCandidates,
  getTransitionFeedbackModel,
  recordTransitionFeedback,
} from '../src/services/transition';
import { installBrowserMocks, resetBrowserMocks } from './helpers/browser-mocks';

before(() => {
  installBrowserMocks();
});

beforeEach(() => {
  resetBrowserMocks();
  clearTransitionData();
});

test('feedback blacklist activates after bad streak and expires back to eligible', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-feedback-blacklist',
    name: 'Seed Feedback Blacklist',
    artist: 'Seed Artist',
    durationMs: 182_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-feedback-bad',
    name: 'Target Feedback Bad',
    artist: 'Target Artist',
    durationMs: 179_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-feedback-good',
    name: 'Target Feedback Good',
    artist: 'Target Artist',
    durationMs: 179_000,
  });

  const beforeBlacklist = await findTransitionCandidates({
    trackId: 'seed-feedback-blacklist',
    limit: 5,
  });
  assert.ok(
    beforeBlacklist.some((candidate) => candidate.targetTrackId === 'target-feedback-bad'),
    'target-feedback-bad should be eligible before blacklist'
  );

  recordTransitionFeedback({
    sourceTrackId: 'seed-feedback-blacklist',
    targetTrackId: 'target-feedback-bad',
    rating: 'bad',
  });
  recordTransitionFeedback({
    sourceTrackId: 'seed-feedback-blacklist',
    targetTrackId: 'target-feedback-bad',
    rating: 'bad',
  });
  recordTransitionFeedback({
    sourceTrackId: 'seed-feedback-blacklist',
    targetTrackId: 'target-feedback-bad',
    rating: 'bad',
  });

  const model = getTransitionFeedbackModel();
  const pair = model.byPair['seed-feedback-blacklist->target-feedback-bad'];
  assert.ok(pair, 'feedback pair should exist');
  assert.equal(pair.badStreak >= 3, true);
  assert.equal(typeof pair.blacklistUntil, 'string');

  const duringBlacklist = await findTransitionCandidates({
    trackId: 'seed-feedback-blacklist',
    limit: 5,
  });
  assert.equal(
    duringBlacklist.some((candidate) => candidate.targetTrackId === 'target-feedback-bad'),
    false,
    'blacklisted target should be filtered out'
  );

  const originalDateNow = Date.now;
  try {
    Date.now = () => originalDateNow() + 8 * 24 * 60 * 60 * 1000;
    const afterExpiry = await findTransitionCandidates({
      trackId: 'seed-feedback-blacklist',
      limit: 5,
    });
    assert.equal(
      afterExpiry.some((candidate) => candidate.targetTrackId === 'target-feedback-bad'),
      true,
      'expired blacklist target should be eligible again'
    );
  } finally {
    Date.now = originalDateNow;
  }
});

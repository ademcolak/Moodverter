"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeMeanTransitionScore = computeMeanTransitionScore;
exports.computeHitAtK = computeHitAtK;
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function computeMeanTransitionScore(candidates) {
    if (candidates.length === 0)
        return 0;
    const validScores = candidates
        .map((candidate) => candidate.score.finalScore)
        .filter((score) => Number.isFinite(score));
    if (validScores.length === 0)
        return 0;
    const total = validScores.reduce((sum, score) => sum + score, 0);
    return clamp(total / validScores.length, 0, 1);
}
function computeHitAtK(candidates, relevantTargetTrackIds, k) {
    if (k <= 0 || candidates.length === 0 || relevantTargetTrackIds.length === 0) {
        return 0;
    }
    const relevant = new Set(relevantTargetTrackIds);
    const topK = candidates.slice(0, k);
    const hit = topK.some((candidate) => relevant.has(candidate.targetTrackId));
    return hit ? 1 : 0;
}

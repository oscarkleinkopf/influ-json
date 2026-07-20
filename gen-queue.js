/**
 * F3 — Global image generation queue (free Pollinations path).
 * - One generation at a time (no parallel spam)
 * - Minimum gap between jobs to reduce HTTP 429
 * - Tracks last rate-limit time for status/UX
 */

const MIN_GAP_MS = Number(process.env.GEN_MIN_GAP_MS) || 10000; // 10s between jobs
const RATE_LIMIT_COOLDOWN_MS = Number(process.env.GEN_429_COOLDOWN_MS) || 30000; // 30s after 429

let chain = Promise.resolve();
let busy = false;
let lastJobStartedAt = 0;
let lastJobFinishedAt = 0;
let lastRateLimitedAt = 0;
let queueLength = 0;
let currentLabel = null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getStatus() {
  const now = Date.now();
  const since429 = lastRateLimitedAt ? now - lastRateLimitedAt : null;
  const in429Cooldown = lastRateLimitedAt && since429 < RATE_LIMIT_COOLDOWN_MS;
  const gapLeft = Math.max(0, MIN_GAP_MS - (now - lastJobFinishedAt));
  return {
    busy,
    queueLength,
    currentLabel,
    minGapMs: MIN_GAP_MS,
    rateLimitCooldownMs: RATE_LIMIT_COOLDOWN_MS,
    lastRateLimitedAt: lastRateLimitedAt || null,
    rateLimitActive: !!in429Cooldown,
    retryAfterSeconds: in429Cooldown
      ? Math.ceil((RATE_LIMIT_COOLDOWN_MS - since429) / 1000)
      : busy
        ? null
        : gapLeft > 0
          ? Math.ceil(gapLeft / 1000)
          : 0
  };
}

/**
 * Mark that Pollinations returned 429 (called from ai-service).
 */
function markRateLimited() {
  lastRateLimitedAt = Date.now();
  console.warn(`[gen-queue] Rate limited at ${new Date(lastRateLimitedAt).toISOString()} — cooldown ${RATE_LIMIT_COOLDOWN_MS}ms`);
}

/**
 * Serialize async generation work.
 * @param {string} label
 * @param {() => Promise<any>} jobFn
 */
function enqueue(label, jobFn) {
  queueLength += 1;
  const job = chain.then(async () => {
    queueLength = Math.max(0, queueLength - 1);

    // Honor post-429 cooldown
    if (lastRateLimitedAt) {
      const left = RATE_LIMIT_COOLDOWN_MS - (Date.now() - lastRateLimitedAt);
      if (left > 0) {
        console.log(`[gen-queue] Waiting ${left}ms (429 cooldown) before "${label}"`);
        await sleep(left);
      }
    }

    // Minimum gap between jobs
    const sinceFinish = Date.now() - lastJobFinishedAt;
    if (lastJobFinishedAt && sinceFinish < MIN_GAP_MS) {
      const wait = MIN_GAP_MS - sinceFinish;
      console.log(`[gen-queue] Gap wait ${wait}ms before "${label}"`);
      await sleep(wait);
    }

    busy = true;
    currentLabel = label || 'generate';
    lastJobStartedAt = Date.now();
    console.log(`[gen-queue] START "${currentLabel}" (queue left: ${queueLength})`);

    try {
      const result = await jobFn();
      return result;
    } catch (err) {
      if (err && (err.status === 429 || /429|rate limit|límite/i.test(err.message || ''))) {
        markRateLimited();
      }
      throw err;
    } finally {
      busy = false;
      currentLabel = null;
      lastJobFinishedAt = Date.now();
      console.log(`[gen-queue] END (took ${lastJobFinishedAt - lastJobStartedAt}ms)`);
    }
  });

  // Prevent unhandled rejection from breaking the chain
  chain = job.catch(() => {});
  return job;
}

module.exports = {
  enqueue,
  getStatus,
  markRateLimited,
  MIN_GAP_MS,
  RATE_LIMIT_COOLDOWN_MS
};

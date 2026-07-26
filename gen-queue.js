/**
 * F3 — Global image generation queue (free Pollinations path).
 * - One generation at a time (no parallel spam)
 * - Minimum gap between jobs to reduce HTTP 429
 * - Tracks last rate-limit time for status/UX
 * - Automatic task retry on HTTP 429 rate limit
 */

const getMinGapMs = () => (process.env.GEN_MIN_GAP_MS !== undefined ? Number(process.env.GEN_MIN_GAP_MS) : 10000);
const getCooldownMs = () => (process.env.GEN_429_COOLDOWN_MS !== undefined ? Number(process.env.GEN_429_COOLDOWN_MS) : 30000);

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
  const cooldownMs = getCooldownMs();
  const minGapMs = getMinGapMs();
  const since429 = lastRateLimitedAt ? now - lastRateLimitedAt : null;
  const in429Cooldown = lastRateLimitedAt ? since429 < cooldownMs : false;
  const cooldownRemainingMs = in429Cooldown ? Math.max(0, cooldownMs - since429) : 0;
  const gapLeft = Math.max(0, minGapMs - (now - lastJobFinishedAt));

  return {
    active: busy,
    pendingCount: queueLength,
    isCoolingDown: !!in429Cooldown,
    cooldownRemainingMs,
    currentTaskInfo: busy ? { label: currentLabel, startedAt: lastJobStartedAt } : null,
    busy,
    queueLength,
    currentLabel,
    minGapMs,
    rateLimitCooldownMs: cooldownMs,
    lastRateLimitedAt: lastRateLimitedAt || null,
    rateLimitActive: !!in429Cooldown,
    retryAfterSeconds: in429Cooldown
      ? Math.ceil(cooldownRemainingMs / 1000)
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
  console.warn(`[gen-queue] Rate limited at ${new Date(lastRateLimitedAt).toISOString()} — cooldown ${getCooldownMs()}ms`);
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

    const cooldownMs = getCooldownMs();
    const minGapMs = getMinGapMs();

    // Honor post-429 cooldown
    if (lastRateLimitedAt) {
      const left = cooldownMs - (Date.now() - lastRateLimitedAt);
      if (left > 0) {
        console.log(`[gen-queue] Waiting ${left}ms (429 cooldown) before "${label}"`);
        await sleep(left);
      }
    }

    // Minimum gap between jobs
    const sinceFinish = Date.now() - lastJobFinishedAt;
    if (lastJobFinishedAt && sinceFinish < minGapMs) {
      const wait = minGapMs - sinceFinish;
      console.log(`[gen-queue] Gap wait ${wait}ms before "${label}"`);
      await sleep(wait);
    }

    busy = true;
    currentLabel = label || 'generate';
    lastJobStartedAt = Date.now();
    console.log(`[gen-queue] START "${currentLabel}" (queue left: ${queueLength})`);

    let attempts = 0;
    const maxRetries = 2; // Allow up to 2 automatic retries on 429

    try {
      while (true) {
        try {
          const result = await jobFn();
          return result;
        } catch (err) {
          const is429 = err && (err.status === 429 || /429|rate limit|límite/i.test(err.message || ''));
          if (is429 && attempts < maxRetries) {
            attempts++;
            markRateLimited();
            const currentCooldown = getCooldownMs();
            console.warn(`[gen-queue] Task "${currentLabel}" hit 429 rate limit. Cooling down ${currentCooldown}ms before retry attempt ${attempts}/${maxRetries}...`);
            await sleep(currentCooldown);
            continue;
          }
          if (is429) {
            markRateLimited();
          }
          throw err;
        }
      }
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
  get MIN_GAP_MS() { return getMinGapMs(); },
  get RATE_LIMIT_COOLDOWN_MS() { return getCooldownMs(); }
};


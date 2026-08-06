const rawFetch = require('node-fetch');

const FETCH_TIMEOUT_MS = 20000;

/**
 * fetch with an abort-based timeout and a single 429 backoff retry.
 *
 * A hung socket would otherwise stall whichever polling loop is awaiting it
 * indefinitely, and an unhandled 429 makes the caller keep hammering the API
 * at the same rate it was just rate-limited for.
 */
async function fetchWithRetry(url, options = {}, _retried = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await rawFetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429 && !_retried) {
    const retryAfter = parseInt(res.headers.get('retry-after'), 10) || 2;
    console.log(`⏳ Rate limited (429). Waiting ${retryAfter}s before retry: ${url}`);
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    return fetchWithRetry(url, options, true);
  }

  return res;
}

module.exports = { fetchWithRetry, FETCH_TIMEOUT_MS };

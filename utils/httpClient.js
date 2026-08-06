const rawFetch = require('node-fetch');

const FETCH_TIMEOUT_MS = 20000;

// Never sleep longer than this on a 429, however large Retry-After is. The key
// mint endpoint answers an exhausted daily quota with Retry-After: 39719 - and
// honouring that verbatim parked the whole polling loop for eleven hours.
// Past this ceiling we hand the 429 back and let the caller decide.
const MAX_BACKOFF_MS = 60000;

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
    const retryAfterMs = (parseInt(res.headers.get('retry-after'), 10) || 2) * 1000;

    if (retryAfterMs > MAX_BACKOFF_MS) {
      console.log(`⏳ Rate limited (429), Retry-After ${Math.round(retryAfterMs / 1000)}s exceeds the ${MAX_BACKOFF_MS / 1000}s ceiling - not retrying: ${url}`);
      return res;
    }

    console.log(`⏳ Rate limited (429). Waiting ${Math.round(retryAfterMs / 1000)}s before retry: ${url}`);
    await new Promise(resolve => setTimeout(resolve, retryAfterMs));
    return fetchWithRetry(url, options, true);
  }

  return res;
}

module.exports = { fetchWithRetry, FETCH_TIMEOUT_MS };

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { fetchWithRetry: fetch } = require('./httpClient');

// The free "instant" OpenSea key expires after 7 days, is revoked when the rate
// limit is tripped, and can only be minted twice per day per source IP. This
// module resolves a usable key (env > disk cache > fresh mint) and never throws:
// a failed mint returns null so the caller can keep running and retry later.
const MINT_URL = 'https://api.opensea.io/api/v2/auth/keys';
const KEY_FILE = path.join(__dirname, '..', 'data', 'opensea-key.json');

// Treat a key as unusable once it is within an hour of expiry.
const EXPIRY_MARGIN_MS = 60 * 60 * 1000;
// Hard floor between two mint attempts, so a restart loop cannot burn the 2/day allowance.
const MIN_MINT_INTERVAL_MS = 30 * 60 * 1000;

let currentKey = null;
let lastMintAttemptAt = 0;

/**
 * Human readable duration, e.g. "4d 6h", "6h 12m", "42m".
 */
function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function readCache() {
  try {
    if (!fs.existsSync(KEY_FILE)) return null;
    return JSON.parse(fs.readFileSync(KEY_FILE, 'utf-8'));
  } catch (error) {
    console.log(`⚠️ Could not read OpenSea key cache: ${error.message}`);
    return null;
  }
}

function writeCache(record) {
  try {
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    fs.writeFileSync(KEY_FILE, JSON.stringify(record, null, 2), { mode: 0o600 });
    // writeFileSync keeps the mode of an already existing file, so enforce it.
    fs.chmodSync(KEY_FILE, 0o600);
    return true;
  } catch (error) {
    console.log(`⚠️ Could not persist OpenSea key cache: ${error.message}`);
    return false;
  }
}

/**
 * Milliseconds until the given expiry, or null when it is unknown/unparsable.
 */
function msUntilExpiry(expiresAt) {
  if (!expiresAt) return null;
  const ts = new Date(expiresAt).getTime();
  if (!Number.isFinite(ts)) return null;
  return ts - Date.now();
}

/**
 * Refuse to mint more often than MIN_MINT_INTERVAL_MS. The last attempt is
 * tracked both in-process and in the cache file so restarts are covered too.
 */
function mintAllowed(cached) {
  const persisted = Number(cached?.lastMintAttemptAt) || 0;
  const lastAttempt = Math.max(lastMintAttemptAt, persisted);
  if (!lastAttempt) return true;

  const elapsed = Date.now() - lastAttempt;
  if (elapsed < MIN_MINT_INTERVAL_MS) {
    console.log(`⚠️ OpenSea key mint throttled - next attempt allowed in ${formatDuration(MIN_MINT_INTERVAL_MS - elapsed)}`);
    return false;
  }
  return true;
}

/**
 * Pull the error text out of a failed mint response without ever logging a key.
 */
async function describeError(response) {
  try {
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      if (Array.isArray(json.errors) && json.errors.length > 0) {
        return json.errors.join('; ');
      }
    } catch (_) {
      // not JSON, fall through to the raw body
    }
    return text.slice(0, 200);
  } catch (error) {
    return error.message;
  }
}

/**
 * Mint a fresh free key and persist it. Returns the key string or null.
 */
async function mintKey() {
  const cached = readCache();
  if (!mintAllowed(cached)) return null;

  lastMintAttemptAt = Date.now();
  // Persist the attempt before firing it, so a crash-restart loop still counts it.
  writeCache({ ...(cached || {}), lastMintAttemptAt });

  try {
    console.log('🔍 Requesting a fresh OpenSea API key...');
    const response = await fetch(MINT_URL, {
      method: 'POST',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      console.log(`⚠️ OpenSea key mint failed (${response.status}): ${await describeError(response)}`);
      return null;
    }

    const data = await response.json();
    if (!data || typeof data.api_key !== 'string' || data.api_key.length === 0) {
      console.log('⚠️ OpenSea key mint returned no api_key');
      return null;
    }

    const record = {
      api_key: data.api_key,
      name: data.name,
      expires_at: data.expires_at,
      rate_limits: data.rate_limits,
      mintedAt: new Date().toISOString(),
      lastMintAttemptAt
    };
    writeCache(record);

    currentKey = data.api_key;
    const remaining = msUntilExpiry(data.expires_at);
    if (remaining !== null) {
      console.log(`✅ OpenSea key minted (length ${currentKey.length}), expires in ${formatDuration(remaining)}`);
    } else {
      console.log(`✅ OpenSea key minted (length ${currentKey.length}), expiry unknown`);
    }
    return currentKey;
  } catch (error) {
    console.log(`⚠️ OpenSea key mint failed: ${error.message}`);
    return null;
  }
}

/**
 * Resolve a key: operator supplied env key first, then a still-valid cached key,
 * then a fresh mint. Returns the key string or null.
 */
async function resolveKey() {
  try {
    const envKey = typeof config.opensea.apiKey === 'string' ? config.opensea.apiKey.trim() : '';
    if (envKey) {
      // Never overwrite a key the operator supplied.
      currentKey = envKey;
      console.log(`🔑 OpenSea key from env (length ${envKey.length})`);
      return currentKey;
    }

    const cached = readCache();
    const remaining = msUntilExpiry(cached?.expires_at);
    if (cached?.api_key && remaining !== null && remaining > EXPIRY_MARGIN_MS) {
      currentKey = cached.api_key;
      console.log(`🔑 OpenSea key from cache, expires in ${formatDuration(remaining)}`);
      return currentKey;
    }

    return await mintKey();
  } catch (error) {
    console.log(`⚠️ OpenSea key resolution failed: ${error.message}`);
    return null;
  }
}

/**
 * Skip the cache and mint a new key. Returns the key string or null.
 */
async function forceRenew(reason) {
  try {
    console.log(`🔑 Renewing OpenSea key: ${reason || 'no reason given'}`);
    return await mintKey();
  } catch (error) {
    console.log(`⚠️ OpenSea key renewal failed: ${error.message}`);
    return null;
  }
}

/**
 * Last resolved key, or null. Synchronous accessor for hot call sites.
 */
function getCurrentKey() {
  return currentKey;
}

module.exports = { resolveKey, forceRenew, getCurrentKey };

// Single source of truth for chain handling. The same chain map used to be
// copy-pasted a dozen times across nftTracker/discordNotifier, and every copy
// fell back to Ethereum for anything it didn't know - so a live `robinhood`
// event was labelled "Ethereum", every OpenSea lookup 404'd on
// /chain/ethereum/... and the Explorer link pointed at a transaction that does
// not exist on etherscan. OpenSea's own slug is exactly what its API paths and
// opensea.io/assets/<chain>/... URLs expect, so unknown chains pass through
// verbatim instead of being rewritten to ethereum.

const CHAINS = [
  { slug: 'ethereum', name: 'Ethereum', symbol: 'ETH', explorer: 'https://etherscan.io' },
  { slug: 'ape_chain', name: 'ApeChain', symbol: 'APE', explorer: null },
  { slug: 'base', name: 'Base', symbol: 'ETH', explorer: 'https://basescan.org' },
  { slug: 'polygon', name: 'Polygon', symbol: 'MATIC', explorer: 'https://polygonscan.com' },
  { slug: 'arbitrum', name: 'Arbitrum', symbol: 'ETH', explorer: 'https://arbiscan.io' },
  { slug: 'optimism', name: 'Optimism', symbol: 'ETH', explorer: 'https://optimistic.etherscan.io' },
  { slug: 'bsc', name: 'BSC', symbol: 'BNB', explorer: 'https://bscscan.com' },
  { slug: 'avalanche', name: 'Avalanche', symbol: 'AVAX', explorer: 'https://snowtrace.io' },
  { slug: 'berachain', name: 'Berachain', symbol: 'BERA', explorer: 'https://berascan.com' },
  { slug: 'abstract', name: 'Abstract', symbol: 'ABS', explorer: 'https://abstract.money' },
  { slug: 'robinhood', name: 'Robinhood', symbol: 'ETH', explorer: null }
];

const BY_SLUG = new Map(CHAINS.map(chain => [chain.slug, chain]));
const BY_NAME = new Map(CHAINS.map(chain => [chain.name.toLowerCase(), chain]));

// One warning per unmapped chain, so a new OpenSea chain surfaces in the logs
// instead of quietly corrupting data.
const warnedChains = new Set();

function warnUnknown(chain) {
  const key = String(chain).toLowerCase();
  if (warnedChains.has(key)) return;
  warnedChains.add(key);
  console.log(`⚠️ Unknown chain "${chain}" - using the raw OpenSea slug (add it to utils/chains.js)`);
}

/**
 * Resolve either an OpenSea slug ('ape_chain') or a display name ('ApeChain')
 * to the known chain record. Returns null when the chain is not mapped.
 */
function resolveChain(chain) {
  const key = String(chain || '').trim().toLowerCase();
  if (!key) return null;
  return BY_SLUG.get(key) || BY_NAME.get(key) || null;
}

function titleCase(slug) {
  const value = String(slug || '');
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/**
 * Display name -> OpenSea chain slug, for API paths and asset URLs.
 * Unmapped chains keep their raw slug instead of becoming 'ethereum'.
 */
function toOpenSeaChain(displayName) {
  const raw = String(displayName || '').trim();
  if (!raw) return 'ethereum'; // nothing to go on at all
  const known = resolveChain(raw);
  if (known) return known.slug;
  warnUnknown(raw);
  return raw.toLowerCase();
}

/**
 * OpenSea chain slug -> display name. Unmapped chains are title-cased
 * ('robinhood' -> 'Robinhood') so the embed never claims the wrong chain.
 */
function toDisplayName(openSeaChain) {
  const raw = String(openSeaChain || '').trim();
  if (!raw) return 'Ethereum';
  const known = resolveChain(raw);
  if (known) return known.name;
  warnUnknown(raw);
  return titleCase(raw);
}

/**
 * Native token symbol for a chain, accepting a slug or a display name.
 */
function getNativeSymbol(chain) {
  const known = resolveChain(chain);
  return known ? known.symbol : 'ETH';
}

/**
 * Block explorer URL for a chain, accepting a slug or a display name.
 * Returns null when no explorer is known - a confidently wrong etherscan link
 * is worse than no link at all.
 */
function getExplorerUrl(chain, hash, type = 'tx') {
  const known = resolveChain(chain);
  if (!known || !known.explorer || !hash) return null;
  const path = type === 'address' ? 'address' : 'tx';
  return `${known.explorer}/${path}/${hash}`;
}

module.exports = { toOpenSeaChain, toDisplayName, getNativeSymbol, getExplorerUrl };

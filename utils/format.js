// Shared display formatting for PnL and hold time. Both used to be copy-pasted
// (PnL twice inside createEmbed, hold time in four places), and every edit to
// one copy drifted the others - a threshold fixed in one branch stayed broken
// in the next one down.

/**
 * Native token amount for a PnL line: a floor of 0.0001, 2 decimals from 1 up,
 * 4 decimals in between. Callers pass an absolute value; the sign is theirs.
 */
function formatNativeAmount(amount, symbol) {
  if (amount < 0.0001) return `<0.0001 ${symbol}`;
  if (amount >= 1) return `${Math.round(amount * 100) / 100} ${symbol}`;
  return `${amount.toFixed(4)} ${symbol}`;
}

/**
 * PnL field text plus its emoji. The percentage line is dropped entirely
 * against a zero cost basis (a free mint), where any gain is mathematically
 * infinite and the number says nothing.
 */
function formatPnl({ pnl, pnlUSD, buyPrice, symbol }) {
  const sign = pnl > 0 ? '+' : pnl < 0 ? '-' : '';
  const absPnl = Math.abs(pnl);
  const absUsd = Math.abs(pnlUSD);
  const percentage = buyPrice > 0 ? (pnl / buyPrice) * 100 : null;

  const usdContent = (isNaN(absUsd) || !isFinite(absUsd) || absUsd < 1)
    ? '<$1'
    : `$${Math.round(absUsd * 100) / 100}`;

  const lines = [`${sign}${formatNativeAmount(absPnl, symbol)}`, `${sign}${usdContent}`];
  if (percentage !== null && !isNaN(percentage) && isFinite(percentage)) {
    lines.push(Math.abs(percentage) < 1 ? `${sign}<1%` : `${sign}${Math.abs(percentage).toFixed(1)}%`);
  }

  return {
    value: lines.join('\n'),
    emoji: pnl > 0 ? '🤑' : (pnl < 0 ? '😢' : '🫥')
  };
}

/**
 * Millisecond difference -> "Nmin" / "Nh Nmin" / "N day(s)". A negative, zero,
 * NaN or non-finite input has no hold time to show and reads as '-'; call sites
 * that display something else for those cases handle them before calling.
 */
function formatHoldTime(ms) {
  if (!isFinite(ms) || ms <= 0) return '-';

  const minutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  if (minutes < 60) return `${minutes}min`;
  if (hours < 24) return `${hours}h ${Math.floor(minutes % 60)}min`;
  return days === 1 ? `${days} day` : `${days} days`;
}

module.exports = { formatNativeAmount, formatPnl, formatHoldTime };

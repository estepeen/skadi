// Mint detection in one place. OpenSea's events endpoints answer an
// `event_type=mint` query with events whose event_type is "transfer" - the real
// discriminator is the separate transfer_type field. Every mint test has to look
// at both, or the whole class of events is dropped before it is ever processed.

/**
 * True when an OpenSea event is a mint, whether it is reported as a dedicated
 * 'mint' event or as a transfer carrying transfer_type 'mint'.
 */
function isMintEvent(event) {
  if (!event) return false;
  if (event.event_type === 'mint') return true;
  return event.event_type === 'transfer' && event.transfer_type === 'mint';
}

module.exports = { isMintEvent };

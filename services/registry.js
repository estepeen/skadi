let nftTracker = null;
let discordNotifier = null;

module.exports = {
  setNFTTracker(instance) { nftTracker = instance; },
  getNFTTracker() { return nftTracker; },
  setDiscordNotifier(instance) { discordNotifier = instance; },
  getDiscordNotifier() { return discordNotifier; }
};

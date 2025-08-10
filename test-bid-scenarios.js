require('dotenv').config();
const DiscordNotifier = require('./services/discordNotifier');
const NFTTracker = require('./services/nftTracker');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function testBidAccepted(notifier, tracker) {
  // Simulate a bid accepted event where wallet accepts WETH bid
  const chainName = 'Ethereum';
  const contractAddress = '0x1234567890123456789012345678901234567890';
  const tokenId = '1234';

  const data = {
    type: 'sale',
    isBulk: false,
    walletName: 'TestWallet',
    walletAddress: '0x1234567890123456789012345678901234567890',
    tokenName: 'Test Collection',
    tokenId: tokenId,
    contractAddress,
    transactionHash: '0x' + 'bid'.repeat(21),
    chainName,
    timestamp: new Date(),
    price: 0.5,
    priceUSD: 1000,
    quantity: 1,
    imageUrl: null,
    nftName: `Test Collection #${tokenId}`,
    nativeSymbol: 'WETH',
    floorPrice: 0.4,
    isBidAccepted: true, // This is the key flag for bid accepted
    buyPrice: 0.3, // Simulate previous purchase for PnL
    buyPriceUSD: 600,
    buyTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
  };

  await notifier.sendNotification(data, tracker);
}

async function testBidPurchase(notifier, tracker) {
  // Simulate a bid purchase event where wallet buys NFT via bid
  const chainName = 'Ethereum';
  const contractAddress = '0x1234567890123456789012345678901234567890';
  const tokenId = '5678';

  const data = {
    type: 'purchase',
    isBulk: false,
    walletName: 'TestWallet',
    walletAddress: '0x1234567890123456789012345678901234567890',
    tokenName: 'Test Collection',
    tokenId: tokenId,
    contractAddress,
    transactionHash: '0x' + 'buy'.repeat(21),
    chainName,
    timestamp: new Date(),
    price: 0.6,
    priceUSD: 1200,
    quantity: 1,
    imageUrl: null,
    nftName: `Test Collection #${tokenId}`,
    nativeSymbol: 'WETH',
    floorPrice: 0.4,
    isBidAccepted: false
  };

  await notifier.sendNotification(data, tracker);
}

async function run() {
  const notifier = new DiscordNotifier();
  const tracker = new NFTTracker();
  try {
    console.log('🔗 Connecting to Discord...');
    await notifier.connect();
    await new Promise((resolve) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (notifier.isReady || Date.now() - start > 10000) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });

    console.log('🧪 Testing bid accepted scenario (WETH offer accepted)');
    await testBidAccepted(notifier, tracker);
    await sleep(1000);

    console.log('🧪 Testing bid purchase scenario (buying via bid)');
    await testBidPurchase(notifier, tracker);

    console.log('✅ All bid scenarios tested');
  } catch (e) {
    console.error('❌ Bid scenarios failed:', e);
  } finally {
    await notifier.disconnect();
  }
}

run();

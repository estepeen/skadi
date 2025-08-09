require('dotenv').config();
const DiscordNotifier = require('./services/discordNotifier');
const NFTTracker = require('./services/nftTracker');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sendSingleBasePaint(notifier, tracker) {
  // BasePaint contract on Base
  const chainName = 'Base';
  const contractAddress = '0x1b7902f8bfe3ff8b074e113d60f7d6f8a1dc9d46';
  const tokenId = '232';

  // Try fetch collection info and floor
  const floorPrice = await tracker.getFloorPrice(contractAddress, chainName, 'basepaint');
  const nftMeta = await tracker.getNFTMetadata(contractAddress, tokenId, chainName);

  const data = {
    type: 'purchase',
    isBulk: false,
    walletName: 'TestWallet',
    walletAddress: '0x1234567890123456789012345678901234567890',
    tokenName: 'BasePaint',
    tokenId: tokenId,
    contractAddress,
    transactionHash: '0x' + 'a'.repeat(64),
    chainName,
    timestamp: new Date(),
    price: 0.01,
    priceUSD: 0,
    quantity: 1,
    imageUrl: nftMeta?.imageUrl || null,
    nftName: null,
    nativeSymbol: 'ETH',
    floorPrice: floorPrice || '-'
  };

  await notifier.sendNotification(data, tracker);
}

async function sendBulkBasePaint(notifier, tracker) {
  const chainName = 'Base';
  const contractAddress = '0x1b7902f8bfe3ff8b074e113d60f7d6f8a1dc9d46';
  const ids = ['323','111','423','4444','123','88','881'];
  const floorPrice = await tracker.getFloorPrice(contractAddress, chainName, 'basepaint');
  const repMeta = await tracker.getNFTMetadata(contractAddress, ids[0], chainName);

  const data = {
    type: 'purchase',
    isBulk: true,
    walletName: 'TestWallet',
    walletAddress: '0x1234567890123456789012345678901234567890',
    tokenName: 'BasePaint',
    tokenId: ids[0],
    contractAddress,
    transactionHash: '0x' + 'b'.repeat(64),
    chainName,
    timestamp: new Date(),
    totalPrice: 0.07,
    quantity: ids.length,
    imageUrl: repMeta?.imageUrl || null,
    nftName: null,
    nativeSymbol: 'ETH',
    floorPrice: floorPrice || '-'
  };

  await notifier.sendNotification(data, tracker);
}

async function sendBulkMintBase(notifier, tracker) {
  const chainName = 'Base';
  // Dummy test collection address (replace if needed)
  const contractAddress = '0x0000000000000000000000000000000000000000';

  const data = {
    type: 'mint',
    isBulk: true,
    walletName: 'TestWallet',
    walletAddress: '0x1234567890123456789012345678901234567890',
    tokenName: 'Test Mint Collection',
    tokenId: '1',
    contractAddress,
    transactionHash: '0x' + 'c'.repeat(64),
    chainName,
    timestamp: new Date(),
    totalPrice: 0.008, // simulate paid mint to show Avg Buy Price
    quantity: 4,
    imageUrl: null,
    nftName: null,
    nativeSymbol: 'ETH',
    floorPrice: '-'
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

    console.log('🧪 Scenario 1: single purchase BasePaint #232');
    await sendSingleBasePaint(notifier, tracker);
    await sleep(600);

    console.log('🧪 Scenario 2: bulk purchase 7x BasePaint');
    await sendBulkBasePaint(notifier, tracker);
    await sleep(600);

    console.log('🧪 Scenario 3: bulk mint 4 on Base');
    await sendBulkMintBase(notifier, tracker);

    console.log('✅ All live scenarios dispatched');
  } catch (e) {
    console.error('❌ Live scenarios failed:', e);
  } finally {
    await notifier.disconnect();
  }
}

run();



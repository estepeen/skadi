require('dotenv').config();
const DiscordNotifier = require('./services/discordNotifier');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const notifier = new DiscordNotifier();
  try {
    console.log('🔗 Connecting to Discord...');
    await notifier.connect();
    await new Promise((resolve) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (notifier.isReady || Date.now() - start > 8000) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });

    const baseTx = {
      contractAddress: '0x9876543210987654321098765432109876543210',
      tokenName: 'Test Collection',
      chainName: 'Ethereum',
      transactionHash: '0x' + '1'.repeat(64),
      walletAddress: '0x1234567890123456789012345678901234567890',
      walletName: 'TestWallet',
      timestamp: new Date(),
      nativeSymbol: 'ETH',
      floorPrice: 0.00242
    };

    // 1) Purchase single
    console.log('🧪 Sending: purchase 1 NFT');
    await notifier.sendNotification({
      ...baseTx,
      type: 'purchase',
      isBulk: false,
      tokenId: '0x1',
      price: 0.004,
      priceUSD: 8,
      quantity: 1,
      nftName: 'Item #1',
    });
    await sleep(500);

    // 2) Purchase bulk 4 (one broom)
    console.log('🧪 Sending: purchase 4 NFTs');
    await notifier.sendNotification({
      ...baseTx,
      type: 'purchase',
      isBulk: true,
      tokenId: '0x2',
      totalPrice: 0.012,
      quantity: 4,
    });
    await sleep(500);

    // 3) Mint single
    console.log('🧪 Sending: mint 1 NFT');
    await notifier.sendNotification({
      ...baseTx,
      type: 'mint',
      isBulk: false,
      tokenId: '0x3',
      price: 0,
      quantity: 1,
      nftName: 'Minted #1',
    });
    await sleep(500);

    // 4) Mint bulk 11 (🔥)
    console.log('🧪 Sending: mint 11 NFTs');
    await notifier.sendNotification({
      ...baseTx,
      type: 'mint',
      isBulk: true,
      tokenId: '0x4',
      totalPrice: 0,
      quantity: 11,
    });

    console.log('✅ All test notifications sent.');
  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    await notifier.disconnect();
  }
}

run();



require('dotenv').config();
const DiscordNotifier = require('./services/discordNotifier');

async function run() {
  const notifier = new DiscordNotifier();
  try {
    console.log('🔗 Connecting to Discord...');
    await notifier.connect();
    // Wait until the client is ready
    await new Promise((resolve) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (notifier.isReady || Date.now() - start > 8000) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });

    console.log('✅ Connected. Sending bulk test embed...');

    const transactionData = {
      type: 'purchase',
      isBulk: true,
      walletName: 'TestWallet',
      walletAddress: '0x1234567890123456789012345678901234567890',
      tokenName: 'Test Collection',
      tokenId: '0x1',
      contractAddress: '0x9876543210987654321098765432109876543210',
      transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
      chainName: 'Ethereum',
      timestamp: new Date(),
      // total price for the sweep, avg buy price will be totalPrice/quantity
      totalPrice: 0.0121,
      quantity: 5,
      imageUrl: null,
      nftName: null,
      nativeSymbol: 'ETH',
      floorPrice: 0.00242
    };

    await notifier.sendNotification(transactionData);
    console.log('✅ Bulk test embed sent.');
  } catch (err) {
    console.error('❌ Bulk test failed:', err);
  } finally {
    await notifier.disconnect();
  }
}

run();



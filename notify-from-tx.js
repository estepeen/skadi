#!/usr/bin/env node
require('dotenv').config();
const fetch = require('node-fetch');
const path = require('path');
const CSVReader = require('./utils/csvReader');
const DiscordNotifier = require('./services/discordNotifier');
const NFTTracker = require('./services/nftTracker');
const config = require('./config');

function toChecksum(address) {
  return String(address || '').toLowerCase();
}

async function getTrackedWalletSet(csvPath) {
  const csvReader = new CSVReader(csvPath);
  const wallets = await csvReader.readWallets();
  const set = new Set(wallets.map(w => toChecksum(w.address)));
  return { wallets, set };
}

// Map chain names to OpenSea chain identifiers
const OPENSEA_CHAINS = {
  'Ethereum': 'ethereum',
  'Base': 'base',
  'Polygon': 'polygon',
  'Arbitrum': 'arbitrum',
  'Optimism': 'optimism',
  'BSC': 'bsc',
  'Berachain': 'berachain',
  'Abstract': 'abstract'
};

const ERC721_TRANSFER_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ERC1155_SINGLE_SIG = '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62';
const ERC1155_BATCH_SIG  = '0x4a39dc06d4c0dbc64b70b48d78a0360a7a222ff32b9f1e9d0a6a5d1d0f8f8f7d';

function hexToAddress(topic) {
  // topic is 32-byte hex; last 20 bytes are address
  if (!topic) return null;
  return '0x' + topic.slice(-40).toLowerCase();
}

function hexToBigInt(hex) {
  try { return BigInt(hex); } catch { return 0n; }
}

async function findReceiptAcrossChains(txHash) {
  // Try explicit RPC for Abstract first if provided
  const abstractRpc = process.env.ABSTRACT_RPC_URL;
  if (abstractRpc) {
    try {
      const body = { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] };
      const res = await fetch(abstractRpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data && data.result && data.result.logs) {
        return { chainName: 'Abstract', baseUrl: abstractRpc, receipt: data.result, rpcUrl: abstractRpc };
      }
    } catch (e) {
      // continue to OpenSea API
    }
  }
  
  // Try OpenSea API V2 for each supported chain
  for (const [chainName, openseaChain] of Object.entries(OPENSEA_CHAINS)) {
    try {
      console.log(`🔍 Trying OpenSea API V2 for ${chainName} (${openseaChain})...`);
      
      const response = await fetch(`https://api.opensea.io/api/v2/events/chain/${openseaChain}/transaction/${txHash}`, {
        headers: {
          'X-API-KEY': config.opensea.apiKey,
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.asset_events && data.asset_events.length > 0) {
          console.log(`✅ Found transaction on ${chainName} via OpenSea API V2`);
          
          // Convert OpenSea event to receipt-like format for compatibility
          const event = data.asset_events[0];
          const receipt = {
            logs: [{
              topics: [
                ERC721_TRANSFER_SIG,
                '0x0000000000000000000000000000000000000000000000000000000000000000', // from
                '0x0000000000000000000000000000000000000000000000000000000000000000', // to
                '0x0000000000000000000000000000000000000000000000000000000000000000'  // tokenId
              ],
              data: '0x',
              address: event.asset?.asset_contract?.address || '0x0000000000000000000000000000000000000000'
            }],
            transactionHash: txHash,
            blockNumber: event.block_number || '0x0',
            gasUsed: '0x0',
            cumulativeGasUsed: '0x0'
          };
          
          return { 
            chainName, 
            baseUrl: `https://api.opensea.io/api/v2/chain/${openseaChain}`, 
            receipt,
            openseaChain
          };
        }
      }
    } catch (e) {
      console.log(`⚠️ Error checking ${chainName}: ${e.message}`);
      continue;
    }
  }
  
  return null;
}

async function main() {
  const txHash = process.argv[2] || process.env.TX_HASH;
  const forceTo = (process.argv[3] || process.env.FORCE_TO || '').toLowerCase();
  if (!txHash) {
    console.error('Usage: node notify-from-tx.js <txHash> [toAddress]');
    process.exit(1);
  }

  const notifier = new DiscordNotifier();
  const tracker = new NFTTracker();
  const { set: trackedSet } = await getTrackedWalletSet(config.csvFile);

  const found = await findReceiptAcrossChains(txHash);
  if (!found) {
    console.error('❌ Could not find transaction receipt on supported chains');
    process.exit(2);
  }
  const { chainName, receipt } = found;

  // Aggregate NFT mints to tracked wallets
  const zeroAddr = '0x0000000000000000000000000000000000000000';
  const mintedItems = [];
  for (const log of receipt.logs) {
    const sig = (log.topics && log.topics[0]) ? log.topics[0].toLowerCase() : '';
    if (sig === ERC721_TRANSFER_SIG && log.topics.length >= 4) {
      const from = hexToAddress(log.topics[1]);
      const to = hexToAddress(log.topics[2]);
      const matchTo = forceTo ? (to === forceTo) : trackedSet.has(to);
      if (from === zeroAddr && matchTo) {
        const tokenId = hexToBigInt(log.topics[3]).toString();
        mintedItems.push({
          standard: 'ERC721',
          contract: log.address,
          to,
          tokenId,
          quantity: 1
        });
      }
    } else if (sig === ERC1155_SINGLE_SIG && log.topics.length >= 4) {
      const to = hexToAddress(log.topics[3]);
      const matchTo = forceTo ? (to === forceTo) : trackedSet.has(to);
      if (matchTo) {
        const data = log.data || '0x';
        // data encodes id and value as 32-byte each after operator/from/to topics
        const id = '0x' + data.slice(2).slice(0, 64);
        const valueHex = '0x' + data.slice(2).slice(64, 128);
        mintedItems.push({
          standard: 'ERC1155',
          contract: log.address,
          to,
          tokenId: hexToBigInt(id).toString(),
          quantity: Number(hexToBigInt(valueHex)) || 1
        });
      }
    } else if (sig === ERC1155_BATCH_SIG && log.topics.length >= 4) {
      const to = hexToAddress(log.topics[3]);
      const matchTo = forceTo ? (to === forceTo) : trackedSet.has(to);
      if (matchTo) {
        // data encodes arrays: ids followed by values, each array prefixed by length (32 bytes)
        const data = log.data.slice(2);
        const readBigInt = (offset) => hexToBigInt('0x' + data.slice(offset, offset + 64));
        let offset = 0;
        const idsOffset = Number(readBigInt(offset)); offset += 64;
        const valuesOffset = Number(readBigInt(offset)); offset += 64;
        // ids array
        const idsStart = (Number(readBigInt(idsOffset)) + 1) * 64; // skip length then ids
        const idsLen = Number(readBigInt(idsOffset));
        let ids = [];
        for (let i = 0; i < idsLen; i++) {
          const hex = '0x' + data.slice(idsStart + i * 64, idsStart + (i + 1) * 64);
          ids.push(hexToBigInt(hex).toString());
        }
        // values array
        const valsStart = (Number(readBigInt(valuesOffset)) + 1) * 64;
        const valsLen = Number(readBigInt(valuesOffset));
        let vals = [];
        for (let i = 0; i < valsLen; i++) {
          const hex = '0x' + data.slice(valsStart + i * 64, valsStart + (i + 1) * 64);
          vals.push(Number(hexToBigInt(hex)) || 1);
        }
        ids.forEach((id, i) => mintedItems.push({ standard: 'ERC1155', contract: log.address, to, tokenId: id, quantity: vals[i] || 1 }));
      }
    }
  }

  if (mintedItems.length === 0) {
    console.error('ℹ️ No mint events to tracked wallets found in this transaction.');
    process.exit(0);
  }

  // Determine totalPrice from OpenSea API V2 if available
  let totalPrice = 0;
  try {
    if (chainName === 'Abstract' && process.env.ABSTRACT_RPC_URL) {
      const body = { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [txHash] };
      const res = await fetch(process.env.ABSTRACT_RPC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data && data.result && data.result.value) {
        totalPrice = Number(hexToBigInt(data.result.value)) / Math.pow(10, 18);
      }
    } else {
      // Use OpenSea API V2 to get transaction price
      const openseaChain = OPENSEA_CHAINS[chainName];
      if (openseaChain) {
        const response = await fetch(`https://api.opensea.io/api/v2/events/chain/${openseaChain}/transaction/${txHash}`, {
          headers: {
            'X-API-KEY': config.opensea.apiKey,
            'Accept': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.asset_events && data.asset_events.length > 0) {
            const event = data.asset_events.find(e => e.event_type === 'item_transferred' || e.event_type === 'item_sold');
            if (event && event.payment?.amount) {
              totalPrice = Number(event.payment.amount) / Math.pow(10, event.payment.decimals || 18);
            }
          }
        }
      }
    }
  } catch {}

  // Use first item to build display and floor
  const representative = mintedItems[0];
  const floor = await tracker.getFloorPrice(representative.contract, chainName, null);

  const quantity = mintedItems.reduce((sum, it) => sum + (it.quantity || 1), 0);
  const walletAddress = mintedItems[0].to;

  const txData = {
    type: 'mint',
    isBulk: quantity > 1,
    walletName: walletAddress,
    walletAddress: walletAddress,
    tokenName: 'Unknown',
    tokenId: '0x' + BigInt(mintedItems[0].tokenId).toString(16),
    contractAddress: representative.contract,
    transactionHash: txHash,
    chainName,
    timestamp: new Date(),
    totalPrice: totalPrice,
    quantity: quantity,
    imageUrl: null,
    nftName: null,
    nativeSymbol: 'ETH',
    floorPrice: floor || '-'
  };

  // Try to get image/name
  try {
    const meta = await tracker.getNFTMetadata(representative.contract, mintedItems[0].tokenId, chainName);
    if (meta) {
      txData.imageUrl = meta.imageUrl;
      txData.nftName = meta.name;
      txData.tokenName = meta.name || txData.tokenName;
    }
  } catch {}

  console.log('📤 Sending manual mint notification from tx...');
  await notifier.connect();
  // Wait until ready
  await new Promise((r) => setTimeout(r, 800));
  await notifier.sendNotification(txData, tracker);
  await notifier.disconnect();
  console.log('✅ Sent.');
}

main().catch(err => { console.error(err); process.exit(1); });



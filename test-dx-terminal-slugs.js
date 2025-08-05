const config = require('./config');

// Funkce pro generování možných slugů
function generatePossibleSlugs(collectionName) {
  if (!collectionName || collectionName === 'Unknown') {
    return [];
  }
  
  const slugs = [];
  
  // Remove special characters and normalize
  let cleanName = collectionName
    .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
    .trim();
  
  console.log(`🔍 Clean name: "${cleanName}"`);
  
  // Strategy 1: Convert to lowercase with hyphens
  const slug1 = cleanName
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  
  if (slug1) {
    slugs.push(slug1);
    console.log(`📝 Strategy 1 (lowercase with hyphens): "${slug1}"`);
  }
  
  // Strategy 2: Convert to lowercase without spaces
  const slug2 = cleanName
    .toLowerCase()
    .replace(/\s+/g, '') // Remove all spaces
    .replace(/-+/g, ''); // Remove hyphens
  
  if (slug2 && slug2 !== slug1) {
    slugs.push(slug2);
    console.log(`📝 Strategy 2 (lowercase no spaces): "${slug2}"`);
  }
  
  // Strategy 3: Convert to lowercase with underscores
  const slug3 = cleanName
    .toLowerCase()
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/-+/g, '_') // Replace hyphens with underscores
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
  
  if (slug3 && slug3 !== slug1 && slug3 !== slug2) {
    slugs.push(slug3);
    console.log(`📝 Strategy 3 (lowercase with underscores): "${slug3}"`);
  }
  
  // Strategy 4: Keep original case but with hyphens
  const slug4 = cleanName
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  
  if (slug4 && slug4 !== slug1 && slug4 !== slug2 && slug4 !== slug3) {
    slugs.push(slug4);
    console.log(`📝 Strategy 4 (original case with hyphens): "${slug4}"`);
  }
  
  // Strategy 5: Common variations for DX Terminal
  const commonVariations = [
    'dx-terminal',
    'dxterminal',
    'dx_terminal',
    'dx-terminal-nft',
    'dxterminal-nft',
    'dx-terminal-game',
    'dxterminal-game',
    'dx-terminal-collection',
    'dxterminal-collection'
  ];
  
  for (const variation of commonVariations) {
    if (!slugs.includes(variation)) {
      slugs.push(variation);
      console.log(`📝 Strategy 5 (common variation): "${variation}"`);
    }
  }
  
  // Remove duplicates and return
  return [...new Set(slugs)];
}

// Funkce pro testování slugů na OpenSea API
async function testSlugsOnOpenSea(slugs, contractAddress = null) {
  const apiKey = config.opensea.apiKey;
  const chain = 'base'; // Base chain
  
  console.log(`\n🔍 Testing ${slugs.length} slugs on OpenSea API v2...`);
  console.log(`📍 Chain: ${chain}`);
  console.log(`🔑 API Key: ${apiKey ? '✅ Set' : '❌ Missing'}`);
  
  if (!apiKey) {
    console.log('❌ OpenSea API key is missing in config.js');
    return;
  }
  
  for (const slug of slugs) {
    try {
      console.log(`\n🔍 Testing slug: "${slug}"`);
      
      const response = await fetch(`https://api.opensea.io/api/v2/collections/${slug}?chain=${chain}`, {
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json'
        }
      });
      
      console.log(`📊 Response status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Found collection: "${data.name || slug}"`);
        console.log(`🔗 Twitter: ${data.twitter_username || 'N/A'}`);
        console.log(`📱 Discord: ${data.discord_url || 'N/A'}`);
        console.log(`🌐 Website: ${data.project_url || 'N/A'}`);
        console.log(`📄 Description: ${data.description ? data.description.substring(0, 100) + '...' : 'N/A'}`);
        
        // Check if this collection has our contract address
        if (contractAddress && data.contracts) {
          const hasContract = data.contracts.some(contract => 
            contract.address.toLowerCase() === contractAddress.toLowerCase()
          );
          
          if (hasContract) {
            console.log(`🎯 ✅ CONTRACT MATCH! This is the right collection!`);
            console.log(`📋 Full collection data:`, JSON.stringify(data, null, 2));
            return data;
          } else {
            console.log(`⚠️ Contract mismatch - this is a different collection`);
            if (data.contracts.length > 0) {
              console.log(`📋 Available contracts: ${data.contracts.map(c => c.address).join(', ')}`);
            }
          }
        } else {
          console.log(`📋 Full collection data:`, JSON.stringify(data, null, 2));
        }
      } else if (response.status === 404) {
        console.log(`❌ Collection not found (404)`);
      } else {
        console.log(`❌ API error: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.log(`📄 Error details: ${errorText}`);
      }
      
    } catch (error) {
      console.log(`❌ Error testing slug "${slug}": ${error.message}`);
    }
  }
  
  console.log(`\n❌ No matching collection found for any slug`);
  return null;
}

// Main test function
async function testDXTerminalSlugs() {
  console.log('🚀 Testing DX Terminal collection slugs...\n');
  
  // Test different possible names for DX Terminal
  const possibleNames = [
    'DX Terminal',
    'DXTerminal',
    'DX-Terminal',
    'DX Terminal NFT',
    'DXTerminal NFT',
    'DX Terminal Game',
    'DXTerminal Game'
  ];
  
  for (const name of possibleNames) {
    console.log(`\n🔍 Testing name: "${name}"`);
    console.log('─'.repeat(50));
    
    const slugs = generatePossibleSlugs(name);
    console.log(`\n📋 Generated ${slugs.length} slugs: ${slugs.join(', ')}`);
    
    // Test these slugs on OpenSea
    const result = await testSlugsOnOpenSea(slugs, '0x41dc69132cce31fcbf6755c84538ca268520246f');
    
    if (result) {
      console.log(`\n🎉 SUCCESS! Found DX Terminal collection with slug: "${result.slug || 'unknown'}"`);
      return result;
    }
  }
  
  console.log(`\n❌ No DX Terminal collection found with any name variation`);
}

// Run the test
testDXTerminalSlugs().catch(console.error); 
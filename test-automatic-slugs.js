const config = require('./config');

// Funkce pro generování možných slugů (stejná jako v hlavním kódu)
function generatePossibleSlugs(collectionName) {
  if (!collectionName || collectionName === 'Unknown') {
    return [];
  }
  
  const slugs = [];
  
  // Remove special characters and normalize
  let cleanName = collectionName
    .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
    .trim();
  
  console.log(`🔍 Generating slugs for: "${cleanName}"`);
  
  // Strategy 1: Convert to lowercase with hyphens (slova oddělená pomlčkami)
  const slug1 = cleanName
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  
  if (slug1) {
    slugs.push(slug1);
    console.log(`📝 Strategy 1 (hyphens): "${slug1}"`);
  }
  
  // Strategy 2: Convert to lowercase without spaces (slova dohromady)
  const slug2 = cleanName
    .toLowerCase()
    .replace(/\s+/g, '') // Remove all spaces
    .replace(/-+/g, ''); // Remove hyphens
  
  if (slug2 && slug2 !== slug1) {
    slugs.push(slug2);
    console.log(`📝 Strategy 2 (no spaces): "${slug2}"`);
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
        
        // Check if this collection has our contract address
        if (contractAddress && data.contracts) {
          const hasContract = data.contracts.some(contract => 
            contract.address.toLowerCase() === contractAddress.toLowerCase()
          );
          
          if (hasContract) {
            console.log(`🎯 ✅ CONTRACT MATCH! This is the right collection!`);
            return data;
          } else {
            console.log(`⚠️ Contract mismatch - this is a different collection`);
            if (data.contracts.length > 0) {
              console.log(`📋 Available contracts: ${data.contracts.map(c => c.address).join(', ')}`);
            }
          }
        }
      } else if (response.status === 404) {
        console.log(`❌ Collection not found (404)`);
      } else {
        console.log(`❌ API error: ${response.status} ${response.statusText}`);
      }
      
    } catch (error) {
      console.log(`❌ Error testing slug "${slug}": ${error.message}`);
    }
  }
  
  console.log(`\n❌ No matching collection found for any slug`);
  return null;
}

// Main test function
async function testAutomaticSlugs() {
  console.log('🚀 Testing automatic slug generation...\n');
  
  // Test different collection names
  const testCollections = [
    {
      name: 'DX Terminal',
      contract: '0x41dc69132cce31fcbf6755c84538ca268520246f',
      expectedSlugs: ['dx-terminal', 'dxterminal']
    },
    {
      name: 'THE DROPZONE',
      contract: '0x23a5e200a37bad403d1b3181f5cec072e381cae6',
      expectedSlugs: ['the-dropzone', 'thedropzone']
    },
    {
      name: 'Cool Cats',
      contract: null,
      expectedSlugs: ['cool-cats', 'coolcats']
    },
    {
      name: 'Bored Ape Yacht Club',
      contract: null,
      expectedSlugs: ['bored-ape-yacht-club', 'boredapeyachtclub']
    }
  ];
  
  for (const collection of testCollections) {
    console.log(`\n🔍 Testing collection: "${collection.name}"`);
    console.log('─'.repeat(50));
    
    const slugs = generatePossibleSlugs(collection.name);
    console.log(`\n📋 Generated slugs: ${slugs.join(', ')}`);
    console.log(`📋 Expected slugs: ${collection.expectedSlugs.join(', ')}`);
    
    // Check if generated slugs match expected
    const matches = collection.expectedSlugs.filter(expected => slugs.includes(expected));
    if (matches.length > 0) {
      console.log(`✅ Generated slugs match expected: ${matches.join(', ')}`);
    } else {
      console.log(`❌ No matches found between generated and expected slugs`);
    }
    
    // Test these slugs on OpenSea if contract is provided
    if (collection.contract) {
      const result = await testSlugsOnOpenSea(slugs, collection.contract);
      if (result) {
        console.log(`\n🎉 SUCCESS! Found collection with automatic slug generation!`);
        console.log(`📊 Collection: ${result.name}`);
        console.log(`🔗 Slug: ${result.collection}`);
        console.log(`🔗 Twitter: ${result.twitter_username || 'N/A'}`);
        console.log(`📱 Discord: ${result.discord_url || 'N/A'}`);
        console.log(`🌐 Website: ${result.project_url || 'N/A'}`);
      }
    }
  }
  
  console.log(`\n✅ Automatic slug generation test completed!`);
}

// Run the test
testAutomaticSlugs().catch(console.error); 
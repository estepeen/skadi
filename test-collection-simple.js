const CollectionCommand = require('./services/collectionCommand');

async function testCollectionCommandSimple() {
  try {
    console.log('🧪 Testing Collection Command (Simple)...');
    console.log('='.repeat(50));
    
    const testSlug = 'jooejoejoe';
    const testChain = 'base';
    
    console.log(`🔍 Testing collection command for: ${testSlug}`);
    console.log(`📍 Chain: ${testChain}`);
    console.log('');
    
    // Create collection command instance
    const collectionCommand = new CollectionCommand();
    
    // Simulate Discord interaction
    const mockInteraction = {
      options: {
        getString: (name) => {
          if (name === 'slug') return testSlug;
          if (name === 'chain') return testChain;
          return null;
        }
      },
      deferReply: async () => {
        console.log('⏳ Deferring reply...');
      },
      editReply: async (content) => {
        console.log('✅ Reply sent:');
        if (content.embeds && content.embeds.length > 0) {
          const embed = content.embeds[0];
          console.log(`   Title: ${embed.title}`);
          console.log(`   Description: ${embed.description || 'N/A'}`);
          
          if (embed.fields) {
            console.log('   Fields:');
            embed.fields.forEach(field => {
              console.log(`     ${field.name}: ${field.value}`);
            });
          }
        }
      }
    };
    
    // Execute the command
    console.log('🚀 Executing collection command...');
    await collectionCommand.execute(mockInteraction);
    
    console.log('');
    console.log('✅ Collection command test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the test
testCollectionCommandSimple();

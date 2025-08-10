#!/usr/bin/env node

console.log('🕐 VPS Time Check Script');
console.log('='.repeat(40));

// Check current time
const now = new Date();
console.log(`Current time: ${now.toString()}`);
console.log(`ISO string: ${now.toISOString()}`);
console.log(`UTC time: ${now.toUTCString()}`);
console.log(`Local timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

// Check timestamp in seconds (Unix timestamp)
const unixTimestamp = Math.floor(now.getTime() / 1000);
console.log(`Unix timestamp: ${unixTimestamp}`);

// Check if there's a significant time difference
const expectedTime = new Date();
const timeDiff = Math.abs(now.getTime() - expectedTime.getTime());
if (timeDiff > 60000) { // More than 1 minute difference
  console.log('⚠️ WARNING: System time appears to be significantly off!');
  console.log(`Time difference: ${timeDiff / 1000} seconds`);
} else {
  console.log('✅ System time appears to be accurate');
}

// Check environment
console.log('\n🌍 Environment:');
console.log(`Node.js version: ${process.version}`);
console.log(`Platform: ${process.platform}`);
console.log(`Architecture: ${process.arch}`);

// Check if running in container
try {
  const fs = require('fs');
  if (fs.existsSync('/.dockerenv')) {
    console.log('🐳 Running in Docker container');
  } else if (fs.existsSync('/proc/1/cgroup')) {
    const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
    if (cgroup.includes('docker') || cgroup.includes('kubectl')) {
      console.log('🐳 Running in containerized environment');
    }
  }
} catch (error) {
  // Ignore errors
}

console.log('\n' + '='.repeat(40));
console.log('💡 If time is wrong, check:');
console.log('   - VPS system clock: sudo date');
console.log('   - Timezone: sudo timedatectl');
console.log('   - NTP sync: sudo ntpq -p');
console.log('   - Container time sync if using Docker');

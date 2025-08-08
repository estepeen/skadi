const fs = require('fs');
const csv = require('csv-parser');

class CSVReader {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async readWallets() {
    return new Promise((resolve, reject) => {
      const wallets = [];
      
      fs.createReadStream(this.filePath)
        .pipe(csv())
        .on('data', (row) => {
          const rawAddress = (row.address || '').trim();
          const rawName = (row.name || '').trim();

          // Skip commented or invalid rows
          if (!rawAddress || rawAddress.startsWith('#')) return;
          if (!this.validateAddress(rawAddress)) return;
          if (!rawName) return;

          wallets.push({
            address: rawAddress.toLowerCase(),
            name: rawName
          });
        })
        .on('end', () => {
          console.log(`Loaded ${wallets.length} wallets from CSV`);
          resolve(wallets);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  validateAddress(address) {
    // Basic Ethereum address validation
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
}

module.exports = CSVReader; 
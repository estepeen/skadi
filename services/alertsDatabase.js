const fs = require('fs').promises;
const path = require('path');

class AlertsDatabase {
  constructor() {
    this.dbPath = path.join(__dirname, '..', 'data', 'alerts.json');
    this.alerts = new Map(); // userId -> array of alerts
    this.initialized = false;
  }

  async initialize() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      try {
        await fs.access(dataDir);
      } catch {
        await fs.mkdir(dataDir, { recursive: true });
      }

      // Load existing alerts
      try {
        const data = await fs.readFile(this.dbPath, 'utf8');
        const alertsData = JSON.parse(data);
        
        // Convert to Map structure
        for (const [userId, userAlerts] of Object.entries(alertsData)) {
          this.alerts.set(userId, userAlerts);
        }
        
        console.log(`📝 Loaded ${Object.keys(alertsData).length} users' alerts from database`);
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log('📝 No existing alerts database found, starting fresh');
        } else {
          console.error('❌ Error loading alerts database:', error.message);
        }
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize alerts database:', error.message);
      return false;
    }
  }

  async saveToFile() {
    if (!this.initialized) return false;

    try {
      // Convert Map to plain object for JSON
      const alertsData = {};
      for (const [userId, userAlerts] of this.alerts.entries()) {
        if (userAlerts.length > 0) {
          alertsData[userId] = userAlerts;
        }
      }

      await fs.writeFile(this.dbPath, JSON.stringify(alertsData, null, 2));
      return true;
    } catch (error) {
      console.error('❌ Error saving alerts database:', error.message);
      return false;
    }
  }

  async addAlert(alert) {
    if (!this.initialized) return false;

    try {
      const userId = alert.userId;
      
      if (!this.alerts.has(userId)) {
        this.alerts.set(userId, []);
      }

      const userAlerts = this.alerts.get(userId);
      userAlerts.push(alert);

      await this.saveToFile();
      console.log(`✅ Alert ${alert.id} added to database for user ${alert.username}`);
      return true;
    } catch (error) {
      console.error('❌ Error adding alert to database:', error.message);
      return false;
    }
  }

  async removeAlert(userId, alertId) {
    if (!this.initialized) return false;

    try {
      if (!this.alerts.has(userId)) {
        return false; // No alerts for this user
      }

      const userAlerts = this.alerts.get(userId);
      const initialLength = userAlerts.length;
      
      // Remove alert with matching ID
      const filteredAlerts = userAlerts.filter(alert => alert.id !== alertId);
      
      if (filteredAlerts.length === initialLength) {
        return false; // Alert not found
      }

      this.alerts.set(userId, filteredAlerts);
      await this.saveToFile();
      
      console.log(`✅ Alert ${alertId} removed from database`);
      return true;
    } catch (error) {
      console.error('❌ Error removing alert from database:', error.message);
      return false;
    }
  }

  async removeAllUserAlerts(userId) {
    if (!this.initialized) return false;

    try {
      if (!this.alerts.has(userId)) {
        return 0; // No alerts for this user
      }

      const userAlerts = this.alerts.get(userId);
      const removedCount = userAlerts.length;
      
      this.alerts.delete(userId);
      await this.saveToFile();
      
      console.log(`✅ Removed ${removedCount} alerts for user ${userId}`);
      return removedCount;
    } catch (error) {
      console.error('❌ Error removing user alerts from database:', error.message);
      return 0;
    }
  }

  async removeAllActiveUserAlerts(userId) {
    if (!this.initialized) return 0;

    try {
      if (!this.alerts.has(userId)) {
        return 0; // No alerts for this user
      }

      const userAlerts = this.alerts.get(userId);
      // Keep only alerts explicitly marked inactive
      const remaining = userAlerts.filter(alert => alert.active === false);
      const removedCount = userAlerts.length - remaining.length;

      this.alerts.set(userId, remaining);
      await this.saveToFile();

      console.log(`✅ Removed ${removedCount} active alerts for user ${userId}`);
      return removedCount;
    } catch (error) {
      console.error('❌ Error removing active user alerts from database:', error.message);
      return 0;
    }
  }

  getUserAlerts(userId) {
    if (!this.initialized) return [];
    
    return this.alerts.get(userId) || [];
  }

  getAllAlerts() {
    if (!this.initialized) return [];
    
    const allAlerts = [];
    for (const userAlerts of this.alerts.values()) {
      allAlerts.push(...userAlerts);
    }
    return allAlerts;
  }

  getActiveAlerts() {
    return this.getAllAlerts().filter(alert => alert.active !== false);
  }

  async updateAlert(userId, alertId, updates) {
    if (!this.initialized) return false;

    try {
      if (!this.alerts.has(userId)) {
        return false;
      }

      const userAlerts = this.alerts.get(userId);
      const alertIndex = userAlerts.findIndex(alert => alert.id === alertId);
      
      if (alertIndex === -1) {
        return false;
      }

      // Update alert properties
      Object.assign(userAlerts[alertIndex], updates);
      
      await this.saveToFile();
      console.log(`✅ Alert ${alertId} updated in database`);
      return true;
    } catch (error) {
      console.error('❌ Error updating alert in database:', error.message);
      return false;
    }
  }

  getStats() {
    if (!this.initialized) {
      return { totalUsers: 0, totalAlerts: 0, activeAlerts: 0 };
    }

    const totalUsers = this.alerts.size;
    const allAlerts = this.getAllAlerts();
    const totalAlerts = allAlerts.length;
    const activeAlerts = allAlerts.filter(alert => alert.active !== false).length;

    return { totalUsers, totalAlerts, activeAlerts };
  }
}

module.exports = AlertsDatabase;

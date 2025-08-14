# 🚨 Alerts System - Complete Implementation

## ✅ **What's Implemented**

### 🔄 **Real-time Monitoring System**
- **Floor Price Monitoring**: Automatically checks collection floor prices every 3 minutes
- **Transaction Monitoring**: Integrates with existing NFT tracker to catch listings/sales
- **Smart Caching**: Reduces API calls with intelligent caching system
- **Database Persistence**: All alerts stored in `data/alerts.json`

### 📊 **Alert Types**

#### 1. **Collection Alerts** 
- Monitor floor price changes
- Conditions: `above` or `below` target price
- Supports multiple chains (Ethereum, ApeChain, Base, etc.)
- **Auto-triggers** when conditions are met

#### 2. **Token Alerts**
- Monitor specific NFT tokens by contract + token ID
- Conditions: `listed_below`, `listed_above`, `any_listing`, `sold`
- **Auto-triggers** on new listings or sales
- Integrates with wallet activity monitoring

#### 3. **Traits Alerts** 
- Framework ready for trait-based monitoring
- Currently shows placeholder (future enhancement)

### 🎯 **Alert Lifecycle**
1. **Created**: Alert saved to database, marked as `active: true`
2. **Monitored**: System continuously checks conditions
3. **Triggered**: When condition met, sends notification to user's alerts channel
4. **Deactivated**: Alert marked as `active: false` and `triggeredAt` timestamp added
5. **Exception**: `listed` alerts can trigger multiple times

### 📱 **Commands Available**

```
/alerts collection slug:boredapeyachtclub condition:above price:15
/alerts token contract:0x... token_id:1234 condition:any_listing
/alerts traits slug:collection traits:"Background:Blue,Eyes:Laser" condition:below price:5
/alerts list                    # Show your active alerts
/alerts remove alert_id:ABC123  # Remove specific alert
/alerts channel action:remove   # Delete alerts channel + all alerts
/alerts stats                   # Show system statistics
```

### 🏗️ **Technical Architecture**

#### **AlertsMonitor Service** (`services/alertsMonitor.js`)
- Manages periodic floor price checks
- Processes transaction data for token alerts  
- Sends notifications to user channels
- Handles alert lifecycle (activation/deactivation)

#### **AlertsDatabase Service** (`services/alertsDatabase.js`)  
- CRUD operations for alerts
- JSON file persistence
- User-based alert grouping
- Statistics and reporting

#### **Integration Points**
- **NFTTracker**: Calls `alertsMonitor.checkTokenAlerts()` on every transaction
- **DiscordNotifier**: Initializes alerts monitor on startup
- **AlertsCommand**: Interface for user alert management

### 🔔 **Notification System**
- **Private Channels**: Each user gets their own `alerts-username` channel
- **Rich Embeds**: Beautiful Discord embeds with all relevant info
- **Smart Permissions**: Only the alert owner can see their channel
- **Automatic Cleanup**: Channel deletion removes all associated alerts

### ⚡ **Performance Features**
- **Caching**: Floor prices cached for 2 minutes
- **Rate Limiting**: API calls spaced to avoid limits  
- **Efficient Queries**: Groups alerts by collection to minimize API calls
- **Background Processing**: Non-blocking alert checks

## 🎉 **User Experience**

### **When You Create an Alert:**
1. Bot creates your private alerts channel (if doesn't exist)
2. Shows confirmation with alert details and ID
3. Alert becomes active immediately

### **When Alert Triggers:**
1. Bot sends notification to your alerts channel
2. Includes current price, condition, and relevant links
3. Alert automatically deactivates (except listing alerts)

### **Managing Alerts:**
- `/alerts list` shows organized view by type
- Each alert has unique ID for easy removal
- Channel deletion removes all your alerts at once
- Statistics show system-wide usage

## 🔮 **Future Enhancements**
- Traits-based alerts with metadata parsing
- Webhook integration for external notifications  
- Alert history and analytics
- Bulk alert management
- Custom notification preferences

---

**Status**: ✅ **FULLY FUNCTIONAL**  
**Monitoring**: 🔄 **ACTIVE** (Floor prices every 3min, transactions real-time)  
**Database**: 📝 **PERSISTENT** (Survives bot restarts)  

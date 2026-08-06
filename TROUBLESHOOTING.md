# 🚨 NFT Tracker Bot Troubleshooting Guide

## Issues Identified

### 1. Discord Bot Not Ready
**Problem**: `⚠️ Discord bot not ready yet, skipping notification`

**Cause**: The Discord bot needs time to connect and authenticate before it can send messages.

**Solution**: 
- The bot now waits for proper connection before proceeding
- Check Discord bot permissions and token validity
- Run `node test-discord-connection.js` to test connection

### 2. Future Date Issue
**Problem**: Bot shows dates like `2025-08-09T22:38:13.000Z` (future dates)

**Cause**: VPS system clock is incorrect or timezone is misconfigured.

**Solutions**:
```bash
# Check current system time
sudo date

# Check timezone
sudo timedatectl

# Check NTP sync
sudo ntpq -p

# If using Docker, ensure time sync
docker run --rm --privileged alpine hwclock -s
```

### 3. Wallet Address Truncation
**Problem**: Wallet addresses appear cut off like `0x414826beb`

**Cause**: Log line length limits or console output truncation.

**Solution**: Check your VPS console/terminal settings for line wrapping.

## Quick Fixes

### Run Time Check Script
```bash
node check-time.js
```

### Fix Ubuntu Time Sync (Recommended)
```bash
# Run the Ubuntu time fix script (as root)
sudo ./fix-ubuntu-time.sh
```

### Test Discord Connection
```bash
node test-discord-connection.js
```

### Check Bot Status
```bash
node monitor-bot.js
```

## VPS Configuration

### 1. System Time Sync
```bash
# For Ubuntu/Debian systems
sudo apt update
sudo apt install systemd-timesyncd

# Enable and start timesyncd (Ubuntu's default time sync)
sudo systemctl enable systemd-timesyncd
sudo systemctl start systemd-timesyncd

# Check status
sudo systemctl status systemd-timesyncd

# Alternative: Install and use chrony (more modern)
sudo apt install chrony
sudo systemctl enable chrony
sudo systemctl start chrony
sudo systemctl status chrony

# Check time sync status
timedatectl status
```

### 2. Timezone Configuration
```bash
# Set timezone (example for UTC)
sudo timedatectl set-timezone UTC

# Or for specific timezone
sudo timedatectl set-timezone Europe/Prague
```

### 3. Docker Time Sync (if applicable)
```bash
# Run container with host time
docker run -v /etc/localtime:/etc/localtime:ro your-image

# Or use host network time
docker run --network host your-image
```

## Environment Variables

Ensure these are set in your VPS:
```bash
export DISCORD_BOT_TOKEN="your_bot_token"
export DISCORD_CHANNEL_ID="your_channel_id"
export OPENSEA_API_KEY="your_opensea_api_key"   # optional, see below
export DISCORD_NFTS_ROLE_ID="your_nfts_role_id"
export WALLET_SCAN_DELAY="12000"                # optional, default 7000
```

### OpenSea API Key

`OPENSEA_API_KEY` is **not** required and the bot does not exit without it. When
it is empty the bot mints a free key at startup, caches it in
`data/opensea-key.json` and renews it automatically when OpenSea answers a
request with a 401. A key you supply yourself always wins and is never replaced.

The free key comes with limits worth knowing when the bot suddenly goes quiet:
- 600 requests per hour
- expires after 7 days
- revoked immediately if you trip the rate limit
- only two keys can be minted per day per IP address

So a run of 401s usually means either the key expired or the rate limit was
tripped and the key was revoked. Raise `WALLET_SCAN_DELAY` to slow the sweep
down, and note that the bot can only mint two replacement keys per day from one
IP address. `node monitor-bot.js` reports whether a key is currently in place and
how long it is still valid.

## Bot Restart

After fixing time issues:
```bash
# Stop the bot
pkill -f "node index.js"

# Wait a moment
sleep 5

# Start the bot
node index.js
```

## Monitoring

### Check Bot Logs
```bash
# If using PM2
pm2 logs skadi-nft-tracker

# If running directly
tail -f /path/to/your/logs
```

### Check System Resources
```bash
# CPU and memory usage
htop

# Disk space
df -h

# Network connections
netstat -tulpn
```

## Common VPS Issues

### 1. Container Time Drift
If running in Docker/container:
- Ensure host time is correct
- Use `--privileged` flag for time sync
- Mount host timezone: `-v /etc/localtime:/etc/localtime:ro`

### 2. Network Issues
- Check firewall rules
- Verify Discord API access
- Test OpenSea API connectivity

### 3. Resource Limits
- Check memory limits
- Monitor CPU usage
- Verify disk space

## Still Having Issues?

1. Run the diagnostic scripts above
2. Check VPS system logs: `sudo journalctl -f`
3. Verify all environment variables are set
4. Test individual components (Discord, OpenSea APIs)
5. Check for any recent VPS updates or changes

## Support

If issues persist:
1. Collect logs from the diagnostic scripts
2. Note your VPS provider and configuration
3. Check if the issue occurs after VPS restart
4. Verify all dependencies are up to date

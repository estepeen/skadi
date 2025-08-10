#!/bin/bash

echo "🕐 Ubuntu Time Sync Fix Script"
echo "=============================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root (use sudo)"
    exit 1
fi

echo "🔍 Checking current system time..."
echo "Current time: $(date)"
echo "UTC time: $(date -u)"
echo "Timezone: $(timedatectl | grep 'Time zone')"

echo ""
echo "📡 Checking available time sync services..."

# Check if systemd-timesyncd is available
if systemctl list-unit-files | grep -q "systemd-timesyncd"; then
    echo "✅ systemd-timesyncd is available"
    TIMESYNCD_AVAILABLE=true
else
    echo "❌ systemd-timesyncd not found"
    TIMESYNCD_AVAILABLE=false
fi

# Check if chrony is available
if command -v chrony >/dev/null 2>&1; then
    echo "✅ chrony is available"
    CHRONY_AVAILABLE=true
else
    echo "❌ chrony not found"
    CHRONY_AVAILABLE=false
fi

# Check if ntp is available
if command -v ntpq >/dev/null 2>&1; then
    echo "✅ ntp is available"
    NTP_AVAILABLE=true
else
    echo "❌ ntp not found"
    NTP_AVAILABLE=false
fi

echo ""
echo "🔧 Installing and configuring time sync..."

# Install systemd-timesyncd if not available
if [ "$TIMESYNCD_AVAILABLE" = false ]; then
    echo "📦 Installing systemd-timesyncd..."
    apt update
    apt install -y systemd-timesyncd
fi

# Install chrony as alternative
if [ "$CHRONY_AVAILABLE" = false ]; then
    echo "📦 Installing chrony..."
    apt install -y chrony
fi

echo ""
echo "⚙️ Configuring time sync..."

# Enable and start systemd-timesyncd
if systemctl list-unit-files | grep -q "systemd-timesyncd"; then
    echo "🔄 Enabling systemd-timesyncd..."
    systemctl enable systemd-timesyncd
    systemctl start systemd-timesyncd
    
    if systemctl is-active --quiet systemd-timesyncd; then
        echo "✅ systemd-timesyncd is running"
    else
        echo "❌ Failed to start systemd-timesyncd"
    fi
fi

# Enable and start chrony
if command -v chrony >/dev/null 2>&1; then
    echo "🔄 Enabling chrony..."
    systemctl enable chrony
    systemctl start chrony
    
    if systemctl is-active --quiet chrony; then
        echo "✅ chrony is running"
    else
        echo "❌ Failed to start chrony"
    fi
fi

echo ""
echo "🌍 Setting timezone to UTC (recommended for servers)..."
timedatectl set-timezone UTC

echo ""
echo "📊 Current time sync status:"
timedatectl status

echo ""
echo "🔍 Checking NTP servers..."
if command -v chrony >/dev/null 2>&1; then
    echo "Chrony sources:"
    chrony sources
elif command -v ntpq >/dev/null 2>&1; then
    echo "NTP peers:"
    ntpq -p
else
    echo "No NTP client available"
fi

echo ""
echo "⏰ Final time check:"
echo "Current time: $(date)"
echo "UTC time: $(date -u)"
echo "Timezone: $(timedatectl | grep 'Time zone')"

echo ""
echo "🎯 Time sync configuration complete!"
echo "💡 If time is still wrong, try:"
echo "   - Reboot the system: sudo reboot"
echo "   - Check hardware clock: sudo hwclock --show"
echo "   - Sync hardware clock: sudo hwclock --systohc"
echo "   - Monitor time sync: sudo journalctl -f -u systemd-timesyncd"

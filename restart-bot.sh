#!/bin/bash

echo "🔄 NFT Tracker Bot Restart Script"
echo "=================================="

# Function to check if bot is running
check_bot() {
    if pgrep -f "node index.js" > /dev/null; then
        echo "✅ Bot is currently running"
        return 0
    else
        echo "❌ Bot is not running"
        return 1
    fi
}

# Function to stop bot
stop_bot() {
    echo "🛑 Stopping bot..."
    pkill -f "node index.js"
    
    # Wait for process to stop
    sleep 3
    
    if check_bot; then
        echo "⚠️ Bot is still running, force killing..."
        pkill -9 -f "node index.js"
        sleep 2
    fi
    
    echo "✅ Bot stopped"
}

# Function to start bot
start_bot() {
    echo "🚀 Starting bot..."
    
    # Check if we're in the right directory
    if [ ! -f "index.js" ]; then
        echo "❌ Error: index.js not found in current directory"
        echo "💡 Please run this script from the bot directory"
        exit 1
    fi
    
    # Start bot in background
    nohup node index.js > bot.log 2>&1 &
    
    # Wait a moment for startup
    sleep 5
    
    if check_bot; then
        echo "✅ Bot started successfully"
        echo "📋 Logs are being written to bot.log"
        echo "💡 Use 'tail -f bot.log' to monitor logs"
    else
        echo "❌ Failed to start bot"
        echo "📋 Check bot.log for error details"
        exit 1
    fi
}

# Main execution
echo "🔍 Checking current bot status..."
check_bot

if [ $? -eq 0 ]; then
    echo ""
    read -p "Bot is running. Do you want to restart it? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        stop_bot
        echo ""
        start_bot
    else
        echo "❌ Restart cancelled"
        exit 0
    fi
else
    echo ""
    read -p "Bot is not running. Do you want to start it? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        start_bot
    else
        echo "❌ Start cancelled"
        exit 0
    fi
fi

echo ""
echo "🎯 Bot management complete!"
echo "💡 Useful commands:"
echo "   - Monitor logs: tail -f bot.log"
echo "   - Check status: node monitor-bot.js"
echo "   - Test Discord: node test-discord-connection.js"
echo "   - Check time: node check-time.js"

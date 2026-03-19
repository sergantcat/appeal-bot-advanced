require('dotenv').config();

const client = require('./bot/client');
const db = require('./database');
const fs = require('fs');
const path = require('path');

// Initialize database
db.init();

// Load events
const eventsPath = path.join(__dirname, 'bot', 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// Start dashboard
const app = require('./dashboard/server');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`[DASHBOARD] Running on port ${PORT}`);
  console.log(`[DASHBOARD] URL: ${process.env.DASHBOARD_URL || `http://localhost:${PORT}`}`);
});

// Login bot
const token = process.env.DISCORD_TOKEN;
if (token) {
  client.login(token).catch(err => {
    console.error('[BOT] Failed to login:', err.message);
    console.log('[BOT] Dashboard is still running without the bot. Configure DISCORD_TOKEN to enable the bot.');
  });
} else {
  console.log('[BOT] No DISCORD_TOKEN set. Dashboard is running without the bot.');
  console.log('[BOT] Set DISCORD_TOKEN in .env to enable the Discord bot.');
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SYSTEM] SIGTERM received, shutting down...');
  client.destroy();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[SYSTEM] SIGINT received, shutting down...');
  client.destroy();
  process.exit(0);
});

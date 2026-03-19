# Appeal Bot Advanced v2.0

A powerful, feature-rich Discord appeal management system with a beautiful web dashboard. Handle security, raider, game, and custom appeals with an intuitive interface - no code editing needed.

## Features

### Discord Bot
- **Multiple Appeal Types**: Security, Raider, Game, Other + fully customizable types
- **Interactive Panels**: Beautiful embeds with buttons in each appeal channel
- **Modal Forms**: Custom questions per appeal type (up to 5 per type)
- **Thread System**: Auto-creates private threads for each appeal
- **Staff Tools**: Claim, Approve, Deny, Escalate, Add Notes, Request Evidence, Set Priority
- **DM Notifications**: Users get DM updates on status changes
- **Logging**: All actions logged to a configured channel
- **Statistics**: Real-time appeal statistics
- **Cooldowns**: Configurable cooldown between submissions
- **Blacklist**: Block users from submitting appeals
- **Auto Responses**: Automated messages on status changes
- **Slash Commands**: `/setup`, `/deploy-panel`, `/appeal view/search/stats/history/blacklist`

### Web Dashboard
- **Discord OAuth2 Login**: Secure authentication
- **Server Overview**: Stats, appeal breakdown charts, quick actions
- **Settings**: Configure channels, roles, cooldowns, toggles
- **Appeal Types**: Create/edit types, customize embeds, buttons, colors, questions
- **Appeals Manager**: View, filter, approve/deny/escalate from the dashboard
- **Blacklist Manager**: Add/remove blacklisted users
- **Auto Responses**: Configure automated messages with template variables
- **Response Templates**: Pre-made templates for staff
- **Activity Logs**: Complete history of all actions

## Setup

### Prerequisites
- Node.js 18+
- A Discord bot application ([Discord Developer Portal](https://discord.com/developers/applications))

### 1. Clone & Install
```bash
git clone https://github.com/sergantcat/appeal-bot-advanced.git
cd appeal-bot-advanced
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` with your values:
```env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DASHBOARD_URL=http://localhost:3000
SESSION_SECRET=random_secret_string
PORT=3000
ADMIN_IDS=your_discord_user_id
```

### 3. Discord Bot Setup
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application (or use existing)
3. Go to **Bot** tab > Copy the token > paste as `DISCORD_TOKEN`
4. Copy the **Application ID** > paste as `DISCORD_CLIENT_ID`
5. Go to **OAuth2** tab > Copy **Client Secret** > paste as `DISCORD_CLIENT_SECRET`
6. Add redirect URL: `http://localhost:3000/auth/callback` (or your dashboard URL)
7. Go to **Bot** tab > Enable all **Privileged Gateway Intents**
8. Invite bot with this URL (replace CLIENT_ID):
   ```
   https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=8&scope=bot%20applications.commands
   ```

### 4. Run
```bash
npm start
```

The bot and dashboard will start together. Open `http://localhost:3000` for the dashboard.

### 5. Discord Setup
In your Discord server:
1. Run `/setup` to generate default appeal panels with buttons
2. Or use `/deploy-panel #channel` to deploy panels to specific channels
3. Configure everything else from the dashboard

## Server Structure

The bot is designed to work with this channel structure:
```
Information
  |- #rules
  |- #how-to-appeal
  |- #departmental-announcement
  |- #punishment-types
  |- #appeal-status-guide
  |- #roles

Public Transparency
  |- #appeal-logs
  |- #appeal-statistics

Appeal-types
  |- #security-appeals
  |- #raider-appeals
  |- #game-appeals
  |- #other-appeals

Staff Operations
  |- #appeal-discussion
  |- #moderation-cases
  |- #admin-chat
  |- #appeal-evidence
```

## Dashboard Pages

| Page | Description |
|------|-------------|
| **Overview** | Stats cards, appeal breakdown charts, quick actions |
| **Settings** | Channels, roles, cooldowns, toggles (threads, DM, evidence, etc.) |
| **Appeal Types** | Create/edit types with embed customization and custom questions |
| **Appeals** | Browse, filter, and manage all appeals with status actions |
| **Blacklist** | Add/remove users from the blacklist |
| **Auto Responses** | Automated messages with template variables |
| **Templates** | Pre-made response templates for staff |
| **Logs** | Complete activity history |

## Tech Stack
- **Bot**: discord.js v14
- **Dashboard**: Express + EJS + Tailwind CSS
- **Database**: better-sqlite3
- **Auth**: Passport.js + Discord OAuth2

## License
MIT

# Discord Reminder Bot

## Overview
A Discord bot that sends scheduled reminders to channels with a web-based control panel. Reminders persist across bot restarts using JSON file storage.

## Project Structure
- `index.js` - Main bot file with Discord client, Express server, and API routes
- `data/reminders.json` - Persistent storage for reminders (auto-created)
- `package.json` - Node.js dependencies

## Features
- **Flexible scheduling**:
  - One-time reminders (interval=0, no days selected)
  - Daily at specific time (interval=0, days selected) - e.g., 6am on Tue-Sun
  - Recurring (interval>=5 minutes)
- Pre-warning notifications before main reminders
- Role mentions
- Date range restrictions
- Custom embed colors and titles
- Web control panel on port 5000
- **Persistent storage**: Reminders survive bot restarts

## Tech Stack
- Node.js
- discord.js - Discord API library
- Express - Web server for control panel

## Environment Variables
- `DISCORD_TOKEN` - Discord bot token (stored as secret)

## Running the Bot
The bot runs via the "Discord Bot" workflow which starts `node index.js` and serves the web UI on port 5000.

## Recent Changes
- 2025-12-15: Added inactive reminders UI section
  - One-time reminders that fired appear in "Inactive Reminders" section
  - Shows when the reminder last fired
  - "Reactivate" button reschedules the reminder to fire again
- 2025-12-15: Improved reminder scheduling
  - Interval 0 = one-time or daily at specific time
  - One-time reminders move to inactive list after firing
  - Default messages include {time} and emojis
- 2025-12-15: Added JSON file persistence for reminders

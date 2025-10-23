# Automatic Game Recording Auto-Save Feature

## Overview

The game now automatically saves and downloads game recordings when a game ends (if recording is enabled). This makes it effortless to collect game data for AI analysis.

## How It Works

### 1. **Automatic Download on Game End**
- When a game finishes and recording is enabled, the system automatically:
  1. Downloads the recording JSON file to your Downloads folder
  2. Saves a copy to the browser's IndexedDB database
  3. Displays a confirmation message showing the auto-save succeeded

### 2. **Auto-Download Behavior**
- File naming: `game_TIMESTAMP_GAMEID.json`
- Example: `game_2024-01-15_10-35-42_a1b2c3d4.json`
- The timestamp helps you organize recordings chronologically
- Your browser's Downloads folder will contain the files automatically

### 3. **Database Persistence**
- Recordings are saved to IndexedDB (browser's local database)
- Allows you to view, download, or delete historical recordings
- Persists even if you close the browser tab

## Features

### Auto-Save Status
- When the game ends, you'll see: **"✓ Recording auto-saved and downloaded!"**
- This confirms both the database save AND file download completed

### Manual Download Options
- **"Download Raw Recording"** - Downloads the raw JSON recording data
- **"Download for AI Analysis"** - Downloads a special format optimized for AI analysis with analysis prompts

### View Saved Recordings
1. From the Welcome screen, click **"View Saved Recordings"**
2. See a list of all your past game recordings:
   - Player name vs Bot difficulty
   - Winner and turn count
   - Timestamp of the game
3. For each recording, you can:
   - **Download** - Save it again if needed
   - **Delete** - Remove it from the database

## Using Recordings for AI Analysis

### Step 1: Collect Recordings
- Enable recording at the start of a game
- Play games normally - recording happens automatically
- Download happens automatically when the game ends

### Step 2: Review Your Recordings
- View your past games in "Saved Recordings"
- Download any recording you want to analyze

### Step 3: Get AI Insights
1. Download the recording (or use "Download for AI Analysis" for AI-optimized format)
2. Copy the entire JSON content
3. Paste it into your AI chat
4. Ask the AI to analyze:
   - Your strategic patterns
   - Decision quality
   - Recommendations for bot improvement
5. Implement suggested changes to improve the bot

## Technical Details

### Storage
- **Browser Storage**: IndexedDB (`MonsterGameRecordings` database)
- **File Storage**: Your Downloads folder (automatic)
- Data stored includes:
  - Game metadata (player name, difficulty, outcome)
  - Complete game state history
  - All actions and their outcomes
  - Timestamps for each decision

### Recording Data Structure
```json
{
  "metadata": {
    "gameId": "unique_game_id",
    "timestamp": "ISO_8601_timestamp",
    "playerName": "Your Name",
    "playerType": "human",
    "botDifficulty": "medium",
    "recordingVersion": "1.0"
  },
  "turns": [
    {
      "turnNumber": 1,
      "currentPlayer": "player",
      "phases": { ... },
      "actions": [ ... ]
    },
    ...
  ],
  "winner": "player",
  "reason": "Player won"
}
```

### Privacy
- Only game data is recorded (no personal information beyond player name)
- Recordings are stored locally in your browser
- You have full control - can delete recordings anytime

## Troubleshooting

### File Not Downloaded
- Check your browser's download settings
- Some browsers may require permission for auto-downloads
- Try "Download Raw Recording" button as alternative

### Recording Not Saving to Database
- Your browser may have limited storage
- Try clearing IndexedDB if quota is exceeded
- Or delete old recordings to make space

### View Saved Recordings Not Working
- Ensure IndexedDB is enabled in your browser
- Check browser storage/privacy settings
- Try clearing browser cache and reloading

## Benefits for Bot Training

1. **Consistent Data Collection** - No manual downloading needed
2. **Better Analysis** - Multiple game recordings = better patterns
3. **Iterative Improvement** - Play → Record → Analyze → Improve cycle
4. **AI Training Data** - Feed recordings to AI to get specific bot improvements
5. **Performance Tracking** - Compare bot performance over time with game records

## Future Enhancements

Potential improvements could include:
- Automatic upload to cloud storage
- Built-in replay player to watch past games
- Stats dashboard showing win rates and patterns
- Export recordings to various formats (CSV, etc.)
- Batch AI analysis of multiple recordings

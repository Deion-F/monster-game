# Game Recording System for AI Analysis

The Monster Game now has built-in game recording functionality that allows you to record complete game sessions and export them for AI analysis. This enables the bot to learn from your playing style and improve its strategy.

## How to Enable Recording

1. When you start a new game, check the **"Record game for AI analysis"** checkbox in the welcome dialog
2. This will record all game state changes and moves throughout the entire game

## What Gets Recorded

The recording system captures:

### Metadata
- Game ID (unique identifier for this recording)
- Timestamp when the game started
- Player name
- Bot difficulty level
- Recording version

### Game State
For each turn, the system records:
- **Turn Start State**: Complete board state at the beginning of each turn
  - Player health and hand
  - Both players' monster field (with monster strengths/fusion info)
  - Both players' trap field
  - Deck remaining count

- **Phase States**: Full board state at the start and end of each phase:
  - Draw Phase
  - Setup Phase
  - Battle Phase
  - End Phase

- **Actions**: All player actions with before/after board states:
  - Summons (with sacrifices used)
  - Trap placements
  - Fusions created
  - Attacks (with result)
  - Trap activations

### Card Information
Cards are recorded with:
- Card value (A, 2-10, J, Q, K, JOKER)
- Card suit (hearts, diamonds, clubs, spades)
- Card type (monster_normal, monster_big, trap, joker)
- Numeric value
- Whether it's a fusion
- If fusion: the fusion strength
- Card state (in_hand, on_field, in_discard, etc.)

## Downloading Recordings

After a game completes with recording enabled, the game-over dialog will show two download options:

### 1. Download Raw Recording
- Exports the complete raw game data in JSON format
- Contains all board states and actions
- File format: `game_<id>.json`

### 2. Download for AI Analysis
- Exports a package pre-formatted for AI analysis
- Includes the game recording plus analysis instructions
- Includes optional field for your strategy notes
- File format: `game_analysis_<id>.json`

## Using Recordings with AI

### Step 1: Prepare Your Feedback
In the "Download for AI Analysis" option, you can optionally add notes about your strategy before downloading, such as:
- "Focused on aggressive early fusion strategy"
- "Tried to preserve high-value cards in hand"
- "Defensive trap placement strategy"

### Step 2: Upload to AI Chat
1. Download the AI analysis package JSON file
2. Paste the entire JSON content into your chat with an AI (e.g., Claude, ChatGPT)
3. Include a message like:

```
Please analyze this game recording and provide recommendations to improve the bot's behavior 
to play more like this player. Focus on:
1. Strategic patterns you notice in the player's decisions
2. Which decisions led to favorable outcomes
3. Specific suggestions for improving the bot's AI logic
4. Code changes that would make the bot play more like this player

Do not create any .md or explanation files. Provide all explanations in the chat.
```

### Step 3: Implement Recommendations
The AI will provide analysis in a structured JSON format with:
- **Player Strategy Analysis**: Summary of patterns and strengths
- **Bot Improvements**: Specific recommendations for each game phase
- **Code Changes**: Specific method changes to implement

You can then use these recommendations to improve the bot's code in `js/bot.js`

## JSON File Structure

### Raw Recording Format

```json
{
  "metadata": {
    "gameId": "game_1729814400000_abc123def",
    "timestamp": "2024-10-24T10:00:00.000Z",
    "playerName": "YourName",
    "playerType": "human",
    "botDifficulty": "medium",
    "recordingVersion": "1.0"
  },
  "initialState": { /* complete game state */ },
  "turns": [
    {
      "turnNumber": 1,
      "currentPlayer": "human",
      "playerName": "YourName",
      "startState": { /* board state at turn start */ },
      "phases": {
        "Draw": {
          "startState": { /* board state */ },
          "endState": { /* board state */ },
          "events": []
        },
        "Setup": {
          "startState": { /* board state */ },
          "endState": { /* board state */ },
          "events": []
        },
        "Battle": { /* ... */ },
        "End": { /* ... */ }
      },
      "actions": [
        {
          "timestamp": 1729814402000,
          "actionType": "trap_placement",
          "actor": "human",
          "details": {
            "trapCard": { /* card data */ },
            "trapType": "Q",
            "spaceIndex": 0
          },
          "boardStateBefore": { /* ... */ },
          "boardStateAfter": { /* ... */ }
        },
        /* more actions... */
      ]
    },
    /* more turns... */
  ],
  "finalState": { /* complete game state at end */ },
  "gameOutcome": "completed",
  "winner": "human|bot",
  "reason": "Victory or Defeat message"
}
```

### AI Analysis Package Format

The AI analysis package wraps the raw recording with analysis instructions:

```json
{
  "type": "game_recording_for_ai_analysis",
  "version": "1.0",
  "purpose": "Game replay analysis to improve bot AI behavior...",
  "gameRecording": { /* raw recording */ },
  "analysisPrompt": "Please analyze this game recording and...",
  "playerNotes": "Your optional strategy notes",
  "timestamp": "2024-10-24T10:00:00.000Z",
  "howToUse": "To use this for AI analysis: 1. Copy the entire JSON..."
}
```

## Learning Loop: Iterative Improvement

For best results, repeat this process multiple times:

1. **Play a game** with recording enabled
2. **Download** the recording (with or without AI analysis)
3. **Upload** to AI and ask for improvement recommendations
4. **Implement** the suggested bot code changes
5. **Play again** with the improved bot
6. **Repeat** to progressively refine the bot's strategy

## Privacy Notes

- Only the player's visible cards are recorded
- Bot's hand is not revealed in recordings (only hand count)
- This ensures the recording can be safely analyzed by external AIs
- The recording contains only game-relevant information

## Accessing Raw Data Programmatically

If you want to access the recording data directly in JavaScript:

```javascript
// Get the current game recorder
const recorder = window.game.recorder;

// Check if recording is enabled
if (recorder.isEnabled()) {
  // Get the raw recording object
  const recordingObject = recorder.getRecording();
  
  // Export as JSON string
  const jsonString = recorder.exportToJSON();
  
  // Export for AI analysis (with optional notes)
  const aiPackage = recorder.exportForAIAnalysis("My strategy notes");
}
```

## Troubleshooting

### Recording checkbox doesn't appear
- Make sure you're running the latest version of the code
- Clear your browser cache and reload
- Check browser console for errors

### Download button doesn't work
- Check that your browser allows downloads
- Verify the popup blocker isn't interfering
- Try a different browser

### AI Analysis format looks wrong
- Verify you copied the entire JSON content
- Ensure no extra text was added before/after the JSON
- Try pasting into a JSON validator first

## Future Improvements

Planned enhancements to the recording system:
- [ ] Replay playback UI to visualize recorded games
- [ ] Automatic AI suggestions after each game
- [ ] Comparison of multiple game recordings
- [ ] Bot difficulty-level recommendations based on player performance
- [ ] Import external game recordings for analysis


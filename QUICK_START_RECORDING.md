# Quick Start: Recording Your Games

## 3-Minute Setup

### 1. Enable Recording When Starting a Game
```
✓ Check "Record game for AI analysis" in the welcome screen
```

### 2. Play Your Game Normally
- No changes to gameplay
- Recording happens automatically in the background

### 3. Download After Game Ends
```
Option A: Download for AI Analysis (recommended)
- Better for understanding why the bot should change
- Includes space for your strategy notes
- Generates structured feedback format

Option B: Download Raw Recording
- Full technical data
- For detailed analysis or archival
```

## Using the Recording with AI

### Copy → Paste → Analyze

1. **Copy** the downloaded JSON file contents
2. **Paste** into your AI chat (Claude, ChatGPT, etc.)
3. **Ask** the AI:
   ```
   Please analyze this game recording and:
   1. Identify my strategy patterns
   2. Find areas where my decisions were strong
   3. Suggest specific bot improvements to play like me
   4. Provide code changes for js/bot.js to implement these improvements
   ```

## What The AI Will Tell You

The AI analysis will include:
- **What you did well**: Your strategic strengths
- **Patterns it noticed**: Recurring decision-making
- **Bot improvements**: Specific code changes to make the bot play like you
- **Priority actions**: Which changes would have the biggest impact

## Iterative Improvement Loop

```
Play Game 1 → Download → Analyze → Implement Changes
                                         ↓
           Play Game 2 with Improved Bot ← Improved Bot
           (bot now plays more like you)
```

## File Naming

Generated files use this format:
- `game_<timestamp>_<random>.json` - Raw recording
- `game_analysis_<timestamp>_<random>.json` - AI analysis package

Example:
- `game_1729814400000_a7k3m2p.json`
- `game_analysis_1729814400000_a7k3m2p.json`

## Frequently Asked Questions

**Q: Does the bot always record my hand?**
A: No. The recording only shows the bot's hand count, not cards. Your cards are visible to provide full context to the AI.

**Q: Can I delete a recording if I don't like the game?**
A: Yes - just delete the JSON file. Recording is purely opt-in.

**Q: What if I make multiple recordings?**
A: Each gets a unique ID. You can upload multiple to analyze patterns across many games.

**Q: Does the AI have access to sensitive info?**
A: The recording contains only game-play data. No account info, no personal data.

**Q: Can I use recordings from multiple players?**
A: Yes! You can analyze each player's style separately and even compare them.

## Protip: Strategy Notes

Before downloading for AI analysis, think about your main strategy:
- "I prioritized hand management and aggressive early attacks"
- "I focused on defensive trap placement"
- "I tried to always have a fusion ready by turn 3"

Add these notes to the analysis dialog - it helps the AI understand your intent!

## Next Steps

1. Start a game with recording enabled
2. Play naturally (make decisions you think are good)
3. Download the recording when the game ends
4. Paste into AI chat and ask for improvements
5. Review the recommendations
6. Implement bot code changes
7. Play again - watch the bot play more like you!

---

For full documentation, see `GAME_RECORDING.md`

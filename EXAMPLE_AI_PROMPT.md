# Example AI Prompt for Game Analysis

After downloading your game recording (AI Analysis package), use a prompt like this when chatting with an AI:

## Template Prompt

```
I've recorded a Monster Card Battle game and want to improve the bot's AI to play more like me.
Please analyze this game recording and provide recommendations.

[PASTE YOUR GAME_ANALYSIS JSON HERE]

Please analyze the game and provide:

1. **My Strategy Summary**
   - What was my overall approach to the game?
   - What were my key strategic decisions?
   - Which decisions seemed strongest?
   - Which decisions could have been better?

2. **Strategic Patterns**
   - What patterns do you notice in how I made decisions?
   - When did I focus on offense vs defense?
   - How did I manage my hand size?
   - How did I choose between summoning vs creating fusions?

3. **Bot Improvement Recommendations**
   Provide specific recommendations for the bot's JavaScript code in these areas:
   - Setup Phase Strategy
   - Attack Phase Logic
   - Sacrifice Selection
   - Trap Placement
   - Hand Management

4. **Code Changes**
   For each recommendation, provide:
   - The method name to modify
   - Current behavior
   - Proposed behavior
   - Why this change would improve play
   - Specific code suggestions (even pseudo-code is helpful)

5. **Implementation Priority**
   - Which changes would have the biggest impact?
   - Which are easiest to implement?
   - Suggest a priority order for implementation

Format your response as JSON if possible, so I can easily track your recommendations.
```

## Specific Prompt Variations

### For Aggressive Strategy Analysis:
```
My main strategy in this game was aggressive offense. I focused on:
- Creating fusions early to overcome disadvantages
- Attacking equal-strength or even slightly weaker monsters
- Managing my hand to prepare for future attacks

Please analyze my game and suggest how the bot should be more aggressive in similar situations.
```

### For Defensive Strategy Analysis:
```
My main strategy was defensive positioning. I focused on:
- Placing traps strategically
- Preserving high-value cards
- Building a strong defensive board before attacking

Please suggest bot improvements to play more defensively.
```

### For Hand Management Analysis:
```
I noticed I was carefully managing my hand size, often sacrificing cards to enable 
fresh draws. Please analyze how this strategy affected my game performance and 
suggest bot improvements for better hand management.
```

## Follow-up Questions

After the AI provides recommendations, you can ask:

```
Now, can you provide specific Python/JavaScript pseudocode for implementing 
the top 3 recommendations? I need to modify js/bot.js to add these improvements.
```

Or:

```
Can you prioritize these changes by impact? Which 2-3 changes would give the 
most improvement with the least code modification?
```

Or:

```
I see your recommendation for sacrificing cards more aggressively. How should I 
modify the selectSacrificesForBigMonster() and selectCardsForFusionUpkeep() 
methods to implement this?
```

## What You'll Get Back

A good AI analysis will include things like:

```json
{
  "strategySummary": {
    "approach": "Aggressive early game with hand management focus",
    "strengths": ["Timely fusion creation", "Effective hand cycling"],
    "weaknesses": ["Conservative attack selection in mid-game"]
  },
  "patterns": [
    "Always tries to empty hand before end phase",
    "Prioritizes creating fusions when at disadvantage",
    "Attacks equal-strength targets for board control"
  ],
  "botImprovements": {
    "setupPhase": "When at disadvantage, create fusions BEFORE summoning big monsters",
    "attackPhase": "Allow attacks on equal-strength targets (not just stronger ones)",
    "sacrificeLogic": "When summoning big monsters, prefer sacrificing hand cards over field cards",
    "handManagement": "Proactively empty hand (> 5 cards) to enable fresh 5-card draw"
  },
  "codeChanges": [
    {
      "method": "handleSetupPhase()",
      "change": "Add strategic evaluation to route through different summon sequences",
      "priority": "HIGH"
    }
  ]
}
```

## Tips for Best Results

1. **Be specific** about what you tried to accomplish
2. **Include strategy notes** in the game recording download dialog
3. **Mention difficulty levels** you're targeting
4. **Describe your playstyle** - aggressive, defensive, balanced, etc.
5. **Ask for priorities** - what changes matter most?

## Next Steps After AI Analysis

1. Save the AI recommendations
2. Review the suggested code changes
3. Implement them one at a time in `js/bot.js`
4. Test each change
5. Record new games and repeat

The more games you record and analyze, the more the bot will learn to play like you!

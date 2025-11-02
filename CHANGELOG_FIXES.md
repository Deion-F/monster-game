
```markdown

```markdown

## Player Battle Phase Transition Fix (Current)

### Problem
The player's battle phase was being completely skipped when clicking "End Phase" during the setup phase. Instead of transitioning to BATTLE phase, the game would jump directly to the END phase.

### Root Cause Analysis
Multiple issues contributed to this problem:

1. **Uninitialized Flag**: The `skipBattleThisTurn` flag was not initialized in the Player constructor, causing undefined behavior
2. **Incomplete Reset**: The `resetForNewTurn()` method didn't reset the `skipBattleThisTurn` flag, potentially causing it to persist from previous turns
3. **Phase Transition Logic**: When transitioning from SETUP to BATTLE, the code didn't explicitly return after updating the phase, allowing execution to continue and potentially calling fallback logic

### Solution Implemented
Made three coordinated fixes to ensure proper phase transitions:

**1. Player Constructor Initialization** (`js/player.js` line ~18):
- Added `this.skipBattleThisTurn = false;` to properly initialize the flag
- Ensures the flag has a defined state from game start

**2. Phase Reset Logic** (`js/player.js` line ~468):
- Added `this.skipBattleThisTurn = false;` to `resetForNewTurn()` method
- Ensures the flag is cleared at the start of each turn, preventing carryover from Joker plays

**3. SETUP → BATTLE Transition** (`js/game.js` lines 142-150):
- Changed the SETUP case to immediately update UI and return after setting phase to BATTLE
- Added explicit logging for debugging
- Prevents fallthrough that could bypass the battle phase

**Before:**
```javascript
} else {
    this.currentPhase = PHASES.BATTLE;
}
break;
// Falls through to end of switch...
```

**After:**
```javascript
} else {
    this.currentPhase = PHASES.BATTLE;
    this.ui.updateTurnAndPhase();  // Update UI immediately
    this.ui.updateBoard();
    return;  // Exit, don't fall through
}
break;
```

### Verification
- ✅ Player constructor properly initializes `skipBattleThisTurn`
- ✅ `resetForNewTurn()` properly clears the flag
- ✅ SETUP → BATTLE transition is explicit and immediate
- ✅ Console logging added for debugging
- ✅ All 12 JavaScript files pass syntax validation
- ✅ No compilation errors

### Expected Behavior After Fix
- ✅ Clicking "End Phase" in SETUP now transitions to BATTLE
- ✅ Button text updates to "End BATTLE Phase"
- ✅ Player can now click monsters to attack during battle phase
- ✅ No more direct SETUP → END phase skipping
- ✅ Joker skip flag doesn't persist between turns

### Testing Scenarios
1. **Normal SETUP → BATTLE**: Click "End Phase" in setup → should see BATTLE phase, button says "End BATTLE Phase"
2. **After Joker Play**: Play Joker → SETUP should be skipped → should go directly to END
3. **Multiple Turns**: Play several turns → `skipBattleThisTurn` flag should not accumulate

---

## Battle Phase Skipping Bug - FIXED ✅

### Problem
The player's battle phase was being completely skipped after the bot finished its turn. When it was the player's turn again, they would jump directly from setup to end phase, unable to attack.

### Root Cause
The bot's `takeTurn()` method in `js/bot.js` was progressing through all phases internally (DRAW → SETUP → BATTLE → END) but **never updating** `this.game.currentPhase` to reflect which phase it was actually in. 

When the bot finished and called `endTurn()` to switch back to the player:
1. `endTurn()` calls `startTurn()` which sets `currentPhase = PHASES.DRAW`
2. `handleDrawPhase()` sets `currentPhase = PHASES.SETUP`
3. But the bot's internal phase was already BATTLE phase (locally handled, not tracked globally)
4. When the bot finished battle phase and ended turn, `currentPhase` was out of sync
5. Player's turn would then skip the battle phase entirely

### Solution
Updated the bot's `takeTurn()` method to properly track `game.currentPhase` as it transitions through phases:

**Changes Made**:
- Line 194: Added `this.game.currentPhase = PHASES.BATTLE;` before `handleBattlePhase()`
- Line 202: Added `this.game.currentPhase = PHASES.END;` before `handleEndPhase()`

This ensures `game.currentPhase` stays in sync with the bot's internal phase progression, so when control returns to the player, the phase tracking is correct.

**Files Modified**:
- `js/bot.js` - Added phase tracking updates in `takeTurn()` method (lines 194 and 202)

**Expected Behavior After Fix**:
- ✅ Player battle phase no longer skipped
- ✅ Player can properly attack during their turn
- ✅ Phase UI updates correctly during bot's turn
- ✅ Game phase tracking stays synchronized

---

## Bot Ace Trap Defense Bug Fix (Previous)

### Problem
The bot was using the Ace trap defensively **only** for direct attacks, but NOT to prevent its own monsters from being destroyed during monster-to-monster attacks. This meant:
- Player attacks bot's 3-strength monster with a 5-strength monster → Monster gets destroyed
- Bot has an Ace trap available → Bot does nothing
- Optimal play: Bot should use Ace to end the battle phase BEFORE the monster is destroyed

### Root Cause
The `handleDefensiveTraps()` method in `js/bot.js` had the Ace trap evaluation gated behind a `if (targetIndex === null)` check, which only triggers for direct attacks. Monster-to-monster attacks (where `targetIndex !== null`) completely skipped Ace evaluation.

### Solution
Added comprehensive Ace trap evaluation for monster-to-monster attacks (when `targetIndex !== null`):

1. **Threat Assessment**: Evaluates if the attacking player's monster would destroy the bot's monster
2. **Value Calculation**: Prioritizes using Ace to save valuable monsters (strength > 6)
3. **Strategic Consideration**: Reduces Ace usage probability if stronger threats exist later (saves Ace for bigger threats)
4. **Threshold Logic**: Uses Ace when probability >= 0.5 (consistent with direct attack behavior)

**Decision Matrix**:
- Monster WILL be destroyed → useAceProbability = 0.85 (strong incentive)
  - If saving high-value monster (>6) → +0.10 bonus
- Monster WON'T be destroyed but it's a tie → useAceProbability = 0.40 (medium incentive)
- Monster will survive → useAceProbability = 0.10 (minimal incentive)
- If stronger threats exist later → -0.20 (save Ace for them)

**Files Modified**:
- `js/bot.js` - Added Ace trap evaluation logic for monster-to-monster attacks in `handleDefensiveTraps()` method (lines 1941-2010)

**Expected Behavior After Fix**:
- ✅ Bot uses Ace to prevent monster destruction in monster-to-monster attacks
- ✅ Bot still uses Ace for direct attacks (unchanged)
- ✅ Bot makes smart decisions about saving Ace for stronger threats
- ✅ Bot prioritizes saving high-value monsters
- ✅ No performance degradation or errors

---

## Selection Styling Enhancement (October 20, 2025)

### Added Context-Aware Card Selection Styling

**Problem**: Card selections in different contexts (sacrifice, fusion, upkeep) all looked the same, making it unclear what action was being performed.

**Solution**: Implemented color-coded selection themes for different game actions:

1. **Sacrifice Selection** (🔴 Red/Orange Theme)
   - Used when selecting cards to sacrifice for big monsters (Kings, Aces)
   - Red border and glow effect
   - Subtle gradient background (red → orange)
   - Communicates destruction/cost

2. **Fusion Candidate Selection** (💜 Purple/Magenta Theme)
   - Used when selecting hand cards to fuse with field monsters
   - Purple/magenta border and glow
   - Animated pulsing effect (2s cycle)
   - Emphasizes the magical fusion process

3. **Fusion Upkeep Selection** (⚠️ Yellow/Amber Theme)
   - Used when selecting cards for fusion maintenance cost
   - Warning yellow/amber coloring
   - Communicates maintenance cost/warning

4. **Field Monster Selection** (✅ Green Theme)
   - Shows the base monster being fused
   - Success green coloring with gentle pulse
   - Confirms the fusion target

5. **Interactive Hover States**
   - All selectable cards now show dashed borders on hover
   - Border color matches the selection context
   - Improves discoverability of clickable cards

**Visual Enhancements**:
- Cards lift up and scale when selected
- Smooth transitions and animations
- Consistent with Material Design 3 color system
- Each context uses semantic colors (error for sacrifice, warning for upkeep, etc.)

**Files Modified**:
- `css/animations.css` - Added all context-specific selection styles

**User Benefits**:
- Immediately understand what type of selection is being performed
- Visual feedback matches the semantic meaning of the action
- Easier to track which cards are selected across different dialogs
- More polished and professional game feel

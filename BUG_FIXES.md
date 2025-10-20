# Bug Fixes - October 20, 2025

## Issues Fixed

### 1. Duplicate "Sets a Trap" Log Messages ✅

**Problem:** When the bot played a trap card, the message "Bot sets a trap" appeared twice in the game log.

**Root Cause:** 
- `game.playTrapCard()` line 225 logged: `${player.name} sets a trap`
- `bot.js` line 658 also logged: `Bot sets a trap`

**Fix Applied:**
- Removed the duplicate logging from `js/bot.js` line 658
- Added comment explaining that logging is handled in `game.playTrapCard()`
- Log messages now only appear once, from the centralized location in `game.js`

**Files Modified:**
- `js/bot.js` (line ~658)

---

### 2. Player Not Given Opportunity to React to Bot's Trap with Queen ✅

**Problem:** When the bot played a trap card, the player had no opportunity to respond with a Queen trap if they had one active on the field.

**Root Cause:**
- `game.playTrapCard()` only logged the action but didn't trigger a reaction prompt
- Only attack situations triggered `promptTrapResponse()`, not trap-to-trap interactions

**Fix Applied:**
- Enhanced `game.playTrapCard()` to call `promptTrapResponse()` when bot plays a trap
- Updated `promptTrapResponse()` to detect trap-to-trap responses (context type: 'trap')
- Modified `getActivatableTraps()` behavior to recognize trap response scenarios
- Enhanced Queen logic to automatically target the trap that was just played
- Falls back to cancel-trap dialog if Queen can't auto-target

**Implementation Details:**
1. `game.playTrapCard()` now passes `trapCard` and `trapValue` in context when bot plays
2. `promptTrapResponse()` now detects 'trap' type responses and calls `getActivatableTraps()` with correct context
3. Queen handler automatically targets `context.trapCard` when responding to trap placement
4. Unifies Queen and other trap responses in same interaction system

**Files Modified:**
- `js/game.js` (lines ~220-239)
- `js/ui.js` (lines ~1938-2050)

**Result:**
- Player can now click their Queen trap to cancel opponent's newly set trap
- Same reactive highlight system used for all trap responses (Jack, King, Ace, Queen)
- Unified UI/UX for all trap-to-trap interactions

---

### 3. Welcome Dialog Input Shows "Player" Instead of Placeholder ✅

**Problem:** The player name input field showed "Player" as the default value. When the dialog opened, "Player" was already filled in. The player had to clear it before typing their name, rather than just starting to type.

**Root Cause:**
- Input had both `value="Player"` AND `placeholder="Enter your name"`
- The `value` attribute took precedence over placeholder

**Fix Applied:**
- Removed `value="Player"` attribute from the input element
- Kept `placeholder="Enter your name"` for hint text
- Now when dialog opens, input is empty and placeholder text is visible
- When player starts typing, placeholder disappears and their text appears

**Files Modified:**
- `index.html` (line 19)

**Result:**
- Input field now shows placeholder text: "Enter your name"
- Player can start typing immediately without clearing default text
- Better UX matching modern UI patterns

---

## Testing Recommendations

### Test 1: Verify No Duplicate Trap Logs
1. Start a new game
2. Let bot set a trap card during setup phase
3. Check game log - should show "Bot sets a trap" ONCE, not twice

### Test 2: Verify Queen Reaction to Bot's Trap
1. Start a new game
2. Ensure player has a Queen trap active on field
3. Wait for bot to set a trap
4. Player's Queen should be highlighted as reactive option
5. Click Queen to cancel the opponent's newly-set trap
6. Log should show "Player activates Queen and cancels a trap"

### Test 3: Verify Welcome Dialog Input Behavior
1. Launch game
2. Welcome dialog should show empty name input with placeholder text
3. Click on input and start typing (no need to clear first)
4. Text should appear as you type
5. Game should start with your entered name

---

## Technical Notes

### Changes to Trap Response System
- New context type: `'trap'` (in addition to existing 'attack' and 'battle-phase')
- `getActivatableTraps()` now properly handles trap-to-trap scenarios
- Queen can be activated in response to opponent setting a trap
- Maintains 5-second timeout for reactive trap responses

### Centralized Logging
- All trap placement logging now goes through `game.playTrapCard()`
- Single source of truth for gameplay messages
- Prevents duplicate messages in game log

### Backward Compatibility
- All changes maintain existing API
- No breaking changes to game logic
- Trap response system enhanced, not replaced

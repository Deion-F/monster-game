
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

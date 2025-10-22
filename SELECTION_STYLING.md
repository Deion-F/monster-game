# Card Selection Styling Guide

## Overview
Enhanced visual feedback for different card selection contexts in the game.

## Selection Types

### 1. Sacrifice for Big Monsters (Red/Orange Theme)
**Location**: `#sacrifice-area`, `.sacrifice-card-wrapper`
**When**: Selecting cards to sacrifice when playing big monsters (Kings, Aces)
**Visual Styling**:
- Red border with error color (`--md-error`)
- Red glow effect (16px blur, 50% opacity)
- Subtle red-to-orange gradient background
- Lifts up 6px with slight scale (1.02x)
- Red dashed border on hover for selectable cards

**Purpose**: Indicates cards being sacrificed/destroyed

### 2. Fusion Candidate Selection (Purple/Magenta Theme)
**Location**: `#fusion-monsters`
**When**: Selecting a card from hand to fuse with a field monster
**Visual Styling**:
- Tertiary purple border (`--md-tertiary`)
- Purple/magenta glow effect
- Purple gradient background overlay
- Lifts up 6px with noticeable scale (1.05x)
- Animated pulsing effect (2s cycle)
- Purple dashed border on hover

**Purpose**: Highlights fusion candidates, emphasizes the magical fusion process

### 3. Fusion Upkeep Selection (Yellow/Amber Theme)
**Location**: `#fusion-upkeep-cards`
**When**: Selecting cards to sacrifice for fusion upkeep during End Phase
**Visual Styling**:
- Warning yellow/amber border (`--md-warning`)
- Amber glow effect
- Yellow-to-amber gradient background
- Lifts up 6px with slight scale (1.02x)
- Yellow dashed border on hover

**Purpose**: Warning indication of maintenance cost for active fusions

### 4. Field-Selected Monster (Green Theme)
**Location**: `.fusion-card-wrapper.field-selected`
**When**: The monster on the field that was clicked to initiate fusion
**Visual Styling**:
- Success green border (`--md-success`)
- Green glow effect
- Green gradient background overlay
- Gentle pulsing animation (1.5s cycle)
- Scales between 1x and 1.03x

**Purpose**: Confirms which field monster is being used as the fusion base

### 5. Generic Selection (Primary Purple Theme)
**Location**: General `.selected` class
**When**: Other selection contexts (trap cancellation, general card selection)
**Visual Styling**:
- Primary purple border
- Purple glow effect (12px blur)
- Standard lift (4px)
- No animation

**Purpose**: Default selection indicator

## Interactive States

### Selectable Cards
All selectable cards show a dashed border hint on hover:
- 2px dashed border matching the selection context color
- Fades in on hover (opacity 0 → 0.6)
- Indicates card is clickable
- Cursor changes to pointer

## Color Tokens Used
- `--md-primary`: Default selection (purple)
- `--md-error`: Sacrifice selection (red)
- `--md-tertiary`: Fusion candidates (purple/magenta)
- `--md-warning`: Fusion upkeep (yellow/amber)
- `--md-success`: Field selection (green)

## Animation Details
- **Fusion Pulse**: 2s infinite pulse on fusion candidates
- **Field Selected Pulse**: 1.5s infinite gentle pulse on base monster
- **Transform**: Cards lift up when selected (translateY + scale)
- **Transitions**: Smooth transitions (var(--duration-fast))

## Files Modified
- `/css/animations.css` - All selection styling and animations

/**
 * Player class for managing player state
 */
class Player {
    /**
     * Create a player
     * @param {string} type - Player type (human or bot)
     * @param {string} name - Player name
     */
    constructor(type, name) {
        this.type = type;
        this.name = name;
        this.health = GAME_SETTINGS.STARTING_HEALTH;
        this.hand = [];
        this.monsterSpaces = Array(GAME_SETTINGS.MAX_MONSTER_SPACES).fill().map(() => ({ card: null }));
        this.trapSpaces = Array(GAME_SETTINGS.MAX_TRAP_SPACES).fill().map(() => ({ card: null }));
        this.usedTrapTypes = new Set(); // Track trap types used this turn
    }

    /**
     * Draw cards from the deck
     * @param {Deck} deck - Game deck
     * @param {number} count - Number of cards to draw
     */
    drawCards(deck, count) {
        const drawnCards = deck.drawCards(count);
        this.addCardsToHand(drawnCards);
        
        return drawnCards;
    }

    /**
     * Add cards to hand
     * @param {Array} cards - Cards to add
     */
    addCardsToHand(cards) {
        for (const card of cards) {
            card.state = CARD_STATES.IN_HAND;
            if (this.type === PLAYER_TYPES.HUMAN) {
                card.flipFaceUp(); // Human sees their own cards
            }
            this.hand.push(card);
        }
    }

    /**
     * Play a card from hand
     * @param {Card} card - Card to play
     * @param {number} spaceIndex - Space index to play to
     * @returns {Object} - Play result
     */
    playCard(card, spaceIndex) {
        // Remove card from hand
        const cardIndex = this.hand.findIndex(c => c.id === card.id);
        if (cardIndex === -1) return { success: false, message: 'Card not found in hand' };
        
        const cardType = getCardType(card.value);
        let targetSpaces;
        
        // Determine target space array
        if (cardType === CARD_TYPES.MONSTER_NORMAL || cardType === CARD_TYPES.MONSTER_BIG) {
            targetSpaces = this.monsterSpaces;
        } else if (cardType === CARD_TYPES.TRAP) {
            targetSpaces = this.trapSpaces;
        } else if (cardType === CARD_TYPES.JOKER) {
            // Special handling for Joker - don't place it on board
            this.hand.splice(cardIndex, 1);
            card.state = CARD_STATES.ON_FIELD;
            return { success: true, message: 'Joker activated', joker: true };
        }
        
        // Check if target space is valid and empty
        if (spaceIndex < 0 || spaceIndex >= targetSpaces.length || targetSpaces[spaceIndex].card !== null) {
            return { success: false, message: 'Invalid space' };
        }
        
        // Place the card
        this.hand.splice(cardIndex, 1);
        card.state = CARD_STATES.ON_FIELD;
        card.justPlaced = true;

        // Special handling for traps
        if (cardType === CARD_TYPES.TRAP) {
            // Human-placed traps are visible but inactive until next turn
            if (this.type === PLAYER_TYPES.HUMAN) {
                card.flipFaceUp();
                card.active = false; // will become active on next turn
            } else {
                // Bot traps remain face-down and inactive
                card.flipFaceDown();
                card.active = false;
            }
        } else {
            card.flipFaceUp();
        }
        
        targetSpaces[spaceIndex].card = card;
        
        return { success: true };
    }

    /**
     * Sacrifice cards for a big monster
     * @param {Array} sacrificeCards - Cards to sacrifice
     * @param {Deck} deck - Game deck for discards
     * @returns {number} - Total value sacrificed
     */
    sacrificeCards(sacrificeCards, deck) {
        let totalValue = 0;
        
        for (const card of sacrificeCards) {
            // Check if card is in hand
            const handIndex = this.hand.findIndex(c => c.id === card.id);
            if (handIndex !== -1) {
                this.hand.splice(handIndex, 1);
                deck.discard(card);
                totalValue += getCardNumericValue(card.value);
                continue;
            }
            
            // Check if card is on field
            for (let i = 0; i < this.monsterSpaces.length; i++) {
                const space = this.monsterSpaces[i];
                if (space.card && space.card.id === card.id) {
                    const fieldCard = space.card;
                    space.card = null;
                    
                    // Handle fusion sacrifices
                    if (fieldCard.isFusion) {
                        totalValue += fieldCard.fusionStrength;
                        
                        // Discard fusion components
                        for (const component of fieldCard.fusionCards) {
                            deck.discard(component);
                        }
                    } else {
                        totalValue += getCardNumericValue(fieldCard.value);
                        deck.discard(fieldCard);
                    }
                    break;
                }
            }
        }
        
        return totalValue;
    }

    /**
     * Create a fusion from two monsters
     * @param {Card} monster1 - First monster
     * @param {Card} monster2 - Second monster
     * @param {number} targetSpaceIndex - Space for fusion
     * @returns {Object} - Fusion result
     */
    createFusion(monster1, monster2, targetSpaceIndex) {
        // Check if monsters are different strength
        const value1 = monster1.isFusion ? monster1.fusionStrength : getCardNumericValue(monster1.value);
        const value2 = monster2.isFusion ? monster2.fusionStrength : getCardNumericValue(monster2.value);
        
        if (value1 === value2) {
            return { success: false, message: 'Cannot fuse monsters of equal strength' };
        }
        
        // Determine where each monster currently resides (field or hand)
        let monster1SpaceIndex = -1;
        let monster2SpaceIndex = -1;
        let monster1InHandIndex = -1;
        let monster2InHandIndex = -1;

        for (let i = 0; i < this.monsterSpaces.length; i++) {
            const space = this.monsterSpaces[i];
            if (space.card) {
                if (space.card.id === monster1.id) monster1SpaceIndex = i;
                if (space.card.id === monster2.id) monster2SpaceIndex = i;
            }
        }

        for (let i = 0; i < this.hand.length; i++) {
            const h = this.hand[i];
            if (!h) continue;
            if (h.id === monster1.id) monster1InHandIndex = i;
            if (h.id === monster2.id) monster2InHandIndex = i;
        }

        // At least one of the two monsters must be on field (you must target a field monster to fuse with)
        if (monster1SpaceIndex === -1 && monster2SpaceIndex === -1) {
            return { success: false, message: 'At least one monster must be on the field to create a fusion' };
        }
        
        // Check if target space is valid (one of the monster spaces or an empty space)
        if (targetSpaceIndex < 0 || targetSpaceIndex >= this.monsterSpaces.length || 
            (this.monsterSpaces[targetSpaceIndex].card !== null && 
             targetSpaceIndex !== monster1SpaceIndex && 
             targetSpaceIndex !== monster2SpaceIndex)) {
            return { success: false, message: 'Invalid target space for fusion' };
        }
        
        // Create fusion
        const fusion = Card.createFusion(monster1, monster2);

        // Remove original monsters from field or hand
        if (monster1SpaceIndex !== -1) {
            this.monsterSpaces[monster1SpaceIndex].card = null;
        } else if (monster1InHandIndex !== -1) {
            // remove from hand
            this.hand.splice(monster1InHandIndex, 1);
        }

        if (monster2SpaceIndex !== -1) {
            this.monsterSpaces[monster2SpaceIndex].card = null;
        } else if (monster2InHandIndex !== -1) {
            // remove from hand
            // adjust index if monster1 was removed earlier and same side
            let idx = monster2InHandIndex;
            if (monster1InHandIndex !== -1 && monster1InHandIndex < monster2InHandIndex) idx -= 1;
            this.hand.splice(idx, 1);
        }

        // Place fusion
        this.monsterSpaces[targetSpaceIndex].card = fusion;
        
        return { success: true, fusion };
    }

    /**
     * Handle upkeep for fusions
     * @param {Array} sacrificeCards - Cards to sacrifice for upkeep
     * @param {Deck} deck - Game deck for discards
     * @returns {Object} - Upkeep results
     */
    handleFusionUpkeep(sacrificeCards, deck) {
        const fusionSpaces = this.monsterSpaces.filter(space => 
            space.card && space.card.isFusion
        );
        
        const results = {
            success: true,
            brokenFusions: []
        };
        
        // If player provided sacrifices, calculate total sacrificed value (allow hand or field non-fusion or fusion cards)
        let totalSacrificeValue = 0;
        for (const card of sacrificeCards) {
            if (!card) continue;

            // If it's a fusion on field, sacrifice its fusion strength
            if (card.isFusion) {
                // Find the fusion on field and remove it
                for (let i = 0; i < this.monsterSpaces.length; i++) {
                    const space = this.monsterSpaces[i];
                    if (space.card && space.card.id === card.id) {
                        totalSacrificeValue += space.card.fusionStrength || 0;
                        // discard fusion components
                        for (const comp of space.card.fusionCards) deck.discard(comp);
                        space.card = null;
                        break;
                    }
                }
                continue;
            }

            // Check hand first
            const handIndex = this.hand.findIndex(c => c.id === card.id);
            if (handIndex !== -1) {
                const hc = this.hand.splice(handIndex, 1)[0];
                totalSacrificeValue += getCardNumericValue(hc.value);
                deck.discard(hc);
                continue;
            }

            // Check field (non-fusion)
            for (let i = 0; i < this.monsterSpaces.length; i++) {
                const space = this.monsterSpaces[i];
                if (space.card && !space.card.isFusion && space.card.id === card.id) {
                    const fieldCard = space.card;
                    totalSacrificeValue += getCardNumericValue(fieldCard.value);
                    space.card = null;
                    deck.discard(fieldCard);
                    break;
                }
            }
        }

        // If the player didn't provide any sacrifices (skipped), break the fusions as per rulebook
        if (!sacrificeCards || sacrificeCards.length === 0) {
            // Break all fusions (replace each fusion with its high-value component and discard low-value)
            for (const space of fusionSpaces) {
                const fusion = space.card;
                if (!fusion) continue;
                const highValueCard = fusion.fusionCards[0];
                const lowValueCard = fusion.fusionCards[1];
                space.card = highValueCard;
                deck.discard(lowValueCard);
                results.brokenFusions.push({ fusion, remaining: highValueCard });
            }
            results.success = false;
            return results;
        }

        // If provided sacrifices but not enough in value to cover fusion count, break remaining fusions
        const fusionCount = fusionSpaces.length;
        // We treat each fusion upkeep as needing 1 unit; earlier logic used count of cards, but now we accept value-based sacrifices
        if (sacrificeCards.length < fusionCount) {
            results.success = false;
            const remainingFusions = fusionSpaces.slice(sacrificeCards.length);
            for (const space of remainingFusions) {
                const fusion = space.card;
                const highValueCard = fusion.fusionCards[0];
                const lowValueCard = fusion.fusionCards[1];
                space.card = highValueCard;
                deck.discard(lowValueCard);
                results.brokenFusions.push({ fusion, remaining: highValueCard });
            }
        }
        
        return results;
    }

    /**
     * Activate a trap card
     * @param {Card} trap - Trap to activate
     * @param {Deck} deck - Game deck for discards
     * @returns {Object} - Activation result
     */
    activateTrap(trap, deck) {
        // Find trap on field
        let trapIndex = -1;
        
        for (let i = 0; i < this.trapSpaces.length; i++) {
            if (this.trapSpaces[i].card && this.trapSpaces[i].card.id === trap.id) {
                trapIndex = i;
                break;
            }
        }
        
        if (trapIndex === -1) {
            return { success: false, message: 'Trap not found on field' };
        }
        
        // Check if trap is active
        if (!trap.active) {
            return { success: false, message: 'Trap not yet active' };
        }
        
        // Check if trap type already used this turn
        if (this.usedTrapTypes.has(trap.value)) {
            return { success: false, message: 'Already used a trap of this type this turn' };
        }
        
        // Activate trap
        this.trapSpaces[trapIndex].card = null;
        trap.flipFaceUp(); // Reveal trap
        
        // Mark trap type as used this turn
        this.usedTrapTypes.add(trap.value);
        
        // Discard trap
        deck.discard(trap);
        
        return { success: true, trapType: trap.value };
    }

    /**
     * Check if player has available monster space
     * @returns {boolean} - Whether space is available
     */
    hasAvailableMonsterSpace() {
        return this.monsterSpaces.some(space => space.card === null);
    }

    /**
     * Check if player has available trap space
     * @returns {boolean} - Whether space is available
     */
    hasAvailableTrapSpace() {
        return this.trapSpaces.some(space => space.card === null);
    }

    /**
     * Take damage
     * @param {number} amount - Amount of damage
     * @returns {number} - New health
     */
    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        // Notify global game instance (if present) to check for game over
        try {
            if (window && window.game && typeof window.game.checkForGameOver === 'function') {
                window.game.checkForGameOver();
            }
        } catch (e) {}

        return this.health;
    }

    /**
     * Discard down to hand limit
     * @param {Array} cardsToDiscard - Cards to discard
     * @param {Deck} deck - Game deck
     */
    discardDownToLimit(cardsToDiscard, deck) {
        for (const card of cardsToDiscard) {
            const index = this.hand.findIndex(c => c.id === card.id);
            if (index !== -1) {
                const discarded = this.hand.splice(index, 1)[0];
                deck.discard(discarded);
            }
        }
    }

    /**
     * Get all traps that can be activated now
     * @param {Object} context - Activation context (attack, trap, etc.)
     * @returns {Array} - Activatable traps
     */
    getActivatableTraps(context) {
        const activatable = [];
        for (const space of this.trapSpaces) {
            if (!space.card || !space.card.active) continue;

            const trapValue = space.card.value;

            // Skip if already used a trap of this type
            if (this.usedTrapTypes.has(trapValue)) continue;

            // Rules:
            // - Queen: only in response to another trap (context.type === 'trap') and cannot target Jokers
            // - King: only in response to an attack (context.type === 'attack' or 'battle-phase')
            // - Jack: only in response to an attack (context.type === 'attack' or 'battle-phase')
            // - Ace: can be used in response to either an attack or a trap, but not in response to another Ace
            if (context.type === 'trap') {
                // Context.trapValue should indicate which trap is being responded to
                if (trapValue === CARD_VALUES.QUEEN) {
                    if (context.trapValue && context.trapValue !== CARD_VALUES.JOKER) {
                        activatable.push(space.card);
                    }
                }
                if (trapValue === CARD_VALUES.ACE) {
                    // Ace may respond to a trap unless the triggering trap is an Ace
                    if (!context.trapValue || context.trapValue !== CARD_VALUES.ACE) activatable.push(space.card);
                }
            } else if (context.type === 'attack' || context.type === 'battle-phase') {
                // Attack-related: allow Jack and King and Ace (Ace can respond to attack)
                if (trapValue === CARD_VALUES.JACK || trapValue === CARD_VALUES.KING) {
                    activatable.push(space.card);
                }
                if (trapValue === CARD_VALUES.ACE) {
                    activatable.push(space.card);
                }
            }
        }
        
        return activatable;
    }

    /**
     * Reset for new turn
     */
    resetForNewTurn() {
        this.usedTrapTypes.clear();
        
        // Reset monster attack flags
        for (const space of this.monsterSpaces) {
            if (space.card) {
                space.card.resetForNewTurn();
            }
        }
        
        // Activate traps placed last turn
        for (const space of this.trapSpaces) {
            if (space.card && space.card.justPlaced) {
                space.card.justPlaced = false;
                space.card.active = true;
            }
        }
    }

    /**
     * Get count of non-empty monster spaces
     * @returns {number} - Count of monsters
     */
    getMonsterCount() {
        return this.monsterSpaces.filter(space => space.card !== null).length;
    }

    /**
     * Clone player state
     * @returns {Player} - Cloned player
     */
    clone() {
        const clone = new Player(this.type, this.name);
        clone.health = this.health;
        
        // Clone hand
        clone.hand = this.hand.map(card => card.clone());
        
        // Clone monster spaces
        clone.monsterSpaces = this.monsterSpaces.map(space => ({
            card: space.card ? space.card.clone() : null
        }));
        
        // Clone trap spaces
        clone.trapSpaces = this.trapSpaces.map(space => ({
            card: space.card ? space.card.clone() : null
        }));
        
        // Clone used trap types
        clone.usedTrapTypes = new Set([...this.usedTrapTypes]);
        
        return clone;
    }
}
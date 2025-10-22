/**
 * Bot player AI
 */
class Bot {
    /**
     * Create a bot player
     * @param {Game} game - Game instance
     * @param {string} difficulty - Game difficulty (easy, medium, hard)
     */
    constructor(game, difficulty = 'medium') {
        this.game = game;
        this.difficulty = difficulty || 'medium';

        // Deterministic bot state: no personalities, no emotions, no randomness
        this.gameMemory = {
            trapActivations: [],
            damageTaken: [],
            successfulAttacks: 0
        };

        // Card memory: counts of seen cards by value (only revealed/known cards)
        this.seenCountsByValue = this._initTotalCountsByValue(false); // start at 0
        this.totalCountsByValue = this._initTotalCountsByValue(true); // standard deck totals

        // Configurable action delays (in milliseconds) for player visibility (deterministic)
        this.actionDelays = {
            afterDraw: 800,          // Delay after drawing cards
            afterTrapPlacement: 800, // Delay after placing a trap
            afterSummon: 800,        // Delay after summoning a monster
            afterFusion: 800,        // Delay after creating a fusion (slightly longer)
            afterAttack: 800,        // Delay after each attack
            betweenActions: 800,     // General delay between different action types
            phaseTransition: 800     // Delay when transitioning phases
        };
    }

    /**
     * Initialize value->count map. If withTotals=true, fill with standard deck totals.
     */
    _initTotalCountsByValue(withTotals) {
        const map = {};
        const valueOrder = [
            CARD_VALUES.ACE,
            CARD_VALUES.TWO,
            CARD_VALUES.THREE,
            CARD_VALUES.FOUR,
            CARD_VALUES.FIVE,
            CARD_VALUES.SIX,
            CARD_VALUES.SEVEN,
            CARD_VALUES.EIGHT,
            CARD_VALUES.NINE,
            CARD_VALUES.TEN,
            CARD_VALUES.JACK,
            CARD_VALUES.QUEEN,
            CARD_VALUES.KING,
            CARD_VALUES.JOKER
        ];
        for (const v of valueOrder) {
            map[v] = withTotals ? (v === CARD_VALUES.JOKER ? 2 : 4) : 0;
        }
        return map;
    }

    /**
     * Update seenCountsByValue by scanning discard pile, both players' open information, and bot hand.
     * Traps face-down are not counted until revealed.
     */
    updateCardMemory() {
        // Reset seen counts
        this.seenCountsByValue = this._initTotalCountsByValue(false);

        const addCard = (card) => {
            if (!card || !card.value) return;
            if (!this.seenCountsByValue.hasOwnProperty(card.value)) return;
            this.seenCountsByValue[card.value] += 1;
        };

        // Discard pile
        if (this.game && this.game.deck && Array.isArray(this.game.deck.discardPile)) {
            for (const c of this.game.deck.discardPile) addCard(c);
        }

        // Bot's own hand and field are known
        if (this.game && this.game.bot) {
            for (const c of this.game.bot.hand) addCard(c);
            for (const space of this.game.bot.monsterSpaces) if (space.card) addCard(space.card);
        }

        // Player's visible monsters are known; traps are not unless revealed
        if (this.game && this.game.player) {
            for (const space of this.game.player.monsterSpaces) if (space.card) addCard(space.card);
        }
    }

    /**
     * Get remaining counts by value (total - seen)
     */
    getRemainingCountsByValue() {
        const rem = {};
        for (const v in this.totalCountsByValue) {
            const total = this.totalCountsByValue[v] || 0;
            const seen = this.seenCountsByValue[v] || 0;
            rem[v] = Math.max(0, total - seen);
        }
        return rem;
    }
    
    /**
     * Evaluate board advantage
     * @returns {number} - Board advantage (-10 to 10, positive = bot advantage)
     */
    evaluateBoardAdvantage() {
        let botAdvantage = 0;
        
        // Calculate monster strength advantage
        const botMonsters = this.game.bot.monsterSpaces
            .filter(space => space.card)
            .map(space => space.card.isFusion ? 
                space.card.fusionStrength : 
                getCardNumericValue(space.card.value));
        
        const playerMonsters = this.game.player.monsterSpaces
            .filter(space => space.card)
            .map(space => space.card.isFusion ? 
                space.card.fusionStrength : 
                getCardNumericValue(space.card.value));
        
        const botTotalStrength = botMonsters.reduce((sum, value) => sum + value, 0);
        const playerTotalStrength = playerMonsters.reduce((sum, value) => sum + value, 0);
        
        botAdvantage += botTotalStrength - playerTotalStrength;
        
        // Consider trap advantage
        const botTrapCount = this.game.bot.trapSpaces.filter(space => space.card).length;
        const playerTrapCount = this.game.player.trapSpaces.filter(space => space.card).length;
        
        botAdvantage += (botTrapCount - playerTrapCount) * 2;
        
        // Consider hand size advantage
        const handDiff = this.game.bot.hand.length - this.game.player.hand.length;
        botAdvantage += handDiff;
        
        // Normalize to -10 to 10 range
        return Math.max(-10, Math.min(10, botAdvantage));
    }
    
    // Deterministic AI: removed legacy makeDecision and learning methods
    
    /**
     * Record trap activation
     * @param {Card} trapCard - The trap card activated
     * @param {boolean} success - Whether the trap was successful
     */
    recordTrapActivation(trapCard, success) {
        if (!trapCard || !trapCard.value) return;
        
        this.gameMemory.trapActivations.push({
            turn: this.game.turnCounter,
            trapType: trapCard.value,
            success: success
        });
    }
    
    /**
     * Take a turn
     */
    async takeTurn() {
        // Deterministic: update card memory and log analysis at turn start
        this.updateCardMemory();
        if (this.game && this.game.ui && typeof this.game.ui.addBotThinkingMessage === 'function') {
            const rem = this.getRemainingCountsByValue();
            const playerTrapCount = this.game.player.trapSpaces.filter(s => s.card).length;
            const msg = `Start Turn Analysis: remaining Aces=${rem[CARD_VALUES.ACE]}, Queens=${rem[CARD_VALUES.QUEEN]}, Kings=${rem[CARD_VALUES.KING]}, Jacks=${rem[CARD_VALUES.JACK]}; player traps set=${playerTrapCount}.`;
            this.game.ui.addBotThinkingMessage(msg);
        }

        if (this.game && this.game.gameOver) return;

        console.debug('Bot.takeTurn: starting draw phase');
        await this.handleDrawPhase();
        if (this.game && this.game.gameOver) return;
        
        await delay(this.actionDelays.phaseTransition);

    console.debug('Bot.takeTurn: starting setup phase');
        this.game.ui.addLogMessage(`${this.game.bot.name} ended Draw phase`);
        await this.handleSetupPhase();
        if (this.game && this.game.gameOver) return;
        
        await delay(this.actionDelays.phaseTransition);

    console.debug('Bot.takeTurn: starting battle phase');
        this.game.ui.addLogMessage(`${this.game.bot.name} ended Setup phase`);
        await this.handleBattlePhase();
        if (this.game && this.game.gameOver) return;

        await delay(this.actionDelays.phaseTransition);

        console.debug('Bot.takeTurn: starting end phase');
        this.game.ui.addLogMessage(`${this.game.bot.name} ended Battle phase`);
        await this.handleEndPhase();

        // Activate just-placed traps for bot at end of its End phase
        if (this.game && typeof this.game.activateJustPlacedTraps === 'function') {
            this.game.activateJustPlacedTraps(this.game.bot);
        }

        // End bot's turn
        this.game.ui.addLogMessage(`${this.game.bot.name} ended their turn`);
        this.game.endTurn();
    }

    /**
     * Handle bot's draw phase
     */
    async handleDrawPhase() {
        // Drawing is handled by the main game's handleDrawPhase method
        // This method only handles bot-specific logic after drawing
        
        // Update UI
        this.game.ui.updateGameState();
        
        // Delay for visualization
        await delay(this.actionDelays.afterDraw);
    }

    /**
     * Evaluate the overall strategic goal for this turn's setup phase
     * Determines the optimal sequencing of placements to maximize attack potential
     * @returns {Object} - Strategy object with strategic priorities and plans
     */
    evaluateSetupStrategy() {
        // Get player's monster strengths
        const playerMonsters = this.game.player.monsterSpaces
            .filter(space => space.card)
            .map(space => ({
                strength: space.card.isFusion ? space.card.fusionStrength : getCardNumericValue(space.card.value),
                card: space.card
            }))
            .sort((a, b) => b.strength - a.strength);
        
        const playerStrongest = playerMonsters.length > 0 ? playerMonsters[0].strength : 0;
        
        // Get bot's current field strength
        const botFieldMonsters = this.game.bot.monsterSpaces
            .filter(space => space.card && !space.card.isFusion)
            .map(space => getCardNumericValue(space.card.value));
        
        const botStrongest = botFieldMonsters.length > 0 ? Math.max(...botFieldMonsters) : 0;
        
        // Categorize hand by type
        const handMonsters = this.game.bot.hand.filter(card => {
            const type = getCardType(card.value);
            return type === CARD_TYPES.MONSTER_NORMAL || type === CARD_TYPES.MONSTER_BIG;
        });
        
        const handTraps = this.game.bot.hand.filter(card => 
            getCardType(card.value) === CARD_TYPES.TRAP
        );
        
        const handBigMonsters = handMonsters.filter(card => 
            getCardType(card.value) === CARD_TYPES.MONSTER_BIG
        );
        
        const handNormalMonsters = handMonsters.filter(card => 
            getCardType(card.value) === CARD_TYPES.MONSTER_NORMAL
        );
        
        // Evaluate if we need fusions to compete
        const isAtDisadvantage = playerMonsters.length > 0 && botStrongest < playerStrongest;
        
        // Check potential fusions
        const potentialFusions = this.game.board.getPotentialFusions(this.game.bot);
        const bestFusionStrength = potentialFusions.length > 0 
            ? Math.max(...potentialFusions.map(f => f.fusionStrength))
            : 0;
        
        // Determine strategic goal
        let strategyGoal = 'maintain';
        let priorityScore = {
            traps: 5,
            fusions: 5,
            bigMonsters: 5,
            normalMonsters: 5
        };
        
        if (isAtDisadvantage) {
            strategyGoal = 'aggressive';
            // Prioritize fusions and big monsters to overcome disadvantage
            priorityScore.fusions = 10;
            priorityScore.bigMonsters = 8;
            priorityScore.normalMonsters = 3;
            priorityScore.traps = 5;
            
            if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                this.game.ui.addBotThinkingMessage(`Setup strategy: AGGRESSIVE - at disadvantage (bot ${botStrongest} vs player ${playerStrongest}). Plan fusions/big monsters.`);
            }
        } else if (botStrongest > playerStrongest) {
            strategyGoal = 'dominant';
            // Already ahead: focus on defending and securing advantage
            priorityScore.traps = 8;
            priorityScore.fusions = 6;
            priorityScore.bigMonsters = 3;
            priorityScore.normalMonsters = 7; // Fill board to maximize attacks
            
            if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                this.game.ui.addBotThinkingMessage(`Setup strategy: DOMINANT - bot ahead (${botStrongest} vs player ${playerStrongest}). Maximize attacks.`);
            }
        } else {
            // Balanced situation
            priorityScore.traps = 5;
            priorityScore.fusions = 6;
            priorityScore.bigMonsters = 6;
            priorityScore.normalMonsters = 5;
            
            if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                this.game.ui.addBotThinkingMessage(`Setup strategy: BALANCED - position (bot ${botStrongest} vs player ${playerStrongest}). Mix fusions and summons.`);
            }
        }
        
        return {
            strategyGoal,
            priorityScore,
            isAtDisadvantage,
            playerStrongest,
            botStrongest,
            bestFusionStrength,
            potentialFusions,
            handBigMonsters,
            handNormalMonsters,
            handTraps,
            emptyMonsterSpaces: this.game.bot.monsterSpaces.filter(s => !s.card).length,
            emptyTrapSpaces: this.game.bot.trapSpaces.filter(s => !s.card).length
        };
    }

    /**
     * Handle bot's setup phase with strategic planning
     */
    async handleSetupPhase() {
        // Check for Joker first
        const joker = this.game.bot.hand.find(
            card => card.value === CARD_VALUES.JOKER
        );
        
        if (joker && this.shouldPlayJoker()) {
            this.game.ui.addLogMessage('Bot activates Joker!');
            this.game.playJoker(joker, true);
            this.game.ui.updateGameState();
            // After Joker resets the board and hands, the bot should continue its setup
            // with the newly dealt cards during the same Setup phase. Add a short delay
            // to simulate thinking and then proceed with normal setup actions.
            await delay(this.actionDelays.betweenActions);
        }
        
        // STRATEGIC PLANNING: Evaluate the turn's goals before placing anything
        const strategy = this.evaluateSetupStrategy();
        
        // Place traps first (strategic advantage) - always do this early for defense
        await this.placeTraps();
        if (this.game.bot.trapSpaces.some(space => space.card && space.card.justPlaced)) {
            await delay(this.actionDelays.betweenActions);
        }
        
        // AGGRESSIVE STRATEGY: If at disadvantage, prioritize creating fusions to overcome it
        // Create fusions BEFORE summoning big monsters to ensure we have the components
        if (strategy.isAtDisadvantage && strategy.potentialFusions.length > 0) {
            // Create fusions first when we need them strategically
            await this.createFusions();
            if (this.game.bot.monsterSpaces.some(space => space.card && space.card.isFusion)) {
                await delay(this.actionDelays.betweenActions);
            }
            
            // Then summon big monsters with remaining hand/field cards
            await this.summonBigMonsters();
            await delay(this.actionDelays.betweenActions);
            
            // Fill remaining spaces with normal monsters
            await this.summonNormalMonsters();
        } else {
            // BALANCED/DOMINANT STRATEGY: Summon big monsters first, then fuse if beneficial
            // This preserves flexibility in which components to use
            
            // Summon big monsters if we have them
            if (strategy.handBigMonsters.length > 0 && strategy.emptyMonsterSpaces > 0) {
                await this.summonBigMonsters();
                await delay(this.actionDelays.betweenActions);
            }
            
            // Create fusions if we still have beneficial opportunities
            await this.createFusions();
            if (this.game.bot.monsterSpaces.some(space => space.card && space.card.isFusion)) {
                await delay(this.actionDelays.betweenActions);
            }
            
            // Fill remaining spaces with normal monsters
            await this.summonNormalMonsters();
        }
        
        this.game.ui.updateGameState();
    }

    /**
     * Handle bot's battle phase
     */
    async handleBattlePhase() {
        // Skip battle phase if bot played a Joker this turn
        if (this.game.bot.skipBattleThisTurn) {
            this.game.ui.addLogMessage(`Bot's Battle phase is skipped due to Joker`);
            this.game.bot.skipBattleThisTurn = false; // Clear the flag
            return;
        }
        
        // Skip if this bot is not allowed to attack at this turn (first-player rule)
        if (!this.game.isAttackAllowedThisTurn(this.game.bot)) {
            this.game.ui.addLogMessage('Bot cannot attack on first turn');
            return;
        }
        
        // Check if player has Ace trap that might be activated
        const playerHasAceTrap = this.playerHasActiveTrapType(CARD_VALUES.ACE);
        
        // Get bot's monsters that can attack
        const attackingMonsters = this.getBotAttackingMonsters();
        
        // No monsters to attack with
        if (attackingMonsters.length === 0) {
            this.game.ui.addLogMessage('Bot has no monsters that can attack');
            return;
        }
        
        // Get valid targets
        let targets = this.game.board.getValidAttackTargets(
            this.game.bot,
            this.game.player
        );
        
        // No valid targets
        if (targets.length === 0) {
            this.game.ui.addLogMessage('Bot has no valid attack targets');
            return;
        }
        
        // Check if bot has complete advantage (all bot monsters stronger than all player monsters)
        let hasCompleteAdvantage = false;
        const isDirectAttackOnly = targets.length > 0 && targets[0] === null;
        
        if (!isDirectAttackOnly && targets.length > 0) {
            // Get player's monster strengths
            const playerMonsters = this.game.player.monsterSpaces
                .filter(space => space.card)
                .map(space => space.card.isFusion ? space.card.fusionStrength : getCardNumericValue(space.card.value));
            
            // Get bot's attacking monster strengths
            const botStrengths = attackingMonsters.map(card => 
                card.isFusion ? card.fusionStrength : getCardNumericValue(card.value)
            );
            
            // Bot has complete advantage if its weakest monster is stronger than player's strongest
            if (playerMonsters.length > 0 && botStrengths.length > 0) {
                const botWeakest = Math.min(...botStrengths);
                const playerStrongest = Math.max(...playerMonsters);
                hasCompleteAdvantage = botWeakest > playerStrongest;
            }
        }
        
        // Deterministic: attack strongest first unless no advantage
        attackingMonsters.sort((a, b) => {
            const strengthA = a.isFusion ? a.fusionStrength : getCardNumericValue(a.value);
            const strengthB = b.isFusion ? b.fusionStrength : getCardNumericValue(b.value);
            return strengthB - strengthA; // Descending (strongest first)
        });
        
        // Decide how many monsters to attack with based on personality and emotions
        const attackCount = attackingMonsters.length;
        
        // Add a random delay that simulates "thinking" time based on complexity
    await delay(300);
        
        // Execute attacks with the decided number of monsters
        for (let i = 0; i < attackCount; i++) {
            if (i >= attackingMonsters.length) break;
            const monster = attackingMonsters[i];
            
            // Find monster's index
            let monsterIndex = -1;
            for (let j = 0; j < this.game.bot.monsterSpaces.length; j++) {
                if (this.game.bot.monsterSpaces[j].card === monster) {
                    monsterIndex = j;
                    break;
                }
            }
            
            if (monsterIndex === -1) continue;
            
            // Deterministic assessment for direct Ace risk
            if (targets[0] === null && playerHasAceTrap) {
                // Use memory: if any Aces remain and player has a set trap, note the risk
                const rem = this.getRemainingCountsByValue();
                const aceRemaining = rem[CARD_VALUES.ACE] || 0;
                if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                    this.game.ui.addBotThinkingMessage(`Direct attack available; Ace risk detected (remaining Aces=${aceRemaining}). Proceeding: no alternative targets.`);
                }
            }
            
            // For monster targets, find optimal target with human-like decision making
            let targetIndex = null;
            
            if (targets[0] !== null) {
                // Get potential targets with human-like consideration
                targetIndex = this.findHumanLikeAttackTarget(monster, targets);
                
                // Debug logging for attack decision
                const monsterStrength = monster.isFusion ? monster.fusionStrength : getCardNumericValue(monster.value);
                console.log(`Bot considering attack with ${monster.value} (strength ${monsterStrength}), target index: ${targetIndex}`);
                
                // If no favorable monster target was found AND there are valid monster targets available,
                // this is a bug - the bot should attack SOMETHING if it can win
                if (targetIndex === null) {
                    // Check if bot can beat ANY of the available targets
                    let canBeatAnyTarget = false;
                    for (const possibleTarget of targets) {
                        if (possibleTarget !== null) {
                            const targetCard = this.game.player.monsterSpaces[possibleTarget]?.card;
                            if (targetCard) {
                                const targetStrength = targetCard.isFusion ? targetCard.fusionStrength : getCardNumericValue(targetCard.value);
                                if (monsterStrength > targetStrength) {
                                    canBeatAnyTarget = true;
                                    // Choose this target as a fallback
                                    targetIndex = possibleTarget;
                                    console.log(`Bot fallback: attacking target ${targetIndex} (strength ${targetStrength})`);
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (!canBeatAnyTarget) {
                        this.game.ui.addLogMessage(`Bot skips attacking with ${monster.value} — no favorable target`);
                        continue;
                    }
                }

                // Additional check to prevent attacks that would be disadvantageous
                if (targetIndex !== null) {
                    const attackingStrength = monster.isFusion ? 
                        monster.fusionStrength : 
                        getCardNumericValue(monster.value);
                    
                    const targetSpace = this.game.player.monsterSpaces[targetIndex];
                    if (targetSpace && targetSpace.card) {
                        const targetStrength = targetSpace.card.isFusion ? 
                            targetSpace.card.fusionStrength : 
                            getCardNumericValue(targetSpace.card.value);
                        
                        // AGGRESSIVE STRATEGY: Allow equal-strength and moderately unfavorable attacks
                        // Only skip if we're significantly outmatched (large margin)
                        const margin = targetStrength - attackingStrength;
                        
                        // Skip only if target is significantly stronger (more than 3 points stronger)
                        if (margin > 3) {
                            this.game.ui.addLogMessage(`Bot skips attacking with ${monster.value} — target too strong (${targetStrength} vs ${attackingStrength})`);
                            continue;
                        }
                        
                        // Equal strength or slightly worse is OK - mutual destruction or acceptable loss
                        if (margin >= 0) {
                            if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                                this.game.ui.addBotThinkingMessage(`Attacking equal/slightly weaker: ${attackingStrength} vs ${targetStrength}`);
                            }
                        }
                    }
                }
            } else {
                // Direct attack
                targetIndex = null;
            }
            
            // "Think" before attacking - variable delay based on difficulty
            await delay(300);
            
            // Log thinking for chosen attack
            if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                const as = monster.isFusion ? monster.fusionStrength : getCardNumericValue(monster.value);
                if (targetIndex === null) {
                    this.game.ui.addBotThinkingMessage(`Attacking directly with ${monster.value} (strength ${as})`);
                } else {
                    const tsCard = this.game.player.monsterSpaces[targetIndex]?.card;
                    const ts = tsCard ? (tsCard.isFusion ? tsCard.fusionStrength : getCardNumericValue(tsCard.value)) : '?';
                    this.game.ui.addBotThinkingMessage(`Attacking player's monster at ${targetIndex} with ${monster.value} (${as} vs ${ts})`);
                }
            }

            // Execute attack (logging will be handled by processAttack)
            const attackRes = await this.game.processAttack(monsterIndex, targetIndex, true);
            
            // Track successful attacks
            if (attackRes && !attackRes.trapActivated) {
                this.gameMemory.successfulAttacks++;
            }
            
            // Record trap activation for learning
            if (attackRes && attackRes.trapActivated && attackRes.trapResult) {
                const trapCard = attackRes.trapResult.trapCard;
                const success = attackRes.trapResult.result && attackRes.trapResult.result.success;
                this.recordTrapActivation(trapCard, success);
            }

            // If a trap was activated and it returned an effect that ends the battle phase, stop attacking
            if (attackRes && attackRes.trapActivated && attackRes.trapResult && attackRes.trapResult.result) {
                const tr = attackRes.trapResult.result;
                // For ACE, check if the battle phase was ended by the trap
                if (tr.type === 'ACE' && this.game.battlePhaseEnded) {
                    break;
                }
            }
            
            // Also check for battle phase ended flag in case Ace was activated
            if (this.game.battlePhaseEnded) {
                break;
            }
            
            // Update targets (may have changed due to destruction)
            const newTargets = this.game.board.getValidAttackTargets(
                this.game.bot,
                this.game.player
            );
            
            if (newTargets.length === 0) break;
            
            // Update the targets variable for the next iteration
            targets = newTargets;
            
            // Consistent delay between attacks for player visibility
            await delay(this.actionDelays.afterAttack);
            
            // Deterministic: continue attacking as long as there are favorable targets
        }
        
        // If battle phase was ended by Ace trap, transition to end phase
        if (this.game.battlePhaseEnded) {
            this.game.currentPhase = PHASES.END;
            this.game.ui.updateTurnAndPhase();
        }
        
        // Ensure attacked flags are reset visually at the end of bot's battle phase
        if (this.game && typeof this.game.resetAttackedFlags === 'function') {
            this.game.resetAttackedFlags();
            if (this.game.ui && typeof this.game.ui.updateGameState === 'function') this.game.ui.updateGameState();
        }
    }

    /**
     * Handle bot's end phase
     */
    async handleEndPhase() {
        // Handle fusion upkeep
        const fusionCount = this.game.board.countActiveFusions(this.game.bot);
        
        if (fusionCount > 0) {
            const sacrificeCards = this.selectCardsForFusionUpkeep(fusionCount);
            this.game.handleFusionUpkeep(sacrificeCards, true);
            this.game.ui.addLogMessage(`Bot pays fusion upkeep for ${fusionCount} fusions`);
        }
        
        // Update UI
        this.game.ui.updateGameState();
        
        // Delay for visualization
        await delay(1000);
    }

    /**
     * Place traps during setup phase with strategic decision making
     */
    async placeTraps() {
        // Find trap cards in hand
        const trapCards = this.game.bot.hand.filter(
            card => getCardType(card.value) === CARD_TYPES.TRAP
        );

        if (trapCards.length === 0) return;

        // Find empty trap spaces
        const emptyTrapSpaces = this.game.bot.trapSpaces
            .map((space, index) => space.card === null ? index : -1)
            .filter(index => index !== -1);

        if (emptyTrapSpaces.length === 0) return;

        // Evaluate threat level to determine trap placement strategy
        const playerMonsters = this.game.player.monsterSpaces
            .filter(space => space.card)
            .map(space => ({
                strength: space.card.isFusion ? space.card.fusionStrength : getCardNumericValue(space.card.value),
                card: space.card
            }));
        
        const botMonsters = this.game.bot.monsterSpaces
            .filter(space => space.card && !space.card.isFusion)
            .map(space => getCardNumericValue(space.card.value));
        
        const playerStrongest = playerMonsters.length > 0 ? Math.max(...playerMonsters.map(m => m.strength)) : 0;
        const botStrongest = botMonsters.length > 0 ? Math.max(...botMonsters) : 0;
        const isAtDisadvantage = playerMonsters.length > 0 && botStrongest < playerStrongest;
        
        // Prioritization based on threat level
        // DEFENSIVE PRIORITY: If player is threatening, prioritize ACE (stops direct attacks)
        // STANDARD PRIORITY: ACE > QUEEN > KING > JACK
        const priority = (v) => {
            // If at severe disadvantage and player has many monsters, prioritize defensive traps
            if (isAtDisadvantage && playerMonsters.length > 1) {
                // ACE is most valuable (stops direct attacks)
                if (v === CARD_VALUES.ACE) return 0;
                // QUEEN and KING redirect attacks (more defensive)
                if (v === CARD_VALUES.QUEEN) return 1;
                if (v === CARD_VALUES.KING) return 2;
                // JACK is less defensive
                if (v === CARD_VALUES.JACK) return 3;
            } else {
                // Standard priority: all attack-enabling traps
                if (v === CARD_VALUES.ACE) return 0;
                if (v === CARD_VALUES.QUEEN) return 1;
                if (v === CARD_VALUES.KING) return 2;
                if (v === CARD_VALUES.JACK) return 3;
            }
            return 4;
        };

        const trapsToPlay = [...trapCards].sort((a, b) => priority(a.value) - priority(b.value));

        // Determine how many traps to place
        let trapsToPlaceCount = Math.min(trapsToPlay.length, emptyTrapSpaces.length);
        
        // Strategic decision: Always place at least some defensive traps
        if (isAtDisadvantage && trapsToPlaceCount > 0) {
            // Ensure we place defensive traps
            if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                this.game.ui.addBotThinkingMessage(`At disadvantage - prioritizing defensive trap placement (${trapsToPlaceCount} traps).`);
            }
        }
        
        // Place traps with priority ordering
        for (let i = 0; i < trapsToPlaceCount; i++) {
            if (emptyTrapSpaces.length === 0) break;
            const trapCard = trapsToPlay[i];
            const spaceIndex = emptyTrapSpaces.shift();

            if (this.game && this.game.ui && typeof this.game.ui.addBotThinkingMessage === 'function') {
                this.game.ui.addBotThinkingMessage(`Placing trap ${trapCard.value} (priority: ${priority(trapCard.value)}) in space ${spaceIndex}`);
            }

            await this.game.playTrapCard(trapCard, spaceIndex, true);
            this.game.ui.updateGameState();
            await delay(this.actionDelays.afterTrapPlacement);
        }
    }

    /**
     * Create fusions with human-like decision making
     */
    async createFusions() {
        // Get potential fusions
        const fusions = this.game.board.getPotentialFusions(this.game.bot);
        
        if (fusions.length === 0) return;
        
    // Deterministic short pause for visibility
    await delay(400);
        
        // Get player's monster strengths for strategic evaluation
        const playerMonsters = this.game.player.monsterSpaces
            .filter(space => space.card)
            .map(space => ({
                strength: space.card.isFusion ? space.card.fusionStrength : getCardNumericValue(space.card.value),
                card: space.card
            }))
            .sort((a, b) => b.strength - a.strength); // Sort descending
        
        // Get bot's current monster strengths
        const botMonsters = this.game.bot.monsterSpaces
            .filter(space => space.card && !space.card.isFusion) // Only non-fusion monsters (fusion candidates)
            .map(space => getCardNumericValue(space.card.value));
        
        // STRATEGIC ANALYSIS: Can any current bot monsters beat player's monsters?
        const botStrongestUnfused = botMonsters.length > 0 ? Math.max(...botMonsters) : 0;
        const playerStrongest = playerMonsters.length > 0 ? playerMonsters[0].strength : 0;
        const playerWeakest = playerMonsters.length > 0 ? playerMonsters[playerMonsters.length - 1].strength : 0;
        
        // Check if bot is at a disadvantage (can't beat player's strongest)
        const isAtDisadvantage = playerMonsters.length > 0 && botStrongestUnfused <= playerStrongest;
        
        // Log strategic analysis
        if (playerMonsters.length > 0) {
            console.log(`Bot fusion analysis: Player strongest=${playerStrongest}, Bot strongest unfused=${botStrongestUnfused}, At disadvantage=${isAtDisadvantage}`);
            console.log(`Available fusions: ${fusions.length} options`);
        }
        
        // Evaluate each fusion option strategically
        const fusionOptions = fusions.map(fusion => {
            const m1Strength = getCardNumericValue(fusion.monster1.card.value);
            const m2Strength = getCardNumericValue(fusion.monster2.card.value);
            const componentTotal = m1Strength + m2Strength;
            const efficiency = fusion.fusionStrength / componentTotal;
            
            // STRATEGIC VALUE: How many player monsters can this fusion beat?
            let canBeat = 0;
            let beatsStrongest = false;
            let targetsDefeated = [];
            
            for (const pm of playerMonsters) {
                if (fusion.fusionStrength > pm.strength) {
                    canBeat++;
                    targetsDefeated.push(pm.strength);
                    if (pm === playerMonsters[0]) {
                        beatsStrongest = true;
                    }
                }
            }
            
            // Calculate strategic value
            // High priority: Can beat monsters that bot currently can't
            let strategicValue = 0;
            
            if (playerMonsters.length > 0) {
                // Prioritize fusions that can beat the strongest player monster
                if (beatsStrongest) {
                    strategicValue += 10;
                }
                
                // Value based on how many monsters it can beat
                strategicValue += canBeat * 3;
                
                // If at disadvantage, prioritize ANY fusion that beats something
                if (isAtDisadvantage && canBeat > 0) {
                    strategicValue += 5;
                }
                
                // Bonus for beating monsters we currently can't beat
                for (const defeated of targetsDefeated) {
                    if (defeated > botStrongestUnfused) {
                        strategicValue += 4; // Big bonus for overcoming disadvantage
                    }
                }
            }
            
            return {
                fusion: fusion,
                efficiency: efficiency,
                componentTotal: componentTotal,
                strategicValue: strategicValue,
                canBeat: canBeat,
                beatsStrongest: beatsStrongest,
                fusionStrength: fusion.fusionStrength
            };
        });
        
        // Sort by fusion strength (descending) as the initial strategy
        fusions.sort((a, b) => b.fusionStrength - a.fusionStrength);
        
        // Deterministic: decide to create a fusion if it improves matchups or increases field power usefully
        const anyStrategic = fusionOptions.some(f => f.strategicValue > 0);
        if (!anyStrategic && !isAtDisadvantage) {
            // No tactical benefit and not at disadvantage — skip fusing to preserve resources
            if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                this.game.ui.addBotThinkingMessage('Skipping fusion: no strategic benefit detected.');
            }
            return;
        }
        
        // Evaluate board state for fusion strategy
        const boardAdvantage = this.evaluateBoardAdvantage();
        
        // Determine fusion approach - STRATEGIC PRIORITY
        let selectedFusion = fusions[0]; // Default to strongest
        
        // STRATEGIC SELECTION: Prioritize fusions that solve tactical problems
        if (playerMonsters.length > 0) {
            // Sort by strategic value first
            fusionOptions.sort((a, b) => {
                // If one has strategic value and other doesn't, prioritize strategic
                if (a.strategicValue > 0 && b.strategicValue === 0) return -1;
                if (b.strategicValue > 0 && a.strategicValue === 0) return 1;
                
                // Both have strategic value: compare
                if (a.strategicValue !== b.strategicValue) {
                    return b.strategicValue - a.strategicValue;
                }
                
                // Tie-breaker: fusion strength
                return b.fusionStrength - a.fusionStrength;
            });
            
            // Use the most strategic fusion
            selectedFusion = fusionOptions[0].fusion;
            
            console.log(`Bot fusion decision: Selected fusion with strength ${fusionOptions[0].fusionStrength}, strategic value ${fusionOptions[0].strategicValue}, can beat ${fusionOptions[0].canBeat} monsters`);
        } else {
            // No player monsters: use old efficiency logic
            // Different strategies based on personality and game state
            // Deterministic: prefer highest fusionStrength; tie-breaker by efficiency
            fusionOptions.sort((a, b) => {
                if (b.fusionStrength !== a.fusionStrength) return b.fusionStrength - a.fusionStrength;
                return b.efficiency - a.efficiency;
            });
            selectedFusion = fusionOptions[0].fusion;
        }
        
        // Find empty monster space or use one of the fusion components' spaces
        let targetSpace = -1;
        
        // Check for empty spaces first
        for (let i = 0; i < this.game.bot.monsterSpaces.length; i++) {
            if (this.game.bot.monsterSpaces[i].card === null) {
                targetSpace = i;
                break;
            }
        }
        
        // If no empty space, use one of the fusion components' spaces
        if (targetSpace === -1) {
            targetSpace = selectedFusion.monster1.index;
        }
        
        // Log selection rationale
        if (this.game.ui && this.game.ui.addBotThinkingMessage) {
            const chosen = fusionOptions.find(o => o.fusion === selectedFusion);
            if (chosen) {
                this.game.ui.addBotThinkingMessage(`Selecting fusion (strength ${chosen.fusionStrength}) beating ${chosen.canBeat} player monster(s); strategicValue=${chosen.strategicValue}`);
            } else {
                this.game.ui.addBotThinkingMessage('Selecting strongest available fusion.');
            }
        }

        // Create fusion
        this.game.createFusion(
            selectedFusion.monster1.card,
            selectedFusion.monster2.card,
            targetSpace,
            true
        );
        
        this.game.ui.addLogMessage('Bot creates a fusion monster');
        this.game.ui.updateGameState();
        
        if (this.game.ui && this.game.ui.addBotThinkingMessage) {
            this.game.ui.addBotThinkingMessage('Created fusion to improve matchups.');
        }
        await delay(this.actionDelays.afterFusion);
        
        // Consider additional fusions - STRATEGIC EVALUATION
        // If at disadvantage or multiple player monsters exist, try to create more fusions
        const shouldTryMultipleFusions = (
            isAtDisadvantage && playerMonsters.length > 1
        );
        
        if (shouldTryMultipleFusions) {
            // Get updated fusion possibilities after the first fusion
            const updatedFusions = this.game.board.getPotentialFusions(this.game.bot);
            if (updatedFusions.length > 0) {
                // Re-evaluate remaining player monsters
                const remainingPlayerMonsters = this.game.player.monsterSpaces
                    .filter(space => space.card)
                    .map(space => ({
                        strength: space.card.isFusion ? space.card.fusionStrength : getCardNumericValue(space.card.value)
                    }))
                    .sort((a, b) => b.strength - a.strength);
                
                // Evaluate which fusion would be best for the remaining threats
                const updatedOptions = updatedFusions.map(fusion => {
                    let canBeat = 0;
                    for (const pm of remainingPlayerMonsters) {
                        if (fusion.fusionStrength > pm.strength) {
                            canBeat++;
                        }
                    }
                    return {
                        fusion: fusion,
                        canBeat: canBeat,
                        fusionStrength: fusion.fusionStrength
                    };
                });
                
                // Sort by strategic value
                updatedOptions.sort((a, b) => {
                    if (a.canBeat !== b.canBeat) return b.canBeat - a.canBeat;
                    return b.fusionStrength - a.fusionStrength;
                });
                
                // Find space for another fusion
                targetSpace = -1;
                for (let i = 0; i < this.game.bot.monsterSpaces.length; i++) {
                    if (this.game.bot.monsterSpaces[i].card === null) {
                        targetSpace = i;
                        break;
                    }
                }
                
                // Only create second fusion if it adds strategic value and we have space
                const secondFusionAddsValue = updatedOptions[0].canBeat > 0;
                if (targetSpace !== -1 && secondFusionAddsValue) {
                    await delay(this.actionDelays.betweenActions); // Think time for second fusion
                    
                    // Create another fusion
                    this.game.createFusion(
                        updatedOptions[0].fusion.monster1.card,
                        updatedOptions[0].fusion.monster2.card,
                        targetSpace,
                        true
                    );
                    
                    this.game.ui.addLogMessage('Bot creates another fusion monster');
                    this.game.ui.updateGameState();
                    
                    console.log(`Bot created second fusion with strength ${updatedOptions[0].fusionStrength}, can beat ${updatedOptions[0].canBeat} remaining monsters`);
                }
            }
        }
    }

    /**
     * Evaluate if the bot will have winning attack targets after a given summoning plan
     * @param {Array} plannedSummons - Array of {card, sacrifices} describing what will be summoned
     * @returns {Object} - {canBeatTargets: boolean, maxAttackStrength: number, targetStrength: number}
     */
    evaluatePostSummonAttackPotential(plannedSummons) {
        // Simulate the field after summoning
        const simulatedField = [];
        
        // Add existing field monsters (excluding those that will be sacrificed)
        const sacrificedIds = new Set();
        for (const plan of plannedSummons) {
            if (plan.sacrifices) {
                for (const sac of plan.sacrifices) {
                    sacrificedIds.add(sac.id);
                }
            }
        }
        
        for (const space of this.game.bot.monsterSpaces) {
            if (space.card && !space.card.isFusion && !sacrificedIds.has(space.card.id)) {
                simulatedField.push({
                    value: space.card.value,
                    strength: getCardNumericValue(space.card.value),
                    isFusion: false
                });
            }
        }
        
        // Add planned summons
        for (const plan of plannedSummons) {
            simulatedField.push({
                value: plan.card.value,
                strength: getCardNumericValue(plan.card.value),
                isFusion: false
            });
        }
        
        // Check potential fusions from the simulated field
        const fusionCombos = [];
        for (let i = 0; i < simulatedField.length; i++) {
            for (let j = i + 1; j < simulatedField.length; j++) {
                const m1 = simulatedField[i];
                const m2 = simulatedField[j];
                if (m1.strength !== m2.strength) {
                    fusionCombos.push({
                        strength: m1.strength + m2.strength,
                        components: [m1, m2]
                    });
                }
            }
        }
        
        // Get the strongest potential outcome (either unfused monsters or best fusion)
        let maxStrength = 0;
        if (simulatedField.length > 0) {
            maxStrength = Math.max(...simulatedField.map(m => m.strength));
        }
        if (fusionCombos.length > 0) {
            const bestFusion = Math.max(...fusionCombos.map(f => f.strength));
            maxStrength = Math.max(maxStrength, bestFusion);
        }
        
        // Get player's strongest target
        const playerMonsters = this.game.player.monsterSpaces
            .filter(space => space.card)
            .map(space => ({
                strength: space.card.isFusion ? space.card.fusionStrength : getCardNumericValue(space.card.value)
            }));
        
        const targetStrength = playerMonsters.length > 0 ? Math.max(...playerMonsters.map(m => m.strength)) : 0;
        
        return {
            canBeatTargets: maxStrength > targetStrength,
            maxAttackStrength: maxStrength,
            targetStrength: targetStrength,
            fusionOptions: fusionCombos
        };
    }

    /**
     * Summon big monsters if possible
     */
    async summonBigMonsters() {
        // Find big monsters in hand
        const bigMonsters = this.game.bot.hand.filter(
            card => getCardType(card.value) === CARD_TYPES.MONSTER_BIG
        );
        
        if (bigMonsters.length === 0) return;
        
        console.log(`Bot: Found ${bigMonsters.length} big monster(s) in hand:`, bigMonsters.map(m => m.value));
        
        // Sort by value (descending) - strongest first
        bigMonsters.sort((a, b) => 
            getCardNumericValue(b.value) - getCardNumericValue(a.value)
        );
        
        // Get current field state for strategic evaluation
        const currentFieldMonsters = this.game.bot.monsterSpaces
            .filter(space => space.card && !space.card.isFusion)
            .map(space => ({
                card: space.card,
                strength: getCardNumericValue(space.card.value)
            }));
        
        const strongestOnField = currentFieldMonsters.length > 0 
            ? Math.max(...currentFieldMonsters.map(m => m.strength))
            : 0;
        
        // Find empty monster spaces
        const emptyMonsterSpaces = this.game.bot.monsterSpaces
            .map((space, index) => space.card === null ? index : -1)
            .filter(index => index !== -1);
        
        // If no empty spaces, we'll need to sacrifice field monsters to make room
        const hasEmptySpaces = emptyMonsterSpaces.length > 0;
        
        console.log(`Bot: Empty spaces: ${emptyMonsterSpaces.length}, hasEmptySpaces: ${hasEmptySpaces}`);
        console.log(`Bot: Strongest monster on field: ${strongestOnField}`);
        
        // STRATEGIC EVALUATION: Only summon big monsters that make sense
        // Track what we've already summoned this turn to avoid sacrificing it
        const summonedThisTurn = [];
        // Track cards consumed (summoned or sacrificed) during this function to avoid stale evaluations/logs
        const consumedIds = new Set();
        
        for (const monster of bigMonsters) {
            // If this card has already been consumed (played or sacrificed) earlier in the turn,
            // it will no longer be in hand — skip evaluating it.
            if (consumedIds.has(monster.id) || !this.game.bot.hand.find(c => c.id === monster.id)) {
                if (consumedIds.has(monster.id) && this.game.ui && this.game.ui.addBotThinkingMessage) {
                    this.game.ui.addBotThinkingMessage(`Skipping ${monster.value} — already used as a sacrifice or summon earlier this turn.`);
                }
                continue;
            }
            const monsterStrength = getCardNumericValue(monster.value);
            
            // STRATEGIC CHECK: Don't summon a weaker big monster if we already have stronger on field
            // Unless we're filling empty spaces with no sacrifice cost
            if (monsterStrength < strongestOnField) {
                if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                    this.game.ui.addBotThinkingMessage(`Skip summoning ${monster.value} (${monsterStrength}) — weaker than current strongest on field (${strongestOnField}).`);
                }
                continue;
            }
            
            // STRATEGIC CHECK: Don't summon if it's weaker than what we just summoned
            if (summonedThisTurn.length > 0) {
                const lastSummoned = Math.max(...summonedThisTurn);
                if (monsterStrength < lastSummoned) {
                    if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                        this.game.ui.addBotThinkingMessage(`Skip summoning ${monster.value} (${monsterStrength}) — weaker than a monster already summoned this turn (${lastSummoned}).`);
                    }
                    continue;
                }
            }
            
            const requiredValue = getRequiredSacrificeValue(monster);
            const sacrifices = this.selectSacrificesForBigMonster(requiredValue, !hasEmptySpaces, monster.id);
            
            if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                this.game.ui.addBotThinkingMessage(`Evaluating summon ${monster.value} (requires ${requiredValue}); found ${sacrifices.length} sacrifice candidates (total value ${getTotalCardValue(sacrifices)}).`);
            }
            
            // CRITICAL: Remove the monster being summoned from the sacrifice list if it was included
            // ALSO: Remove any monsters we summoned this turn (they're not in hand anymore!)
            const filteredSacrifices = sacrifices.filter(s => {
                // Don't sacrifice the monster we're trying to summon
                if (s.id === monster.id) return false;
                // Don't use anything we've already consumed in this sequence
                if (consumedIds.has(s.id)) return false;
                
                // Don't sacrifice monsters we just summoned this turn
                // (they're on field but were from hand, so sacrifice selection might pick them)
                const wasSummonedThisTurn = this.game.bot.monsterSpaces.some(space => 
                    space.card && space.card.id === s.id && space.card.justPlaced
                );
                if (wasSummonedThisTurn) {
                    console.log(`Bot: Excluding ${s.value} from sacrifices - just summoned this turn`);
                    return false;
                }
                
                return true;
            });
            
            if (filteredSacrifices.length === 0) {
                if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                    this.game.ui.addBotThinkingMessage(`Cannot summon ${monster.value} — no valid sacrifices available after exclusions.`);
                }
                continue;
            }
            
            const totalValue = getTotalCardValue(filteredSacrifices);
            if (totalValue < requiredValue) {
                if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                    this.game.ui.addBotThinkingMessage(`Cannot summon ${monster.value} — sacrifices total ${totalValue} < required ${requiredValue}.`);
                }
                continue;
            }
            
            // STRATEGIC CHECK: Don't sacrifice a stronger field monster to summon a weaker one
            // (We prefer to sacrifice hand cards, so only check for field monster sacrifices)
            const fieldSacrifices = filteredSacrifices.filter(s => 
                this.game.bot.monsterSpaces.some(space => space.card && space.card.id === s.id)
            );
            
            if (fieldSacrifices.length > 0) {
                const maxFieldSacrificeStrength = Math.max(...fieldSacrifices.map(s => getCardNumericValue(s.value)));
                // Only skip if we're sacrificing a strictly stronger field monster
                if (maxFieldSacrificeStrength > monsterStrength) {
                    if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                        this.game.ui.addBotThinkingMessage(`Skip ${monster.value} (${monsterStrength}) — would require sacrificing stronger field monster (${maxFieldSacrificeStrength}).`);
                    }
                    continue;
                }
            }
            
            // NEW STRATEGIC CHECK: Evaluate if summoning this monster (possibly with fusion) can beat player targets
            // Calculate what the board would look like after this summon, including potential fusions
            const plannedSummons = [...summonedThisTurn.map((str, idx) => {
                // Find the summoned monster on field
                const summonedCard = this.game.bot.monsterSpaces.find(space => 
                    space.card && 
                    !space.card.isFusion && 
                    getCardNumericValue(space.card.value) === str &&
                    space.card.justPlaced
                );
                return summonedCard ? { card: summonedCard.card, sacrifices: [] } : null;
            }).filter(x => x), { card: monster, sacrifices: filteredSacrifices }];
            
            const postSummonEval = this.evaluatePostSummonAttackPotential(plannedSummons);
            
            // If this summon won't help us beat the player's strongest target, check if holding back for fusion would be better
            if (postSummonEval.targetStrength > 0 && !postSummonEval.canBeatTargets) {
                // Check if NOT summoning (keeping monsters in hand for potential fusion with existing field) would be better
                // Look for fusion opportunities with cards that would be sacrificed
                const cardsKeptIfSkip = filteredSacrifices.filter(s => {
                    // Only consider cards from hand (not field)
                    return this.game.bot.hand.some(h => h.id === s.id);
                });
                
                if (cardsKeptIfSkip.length > 0) {
                    // Evaluate potential fusions if we kept these cards
                    let bestFusionWithKept = 0;
                    for (const keptCard of cardsKeptIfSkip) {
                        const keptStrength = getCardNumericValue(keptCard.value);
                        // Check fusion with existing field monsters
                        for (const space of this.game.bot.monsterSpaces) {
                            if (space.card && !space.card.isFusion) {
                                const fieldStrength = getCardNumericValue(space.card.value);
                                if (fieldStrength !== keptStrength) {
                                    const fusionStrength = keptStrength + fieldStrength;
                                    bestFusionWithKept = Math.max(bestFusionWithKept, fusionStrength);
                                }
                            }
                        }
                    }
                    
                    // If keeping the sacrifices for fusion would beat the target, skip this summon
                    if (bestFusionWithKept > postSummonEval.targetStrength) {
                        if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                            this.game.ui.addBotThinkingMessage(
                                `Skip summoning ${monster.value} (${monsterStrength}) — keeping sacrifice cards for fusion (potential ${bestFusionWithKept}) would beat player's ${postSummonEval.targetStrength}.`
                            );
                        }
                        continue;
                    }
                }
            }
            
            // Log the evaluation result
            if (this.game.ui && this.game.ui.addBotThinkingMessage && postSummonEval.targetStrength > 0) {
                if (postSummonEval.canBeatTargets) {
                    this.game.ui.addBotThinkingMessage(
                        `Summoning ${monster.value}: post-summon max strength=${postSummonEval.maxAttackStrength} can beat player's ${postSummonEval.targetStrength}${postSummonEval.fusionOptions.length > 0 ? ' (fusion possible)' : ''}.`
                    );
                } else {
                    this.game.ui.addBotThinkingMessage(
                        `Summoning ${monster.value}: post-summon max strength=${postSummonEval.maxAttackStrength} cannot beat player's ${postSummonEval.targetStrength} (best option available).`
                    );
                }
            }
            
            let targetSpace = null;
            
            if (hasEmptySpaces && emptyMonsterSpaces.length > 0) {
                // Use an empty space if available
                targetSpace = emptyMonsterSpaces.shift();
            } else {
                // No empty spaces - find a field monster that's being sacrificed
                for (let i = 0; i < this.game.bot.monsterSpaces.length; i++) {
                    const space = this.game.bot.monsterSpaces[i];
                    if (space.card && filteredSacrifices.find(s => s.id === space.card.id)) {
                        targetSpace = i;
                        break;
                    }
                }
                
                // If no field monster is being sacrificed, we can't summon
                if (targetSpace === null) {
                    console.log(`Bot: No valid target space for ${monster.value}`);
                    continue;
                }
            }
            
            // Summon the monster (use playBigMonster if available, otherwise fallback)
            // Logging will be handled by playBigMonster
            if (this.game && typeof this.game.playBigMonster === 'function') {
                if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                    const sacVals = filteredSacrifices.map(s=>s.value).join(',');
                    this.game.ui.addBotThinkingMessage(`Summoning ${monster.value} (${monsterStrength}) at space ${targetSpace}; sacrifices=[${sacVals}]`);
                }
                this.game.playBigMonster(monster, targetSpace, filteredSacrifices, true);
                // Track that we summoned this monster
                summonedThisTurn.push(monsterStrength);
                // Record consumption to avoid stale evaluations
                consumedIds.add(monster.id);
                filteredSacrifices.forEach(s => consumedIds.add(s.id));
            } else {
                // Fallback: perform sacrifices and then play the monster
                if (filteredSacrifices && filteredSacrifices.length > 0 && typeof this.game.bot.sacrificeCards === 'function') {
                    this.game.bot.sacrificeCards(filteredSacrifices, this.game.deck);
                }
                if (this.game && typeof this.game.playMonsterCard === 'function') {
                    this.game.playMonsterCard(monster, targetSpace, true);
                }
                summonedThisTurn.push(monsterStrength);
                consumedIds.add(monster.id);
                filteredSacrifices.forEach(s => consumedIds.add(s.id));
            }
            
            this.game.ui.updateGameState();
            
            await delay(this.actionDelays.afterSummon);
        }
        
        if (summonedThisTurn.length === 0) {
            console.log('Bot: No big monsters summoned this turn');
        }
    }

    /**
     * Summon normal monsters with human-like decision making
     */
    async summonNormalMonsters() {
        // Find normal monsters in hand
        const normalMonsters = this.game.bot.hand.filter(
            card => getCardType(card.value) === CARD_TYPES.MONSTER_NORMAL
        );
        
        if (normalMonsters.length === 0) return;
        
    // Deterministic brief delay for visibility
    await delay(300);
        
        // Get player's strongest target for strategic evaluation
        const playerMonsters = this.game.player.monsterSpaces
            .filter(space => space.card)
            .map(space => ({
                strength: space.card.isFusion ? space.card.fusionStrength : getCardNumericValue(space.card.value)
            }));
        const playerStrongest = playerMonsters.length > 0 ? Math.max(...playerMonsters.map(m => m.strength)) : 0;
        
        // Deterministic: always sort by value descending (strongest first)
        const sortedMonsters = [...normalMonsters].sort((a, b) => 
            getCardNumericValue(b.value) - getCardNumericValue(a.value)
        );
        
        // Find empty monster spaces
        const emptyMonsterSpaces = this.game.bot.monsterSpaces
            .map((space, index) => space.card === null ? index : -1)
            .filter(index => index !== -1);
        
        // STRATEGIC DECISION: Check if we should hold back some monsters for fusion
        // If we have monsters that could fuse with field monsters to beat player's strongest, consider holding them
        let monstersToSummon = sortedMonsters.slice(0, emptyMonsterSpaces.length);
        
        if (playerStrongest > 0 && normalMonsters.length > 0) {
            // Check current field monsters
            const currentFieldMonsters = this.game.bot.monsterSpaces
                .filter(space => space.card && !space.card.isFusion)
                .map(space => ({
                    card: space.card,
                    strength: getCardNumericValue(space.card.value)
                }));
            
            // If we have field monsters, check if keeping some hand monsters for fusion would be better
            if (currentFieldMonsters.length > 0) {
                const strongestField = Math.max(...currentFieldMonsters.map(m => m.strength));
                
                // If none of our field monsters can beat the player's strongest
                if (strongestField <= playerStrongest) {
                    // Check if any hand monster could fuse with field to beat the target
                    let bestFusionStrength = 0;
                    let fusionPossible = false;
                    
                    for (const handMonster of normalMonsters) {
                        const handStrength = getCardNumericValue(handMonster.value);
                        for (const fieldMonster of currentFieldMonsters) {
                            // Can only fuse if values are different
                            if (handStrength !== fieldMonster.strength) {
                                const fusionStrength = handStrength + fieldMonster.strength;
                                if (fusionStrength > bestFusionStrength) {
                                    bestFusionStrength = fusionStrength;
                                    fusionPossible = fusionStrength > playerStrongest;
                                }
                            }
                        }
                    }
                    
                    // If fusion would beat the target but direct summoning wouldn't, hold back fusion components
                    if (fusionPossible && bestFusionStrength > playerStrongest) {
                        const strongestHand = Math.max(...sortedMonsters.map(m => getCardNumericValue(m.value)));
                        if (strongestHand <= playerStrongest) {
                            // Don't summon all monsters - save at least one for fusion next turn
                            if (monstersToSummon.length > 1) {
                                monstersToSummon = monstersToSummon.slice(0, -1); // Hold back the weakest
                                if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                                    this.game.ui.addBotThinkingMessage(
                                        `Holding back 1 monster for potential fusion (can create ${bestFusionStrength} to beat player's ${playerStrongest}).`
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Summon the decided monsters
        for (let i = 0; i < monstersToSummon.length; i++) {
            if (i >= emptyMonsterSpaces.length) break;
            
            const monster = monstersToSummon[i];
            const targetSpace = emptyMonsterSpaces[i];
            
            // Deterministic delay
            await delay(250);
            
            // Logging will be handled by playMonsterCard
            if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                const strength = getCardNumericValue(monster.value);
                this.game.ui.addBotThinkingMessage(`Summoning normal monster ${monster.value} (strength ${strength}) to space ${targetSpace}.`);
            }
            this.game.playMonsterCard(monster, targetSpace, true);
            
            this.game.ui.updateGameState();
            
            await delay(this.actionDelays.afterSummon);
        }
    }

    /**
     * Select cards to discard when over hand limit
     * @param {number} count - Number of cards to discard
     * @returns {Array} - Cards to discard
     */
    selectCardsToDiscard(count) {
        const cards = [...this.game.bot.hand];
        const toDiscard = [];
        
        // Sort by strategic value (lowest first)
        cards.sort((a, b) => {
            // Never discard Joker
            if (a.value === CARD_VALUES.JOKER) return 1;
            if (b.value === CARD_VALUES.JOKER) return -1;
            
            const typeA = getCardType(a.value);
            const typeB = getCardType(b.value);
            
            // Prioritize keeping traps
            if (typeA === CARD_TYPES.TRAP && typeB !== CARD_TYPES.TRAP) return 1;
            if (typeB === CARD_TYPES.TRAP && typeA !== CARD_TYPES.TRAP) return -1;
            
            // For monsters, keep higher values
            return getCardNumericValue(a.value) - getCardNumericValue(b.value);
        });
        
        // Select cards to discard
        for (let i = 0; i < count && i < cards.length; i++) {
            toDiscard.push(cards[i]);
        }
        
        return toDiscard;
    }

    /**
     * Select sacrifices for big monster summoning, preferring hand cards over field cards
     * @param {number} requiredValue - Total value needed
     * @param {boolean} preferFieldSacrifice - If true, require at least one field monster if possible
     * @param {string} excludeCardId - Card ID to exclude (the monster being summoned)
     * @returns {Array} - Selected sacrifices (prioritizes hand cards over field)
     */
    selectSacrificesForBigMonster(requiredValue, preferFieldSacrifice = false, excludeCardId = null) {
        const handCards = [];
        const fieldMonsters = [];
        
        // Separate hand cards and field monsters
        this.game.bot.hand.forEach(card => {
            const cardType = getCardType(card.value);
            if (cardType !== CARD_TYPES.TRAP && card.value !== CARD_VALUES.JOKER) {
                // Don't include the card we're trying to summon
                if (excludeCardId && card.id === excludeCardId) return;
                handCards.push(card);
            }
        });
        
        this.game.bot.monsterSpaces.forEach(space => {
            if (space.card && !space.card.isFusion) {
                // Don't include the card we're trying to summon (if it was just placed)
                if (excludeCardId && space.card.id === excludeCardId) return;
                fieldMonsters.push(space.card);
            }
        });
        
        // Sort all by value (descending) for efficient selection
        handCards.sort((a, b) => 
            getCardNumericValue(b.value) - getCardNumericValue(a.value)
        );
        fieldMonsters.sort((a, b) => 
            getCardNumericValue(b.value) - getCardNumericValue(a.value)
        );
        
        // STRATEGY: Try to satisfy the requirement using only hand cards first (to preserve field)
        let bestSolution = null;
        let bestSolutionWaste = Infinity;
        
        // 1) Try single hand card
        for (const card of handCards) {
            const v = getCardNumericValue(card.value);
            if (v >= requiredValue) {
                const waste = v - requiredValue;
                if (waste < bestSolutionWaste) {
                    bestSolutionWaste = waste;
                    bestSolution = [card];
                    if (waste === 0) return bestSolution; // exact match
                }
            }
        }
        
        // 2) Try single field monster (only if we must sacrifice field)
        if (preferFieldSacrifice && bestSolution === null) {
            for (const card of fieldMonsters) {
                const v = getCardNumericValue(card.value);
                if (v >= requiredValue) {
                    const waste = v - requiredValue;
                    if (waste < bestSolutionWaste) {
                        bestSolutionWaste = waste;
                        bestSolution = [card];
                        if (waste === 0) return bestSolution;
                    }
                }
            }
        }
        
        // 3) If single card didn't work, try two hand cards
        if (bestSolution === null) {
            for (let i = 0; i < handCards.length; i++) {
                const val1 = getCardNumericValue(handCards[i].value);
                for (let j = i + 1; j < handCards.length; j++) {
                    const val2 = getCardNumericValue(handCards[j].value);
                    const total = val1 + val2;
                    
                    if (total >= requiredValue) {
                        const waste = total - requiredValue;
                        if (waste < bestSolutionWaste) {
                            bestSolutionWaste = waste;
                            bestSolution = [handCards[i], handCards[j]];
                            if (waste === 0) return bestSolution;
                        }
                    }
                }
            }
        }
        
        // 4) If still no solution, try hand + field combination (prefer hand cards, minimize field sacrifice)
        if (bestSolution === null) {
            for (let i = 0; i < handCards.length; i++) {
                const handVal = getCardNumericValue(handCards[i].value);
                for (const fieldCard of fieldMonsters) {
                    const fieldVal = getCardNumericValue(fieldCard.value);
                    const total = handVal + fieldVal;
                    
                    if (total >= requiredValue) {
                        const waste = total - requiredValue;
                        if (waste < bestSolutionWaste) {
                            bestSolutionWaste = waste;
                            bestSolution = [handCards[i], fieldCard];
                            if (waste === 0) return bestSolution;
                        }
                    }
                }
            }
        }
        
        // 5) If still nothing, try multiple hand cards (greedy)
        if (bestSolution === null) {
            const selected = [];
            let currentValue = 0;
            
            for (const card of handCards) {
                const cardValue = getCardNumericValue(card.value);
                selected.push(card);
                currentValue += cardValue;
                
                if (currentValue >= requiredValue) {
                    bestSolution = selected;
                    break;
                }
            }
        }
        
        // 6) If still no solution and field sacrifice is acceptable, try field combinations
        if (bestSolution === null && !preferFieldSacrifice) {
            // Try two field monsters
            for (let i = 0; i < fieldMonsters.length; i++) {
                const val1 = getCardNumericValue(fieldMonsters[i].value);
                for (let j = i + 1; j < fieldMonsters.length; j++) {
                    const val2 = getCardNumericValue(fieldMonsters[j].value);
                    const total = val1 + val2;
                    
                    if (total >= requiredValue) {
                        const waste = total - requiredValue;
                        if (waste < bestSolutionWaste) {
                            bestSolutionWaste = waste;
                            bestSolution = [fieldMonsters[i], fieldMonsters[j]];
                            if (waste === 0) return bestSolution;
                        }
                    }
                }
            }
        }
        
        // 7) Last resort: greedy field monsters
        if (bestSolution === null && !preferFieldSacrifice) {
            const selected = [];
            let currentValue = 0;
            
            for (const card of fieldMonsters) {
                const cardValue = getCardNumericValue(card.value);
                selected.push(card);
                currentValue += cardValue;
                
                if (currentValue >= requiredValue) {
                    bestSolution = selected;
                    break;
                }
            }
        }
        
        return bestSolution || [];
    }

    /**
     * Select cards for fusion upkeep with strategic hand management
     * Goal: Empty hand for better draw next turn, but preserve board strength
     * @param {number} count - Number of fusions to maintain
     * @returns {Array} - Selected upkeep cards
     */
    selectCardsForFusionUpkeep(count) {
        const upkeepCandidates = [];
        
        // Add cards from hand (except big monsters, traps, and jokers)
        this.game.bot.hand.forEach(card => {
            const cardType = getCardType(card.value);
            if (cardType !== CARD_TYPES.TRAP && card.value !== CARD_VALUES.JOKER) {
                upkeepCandidates.push({
                    card: card,
                    location: 'hand',
                    strength: getCardNumericValue(card.value),
                    type: cardType
                });
            }
        });
        
        // Add non-fusion monsters from field
        this.game.bot.monsterSpaces.forEach((space, index) => {
            if (space.card && !space.card.isFusion) {
                upkeepCandidates.push({
                    card: space.card,
                    location: 'field',
                    index: index,
                    strength: getCardNumericValue(space.card.value),
                    type: getCardType(space.card.value)
                });
            }
        });
        
        if (upkeepCandidates.length <= count) {
            // Not enough candidates, return all of them
            return upkeepCandidates.map(candidate => candidate.card);
        }
        
        // STRATEGIC HAND MANAGEMENT: Prioritize emptying hand for fresh 5-card draw
        // Check current hand size
        const currentHandSize = this.game.bot.hand.length;
        const shouldEmptyHand = currentHandSize > 5; // If hand > 5, try to empty it
        
        // Human-like strategic evaluation
        upkeepCandidates.forEach(candidate => {
            let value = candidate.strength;
            
            // STRATEGIC: Prefer hand cards if trying to empty hand (empty for fresh draw)
            if (shouldEmptyHand && candidate.location === 'hand') {
                value -= 5; // Make hand cards much more sacrificeable
            }
            
            // Adjust value based on location
            if (candidate.location === 'field') {
                // Field monsters are more valuable (already providing board presence)
                value += 2;
                
                // Attacked this turn means already provided value (less useful)
                if (candidate.card.attackedThisTurn) {
                    value -= 1.5;
                }
            }
            
            // Big monsters are more valuable (preserve them)
            if (candidate.type === CARD_TYPES.MONSTER_BIG) {
                value += 3;
            }
            
            candidate.strategicValue = value;
        });
        
        // Deterministic sort by strategic value (lowest first = best to sacrifice)
        const sortedCandidates = [...upkeepCandidates].sort((a, b) => a.strategicValue - b.strategicValue);

        // Select cards for upkeep
        const selected = sortedCandidates.slice(0, count).map(candidate => candidate.card);
        
        // Log strategy
        if (this.game.ui && this.game.ui.addBotThinkingMessage) {
            const fromHand = selected.filter(c => this.game.bot.hand.includes(c)).length;
            const fromField = count - fromHand;
            if (shouldEmptyHand) {
                this.game.ui.addBotThinkingMessage(`Upkeep: Emptying hand (${fromHand} from hand, ${fromField} from field) for fresh draw next turn`);
            } else {
                this.game.ui.addBotThinkingMessage(`Upkeep: Sacrificing ${count} cards for fusion maintenance`);
            }
        }
        
        return selected;
    }

    /**
     * Find optimal attack target for monster (pure logic version - used as a baseline)
     * @param {Card} attackingMonster - Attacking monster
     * @param {Array} targets - Valid target indices
     * @returns {number} - Best target index
     */
    findOptimalAttackTarget(attackingMonster, targets) {
        const attackingStrength = attackingMonster && (attackingMonster.isFusion ? 
            attackingMonster.fusionStrength : 
            getCardNumericValue(attackingMonster.value));
        
        let bestTarget = targets[0];
        let bestAdvantage = -Infinity;
        
        for (const targetIndex of targets) {
            // Skip null direct-attack placeholders here
            if (targetIndex === null || targetIndex === undefined) continue;

            const targetSpace = this.game.player.monsterSpaces[targetIndex];
            if (!targetSpace || !targetSpace.card) continue;

            const targetCard = targetSpace.card;
            const targetStrength = targetCard.isFusion ? 
                targetCard.fusionStrength : 
                getCardNumericValue(targetCard.value);

            const advantage = attackingStrength - targetStrength;

            // Prefer targets we can defeat and maximize damage
            if (advantage > bestAdvantage) {
                bestTarget = targetIndex;
                bestAdvantage = advantage;
            }
        }

        // If bestTarget remained undefined and direct attack is available, prefer direct
        if ((bestTarget === undefined || bestTarget === null) && targets.includes(null)) {
            return null;
        }
        
        return bestTarget;
    }
    
    /**
     * Find attack target using human-like decision making
     * @param {Card} attackingMonster - Attacking monster
     * @param {Array} targets - Valid target indices
     * @returns {number} - Selected target index
     */
    findHumanLikeAttackTarget(attackingMonster, targets) {
        const attackingStrength = attackingMonster && (attackingMonster.isFusion ?
            attackingMonster.fusionStrength :
            getCardNumericValue(attackingMonster.value));

        const options = [];
        for (const targetIndex of targets) {
            if (targetIndex === null || targetIndex === undefined) {
                // Direct attack: advantage equals damage dealt
                options.push({ index: null, score: attackingStrength, type: 'direct' });
                continue;
            }
            const targetSpace = this.game.player.monsterSpaces[targetIndex];
            if (!targetSpace || !targetSpace.card) continue;
            const targetCard = targetSpace.card;
            const targetStrength = targetCard.isFusion ? targetCard.fusionStrength : getCardNumericValue(targetCard.value);
            const rawAdv = attackingStrength - targetStrength;
            if (rawAdv <= 0) continue; // never choose disadvantageous/equal trades
            // Prefer destroying fusions slightly
            const bonus = targetCard.isFusion ? 1 : 0;
            const score = rawAdv + bonus;
            options.push({ index: targetIndex, score, type: 'monster', rawAdv, fusion: targetCard.isFusion });
        }

        if (options.length === 0) {
            // If no favorable monster targets, prefer direct attack if available
            if (targets.includes(null)) return null;
            return null; // nothing else to do
        }

        // Deterministic selection: highest score, tie-breaker: prefer monster over direct, then lower target index
        options.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (a.type !== b.type) return a.type === 'monster' ? -1 : 1;
            return (a.index ?? 999) - (b.index ?? 999);
        });

        return options[0].index ?? null;
    }

    /**
     * Get bot's monsters that can attack
     * @returns {Array} - Monsters that can attack
     */
    getBotAttackingMonsters() {
        const attackers = [];
        
        for (const space of this.game.bot.monsterSpaces) {
            if (space.card && space.card.canAttack()) {
                attackers.push(space.card);
            }
        }
        
        return attackers;
    }

    /**
     * Handle trap activation in response to an attack with human-like decision making
     * @param {number} attackerIndex - Attacker monster index
     * @param {number|null} targetIndex - Target monster index or null for direct
     * @param {Function} resumeFunction - Function to resume attack
     */
    async handleDefensiveTraps(attackerIndex, targetIndex, resumeFunction) {
        // Add variable "thinking" time for trap consideration
    await delay(300);
        
        // Check if direct attack - use Ace trap if available
        if (targetIndex === null) {
            const allTraps = this.game.bot.getActivatableTraps({ type: 'battle-phase' });
            const aceTraps = allTraps.filter(trap => trap.value === CARD_VALUES.ACE);

            if (aceTraps.length > 0) {
                // Human-like decision making for Ace trap activation
                const attackerSpace = this.game.player.monsterSpaces[attackerIndex];
                const attackingMonster = attackerSpace && attackerSpace.card;
                if (!attackingMonster) {
                    if (resumeFunction) resumeFunction();
                    return;
                }
                
                const attackingStrength = attackingMonster.isFusion ? 
                    attackingMonster.fusionStrength : 
                    getCardNumericValue(attackingMonster.value);
                
                // Calculate importance of saving the Ace
                // Check if player might have stronger monsters to attack with later
                const playerStrongerMonsterCount = this.game.player.monsterSpaces.filter(space => {
                    if (!space.card || space.card.attackedThisTurn) return false;
                    const strength = space.card.isFusion ? 
                        space.card.fusionStrength : 
                        getCardNumericValue(space.card.value);
                    return strength > attackingStrength;
                }).length;
                
                // Calculate direct damage threat
                const directDamagePercent = attackingStrength / this.game.bot.health;
                
                // Decision factors
                let useAceProbability = 0.8; // Base probability
                
                // Adjust based on direct damage threat
                if (directDamagePercent > 0.25) {
                    useAceProbability += 0.15; // High damage increases likelihood
                } else if (directDamagePercent < 0.1) {
                    useAceProbability -= 0.2; // Low damage decreases likelihood
                }
                
                // Adjust based on stronger monsters the player might attack with later
                if (playerStrongerMonsterCount > 0) {
                    useAceProbability -= 0.25; // Save Ace for stronger threats
                }
                
                // Deterministic heuristic: no emotion/personality/skill adjustments
                
                // Deterministic: use Ace if probability threshold >= 0.5 (acts as a heuristic score)
                if (useAceProbability >= 0.5) {
                    this.game.ui.addLogMessage('Bot activates Ace trap!');
                    const res = await this.game.activateAceTrap(aceTraps[0], true);
                    this.recordTrapActivation(aceTraps[0], true);
                    return res;
                }
            }
        }
        
        // Check for Jack and King traps for monster attacks
        const activatableTraps = this.game.bot.getActivatableTraps({ type: 'attack' });
        
        if (activatableTraps.length === 0 || !resumeFunction) {
            // No traps or can't resume - continue attack
            if (resumeFunction) resumeFunction();
            return;
        }
        
        // Find attacking monster (guard against invalid indices or already-empty spaces)
        const attackerSpace = this.game.player.monsterSpaces[attackerIndex];
        const attackingMonster = attackerSpace && attackerSpace.card;
        if (!attackingMonster) {
            if (resumeFunction) resumeFunction();
            return;
        }
        
        const attackingStrength = attackingMonster.isFusion ? 
            attackingMonster.fusionStrength : 
            getCardNumericValue(attackingMonster.value);
        
        // Calculate the optimal trap decision first (as a baseline)
        let optimalTrap = null;
        let optimalTrapValue = -Infinity;
        let optimalTarget = null;
        
        // Track all valid trap options for human-like decision making
        const trapOptions = [];
        
        // Evaluate King trap option (works for both direct and targeted attacks)
        const kingTraps = activatableTraps.filter(trap => trap.value === CARD_VALUES.KING);
        if (kingTraps.length > 0) {
            if (targetIndex === null) {
                // Direct attack: value equals direct damage reduction
                const halvedStrength = applyKingEffect(attackingStrength);
                const reduction = attackingStrength - halvedStrength;
                trapOptions.push({
                    trap: kingTraps[0],
                    type: 'KING',
                    value: reduction,
                    direct: true
                });
                if (reduction > optimalTrapValue) {
                    optimalTrap = kingTraps[0];
                    optimalTrapValue = reduction;
                    optimalTarget = null;
                }
            } else {
                // Targeted attack against our monster
                const targetCard = this.game.bot.monsterSpaces[targetIndex].card;
                if (targetCard) {
                    const targetStrength = targetCard.isFusion ? 
                        targetCard.fusionStrength : 
                        getCardNumericValue(targetCard.value);
                    
                    const normalDifference = attackingStrength - targetStrength;
                    const halvedStrength = applyKingEffect(attackingStrength);
                    const halvedDifference = halvedStrength - targetStrength;
                    
                    const baseReduction = attackingStrength - halvedStrength; // raw damage/attack reduction
                    const savesBotMonster = normalDifference > 0 && halvedDifference <= 0;
                    const turnsTieToWin = normalDifference === 0 && halvedDifference < 0;
                    const defenderValuable = targetStrength > 6 ? 1 : 0;
                    
                    // Score: prioritize saving our monster or flipping outcome, otherwise use raw reduction
                    let score = baseReduction;
                    if (savesBotMonster) score += 100;
                    if (turnsTieToWin) score += 50;
                    score += defenderValuable * 10;
                    
                    trapOptions.push({
                        trap: kingTraps[0],
                        type: 'KING',
                        value: score,
                        savesBotMonster,
                        turnsTieToWin,
                        baseReduction
                    });
                    
                    if (score > optimalTrapValue) {
                        optimalTrap = kingTraps[0];
                        optimalTrapValue = score;
                        optimalTarget = null; // King doesn't need target
                    }
                }
            }
        }
        
        // Evaluate Jack trap options
        const jackTraps = activatableTraps.filter(trap => trap.value === CARD_VALUES.JACK);
        if (jackTraps.length > 0) {
            const redirectTargets = this.game.board.getValidRedirectTargets(
                attackerIndex, 
                this.game.player, 
                targetIndex, 
                this.game.bot
            );
            
            // Evaluate each redirect target
            for (const target of redirectTargets) {
                // Calculate the advantage of this redirection
                let advantage = -Infinity;
                let redirectsToPlayer = false;
                
                if (target.player === this.game.player) {
                    // Redirecting to player's monster - causes player infighting
                    // This is almost always beneficial, but consider the strength difference
                    const targetCard = target.player.monsterSpaces[target.index].card;
                    if (!targetCard) continue;
                    
                    const targetStrength = targetCard.isFusion ? 
                        targetCard.fusionStrength : 
                        getCardNumericValue(targetCard.value);
                    
                    // Base advantage for player infighting: inflicting damage is always good
                    advantage = 50;
                    
                    // Bonus if player's stronger monster attacks player's weaker monster (monster dies)
                    if (attackingStrength > targetStrength) {
                        advantage += 20; // Favorable outcome: player loses a monster and takes damage
                    }
                    
                    // Bonus if this prevents damage to a valuable bot monster  
                    if (targetIndex !== null) {
                        const originalTargetCard = this.game.bot.monsterSpaces[targetIndex].card;
                        if (originalTargetCard) {
                            const originalTargetStrength = originalTargetCard.isFusion ? 
                                originalTargetCard.fusionStrength : 
                                getCardNumericValue(originalTargetCard.value);
                            
                            if (originalTargetStrength > 6) {
                                advantage += 15; // Save valuable monster
                            }
                        }
                    }
                    
                    redirectsToPlayer = true;
                } else {
                    // Redirecting to our own monster - evaluate the trade-off
                    const targetCard = target.player.monsterSpaces[target.index].card;
                    if (!targetCard) continue;
                    
                    const targetStrength = targetCard.isFusion ? 
                        targetCard.fusionStrength : 
                        getCardNumericValue(targetCard.value);
                    
                    // Calculate value of what we're saving vs what we're sacrificing
                    let originalTargetValue = 0;
                    if (targetIndex !== null) {
                        const originalTargetCard = this.game.bot.monsterSpaces[targetIndex].card;
                        if (originalTargetCard) {
                            originalTargetValue = originalTargetCard.isFusion ? 
                                originalTargetCard.fusionStrength : 
                                getCardNumericValue(originalTargetCard.value);
                        }
                    }
                    
                    // Strength difference (positive = redirect target survives)
                    const strengthDifference = targetStrength - attackingStrength;
                    
                    // Value difference between original target and redirect target
                    const valueDifference = originalTargetValue - targetStrength;
                    
                    // Calculate advantage based on both factors
                    // Key insight: if attacker dies and we're not sacrificing anything valuable,
                    // that's a pure win for us (we got the attacker destroyed for free)
                    let advantage = 0;
                    
                    if (strengthDifference >= 0) {
                        // Redirect target survives - good if we're saving something more valuable
                        advantage = valueDifference + strengthDifference;
                    } else if (strengthDifference < 0) {
                        // Attacker dies when it hits the redirect target
                        // Base value: destroying the attacking monster is worth its strength
                        advantage = attackingStrength;
                        
                        // Add value from not taking damage on the original target
                        const damageAvoided = Math.max(0, attackingStrength - originalTargetValue);
                        advantage += damageAvoided;
                    }
                }
                
                // Add to options
                trapOptions.push({
                    trap: jackTraps[0],
                    type: 'JACK',
                    target: target,
                    value: advantage,
                    redirectsToPlayer: redirectsToPlayer
                });
                
                // Track optimal
                if (advantage > optimalTrapValue) {
                    optimalTrap = jackTraps[0];
                    optimalTrapValue = advantage;
                    optimalTarget = target;
                }
            }
        }
        
        // If no good options found or small advantage, maybe don't use a trap
        // Deterministic: if the best option provides no improvement, skip using a trap
        if (optimalTrapValue <= 0) {
            if (resumeFunction) resumeFunction();
            return;
        }
        
        // Human-like decision making
        let selectedTrap = null;
        let selectedTarget = null;
        
        if (trapOptions.length === 0) {
            // No viable options
            if (resumeFunction) resumeFunction();
            return;
        }
        
        // Deterministic: sort by raw value and select the best
        trapOptions.sort((a, b) => b.value - a.value);
        selectedTrap = trapOptions[0].trap;
        selectedTarget = trapOptions[0].target;
        
        // Use the selected trap
        if (selectedTrap) {
            if (selectedTrap.value === CARD_VALUES.KING) {
                // Add thinking context for King
                if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                    const opt = trapOptions.find(o => o.trap === selectedTrap && o.type === 'KING');
                    if (opt) {
                        if (opt.direct) {
                            this.game.ui.addBotThinkingMessage(`Using King on direct attack: reduce damage by ${opt.value}.`);
                        } else {
                            this.game.ui.addBotThinkingMessage(`Using King: base reduction ${opt.baseReduction}` + (opt.savesBotMonster ? '; saves our monster' : '') + (opt.turnsTieToWin ? '; flips tie to win' : '') + '.');
                        }
                    }
                }
                this.game.ui.addLogMessage('Bot activates King trap!');
                const res = await this.game.activateKingTrap(selectedTrap, {
                    attackerIndex,
                    attacker: this.game.player,
                    defenderIndex: targetIndex,
                    defender: this.game.bot,
                    resumeFunction
                }, true);
                this.recordTrapActivation(selectedTrap, true);
                return res;
            } else if (selectedTrap.value === CARD_VALUES.JACK && selectedTarget) {
                // Add thinking context for Jack
                if (this.game.ui && this.game.ui.addBotThinkingMessage) {
                    const opt = trapOptions.find(o => o.trap === selectedTrap && o.type === 'JACK');
                    if (opt) {
                        if (opt.redirectsToPlayer) {
                            this.game.ui.addBotThinkingMessage(
                                `Using Jack: redirect ${attackingStrength} to player's monster (causes infighting; advantage=${Math.round(opt.value)})`
                            );
                        } else {
                            this.game.ui.addBotThinkingMessage(
                                `Using Jack: redirect ${attackingStrength} to our ${this.game.bot.monsterSpaces[selectedTarget.index]?.card?.value || 'monster'} (advantage=${Math.round(opt.value)})`
                            );
                        }
                    }
                }
                this.game.ui.addLogMessage('Bot activates Jack trap!');
                const res = await this.game.activateJackTrap(
                    selectedTrap,
                    selectedTarget.index,
                    selectedTarget.player,
                    true
                );
                this.recordTrapActivation(selectedTrap, true);
                return res;
            } else if (resumeFunction) {
                resumeFunction();
            }
        } else if (resumeFunction) {
            resumeFunction();
        }

        return null;
    }

    /**
     * Decide whether to play Joker based on personality and game state
     * @returns {boolean} - Whether to play Joker
     */
    shouldPlayJoker() {
        // Deterministic Joker rule:
        // Play Joker if: (a) player's total field strength exceeds bot's by >= 8 OR
        // (b) player has >=2 monsters each stronger than any single bot monster,
        // and bot cannot create a fusion this turn that would beat the strongest player monster.
        let botStrengths = this.game.bot.monsterSpaces.filter(s => s.card).map(s => s.card.isFusion ? s.card.fusionStrength : getCardNumericValue(s.card.value));
        let playerStrengths = this.game.player.monsterSpaces.filter(s => s.card).map(s => s.card.isFusion ? s.card.fusionStrength : getCardNumericValue(s.card.value));
        const botTotal = botStrengths.reduce((a,b)=>a+b,0);
        const playerTotal = playerStrengths.reduce((a,b)=>a+b,0);
        const playerStrongest = playerStrengths.length ? Math.max(...playerStrengths) : 0;
        const botStrongest = botStrengths.length ? Math.max(...botStrengths) : 0;
        const conditionA = (playerTotal - botTotal) >= 8;
        const strongerThanAllCount = playerStrengths.filter(s => s > botStrongest).length;
        const conditionB = strongerThanAllCount >= 2;

        // Quick check: can we fuse to beat player's strongest?
        const potentials = this.game.board.getPotentialFusions(this.game.bot) || [];
        let canAnswer = false;
        for (const f of potentials) {
            if (f.fusionStrength > playerStrongest) { canAnswer = true; break; }
        }
        const should = (conditionA || conditionB) && !canAnswer;
        if (this.game.ui && this.game.ui.addBotThinkingMessage) {
            this.game.ui.addBotThinkingMessage(`Joker decision: playerTotal=${playerTotal}, botTotal=${botTotal}, strongestPlayer=${playerStrongest}, strongestBot=${botStrongest}, canAnswerByFusion=${canAnswer}. Use Joker=${should}`);
        }
        return should;
    }

    /**
     * Check if player has an active trap of a specific type with human-like consideration
     * @param {string} trapValue - Trap value to check for
     * @returns {boolean} - Whether player has that trap type (with consideration)
     */
    playerHasActiveTrapType(trapValue) {
        return this.playerHasActiveTrapOfType(trapValue);
    }
    
    /**
     * Direct check if player has an active trap of a specific type
     * @param {string} trapValue - Trap value to check for
     * @returns {boolean} - Whether player actually has that trap type
     */
    playerHasActiveTrapOfType(trapValue) {
        for (const space of this.game.player.trapSpaces) {
            if (space.card && space.card.active && space.card.value === trapValue) {
                return true;
            }
        }
        return false;
    }
}
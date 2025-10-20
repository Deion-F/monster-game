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
        this.personality = this.generatePersonality();
        this.emotion = {
            fear: 0.2,      // Affects willingness to attack/defend
            confidence: 0.5, // Affects risk-taking
            frustration: 0   // Builds when losing, affects decision randomness
        };
        this.gameMemory = {
            trapActivations: [], // Remember trap activations
            damageTaken: [],     // Remember big damage events
            successfulAttacks: 0 // Count successful attacks
        };
        this.learningHistory = {
            playerUsesTraps: 0.5,        // Start with neutral assumptions
            playerAggression: 0.5,       // How aggressively player attacks
            playerFusionPreference: 0.5, // How often player creates fusions
            playerTargetsStrongest: 0.5  // Whether player targets strongest monsters
        };
        this.skillLevel = this.getSkillLevelFromDifficulty();
    }

    /**
     * Generate a personality profile based on difficulty
     * @returns {Object} - Personality profile
     */
    generatePersonality() {
        // Define personality profiles
        const profiles = [
            {
                name: "Cautious",
                aggression: 0.3,       // Less likely to attack
                trapPreference: 0.8,   // Highly values traps
                fusionPreference: 0.5, // Neutral on fusions
                riskTolerance: 0.2     // Avoids risky plays
            },
            {
                name: "Aggressive",
                aggression: 0.9,
                trapPreference: 0.4,
                fusionPreference: 0.7,
                riskTolerance: 0.8
            },
            {
                name: "Balanced",
                aggression: 0.6,
                trapPreference: 0.6,
                fusionPreference: 0.6,
                riskTolerance: 0.5
            },
            {
                name: "Unpredictable",
                aggression: 0.5,
                trapPreference: 0.5,
                fusionPreference: 0.5,
                riskTolerance: 0.6,
                volatility: 0.3 // Chance to make completely random plays
            }
        ];
        
        // Select a random profile, biasing toward aggression for harder difficulties
        const difficultyBias = {
            'easy': [0.5, 0.2, 0.2, 0.1],   // Cautious bias
            'medium': [0.25, 0.25, 0.25, 0.25], // Even distribution
            'hard': [0.1, 0.4, 0.3, 0.2]    // Aggressive bias
        }[this.difficulty] || [0.25, 0.25, 0.25, 0.25];
        
        // Weighted random selection
        const rand = Math.random();
        let cumulativeProb = 0;
        let selectedIndex = profiles.length - 1;
        
        for (let i = 0; i < profiles.length; i++) {
            cumulativeProb += difficultyBias[i];
            if (rand < cumulativeProb) {
                selectedIndex = i;
                break;
            }
        }
        
        // Clone the profile to avoid modifying the original
        const profile = { ...profiles[selectedIndex] };
        
        // Add a small random variation to each trait for uniqueness
        Object.keys(profile).forEach(key => {
            if (typeof profile[key] === 'number') {
                profile[key] = Math.max(0.1, Math.min(0.9, 
                    profile[key] + (Math.random() * 0.2 - 0.1)
                ));
            }
        });
        
        console.log(`Bot personality: ${profile.name} (${this.difficulty} difficulty)`);
        return profile;
    }
    
    /**
     * Get skill level based on difficulty
     * @returns {number} - Skill level (0-1)
     */
    getSkillLevelFromDifficulty() {
        return {
            'easy': 0.5,    // 50% optimal decisions
            'medium': 0.75, // 75% optimal decisions
            'hard': 0.9     // 90% optimal decisions
        }[this.difficulty] || 0.75;
    }
    
    /**
     * Update bot's emotions based on game state
     */
    updateEmotions() {
        // Update based on game state
        const healthDiff = this.game.bot.health - this.game.player.health;
        const boardAdvantage = this.evaluateBoardAdvantage();
        
        // If losing badly, increase frustration
        if (healthDiff < -10 && boardAdvantage < 0) {
            this.emotion.frustration = Math.min(1, this.emotion.frustration + 0.2);
            this.emotion.confidence = Math.max(0, this.emotion.confidence - 0.15);
        }
        
        // If winning, increase confidence
        if (healthDiff > 10 && boardAdvantage > 0) {
            this.emotion.confidence = Math.min(1, this.emotion.confidence + 0.1);
            this.emotion.fear = Math.max(0, this.emotion.fear - 0.1);
        }
        
        // If player has many monsters, increase fear
        const playerMonsterCount = this.game.player.getMonsterCount();
        if (playerMonsterCount >= 3) {
            this.emotion.fear = Math.min(1, this.emotion.fear + 0.15);
        }
        
        // If bot has no monsters but player does, increase fear significantly
        const botMonsterCount = this.game.bot.getMonsterCount();
        if (botMonsterCount === 0 && playerMonsterCount > 0) {
            this.emotion.fear = Math.min(1, this.emotion.fear + 0.3);
        }
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
    
    /**
     * Make a strategic decision between options
     * @param {any} optimalChoice - The mathematically optimal choice
     * @param {Array} alternatives - Alternative choices
     * @param {number} importanceLevel - How important the decision is (0-1)
     * @returns {any} - Selected choice
     */
    makeDecision(optimalChoice, alternatives, importanceLevel = 0.5) {
        if (!alternatives || alternatives.length === 0) return optimalChoice;
        
        // Higher importance = more likely to make optimal choice
        // Apply skill level and emotion factors
        const perfection = Math.min(
            this.skillLevel + (importanceLevel * 0.2) - (this.emotion.frustration * 0.2),
            0.95
        );
        
        // Unpredictable personality sometimes makes random choices
        if (this.personality.volatility && Math.random() < this.personality.volatility) {
            return alternatives[Math.floor(Math.random() * alternatives.length)];
        }
        
        if (Math.random() < perfection) {
            return optimalChoice; // Make optimal choice
        } else {
            // Make sub-optimal but reasonable choice
            return alternatives[Math.floor(Math.random() * alternatives.length)];
        }
    }
    
    /**
     * Track player behavior to improve bot decision making
     * @param {string} action - Type of action observed
     * @param {Object} data - Data about the action
     */
    updateLearning(action, data) {
        switch (action) {
            case 'playerUsedTrap':
                // Increase belief that player uses traps
                this.learningHistory.playerUsesTraps = 
                    Math.min(0.95, this.learningHistory.playerUsesTraps + 0.1);
                break;
                
            case 'playerAttacked':
                // Track player aggression
                if (data && typeof data.attackedWith === 'number' && typeof data.couldAttackWith === 'number') {
                    const attackPercent = data.attackedWith / data.couldAttackWith;
                    this.learningHistory.playerAggression = 
                        this.learningHistory.playerAggression * 0.8 + attackPercent * 0.2;
                }
                break;
                
            case 'playerCreatedFusion':
                this.learningHistory.playerFusionPreference =
                    Math.min(0.95, this.learningHistory.playerFusionPreference + 0.1);
                break;
                
            case 'playerTargeting':
                if (data && data.targetedStrongest) {
                    this.learningHistory.playerTargetsStrongest = 
                        Math.min(0.95, this.learningHistory.playerTargetsStrongest + 0.1);
                } else if (data && !data.targetedStrongest) {
                    this.learningHistory.playerTargetsStrongest = 
                        Math.max(0.05, this.learningHistory.playerTargetsStrongest - 0.1);
                }
                break;
        }
    }
    
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
        // Update emotions at turn start
        this.updateEmotions();
        
        if (this.game && this.game.gameOver) return;

        console.debug('Bot.takeTurn: starting draw phase');
        await this.handleDrawPhase();
        if (this.game && this.game.gameOver) return;

        console.debug('Bot.takeTurn: starting setup phase');
        await this.handleSetupPhase();
        if (this.game && this.game.gameOver) return;

        console.debug('Bot.takeTurn: starting battle phase');
        await this.handleBattlePhase();
        if (this.game && this.game.gameOver) return;


        console.debug('Bot.takeTurn: starting end phase');
        await this.handleEndPhase();

        // Activate just-placed traps for bot at end of its End phase
        if (this.game && typeof this.game.activateJustPlacedTraps === 'function') {
            this.game.activateJustPlacedTraps(this.game.bot);
        }

        // End bot's turn
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
        await delay(1000);
    }

    /**
     * Handle bot's setup phase
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
            return; // No other actions after Joker
        }
        
        // Place traps first (strategic advantage)
        await this.placeTraps();
        
        // Create fusions if possible
        await this.createFusions();
        
        // Summon big monsters if possible
        await this.summonBigMonsters();
        
        // Summon normal monsters
        await this.summonNormalMonsters();
        
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
        
        // Sort attackers based on personality and emotion
        if (this.personality.aggression < 0.5 || this.emotion.fear > 0.7) {
            // Cautious or fearful bot attacks with weakest first to test the waters
            attackingMonsters.sort((a, b) => {
                const strengthA = a.isFusion ? a.fusionStrength : getCardNumericValue(a.value);
                const strengthB = b.isFusion ? b.fusionStrength : getCardNumericValue(b.value);
                return strengthA - strengthB; // Ascending (weakest first)
            });
        } else {
            // Aggressive bot attacks with strongest first
            attackingMonsters.sort((a, b) => {
                const strengthA = a.isFusion ? a.fusionStrength : getCardNumericValue(a.value);
                const strengthB = b.isFusion ? b.fusionStrength : getCardNumericValue(b.value);
                return strengthB - strengthA; // Descending (strongest first)
            });
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
        
        // Decide how many monsters to attack with based on personality and emotions
        let attackCount = attackingMonsters.length;
        
        // With lower aggression or higher fear, might hold back some monsters for defense
        const effectiveAggression = Math.max(0.2, 
            this.personality.aggression - (this.emotion.fear * 0.3)
        );
        
        // Personality and emotion-based decision on how many monsters to attack with
        if (Math.random() > effectiveAggression && attackingMonsters.length > 1) {
            // Hold some monsters back defensively
            attackCount = Math.max(1, Math.floor(attackingMonsters.length * effectiveAggression));
            
            // Maybe add "thinking time" for harder decisions
            if (this.skillLevel > 0.7) {
                await delay(300);
            }
        }
        
        // Add a random delay that simulates "thinking" time based on complexity
        const thinkTime = 300 + Math.floor(Math.random() * 700); // 300-1000ms
        await delay(thinkTime);
        
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
            
            // Human-like decision making for attacking when player has Ace trap
            let skipAttack = false;
            if (targets[0] === null && playerHasAceTrap) {
                // Calculate probability of skipping based on bot personality and experience
                const trapWariness = 0.3 + (this.learningHistory.playerUsesTraps * 0.5);
                const skipProbability = trapWariness * (1 - this.personality.riskTolerance);
                
                if (Math.random() < skipProbability) {
                    skipAttack = true;
                    this.game.ui.addLogMessage(`Bot hesitates to attack directly`);
                }
            }
            
            if (skipAttack) continue;
            
            // For monster targets, find optimal target with human-like decision making
            let targetIndex = null;
            
            if (targets[0] !== null) {
                // Get potential targets with human-like consideration
                targetIndex = this.findHumanLikeAttackTarget(monster, targets);
                
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
                        
                        // If the target is significantly stronger and the bot is skilled
                        // and not emotional, reconsider the attack
                        if (targetStrength > attackingStrength + 3 && 
                            this.skillLevel > 0.6 && 
                            this.emotion.frustration < 0.5 &&
                            this.emotion.fear < 0.7) {
                            
                            // Skip this attack and save the monster
                            this.game.ui.addLogMessage(`Bot decides not to attack with ${monster.value} - target too strong`);
                            continue;
                        }
                    }
                }
            } else {
                // Direct attack
                targetIndex = null;
            }
            
            // "Think" before attacking - variable delay based on difficulty
            const attackDelay = 300 + Math.floor(Math.random() * 500 * (1 - this.skillLevel));
            await delay(attackDelay);
            
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
            
            // Brief delay between attacks - vary based on personality
            const betweenAttackDelay = 400 + Math.floor(Math.random() * 300);
            await delay(betweenAttackDelay);
            
            // Occasionally, a frustrated bot might stop attacking early
            if (this.emotion.frustration > 0.7 && Math.random() < 0.3) {
                this.game.ui.addLogMessage('Bot stops attacking');
                break;
            }
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
     * Place traps during setup phase with human-like decision making
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
        
        // "Think" about trap placement
        await delay(300 + Math.random() * 400);
        
        // Decide how many traps to place based on personality
        let trapsToPlay = [...trapCards];
        
        // Only consider holding back if we have multiple traps and personality prefers it
        if (trapCards.length > 1) {
            // Calculate probability of holding back traps
            const holdbackProbability = 0.3 + (1 - this.personality.trapPreference) * 0.5;
            
            if (Math.random() < holdbackProbability) {
                // Decide how many to hold back
                const holdbackCount = Math.min(
                    trapCards.length - 1, // Keep at least one to play
                    1 + Math.floor(Math.random() * (1 - this.skillLevel) * 2) // More skill = fewer held back
                );
                
                if (holdbackCount > 0) {
                    // Prioritize which traps to hold
                    const trapsByPriority = [...trapCards];
                    
                    // Sort by strategic value for holding back
                    trapsByPriority.sort((a, b) => {
                        // Aces and Queens are more valuable to hold back for reactive plays
                        if (a.value === CARD_VALUES.ACE && b.value !== CARD_VALUES.ACE) return -1;
                        if (b.value === CARD_VALUES.ACE && a.value !== CARD_VALUES.ACE) return 1;
                        if (a.value === CARD_VALUES.QUEEN && b.value !== CARD_VALUES.QUEEN) return -1;
                        if (b.value === CARD_VALUES.QUEEN && a.value !== CARD_VALUES.QUEEN) return 1;
                        return 0;
                    });
                    
                    // Hold back the strategically valuable traps
                    const heldBackTraps = trapsByPriority.slice(0, holdbackCount);
                    trapsToPlay = trapCards.filter(card => !heldBackTraps.includes(card));
                }
            }
        }
        
        // Place traps with variable delays to simulate thinking
        for (const trapCard of trapsToPlay) {
            if (emptyTrapSpaces.length === 0) break;
            
            const spaceIndex = emptyTrapSpaces.shift();
            
            // Variable delay before placing each trap
            await delay(200 + Math.random() * 300);
            
            this.game.playTrapCard(trapCard, spaceIndex, true);
            this.game.ui.addLogMessage('Bot sets a trap');
            this.game.ui.updateGameState();
            
            // Brief delay between placements
            await delay(250 + Math.random() * 150);
        }
    }

    /**
     * Create fusions with human-like decision making
     */
    async createFusions() {
        // Get potential fusions
        const fusions = this.game.board.getPotentialFusions(this.game.bot);
        
        if (fusions.length === 0) return;
        
        // "Think" about fusion creation
        await delay(400 + Math.random() * 400);
        
        // Sort by fusion strength (descending) as the initial strategy
        fusions.sort((a, b) => b.fusionStrength - a.fusionStrength);
        
        // Human-like decision making: do we want to create a fusion?
        const fusionDesirability = Math.min(1, 
            this.personality.fusionPreference + 
            (this.emotion.fear * 0.3) + 
            (this.emotion.frustration * 0.2)
        );
        
        // Decide based on personality and game state
        if (Math.random() > fusionDesirability) {
            // Bot decides not to create a fusion this turn
            return;
        }
        
        // Evaluate board state for fusion strategy
        const boardAdvantage = this.evaluateBoardAdvantage();
        
        // Determine fusion approach
        let selectedFusion = fusions[0]; // Default to strongest
        
        // If bot is skilled and thinks more strategically
        if (this.skillLevel > 0.7) {
            // Consider fusion component values
            const fusionOptions = fusions.map(fusion => {
                // Calculate the "efficiency" of this fusion
                // Higher = better use of component monsters
                const m1Strength = getCardNumericValue(fusion.monster1.card.value);
                const m2Strength = getCardNumericValue(fusion.monster2.card.value);
                const componentTotal = m1Strength + m2Strength;
                const efficiency = fusion.fusionStrength / componentTotal;
                
                return {
                    fusion: fusion,
                    efficiency: efficiency,
                    componentTotal: componentTotal
                };
            });
            
            // Different strategies based on personality and game state
            if (boardAdvantage < -3 && this.emotion.fear > 0.6) {
                // Losing and afraid: prioritize highest raw strength
                selectedFusion = fusions[0]; // Already sorted by strength
            } else if (boardAdvantage > 3 && this.personality.riskTolerance > 0.6) {
                // Winning and risk-taking: maybe try a less efficient fusion
                // to preserve stronger monsters for later
                if (fusionOptions.length > 1 && Math.random() < 0.4) {
                    fusionOptions.sort((a, b) => a.componentTotal - b.componentTotal);
                    selectedFusion = fusionOptions[0].fusion;
                }
            } else {
                // Normal case: prefer efficient fusions
                if (Math.random() < 0.7) {
                    fusionOptions.sort((a, b) => b.efficiency - a.efficiency);
                    selectedFusion = fusionOptions[0].fusion;
                }
            }
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
        
        // Create fusion
        this.game.createFusion(
            selectedFusion.monster1.card,
            selectedFusion.monster2.card,
            targetSpace,
            true
        );
        
        this.game.ui.addLogMessage('Bot creates a fusion monster');
        this.game.ui.updateGameState();
        
        await delay(500);
        
        // Skilled bots might consider additional fusions
        if (this.skillLevel > 0.8 && fusions.length > 1 && Math.random() < 0.3) {
            // Get updated fusion possibilities after the first fusion
            const updatedFusions = this.game.board.getPotentialFusions(this.game.bot);
            if (updatedFusions.length > 0) {
                // Find space for another fusion
                targetSpace = -1;
                for (let i = 0; i < this.game.bot.monsterSpaces.length; i++) {
                    if (this.game.bot.monsterSpaces[i].card === null) {
                        targetSpace = i;
                        break;
                    }
                }
                
                if (targetSpace !== -1) {
                    await delay(700); // Longer think time for second fusion
                    
                    // Create another fusion
                    this.game.createFusion(
                        updatedFusions[0].monster1.card,
                        updatedFusions[0].monster2.card,
                        targetSpace,
                        true
                    );
                    
                    this.game.ui.addLogMessage('Bot creates another fusion monster');
                    this.game.ui.updateGameState();
                }
            }
        }
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
        
        // Sort by value (descending)
        bigMonsters.sort((a, b) => 
            getCardNumericValue(b.value) - getCardNumericValue(a.value)
        );
        
        // Find empty monster spaces
        const emptyMonsterSpaces = this.game.bot.monsterSpaces
            .map((space, index) => space.card === null ? index : -1)
            .filter(index => index !== -1);
        
        // If no empty spaces, we'll need to sacrifice field monsters to make room
        const hasEmptySpaces = emptyMonsterSpaces.length > 0;
        
        console.log(`Bot: Empty spaces: ${emptyMonsterSpaces.length}, hasEmptySpaces: ${hasEmptySpaces}`);
        
        // Try to summon each big monster
        for (const monster of bigMonsters) {
            const requiredValue = getRequiredSacrificeValue(monster);
            const sacrifices = this.selectSacrificesForBigMonster(requiredValue, !hasEmptySpaces);
            
            console.log(`Bot: Attempting to summon ${monster.value} (requires ${requiredValue})`);
            console.log(`Bot: Found ${sacrifices.length} sacrifices with total value ${getTotalCardValue(sacrifices)}`);
            
            if (sacrifices.length === 0) {
                console.log(`Bot: No valid sacrifices found for ${monster.value}`);
                continue;
            }
            
            const totalValue = getTotalCardValue(sacrifices);
            if (totalValue < requiredValue) {
                console.log(`Bot: Insufficient sacrifice value (${totalValue} < ${requiredValue})`);
                continue;
            }
            
            let targetSpace = null;
            
            if (hasEmptySpaces && emptyMonsterSpaces.length > 0) {
                // Use an empty space if available
                targetSpace = emptyMonsterSpaces.shift();
            } else {
                // No empty spaces - find a field monster that's being sacrificed
                for (let i = 0; i < this.game.bot.monsterSpaces.length; i++) {
                    const space = this.game.bot.monsterSpaces[i];
                    if (space.card && sacrifices.find(s => s.id === space.card.id)) {
                        targetSpace = i;
                        break;
                    }
                }
                
                // If no field monster is being sacrificed, we can't summon
                if (targetSpace === null) continue;
            }
            
            // Summon the monster (use playBigMonster if available, otherwise fallback)
            // Logging will be handled by playBigMonster
            if (this.game && typeof this.game.playBigMonster === 'function') {
                this.game.playBigMonster(monster, targetSpace, sacrifices, true);
            } else {
                // Fallback: perform sacrifices and then play the monster
                if (sacrifices && sacrifices.length > 0 && typeof this.game.bot.sacrificeCards === 'function') {
                    this.game.bot.sacrificeCards(sacrifices, this.game.deck);
                }
                if (this.game && typeof this.game.playMonsterCard === 'function') {
                    this.game.playMonsterCard(monster, targetSpace, true);
                }
            }
            
            this.game.ui.updateGameState();
            
            await delay(500);
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
        
        // "Think" about monster placement
        await delay(300 + Math.random() * 300);
        
        // Sort monsters - the method depends on personality and game state
        let sortedMonsters = [...normalMonsters];
        
        // Evaluate board state
        const boardAdvantage = this.evaluateBoardAdvantage();
        
        if (this.personality.aggression > 0.7 || boardAdvantage < -5) {
            // Aggressive personality or losing badly: play strongest monsters first
            sortedMonsters.sort((a, b) => 
                getCardNumericValue(b.value) - getCardNumericValue(a.value)
            );
        } else if (this.emotion.fear > 0.6 && boardAdvantage > 0) {
            // Fearful and ahead: be cautious, may hold back stronger monsters
            if (Math.random() < this.emotion.fear) {
                sortedMonsters.sort((a, b) => 
                    getCardNumericValue(a.value) - getCardNumericValue(b.value)
                );
            }
        } else {
            // Default sort by value (descending)
            sortedMonsters.sort((a, b) => 
                getCardNumericValue(b.value) - getCardNumericValue(a.value)
            );
            
            // Sometimes slightly randomize order for less predictable play
            if (Math.random() < 0.3) {
                // Slightly shuffle the order
                for (let i = 0; i < sortedMonsters.length - 1; i++) {
                    if (Math.random() < 0.3) {
                        const temp = sortedMonsters[i];
                        sortedMonsters[i] = sortedMonsters[i+1];
                        sortedMonsters[i+1] = temp;
                    }
                }
            }
        }
        
        // Find empty monster spaces
        const emptyMonsterSpaces = this.game.bot.monsterSpaces
            .map((space, index) => space.card === null ? index : -1)
            .filter(index => index !== -1);
        
        // Decide how many monsters to summon based on personality
        const monstersToSummon = Math.min(
            emptyMonsterSpaces.length,
            sortedMonsters.length
        );
        
        // Cautious or high skill bots might hold back some monsters
        let actualSummonCount = monstersToSummon;
        
        // Consider holding back monsters based on personality, skill, and game state
        if (this.personality.riskTolerance < 0.5 && this.skillLevel > 0.6 && sortedMonsters.length > 1) {
            // Calculate probability of holding back monsters
            const holdbackProbability = (1 - this.personality.aggression) * 0.6;
            
            if (Math.random() < holdbackProbability) {
                // Hold back at least one monster for future plays
                actualSummonCount = Math.max(1, actualSummonCount - 1);
            }
        }
        
        // Summon monsters with variable delays
        for (let i = 0; i < actualSummonCount; i++) {
            if (i >= sortedMonsters.length || i >= emptyMonsterSpaces.length) break;
            
            const monster = sortedMonsters[i];
            const targetSpace = emptyMonsterSpaces[i];
            
            // Variable "thinking" delay
            await delay(250 + Math.random() * 250);
            
            // Logging will be handled by playMonsterCard
            this.game.playMonsterCard(monster, targetSpace, true);
            
            this.game.ui.updateGameState();
            
            await delay(300);
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
     * Select sacrifices for big monster
     * @param {number} requiredValue - Required sacrifice value
     * @param {boolean} preferFieldSacrifice - Whether to prefer sacrificing field monsters
     * @returns {Array} - Selected sacrifices
     */
    selectSacrificesForBigMonster(requiredValue, preferFieldSacrifice = false) {
        const sacrificeCandidates = [];
        
        // Add monsters from field (non-fusion)
        this.game.bot.monsterSpaces.forEach(space => {
            if (space.card && !space.card.isFusion) {
                sacrificeCandidates.push(space.card);
            }
        });
        
        // Add cards from hand (except big monsters and traps)
        this.game.bot.hand.forEach(card => {
            const cardType = getCardType(card.value);
            if (cardType !== CARD_TYPES.MONSTER_BIG && 
                cardType !== CARD_TYPES.TRAP &&
                card.value !== CARD_VALUES.JOKER) {
                sacrificeCandidates.push(card);
            }
        });
        
        if (sacrificeCandidates.length === 0) return [];
        
        // Sort candidates by value (descending) for optimal selection
        sacrificeCandidates.sort((a, b) => 
            getCardNumericValue(b.value) - getCardNumericValue(a.value)
        );
        
        // Try to find the most efficient 2-card combination first
        let bestCombination = null;
        let bestWaste = Infinity;
        
        for (let i = 0; i < sacrificeCandidates.length; i++) {
            const val1 = getCardNumericValue(sacrificeCandidates[i].value);
            for (let j = i + 1; j < sacrificeCandidates.length; j++) {
                const val2 = getCardNumericValue(sacrificeCandidates[j].value);
                const total = val1 + val2;
                
                if (total >= requiredValue) {
                    const waste = total - requiredValue;
                    
                    // Check if this combination satisfies field sacrifice requirement
                    if (preferFieldSacrifice) {
                        const hasField = this.game.bot.monsterSpaces.some(space => 
                            space.card && (space.card.id === sacrificeCandidates[i].id || space.card.id === sacrificeCandidates[j].id)
                        );
                        if (!hasField) continue; // Skip if no field card included
                    }
                    
                    if (waste < bestWaste) {
                        bestWaste = waste;
                        bestCombination = [sacrificeCandidates[i], sacrificeCandidates[j]];
                    }
                }
            }
        }
        
        // If we found a good 2-card combination, use it
        if (bestCombination) {
            return bestCombination;
        }
        
        // Otherwise, use greedy approach (minimum cards needed)
        const selected = [];
        let currentValue = 0;
        
        for (const card of sacrificeCandidates) {
            const cardValue = getCardNumericValue(card.value);
            selected.push(card);
            currentValue += cardValue;
            
            if (currentValue >= requiredValue) {
                // Check field sacrifice requirement
                if (preferFieldSacrifice) {
                    const hasField = selected.some(c => 
                        this.game.bot.monsterSpaces.some(space => space.card && space.card.id === c.id)
                    );
                    if (hasField) {
                        break;
                    }
                    // Continue to find a combination with a field card
                } else {
                    break;
                }
            }
        }
        
        // Verify we have enough value
        const totalValue = selected.reduce((sum, card) => sum + getCardNumericValue(card.value), 0);
        if (totalValue < requiredValue) {
            return [];
        }
        
        // Verify field sacrifice requirement if needed
        if (preferFieldSacrifice) {
            const hasField = selected.some(c => 
                this.game.bot.monsterSpaces.some(space => space.card && space.card.id === c.id)
            );
            if (!hasField) {
                return [];
            }
        }
        
        return selected;
    }

    /**
     * Select cards for fusion upkeep with human-like decision making
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
        
        // Human-like strategic evaluation
        upkeepCandidates.forEach(candidate => {
            let value = candidate.strength;
            
            // Adjust value based on location
            if (candidate.location === 'field') {
                // Field monsters are more valuable (already providing board presence)
                value += 2;
                
                // Attacked this turn means already provided value
                if (candidate.card.attackedThisTurn) {
                    value -= 1.5;
                }
            }
            
            // Big monsters are more valuable
            if (candidate.type === CARD_TYPES.MONSTER_BIG) {
                value += 3;
            }
            
            candidate.strategicValue = value;
        });
        
        // Apply personality and emotion to the decision
        let sortedCandidates = [...upkeepCandidates];
        
        if (this.skillLevel > 0.7) {
            // Skilled bots make more strategic decisions
            
            // Consider board presence
            const playerMonsterCount = this.game.player.getMonsterCount();
            const botMonsterCount = this.game.bot.getMonsterCount();
            const boardDisadvantage = playerMonsterCount - botMonsterCount;
            
            if (boardDisadvantage > 0) {
                // Losing board presence: prefer sacrificing hand cards over field
                sortedCandidates.forEach(candidate => {
                    if (candidate.location === 'field') {
                        candidate.strategicValue += 2 * boardDisadvantage;
                    }
                });
            }
            
            // Consider whether hand has potential future plays
            const handHasHighValue = this.game.bot.hand.some(card => 
                getCardNumericValue(card.value) >= 8 || 
                getCardType(card.value) === CARD_TYPES.TRAP
            );
            
            if (handHasHighValue) {
                // Hand has good future plays: prefer sacrificing field
                sortedCandidates.forEach(candidate => {
                    if (candidate.location === 'field' && candidate.strength < 8) {
                        candidate.strategicValue -= 1;
                    }
                });
            }
        }
        
        // Sort by strategic value (lowest first = best to sacrifice)
        sortedCandidates.sort((a, b) => a.strategicValue - b.strategicValue);
        
        // Apply some randomness for human-like behavior
        if (this.personality.volatility && Math.random() < this.personality.volatility) {
            // Swap a couple of candidates to be less predictable
            if (sortedCandidates.length > 3) {
                const idxA = Math.floor(Math.random() * 3);
                const idxB = Math.floor(Math.random() * 3) + 1;
                if (idxA !== idxB) {
                    const temp = sortedCandidates[idxA];
                    sortedCandidates[idxA] = sortedCandidates[idxB];
                    sortedCandidates[idxB] = temp;
                }
            }
        }
        
        // Select cards for upkeep
        return sortedCandidates.slice(0, count).map(candidate => candidate.card);
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
        
        // Calculate advantage for each target
        const targetAdvantages = [];
        
        for (const targetIndex of targets) {
            // Handle direct attack option
            if (targetIndex === null || targetIndex === undefined) {
                // Direct attack is always tempting - give it a base score
                // Increase temptation based on aggression and confidence
                const directAttackScore = 5 + 
                    (this.personality.aggression * 10) + 
                    (this.emotion.confidence * 5);
                
                targetAdvantages.push({
                    index: null,
                    advantage: directAttackScore,
                    directAttack: true
                });
                continue;
            }

            const targetSpace = this.game.player.monsterSpaces[targetIndex];
            if (!targetSpace || !targetSpace.card) continue;

            const targetCard = targetSpace.card;
            const targetStrength = targetCard.isFusion ? 
                targetCard.fusionStrength : 
                getCardNumericValue(targetCard.value);

            const advantage = attackingStrength - targetStrength;
            
            // Don't attack monsters that are significantly stronger (safety threshold)
            // Skip targets that would cause the bot to lose more than 4 points of strength
            // This check happens BEFORE bonuses to prevent emotional/personality modifiers from
            // making objectively terrible attacks seem acceptable
            const desperationFactor = this.emotion.frustration > 0.8 || this.emotion.fear > 0.8;
            const extremeThreat = targetCard.isFusion && targetStrength > 10;
            
            if (advantage < -4) {
                // Only consider such a disadvantageous attack if the bot is desperate
                // or the target is extremely threatening
                if (!desperationFactor && !extremeThreat) {
                    continue; // Skip this unfavorable target
                }
            }
            
            // Human-like targeting factors:
            let adjustedAdvantage = advantage;
            
            // Extra weight to destroying fusions (they're threatening)
            if (targetCard.isFusion) {
                // Scale fusion bonus based on its strength
                const fusionBonus = Math.min(3, targetStrength / 3);
                adjustedAdvantage += fusionBonus;
            }
            
            // Consider targeting potentially dangerous cards even at a disadvantage
            const highValueTarget = targetStrength > 8;
            if (highValueTarget) {
                adjustedAdvantage += 1.5;
            }
            
            // If bot is aggressive, it values destroying monsters more
            if (this.personality.aggression > 0.7) {
                // But don't be overly aggressive against stronger monsters
                const aggressionBonus = advantage > 0 ? 2 : 1;
                adjustedAdvantage += aggressionBonus;
            }
            
            // If bot is fearful, it prioritizes removing threats
            if (this.emotion.fear > 0.6 && targetStrength > 6) {
                // Scale fear-based targeting by the target's strength
                const fearBonus = Math.min(2.5, targetStrength / 4);
                adjustedAdvantage += fearBonus;
            }
            
            // Final safety check: Even with all bonuses applied, don't attack if the raw advantage
            // is worse than -3 unless we're desperate or it's an extreme threat
            // This prevents emotional/personality bonuses from overriding basic survival logic
            if (advantage < -3 && !desperationFactor && !extremeThreat) {
                // Only allow this attack if the adjusted advantage is significantly positive (>2)
                // meaning the bonuses are strong enough to justify the risk
                if (adjustedAdvantage <= 2) {
                    continue; // Skip - the bonuses aren't enough to justify this bad trade
                }
            }
            
            targetAdvantages.push({
                index: targetIndex,
                advantage: adjustedAdvantage,
                rawAdvantage: advantage,
                strength: targetStrength,
                isFusion: targetCard.isFusion
            });
        }
        
        // No valid targets
        if (targetAdvantages.length === 0) return null;
        
        // Sort by advantage (descending)
        targetAdvantages.sort((a, b) => b.advantage - a.advantage);
        
        // If direct attack is the best option by our logic, evaluate whether to take it
        if (targetAdvantages[0].directAttack) {
            // Human-like considerations for direct attacks
            const directAttackBias = this.personality.aggression - this.emotion.fear;
            
            // Emotional/personality-based chance to choose direct attack
            if (Math.random() < directAttackBias) {
                return null; // Direct attack
            } else if (targetAdvantages.length > 1) {
                // Skip direct attack, use next best option
                return targetAdvantages[1].index;
            }
            return null; // Default to direct if it's the only option
        }
        
        // Human-like decision making:
        // 1. If we're feeling cautious/afraid, prefer safe targets
        const cautionFactor = this.emotion.fear;
        
        // 2. If frustrated, might make worse decisions, but with limits
        const frustrationRandom = Math.min(0.4, this.emotion.frustration * 0.5);
        
        // If no targets have a positive advantage, prefer direct attack
        const allNegativeAdvantages = targetAdvantages.every(target => 
            !target.directAttack && target.rawAdvantage < 0);
        
        if (allNegativeAdvantages && targetAdvantages.some(target => target.directAttack)) {
            // Find the direct attack option
            const directAttack = targetAdvantages.find(target => target.directAttack);
            if (directAttack) {
                return directAttack.index; // Return null for direct attack
            }
        }
        
        // Sort by advantage for better decision making
        targetAdvantages.sort((a, b) => b.advantage - a.advantage);
        
        // Sometimes make a suboptimal choice when options are close
        // or when emotions are running high, but limit bad decisions
        if (targetAdvantages.length > 1) {
            const topChoice = targetAdvantages[0];
            const secondChoice = targetAdvantages[1];
            
            // Only consider the second choice if it's not catastrophically worse
            const choicesAreClose = Math.abs(topChoice.advantage - secondChoice.advantage) < 3;
            
            if (choicesAreClose && (Math.random() < 0.25 + frustrationRandom)) {
                // Make sure we never pick a highly disadvantageous attack when a better option exists
                if (!secondChoice.directAttack && secondChoice.rawAdvantage < -3 && topChoice.rawAdvantage > 0) {
                    return topChoice.index;
                }
                
                return secondChoice.index;
            }
        }
        
        // Default to best choice
        return targetAdvantages[0]?.index ?? null;
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
        const thinkTime = 300 + Math.floor(Math.random() * 700);
        await delay(thinkTime);
        
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
                
                // Adjust based on personality and emotions
                useAceProbability += (this.emotion.fear * 0.2); // Fear increases usage
                useAceProbability -= (this.personality.riskTolerance * 0.15); // Risk takers save traps
                
                // Apply skill level - higher skill = more strategic usage
                const skillAdjustment = (this.skillLevel - 0.5) * 0.2; // -0.1 to +0.1
                useAceProbability += skillAdjustment;
                
                // Make the decision
                if (Math.random() < useAceProbability) {
                    this.game.ui.addLogMessage('Bot activates Ace trap!');
                    const res = this.game.activateAceTrap(aceTraps[0], true);
                    this.recordTrapActivation(aceTraps[0], true);
                    return res;
                } else if (resumeFunction) {
                    resumeFunction();
                    return;
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
        
        // Evaluate King trap option
        const kingTraps = activatableTraps.filter(trap => trap.value === CARD_VALUES.KING);
        if (kingTraps.length > 0 && targetIndex !== null) {
            const targetCard = this.game.bot.monsterSpaces[targetIndex].card;
            if (targetCard) {
                const targetStrength = targetCard.isFusion ? 
                    targetCard.fusionStrength : 
                    getCardNumericValue(targetCard.value);
                
                const normalDifference = attackingStrength - targetStrength;
                const halvedStrength = applyKingEffect(attackingStrength);
                const halvedDifference = halvedStrength - targetStrength;
                
                const improvement = normalDifference - halvedDifference;
                
                // Add to options
                trapOptions.push({
                    trap: kingTraps[0],
                    type: 'KING',
                    value: improvement,
                    savesBotMonster: halvedDifference <= 0 && normalDifference > 0
                });
                
                // Track optimal
                if (improvement > optimalTrapValue) {
                    optimalTrap = kingTraps[0];
                    optimalTrapValue = improvement;
                    optimalTarget = null; // King doesn't need target
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
                    
                    // Base advantage for player infighting
                    advantage = 50;
                    
                    // Bonus if player's stronger monster attacks player's weaker monster
                    if (attackingStrength > targetStrength) {
                        advantage += 20; // Favorable trade for bot
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
                    
                    // Value difference between original target and redirect target
                    const valueDifference = originalTargetValue - targetStrength;
                    
                    // Strength difference (positive = redirect target survives)
                    const strengthDifference = targetStrength - attackingStrength;
                    
                    // Calculate advantage based on both factors
                    if (strengthDifference >= 0) {
                        // Redirect target survives - good if we're saving something more valuable
                        advantage = valueDifference + strengthDifference;
                    } else {
                        // Both monsters die - good if we're trading up in value
                        advantage = valueDifference;
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
        if (optimalTrapValue < 5 && targetIndex !== null) {
            // Calculate probability of saving the trap based on personality
            const saveTrapProbability = 0.3 + (this.personality.riskTolerance * 0.4);
            
            if (Math.random() < saveTrapProbability) {
                if (resumeFunction) resumeFunction();
                return;
            }
        }
        
        // Human-like decision making
        let selectedTrap = null;
        let selectedTarget = null;
        
        if (trapOptions.length === 0) {
            // No viable options
            if (resumeFunction) resumeFunction();
            return;
        }
        
        // Apply personality and emotion to trap selection
        trapOptions.forEach(option => {
            // Adjust value based on personality and emotions
            let adjustedValue = option.value;
            
            // Fearful bots value saving their monsters more
            if (option.type === 'KING' && option.savesBotMonster) {
                adjustedValue += (this.emotion.fear * 5);
            }
            
            // Aggressive bots prefer Jack redirects to player monsters
            if (option.type === 'JACK' && option.redirectsToPlayer) {
                adjustedValue += (this.personality.aggression * 3);
            }
            
            option.adjustedValue = adjustedValue;
        });
        
        // Sort by adjusted value
        trapOptions.sort((a, b) => b.adjustedValue - a.adjustedValue);
        
        // Make a human-like decision
        if (trapOptions.length === 1 || Math.random() < this.skillLevel) {
            // Choose the best option
            selectedTrap = trapOptions[0].trap;
            selectedTarget = trapOptions[0].target;
        } else {
            // Make a sub-optimal choice
            const randomIndex = Math.floor(Math.random() * Math.min(2, trapOptions.length));
            selectedTrap = trapOptions[randomIndex].trap;
            selectedTarget = trapOptions[randomIndex].target;
        }
        
        // Use the selected trap
        if (selectedTrap) {
            if (selectedTrap.value === CARD_VALUES.KING) {
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
                this.game.ui.addLogMessage('Bot activates Jack trap!');
                const res = this.game.activateJackTrap(
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
        // Bot considerations for Joker:
        // 1. If bot is behind in board presence
        const playerMonsterCount = this.game.player.getMonsterCount();
        const botMonsterCount = this.game.bot.getMonsterCount();
        
        // 2. If bot is behind in health
        const healthDifference = this.game.bot.health - this.game.player.health;
        
        // 3. If player has strong monsters or fusions
        let playerHasStrongMonsters = false;
        let strongestPlayerMonster = 0;
        
        for (const space of this.game.player.monsterSpaces) {
            if (space.card) {
                const strength = space.card.isFusion ? 
                    space.card.fusionStrength : 
                    getCardNumericValue(space.card.value);
                
                strongestPlayerMonster = Math.max(strongestPlayerMonster, strength);
                
                if (strength >= 8) {
                    playerHasStrongMonsters = true;
                }
            }
        }
        
        // Calculate base probability based on game state
        let baseJokerProbability = 0.3; // Base chance
        
        // Adjust based on game state
        if (playerMonsterCount > botMonsterCount + 1) {
            baseJokerProbability += 0.3; // Behind in board presence
        }
        
        if (playerHasStrongMonsters) {
            baseJokerProbability += 0.25; // Player has strong monsters
        }
        
        if (healthDifference < -10) {
            baseJokerProbability += 0.2; // Behind in health
        }
        
        // Adjust for personality and emotions
        // Risk-takers are more likely to save Joker for later
        baseJokerProbability -= (this.personality.riskTolerance * 0.2);
        
        // Fearful bots are more likely to use Joker defensively
        baseJokerProbability += (this.emotion.fear * 0.3);
        
        // Frustrated bots might use Joker as a desperate move
        baseJokerProbability += (this.emotion.frustration * 0.3);
        
        // For skilled players, adjust for game state more carefully
        if (this.skillLevel > 0.7) {
            // Consider if player might be setting up for something big
            const playerHandSize = this.game.player.hand.length;
            if (playerHandSize >= 4) {
                baseJokerProbability += 0.15; // Player might be planning something
            }
            
            // Consider if we're close to winning
            if (this.game.player.health <= 10 && this.game.bot.health > this.game.player.health) {
                baseJokerProbability -= 0.2; // Might not need Joker to win
            }
        }
        
        // Add a bit of randomness
        baseJokerProbability += (Math.random() * 0.2 - 0.1);
        
        // Clamp to valid probability range
        baseJokerProbability = Math.max(0, Math.min(1, baseJokerProbability));
        
        // Make the decision
        return Math.random() < baseJokerProbability;
    }

    /**
     * Check if player has an active trap of a specific type with human-like consideration
     * @param {string} trapValue - Trap value to check for
     * @returns {boolean} - Whether player has that trap type (with consideration)
     */
    playerHasActiveTrapType(trapValue) {
        // Check if player actually has this trap
        const hasTrap = this.playerHasActiveTrapOfType(trapValue);
        
        if (!hasTrap) return false;
        
        // Consider bot's personality and learning in reacting to player traps
        // Higher values = more cautious about traps
        const trapWariness = 0.3 + (this.learningHistory.playerUsesTraps * 0.6);
        
        // Apply skill level - higher skill = more accurate assessment
        const effectiveWariness = trapWariness * this.skillLevel;
        
        // Factor in emotional state - fearful bots are more wary of traps
        const emotionalFactor = 1 + (this.emotion.fear * 0.5);
        
        // Recent activations of this trap type increase wariness
        const recentActivations = this.gameMemory.trapActivations
            .filter(mem => 
                mem.trapType === trapValue && 
                mem.success && 
                this.game.turnCounter - mem.turn < 3);
                
        const historyFactor = recentActivations.length * 0.2;
        
        // Calculate final probability of considering the trap
        const considerTrapProb = Math.min(0.95, 
            effectiveWariness * emotionalFactor + historyFactor
        );
        
        // Return true if bot decides to consider this trap
        return Math.random() < considerTrapProb;
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
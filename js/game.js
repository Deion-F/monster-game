/*
 * game.js
 * Main Game controller - single-file clean implementation
 */
class Game {
    constructor() {
        this.deck = new Deck();
        this.player = new Player(PLAYER_TYPES.HUMAN, 'Player');
        this.bot = new Player(PLAYER_TYPES.BOT, 'Bot');
        this.board = new Board(this.player, this.bot, this.deck);
        this.ui = new UI(this);
        this.botPlayer = new Bot(this);

        this.currentPhase = PHASES.DRAW;
        this.currentPlayer = this.player; // player starts
        this.turnCounter = 1;
    this.firstPlayer = this.player; // track who went first

        this.gameOver = false;

        this.jokerPlayedThisTurn = false;
        this.botThinkingEnabled = true;
        this.battlePhaseEnded = false; // Flag to indicate if Ace trap ended the battle phase
        this.turnForcefullyEnded = false; // Flag to indicate if turn was ended by Ace trap

        // Don't draw starting hands here - they will be drawn in startTurn() 
        // to avoid duplicate draw messages

        // Ensure UI initialized
        if (this.ui && typeof this.ui.initialize === 'function') this.ui.initialize();
    }

    startNewGame(playerName, difficulty) {
        // Preserve name if provided
        if (playerName) this.player.name = playerName;
        if (this.botPlayer) this.botPlayer.difficulty = difficulty || (this.botPlayer.difficulty || 'medium');

        // Reset deck/board/players while keeping player name
        this.deck = new Deck();
        this.player = new Player(PLAYER_TYPES.HUMAN, this.player.name || 'Player');
        this.bot = new Player(PLAYER_TYPES.BOT, 'Bot');
        this.board = new Board(this.player, this.bot, this.deck);
        this.ui = new UI(this);
        this.botPlayer = new Bot(this);

        this.currentPhase = PHASES.DRAW;
        this.currentPlayer = this.player;
        this.turnCounter = 1;
        this.firstTurnRestriction = true;

        // Don't draw starting hands here - they will be drawn in startTurn()
        // to avoid duplicate draw messages

        this.ui.initialize();
        this.ui.updateGameState();
        this.ui.updateTurnAndPhase();
    }

    startTurn() {
        if (this.gameOver) return;

        this.jokerPlayedThisTurn = false;
        this.battlePhaseEnded = false; // Reset battle phase ended flag for new turn
        this.turnForcefullyEnded = false; // Reset forceful end flag for new turn
        if (!this.currentPlayer) this.currentPlayer = this.player;

        if (typeof this.currentPlayer.resetForNewTurn === 'function') {
            this.currentPlayer.resetForNewTurn();
        }

        this.currentPhase = PHASES.DRAW;
        this.handleDrawPhase();
    }

    handleDrawPhase() {
        const drawCount = (this.currentPlayer.hand.length === 0) ? 5 : 1;
        const drawn = this.currentPlayer.drawCards(this.deck, drawCount) || [];
        this.ui.addLogMessage(`${this.currentPlayer.name} draws ${drawn.length} card(s)`);

        if (this.currentPlayer.hand.length > GAME_SETTINGS.MAX_HAND_SIZE) {
            const excess = this.currentPlayer.hand.length - GAME_SETTINGS.MAX_HAND_SIZE;
            if (this.currentPlayer === this.player) {
                this.ui.showDiscardDialog(excess);
            } else {
                const toDiscard = this.botPlayer.selectCardsToDiscard(excess) || [];
                if (typeof this.bot.discardDownToLimit === 'function') {
                    this.bot.discardDownToLimit(toDiscard, this.deck);
                }
                this.ui.addLogMessage(`Bot discards ${excess} card(s)`);
            }
        }

        // Update UI and transition to setup
        this.ui.updateGameState();
        this.currentPhase = PHASES.SETUP;
        this.ui.updateTurnAndPhase();

        if (this.currentPlayer === this.bot && this.botThinkingEnabled) {
            setTimeout(() => this.botPlayer.takeTurn(), 600);
        }
    }

    endCurrentPhase() {
        // Only allow player to advance phases via UI shortcuts
        if (this.currentPlayer !== this.player) return;

        switch (this.currentPhase) {
            case PHASES.SETUP:
                this.ui.addLogMessage(`${this.currentPlayer.name} ended Setup phase`);
                // If the current player played a Joker this turn, skip their battle phase
                if (this.currentPlayer && this.currentPlayer.skipBattleThisTurn) {
                    this.ui.addLogMessage(`${this.currentPlayer.name}'s Battle phase is skipped due to Joker`);
                    // Clear the flag and go straight to END phase
                    this.currentPlayer.skipBattleThisTurn = false;
                    this.currentPhase = PHASES.END;
                    // Reset attacked flags when battle phase ends so monsters become active again visually
                    this.resetAttackedFlags();
                    if (typeof this.activateJustPlacedTraps === 'function') this.activateJustPlacedTraps(this.currentPlayer);
                    this.handleEndPhase();
                    return;
                } else {
                    this.currentPhase = PHASES.BATTLE;
                }
                break;
            case PHASES.BATTLE:
                this.ui.addLogMessage(`${this.currentPlayer.name} ended Battle phase`);
                this.currentPhase = PHASES.END;
                // Reset attacked flags when battle phase ends so monsters become active again visually
                this.resetAttackedFlags();
                // Clear king-weakened flags from all monsters (they only last until end of battle)
                [this.player, this.bot].forEach(p => {
                    p.monsterSpaces.forEach(space => {
                        if (space.card && space.card.kingWeakened) space.card.kingWeakened = false;
                    });
                });
                // Activate just-placed traps for the current player at the end of battle phase as part of end-phase processing
                if (typeof this.activateJustPlacedTraps === 'function') this.activateJustPlacedTraps(this.currentPlayer);
                this.handleEndPhase();
                return;
            case PHASES.END:
                this.ui.addLogMessage(`${this.currentPlayer.name} ended their turn`);
                this.endTurn();
                return;
        }

        this.ui.updateTurnAndPhase();
        this.ui.updateBoard();
    }

    endTurn() {
        this.currentPlayer = (this.currentPlayer === this.player) ? this.bot : this.player;
        this.turnCounter++;
        // turnCounter increments; attack restrictions are evaluated inline based on turnCounter and firstPlayer
        this.startTurn();
    }

    handleEndPhase() {
        const fusionCount = (this.board && typeof this.board.countActiveFusions === 'function') ? this.board.countActiveFusions(this.currentPlayer) : 0;
        if (fusionCount > 0) {
            if (this.currentPlayer === this.player) {
                this.ui.showFusionUpkeepDialog(fusionCount);
            } else {
                const sacrifices = this.botPlayer.selectCardsForFusionUpkeep(fusionCount) || [];
                this.handleFusionUpkeep(sacrifices, true);
            }
        } else {
            // No fusions to upkeep — update UI and automatically progress past End phase.
            if (this.ui) this.ui.updateGameState();
            // Short delay to allow the player to see the End phase UI before the turn advances
            setTimeout(() => {
                // Only advance if still in END phase and same player (guard against races)
                if (this.currentPhase === PHASES.END) {
                    this.endTurn();
                }
            }, 800);
        }
    }

    /**
     * Activate traps that were just placed for a player (make them active immediately at the end of their End phase)
     * @param {Player} player
     */
    activateJustPlacedTraps(player) {
        if (!player) return;
        for (const space of player.trapSpaces) {
            if (space.card && space.card.justPlaced) {
                space.card.justPlaced = false;
                space.card.active = true;
            }
        }
        if (this.ui) this.ui.updateGameState();
    }

    handleFusionUpkeep(sacrificeCards, isBot = false) {
        const player = isBot ? this.bot : this.player;
        const need = (this.board && typeof this.board.countActiveFusions === 'function') ? this.board.countActiveFusions(player) : 0;
        if (!sacrificeCards) sacrificeCards = [];

        if (sacrificeCards.length < need) {
            if (this.board && typeof this.board.breakFusions === 'function') {
                this.board.breakFusions(player, sacrificeCards.length);
            }
            this.ui.addLogMessage(`${player.name} couldn't pay all fusion upkeep`);
        } else {
            if (typeof player.sacrificeCards === 'function') player.sacrificeCards(sacrificeCards, this.deck);
            this.ui.addLogMessage(`${player.name} pays fusion upkeep`);
        }
        this.ui.updateGameState();
    }

    playMonsterCard(card, spaceIndex, isBot = false) {
        const player = isBot ? this.bot : this.player;
        const res = (typeof player.playCard === 'function') ? player.playCard(card, spaceIndex) : { success: false };
        if (res && res.success) {
            this.ui.addLogMessage(`${player.name} summons ${card.value}`);
            this.ui.updateGameState();
        }
        return res && res.success;
    }

    playTrapCard(card, spaceIndex, isBot = false) {
        const player = isBot ? this.bot : this.player;
        const opponent = isBot ? this.player : this.bot;
        
        // Player API uses playCard for both monsters and traps
        const res = (typeof player.playCard === 'function') ? player.playCard(card, spaceIndex) : { success: false };
        if (res && res.success) {
            this.ui.addLogMessage(`${player.name} sets a trap`);
            this.ui.updateGameState();
            
            // After a trap is set, give the opponent a chance to react (e.g., with a Queen)
            if (isBot && opponent === this.player && this.ui && typeof this.ui.promptTrapResponse === 'function') {
                const trapContext = { trapValue: card.value, trapCard: card, attacker: player, defender: opponent };
                this.ui.promptTrapResponse(trapContext).catch(err => {
                    console.warn('Trap response prompt error (non-critical)', err);
                });
            }
        }
        return res && res.success;
    }

    /**
     * Play Joker: powerful reset effect.
     * Resets board, discards current hands/field, returns discards to deck, and deals fresh hands.
     * @param {Card} card - Joker card being played
     * @param {boolean} isBot - whether the joker was played by bot
     */
    playJoker(card, isBot = false) {
        const player = isBot ? this.bot : this.player;

        // Remove the Joker from player's hand if present
        const idx = player.hand.findIndex(c => c.id === card.id);
        if (idx !== -1) {
            player.hand.splice(idx, 1);
        }

    // Mark that this player played a joker this turn so their upcoming battle phase should be skipped
    player.skipBattleThisTurn = true;
    this.jokerPlayedThisTurn = true;

        // Discard all cards on field for both players
        const allFieldCards = [];
        [this.player, this.bot].forEach(p => {
            p.monsterSpaces.forEach(space => {
                if (space.card) {
                    allFieldCards.push(space.card);
                    space.card = null;
                }
            });
            p.trapSpaces.forEach(space => {
                if (space.card) {
                    allFieldCards.push(space.card);
                    space.card = null;
                }
            });
        });

        // Discard hands (except jokers already removed)
        [this.player, this.bot].forEach(p => {
            while (p.hand.length > 0) {
                const c = p.hand.pop();
                // Skip if it's the card we already removed
                if (c.id === card.id) continue;
                allFieldCards.push(c);
            }
        });

        // Send everything to discard pile
        if (this.deck && typeof this.deck.discardMultiple === 'function') {
            this.deck.discardMultiple(allFieldCards);
        } else if (this.deck) {
            allFieldCards.forEach(c => this.deck.discard(c));
        }

        // Reset deck by returning discards to deck and shuffle
        if (this.deck && typeof this.deck.resetForJoker === 'function') {
            this.deck.resetForJoker();
        } else if (this.deck && typeof this.deck.returnDiscardsToDeck === 'function') {
            this.deck.returnDiscardsToDeck();
        }

        // Redeal fresh hands
        this.player.drawCards(this.deck, GAME_SETTINGS.STARTING_HAND_SIZE);
        this.bot.drawCards(this.deck, GAME_SETTINGS.STARTING_HAND_SIZE);

        this.ui.addLogMessage(`${player.name} played Joker — board and hands reset`);
        this.ui.updateGameState();
        this.ui.updatePlayerHand(); // Ensure player's new hand is displayed
        this.ui.updateHandCounts(); // Ensure hand counts are updated
        
        // Force a reflow to ensure hand is visible on all screen sizes
        setTimeout(() => {
            this.ui.updatePlayerHand();
            this.ui.updateHandCounts();
        }, 50);
        
        return true;
    }

    /**
     * Play a big monster using sacrifices
     * @param {Card} card - Big monster card to summon
     * @param {number} spaceIndex - Target monster space index
     * @param {Array} sacrifices - Array of cards sacrificed
     * @param {boolean} isBot - Whether the action is for the bot
     * @returns {boolean} - success
     */
    playBigMonster(card, spaceIndex, sacrifices = [], isBot = false) {
        const player = isBot ? this.bot : this.player;

        // Perform sacrifices if method exists
        if (sacrifices && sacrifices.length > 0 && typeof player.sacrificeCards === 'function') {
            try {
                player.sacrificeCards(sacrifices, this.deck);
            } catch (err) {
                console.warn('Error performing sacrifices', err);
            }
        }

        // Attempt to play the monster
        const res = (typeof player.playCard === 'function') ? player.playCard(card, spaceIndex) : { success: false };
        if (res && res.success) {
            this.ui.addLogMessage(`${player.name} summons ${card.value} (big monster)`);
            this.ui.updateGameState();
        }

        return res && res.success;
    }

    /**
     * Process an attack from one monster to another (or direct)
     * @param {number} attackerIndex - Index of attacker monster
     * @param {number|null} defenderIndex - Index of defender monster or null for direct
     * @param {boolean} isAttackerBot - Whether the attacker is the bot
     * @returns {Object} - result from board.handleAttack
     */
    async processAttack(attackerIndex, defenderIndex, isAttackerBot = false, options = {}) {
        const attacker = isAttackerBot ? this.bot : this.player;
        const defender = (attacker === this.player) ? this.bot : this.player;
        
        // Log the attack attempt
        try {
            const attackingCard = attacker.monsterSpaces[attackerIndex] ? attacker.monsterSpaces[attackerIndex].card : null;
            const atkName = attackingCard ? (attackingCard.isFusion ? `Fusion(${attackingCard.fusionStrength})` : attackingCard.value) : 'Unknown';
            let targetDesc = '';
            if (defenderIndex === null) targetDesc = `${defender.name} (direct)`;
            else {
                const defCard = defender.monsterSpaces[defenderIndex] ? defender.monsterSpaces[defenderIndex].card : null;
                const defName = defCard ? (defCard.isFusion ? `Fusion(${defCard.fusionStrength})` : defCard.value) : 'Unknown';
                targetDesc = `${defender.name}'s ${defName}`;
            }
            if (this.ui && typeof this.ui.addLogMessage === 'function') {
                this.ui.addLogMessage(`${attacker.name}'s ${atkName} attempts to attack ${targetDesc}`);
            }
        } catch (e) { /* non-fatal logging error */ }

        // Validate attack: direct attacks should not be allowed if defender has monsters
        if (defenderIndex === null) {
            // This is a direct attack - check if defender has monsters
            const defenderHasMonsters = defender.monsterSpaces.some(space => 
                space && space.card && isMonsterCard(space.card)
            );
            
            if (defenderHasMonsters) {
                console.warn('Invalid direct attack attempted - defender has monsters');
                this.ui.addLogMessage('Invalid attack: cannot attack directly while opponent has monsters');
                return { success: false, message: 'Direct attack blocked - opponent has monsters' };
            }
        }

        // Highlight the attack (attacker and defender)
        if (this.ui && typeof this.ui.highlightAttack === 'function') {
            this.ui.highlightAttack(attackerIndex, attacker, defenderIndex, defender);
        }

        // Play attack animation
        try {
            if (this.ui && typeof this.ui.animateAttack === 'function') {
                await this.ui.animateAttack(attackerIndex, attacker, defenderIndex, defender);
            }
        } catch (err) {
            // Swallow animation errors but continue
            console.warn('Attack animation error', err);
        }

        // Before resolving the attack, check for defender traps and give the human defender a chance to react
        try {
            const attackingCard = attacker.monsterSpaces[attackerIndex] ? attacker.monsterSpaces[attackerIndex].card : null;
            const atkName = attackingCard ? (attackingCard.isFusion ? `Fusion(${attackingCard.fusionStrength})` : attackingCard.value) : 'Unknown';
            const defName = defender ? defender.name : 'Unknown';
            console.log('Processing attack:', { attacker: attacker.name, attackerIndex, atkName, defender: defName, defenderIndex, options });
        } catch (e) { console.warn('Attack debug log failed', e); }

        // If defender has activatable traps and defender is human, prompt for reaction
        let result = {};
        const trapContext = { attackerIndex, attacker, defenderIndex, defender };

        if (defender && defender.getActivatableTraps) {
            const activatable = defender.getActivatableTraps({ type: defenderIndex === null ? 'battle-phase' : 'attack' });
            if (activatable && activatable.length > 0) {
                // If defender is human, show UI prompt and wait up to 5 seconds
                if (defender === this.player) {
                    try {
                                // Wait for reactive prompt but guard with a timeout so the game cannot hang
                                const resp = await Promise.race([
                                    this.ui.promptTrapResponse(trapContext),
                                    new Promise(resolve => setTimeout(() => resolve({ activated: false, timedOut: true }), 7000))
                                ]);
                                if (resp && resp.timedOut) console.warn('Reactive trap prompt timed out; continuing as not activated');
                        if (resp && resp.activated) {
                            // If the trap activation returned a redirect (Jack), reprocess the attack immediately
                            const r = resp.result || {};
                            const redirect = (r.redirect && r.redirect.redirectTarget !== undefined && r.redirect.redirectPlayer) ? r.redirect :
                                             (r.redirectTarget !== undefined && r.redirectPlayer ? { redirectTarget: r.redirectTarget, redirectPlayer: r.redirectPlayer } : null);

                            if (redirect) {
                                // Animate the redirected attack (best-effort)
                                try {
                                    if (this.ui && typeof this.ui.animateAttack === 'function') {
                                        await this.ui.animateAttack(attackerIndex, attacker, redirect.redirectTarget, redirect.redirectPlayer);
                                    }
                                } catch (e) { /* ignore animation errors */ }

                                // Resolve the redirected attack immediately via board logic
                                const finalRes = this.board.handleAttack(attacker, attackerIndex, redirect.redirectPlayer, redirect.redirectTarget, options) || {};

                                // Animate destroys and log (follow same pattern as below)
                                if (!finalRes.direct) {
                                    if (finalRes.attackerDestroyed) {
                                        try { await this.ui.animateDestroy(attackerIndex, 'monster', attacker); } catch (e) {}
                                        this.ui.addLogMessage(`${attacker.name}'s monster was destroyed`);
                                    }

                                    if (finalRes.defenderDestroyed) {
                                        try { await this.ui.animateDestroy(redirect.redirectTarget, 'monster', redirect.redirectPlayer); } catch (e) {}
                                        this.ui.addLogMessage(`${redirect.redirectPlayer.name}'s monster was destroyed`);
                                    }
                                } else {
                                    this.ui.addLogMessage(`${attacker.name} deals ${finalRes.damage} direct damage to ${redirect.redirectPlayer.name}`);
                                }

                                if (this.ui) this.ui.updateGameState();
                                if (typeof this.checkForGameOver === 'function') this.checkForGameOver();
                                return finalRes;
                            }

                            // Otherwise a trap was activated that handled or modified flow (ACE/KING/QUEEN), so return reactive response
                            // Check if Ace trap ended the battle phase - if so, prevent attack processing
                            if (resp.result && resp.result.effect && resp.result.effect.endBattlePhase) {
                                this.ui.addLogMessage('Attack prevented by Ace trap activation');
                                if (this.ui) this.ui.updateGameState();
                                return { success: false, trapActivated: true, trapResult: resp, attackPrevented: true };
                            }
                            
                            // Check if King trap was activated - if so, continue attack with King effect
                            if (resp.result && resp.result.type === 'KING' && resp.result.res && resp.result.res.kingActivated) {
                                // Continue processing the attack with kingEffect applied
                                options.kingEffect = true;
                                // Fall through to normal attack resolution with King effect
                            } else {
                                // For other traps (Queen), return early
                                if (this.ui) this.ui.updateGameState();
                                return { success: true, trapActivated: true, trapResult: resp };
                            }
                        }
                        // else fall through to normal resolution
                    } catch (e) {
                        console.warn('Trap prompt failed', e);
                    }
                } else {
                    // Bot defender: let bot handle defensive traps via its handler
                    // This will call into game.activateKingTrap/Jack/Ace as implemented
                    try {
                        const botResp = await this.botPlayer.handleDefensiveTraps(attackerIndex, defenderIndex, null);
                        
                        // Check if Ace trap ended battle phase - if so, prevent attack processing
                        if (botResp && botResp.effect && botResp.effect.endBattlePhase) {
                            this.ui.addLogMessage('Attack prevented by Ace trap activation');
                            if (this.ui) this.ui.updateGameState();
                            return { success: false, trapActivated: true, trapResult: botResp, attackPrevented: true };
                        }
                        
                        // Check if King trap was activated - if so, continue attack with King effect
                        if (botResp && botResp.kingActivated) {
                            // Continue processing the attack with kingEffect applied
                            options.kingEffect = true;
                            // Fall through to normal attack resolution with King effect
                        }
                        
                        // If botResp returned a redirect (activateJackTrap returns {success:true, redirect}), handle it similarly
                        else if (botResp && botResp.success && botResp.redirect) {
                            const redirect = botResp.redirect;
                            // Animate and resolve redirected attack immediately
                            try {
                                if (this.ui && typeof this.ui.animateAttack === 'function') {
                                    await this.ui.animateAttack(attackerIndex, attacker, redirect.redirectTarget, redirect.redirectPlayer);
                                }
                            } catch (e) { /* ignore */ }

                            const finalRes = this.board.handleAttack(attacker, attackerIndex, redirect.redirectPlayer, redirect.redirectTarget, options) || {};

                            if (!finalRes.direct) {
                                if (finalRes.attackerDestroyed) {
                                    try { await this.ui.animateDestroy(attackerIndex, 'monster', attacker); } catch (e) {}
                                    this.ui.addLogMessage(`${attacker.name}'s monster was destroyed`);
                                }

                                if (finalRes.defenderDestroyed) {
                                    try { await this.ui.animateDestroy(redirect.redirectTarget, 'monster', redirect.redirectPlayer); } catch (e) {}
                                    this.ui.addLogMessage(`${redirect.redirectPlayer.name}'s monster was destroyed`);
                                }
                            } else {
                                this.ui.addLogMessage(`${attacker.name} deals ${finalRes.damage} direct damage to ${redirect.redirectPlayer.name}`);
                            }

                            if (this.ui) this.ui.updateGameState();
                            if (typeof this.checkForGameOver === 'function') this.checkForGameOver();
                            return finalRes;
                        }
                    } catch (e) {
                        console.warn('Bot defensive trap handling failed', e);
                    }
                }
            }
        }

        // Resolve attack via board logic
        result = this.board.handleAttack(attacker, attackerIndex, defender, defenderIndex, options) || {};

        // Animate destructions if any and log
        if (!result.direct) {
            if (result.attackerDestroyed) {
                try { await this.ui.animateDestroy(attackerIndex, 'monster', attacker); } catch (e) {}
                this.ui.addLogMessage(`${attacker.name}'s monster was destroyed`);
            }

            if (result.defenderDestroyed) {
                try { await this.ui.animateDestroy(defenderIndex, 'monster', defender); } catch (e) {}
                this.ui.addLogMessage(`${defender.name}'s monster was destroyed`);
            }
        } else {
            this.ui.addLogMessage(`${attacker.name} deals ${result.damage} direct damage to ${defender.name}`);
        }

        // Mark the attacking monster as having attacked this turn
        const attackingMonsterSpace = attacker.monsterSpaces[attackerIndex];
        if (attackingMonsterSpace && attackingMonsterSpace.card) {
            attackingMonsterSpace.card.attackedThisTurn = true;
        }

        // Clear attack highlights now that attack is resolved
        if (this.ui && typeof this.ui.clearAttackHighlights === 'function') {
            this.ui.clearAttackHighlights();
        }

        // Update UI state
        if (this.ui) this.ui.updateGameState();

        // Check for game over after resolving attack (damage may have been applied)
        if (typeof this.checkForGameOver === 'function') this.checkForGameOver();

        return result;
    }

    /**
     * Check both players' healths for game over and end the game if necessary
     */
    checkForGameOver() {
        if (this.gameOver) return;
        if (this.player.health <= 0) {
            this.endGame('bot');
        } else if (this.bot.health <= 0) {
            this.endGame('player');
        }
    }

    /**
     * End the game, show game over UI
     * @param {'player'|'bot'} winner
     */
    endGame(winner) {
        this.gameOver = true;
        if (this.ui && typeof this.ui.showGameOverDialog === 'function') this.ui.showGameOverDialog(winner);

        // Game over dialog now provides New Game button for starting a new game
        // No need to show welcome dialog since player can use New Game button
    }

    /**
     * Find owner of a trap card by scanning both players' trap spaces
     * @param {Card} trap
     * @returns {Player|null}
     */
    findTrapOwner(trap) {
        for (const space of this.player.trapSpaces) {
            if (space.card && space.card.id === trap.id) return this.player;
        }
        for (const space of this.bot.trapSpaces) {
            if (space.card && space.card.id === trap.id) return this.bot;
        }
        return null;
    }

    /**
     * Activate Ace trap: ends battle phase
     * @param {Card} trap
     * @param {boolean} isBot
     */
    async activateAceTrap(trap, isBot = false) {
        const owner = this.findTrapOwner(trap);
        if (!owner) return { success: false };

        const res = owner.activateTrap(trap, this.deck);
        if (res && res.success) {
            // record last trap used
            this.lastTrapUsed = trap;
            
            // Handle bot trap reveal animation
            if (res.delayedDiscard && isBot) {
                await this.handleBotTrapReveal(res.trap, res.trapIndex, owner);
            }
            
            this.ui.addLogMessage(`${owner.name} activates Ace`);
            // Before applying Ace effect, allow the opponent to cancel using a Queen if available
            const opponent = (owner === this.player) ? this.bot : this.player;
            // Only prompt the human player (UI) if they are opponent and have a UI
            if (this.ui && opponent === this.player) {
                try {
                    // Ask UI to prompt cancelation; if canceled, do not apply Ace effect
                    const cancelResp = await this.ui.promptCancelTrap(trap);
                    if (cancelResp && cancelResp.canceled) {
                        this.ui.addLogMessage('Ace activation was cancelled by Queen');
                        this.ui.updateGameState();
                        return { success: true, canceledByQueen: true };
                    }
                } catch (err) {
                    console.warn('Error prompting for Queen cancel', err);
                }
            }

            const effect = this.board.handleAceTrap();
            if (effect && effect.endBattlePhase) {
                // Ace ends the current player's battle phase
                this.ui.addLogMessage('Ace trap ended the battle phase');
                this.battlePhaseEnded = true;
                
                // Immediately transition to end phase
                if (this.currentPhase === PHASES.BATTLE) {
                    this.currentPhase = PHASES.END;
                    
                    // Mark that the turn was forcefully ended by Ace trap
                    this.turnForcefullyEnded = true;
                    
                    // Clear attack highlights since turn is ending
                    this.ui.clearAttackHighlights();
                    
                    // Process end phase logic (including fusion upkeep) when Ace forces phase transition
                    this.handleEndPhase();
                }
                
                this.resetAttackedFlags();
                // Clear king-weakened flags from all monsters (they only last until end of battle)
                [this.player, this.bot].forEach(p => {
                    p.monsterSpaces.forEach(space => {
                        if (space.card) {
                            space.card.kingWeakened = false;
                        }
                    });
                });
                this.ui.updateGameState();
                this.ui.updateTurnAndPhase();
            }
            // Attach effect to the result so callers can observe special effects (e.g., endBattlePhase)
            try { res.effect = effect; } catch (e) { /* ignore */ }
            this.ui.updateGameState();
        }
        return res;
    }

    /**
     * Activate King trap: halve the attack strength and resolve
     * @param {Card} trap
     * @param {Object} context - should contain attackerIndex, attacker (Player), defenderIndex, defender, resumeFunction
     * @param {boolean} isBot
     */
    async activateKingTrap(trap, context = {}, isBot = false) {
        const owner = this.findTrapOwner(trap);
        if (!owner) return { success: false };

        const res = owner.activateTrap(trap, this.deck);
        if (res && res.success) {
            // record last trap used
            this.lastTrapUsed = trap;
            
            // Handle bot trap reveal animation
            if (res.delayedDiscard && isBot) {
                await this.handleBotTrapReveal(res.trap, res.trapIndex, owner);
            }
            
            this.ui.addLogMessage(`${owner.name} activates King`);

            // Before applying King effect, allow the opponent to cancel using a Queen if available
            const opponent = (owner === this.player) ? this.bot : this.player;
            // Only prompt the human player (UI) if they are opponent and have a UI
            if (this.ui && opponent === this.player) {
                try {
                    // Ask UI to prompt cancelation; if canceled, do not apply King effect
                    const cancelResp = await this.ui.promptCancelTrap(trap);
                    if (cancelResp && cancelResp.canceled) {
                        this.ui.addLogMessage('King activation was cancelled by Queen');
                        this.ui.updateGameState();
                        return { success: true, canceledByQueen: true };
                    }
                } catch (err) {
                    console.warn('Error prompting for Queen cancel', err);
                }
            }

            // If context provides attacker info, mark the attacking monster as king-weakened
            if (context && typeof context.attackerIndex === 'number') {
                try {
                    const attackerPlayer = context.attacker;
                    const atkCard = attackerPlayer.monsterSpaces[context.attackerIndex].card;
                    if (atkCard) {
                        atkCard.kingWeakened = true;
                        // Calculate the reduced strength
                        const originalStrength = calculateMonsterStrength(atkCard);
                        const reducedStrength = applyKingEffect(originalStrength);
                        this.ui.addLogMessage(`${attackerPlayer.name}'s monster strength reduced from ${originalStrength} to ${reducedStrength}`);
                    }
                } catch (err) { /* ignore */ }
                
                // Don't reprocess the attack - let the caller know King trap was activated
                // The caller should continue with kingEffect: true option
                try { res.kingActivated = true; } catch (e) {}
            }

            this.ui.updateGameState();
        }

        return res;
    }

    /**
     * Activate Jack trap: redirect attack to targetIndex/targetPlayer
     * @param {Card} trap
     * @param {number} targetIndex
     * @param {Player} targetPlayer
     * @param {boolean} isBot
     */
    async activateJackTrap(trap, targetIndex, targetPlayer, isBot = false) {
        const owner = this.findTrapOwner(trap);
        if (!owner) return { success: false };

        const res = owner.activateTrap(trap, this.deck);
        if (res && res.success) {
            // record last trap used
            this.lastTrapUsed = trap;
            
            // Handle bot trap reveal animation
            if (res.delayedDiscard && isBot) {
                await this.handleBotTrapReveal(res.trap, res.trapIndex, owner);
            }
            
            this.ui.addLogMessage(`${owner.name} activates Jack`);

            // Before applying Jack effect, allow the opponent to cancel using a Queen if available
            const opponent = (owner === this.player) ? this.bot : this.player;
            // Only prompt the human player (UI) if they are opponent and have a UI
            if (this.ui && opponent === this.player) {
                try {
                    // Ask UI to prompt cancelation; if canceled, do not apply Jack effect
                    const cancelResp = await this.ui.promptCancelTrap(trap);
                    if (cancelResp && cancelResp.canceled) {
                        this.ui.addLogMessage('Jack activation was cancelled by Queen');
                        this.ui.updateGameState();
                        return { success: true, canceledByQueen: true };
                    }
                } catch (err) {
                    console.warn('Error prompting for Queen cancel', err);
                }
            }

            // Redirect handled by board; caller should resume attack with new target
            const redirect = this.board.handleJackTrap(targetIndex, targetPlayer);
            this.ui.updateGameState();
            return { success: true, redirect };
        }

        return res;
    }

    /**
     * Activate Queen trap: cancel another trap (simple discard)
     * @param {Card} trap
     * @param {Card} targetTrap
     * @param {boolean} isBot
     */
    async activateQueenTrap(trap, targetTrap, isBot = false) {
        const owner = this.findTrapOwner(trap);
        if (!owner) return { success: false };

        // If no targetTrap specified, fail gracefully (caller should provide a target)
        if (!targetTrap) return { success: false, message: 'No target trap specified' };

        const res = owner.activateTrap(trap, this.deck);
        if (res && res.success) {
            // record last trap used
            this.lastTrapUsed = trap;
            
            // Handle bot trap reveal animation
            if (res.delayedDiscard && isBot) {
                await this.handleBotTrapReveal(res.trap, res.trapIndex, owner);
            }
            
            // Remove target trap from field (if present)
            const targetOwner = this.findTrapOwner(targetTrap);
            if (targetOwner) {
                // Discard target trap
                for (const space of targetOwner.trapSpaces) {
                    if (space.card && space.card.id === targetTrap.id) {
                        this.deck.discard(space.card);
                        space.card = null;
                        break;
                    }
                }
            }
            this.ui.addLogMessage(`${owner.name} activates Queen and cancels a trap`);
            this.ui.updateGameState();
        }

        return res;
    }

    /**
     * Create a fusion from two monsters for player or bot
     * @param {Card} monster1 - First monster card
     * @param {Card} monster2 - Second monster card
     * @param {number} targetSpaceIndex - Target space for fusion
     * @param {boolean} isBot - Whether this action is for the bot
     * @returns {Object} - result from player.createFusion
     */
    createFusion(monster1, monster2, targetSpaceIndex, isBot = false) {
        const player = isBot ? this.bot : this.player;

        if (typeof player.createFusion !== 'function') {
            console.warn('Player.createFusion not available');
            return { success: false, message: 'createFusion not supported' };
        }

        const res = player.createFusion(monster1, monster2, targetSpaceIndex);
        if (res && res.success) {
            this.ui.addLogMessage(`${player.name} fuses monsters into a fusion with STR ${res.fusion ? res.fusion.fusionStrength : ''}`);
            this.ui.updateGameState();
        }

        return res;
    }

    /**
     * Reset attackedThisTurn flags for all monsters (called at end of battle phase)
     */
    resetAttackedFlags() {
        [this.player, this.bot].forEach(p => {
            for (const space of p.monsterSpaces) {
                if (space.card) {
                    space.card.attackedThisTurn = false;
                }
            }
        });

        if (this.ui) this.ui.updateGameState();
    }

    /**
     * Handle bot trap reveal animation and delayed discard
     * @param {Card} trap - The trap card to reveal
     * @param {number} trapIndex - Index of the trap space  
     * @param {Player} owner - The bot player who owns the trap
     */
    async handleBotTrapReveal(trap, trapIndex, owner) {
        // Get the trap space element to animate
        const trapSpaceEl = document.querySelector(`.bot-trap-space:nth-child(${trapIndex + 1}) .card`);
        
        if (trapSpaceEl) {
            // Add flip animation to reveal the card
            trapSpaceEl.classList.add('card-flipping');
            
            // Update the card display to show the actual trap
            this.ui.addLogMessage(`Bot reveals ${trap.name}!`);
            
            // Wait for flip animation to complete
            await new Promise(resolve => setTimeout(resolve, 600));
            
            // Add reveal highlight animation
            trapSpaceEl.classList.remove('card-flipping');
            trapSpaceEl.classList.add('trap-revealing');
            
            // Show the revealed trap for a moment
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Remove highlight and proceed with discard
            trapSpaceEl.classList.remove('trap-revealing');
        }
        
        // Now discard the trap (remove from field and add to discard pile)
        const trapSpace = owner.trapSpaces[trapIndex];
        if (trapSpace && trapSpace.card) {
            this.deck.discard(trapSpace.card);
            trapSpace.card = null;
        }
        
        // Update the UI to reflect the trap removal
        this.ui.updateGameState();
    }

    /**
     * Determine whether the given player can attack this overall turn.
     * First player (who started the game) cannot attack on overall turn 1. Second player can attack on turn 2.
     * @param {Player} player
     * @returns {boolean}
     */
    isAttackAllowedThisTurn(player) {
        // If it's the very first overall turn, the player who started cannot attack
        if (this.turnCounter === 1 && player === this.firstPlayer) return false;
        return true;
    }
}

// Expose for debugging
window.Game = Game;
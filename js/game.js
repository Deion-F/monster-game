/*
 * game.js
 * Main Game controller: turn flow, phases and attack resolution
 */
class Game {
    constructor() {
        this.setupMatch('Player');
    }

    /**
     * Reset all match state: deck, players, board, bot and UI
     * @param {string} playerName
     */
    setupMatch(playerName) {
        this.deck = new Deck();
        this.deck.onReshuffle = () => this.handleDeckReshuffle();
        this.player = new Player(PLAYER_TYPES.HUMAN, playerName || 'Player');
        this.bot = new Player(PLAYER_TYPES.BOT, 'Bot');
        this.board = new Board(this.player, this.bot, this.deck);
        this.ui = new UI(this);
        this.botPlayer = new Bot(this);

        this.currentPhase = PHASES.DRAW;
        this.currentPlayer = this.player; // player starts
        this.firstPlayer = this.player; // track who went first
        this.turnCounter = 1;
        this.gameOver = false;
        this.battleEnded = false; // set when an Ace ends the current Battle phase
        this.attackInProgress = false;
        this.awaitingDiscard = false;
        this.jokersPlayed = 0; // Jokers leave the match once played

        // Deal starting hands
        this.player.drawCards(this.deck, GAME_SETTINGS.STARTING_HAND_SIZE);
        this.bot.drawCards(this.deck, GAME_SETTINGS.STARTING_HAND_SIZE);

        this.ui.initialize();
    }

    startNewGame(playerName) {
        this.setupMatch(playerName);
        this.startTurn();
    }

    getOpponent(player) {
        return player === this.player ? this.bot : this.player;
    }

    startTurn() {
        if (this.gameOver) return;

        this.battleEnded = false;
        // The one-trap-of-each-type limit applies per player, per turn
        this.player.usedTrapTypes.clear();
        this.bot.usedTrapTypes.clear();
        this.currentPlayer.resetForNewTurn();

        this.currentPhase = PHASES.DRAW;
        this.ui.updateTurnAndPhase();
        this.handleDrawPhase();
    }

    handleDrawPhase() {
        const player = this.currentPlayer;
        const drawCount = (player.hand.length === 0) ? 5 : 1;
        const drawn = player.drawCards(this.deck, drawCount);
        this.ui.addLogMessage(`${player.name} draws ${drawn.length} card(s)`);
        this.ui.updateGameState();

        // Drawing can rebuild the deck, which deals damage and may end the match
        if (this.gameOver) return;

        const excess = player.hand.length - GAME_SETTINGS.MAX_HAND_SIZE;
        if (excess > 0) {
            if (player === this.player) {
                // Wait for the player to choose; discardExcessCards continues the turn
                this.awaitingDiscard = true;
                this.ui.showDiscardDialog(excess);
                return;
            }
            const toDiscard = this.botPlayer.selectCardsToDiscard(excess);
            player.discardDownToLimit(toDiscard, this.deck);
            this.ui.addLogMessage(`Bot discards ${excess} card(s)`);
        }

        this.finishDrawPhase();
    }

    /**
     * Discard the cards the human chose after going over the hand limit, then continue the turn
     * @param {Array} cards
     */
    discardExcessCards(cards) {
        if (!this.awaitingDiscard) return false;

        const excess = this.player.hand.length - GAME_SETTINGS.MAX_HAND_SIZE;
        if (!cards || cards.length !== excess) {
            this.ui.showDiscardDialog(excess);
            return false;
        }

        this.player.discardDownToLimit(cards, this.deck);
        this.ui.addLogMessage(`${this.player.name} discards ${excess} card(s)`);
        this.awaitingDiscard = false;
        this.finishDrawPhase();
        return true;
    }

    finishDrawPhase() {
        this.currentPhase = PHASES.SETUP;
        this.ui.updateGameState();

        if (this.currentPlayer === this.bot) {
            const turn = this.turnCounter;
            setTimeout(() => {
                if (!this.gameOver && this.turnCounter === turn) this.botPlayer.takeTurn();
            }, 600);
        }
    }

    /**
     * The empty deck was rebuilt from the discard pile: both players take damage
     */
    handleDeckReshuffle() {
        const damage = GAME_SETTINGS.RESHUFFLE_DAMAGE;
        this.player.takeDamage(damage);
        this.bot.takeDamage(damage);
        this.ui.addLogMessage(`The deck ran out and was reshuffled. Both players take ${damage} damage`);
        this.ui.announcePlay(null, `Deck reshuffled: both players take ${damage}`, [], 'danger');
        this.ui.updateGameState();
        this.checkForGameOver();
    }

    /**
     * Advance the human player's phase (End Phase button / Space)
     */
    endCurrentPhase() {
        if (this.gameOver || this.currentPlayer !== this.player) return;
        if (this.attackInProgress || this.awaitingDiscard) return;

        switch (this.currentPhase) {
            case PHASES.SETUP:
                if (this.player.skipBattleThisTurn) {
                    this.player.skipBattleThisTurn = false;
                    this.ui.addLogMessage(`${this.player.name}'s Battle phase is skipped due to Joker`);
                    this.endBattlePhase();
                } else {
                    this.enterBattlePhase();
                }
                return;
            case PHASES.BATTLE:
                this.endBattlePhase();
                return;
            case PHASES.END:
                // The End phase finishes on its own once upkeep is settled
                return;
        }
    }

    enterBattlePhase() {
        this.currentPhase = PHASES.BATTLE;
        this.ui.updateGameState();
    }

    /**
     * Move the current player into the End phase. Safe to call more than once.
     */
    enterEndPhase() {
        if (this.currentPhase === PHASES.END) return false;

        this.currentPhase = PHASES.END;
        // King's halving only lasts until the end of battle
        [this.player, this.bot].forEach(p => {
            p.monsterSpaces.forEach(space => {
                if (space.card) space.card.kingWeakened = false;
            });
        });
        this.resetAttackedFlags();
        return true;
    }

    /**
     * End the human player's Battle phase and run their End phase
     */
    endBattlePhase() {
        if (this.enterEndPhase()) this.handleEndPhase();
    }

    /**
     * Human End phase: pay fusion upkeep if needed, then end the turn.
     * The bot runs its own End phase in Bot.takeTurn.
     */
    handleEndPhase() {
        const fusionCount = this.board.countActiveFusions(this.player);
        if (fusionCount > 0) {
            // handleFusionUpkeep ends the turn once the player confirms
            this.ui.showFusionUpkeepDialog(fusionCount);
        } else {
            this.ui.updateGameState();
            this.scheduleEndTurn();
        }
    }

    /**
     * End the turn after a short pause so the End phase is visible.
     * Guarded so a turn can only be ended once.
     */
    scheduleEndTurn() {
        const turn = this.turnCounter;
        setTimeout(() => {
            if (!this.gameOver && this.turnCounter === turn && this.currentPhase === PHASES.END) {
                this.endTurn();
            }
        }, 800);
    }

    endTurn() {
        if (this.gameOver) return;

        // Traps arm at the end of the turn they were set
        this.activateJustPlacedTraps(this.currentPlayer);

        this.currentPlayer = this.getOpponent(this.currentPlayer);
        this.turnCounter++;
        this.startTurn();
    }

    /**
     * Arm the traps a player set this turn
     * @param {Player} player
     */
    activateJustPlacedTraps(player) {
        for (const space of player.trapSpaces) {
            if (space.card && space.card.justPlaced) {
                space.card.justPlaced = false;
                space.card.active = true;
            }
        }
        this.ui.updateGameState();
    }

    /**
     * Pay fusion upkeep: one monster card per fusion. Unpaid fusions break apart, keeping their stronger card.
     * @param {Array} sacrificeCards - monster cards from hand or field (not fusions)
     * @param {boolean} isBot
     */
    handleFusionUpkeep(sacrificeCards, isBot = false) {
        const player = isBot ? this.bot : this.player;
        const need = this.board.countActiveFusions(player);

        const valid = (sacrificeCards || [])
            .filter(card => card && isMonsterCard(card) && !card.isFusion)
            .slice(0, need);

        if (valid.length > 0) player.sacrificeCards(valid, this.deck);

        // Sacrificing can't remove a fusion, so recount is unchanged; break apart those left unpaid
        const broken = this.board.breakUnpaidFusions(player, valid.length);
        if (valid.length > 0 && broken.length > 0) {
            this.ui.addLogMessage(`${player.name} pays fusion upkeep with ${valid.map(describeCard).join(' + ')}`);
        }
        broken.forEach(({ fusion, kept, discarded }) => {
            this.ui.addLogMessage(`${player.name}'s unpaid ${describeCard(fusion)} breaks apart: ${describeCard(kept)} stays, ${describeCard(discarded)} is discarded`);
        });
        if (broken.length > 0) {
            const whose = player === this.player ? 'Your' : `${player.name}'s`;
            const kept = broken.map(b => describeCard(b.kept)).join(' and ');
            this.ui.announcePlay(null, `${whose} unpaid fusion${broken.length === 1 ? ' breaks' : 's break'} apart: ${kept} stay${broken.length === 1 ? 's' : ''}`,
                broken.map(b => b.kept), 'danger');
        } else if (need > 0) {
            this.ui.addLogMessage(`${player.name} pays fusion upkeep with ${valid.map(describeCard).join(' + ')}`);
        }

        this.ui.updateGameState();
        if (player === this.player) this.scheduleEndTurn();
    }

    /**
     * Check that `player` may take a Setup-phase action right now
     */
    canActInSetup(player) {
        return !this.gameOver && this.currentPlayer === player && this.currentPhase === PHASES.SETUP;
    }

    playMonsterCard(card, spaceIndex, isBot = false) {
        const player = isBot ? this.bot : this.player;
        if (!this.canActInSetup(player) || getCardType(card.value) !== CARD_TYPES.MONSTER_NORMAL) return false;

        const res = player.playCard(card, spaceIndex);
        if (res.success) {
            this.ui.addLogMessage(`${player.name} summons ${describeCard(card)}`);
            this.ui.announcePlay(player, `${player.name} summons ${describeCard(card)}`, [card]);
            this.ui.updateGameState();
        }
        return res.success;
    }

    playTrapCard(card, spaceIndex, isBot = false) {
        const player = isBot ? this.bot : this.player;
        if (!this.canActInSetup(player) || getCardType(card.value) !== CARD_TYPES.TRAP) return false;

        const res = player.playCard(card, spaceIndex);
        if (res.success) {
            this.ui.addLogMessage(`${player.name} sets a trap`);
            this.ui.announcePlay(player, `${player.name} sets a trap`, [{ card, faceDown: true }]);
            this.ui.updateGameState();
        }
        return res.success;
    }

    /**
     * Play Joker: clear the field and both hands, shuffle everything back into the deck,
     * deal fresh hands and skip the Joker player's Battle phase. The Joker is removed
     * from play for the rest of the match. Setup phase only, for players and bot alike.
     * @param {Card} card - Joker card being played
     * @param {boolean} isBot - whether the joker was played by bot
     */
    playJoker(card, isBot = false) {
        const player = isBot ? this.bot : this.player;
        if (!this.canActInSetup(player) || card.value !== CARD_VALUES.JOKER) return false;

        const idx = player.hand.findIndex(c => c.id === card.id);
        if (idx === -1) return false;
        player.hand.splice(idx, 1);

        player.skipBattleThisTurn = true;
        this.board.handleJokerEffect(player, card);
        this.jokersPlayed++;

        this.ui.addLogMessage(`${player.name} played Joker: board and hands reset, Joker removed from play`);
        this.ui.announcePlay(null, `${player === this.player ? 'You play' : `${player.name} plays`} the Joker: board and hands reset`, [card], player === this.player ? 'you' : 'bot');
        this.ui.updateGameState();
        return true;
    }

    /**
     * Play a big monster using sacrifices
     * @param {Card} card - Big monster card to summon
     * @param {number|null} spaceIndex - Target monster space index (null: first free after sacrificing)
     * @param {Array} sacrifices - Monster cards from hand or field
     * @param {boolean} isBot - Whether the action is for the bot
     * @returns {boolean} - success
     */
    playBigMonster(card, spaceIndex, sacrifices = [], isBot = false) {
        const player = isBot ? this.bot : this.player;
        if (!this.canActInSetup(player) || getCardType(card.value) !== CARD_TYPES.MONSTER_BIG) return false;
        if (!player.hand.some(c => c.id === card.id)) return false;

        // Only monsters the player owns can be sacrificed, and never the summoned card itself
        const owned = c => player.hand.some(h => h.id === c.id) ||
            player.monsterSpaces.some(s => s.card && s.card.id === c.id);
        if (sacrifices.some(c => !c || c.id === card.id || !isMonsterCard(c) || !owned(c))) return false;
        if (getTotalCardValue(sacrifices) < getRequiredSacrificeValue(card)) return false;

        const freesSpace = sacrifices.some(c => player.monsterSpaces.some(s => s.card && s.card.id === c.id));
        if (!player.hasAvailableMonsterSpace() && !freesSpace) return false;

        player.sacrificeCards(sacrifices, this.deck);

        let target = spaceIndex;
        if (typeof target !== 'number' || player.monsterSpaces[target].card !== null) {
            target = player.monsterSpaces.findIndex(s => s.card === null);
        }

        const res = player.playCard(card, target);
        if (res.success) {
            this.ui.addLogMessage(`${player.name} summons ${describeCard(card)} (big monster), sacrificing ${sacrifices.map(describeCard).join(' + ')}`);
            this.ui.announcePlay(player, `${player.name} summons big monster ${describeCard(card)}`, [card]);
            this.ui.updateGameState();
        }
        return res.success;
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
        if (!this.canActInSetup(player)) return { success: false, message: 'Fusions can only be made in your Setup phase' };

        const res = player.createFusion(monster1, monster2, targetSpaceIndex);
        if (res.success) {
            this.ui.addLogMessage(`${player.name} fuses monsters into a fusion with STR ${res.fusion.fusionStrength}`);
            this.ui.announcePlay(player, `${player.name} fuses ${describeCard(monster1)} + ${describeCard(monster2)} into STR ${res.fusion.fusionStrength}`, [monster1, '+', monster2]);
            this.ui.updateGameState();
        }
        return res;
    }

    /**
     * Resolve one attack, including the defender's trap response and the attacker's
     * chance to cancel that trap with a Queen. The attack is resolved exactly once.
     * @param {number} attackerIndex - Index of attacker monster
     * @param {number|null} defenderIndex - Index of defender monster or null for direct
     * @param {boolean} isAttackerBot - Whether the attacker is the bot
     * @returns {Object} - attack result
     */
    async processAttack(attackerIndex, defenderIndex, isAttackerBot = false) {
        const attacker = isAttackerBot ? this.bot : this.player;
        const defender = this.getOpponent(attacker);

        if (this.gameOver || this.attackInProgress || this.battleEnded) return { success: false };
        if (this.currentPlayer !== attacker || this.currentPhase !== PHASES.BATTLE) return { success: false };
        if (!this.isAttackAllowedThisTurn(attacker)) return { success: false, message: 'Cannot attack on the first turn' };

        const attackingCard = attacker.monsterSpaces[attackerIndex] && attacker.monsterSpaces[attackerIndex].card;
        if (!attackingCard || !attackingCard.canAttack()) return { success: false, message: 'That monster cannot attack' };
        if (!this.board.getValidAttackTargets(attacker, defender).includes(defenderIndex)) {
            return { success: false, message: 'Invalid attack target' };
        }

        this.attackInProgress = true;
        attackingCard.attackedThisTurn = true;
        let endsBattle = false;

        // Log the attack before any trap response, so the log reads in the order things happen
        const defendingCard = defenderIndex === null ? null : defender.monsterSpaces[defenderIndex].card;
        this.ui.addLogMessage(defendingCard
            ? `${attacker.name}'s ${describeCard(attackingCard)} attacks ${defender.name}'s ${describeCard(defendingCard)}`
            : `${attacker.name}'s ${describeCard(attackingCard)} attacks ${defender.name} directly`);

        try {
            this.ui.showAttackHighlight(attackerIndex, attacker, defenderIndex, defender);
            await this.ui.animateAttack(attackerIndex, attacker, defenderIndex, defender);

            let targetPlayer = defender;
            let targetIndex = defenderIndex;
            const options = {};

            const reaction = await this.getDefenderReaction({ attacker, attackerIndex, defender, defenderIndex });
            if (reaction && reaction.trap) {
                const activation = await this.activateTrapWithQueenWindow(defender, reaction.trap);
                if (activation.activated && !activation.canceled) {
                    switch (reaction.trap.value) {
                        case CARD_VALUES.ACE:
                            this.ui.addLogMessage(`Ace ends ${attacker.name}'s Battle phase`);
                            this.battleEnded = true;
                            endsBattle = true;
                            await this.ui.showBattleEnded(attacker);
                            return { success: true, trapActivated: true, battleEnded: true };
                        case CARD_VALUES.KING:
                            attackingCard.kingWeakened = true;
                            options.kingEffect = true;
                            this.ui.addLogMessage(`King halves ${describeCard(attackingCard)} to ${applyKingEffect(calculateMonsterStrength(attackingCard))}`);
                            await this.ui.showKingHalved(attacker, attackerIndex, attackingCard);
                            break;
                        case CARD_VALUES.JACK:
                            targetPlayer = reaction.target.player;
                            targetIndex = reaction.target.index;
                            this.ui.addLogMessage(`Jack redirects the attack to ${targetPlayer.name}'s ${describeCard(targetPlayer.monsterSpaces[targetIndex].card)}`);
                            this.ui.updateGameState();
                            await this.ui.showRedirect(attacker, attackerIndex, defender, defenderIndex, targetPlayer, targetIndex);
                            await this.ui.animateAttack(attackerIndex, attacker, targetIndex, targetPlayer);
                            break;
                    }
                }
            }

            const targetCard = targetIndex === null ? null : targetPlayer.monsterSpaces[targetIndex].card;
            const result = this.board.handleAttack(attacker, attackerIndex, targetPlayer, targetIndex, options);

            if (result.direct) {
                this.ui.addLogMessage(`${targetPlayer.name} takes ${result.damage} damage`);
            } else if (result.success) {
                if (result.attackerDestroyed) this.ui.addLogMessage(`${attacker.name}'s ${describeCard(attackingCard)} was destroyed`);
                if (result.defenderDestroyed) this.ui.addLogMessage(`${targetPlayer.name}'s ${describeCard(targetCard)} was destroyed`);
                if (result.damage > 0) {
                    const loser = result.attackerDestroyed ? attacker : targetPlayer;
                    this.ui.addLogMessage(`${loser.name} takes ${result.damage} damage`);
                }
            }
            if (result.success) this.ui.showAttackResult(attacker, attackingCard, targetPlayer, targetCard, result);

            this.checkForGameOver();
            return result;
        } finally {
            this.attackInProgress = false;
            this.ui.clearAttackHighlights();
            this.ui.updateGameState();
            // A human attacker whose battle was ended by an Ace moves straight to their End phase
            if (endsBattle && attacker === this.player && !this.gameOver) this.endBattlePhase();
        }
    }

    /**
     * Ask the defender (human UI or bot) whether to respond to an attack with a trap
     * @returns {Promise<{trap: Card, target?: {player: Player, index: number}}|null>}
     */
    async getDefenderReaction(context) {
        const type = context.defenderIndex === null ? 'battle-phase' : 'attack';
        const traps = context.defender.getActivatableTraps({ type });
        if (traps.length === 0) return null;

        const choice = context.defender === this.player
            ? await this.ui.promptTrapResponse({ ...context, traps })
            : await this.botPlayer.chooseDefensiveTrap(context, traps);

        // Validate the choice against the rules before using it
        if (!choice || !choice.trap || !traps.some(t => t.id === choice.trap.id)) return null;
        if (choice.trap.value === CARD_VALUES.JACK) {
            const targets = this.board.getValidRedirectTargets(context.attackerIndex, context.attacker, context.defenderIndex, context.defender);
            if (!choice.target || !targets.some(t => t.player === choice.target.player && t.index === choice.target.index)) return null;
        }
        return choice;
    }

    /**
     * Activate a trap, then give its owner's opponent one chance to cancel it with a Queen
     * @param {Player} owner
     * @param {Card} trap
     * @returns {Promise<{activated: boolean, canceled: boolean}>}
     */
    async activateTrapWithQueenWindow(owner, trap) {
        this.ui.fxHint(trap.id, 'reveal');
        const res = owner.activateTrap(trap, this.deck);
        if (!res.success) return { activated: false, canceled: false };

        this.ui.addLogMessage(`${owner.name} activates ${describeCard(trap)} (${getTrapName(trap.value)})`);
        this.ui.updateGameState();
        await this.ui.showTrapActivated(owner, trap);

        const opponent = this.getOpponent(owner);
        const queens = opponent.getActivatableTraps({ type: 'trap', trapValue: trap.value })
            .filter(t => t.value === CARD_VALUES.QUEEN);
        if (queens.length === 0) return { activated: true, canceled: false };

        const queen = opponent === this.player
            ? await this.ui.promptCancelTrap(trap, queens)
            : this.botPlayer.chooseQueenCancel(trap, queens);

        if (queen && queens.some(q => q.id === queen.id)) this.ui.fxHint(queen.id, 'reveal');
        if (queen && queens.some(q => q.id === queen.id) && opponent.activateTrap(queen, this.deck).success) {
            this.ui.addLogMessage(`${opponent.name} activates Queen and cancels the ${getTrapName(trap.value)}`);
            this.ui.updateGameState();
            await this.ui.showTrapCancelled(opponent, queen, owner, trap);
            return { activated: true, canceled: true };
        }
        return { activated: true, canceled: false };
    }

    /**
     * Check both players' healths for game over and end the game if necessary
     */
    checkForGameOver() {
        if (this.gameOver) return;
        const playerOut = this.player.health <= 0;
        const botOut = this.bot.health <= 0;
        if (playerOut && botOut) this.endGame('draw');
        else if (playerOut) this.endGame('bot');
        else if (botOut) this.endGame('player');
    }

    /**
     * End the game and show the game over dialog
     * @param {'player'|'bot'|'draw'} winner
     */
    endGame(winner) {
        this.gameOver = true;
        this.ui.showGameOverDialog(winner);
    }

    /**
     * Find owner of a trap card by scanning both players' trap spaces
     * @param {Card} trap
     * @returns {Player|null}
     */
    findTrapOwner(trap) {
        for (const p of [this.player, this.bot]) {
            if (p.trapSpaces.some(space => space.card && space.card.id === trap.id)) return p;
        }
        return null;
    }

    /**
     * Reset attackedThisTurn flags for all monsters (called at end of battle phase)
     */
    resetAttackedFlags() {
        [this.player, this.bot].forEach(p => {
            for (const space of p.monsterSpaces) {
                if (space.card) space.card.attackedThisTurn = false;
            }
        });
        this.ui.updateGameState();
    }

    /**
     * Determine whether the given player can attack this overall turn.
     * First player (who started the game) cannot attack on overall turn 1. Second player can attack on turn 2.
     * @param {Player} player
     * @returns {boolean}
     */
    isAttackAllowedThisTurn(player) {
        return !(this.turnCounter === 1 && player === this.firstPlayer);
    }
}

// Expose for debugging
window.Game = Game;

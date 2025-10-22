/**
 * UI class for handling game interface
 */
class UI {
    /**
     * Create UI manager
     * @param {Game} game - Game instance
     */
    constructor(game) {
        this.game = game;
        this.selectedCard = null;
        this.selectedSpace = null;
        this.sacrificeCards = [];
        this.fusionCards = [];
        this.fusionTargetSpace = null;
        this.activatingTrap = null;
        this.redirectTargets = [];
        this._postSacrificeCallback = null; // optional callback to run after sacrifice dialog confirm
        
        // Track message numbers - simply increment for each log entry
        this.nextMessageNumber = 1;
        
        this.setupEventListeners();
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // End phase button
        document.getElementById('end-phase-btn').addEventListener('click', () => {
            this.game.endCurrentPhase();
        });
        
        // Card selection in hand
        document.getElementById('player-hand').addEventListener('click', (e) => {
            const cardElement = e.target.closest('.card');
            if (!cardElement) return;
            
            const cardId = cardElement.dataset.cardId;
            this.handleCardSelection(cardId);
        });
        
        // Delegated listener for monster and trap spaces (more robust when innerHTML changes)
        const boardEl = document.querySelector('.game-board') || document.body;
        boardEl.addEventListener('click', (e) => {
            // Ignore clicks that occur inside a visible dialog or on a button to
            // prevent dialog/button clicks from being mistaken for board interactions.
            if (e.target.closest && (e.target.closest('.dialog') || e.target.closest('dialog') || e.target.closest('button'))) return;
            // Also ignore if any dialog is currently visible/open
            if (document.querySelector && (document.querySelector('.dialog.visible') || document.querySelector('dialog[open]'))) return;

            const spaceEl = e.target.closest('.monster-space');
            if (spaceEl) {
                console.debug('monster-space clicked (delegated)', spaceEl.id);
                const spaceId = spaceEl.id;
                const isPlayer = spaceId.startsWith('player');
                const spaceIndex = parseInt(spaceEl.dataset.index);
                if (isPlayer) this.handlePlayerMonsterSpaceClick(spaceIndex);
                else this.handleBotMonsterSpaceClick(spaceIndex);
                return;
            }
            const trapEl = e.target.closest('.trap-space');
            if (trapEl) {
                const spaceId = trapEl.id;
                const isPlayer = spaceId.startsWith('player');
                const spaceIndex = parseInt(trapEl.dataset.index);
                if (isPlayer) this.handlePlayerTrapSpaceClick(spaceIndex);
                return;
            }
        });
        
        // Trap spaces for playing cards
        document.querySelectorAll('.trap-space').forEach(space => {
            space.addEventListener('click', (e) => {
                const spaceId = e.currentTarget.id;
                const isPlayer = spaceId.startsWith('player');
                const spaceIndex = parseInt(e.currentTarget.dataset.index);
                
                if (isPlayer) {
                    this.handlePlayerTrapSpaceClick(spaceIndex);
                }
            });
        });
        
        // Dialog buttons
        document.getElementById('cancel-sacrifice').addEventListener('click', () => {
            this.closeSacrificeDialog();
        });
        
        document.getElementById('confirm-sacrifice').addEventListener('click', () => {
            this.confirmSacrifice();
        });
        
        document.getElementById('cancel-fusion').addEventListener('click', () => {
            this.closeFusionDialog();
        });
        
        document.getElementById('confirm-fusion').addEventListener('click', () => {
            this.confirmFusion();
        });
        
        document.getElementById('cancel-trap-activation').addEventListener('click', () => {
            this.cancelTrapActivation();
        });
        
        document.getElementById('confirm-trap-activation').addEventListener('click', () => {
            this.confirmTrapActivation();
        });
        
        document.getElementById('confirm-redirect').addEventListener('click', () => {
            this.confirmRedirect();
        });
        
        document.getElementById('confirm-fusion-upkeep').addEventListener('click', () => {
            this.confirmFusionUpkeep();
        });
        
        document.getElementById('confirm-discard').addEventListener('click', () => {
            this.confirmDiscard();
        });
        
        document.getElementById('new-game').addEventListener('click', () => {
            window.location.reload();
        });
        
        // Help button for tutorial (guard for missing element)
        const helpBtn = document.getElementById('help-button');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                // Prefer the <dialog> tutorial element, fallback to modal container
                const tutorialDialog = document.getElementById('tutorial-dialog') || document.getElementById('tutorial-modal');
                if (!tutorialDialog) return;
                if (typeof tutorialDialog.showModal === 'function') {
                    try { tutorialDialog.showModal(); } catch (err) { tutorialDialog.classList.add('visible'); }
                } else {
                    tutorialDialog.classList.add('visible');
                }
            });
        }

        // Tutorial navigation is handled by onclick attributes in HTML
        // (prev-tutorial and next-tutorial buttons call tutorialPrev() and tutorialNext() from main.js)

        // Close tutorial (use explicit id if present, fallback to any .close)
        const closeBtn = document.getElementById('close-tutorial') || document.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                const tutorialDialog = document.getElementById('tutorial-dialog') || document.getElementById('tutorial-modal');
                if (!tutorialDialog) return;
                if (typeof tutorialDialog.close === 'function') {
                    try { tutorialDialog.close(); } catch (err) { tutorialDialog.classList.remove('visible'); }
                } else {
                    tutorialDialog.classList.remove('visible');
                }
            });
        }

        // Deck and discard pile click handlers (open listing dialogs)
        const deckEl = document.getElementById('deck');
        if (deckEl) {
            deckEl.addEventListener('click', () => this.showDeckListDialog());
        }

        const discardEl = document.getElementById('discard-pile');
        if (discardEl) {
            discardEl.addEventListener('click', () => this.showDiscardListDialog());
        }

        const closeDeckBtn = document.getElementById('close-deck-list');
        if (closeDeckBtn) closeDeckBtn.addEventListener('click', () => {
            document.getElementById('deck-list-dialog').classList.remove('visible');
        });

        const closeDiscardBtn = document.getElementById('close-discard-list');
        if (closeDiscardBtn) closeDiscardBtn.addEventListener('click', () => {
            document.getElementById('discard-list-dialog').classList.remove('visible');
        });

        // Bot hand viewer button
        const viewBotHandBtn = document.getElementById('view-bot-hand-btn');
        if (viewBotHandBtn) {
            viewBotHandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showBotHandDialog();
            });
        }

        const closeBotHandBtn = document.getElementById('close-bot-hand-btn');
        if (closeBotHandBtn) {
            closeBotHandBtn.addEventListener('click', () => {
                this.closeBotHandDialog();
            });
        }

        // Close bot hand dialog when clicking outside
        const botHandDialog = document.getElementById('bot-hand-dialog');
        if (botHandDialog) {
            botHandDialog.addEventListener('click', (e) => {
                if (e.target === botHandDialog) {
                    this.closeBotHandDialog();
                }
            });
        }

        // Cancel redirect button for Jack trap (resumes reactive countdown if present)
        const cancelRedirectBtn = document.getElementById('cancel-redirect');
        if (cancelRedirectBtn) cancelRedirectBtn.addEventListener('click', () => {
            const dialog = document.getElementById('redirect-dialog');
            if (dialog) dialog.classList.remove('visible');
                // User explicitly cancels the countdown window: resolve the prompt as not activated
                try {
                    if (this._reactiveResolve) this._reactiveResolve({ activated: false });
                } catch (e) { console.warn('Error resolving reactive prompt on cancel', e); }
                this._clearReactiveState();
        });

        // Cancel-trap dialog handlers
        const cancelTrapCancel = document.getElementById('cancel-trap-cancel');
        if (cancelTrapCancel) cancelTrapCancel.addEventListener('click', () => {
            const dlg = document.getElementById('cancel-trap-dialog');
            if (dlg) dlg.classList.remove('visible');
            this._resumeReactiveAfterCancel();
        });

        const cancelTrapConfirm = document.getElementById('cancel-trap-confirm');
        if (cancelTrapConfirm) cancelTrapConfirm.addEventListener('click', () => {
            const selected = document.querySelector('#cancel-trap-list .card.selected');
            if (!selected) return;
            const targetId = selected.dataset.cardId;
            // Close dialog
            const dlg = document.getElementById('cancel-trap-dialog');
            if (dlg) dlg.classList.remove('visible');

            // Find the target trap Card object from game state
            let targetTrap = null;
            for (const space of this.game.player.trapSpaces) if (space.card && space.card.id === targetId) targetTrap = space.card;
            for (const space of this.game.bot.trapSpaces) if (space.card && space.card.id === targetId) targetTrap = space.card;

            // Activate Queen with the selected target
            if (this.activatingTrap && this.activatingTrap.trap) {
                (async () => {
                    const queen = this.activatingTrap.trap;
                    try {
                        const res = await this.game.activateQueenTrap(queen, targetTrap);
                        if (this._reactiveResolve) this._reactiveResolve({ activated: true, trap: queen, result: { type: 'QUEEN', target: targetTrap, res } });
                        this._clearReactiveState();
                    } catch (err) {
                        console.warn('Failed to activate Queen via confirm dialog', err);
                        this._resumeReactiveAfterCancel();
                    }
                })();
            } else {
                this._resumeReactiveAfterCancel();
            }
        });
    }

    /**
     * Show deck list dialog
     */
    showDeckListDialog() {
        const dialog = document.getElementById('deck-list-dialog');
        const list = document.getElementById('deck-list');
        if (!dialog || !list) return;

        list.innerHTML = '';
        // Show top -> bottom (last items are top of deck)
        const cards = this.game.deck.cards.slice().reverse();
        if (cards.length === 0) {
            list.textContent = 'Deck is empty';
        } else {
            cards.forEach(card => {
                const el = document.createElement('div');
                el.classList.add('card-list-item');
                el.textContent = `${card.value}${card.suit ? ' of ' + card.suit : ''}`;
                list.appendChild(el);
            });
        }

        dialog.classList.add('visible');
    }

    /**
     * Show bot's hand in a dialog
     */
    showBotHandDialog() {
        const dialog = document.getElementById('bot-hand-dialog');
        const display = document.getElementById('bot-hand-display');
        const countSpan = document.getElementById('bot-hand-dialog-count');
        
        if (!dialog || !display) return;

        display.innerHTML = '';
        const botHand = this.game.bot.hand;
        countSpan.textContent = `(${botHand.length})`;

        if (botHand.length === 0) {
            display.textContent = 'Bot\'s hand is empty';
        } else {
            botHand.forEach(card => {
                // Temporarily flip card face-up for display
                const wasHidden = !card.faceUp;
                if (wasHidden) {
                    card.faceUp = true;
                }
                
                const cardElement = card.getElement(true); // Get visible card element
                cardElement.style.cursor = 'default';
                display.appendChild(cardElement);
                
                // Restore face-down state after creating the element
                if (wasHidden) {
                    card.faceUp = false;
                }
            });
        }

        dialog.classList.add('visible');
    }

    /**
     * Close bot's hand dialog
     */
    closeBotHandDialog() {
        const dialog = document.getElementById('bot-hand-dialog');
        if (dialog) {
            dialog.classList.remove('visible');
        }
    }

    /**
     * Show discard pile list dialog
     */
    showDiscardListDialog() {
        const dialog = document.getElementById('discard-list-dialog');
        const list = document.getElementById('discard-list');
        if (!dialog || !list) return;

        list.innerHTML = '';
        const cards = this.game.deck.discardPile.slice().reverse();
        if (cards.length === 0) {
            list.textContent = 'Discard pile is empty';
        } else {
            cards.forEach(card => {
                const el = document.createElement('div');
                el.classList.add('card-list-item');
                el.textContent = `${card.value}${card.suit ? ' of ' + card.suit : ''}`;
                list.appendChild(el);
            });
        }

        dialog.classList.add('visible');
    }

    /**
     * Initialize the UI
     */
    initialize() {
        // Reset message counter for new game
        this.nextMessageNumber = 1;
        
        this.updateGameState();
        TutorialManager.initializeTutorial();
    }

    /**
     * Update the entire game display
     */
    updateGameState() {
        this.updatePlayerHealth();
        this.updatePlayerHand();
        this.updateBoard();
        this.updateDeckAndDiscard();
        this.updateTurnAndPhase();
        this.updateHandCounts();
    }

    /**
     * Update player health displays
     */
    updatePlayerHealth() {
        document.getElementById('player-health').textContent = this.game.player.health;
        document.getElementById('bot-health').textContent = this.game.bot.health;
    }

    /**
     * Update player hand display
     */
    updatePlayerHand() {
        const handContainer = document.getElementById('player-hand');
        handContainer.innerHTML = '';
        
        this.game.player.hand.forEach(card => {
            const cardElement = card.getElement(true);
            
            // Only disable cards when it's not the player's turn or when specific conditions apply
            let shouldDisable = false;
            
            if (this.game.currentPlayer !== this.game.player || this.game.turnForcefullyEnded) {
                // Disable all cards during bot's turn or when turn was forcefully ended
                shouldDisable = true;
            } else if (this.game.currentPhase === PHASES.SETUP) {
                // During setup phase, disable cards that can't be played
                const canPlay = canPlayCard(card, this.game);
                shouldDisable = !canPlay;
            }
            // During other phases of player's turn (DRAW, BATTLE, END), keep cards enabled for interaction
            
            if (shouldDisable) {
                cardElement.classList.add('disabled');
            }
            
            if (this.selectedCard && this.selectedCard.id === card.id) {
                cardElement.classList.add('selected');
            }
            
            handContainer.appendChild(cardElement);
        });
    }

    /**
     * Update the board display
     */
    updateBoard() {
        // Update player monster spaces
        for (let i = 0; i < this.game.player.monsterSpaces.length; i++) {
            const space = document.getElementById(`player-monster-${i}`);
            space.innerHTML = '';
            
            const card = this.game.player.monsterSpaces[i].card;
            if (card) {
                const cardElement = card.getElement();
                
                // Highlight monsters that can attack in battle phase
                if (this.game.currentPhase === PHASES.BATTLE && 
                    this.game.currentPlayer === this.game.player &&
                    card.canAttack() &&
                    this.game.isAttackAllowedThisTurn(this.game.player)) {
                    cardElement.classList.add('can-attack');
                }
                
                // Mark visually if this monster already attacked this turn
                if (card.attackedThisTurn) {
                    cardElement.classList.add('attacked');
                } else {
                    cardElement.classList.remove('attacked');
                }
                
                space.appendChild(cardElement);
                // Forward clicks on the inner card element to the monster-space container
                try {
                    cardElement.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        if (space) space.click();
                    });
                } catch (e) {}
            }
        }
        
        // Update player trap spaces
        for (let i = 0; i < this.game.player.trapSpaces.length; i++) {
            const space = document.getElementById(`player-trap-${i}`);
            space.innerHTML = '';
            
            const card = this.game.player.trapSpaces[i].card;
            if (card) {
                const cardElement = card.getElement();

                // If card is face-down, apply face-down visual; otherwise show trap status
                if (!card.faceUp) {
                    cardElement.classList.add('face-down');
                }

                // Apply trap-specific classes based on active flag
                if (card.active) {
                    cardElement.classList.add('trap-active');
                    cardElement.classList.remove('trap-disabled');
                } else {
                    cardElement.classList.add('trap-disabled');
                    cardElement.classList.remove('trap-active');
                }

                space.appendChild(cardElement);
            }
        }
        
        // Update bot monster spaces
        for (let i = 0; i < this.game.bot.monsterSpaces.length; i++) {
            const space = document.getElementById(`bot-monster-${i}`);
            space.innerHTML = '';
            
            const card = this.game.bot.monsterSpaces[i].card;
            if (card) {
                // Always face-down for bot unless it's a monster
                if (isMonsterCard(card)) {
                    card.flipFaceUp();
                }
                const cardElement = card.getElement();
                    // Visual attacked state for bot monsters as well
                    if (card.attackedThisTurn) {
                        cardElement.classList.add('attacked');
                    }
                space.appendChild(cardElement);
                // Forward clicks on the inner card element to the monster-space container (ensure fusion cards clickable)
                try {
                    cardElement.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        if (space) space.click();
                    });
                } catch (e) {}
            }
        }
        
        // Update bot trap spaces
        for (let i = 0; i < this.game.bot.trapSpaces.length; i++) {
            const space = document.getElementById(`bot-trap-${i}`);
            space.innerHTML = '';
            
            const card = this.game.bot.trapSpaces[i].card;
            if (card) {
                // Bot traps remain face-down for player
                const cardElement = card.getElement();
                if (!card.faceUp) cardElement.classList.add('face-down');
                space.appendChild(cardElement);
            }
        }
        
        // Highlight spaces based on current phase
        this.highlightSpacesForCurrentPhase();
    }

    /**
     * Highlight board spaces based on the current phase
     */
    highlightSpacesForCurrentPhase() {
        // Clear all highlights
        document.querySelectorAll('.monster-space, .trap-space').forEach(space => {
            space.classList.remove('highlight');
            space.classList.remove('phase-highlight');
        });
        
        if (this.game.currentPlayer !== this.game.player) return;
        
        if (this.game.currentPhase === PHASES.SETUP) {
            // Highlight empty player spaces for card placement
            this.game.player.monsterSpaces.forEach((space, i) => {
                if (!space.card) {
                    document.getElementById(`player-monster-${i}`).classList.add('phase-highlight');
                }
            });
            
            this.game.player.trapSpaces.forEach((space, i) => {
                if (!space.card) {
                    document.getElementById(`player-trap-${i}`).classList.add('phase-highlight');
                }
            });
        } else if (this.game.currentPhase === PHASES.BATTLE && this.game.isAttackAllowedThisTurn(this.game.player)) {
            // Highlight attackable spaces
            this.game.player.monsterSpaces.forEach((space, i) => {
                if (space.card && space.card.canAttack()) {
                    document.getElementById(`player-monster-${i}`).classList.add('phase-highlight');
                }
            });
        }
    }

    /**
     * Update deck and discard pile displays
     */
    updateDeckAndDiscard() {
        const deckCountEl = document.getElementById('deck-count');
        if (deckCountEl) deckCountEl.textContent = this.game.deck.getDeckCount();

        const discardCountEl = document.getElementById('discard-count');
        if (discardCountEl) discardCountEl.textContent = this.game.deck.getDiscardCount();

        const discardPile = document.getElementById('discard-pile');
        if (!discardPile) return;
        discardPile.innerHTML = '';

        if (this.game.deck.getDiscardCount() > 0) {
            const cardBack = document.createElement('div');
            cardBack.classList.add('card', 'card-back');
            discardPile.appendChild(cardBack);
        } else {
            const emptyCard = document.createElement('div');
            emptyCard.classList.add('card', 'card-back', 'discard-empty');
            discardPile.appendChild(emptyCard);
        }
    }

    /**
     * Update turn and phase indicators
     */
    updateTurnAndPhase() {
        const turnIndicator = document.getElementById('turn-indicator');
        if (turnIndicator) turnIndicator.textContent = `Current Turn: ${this.game.currentPlayer === this.game.player ? this.game.player.name : 'Bot'}`;

        const phaseIndicator = document.getElementById('phase-indicator');
        if (phaseIndicator) phaseIndicator.textContent = `Phase: ${this.game.currentPhase}`;

        // Update end phase button
        const endPhaseBtn = document.getElementById('end-phase-btn');

        if (this.game.currentPlayer === this.game.player) {
            if (endPhaseBtn) endPhaseBtn.disabled = false;
            endPhaseBtn.textContent = `End ${this.game.currentPhase} Phase`;
        } else {
            endPhaseBtn.disabled = true;
            endPhaseBtn.textContent = 'Bot Turn';
        }
        // Update board background/area classes based on current player and phase
        try {
            const boardEl = document.querySelector('.game-board');
            if (boardEl) {
                // Remove any existing phase-player/bot classes
                boardEl.classList.remove(
                    'phase-player-SETUP','phase-player-BATTLE','phase-player-END',
                    'phase-bot-SETUP','phase-bot-BATTLE','phase-bot-END'
                );
                const owner = this.game.currentPlayer === this.game.player ? 'player' : 'bot';
                boardEl.classList.add(`phase-${owner}-${this.game.currentPhase}`);
            }

            // Add subtle accent to the active player's area
            const playerArea = document.querySelector('.player-area-human');
            const botArea = document.querySelector('.bot-area');
            if (playerArea) playerArea.classList.toggle('phase-active', this.game.currentPlayer === this.game.player);
            if (botArea) botArea.classList.toggle('phase-active', this.game.currentPlayer !== this.game.player);
        } catch (e) { /* non-fatal UI update failure */ }
    }    /**
     * Update hand counts
     */
    updateHandCounts() {
        document.getElementById('player-hand-count').textContent = this.game.player.hand.length;
        document.getElementById('bot-hand-count').textContent = this.game.bot.hand.length;
    }

    /**
     * Handle card selection in hand
     * @param {string} cardId - Selected card ID
     */
    handleCardSelection(cardId) {
        // Only allow interaction during player's turn and if turn wasn't forcefully ended
        if (this.game.currentPlayer !== this.game.player || this.game.turnForcefullyEnded) {
            return;
        }
        
        const card = this.game.player.hand.find(c => c.id === cardId);
        if (!card) return;
        
        // During SETUP phase, allow full card playing functionality
        if (this.game.currentPhase !== PHASES.SETUP) {
            // During other phases, just select the card for viewing but don't allow playing
            this.selectedCard = (this.selectedCard && this.selectedCard.id === card.id) ? null : card;
            this.updatePlayerHand();
            return;
        }
        
        // Check if card can be played
        if (!canPlayCard(card, this.game)) {
            this.addLogMessage('Cannot play this card');
            return;
        }
        
        // Special case for Joker - confirm and play immediately
        if (card.value === CARD_VALUES.JOKER) {
            if (confirm('Play Joker? This will reset the board and both hands.')) {
                this.game.playJoker(card);
            }
            return;
        }
        // If already selected and clicked again -> attempt to play
        if (this.selectedCard && this.selectedCard.id === card.id) {
            // Attempt to play based on card type
            const cardType = getCardType(card.value);
            console.log('Attempting to play card:', card.value, 'type:', cardType);
            console.log('Game methods:', {
                playMonsterCard: typeof this.game.playMonsterCard,
                playTrapCard: typeof this.game.playTrapCard,
                playBigMonster: typeof this.game.playBigMonster,
                playJoker: typeof this.game.playJoker
            });
            if (cardType === CARD_TYPES.MONSTER_NORMAL) {
                // Find first empty monster space
                for (let i = 0; i < this.game.player.monsterSpaces.length; i++) {
                    if (!this.game.player.monsterSpaces[i].card) {
                        const res = this.game.playMonsterCard(card, i);
                        if (res) {
                            this.selectedCard = null;
                            this.updatePlayerHand();
                            this.game.ui.updateGameState();
                        }
                        break;
                    }
                }
            } else if (cardType === CARD_TYPES.MONSTER_BIG) {
                // Open sacrifice dialog for the first empty monster space; if none are free, require a field-sacrifice
                let placed = false;
                for (let i = 0; i < this.game.player.monsterSpaces.length; i++) {
                    if (!this.game.player.monsterSpaces[i].card) {
                        this.showSacrificeDialog(card, i);
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    // No free space: require at least one field sacrifice to free a space
                    this.showSacrificeDialog(card, null, null, true);
                }
            } else if (cardType === CARD_TYPES.TRAP) {
                // Place on first empty trap space
                for (let i = 0; i < this.game.player.trapSpaces.length; i++) {
                    if (!this.game.player.trapSpaces[i].card) {
                        const res = this.game.playTrapCard(card, i);
                        if (res) {
                            this.selectedCard = null;
                            this.updatePlayerHand();
                            this.game.ui.updateGameState();
                        }
                        break;
                    }
                }
            }
            return;
        }

        // Otherwise select the card (highlight)
        this.selectedCard = card;
        this.updatePlayerHand();
    }

    /**
     * Handle click on player's monster space
     * @param {number} spaceIndex - Space index
     */
    handlePlayerMonsterSpaceClick(spaceIndex) {
        // If it's not player's turn or turn was forcefully ended, do nothing
        if (this.game.currentPlayer !== this.game.player || this.game.turnForcefullyEnded) {
            return;
        }
        
        const space = this.game.player.monsterSpaces[spaceIndex];
        
        // Setup phase - place monster
        if (this.game.currentPhase === PHASES.SETUP) {
            // If the clicked space already has a monster, treat this as a fusion attempt.
            if (space.card) {
                // If a card in hand is currently selected, deselect it so the user can pick the field monster for fusion
                if (this.selectedCard) {
                    this.selectedCard = null;
                    this.updatePlayerHand();
                }

                // Open fusion dialog for the monster at this field index
                this.handlePotentialFusion(spaceIndex);
                return;
            }

            // Otherwise, handle playing the currently selected hand card into this empty space (if any)
            if (this.selectedCard) {
                const cardType = getCardType(this.selectedCard.value);

                if (cardType === CARD_TYPES.MONSTER_NORMAL) {
                    // Normal monster - place directly if space empty
                    if (!space.card) {
                        const res = this.game.playMonsterCard(this.selectedCard, spaceIndex);
                        if (res) {
                            this.selectedCard = null;
                            this.updatePlayerHand();
                            this.game.ui.updateGameState();
                        }
                    }
                } else if (cardType === CARD_TYPES.MONSTER_BIG) {
                    // Big monster - require sacrifice
                    if (!space.card) {
                        this.showSacrificeDialog(this.selectedCard, spaceIndex);
                    } else {
                        // No free space here: require at least one field sacrifice
                        this.showSacrificeDialog(this.selectedCard, null, null, true);
                    }
                }
            }
        }
        // Battle phase - select attacker
        else if (this.game.currentPhase === PHASES.BATTLE) {
            // First turn restriction
            if (!this.game.isAttackAllowedThisTurn(this.game.player)) {
                this.addLogMessage('Cannot attack on the first turn');
                return;
            }
            
            if (!space.card || !space.card.canAttack()) {
                return;
            }
            
            this.selectedSpace = spaceIndex;
            console.debug('Player selected attacker space', spaceIndex);
            
            // Get valid attack targets
            const validTargets = this.game.board.getValidAttackTargets(
                this.game.player, 
                this.game.bot
            );
            
            // If the only valid target is direct (opponent has no monsters), perform direct attack immediately
            if (validTargets.length === 1 && validTargets[0] === null) {
                // Check for Ace trap or other defensive traps on the bot
                const activatableTraps = this.game.bot.getActivatableTraps({ type: 'battle-phase' });

                // No Ace trap, process direct attack
                this.game.processAttack(
                    this.selectedSpace,
                    null
                );

                // Mark the monster as having attacked this turn
                // Attack resolution will mark the attacking monster as having attacked;
                // do not set attackedThisTurn here (avoid pre-emptive state changes).

                // Clear selection and highlights
                this.selectedSpace = null;
                document.querySelectorAll('.monster-space, .player-area').forEach(element => {
                    element.classList.remove('highlight');
                });
            } else {
                // Highlight valid targets
                document.querySelectorAll('.monster-space').forEach(element => {
                    element.classList.remove('highlight');
                });
                
                validTargets.forEach(targetIndex => {
                    if (targetIndex === null) {
                        // Direct attack - highlight bot player area
                        document.querySelector('.bot-area').classList.add('highlight');
                    } else {
                        document.getElementById(`bot-monster-${targetIndex}`).classList.add('highlight');
                    }
                });
                
                document.getElementById(`player-monster-${spaceIndex}`).classList.add('highlight');
                this.addLogMessage('Select a target for your attack');
            }
        }
    }

    /**
     * Handle click on bot's monster space
     * @param {number} spaceIndex - Space index
     */
    handleBotMonsterSpaceClick(spaceIndex) {
        // Battle phase - select target
        if (this.game.currentPhase === PHASES.BATTLE && 
            this.game.currentPlayer === this.game.player &&
            this.selectedSpace !== null) {
            
            // First turn restriction
            if (!this.game.isAttackAllowedThisTurn(this.game.player)) {
                this.addLogMessage('Cannot attack on the first turn');
                return;
            }
            
            // Check if this is a valid target
            const validTargets = this.game.board.getValidAttackTargets(
                this.game.player, 
                this.game.bot
            );
            
            console.debug('handleBotMonsterSpaceClick: selectedSpace=', this.selectedSpace, 'clickedTarget=', spaceIndex, 'validTargets=', validTargets);
            if (validTargets.includes(spaceIndex)) {
                // Add attack target highlighting
                this.clearAttackHighlights();
                document.getElementById(`bot-monster-${spaceIndex}`).classList.add('attack-target');
                document.getElementById(`player-monster-${this.selectedSpace}`).classList.add('highlight');
                
                // Check if opponent has activatable traps
                const activatableTraps = this.game.bot.getActivatableTraps({ type: 'attack' });
                
                // No traps, process attack directly
                this.game.processAttack(
                    this.selectedSpace, 
                    spaceIndex
                );
                
                // Mark the monster as having attacked this turn
                // Attack resolution will mark the attacking monster as having attacked;
                // do not set attackedThisTurn here (avoid pre-emptive state changes).
                
                // Brief delay to show the attack target before clearing
                setTimeout(() => {
                    // Clear selection and highlights
                    this.selectedSpace = null;
                    this.clearAttackHighlights();
                    document.querySelectorAll('.monster-space, .player-area').forEach(element => {
                        element.classList.remove('highlight');
                    });
                }, 600);
            }
        }
    }

    /**
     * Handle direct attack on bot
     */
    handleBotDirectAttack() {
        // Battle phase - direct attack
        if (this.game.currentPhase === PHASES.BATTLE && 
            this.game.currentPlayer === this.game.player &&
            this.selectedSpace !== null) {
            
            // First turn restriction
            if (!this.game.isAttackAllowedThisTurn(this.game.player)) {
                this.addLogMessage('Cannot attack on the first turn');
                return;
            }
            
            // Check if direct attack is valid
            const validTargets = this.game.board.getValidAttackTargets(
                this.game.player, 
                this.game.bot
            );
            
            if (validTargets.includes(null)) {
                // Add direct attack target highlighting
                this.clearAttackHighlights();
                document.querySelector('.bot-area').classList.add('direct-attack-target');
                document.getElementById(`player-monster-${this.selectedSpace}`).classList.add('highlight');
                
                // Check if opponent has Ace trap
                const activatableTraps = this.game.bot.getActivatableTraps({ type: 'battle-phase' });
                
                // No Ace trap, process direct attack
                this.game.processAttack(
                    this.selectedSpace, 
                    null
                );
                
                // Brief delay to show the attack target before clearing
                setTimeout(() => {
                    // Clear selection and highlights
                    this.selectedSpace = null;
                    this.clearAttackHighlights();
                    document.querySelectorAll('.monster-space, .player-area').forEach(element => {
                        element.classList.remove('highlight');
                    });
                }, 600);
            }
        }
    }

    /**
     * Clear all attack target highlights
     */
    clearAttackHighlights() {
        document.querySelectorAll('.monster-space').forEach(element => {
            element.classList.remove('attack-target');
        });
        document.querySelectorAll('.player-area').forEach(element => {
            element.classList.remove('direct-attack-target');
        });
    }

    /**
     * Handle click on player's trap space
     * @param {number} spaceIndex - Space index
     */
    handlePlayerTrapSpaceClick(spaceIndex) {
        // If it's not player's turn or not setup phase, do nothing
        if (this.game.currentPlayer !== this.game.player || 
            this.game.currentPhase !== PHASES.SETUP) {
            return;
        }
        
        const space = this.game.player.trapSpaces[spaceIndex];
        
        // Place trap card if selected
        if (this.selectedCard) {
            const cardType = getCardType(this.selectedCard.value);
            
            if (cardType === CARD_TYPES.TRAP) {
                if (!space.card) {
                    const res = this.game.playTrapCard(this.selectedCard, spaceIndex);
                    if (res) {
                        this.selectedCard = null;
                        this.updatePlayerHand();
                        this.game.ui.updateGameState();
                    }
                }
            }
        }
    }

    /**
     * Show sacrifice dialog for big monster
     * @param {Card} card - Big monster card
     * @param {number} targetSpace - Target space index
     */
    // Show sacrifice dialog
    // card: the big monster being summoned
    // targetSpace: preferred target space index (may be null when none free)
    // postCallback: optional callback after sacrifices are confirmed
    // requireFieldSacrifice: if true, the player must sacrifice at least one monster from the field
    showSacrificeDialog(card, targetSpace, postCallback = null, requireFieldSacrifice = false) {
        this.sacrificeCards = [];
        this.selectedCard = card;
        this.selectedSpace = targetSpace;
        this._postSacrificeCallback = postCallback;
        this._requireFieldSacrifice = !!requireFieldSacrifice;
        
        const dialog = document.getElementById('sacrifice-dialog');
        const requiredValue = getRequiredSacrificeValue(card);
        document.getElementById('required-value').textContent = requiredValue;
        
        // Populate sacrifice options
        const sacrificeContainer = document.getElementById('sacrifice-cards');
        sacrificeContainer.innerHTML = '';
        
    // Add cards from hand (except the selected big monster)
    // Section header for hand cards
    const handHeader = document.createElement('div');
    handHeader.classList.add('sacrifice-section-header');
    handHeader.textContent = 'Hand';
    sacrificeContainer.appendChild(handHeader);
        this.game.player.hand.forEach(handCard => {
            // Only allow monster cards from hand to be used as sacrifices
            if (handCard.id !== card.id && isMonsterCard(handCard)) {
                const cardWrapper = document.createElement('div');
                cardWrapper.classList.add('sacrifice-card-wrapper');
                
                // Render hand card view
                const cardElement = handCard.getElement(true);
                cardElement.addEventListener('click', () => this.toggleSacrificeCard(handCard.id));
                
                cardWrapper.appendChild(cardElement);
                sacrificeContainer.appendChild(cardWrapper);
            }
        });
        
    // Add monsters from field (only monster cards/fusions)
    // Section header for field monsters
    const fieldHeader = document.createElement('div');
    fieldHeader.classList.add('sacrifice-section-header');
    fieldHeader.textContent = 'Field';
    sacrificeContainer.appendChild(fieldHeader);
        this.game.player.monsterSpaces.forEach((space, index) => {
            // When this dialog was opened as a post-fusion sacrifice (this._postSacrificeCallback set)
            // the field-selected card that is part of the fusion should NOT be available as a sacrifice.
            if (space.card && isMonsterCard(space.card)) {
                if (this._postSacrificeCallback && typeof this.selectedSpace === 'number' && index === this.selectedSpace) {
                    // skip the field-selected fusion component
                    return;
                }
                const cardWrapper = document.createElement('div');
                cardWrapper.classList.add('sacrifice-card-wrapper');
                
                const cardElement = space.card.getElement();
                cardElement.addEventListener('click', () => this.toggleSacrificeCard(space.card.id));
                
                cardWrapper.appendChild(cardElement);
                sacrificeContainer.appendChild(cardWrapper);
            }
        });
        
    // Add total value display
        const totalElement = document.createElement('div');
        totalElement.classList.add('sacrifice-total');
        totalElement.id = 'sacrifice-total';
        totalElement.textContent = `Total Value: 0/${requiredValue}`;
        sacrificeContainer.appendChild(totalElement);
        
        // If a field-sacrifice is required, show a small hint
        if (this._requireFieldSacrifice) {
            const hint = document.createElement('div');
            hint.classList.add('sacrifice-section-header');
            hint.textContent = 'No free monster spaces — you must sacrifice at least one monster on the field';
            // insert after headers
            const parent = sacrificeContainer;
            parent.insertBefore(hint, parent.firstChild);
        }

        // Disable confirm button initially since no sacrifices are selected yet
        const confirmBtn = document.getElementById('confirm-sacrifice');
        if (confirmBtn) {
            confirmBtn.disabled = true;
        }

        dialog.classList.add('visible');
    }

    /**
     * Toggle a card in the sacrifice selection
     * @param {string} cardId - Card ID
     */
    toggleSacrificeCard(cardId) {
        // Find the card
        let card = this.game.player.hand.find(c => c.id === cardId);
        let cardValue = 0;
        
        if (!card) {
            // Check if it's on the field
            for (const space of this.game.player.monsterSpaces) {
                if (space.card && space.card.id === cardId) {
                    card = space.card;
                    break;
                }
            }
        }
        
        if (!card) return;
        
        // Get card value
        if (card.isFusion) {
            cardValue = card.fusionStrength;
        } else {
            cardValue = getCardNumericValue(card.value);
        }
        
        // Toggle selection
        const existingIndex = this.sacrificeCards.findIndex(c => c.id === cardId);
        if (existingIndex !== -1) {
            // Deselecting a card
            this.sacrificeCards.splice(existingIndex, 1);
        } else {
            // Selecting a new card
            this.sacrificeCards.push(card);
            
            // Optimize selection: if 3+ cards selected, check if we can reduce
            const requiredValue = getRequiredSacrificeValue(this.selectedCard);
            if (this.sacrificeCards.length >= 3) {
                this.optimizeSacrificeSelection(requiredValue);
            }
        }
        
        // Update visual selection for all cards
        this.updateSacrificeVisuals();
        
        // Update total value display
        const totalValue = getTotalCardValue(this.sacrificeCards);
        const requiredValue = getRequiredSacrificeValue(this.selectedCard);
        document.getElementById('sacrifice-total').textContent = 
            `Total Value: ${totalValue}/${requiredValue}`;
        
        // If field sacrifice is required, ensure at least one selected sacrifice is from the field
        let hasFieldSacrifice = false;
        if (this._requireFieldSacrifice) {
            for (const c of this.sacrificeCards) {
                // If the card is not present in hand, assume it's from the field
                if (!this.game.player.hand.find(h => h.id === c.id)) {
                    hasFieldSacrifice = true;
                    break;
                }
            }
        }

        // Enable/disable confirm button
        const confirmBtn = document.getElementById('confirm-sacrifice');
        if (confirmBtn) {
            confirmBtn.disabled = (totalValue < requiredValue) || (this._requireFieldSacrifice && !hasFieldSacrifice);
        }
    }

    /**
     * Optimize sacrifice selection to use minimum cards required
     * @param {number} requiredValue - Required sacrifice value
     */
    optimizeSacrificeSelection(requiredValue) {
        // Sort selected cards by value (descending)
        const sortedCards = [...this.sacrificeCards].sort((a, b) => {
            const valA = a.isFusion ? a.fusionStrength : getCardNumericValue(a.value);
            const valB = b.isFusion ? b.fusionStrength : getCardNumericValue(b.value);
            return valB - valA;
        });
        
        // Find minimum set of cards that meets requirement
        let minimalSet = [];
        let currentTotal = 0;
        
        // Try to find a 2-card combination first
        for (let i = 0; i < sortedCards.length; i++) {
            const val1 = sortedCards[i].isFusion ? sortedCards[i].fusionStrength : getCardNumericValue(sortedCards[i].value);
            for (let j = i + 1; j < sortedCards.length; j++) {
                const val2 = sortedCards[j].isFusion ? sortedCards[j].fusionStrength : getCardNumericValue(sortedCards[j].value);
                if (val1 + val2 >= requiredValue) {
                    // Found a valid 2-card combination, use the highest values
                    minimalSet = [sortedCards[i], sortedCards[j]];
                    currentTotal = val1 + val2;
                    break;
                }
            }
            if (minimalSet.length > 0) break;
        }
        
        // If no 2-card combo found, use greedy approach (shouldn't happen if we got here with 3+ cards)
        if (minimalSet.length === 0) {
            for (const card of sortedCards) {
                const val = card.isFusion ? card.fusionStrength : getCardNumericValue(card.value);
                minimalSet.push(card);
                currentTotal += val;
                if (currentTotal >= requiredValue) break;
            }
        }
        
        // If field sacrifice is required, ensure at least one field card is in the minimal set
        if (this._requireFieldSacrifice) {
            const hasFieldCard = minimalSet.some(c => !this.game.player.hand.find(h => h.id === c.id));
            if (!hasFieldCard) {
                // Find a field card in the original selection
                const fieldCard = this.sacrificeCards.find(c => !this.game.player.hand.find(h => h.id === c.id));
                if (fieldCard && !minimalSet.includes(fieldCard)) {
                    // Replace the lowest value card with the field card if needed
                    minimalSet.sort((a, b) => {
                        const valA = a.isFusion ? a.fusionStrength : getCardNumericValue(a.value);
                        const valB = b.isFusion ? b.fusionStrength : getCardNumericValue(b.value);
                        return valA - valB;
                    });
                    minimalSet[0] = fieldCard;
                }
            }
        }
        
        // Update the sacrifice cards array
        this.sacrificeCards = minimalSet;
    }

    /**
     * Update visual selection for all sacrifice cards
     */
    updateSacrificeVisuals() {
        document.querySelectorAll('.sacrifice-card-wrapper .card').forEach(element => {
            const cardId = element.dataset.cardId;
            const isSelected = this.sacrificeCards.some(c => c.id === cardId);
            if (isSelected) {
                element.classList.add('selected');
            } else {
                element.classList.remove('selected');
            }
        });
    }

    /**
     * Close sacrifice dialog
     */
    closeSacrificeDialog() {
        // If this sacrifice dialog was opened as a post-fusion step (a post callback exists),
        // capture context so we can return to the fusion dialog if the user cancels.
        const wasPostFusion = !!this._postSacrificeCallback;
        const returnHandCardId = this.selectedCard ? this.selectedCard.id : null;
        const returnFieldIndex = (typeof this.fusionFieldIndex === 'number') ? this.fusionFieldIndex : null;

        document.getElementById('sacrifice-dialog').classList.remove('visible');
        this.sacrificeCards = [];
        this.selectedCard = null;
        this.selectedSpace = null;

        // Clear the post-callback since the user cancelled the sacrifice
        if (wasPostFusion) {
            this._postSacrificeCallback = null;
            // Re-open the fusion dialog and pre-select the same hand candidate so the user can try again
            if (returnFieldIndex !== null) {
                // Use a short timeout to ensure DOM/dialog transitions complete before reopening
                setTimeout(() => {
                    this.showFusionDialog(returnFieldIndex);
                    if (returnHandCardId) {
                        const handCard = this.game.player.hand.find(c => c.id === returnHandCardId);
                        if (handCard) this.selectFusionCard(handCard);
                    }
                }, 10);
            }
        }
    }

    /**
     * Confirm sacrifice and play big monster
     */
    confirmSacrifice() {
        const totalValue = getTotalCardValue(this.sacrificeCards);
        const requiredValue = getRequiredSacrificeValue(this.selectedCard);
        
        if (totalValue >= requiredValue) {
            // If a field-sacrifice was required, ensure at least one of the sacrifices was a field monster
            if (this._requireFieldSacrifice) {
                const hasField = this.sacrificeCards.some(c => !this.game.player.hand.find(h => h.id === c.id));
                if (!hasField) {
                    this.addLogMessage('You must sacrifice at least one monster on the field to summon when no spaces are free');
                    return;
                }
                // If selectedSpace is not set, pick the first sacrificed field monster's space as the placement target
                if (this.selectedSpace === null || typeof this.selectedSpace === 'undefined') {
                    for (let i = 0; i < this.game.player.monsterSpaces.length; i++) {
                        const s = this.game.player.monsterSpaces[i];
                        if (s.card && this.sacrificeCards.find(sc => sc.id === s.card.id)) {
                            this.selectedSpace = i;
                            break;
                        }
                    }
                }
            }

            if (this._postSacrificeCallback) {
                // consume sacrifices (remove and discard) then run callback
                if (typeof this.game.player.sacrificeCards === 'function') {
                    this.game.player.sacrificeCards(this.sacrificeCards, this.game.deck);
                }
                try { this._postSacrificeCallback(this.sacrificeCards); } catch (e) {}
                this._postSacrificeCallback = null;
                this.closeSacrificeDialog();
            } else {
                this.game.playBigMonster(
                    this.selectedCard,
                    this.selectedSpace,
                    this.sacrificeCards
                );
                this.closeSacrificeDialog();
            }
        }
    }

    /**
     * Handle potential fusion
     * @param {number} spaceIndex - Space index
     */
    handlePotentialFusion(spaceIndex) {
        // Only in setup phase
        if (this.game.currentPhase !== PHASES.SETUP) return;
        
        const initialMonster = this.game.player.monsterSpaces[spaceIndex].card;
        if (!initialMonster || !isMonsterCard(initialMonster) || initialMonster.isFusion) return;

        // Show fusion dialog for the monster at this field index
        this.showFusionDialog(spaceIndex);
    }

    /**
     * Show fusion dialog
     * @param {number} fieldIndex - index of the field monster selected for fusion
     */
    showFusionDialog(fieldIndex) {
        // fieldIndex is the index of the monster on the player's field that was clicked
        const initialMonster = this.game.player.monsterSpaces[fieldIndex].card;
        if (!initialMonster) return;

        this.fusionFieldIndex = fieldIndex;
        this.fusionSelectedHandCardId = null;

        const dialog = document.getElementById('fusion-dialog');
        const fusionContainer = document.getElementById('fusion-monsters');
        fusionContainer.innerHTML = '';

    // Top area: show the selected field monster (left) and an explanation
    const topArea = document.createElement('div');
    topArea.classList.add('fusion-top-area');

    const initialWrapper = document.createElement('div');
    initialWrapper.classList.add('fusion-card-wrapper', 'field-selected');
    const initialElement = initialMonster.getElement();
    initialElement.classList.add('selected');
    initialWrapper.appendChild(initialElement);

    const desc = document.createElement('div');
    desc.classList.add('fusion-selected-description');
    desc.textContent = 'Selected field monster for fusion';

    topArea.appendChild(initialWrapper);
    topArea.appendChild(desc);
    fusionContainer.appendChild(topArea);

        // Bottom row: grid of valid candidates from hand (strictly lower numeric value)
    const bottomRow = document.createElement('div');
    bottomRow.classList.add('fusion-cards-row', 'fusion-candidates');

    // Candidate header to clarify these are from hand and valid options
    const candHeader = document.createElement('div');
    candHeader.classList.add('fusion-candidates-header');
    candHeader.textContent = 'Valid fusion candidates from hand';
    fusionContainer.appendChild(candHeader);

        const initialValue = initialMonster.isFusion ? initialMonster.fusionStrength : getCardNumericValue(initialMonster.value);

        this.game.player.hand.forEach((handCard) => {
            if (!handCard) return;
            if (!isMonsterCard(handCard)) return;
            if (handCard.isFusion) return;

            const handValue = getCardNumericValue(handCard.value);
            if (handValue >= initialValue) return; // only strictly lower values

            const cardWrapper = document.createElement('div');
            cardWrapper.classList.add('fusion-card-wrapper');
            const cardElement = handCard.getElement(true);
            // Toggle selection: only one card may be selected at a time
            cardElement.addEventListener('click', () => {
                // Toggle selection
                if (this.fusionSelectedHandCardId === handCard.id) {
                    this.fusionSelectedHandCardId = null;
                    cardElement.classList.remove('selected');
                } else {
                    // Deselect any previously selected candidate
                    document.querySelectorAll('#fusion-monsters .card').forEach(el => el.classList.remove('selected'));
                    this.fusionSelectedHandCardId = handCard.id;
                    cardElement.classList.add('selected');
                }
            });

            cardWrapper.appendChild(cardElement);
            bottomRow.appendChild(cardWrapper);
        });

        fusionContainer.appendChild(bottomRow);

        // Clear any target spaces area (no separate target selection in this flow)
        document.getElementById('fusion-target-spaces').innerHTML = '';

        dialog.classList.add('visible');
    }

    /**
     * Select second monster for fusion
     * @param {Card} card - Second monster card
     */
    selectFusionCard(card) {
        // Toggle selection of a single hand candidate when called programmatically
        if (!card) return;
        const prev = this.fusionSelectedHandCardId;
        if (prev === card.id) {
            this.fusionSelectedHandCardId = null;
            const el = document.querySelector(`#fusion-monsters .card[data-card-id="${card.id}"]`);
            if (el) el.classList.remove('selected');
        } else {
            this.fusionSelectedHandCardId = card.id;
            document.querySelectorAll('#fusion-monsters .card').forEach(e => e.classList.remove('selected'));
            const el = document.querySelector(`#fusion-monsters .card[data-card-id="${card.id}"]`);
            if (el) el.classList.add('selected');
        }
    }

    /**
     * Show available target spaces for fusion
     */
    showFusionTargetSpaces() {
        if (this.fusionCards.length !== 2) return;
        
        const targetContainer = document.getElementById('fusion-target-spaces');
        targetContainer.innerHTML = '';
        
        // Find spaces where the fusion can go (either monster1, monster2, or empty space)
        let monster1Index = -1;
        let monster2Index = -1;
        
        // Find the indices of the two monsters
        for (let i = 0; i < this.game.player.monsterSpaces.length; i++) {
            const space = this.game.player.monsterSpaces[i];
            if (space.card) {
                if (space.card.id === this.fusionCards[0].id) {
                    monster1Index = i;
                } else if (space.card.id === this.fusionCards[1].id) {
                    monster2Index = i;
                }
            }
        }
        
        // Add target spaces
        this.game.player.monsterSpaces.forEach((space, index) => {
            // Allow target if it's one of the monster spaces or empty
            if (index === monster1Index || index === monster2Index || space.card === null) {
                const spaceElement = document.createElement('div');
                spaceElement.classList.add('monster-space');
                
                // If it's one of the monster spaces, show which one
                if (index === monster1Index || index === monster2Index) {
                    const monsterIndex = index === monster1Index ? 0 : 1;
                    const monsterCard = this.fusionCards[monsterIndex];
                    
                    const cardElement = monsterCard.getElement();
                    cardElement.classList.add('fusion-component');
                    spaceElement.appendChild(cardElement);
                }
                
                spaceElement.addEventListener('click', () => {
                    this.fusionTargetSpace = index;
                    
                    // Update visual selection
                    document.querySelectorAll('#fusion-target-spaces .monster-space').forEach(el => {
                        el.classList.remove('selected');
                    });
                    spaceElement.classList.add('selected');
                });
                
                targetContainer.appendChild(spaceElement);
            }
        });
    }

    /**
     * Close fusion dialog
     */
    closeFusionDialog() {
        document.getElementById('fusion-dialog').classList.remove('visible');
        this.fusionCards = [];
        this.fusionTargetSpace = null;
    }

    /**
     * Confirm fusion
     */
    confirmFusion() {
        // New flow: field monster at fusionFieldIndex must be present, and a single hand candidate must be selected
        if (typeof this.fusionFieldIndex !== 'number') return;
        if (!this.fusionSelectedHandCardId) return;

        const initialMonster = this.game.player.monsterSpaces[this.fusionFieldIndex].card;
        if (!initialMonster) return;

        // Find the selected hand card object
        const handCard = this.game.player.hand.find(c => c.id === this.fusionSelectedHandCardId);
        if (!handCard) return;

        // Validate different values (defensive)
        const value1 = initialMonster.isFusion ? initialMonster.fusionStrength : getCardNumericValue(initialMonster.value);
        const value2 = handCard.isFusion ? handCard.fusionStrength : getCardNumericValue(handCard.value);
        if (value1 === value2) {
            this.addLogMessage('Cannot fuse monsters of equal strength');
            return;
        }

        // Use the field index as the target space for the fusion
        // If the chosen hand card is a Big Monster, prompt sacrifice dialog first (same as summoning that monster)
        const handCardType = getCardType(handCard.value);
        if (handCardType === CARD_TYPES.MONSTER_BIG) {
            // Close the fusion dialog so the player can clearly see the sacrifice dialog
            this.closeFusionDialog();
            // Show sacrifice dialog; after confirming sacrifices, create the fusion
            this.showSacrificeDialog(handCard, this.fusionFieldIndex, (sacrifices) => {
                // After sacrifices consumed, create fusion using initialMonster (field) + handCard
                // game.createFusion will remove the hand card if necessary and place fusion in the target
                this.game.createFusion(initialMonster, handCard, this.fusionFieldIndex);
                this.closeFusionDialog();
            });
        } else {
            this.game.createFusion(initialMonster, handCard, this.fusionFieldIndex);
            this.closeFusionDialog();
        }
    }

    /**
     * Show trap activation dialog
     * @param {Card} trap - Trap card
     * @param {Object} context - Activation context
     */
    showTrapActivationDialog(trap, context) {
        this.activatingTrap = {
            trap,
            context
        };
        
        const dialog = document.getElementById('trap-activation-dialog');
        const cardContainer = document.getElementById('trap-activation-card');
        
        cardContainer.innerHTML = '';
        
        // Create a clone of the trap card and flip it face up to show player
        const trapClone = trap.clone();
        trapClone.flipFaceUp();
        
        const cardElement = trapClone.getElement();
        cardContainer.appendChild(cardElement);
        
        dialog.classList.add('visible');
    }

    /**
     * Cancel trap activation
     */
    cancelTrapActivation() {
        document.getElementById('trap-activation-dialog').classList.remove('visible');
        
        // Resume attack processing
        if (this.activatingTrap && this.activatingTrap.context.resumeFunction) {
            this.activatingTrap.context.resumeFunction();
        }
        
        this.activatingTrap = null;
    }

    /**
     * Confirm trap activation
     */
    async confirmTrapActivation() {
        document.getElementById('trap-activation-dialog').classList.remove('visible');
        
        if (!this.activatingTrap) return;
        const { trap, context } = this.activatingTrap;

        // Handle different trap types
        if (trap.value === CARD_VALUES.ACE) {
            // End battle phase (allow Queen cancel before resolving)
            try {
                const res = await this.game.activateAceTrap(trap);
                // If Ace was canceled by Queen, report back via reactive resolver
                if (res && res.canceledByQueen) {
                    if (this._reactiveResolve) {
                        try { this._reactiveResolve({ activated: false, trap, result: { type: 'ACE', canceled: true } }); } catch (e) {}
                        this._clearReactiveState();
                    }
                } else {
                    if (this._reactiveResolve) {
                        try { this._reactiveResolve({ activated: true, trap, result: { type: 'ACE' } }); } catch (e) {}
                        this._clearReactiveState();
                    }
                }
            } catch (err) {
                console.warn('Error activating Ace trap', err);
                if (this._reactiveResolve) {
                    try { this._reactiveResolve({ activated: false }); } catch (e) {}
                    this._clearReactiveState();
                }
            }
        } else if (trap.value === CARD_VALUES.JACK) {
            // Show redirect dialog
            this.showRedirectDialog(trap, context);
            return; // Don't clear activatingTrap yet - wait for redirect confirmation
        } else if (trap.value === CARD_VALUES.QUEEN) {
            // Cancel another trap
            this.game.activateQueenTrap(trap, context.targetTrap);
            if (this._reactiveResolve) {
                this._reactiveResolve({ activated: true, trap, result: { type: 'QUEEN' } });
                this._clearReactiveState();
            }
        } else if (trap.value === CARD_VALUES.KING) {
            // Halve attack strength
            // King activation may re-run the attack with kingEffect true
            (async () => {
                const res = await this.game.activateKingTrap(trap, context);
                if (this._reactiveResolve) {
                    this._reactiveResolve({ activated: true, trap, result: { type: 'KING', res } });
                    this._clearReactiveState();
                }
            })();
        }

        // Clear activatingTrap unless Jack (handled above)
        this.activatingTrap = null;
    }

    /**
     * Show redirect dialog for Jack trap
     * @param {Card} trap - Jack trap card
     * @param {Object} context - Attack context
     */
    showRedirectDialog(trap, context) {
        this.redirectTargets = this.game.board.getValidRedirectTargets(
            context.attackerIndex,
            context.attacker,
            context.defenderIndex,
            context.defender
        );
        
        if (this.redirectTargets.length === 0) {
            this.addLogMessage('No valid redirect targets');
            return;
        }
        
        const dialog = document.getElementById('redirect-dialog');
        const targetsContainer = document.getElementById('redirect-targets');
        
        targetsContainer.innerHTML = '';
        
        // Add each redirect target to the dialog list
        this.redirectTargets.forEach((target, index) => {
            const targetWrapper = document.createElement('div');
            targetWrapper.classList.add('redirect-target-wrapper');

            const cardElement = target.player.monsterSpaces[target.index].card.getElement();
            cardElement.addEventListener('click', () => this.selectRedirectTarget(index));

            targetWrapper.appendChild(cardElement);
            targetsContainer.appendChild(targetWrapper);
        });

        // Additionally highlight valid monsters on the board (except the original attacker) so player can click the field directly
        this._applyBoardRedirectHighlights(context.attackerIndex, context.attacker);

        dialog.classList.add('visible');
    }

    /**
     * Select a redirect target
     * @param {number} index - Target index
     */
    selectRedirectTarget(index) {
        // Update visual selection
        document.querySelectorAll('#redirect-targets .card').forEach(element => {
            element.classList.remove('selected');
        });
        
        document.querySelectorAll('#redirect-targets .card')[index].classList.add('selected');
        this.selectedSpace = index;
    }

    /**
     * Confirm redirect target
     */
    confirmRedirect() {
        document.getElementById('redirect-dialog').classList.remove('visible');
        
        if (this.selectedSpace === null || !this.activatingTrap) return;
        
        const target = this.redirectTargets[this.selectedSpace];
        const trap = this.activatingTrap.trap;
        
        // Activate Jack trap with redirect target
        (async () => {
            const result = this.game.activateJackTrap(
                trap,
                target.index,
                target.player
            );

            // Resolve reactive promise if waiting
            if (this._reactiveResolve) {
                try {
                    // activateJackTrap may return a redirect object
                    this._reactiveResolve({ activated: true, trap, result });
                } catch (e) {
                    try { this._reactiveResolve({ activated: true, trap }); } catch (e) {}
                }
                this._clearReactiveState();
            }

            this.activatingTrap = null;
            this.selectedSpace = null;
            this.redirectTargets = [];
            // clear any board highlights we added
            this._clearBoardRedirectHighlights();
        })();
    }

    /**
     * Apply visual highlights to monster spaces that are valid redirect targets
     * and attach click handlers so the player can select a target directly on the board.
     * @param {number} attackingIndex
     * @param {Player} attackingPlayer
     */
    _applyBoardRedirectHighlights(attackingIndex, attackingPlayer) {
        // compute valid targets again to be safe
        const targets = this.game.board.getValidRedirectTargets(
            attackingIndex,
            attackingPlayer,
            null,
            null
        );

        // store references for cleanup
        this._boardRedirectHandlers = this._boardRedirectHandlers || [];

        targets.forEach((t) => {
            const playerPrefix = t.player === this.game.player ? 'player' : 'bot';
            const selector = `#${playerPrefix}-monster-${t.index} .card`;
            const el = document.querySelector(selector);
            if (!el) return;
            el.classList.add('redirect-highlight');

            const handler = (e) => {
                e.stopPropagation();
                // find index in this.redirectTargets matching this player/index
                const idx = this.redirectTargets.findIndex(rt => rt.player === t.player && rt.index === t.index);
                if (idx !== -1) {
                    this.selectRedirectTarget(idx);
                    // ensure selection shows in dialog as well
                    const dialogEl = document.querySelectorAll('#redirect-targets .card')[idx];
                    if (dialogEl) {
                        document.querySelectorAll('#redirect-targets .card').forEach(c => c.classList.remove('selected'));
                        dialogEl.classList.add('selected');
                    }
                }
            };

            el._redirectClickHandler = handler;
            el.addEventListener('click', handler);
            this._boardRedirectHandlers.push(el);
        });
    }

    /** Clear board redirect highlights and handlers */
    _clearBoardRedirectHighlights() {
        if (!this._boardRedirectHandlers) return;
        this._boardRedirectHandlers.forEach(el => {
            el.classList.remove('redirect-highlight');
            if (el._redirectClickHandler) {
                el.removeEventListener('click', el._redirectClickHandler);
                delete el._redirectClickHandler;
            }
        });
        this._boardRedirectHandlers = [];
    }

    /**
     * Clear the reactive prompt state and UI highlights
     */
    _clearReactiveState() {
        // Remove highlights and listeners
        document.querySelectorAll('.trap-space .card.reactive-highlight').forEach(el => {
            el.classList.remove('reactive-highlight');
            el.removeEventListener('click', el._reactiveClickHandler);
            delete el._reactiveClickHandler;
        });

        // Clear countdown UI if present (inline container-aware)
        const cd = document.getElementById('trap-countdown');
        if (cd && cd.parentNode) {
            cd.parentNode.removeChild(cd);
        }
        const inlineArea = document.getElementById('reactive-trap-area');
        if (inlineArea) {
            inlineArea.innerHTML = '';
        }
        
        // Clear sidebar trap-reaction-container
        const sidebarContainer = document.getElementById('trap-reaction-container');
        if (sidebarContainer) {
            sidebarContainer.innerHTML = '';
            sidebarContainer.classList.remove('active');
        }

        // Also remove any temporary queen cancel dialog that may have been injected
        const qdlg = document.getElementById('queen-cancel-temp');
        if (qdlg && qdlg.parentNode) qdlg.parentNode.removeChild(qdlg);

        // Remove any other lightweight temp dialogs if present
        document.querySelectorAll('.temp-dialog').forEach(td => { if (td && td.parentNode) td.parentNode.removeChild(td); });

        // Clear resolver
        this._reactiveResolve = null;
        if (this._reactiveTimer) {
            clearInterval(this._reactiveTimer);
            this._reactiveTimer = null;
        }
    }

    /**
     * Prompt the human player (owner of the UI) to cancel an opponent's trap activation using a Queen.
     * Returns a promise that resolves to { canceled: boolean, queen?: Card }
     */
    promptCancelTrap(trap) {
        return new Promise((resolve) => {
            if (!trap) return resolve({ canceled: false });

            // Get all activatable traps in response to the opponent's trap activation
            const player = this.game.player;
            const activatableTraps = player.getActivatableTraps({ type: 'trap', trapValue: trap.value });

            if (!activatableTraps || activatableTraps.length === 0) return resolve({ canceled: false });

            // Map activatable traps to their spaces for display
            const trapSpaces = activatableTraps.map(card => {
                const idx = player.trapSpaces.findIndex(space => space.card && space.card.id === card.id);
                return { space: player.trapSpaces[idx], idx, card };
            }).filter(item => item.idx !== -1);

            // Use the trap-reaction-container in the left sidebar
            const container = document.getElementById('trap-reaction-container');
            if (!container) {
                console.warn('trap-reaction-container not found');
                return resolve({ canceled: false });
            }

            // Clear any existing content
            container.innerHTML = '';
            container.classList.add('active');

            const title = document.createElement('div');
            title.classList.add('reaction-title');
            title.textContent = 'Opponent activated a trap!';
            container.appendChild(title);

            const list = document.createElement('div');
            list.classList.add('reaction-trap-list');
            trapSpaces.forEach(({ space, idx, card }) => {
                const cardEl = card.getElement();
                cardEl.classList.add('reaction-trap-option');
                cardEl.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    // Activate the trap to respond
                    try {
                        const responseTrap = card;
                        // Clear container first
                        container.innerHTML = '';
                        container.classList.remove('active');
                        
                        // Handle different trap types
                        let res;
                        if (responseTrap.value === CARD_VALUES.QUEEN) {
                            res = await this.game.activateQueenTrap(responseTrap, trap);
                        } else if (responseTrap.value === CARD_VALUES.ACE) {
                            res = await this.game.activateAceTrap(responseTrap);
                        }
                        
                        // Update UI and clear reactive state
                        if (this.game && this.game.ui) this.game.ui.updateGameState();
                        this._clearReactiveState();
                        resolve({ canceled: true, trap: responseTrap, result: res });
                    } catch (err) {
                        console.warn('Failed to activate trap in response', err);
                        // Ensure reactive state resumes/clears
                        this._resumeReactiveAfterCancel();
                        resolve({ canceled: false });
                    }
                });
                list.appendChild(cardEl);
            });

            container.appendChild(list);

            // Cancel button (no countdown)
            const footer = document.createElement('div');
            footer.classList.add('reaction-footer');
            
            const cancelBtn = document.createElement('button');
            cancelBtn.classList.add('dialog-button');
            cancelBtn.textContent = 'Do not respond';
            cancelBtn.addEventListener('click', () => {
                container.innerHTML = '';
                container.classList.remove('active');
                resolve({ canceled: false });
            });
            
            footer.appendChild(cancelBtn);
            container.appendChild(footer);
        });
    }

    /** Deprecated - no longer using countdown timer */
    _pauseReactiveTimer() {
        // No-op: countdown removed
    }

    /** Deprecated - no longer using countdown timer */
    _resumeReactiveTimer(remaining) {
        // No-op: countdown removed
    }

    /** Deprecated - no longer using countdown timer */
    _resumeReactiveAfterCancel() {
        // No-op: countdown removed
    }

    /** Deprecated - no longer using countdown timer */
    _restartReactiveCountdown() {
        // No-op: countdown removed
    }

    /**
     * Prompt the human defender to react to an action with traps.
     * Returns a promise that resolves to {activated: boolean, trap?, result?}
     * The context should include attackerIndex, attacker, defenderIndex, defender
     */
    promptTrapResponse(context = {}) {
        return new Promise((resolve) => {
            if (!context || !context.defender) return resolve({ activated: false });

            const defender = context.defender;
            // Determine type: 'trap' for trap-to-trap response, 'attack'/'battle-phase' for attack responses
            let ttype = 'attack'; // Default
            if (context.defenderIndex === null) {
                ttype = 'battle-phase';
            } else if (context.trapValue !== undefined && !context.defenderIndex) {
                // This is a trap response (opponent just set a trap)
                ttype = 'trap';
            }
            
            const activatable = defender.getActivatableTraps({ type: ttype, trapValue: context.trapValue });
            if (!activatable || activatable.length === 0) return resolve({ activated: false });

            // Highlight activatable traps (only for human player)
            for (let i = 0; i < defender.trapSpaces.length; i++) {
                const space = defender.trapSpaces[i];
                if (!space.card) continue;
                if (!activatable.find(t => t.id === space.card.id)) continue;

                const selector = defender === this.game.player ? `#player-trap-${i}` : `#bot-trap-${i}`;
                const el = document.querySelector(`${selector} .card`);
                if (!el) continue;
                el.classList.add('reactive-highlight');

                    // Attach click handler for trap activation
                    const handler = (e) => {
                        e.stopPropagation();
                        (async () => {
                            try {
                                const trapCard = space.card;

                                // Handle trap activations and wait for result
                                if (trapCard.value === CARD_VALUES.JACK) {
                                    this.activatingTrap = { trap: trapCard, context };
                                    this.showRedirectDialog(trapCard, context);
                                    // Resolution handled by confirmRedirect or cancel-redirect
                                    return;
                                }

                                if (trapCard.value === CARD_VALUES.ACE) {
                                    const res = await this.game.activateAceTrap(trapCard);
                                    // If activation had effect that ends battle phase, resolve and clear
                                    if (res && res.effect && res.effect.endBattlePhase) {
                                        if (this._reactiveResolve) this._reactiveResolve({ activated: true, trap: trapCard, result: { type: 'ACE', effect: res.effect } });
                                        this._clearReactiveState();
                                        return;
                                    }
                                    // Ace activated successfully, allow player to continue reacting
                                    if (this._reactiveResolve) this._reactiveResolve({ activated: true, trap: trapCard, result: { type: 'ACE', effect: res && res.effect } });
                                    return;
                                }

                                if (trapCard.value === CARD_VALUES.KING) {
                                    const res = await this.game.activateKingTrap(trapCard, context);
                                    // King affects the attack; return the result and let processAttack handle it
                                    if (this._reactiveResolve) this._reactiveResolve({ activated: true, trap: trapCard, result: { type: 'KING', res } });
                                    this._clearReactiveState();
                                    return;
                                }

                                if (trapCard.value === CARD_VALUES.QUEEN) {
                                    // Queen: cancel an opponent's trap
                                    this.activatingTrap = { trap: trapCard, context };
                                    let autoTarget = null;
                                    
                                    // If this is a trap response (opponent just set a trap), auto-target that trap
                                    if (context.trapCard && ttype === 'trap') {
                                        autoTarget = context.trapCard;
                                    } else {
                                        // Otherwise, prefer to cancel the last used trap
                                        const last = this.game.lastTrapUsed;
                                        try {
                                            if (last) {
                                                const lastOwner = this.game.findTrapOwner(last);
                                                const queenOwner = this.game.findTrapOwner(trapCard);
                                                // Auto-target only if last trap belongs to opponent
                                                if (lastOwner && queenOwner && lastOwner !== queenOwner) {
                                                    autoTarget = last;
                                                }
                                            }
                                        } catch (err) { console.warn('Error checking lastTrapUsed', err); }
                                    }

                                    if (autoTarget) {
                                        const res = await this.game.activateQueenTrap(trapCard, autoTarget);
                                        if (res && res.success) {
                                            // Queen cancelled a trap, allow player to continue reacting
                                            if (this._reactiveResolve) this._reactiveResolve({ activated: true, trap: trapCard, result: { type: 'QUEEN', target: autoTarget } });
                                            return;
                                        }
                                    } else {
                                        // Fallback: show dialog to choose a trap to cancel
                                        this.showCancelTrapDialog(trapCard, context);
                                        // confirmation will resolve and clear reactive state
                                        return;
                                    }
                                }

                                // Fallback activation (shouldn't normally reach here)
                                const res = await this.game.activateQueenTrap(trapCard, context.targetTrap || context.trapCard);
                                if (res && res.success) {
                                    if (this._reactiveResolve) this._reactiveResolve({ activated: true, trap: trapCard });
                                    return;
                                }
                            } catch (err) {
                                console.warn('Reactive trap handler error', err);
                                // Attempt to clear state if something goes wrong
                                this._clearReactiveState();
                            }
                        })();
                    };

                    el._reactiveClickHandler = handler;
                    el.addEventListener('click', handler);
            }

            // Show reaction UI in the trap-reaction-container in the left sidebar
            const container = document.getElementById('trap-reaction-container');
            if (!container) {
                console.warn('trap-reaction-container not found');
                return resolve({ activated: false });
            }
            
            // Clear any existing content
            container.innerHTML = '';
            container.classList.add('active');
            
            const title = document.createElement('div');
            title.classList.add('reaction-title');
            title.textContent = 'Opponent is attacking!';
            container.appendChild(title);
            
            const message = document.createElement('div');
            message.classList.add('reaction-message');
            message.textContent = 'Click a trap to respond';
            message.style.fontSize = 'var(--font-body2)';
            message.style.color = 'var(--md-on-surface-variant)';
            message.style.marginBottom = 'var(--space-sm)';
            message.style.textAlign = 'center';
            container.appendChild(message);
            
            // Add cancel button in the footer
            const footer = document.createElement('div');
            footer.classList.add('reaction-footer');
            
            const cancelBtn = document.createElement('button');
            cancelBtn.classList.add('dialog-button');
            cancelBtn.textContent = 'Do not respond';
            cancelBtn.addEventListener('click', () => {
                try {
                    if (this._reactiveResolve) this._reactiveResolve({ activated: false });
                } catch (e) { console.warn('Error resolving reactive prompt on cancel', e); }
                this._clearReactiveState();
                container.innerHTML = '';
                container.classList.remove('active');
            });
            
            footer.appendChild(cancelBtn);
            container.appendChild(footer);

            this._reactiveResolve = resolve;
        });
    }

    /**
     * Show dialog listing opponent traps to cancel for Queen trap activation
     */
    showCancelTrapDialog(queenTrap, context) {
        const dialog = document.getElementById('cancel-trap-dialog');
        const list = document.getElementById('cancel-trap-list');
        if (!dialog || !list) return;

        list.innerHTML = '';

        // Gather potential targets from both players (face-up traps only)
        const candidates = [];
        [this.game.player, this.game.bot].forEach(p => {
            for (let i = 0; i < p.trapSpaces.length; i++) {
                const s = p.trapSpaces[i];
                if (s.card && s.card.id !== queenTrap.id) {
                    // show only traps that exist (Queen cancels traps except Joker per earlier rules)
                    candidates.push(s.card);
                }
            }
        });

        if (candidates.length === 0) {
            this.addLogMessage('No traps available to cancel');
            this._resumeReactiveAfterCancel();
            return;
        }

        candidates.forEach(card => {
            const wrapper = document.createElement('div');
            wrapper.classList.add('sacrifice-card-wrapper');
            const el = card.getElement();
            el.addEventListener('click', () => {
                // toggle selection
                document.querySelectorAll('#cancel-trap-list .card').forEach(c => c.classList.remove('selected'));
                el.classList.add('selected');
            });
            wrapper.appendChild(el);
            list.appendChild(wrapper);
        });

        dialog.classList.add('visible');
    }

    /**
     * Show fusion upkeep dialog
     * @param {Array} fusions - Active fusions
     */
    showFusionUpkeepDialog(fusions) {
        // Accept either a numeric count or an array of fusions
        const needed = Array.isArray(fusions) ? fusions.length : Number(fusions) || 0;

        // Only show upkeep UI during the End phase to avoid prompting mid-attack or during reactive trap handling
        if (this.game.currentPhase !== PHASES.END) {
            console.warn('showFusionUpkeepDialog called outside of END phase; ignoring');
            return;
        }

        this.sacrificeCards = [];

        const dialog = document.getElementById('fusion-upkeep-dialog');
        const upkeepContainer = document.getElementById('fusion-upkeep-cards');

        upkeepContainer.innerHTML = '';

        // Show how many cards need to be sacrificed
        const titleElement = document.createElement('div');
        titleElement.textContent = `Select ${needed} cards to sacrifice for fusion upkeep`;
        upkeepContainer.appendChild(titleElement);
        
        // Add monster cards from hand (exclude traps and jokers)
        this.game.player.hand.forEach(handCard => {
            const cardType = getCardType(handCard.value);
            if (cardType !== CARD_TYPES.TRAP && handCard.value !== CARD_VALUES.JOKER) {
                const cardWrapper = document.createElement('div');
                cardWrapper.classList.add('sacrifice-card-wrapper');
                
                const cardElement = handCard.getElement();
                cardElement.addEventListener('click', () => this.toggleUpkeepCard(handCard.id));
                
                cardWrapper.appendChild(cardElement);
                upkeepContainer.appendChild(cardWrapper);
            }
        });
        
        // Add non-fusion monsters from field
        this.game.player.monsterSpaces.forEach((space, index) => {
            if (space.card && !space.card.isFusion) {
                const cardWrapper = document.createElement('div');
                cardWrapper.classList.add('sacrifice-card-wrapper');
                
                const cardElement = space.card.getElement();
                cardElement.addEventListener('click', () => this.toggleUpkeepCard(space.card.id));
                
                cardWrapper.appendChild(cardElement);
                upkeepContainer.appendChild(cardWrapper);
            }
        });
        
    // Add counter
    const counterElement = document.createElement('div');
    counterElement.classList.add('sacrifice-total');
    counterElement.id = 'upkeep-counter';
    counterElement.textContent = `Selected: 0/${needed}`;
    upkeepContainer.appendChild(counterElement);
        
        // Find existing button container and add Skip button to it
        const existingButtons = dialog.querySelector('.dialog-buttons');
        if (existingButtons) {
            // Clear any existing skip button first
            const existingSkip = existingButtons.querySelector('.skip-upkeep-btn');
            if (existingSkip) {
                existingSkip.remove();
            }
            
            // Add Skip button to existing container
            const skipBtn = document.createElement('button');
            skipBtn.classList.add('dialog-button', 'skip-upkeep-btn');
            skipBtn.textContent = 'Skip Upkeep';
            skipBtn.addEventListener('click', () => {
                // Close and signal skip (empty sacrifices)
                document.getElementById('fusion-upkeep-dialog').classList.remove('visible');
                this.game.handleFusionUpkeep([], false);
                this.sacrificeCards = [];
            });

            existingButtons.appendChild(skipBtn);
        }

        dialog.classList.add('visible');
    }

    /**
     * Toggle upkeep card selection
     * @param {string} cardId - Card ID
     */
    toggleUpkeepCard(cardId) {
        // Find the card
        let card = this.game.player.hand.find(c => c.id === cardId);
        
        if (!card) {
            // Check if it's on the field
            for (const space of this.game.player.monsterSpaces) {
                if (space.card && !space.card.isFusion && space.card.id === cardId) {
                    card = space.card;
                    break;
                }
            }
        }
        
        if (!card) return;
        
        // Get required fusion count
        const fusionCount = this.game.board.countActiveFusions(this.game.player);
        
        // Toggle selection
        const existingIndex = this.sacrificeCards.findIndex(c => c.id === cardId);
        if (existingIndex !== -1) {
            // Remove from selection
            this.sacrificeCards.splice(existingIndex, 1);
        } else {
            // Add to selection only if under the limit
            if (this.sacrificeCards.length < fusionCount) {
                this.sacrificeCards.push(card);
            } else {
                // At limit - can't select more
                return;
            }
        }
        
        // Update visual selection
        document.querySelectorAll('.sacrifice-card-wrapper .card').forEach(element => {
            if (element.dataset.cardId === cardId) {
                element.classList.toggle('selected');
            }
        });
        
        // Update counter
        document.getElementById('upkeep-counter').textContent = 
            `Selected: ${this.sacrificeCards.length}/${fusionCount}`;
        
        // Enable/disable confirm button
        document.getElementById('confirm-fusion-upkeep').disabled = 
            (this.sacrificeCards.length < fusionCount && this.sacrificeCards.length < this.game.player.hand.length);
    }

    /**
     * Confirm fusion upkeep
     */
    confirmFusionUpkeep() {
        document.getElementById('fusion-upkeep-dialog').classList.remove('visible');
        
        const fusionCount = this.game.board.countActiveFusions(this.game.player);
        
        // If not enough cards were selected, handle breaking fusions automatically
        this.game.handleFusionUpkeep(this.sacrificeCards);
        
        this.sacrificeCards = [];
    }

    /**
     * Show discard dialog when over hand limit
     * @param {number} excess - Number of cards to discard
     */
    showDiscardDialog(excess) {
        this.sacrificeCards = []; // Reuse for discard selection
        
        const dialog = document.getElementById('discard-dialog');
        const discardContainer = document.getElementById('discard-cards');
        
        discardContainer.innerHTML = '';
        
        // Show instructions
        const titleElement = document.createElement('div');
        titleElement.textContent = `Select ${excess} cards to discard`;
        discardContainer.appendChild(titleElement);
        
        // Add cards from hand
        this.game.player.hand.forEach(handCard => {
            const cardWrapper = document.createElement('div');
            cardWrapper.classList.add('discard-card-wrapper');
            
            const cardElement = handCard.getElement();
            cardElement.addEventListener('click', () => this.toggleDiscardCard(handCard.id));
            
            cardWrapper.appendChild(cardElement);
            discardContainer.appendChild(cardWrapper);
        });
        
        // Add counter
        const counterElement = document.createElement('div');
        counterElement.classList.add('sacrifice-total');
        counterElement.id = 'discard-counter';
        counterElement.textContent = `Selected: 0/${excess}`;
        discardContainer.appendChild(counterElement);
        
        dialog.classList.add('visible');
    }

    /**
     * Toggle discard card selection
     * @param {string} cardId - Card ID
     */
    toggleDiscardCard(cardId) {
        // Find the card
        const card = this.game.player.hand.find(c => c.id === cardId);
        if (!card) return;
        
        // Toggle selection
        const existingIndex = this.sacrificeCards.findIndex(c => c.id === cardId);
        if (existingIndex !== -1) {
            this.sacrificeCards.splice(existingIndex, 1);
        } else {
            this.sacrificeCards.push(card);
        }
        
        // Update visual selection
        document.querySelectorAll('.discard-card-wrapper .card').forEach(element => {
            if (element.dataset.cardId === cardId) {
                element.classList.toggle('selected');
            }
        });
        
        // Update counter
        const excess = Math.max(0, this.game.player.hand.length - GAME_SETTINGS.MAX_HAND_SIZE);
        document.getElementById('discard-counter').textContent = 
            `Selected: ${this.sacrificeCards.length}/${excess}`;
        
        // Enable/disable confirm button
        document.getElementById('confirm-discard').disabled = (this.sacrificeCards.length !== excess);
    }

    /**
     * Confirm discard
     */
    confirmDiscard() {
        document.getElementById('discard-dialog').classList.remove('visible');
        
        this.game.discardExcessCards(this.sacrificeCards);
        
        this.sacrificeCards = [];
    }

    /**
     * Show game over dialog
     * @param {string} winner - 'player' or 'bot'
     */
    showGameOverDialog(winner) {
        const dialog = document.getElementById('game-over-dialog');
        const resultElement = document.getElementById('game-result');
        const messageElement = document.getElementById('game-over-message');
        
        if (winner === 'player') {
            resultElement.textContent = 'Victory!';
            messageElement.textContent = 'You have defeated your opponent!';
        } else {
            resultElement.textContent = 'Defeat';
            messageElement.textContent = 'Your opponent has defeated you.';
        }
        
        dialog.classList.add('visible');
    }

    /**
     * Add message to game log
     * @param {string} message - Log message
     */
    addLogMessage(message) {
        const logContent = document.getElementById('log-content');
        const logEntry = document.createElement('div');
        logEntry.classList.add('log-entry');
        
        // Each log entry gets the next sequential number
        const messageNumber = this.nextMessageNumber++;
        
        // Format: [#] message
        logEntry.textContent = `[${messageNumber}] ${message}`;
        
        logContent.appendChild(logEntry);
        logContent.scrollTop = logContent.scrollHeight;
    }

    /**
     * Highlight attacker and defender for attack visualization
     * @param {number} attackerIndex - Attacker monster index
     * @param {Player} attackerPlayer - Attacking player
     * @param {number|null} defenderIndex - Defender monster index (null for direct)
     * @param {Player} defenderPlayer - Defending player
     */
    highlightAttack(attackerIndex, attackerPlayer, defenderIndex, defenderPlayer) {
        // Clear any existing highlights
        this.clearAttackHighlights();
        
        // Highlight the attacking monster
        const attackerSelector = attackerPlayer === this.game.player ? 
            `#player-monster-${attackerIndex}` : 
            `#bot-monster-${attackerIndex}`;
        const attackerElement = document.querySelector(attackerSelector);
        if (attackerElement) {
            attackerElement.classList.add('attack-highlight', 'attacker-highlight');
        }
        
        // Highlight the defender
        if (defenderIndex !== null) {
            // Monster target
            const defenderSelector = defenderPlayer === this.game.player ?
                `#player-monster-${defenderIndex}` :
                `#bot-monster-${defenderIndex}`;
            const defenderElement = document.querySelector(defenderSelector);
            if (defenderElement) {
                defenderElement.classList.add('attack-highlight', 'defender-highlight');
            }
        } else {
            // Direct attack - highlight player area
            const defenderAreaSelector = defenderPlayer === this.game.player ?
                '.player-area-human .player-info' : 
                '.bot-area .player-info';
            const defenderArea = document.querySelector(defenderAreaSelector);
            if (defenderArea) {
                defenderArea.classList.add('attack-highlight', 'direct-attack-highlight');
            }
        }
    }

    /**
     * Clear all attack highlights
     */
    clearAttackHighlights() {
        document.querySelectorAll('.attack-highlight').forEach(el => {
            el.classList.remove('attack-highlight', 'attacker-highlight', 'defender-highlight', 'direct-attack-highlight');
        });
    }

    /**
     * Animate an attack
     * @param {number} attackerIndex - Attacker index
     * @param {Player} attackerPlayer - Attacking player
     * @param {number|null} defenderIndex - Defender index
     * @param {Player} defenderPlayer - Defending player
     * @returns {Promise} - Animation completion promise
     */
    async animateAttack(attackerIndex, attackerPlayer, defenderIndex, defenderPlayer) {
        // Get attacker space and its card element
        const attackerSelector = attackerPlayer === this.game.player ? `#player-monster-${attackerIndex}` : `#bot-monster-${attackerIndex}`;
        const attackerSpace = document.querySelector(attackerSelector);
        const attackerCard = attackerSpace ? attackerSpace.querySelector('.card') : null;

        // Add attacking animation on the card element only
        if (attackerCard) attackerCard.classList.add('anim-attack');

        // Wait for animation
        await delay(ANIMATION_DURATION);

        // Remove animation class
        if (attackerCard) attackerCard.classList.remove('anim-attack');
        
        // If direct attack, animate defending player area
        if (defenderIndex === null) {
            // Direct damage: animate the defender area container
            const defenderAreaSelector = defenderPlayer === this.game.player ? '.player-area-human' : '.bot-area';
            const defenderArea = document.querySelector(defenderAreaSelector);
            if (defenderArea) {
                defenderArea.classList.add('anim-damage');
                await delay(ANIMATION_DURATION);
                defenderArea.classList.remove('anim-damage');
            }
        } else {
            // Monster vs monster: animate defender card
            const defenderSelector = defenderPlayer === this.game.player ? `#player-monster-${defenderIndex}` : `#bot-monster-${defenderIndex}`;
            const defenderSpace = document.querySelector(defenderSelector);
            const defenderCard = defenderSpace ? defenderSpace.querySelector('.card') : null;
            if (defenderCard) {
                defenderCard.classList.add('anim-damage');
                await delay(ANIMATION_DURATION);
                defenderCard.classList.remove('anim-damage');
            }
        }
    }

    /**
     * Animate a card being destroyed
     * @param {number} spaceIndex - Space index
     * @param {string} spaceType - 'monster' or 'trap'
     * @param {Player} player - Card owner
     * @returns {Promise} - Animation completion promise
     */
    async animateDestroy(spaceIndex, spaceType, player) {
        const playerPrefix = player === this.game.player ? 'player' : 'bot';
        const elementSelector = `#${playerPrefix}-${spaceType}-${spaceIndex}`;
        const element = document.querySelector(elementSelector);
        
        if (!element) return Promise.resolve();
        
        const cardElement = element.querySelector('.card');
        if (!cardElement) return Promise.resolve();
        
        cardElement.classList.add('destroyed');
        
        return delay(ANIMATION_DURATION);
    }
}
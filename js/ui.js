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
        this.redirectTargets = [];
        this._postSacrificeCallback = null; // optional callback to run after sacrifice dialog confirm
        this._reaction = null; // pending trap-response prompt {context, resolve, jackTrap, targets, selectedTarget}
        this._queenPrompt = null; // pending Queen-cancel prompt {queens, selected, resolve}
        this.attackTarget = null; // chosen target while previewing an attack: {index} (index null = direct)
        this._phaseKey = null; // turn+phase last rendered, to drop stale attack selections
        this._fxHints = new Map(); // card id -> how to animate it leaving the board ('destroy' | 'reveal')
        this._boardCards = new Map(); // card id -> card, as of the last board render
        this._handIds = new Set(); // card ids in hand as of the last render, to animate new draws
        this._lastHealth = null; // health as of the last render, to show damage taken
        this._previewArrow = null; // dashed arrow while previewing an attack
        this._zoomTimer = null; // pending field-card zoom
        this._zoomSource = null; // card element being zoomed (or about to be)
        this.prompt = null; // open board prompt (sacrifice, trap response, upkeep...), see startPrompt

        // A new UI is created for every match, but the page's elements persist.
        // Bind listeners once and route them to whichever UI is current.
        UI.active = this;
        if (!UI.listenersBound) {
            UI.listenersBound = true;
            this.setupEventListeners();
        }
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        const ui = () => UI.active;
        const on = (id, handler) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', handler);
        };

        on('end-phase-btn', () => ui().game.endCurrentPhase());

        // Battle log drawer
        on('log-btn', () => ui().toggleLog());
        on('log-close', () => ui().toggleLog(false));

        // Menu (rules, new game, concede). Choosing an item closes it; so does clicking elsewhere.
        on('menu-btn', () => ui().toggleMenu());
        on('game-menu', () => ui().toggleMenu(false));
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.menu-wrap')) ui().toggleMenu(false);
        });

        // Fans, arrows and popups are placed in window coordinates, so redo them when the window changes
        window.addEventListener('resize', () => {
            ui().layoutHand();
            ui().renderBotHand();
            ui().hideAttackPreview();
            ui().cancelZoom();
            Fx.clearArrows();
        });

        // Esc backs out of whatever is open or selected
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') ui().handleEscape();
        });

        // Hovering or focusing the board: damage preview while choosing a target, card zoom otherwise
        const panel = document.querySelector('.board-panel');
        const onPoint = (e) => ui().handleBoardPointer(e.target);
        panel.addEventListener('mouseover', onPoint);
        panel.addEventListener('focusin', onPoint);
        panel.addEventListener('mouseleave', () => ui().handleBoardPointer(null));
        panel.addEventListener('focusout', (e) => {
            if (!panel.contains(e.relatedTarget)) ui().handleBoardPointer(null);
        });

        // Enter or Space on a highlighted space acts like a click
        panel.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const space = e.target.closest('.monster-space[tabindex], .trap-space[tabindex]');
            if (!space) return;
            e.preventDefault();
            space.click();
        });

        // A direct attack can be launched by clicking anywhere on the bot's side
        document.querySelector('.bot-area').addEventListener('click', (e) => {
            if (!e.target.closest('.monster-space')) ui().handleBotAreaClick();
        });

        // Card selection in hand
        const handEl = document.getElementById('player-hand');
        handEl.addEventListener('click', (e) => {
            const cardElement = e.target.closest('.card');
            if (!cardElement) return;
            ui().handleCardSelection(cardElement.dataset.cardId);
        });
        handEl.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const cardElement = e.target.closest('.card');
            if (!cardElement) return;
            e.preventDefault();
            ui().handleCardSelection(cardElement.dataset.cardId);
        });

        // Delegated listener for monster and trap spaces (robust when innerHTML changes)
        const boardEl = document.querySelector('.game-board') || document.body;
        boardEl.addEventListener('click', (e) => {
            const spaceEl = e.target.closest('.monster-space, .trap-space');
            if (!spaceEl || !boardEl.contains(spaceEl)) return;
            const isPlayer = spaceEl.id.startsWith('player');
            const spaceIndex = parseInt(spaceEl.dataset.index);
            if (spaceEl.classList.contains('monster-space')) {
                if (isPlayer) ui().handlePlayerMonsterSpaceClick(spaceIndex);
                else ui().handleBotMonsterSpaceClick(spaceIndex);
            } else if (isPlayer) {
                ui().handlePlayerTrapSpaceClick(spaceIndex);
            }
        });

        // New game reopens the welcome screen; concede ends the match as a loss
        on('new-game-btn', () => {
            const welcomeDialog = document.getElementById('welcome-dialog');
            if (welcomeDialog && !welcomeDialog.open) welcomeDialog.showModal();
        });
        on('concede-btn', () => {
            const game = ui().game;
            if (game.gameOver) return;
            if (confirm('Concede this duel? It counts as a loss.')) game.endGame('bot');
        });

        // Rules button opens the tutorial
        on('help-button', () => {
            const tutorialDialog = document.getElementById('tutorial-dialog');
            if (!tutorialDialog || tutorialDialog.open) return;
            if (typeof tutorialDialog.showModal === 'function') tutorialDialog.showModal();
            else tutorialDialog.classList.add('visible');
        });

        // Deck and discard pile click handlers (open listing dialogs)
        on('deck', () => ui().showDeckListDialog());
        on('discard-pile', () => ui().showDiscardListDialog());
        on('close-deck-list', () => document.getElementById('deck-list-dialog').classList.remove('visible'));
        on('close-discard-list', () => document.getElementById('discard-list-dialog').classList.remove('visible'));
    }

    /**
     * Show what is left in the deck, as card faces grouped by suit
     */
    showDeckListDialog() {
        const dialog = document.getElementById('deck-list-dialog');
        const cards = this.game.deck.cards;
        document.getElementById('deck-list-title').textContent = `Deck · ${cards.length} card${cards.length === 1 ? '' : 's'}`;
        this.renderCardGrid(document.getElementById('deck-list'), cards, 'The deck is empty.');
        dialog.classList.add('visible');
    }

    /**
     * Show the discard pile, as card faces grouped by suit, with the latest discard outlined
     */
    showDiscardListDialog() {
        const dialog = document.getElementById('discard-list-dialog');
        const pile = this.game.deck.discardPile;
        const latest = pile[pile.length - 1] || null;
        document.getElementById('discard-list-title').textContent = `Discard pile · ${pile.length} card${pile.length === 1 ? '' : 's'}`;
        document.getElementById('discard-list-note').textContent = latest
            ? `Grouped by suit, high to low. Last discarded: ${describeCard(latest)}, outlined.`
            : '';
        this.renderCardGrid(document.getElementById('discard-list'), pile, 'The discard pile is empty.', latest);
        dialog.classList.add('visible');
    }

    /**
     * Fill a viewer with one row of card faces per suit
     * @param {HTMLElement} container
     * @param {Card[]} cards
     * @param {string} emptyText
     * @param {Card|null} outlined - card to mark, if any
     */
    renderCardGrid(container, cards, emptyText, outlined = null) {
        container.innerHTML = '';
        if (cards.length === 0) {
            const empty = document.createElement('p');
            empty.textContent = emptyText;
            container.appendChild(empty);
            return;
        }
        const suits = [
            [CARD_SUITS.SPADES, 'Spades'], [CARD_SUITS.HEARTS, 'Hearts'],
            [CARD_SUITS.DIAMONDS, 'Diamonds'], [CARD_SUITS.CLUBS, 'Clubs'], [CARD_SUITS.JOKER, 'Jokers']
        ];
        const rankOrder = ['JOKER', 'A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
        suits.forEach(([suit, label]) => {
            const group = cards.filter(c => c.suit === suit)
                .sort((a, b) => rankOrder.indexOf(a.value) - rankOrder.indexOf(b.value));
            if (group.length === 0) return;
            const row = document.createElement('div');
            row.className = 'card-grid-row';
            const name = document.createElement('span');
            name.className = 'card-grid-label';
            name.textContent = label;
            const faces = document.createElement('div');
            faces.className = 'card-grid-cards';
            group.forEach(card => {
                const view = card.clone();
                view.flipFaceUp();
                const el = view.getElement(true);
                if (outlined && card.id === outlined.id) el.classList.add('is-latest');
                faces.appendChild(el);
            });
            row.append(name, faces);
            container.appendChild(row);
        });
    }

    /**
     * Initialize the UI
     */
    initialize() {
        this.renderPrompt(); // clears any prompt left over from a previous match
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
        this.updateSidePanels();
    }

    /**
     * Update player names and the health crests
     */
    updatePlayerHealth() {
        const { player, bot } = this.game;
        document.getElementById('player-name-label').textContent = player.name;
        document.getElementById('bot-name').textContent = bot.name;

        const circumference = 2 * Math.PI * 54; // the ring's radius in the crest SVG
        [[player, 'player'], [bot, 'bot']].forEach(([p, prefix]) => {
            const hpEl = document.getElementById(`${prefix}-health`);
            hpEl.textContent = p.health;
            const fraction = Math.max(0, Math.min(1, p.health / GAME_SETTINGS.STARTING_HEALTH));
            const ring = document.getElementById(`${prefix}-health-ring`);
            ring.style.strokeDasharray = `${(fraction * circumference).toFixed(1)} ${circumference.toFixed(1)}`;
            ring.style.opacity = fraction > 0 ? '1' : '0';

            // A quarter of health or less turns the crest red
            const low = p.health > 0 && fraction <= 0.25;
            document.querySelector(`.${prefix}-stats`).classList.toggle('low', low);
            if (prefix === 'player') document.getElementById('player-low').hidden = !low;

            const before = this._lastHealth ? this._lastHealth[prefix] : p.health;
            if (p.health < before) {
                Fx.floatText(hpEl, `-${before - p.health}`, 'danger');
                Fx.impact(document.querySelector(`.${prefix}-stats .crest`), 'danger');
            }
        });
        this._lastHealth = { player: player.health, bot: bot.health };
    }

    /**
     * Update player hand display
     */
    updatePlayerHand() {
        const handContainer = document.getElementById('player-hand');
        const hand = this.game.player.hand;
        const handIds = new Set(hand.map(c => c.id));

        // Update cards in place rather than rebuilding the hand: a freshly inserted element
        // loses its hover state until the pointer moves, so the zoomed card would snap back
        // into the fan and zoom again every time the hand changed
        const existing = new Map();
        [...handContainer.children].forEach(el => {
            if (handIds.has(el.dataset.cardId)) existing.set(el.dataset.cardId, el);
            else el.remove();
        });

        let drawn = 0;
        hand.forEach((card, i) => {
            let cardElement = existing.get(card.id);
            if (!cardElement) {
                cardElement = card.getElement(true);
                cardElement.tabIndex = 0;
                cardElement.setAttribute('role', 'button');
                cardElement.setAttribute('aria-label', `${describeCard(card)}, ${this.describeCardRole(card)}`);
                if (!this._handIds.has(card.id)) Fx.enter(cardElement, 'draw', 70 * drawn++);
            }

            const playable = this.game.currentPhase === PHASES.SETUP && canPlayCard(card, this.game);
            const selected = !!this.selectedCard && this.selectedCard.id === card.id;
            cardElement.classList.toggle('disabled', !playable);
            cardElement.classList.toggle('selected', selected);
            cardElement.setAttribute('aria-pressed', String(selected));

            // Only move an element when it is out of place, for the same hover reason
            if (handContainer.children[i] !== cardElement) {
                handContainer.insertBefore(cardElement, handContainer.children[i] || null);
            }
        });
        this._handIds = handIds;
        document.getElementById('player-hand-count').textContent = `${hand.length} in hand`;
        this.layoutHand();
        if (this.prompt) this.applyPromptMarks();
    }

    /**
     * Spread the hand into a fan that fits its corner: overlap grows with the number of cards
     */
    layoutHand() {
        const hand = document.getElementById('player-hand');
        const cards = [...hand.querySelectorAll('.card')];
        const n = cards.length;
        if (n === 0) return;
        const width = cards[0].offsetWidth;
        const room = Math.max(0, hand.clientWidth - width * 1.45); // the last card tilts outward
        const step = n > 1 ? Math.min(width * 0.6, room / (n - 1)) : 0;
        const spread = Math.min(36, 7 * (n - 1)); // total angle across the fan, in degrees
        cards.forEach((card, i) => {
            const t = n > 1 ? i / (n - 1) - 0.5 : 0; // -0.5 (left) to 0.5 (right)
            card.style.setProperty('--fan-x', `${(i * step).toFixed(1)}px`);
            card.style.setProperty('--fan-rot', `${(t * spread).toFixed(1)}deg`);
            card.style.setProperty('--fan-y', `${(t * t * width * 0.5).toFixed(1)}px`);
            card.style.setProperty('--fan-z', String(i + 1));
        });
    }

    /**
     * Update the board display
     */
    updateBoard() {
        const before = this.snapshotBoard();

        // Update player monster spaces
        for (let i = 0; i < this.game.player.monsterSpaces.length; i++) {
            const space = document.getElementById(`player-monster-${i}`);
            space.innerHTML = '';
            
            const card = this.game.player.monsterSpaces[i].card;
            if (card) {
                const cardElement = card.getElement();
                
                this.decorateFusion(cardElement, card);

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
                // Traps are set face-down; render a face-up copy so the owner can see their own trap
                const view = card.clone();
                view.flipFaceUp();
                const cardElement = view.getElement();
                cardElement.classList.add('set-face-down');

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
                this.decorateFusion(cardElement, card);
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
                // Bot traps remain face-down for player; only whether they are armed is shown
                const cardElement = card.getElement();
                if (!card.faceUp) {
                    cardElement.classList.add('face-down');
                    cardElement.classList.toggle('armed', !!card.active);
                    const label = document.createElement('div');
                    label.classList.add('trap-face-label');
                    label.textContent = card.active ? 'Armed' : 'Set';
                    cardElement.appendChild(label);
                }
                space.appendChild(cardElement);
            }
        }
        
        this.animateBoardChanges(before);
        this.hideZoomIfDetached();

        // Highlight spaces based on current phase
        this.highlightSpacesForCurrentPhase();
    }

    /**
     * Fusions owe one monster card of upkeep each End phase; say so on the card
     */
    decorateFusion(cardElement, card) {
        if (!card.isFusion) return;
        const badge = document.createElement('span');
        badge.className = 'upkeep-badge';
        badge.textContent = 'UPKEEP 1';
        cardElement.appendChild(badge);
    }

    /**
     * Record which card each board slot shows, and where the slot is, before a re-render
     */
    snapshotBoard() {
        const snap = new Map();
        document.querySelectorAll('.board-panel .monster-space, .board-panel .trap-space').forEach(space => {
            const el = space.querySelector('.card');
            snap.set(space.id, { cardId: el ? el.dataset.cardId : null, el, rect: space.getBoundingClientRect() });
        });
        return snap;
    }

    /**
     * Ask for a card's next exit from the board to use a specific animation
     * @param {string} cardId
     * @param {'destroy'|'reveal'} kind
     */
    fxHint(cardId, kind) {
        this._fxHints.set(cardId, kind);
    }

    /**
     * Animate cards that arrived in or left a slot since the snapshot
     */
    animateBoardChanges(before) {
        const now = new Map();
        [this.game.player, this.game.bot].forEach(p => {
            [...p.monsterSpaces, ...p.trapSpaces].forEach(s => { if (s.card) now.set(s.card.id, s.card); });
        });

        before.forEach((old, spaceId) => {
            const space = document.getElementById(spaceId);
            const el = space.querySelector('.card');
            const newId = el ? el.dataset.cardId : null;
            if (old.cardId === newId) return;
            const slotClass = space.classList.contains('trap-space') ? 'trap-space' : 'monster-space';

            if (old.cardId && old.el) {
                const kind = this._fxHints.get(old.cardId) || 'leave';
                this._fxHints.delete(old.cardId);
                let ghostEl = old.el;
                const card = this._boardCards.get(old.cardId);
                if (kind === 'reveal' && card) {
                    // Show the trap's face as it springs, even if it was face-down
                    const view = card.clone();
                    view.flipFaceUp();
                    view.active = true;
                    ghostEl = view.getElement();
                }
                Fx.ghost(ghostEl, old.rect, slotClass, kind);
            }
            if (el) {
                const card = now.get(newId);
                Fx.enter(el, card && card.isFusion ? 'fusion' : 'place');
            }
        });
        this._boardCards = now;
    }

    /**
     * Highlight board spaces based on the current phase
     */
    highlightSpacesForCurrentPhase() {
        document.querySelectorAll('.monster-space, .trap-space').forEach(space => {
            space.classList.remove('highlight', 'phase-highlight');
        });
        const g = this.game;

        if (g.currentPlayer === g.player && g.currentPhase === PHASES.SETUP) {
            // Highlight empty player spaces for card placement
            g.player.monsterSpaces.forEach((space, i) => {
                if (!space.card) document.getElementById(`player-monster-${i}`).classList.add('phase-highlight');
            });
            g.player.trapSpaces.forEach((space, i) => {
                if (!space.card) document.getElementById(`player-trap-${i}`).classList.add('phase-highlight');
            });
        } else if (g.currentPlayer === g.player && g.currentPhase === PHASES.BATTLE && g.isAttackAllowedThisTurn(g.player)) {
            // Highlight monsters that can still attack
            g.player.monsterSpaces.forEach((space, i) => {
                if (space.card && space.card.canAttack()) {
                    document.getElementById(`player-monster-${i}`).classList.add('phase-highlight');
                }
            });
        }
        this.applyAttackSelectionHighlights();
        if (this.prompt) this.applyPromptMarks();
    }

    /**
     * Whether the player is choosing an attacker or target right now
     */
    isPickingAttack() {
        const g = this.game;
        return g.currentPlayer === g.player && g.currentPhase === PHASES.BATTLE &&
            !g.gameOver && !g.attackInProgress && !g.battleEnded && this.selectedSpace !== null;
    }

    /**
     * Whether the selected attacker can only hit the bot directly (the bot has no monsters)
     */
    isDirectOnly() {
        const valid = this.game.board.getValidAttackTargets(this.game.player, this.game.bot);
        return valid.length === 1 && valid[0] === null;
    }

    /**
     * Re-apply the selected attacker, its valid targets and the target under the pointer
     */
    applyAttackSelectionHighlights() {
        document.querySelectorAll('.monster-space.targeted').forEach(el => el.classList.remove('targeted'));
        document.querySelector('.bot-area')?.classList.remove('direct-target');
        if (this._previewArrow) {
            this._previewArrow.remove();
            this._previewArrow = null;
        }

        if (this.isPickingAttack()) {
            document.getElementById(`player-monster-${this.selectedSpace}`)?.classList.add('highlight');
            if (this.isDirectOnly()) {
                document.querySelector('.bot-area')?.classList.add('direct-target');
            } else {
                this.game.board.getValidAttackTargets(this.game.player, this.game.bot).forEach(index => {
                    if (index !== null) document.getElementById(`bot-monster-${index}`)?.classList.add('highlight');
                });
            }
            if (this.attackTarget) {
                if (this.attackTarget.index !== null) {
                    document.getElementById(`bot-monster-${this.attackTarget.index}`)?.classList.add('targeted');
                }
                const { from, to } = this.attackEls(this.selectedSpace, this.game.player, this.attackTarget.index, this.game.bot);
                this._previewArrow = Fx.arrow(from, to, 'you', { dashed: true });
            }
        } else {
            this.hideAttackPreview();
        }
        this.makeSpacesFocusable();
    }

    /**
     * Spaces you can act on right now take keyboard focus and announce what they hold
     */
    makeSpacesFocusable() {
        const direct = this.isPickingAttack() && this.isDirectOnly();
        document.querySelectorAll('.board-panel .monster-space, .board-panel .trap-space').forEach(space => {
            const active = space.classList.contains('pickable') ||
                (!this.prompt && (space.classList.contains('highlight') || space.classList.contains('phase-highlight') ||
                    (direct && space.id.startsWith('bot-monster'))));
            if (active) {
                space.tabIndex = 0;
                space.setAttribute('role', 'button');
                space.setAttribute('aria-label', this.describeSpace(space));
            } else {
                space.removeAttribute('tabindex');
                space.removeAttribute('role');
                space.removeAttribute('aria-label');
            }
        });
    }

    /**
     * "Your monster space 2: 4♦" (only used for spaces whose contents are public)
     */
    describeSpace(space) {
        const [owner, type, index] = space.id.split('-');
        const player = owner === 'player' ? this.game.player : this.game.bot;
        const card = (type === 'monster' ? player.monsterSpaces : player.trapSpaces)[Number(index)].card;
        const whose = owner === 'player' ? 'Your' : `${player.name}'s`;
        return `${whose} ${type} space ${Number(index) + 1}: ${card ? describeCard(card) : 'empty'}`;
    }

    /**
     * The attacker's slot and what it is aiming at (a slot, or the defender's side for a direct attack)
     */
    attackEls(attackerIndex, attacker, defenderIndex, defender) {
        const prefix = p => (p === this.game.player ? 'player' : 'bot');
        const from = document.getElementById(`${prefix(attacker)}-monster-${attackerIndex}`);
        const to = defenderIndex === null
            ? document.querySelector(defender === this.game.player ? '.player-area-human' : '.bot-area')
            : document.getElementById(`${prefix(defender)}-monster-${defenderIndex}`);
        return { from, to };
    }

    /**
     * "Your 4♦" or "Bot's 4♦"
     */
    ownerLabel(player, card, capitalize = false) {
        if (player === this.game.player) return `${capitalize ? 'Your' : 'your'} ${describeCard(card)}`;
        return `${player.name}'s ${describeCard(card)}`;
    }

    /**
     * Update the deck, discard and Joker piles
     */
    updateDeckAndDiscard() {
        const deck = this.game.deck;

        // Deck: card backs stacked thicker or thinner with the count
        const deckCount = deck.getDeckCount();
        document.getElementById('deck-count').textContent = deckCount;
        document.getElementById('deck').setAttribute('aria-label', `Deck, ${deckCount} card${deckCount === 1 ? '' : 's'}: view contents`);
        const deckStack = document.getElementById('deck-stack');
        deckStack.innerHTML = '';
        const layers = deckCount === 0 ? 0 : Math.min(6, 1 + Math.floor(deckCount / 10));
        if (layers === 0) deckStack.appendChild(this.pileSlot());
        for (let i = layers - 1; i >= 0; i--) {
            const layer = document.createElement('span');
            layer.className = i === 0 ? 'pile-layer top' : 'pile-layer';
            layer.style.left = `${i * 2}px`;
            layer.style.top = `${i * 2}px`;
            deckStack.appendChild(layer);
        }

        // Discard: the last three cards face up, slightly fanned
        const pile = deck.discardPile;
        document.getElementById('discard-count').textContent = pile.length;
        document.getElementById('discard-pile').setAttribute('aria-label', `Discard pile, ${pile.length} card${pile.length === 1 ? '' : 's'}: view contents`);
        const discardStack = document.getElementById('discard-stack');
        discardStack.innerHTML = '';
        const recent = pile.slice(-3);
        if (recent.length === 0) discardStack.appendChild(this.pileSlot());
        const angles = [-8, -2, 5].slice(3 - recent.length);
        recent.forEach((card, i) => {
            const view = card.clone();
            view.flipFaceUp();
            const el = view.getElement(true);
            el.style.left = `calc(var(--card-width) * ${(i * 0.2).toFixed(2)})`;
            el.style.top = `${(recent.length - 1 - i) * 3}px`;
            el.style.transform = `rotate(${angles[i]}deg)`;
            discardStack.appendChild(el);
        });

        // Jokers: played ones face up in front, the rest as empty outlines
        const total = GAME_SETTINGS.JOKER_COUNT;
        const used = Math.min(total, this.game.jokersPlayed || 0);
        document.getElementById('joker-count').textContent = `${used} / ${total}`;
        document.getElementById('joker-pile').setAttribute('aria-label', `Jokers played: ${used} of ${total}`);
        const jokerStack = document.getElementById('joker-stack');
        jokerStack.innerHTML = '';
        for (let i = total - 1; i >= 0; i--) {
            let el;
            if (i < used) {
                const joker = new Card(CARD_SUITS.JOKER, CARD_VALUES.JOKER);
                joker.flipFaceUp();
                el = joker.getElement(true);
            } else {
                el = this.pileSlot('★');
            }
            el.style.left = `calc(var(--card-width) * ${(i * 0.28).toFixed(2)})`;
            el.style.top = i === 0 ? '8px' : '0px';
            el.style.transform = `rotate(${i === 0 ? -4 : 6}deg)`;
            jokerStack.appendChild(el);
        }
    }

    /**
     * An empty card outline for a pile
     */
    pileSlot(symbol = '') {
        const slot = document.createElement('span');
        slot.className = 'pile-slot';
        slot.textContent = symbol;
        return slot;
    }

    /**
     * Update turn and phase indicators
     */
    updateTurnAndPhase() {
        const isPlayerTurn = this.game.currentPlayer === this.game.player;
        const phase = this.game.currentPhase;

        // A new phase drops any half-made attack selection from the last one
        const phaseKey = `${this.game.turnCounter}-${phase}`;
        const previousKey = this._phaseKey;
        const phaseChanged = phaseKey !== previousKey;
        if (phaseChanged) {
            this._phaseKey = phaseKey;
            if (phase !== PHASES.SETUP) this.selectedCard = null;
            this.attackTarget = null;
            if (phase === PHASES.BATTLE) this.selectedSpace = null;
        }

        const turnIndicator = document.getElementById('turn-indicator');
        if (turnIndicator) turnIndicator.textContent = `Turn ${this.game.turnCounter}`;

        const phaseIndicator = document.getElementById('phase-indicator');
        if (phaseIndicator) {
            phaseIndicator.textContent = isPlayerTurn ? 'Your turn' : `${this.game.bot.name}'s turn`;
            phaseIndicator.classList.toggle('bot-turn', !isPlayerTurn);
        }

        const steps = document.getElementById('phase-steps');
        if (steps) {
            steps.classList.toggle('bot-turn', !isPlayerTurn);
            steps.querySelectorAll('li').forEach(li => {
                if (li.dataset.phase === phase) {
                    li.setAttribute('aria-current', 'step');
                    if (phaseChanged) Fx.pulse(li, isPlayerTurn ? 'you' : 'bot');
                } else {
                    li.removeAttribute('aria-current');
                }
            });
        }

        // Each new turn opens with a banner and its own section of the battle log
        const turnChanged = !previousKey || previousKey.split('-')[0] !== String(this.game.turnCounter);
        if (turnChanged && !this.game.gameOver) {
            Fx.announce({
                text: isPlayerTurn ? 'Your turn' : `${this.game.bot.name}'s turn`,
                tone: isPlayerTurn ? 'you' : 'bot',
                duration: 1100
            });
        }
        this.ensureLogTurn();

        // Update end phase button
        const endPhaseBtn = document.getElementById('end-phase-btn');
        const endPhaseLabel = document.getElementById('end-phase-label');

        if (isPlayerTurn && !this.game.gameOver) {
            endPhaseBtn.disabled = false;
            endPhaseLabel.textContent = phase === PHASES.END ? 'End turn' : `End ${phase}`;
        } else {
            endPhaseBtn.disabled = true;
            endPhaseLabel.textContent = this.game.gameOver ? 'Game over' : `${this.game.bot.name}'s turn`;
        }

        const concedeBtn = document.getElementById('concede-btn');
        if (concedeBtn) concedeBtn.disabled = this.game.gameOver;
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

            // Add subtle accent to the active player's stats card
            const playerStats = document.querySelector('.player-stats');
            const botStats = document.querySelector('.bot-stats');
            if (playerStats) playerStats.classList.toggle('phase-active', isPlayerTurn);
            if (botStats) botStats.classList.toggle('phase-active', !isPlayerTurn);
        } catch (e) { /* non-fatal UI update failure */ }
    }

    /**
     * Update hand counts and the bot's face-down fan
     */
    updateHandCounts() {
        const botCards = this.game.bot.hand.length;
        document.getElementById('player-hand-count').textContent = `${this.game.player.hand.length} in hand`;
        document.getElementById('bot-hand-count').textContent = `${botCards} card${botCards === 1 ? '' : 's'}`;
        this.renderBotHand();
    }

    /**
     * The bot's hand as card backs hanging from the top-right corner
     */
    renderBotHand() {
        const fan = document.getElementById('bot-hand-fan');
        const n = this.game.bot.hand.length;
        if (fan.children.length !== n) {
            fan.innerHTML = '';
            for (let i = 0; i < n; i++) {
                const back = document.createElement('div');
                back.className = 'card face-down';
                fan.appendChild(back);
            }
        }
        const cards = [...fan.children];
        if (n === 0) return;
        const width = cards[0].offsetWidth;
        const room = Math.max(0, fan.clientWidth - width);
        const step = n > 1 ? Math.min(width * 0.5, room / (n - 1)) : 0;
        const spread = Math.min(32, 6 * (n - 1));
        cards.forEach((card, i) => {
            const t = n > 1 ? i / (n - 1) - 0.5 : 0; // first card hangs at the far right
            card.style.setProperty('--fan-x', `${(i * step).toFixed(1)}px`);
            card.style.setProperty('--fan-rot', `${(t * spread).toFixed(1)}deg`);
            card.style.setProperty('--fan-y', `${(-t * t * width * 0.4).toFixed(1)}px`);
        });
    }

    /**
     * Short description of what a card does, for labels and the inspector
     * @param {Card} card
     * @returns {string}
     */
    describeCardRole(card) {
        if (card.isFusion) return `fusion, strength ${card.fusionStrength}`;
        switch (getCardType(card.value)) {
            case CARD_TYPES.MONSTER_NORMAL: return `monster, strength ${getCardNumericValue(card.value)}`;
            case CARD_TYPES.MONSTER_BIG: return `big monster, needs ${getRequiredSacrificeValue(card)} in sacrifices`;
            case CARD_TYPES.TRAP: return `trap: ${getTrapName(card.value)}`;
            default: return 'Joker: resets the board and both hands';
        }
    }

    /**
     * Update the hint line, the upkeep sub-label on the End button and the crest sub-label
     */
    updateSidePanels() {
        const g = this.game;
        document.getElementById('hint-line').textContent = this.hintText();

        const fusions = g.board.countActiveFusions(g.player);
        const sub = document.getElementById('end-phase-sub');
        sub.hidden = !(fusions > 0 && g.currentPlayer === g.player && !g.gameOver &&
            (g.currentPhase === PHASES.BATTLE || g.currentPhase === PHASES.END));
        sub.textContent = `Upkeep: ${fusions} card${fusions === 1 ? '' : 's'}`;
        document.getElementById('player-sub').textContent = fusions > 0 ? `Fusion upkeep ${fusions}` : '';
    }

    /**
     * One line telling the player what they can do right now
     */
    hintText() {
        const g = this.game;
        const bot = g.bot.name;
        if (g.gameOver) return 'The duel is over. Open the menu to start a new game.';
        if (g.currentPlayer !== g.player) return `${bot}'s turn. You may be asked to answer an attack with a trap.`;

        switch (g.currentPhase) {
            case PHASES.SETUP: {
                if (this.selectedCard) {
                    return `${describeCard(this.selectedCard)}: ${this.describeCardRole(this.selectedCard)}. Click a glowing space, or the card again to place it.`;
                }
                return 'Pick a card, then a glowing space. Click a monster on your field to fuse it.';
            }
            case PHASES.BATTLE: {
                if (g.battleEnded) return 'An Ace ended your Battle phase.';
                if (!g.isAttackAllowedThisTurn(g.player)) return 'The first player can\u2019t attack on turn 1.';
                if (g.attackInProgress) return 'Attacking\u2026';
                if (this.selectedSpace === null) {
                    return g.player.monsterSpaces.some(s => s.card && s.card.canAttack())
                        ? 'Pick a glowing monster to attack with.'
                        : 'No monsters can attack. End the Battle phase.';
                }
                return this.isDirectOnly()
                    ? `Click ${bot}'s side to attack directly. Esc cancels.`
                    : `Hover a ${bot} monster to see the damage. Click it to attack. Esc cancels.`;
            }
            case PHASES.DRAW:
                return 'Drawing\u2026';
            default:
                return 'Ending your turn. Traps you set this turn arm now.';
        }
    }

    /**
     * Predict an attack's damage with the same rules as Board.handleAttack (traps not included)
     * @param {number} strength - Attacking strength
     * @param {Card|null} target - Defending monster, or null for a direct attack
     * @returns {{damage: string, result: string, tone: string}}
     */
    predictAttack(strength, target) {
        const botName = this.game.bot.name;
        if (!target) return { damage: `${botName} \u2212${strength}`, result: 'Direct hit', tone: 'good' };
        const defense = calculateMonsterStrength(target);
        if (strength > defense) return { damage: `${botName} \u2212${strength - defense}`, result: `${describeCard(target)} is destroyed`, tone: 'good' };
        if (strength < defense) return { damage: `You \u2212${defense - strength}`, result: 'Your monster is destroyed', tone: 'bad' };
        return { damage: 'No damage', result: 'Both monsters are destroyed', tone: '' };
    }

    /**
     * Show the damage preview next to the target under the pointer (or the bot's side for a direct attack)
     */
    showAttackPreview() {
        const tip = document.getElementById('attack-preview');
        if (!this.isPickingAttack() || !this.attackTarget) {
            tip.hidden = true;
            return;
        }
        const g = this.game;
        const attacker = g.player.monsterSpaces[this.selectedSpace].card;
        const index = this.attackTarget.index;
        const target = index === null ? null : g.bot.monsterSpaces[index].card;
        const outcome = this.predictAttack(calculateMonsterStrength(attacker), target);

        tip.className = `attack-preview ${outcome.tone}`;
        tip.innerHTML = '';
        const line = (cls, text) => {
            const el = document.createElement('div');
            el.className = cls;
            el.textContent = text;
            tip.appendChild(el);
            return el;
        };
        line('preview-kicker', 'If you attack');
        const matchup = line('preview-matchup', '');
        const mine = document.createElement('span');
        mine.className = 'you';
        mine.textContent = attacker.isFusion ? `Fusion ${attacker.fusionStrength}` : describeCard(attacker);
        matchup.append(mine, ` vs ${target ? describeCard(target) : `${g.bot.name} directly`}`);
        line('preview-damage', outcome.damage);
        line('preview-result', outcome.result);
        line('preview-action', target ? 'Click to attack' : `Click ${g.bot.name}'s side to attack`);
        tip.hidden = false;

        // Just outside the board on the target's side, level with it, so it never covers another card
        const anchor = target ? document.getElementById(`bot-monster-${index}`) : document.querySelector('.bot-area .monster-row');
        const r = anchor.getBoundingClientRect();
        const board = document.querySelector('.board-panel').getBoundingClientRect();
        const w = tip.offsetWidth;
        const h = tip.offsetHeight;
        const leftHalf = r.left + r.width / 2 < board.left + board.width / 2 && target !== null;
        let left = leftHalf ? board.left - 16 - w : board.right + 16;
        if (left < 8 || left + w > window.innerWidth - 8) left = r.right + 16; // no room beside the board (narrow windows)
        if (left + w > window.innerWidth - 8) left = r.left - 16 - w;
        const top = Math.min(Math.max(8, r.top + 12), window.innerHeight - h - 8);
        tip.style.left = `${Math.max(8, left)}px`;
        tip.style.top = `${top}px`;
    }

    hideAttackPreview() {
        const tip = document.getElementById('attack-preview');
        if (tip) tip.hidden = true;
    }

    /**
     * Pointer or focus moved on the board: update the damage preview, or zoom a face-up card
     * @param {Element|null} target
     */
    handleBoardPointer(target) {
        const space = target && target.closest ? target.closest('.monster-space, .trap-space') : null;

        if (this.isPickingAttack()) {
            this.cancelZoom();
            if (this.isDirectOnly()) return; // the direct-attack preview stays up until you act
            const index = space && space.id.startsWith('bot-monster') && space.classList.contains('highlight')
                ? Number(space.dataset.index) : null;
            const current = this.attackTarget ? this.attackTarget.index : null;
            if (index === current) return;
            this.attackTarget = index === null ? null : { index };
            this.applyAttackSelectionHighlights();
            this.showAttackPreview();
            return;
        }

        // A short pause over a face-up card shows it larger
        const card = space && space.querySelector('.card:not(.face-down)');
        if (card && (card.contains(target) || target === space)) this.scheduleZoom(card);
        else this.cancelZoom();
    }

    scheduleZoom(cardEl) {
        if (this._zoomSource === cardEl) return;
        this.cancelZoom();
        this._zoomSource = cardEl;
        this._zoomTimer = setTimeout(() => this.showZoom(cardEl), 450);
    }

    cancelZoom() {
        clearTimeout(this._zoomTimer);
        this._zoomSource = null;
        const zoom = document.getElementById('card-zoom');
        if (!zoom) return;
        zoom.hidden = true;
        zoom.innerHTML = '';
    }

    hideZoomIfDetached() {
        if (this._zoomSource && !document.body.contains(this._zoomSource)) this.cancelZoom();
    }

    /**
     * Show a large copy of a board card beside it
     */
    showZoom(cardEl) {
        if (!document.body.contains(cardEl) || document.querySelector('.dialog.visible, dialog[open]')) return;
        const zoom = document.getElementById('card-zoom');
        const copy = cardEl.cloneNode(true);
        copy.classList.remove('selected', 'can-attack', 'attacked', 'disabled');
        copy.removeAttribute('tabindex');
        zoom.innerHTML = '';
        zoom.appendChild(copy);
        zoom.hidden = false;

        const r = cardEl.getBoundingClientRect();
        const w = zoom.offsetWidth;
        const h = zoom.offsetHeight;
        let left = r.right + 18;
        if (left + w > window.innerWidth - 8) left = r.left - 18 - w;
        const top = Math.min(Math.max(8, r.top + r.height / 2 - h / 2), window.innerHeight - h - 8);
        zoom.style.left = `${Math.max(8, left)}px`;
        zoom.style.top = `${top}px`;
        Fx.play(zoom, [{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'none' }], { duration: 140, easing: 'ease-out' });
    }

    /**
     * Redraw attack highlights, the preview and the hint after the selection changes
     */
    refreshAttackSelection() {
        this.highlightSpacesForCurrentPhase();
        this.showAttackPreview();
        this.updateSidePanels();
    }

    cancelAttackSelection() {
        this.selectedSpace = null;
        this.attackTarget = null;
        this.clearAttackHighlights();
        this.refreshAttackSelection();
    }

    /**
     * Launch the attack on the target under the pointer
     */
    confirmAttack() {
        if (!this.isPickingAttack() || !this.attackTarget) return;
        const attackerIndex = this.selectedSpace;
        const targetIndex = this.attackTarget.index;
        this.selectedSpace = null;
        this.attackTarget = null;
        this.hideAttackPreview();
        // The game handles the bot's trap response and resolves the attack
        this.game.processAttack(attackerIndex, targetIndex);
        this.updateSidePanels();
    }

    /**
     * A click on the bot's side outside its monster spaces: launches a direct attack when that's the only option
     */
    handleBotAreaClick() {
        if (!this.isPickingAttack() || !this.isDirectOnly()) return;
        this.attackTarget = { index: null };
        this.confirmAttack();
    }

    /**
     * Open or close the battle log drawer
     * @param {boolean} [open] - omit to toggle
     */
    toggleLog(open) {
        const drawer = document.getElementById('game-log');
        const button = document.getElementById('log-btn');
        const show = open === undefined ? drawer.hidden : open;
        if (show === !drawer.hidden) return;
        const focusWasInside = drawer.contains(document.activeElement);
        drawer.hidden = !show;
        button.setAttribute('aria-expanded', String(show));
        if (show) {
            button.classList.remove('has-unread');
            document.getElementById('log-content').scrollTop = 0;
            Fx.play(drawer, [{ transform: 'translateX(-100%)' }, { transform: 'none' }],
                { duration: Fx.reducedMotion() ? 0 : 220, easing: 'ease-out' });
            document.getElementById('log-close').focus();
        } else if (focusWasInside) {
            button.focus();
        }
    }

    /**
     * Open or close the game menu
     * @param {boolean} [open] - omit to toggle
     */
    toggleMenu(open) {
        const menu = document.getElementById('game-menu');
        const button = document.getElementById('menu-btn');
        if (!menu || !button) return;
        const show = open === undefined ? menu.hidden : open;
        if (show === !menu.hidden) return;
        menu.hidden = !show;
        button.setAttribute('aria-expanded', String(show));
        if (show) menu.querySelector('button:not(:disabled)')?.focus();
    }

    /**
     * Esc closes the menu or log, or drops the current selection
     */
    handleEscape() {
        if (!document.getElementById('game-menu').hidden) {
            this.toggleMenu(false);
            document.getElementById('menu-btn').focus();
            return;
        }
        if (!document.getElementById('game-log').hidden) {
            this.toggleLog(false);
            return;
        }
        if (this.prompt) {
            if (this.prompt.cancel) this.prompt.cancel();
            return;
        }
        if (this.isPickingAttack()) {
            this.cancelAttackSelection();
            return;
        }
        if (this.selectedCard && this.game.currentPhase === PHASES.SETUP && !document.querySelector('.dialog.visible')) {
            this.selectedCard = null;
            this.updatePlayerHand();
            this.highlightSpacesForCurrentPhase();
            this.updateSidePanels();
        }
    }

    /**
     * Handle card selection in hand
     * @param {string} cardId - Selected card ID
     */
    handleCardSelection(cardId) {
        if (this.prompt) {
            const card = this.game.player.hand.find(c => c.id === cardId);
            this.promptPick(card, { zone: 'hand', owner: this.game.player, index: null });
            return;
        }
        // Only allow selection during player's setup phase
        if (this.game.currentPhase !== PHASES.SETUP || this.game.currentPlayer !== this.game.player) {
            return;
        }
        
        const card = this.game.player.hand.find(c => c.id === cardId);
        if (!card) return;
        
        // Check if card can be played
        if (!canPlayCard(card, this.game)) {
            this.addLogMessage('Cannot play this card');
            return;
        }
        
        // Special case for Joker - confirm and play immediately
        if (card.value === CARD_VALUES.JOKER) {
            this.promptJoker(card);
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
        this.updateSidePanels();
    }

    /**
     * Handle click on player's monster space
     * @param {number} spaceIndex - Space index
     */
    handlePlayerMonsterSpaceClick(spaceIndex) {
        if (this.prompt) {
            this.promptPick(this.game.player.monsterSpaces[spaceIndex].card, { zone: 'field', owner: this.game.player, index: spaceIndex });
            return;
        }
        // If it's not player's turn, do nothing
        if (this.game.currentPlayer !== this.game.player || this.game.gameOver) {
            return;
        }
        
        const space = this.game.player.monsterSpaces[spaceIndex];
        
        // Setup phase - place monster
        if (this.game.currentPhase === PHASES.SETUP) {
            if (this.selectedCard) {
                const cardType = getCardType(this.selectedCard.value);
                
                if (cardType === CARD_TYPES.MONSTER_NORMAL) {
                    // Normal monster - place directly if space empty
                    if (!space.card) {
                        const res = this.game.playMonsterCard(this.selectedCard, spaceIndex);
                        if (res) {
                            this.selectedCard = null;
                            this.updateGameState();
                        }
                    }
                } else if (cardType === CARD_TYPES.MONSTER_BIG) {
                    // Big monster - require sacrifice
                    if (!space.card) {
                        this.showSacrificeDialog(this.selectedCard, spaceIndex);
                    } else {
                        // No free space here; allow showing sacrifice dialog that forces at least one field sacrifice
                        this.showSacrificeDialog(this.selectedCard, null, null, true);
                    }
                }
            } else if (space.card) {
                // Check for potential fusion
                this.handlePotentialFusion(spaceIndex);
            }
        }
        // Battle phase - select attacker
        else if (this.game.currentPhase === PHASES.BATTLE) {
            if (this.game.attackInProgress || this.game.battleEnded) return;

            if (!this.game.isAttackAllowedThisTurn(this.game.player)) {
                this.addLogMessage('Cannot attack on the first turn');
                return;
            }
            
            if (!space.card || !space.card.canAttack()) {
                return;
            }

            // Clicking the selected attacker again deselects it
            if (this.selectedSpace === spaceIndex) {
                this.cancelAttackSelection();
                return;
            }

            this.selectedSpace = spaceIndex;
            this.attackTarget = null;

            // With no monsters in the way, the only target is the bot itself: preview it straight away
            if (this.isDirectOnly()) this.attackTarget = { index: null };

            this.clearAttackHighlights();
            this.refreshAttackSelection();
        }
    }

    /**
     * Click on one of the bot's monster spaces while choosing a target: attack it
     * @param {number} spaceIndex - Space index
     */
    handleBotMonsterSpaceClick(spaceIndex) {
        if (this.prompt) {
            this.promptPick(this.game.bot.monsterSpaces[spaceIndex].card, { zone: 'field', owner: this.game.bot, index: spaceIndex });
            return;
        }
        if (!this.isPickingAttack()) return;
        if (this.isDirectOnly()) {
            this.attackTarget = { index: null };
        } else {
            if (!this.game.board.getValidAttackTargets(this.game.player, this.game.bot).includes(spaceIndex)) return;
            this.attackTarget = { index: spaceIndex };
        }
        this.confirmAttack();
    }

    /**
     * Handle direct attack on bot
     */
    handleBotDirectAttack() {
        if (this.game.currentPhase !== PHASES.BATTLE ||
            this.game.currentPlayer !== this.game.player ||
            this.selectedSpace === null) return;

        if (!this.game.board.getValidAttackTargets(this.game.player, this.game.bot).includes(null)) return;

        const attackerIndex = this.selectedSpace;
        this.selectedSpace = null;
        this.game.processAttack(attackerIndex, null);
    }

    /**
     * Highlight an attacker and its target while an attack resolves
     */
    showAttackHighlight(attackerIndex, attacker, defenderIndex, defender) {
        this.clearAttackHighlights();
        const prefix = p => (p === this.game.player ? 'player' : 'bot');
        document.getElementById(`${prefix(attacker)}-monster-${attackerIndex}`)?.classList.add('attack-source');
        if (defenderIndex === null) {
            document.querySelector(defender === this.game.player ? '.player-area-human' : '.bot-area')?.classList.add('direct-attack-target');
        } else {
            document.getElementById(`${prefix(defender)}-monster-${defenderIndex}`)?.classList.add('attack-target');
        }

        // Arrow and banner so the attack reads at a glance
        const tone = attacker === this.game.player ? 'you' : 'bot';
        const { from, to } = this.attackEls(attackerIndex, attacker, defenderIndex, defender);
        Fx.arrow(from, to, tone);
        const attackingCard = attacker.monsterSpaces[attackerIndex].card;
        const targetCard = defenderIndex === null ? null : defender.monsterSpaces[defenderIndex].card;
        if (attackingCard) {
            Fx.announce({
                text: targetCard
                    ? `${this.ownerLabel(attacker, attackingCard, true)} attacks ${this.ownerLabel(defender, targetCard)}`
                    : `${this.ownerLabel(attacker, attackingCard, true)} attacks ${defender === this.game.player ? 'you' : defender.name} directly`,
                tone,
                cards: targetCard ? [attackingCard, '→', targetCard] : [attackingCard],
                duration: 1400
            });
        }
    }

    /**
     * Clear all attack target highlights
     */
    clearAttackHighlights() {
        document.querySelectorAll('.monster-space').forEach(element => {
            element.classList.remove('attack-target', 'attack-source', 'highlight', 'targeted');
        });
        document.querySelectorAll('.player-area').forEach(element => {
            element.classList.remove('direct-attack-target', 'highlight', 'direct-target');
        });
        this.hideAttackPreview();
        this._previewArrow = null;
        Fx.clearArrows();
    }

    /**
     * Handle click on player's trap space
     * @param {number} spaceIndex - Space index
     */
    handlePlayerTrapSpaceClick(spaceIndex) {
        if (this.prompt) {
            this.promptPick(this.game.player.trapSpaces[spaceIndex].card, { zone: 'trap', owner: this.game.player, index: spaceIndex });
            return;
        }
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

    // ------------------------------------------------------------------
    // Board prompts. Choices such as sacrifices, traps, upkeep and discards are
    // made by clicking cards on the board or in the hand while the whole field
    // stays visible. The prompt panel in your corner explains the choice, keeps
    // a running total and holds the buttons.
    // ------------------------------------------------------------------

    /**
     * Start a board prompt, replacing any current one
     * @param {Object} prompt
     * @param {string} prompt.kind - sacrifice | fusion | upkeep | discard | trap | redirect | queen | joker
     * @param {string} prompt.tone - danger | fusion | react | redirect | you
     * @param {string} prompt.kicker - short heading
     * @param {string} prompt.text - what to do
     * @param {(card: Card, where: {zone: string, owner: Player, index: number|null}) => boolean} prompt.canPick
     * @param {(card: Card, where: Object) => void} prompt.onPick
     * @param {() => Array<{label: string, primary?: boolean, disabled?: boolean, run: Function}>} prompt.actions
     * @param {() => string} [prompt.status] - running total or summary
     * @param {() => Set<string>} [prompt.picked] - ids of cards marked as chosen
     * @param {string} [prompt.pickLabel] - tag shown on chosen cards
     * @param {Function} [prompt.cancel] - what Esc does; omit when a choice is required
     */
    startPrompt(prompt) {
        this.prompt = prompt;
        this.cancelZoom();
        this.renderPrompt();
    }

    endPrompt() {
        this.prompt = null;
        this.renderPrompt();
    }

    /**
     * Draw the prompt panel and mark what can be picked
     */
    renderPrompt() {
        const p = this.prompt;
        document.body.classList.toggle('prompting', !!p);
        ['danger', 'fusion', 'react', 'redirect', 'you'].forEach(tone => {
            document.body.classList.toggle(`prompt-${tone}`, !!p && p.tone === tone);
        });

        const panel = document.getElementById('prompt-panel');
        if (panel) {
            panel.hidden = !p;
            panel.innerHTML = '';
            if (p) {
                const make = (tag, cls, text) => {
                    const el = document.createElement(tag);
                    el.className = cls;
                    if (text) el.textContent = text;
                    return el;
                };
                panel.append(make('div', 'prompt-kicker', p.kicker), make('p', 'prompt-text', p.text));
                const row = make('div', 'prompt-row');
                row.appendChild(make('span', 'prompt-status', p.status ? p.status() : ''));
                const actions = make('div', 'prompt-actions');
                p.actions().forEach(action => {
                    const button = make('button', action.primary ? 'prompt-button primary' : 'prompt-button', action.label);
                    button.type = 'button';
                    button.disabled = !!action.disabled;
                    button.addEventListener('click', () => action.run());
                    actions.appendChild(button);
                });
                row.appendChild(actions);
                panel.appendChild(row);
            }
        }
        this.applyPromptMarks();
    }

    /**
     * Mark pickable and picked cards in the hand and on both sides of the board
     */
    applyPromptMarks() {
        const p = this.prompt;
        const picked = p && p.picked ? p.picked() : new Set();
        const mark = (el, card, where) => {
            const can = !!p && !!card && p.canPick(card, where);
            const isPicked = !!p && !!card && picked.has(card.id);
            el.classList.toggle('pickable', can);
            el.classList.toggle('picked', isPicked);
            if (isPicked && p.pickLabel) el.dataset.pickLabel = p.pickLabel;
            else delete el.dataset.pickLabel;
        };

        document.querySelectorAll('#player-hand .card').forEach(el => {
            const card = this.game.player.hand.find(c => c.id === el.dataset.cardId);
            mark(el, card, { zone: 'hand', owner: this.game.player, index: null });
        });
        document.querySelectorAll('.board-panel .monster-space, .board-panel .trap-space').forEach(space => {
            const where = this.spaceInfo(space);
            mark(space, where.card, where);
        });
        this.makeSpacesFocusable();
    }

    /**
     * Which player, zone and slot a board space is, and the card in it
     */
    spaceInfo(space) {
        const [owner, type, index] = space.id.split('-');
        const player = owner === 'player' ? this.game.player : this.game.bot;
        const i = Number(index);
        const card = (type === 'monster' ? player.monsterSpaces : player.trapSpaces)[i].card;
        return { zone: type === 'monster' ? 'field' : 'trap', owner: player, index: i, card };
    }

    /**
     * A click (or Enter) on a card while a prompt is open
     * @returns {boolean} - true when a prompt is open, so the normal click handling should stop
     */
    promptPick(card, where) {
        const p = this.prompt;
        if (!p) return false;
        if (card && p.canPick(card, where)) {
            p.onPick(card, where);
            if (this.prompt === p) this.renderPrompt(); // onPick may have ended or replaced the prompt
        }
        return true;
    }

    /**
     * Summon a big monster: pick sacrifices on the field or in the hand
     * @param {Card} card - the big monster being summoned
     * @param {number|null} targetSpace - preferred space (null when none is free)
     * @param {Function|null} postCallback - run after the sacrifices instead of summoning (used by fusions)
     * @param {boolean} requireFieldSacrifice - at least one sacrifice must come from the field
     */
    showSacrificeDialog(card, targetSpace, postCallback = null, requireFieldSacrifice = false) {
        this.sacrificeCards = [];
        this.selectedCard = card;
        this.selectedSpace = targetSpace;
        this._postSacrificeCallback = postCallback;
        this._requireFieldSacrifice = !!requireFieldSacrifice;

        const player = this.game.player;
        const required = getRequiredSacrificeValue(card);
        // After a fusion, the field monster being fused can't also be sacrificed
        const fusing = postCallback && typeof targetSpace === 'number' ? player.monsterSpaces[targetSpace].card : null;
        const inHand = c => player.hand.some(h => h.id === c.id);
        const ready = () => getTotalCardValue(this.sacrificeCards) >= required &&
            (!this._requireFieldSacrifice || this.sacrificeCards.some(c => !inHand(c)));

        this.updatePlayerHand();
        this.startPrompt({
            kind: 'sacrifice',
            tone: 'danger',
            pickLabel: 'SACRIFICE',
            kicker: postCallback ? `Fuse with ${describeCard(card)}` : `Summon ${describeCard(card)}`,
            text: `Pick monsters worth ${required} or more to sacrifice, on your field or in your hand.` +
                (this._requireFieldSacrifice ? ' Your field is full, so at least one must be on the field.' : ''),
            canPick: (c, where) => isMonsterCard(c) && c.id !== card.id &&
                (where.zone === 'hand' || (where.zone === 'field' && where.owner === player && !(fusing && c.id === fusing.id))),
            onPick: (c) => this.toggleSacrificeCard(c.id),
            picked: () => new Set(this.sacrificeCards.map(c => c.id)),
            status: () => `${getTotalCardValue(this.sacrificeCards)} / ${required}`,
            actions: () => [
                { label: 'Cancel', run: () => this.closeSacrificeDialog() },
                { label: postCallback ? 'Sacrifice and fuse' : 'Summon', primary: true, disabled: !ready(), run: () => this.confirmSacrifice() }
            ],
            cancel: () => this.closeSacrificeDialog()
        });
    }

    /**
     * Add or remove a card from the sacrifices
     * @param {string} cardId
     */
    toggleSacrificeCard(cardId) {
        const player = this.game.player;
        const card = player.hand.find(c => c.id === cardId) ||
            player.monsterSpaces.map(s => s.card).find(c => c && c.id === cardId);
        if (!card) return;
        const existingIndex = this.sacrificeCards.findIndex(c => c.id === cardId);
        if (existingIndex !== -1) this.sacrificeCards.splice(existingIndex, 1);
        else this.sacrificeCards.push(card);
    }

    /**
     * Leave the sacrifice prompt. Backing out of a fusion's sacrifices returns to that fusion.
     */
    closeSacrificeDialog() {
        const wasPostFusion = !!this._postSacrificeCallback;
        const returnHandCardId = this.selectedCard ? this.selectedCard.id : null;
        const returnFieldIndex = (typeof this.fusionFieldIndex === 'number') ? this.fusionFieldIndex : null;

        this.sacrificeCards = [];
        this.selectedCard = null;
        this.selectedSpace = null;
        this._postSacrificeCallback = null;
        this.endPrompt();
        this.updatePlayerHand();
        this.highlightSpacesForCurrentPhase();
        this.updateSidePanels();

        if (wasPostFusion && returnFieldIndex !== null && this.game.player.monsterSpaces[returnFieldIndex].card) {
            this.showFusionDialog(returnFieldIndex);
            const handCard = this.game.player.hand.find(c => c.id === returnHandCardId);
            if (handCard) {
                this.selectFusionCard(handCard);
                this.renderPrompt();
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

        this.showFusionDialog(spaceIndex);
    }

    /**
     * Fuse a field monster: pick a lower monster from the hand
     * @param {number} fieldIndex - index of the field monster to fuse
     */
    showFusionDialog(fieldIndex) {
        const player = this.game.player;
        const base = player.monsterSpaces[fieldIndex].card;
        if (!base) return;

        this.fusionFieldIndex = fieldIndex;
        this.fusionSelectedHandCardId = null;

        const baseValue = base.isFusion ? base.fusionStrength : getCardNumericValue(base.value);
        // Only strictly lower monsters from the hand can join it
        const isCandidate = c => isMonsterCard(c) && !c.isFusion && getCardNumericValue(c.value) < baseValue;
        const chosen = () => player.hand.find(c => c.id === this.fusionSelectedHandCardId) || null;
        const anyCandidate = player.hand.some(isCandidate);

        this.startPrompt({
            kind: 'fusion',
            tone: 'fusion',
            pickLabel: 'FUSE',
            kicker: `Fuse ${describeCard(base)}`,
            text: anyCandidate
                ? 'Pick a lower monster from your hand to fuse with it. Click another of your monsters to fuse that one instead.'
                : `No monster in your hand is lower than ${describeCard(base)}, so it can't fuse right now.`,
            canPick: (c, where) => (where.zone === 'hand' && isCandidate(c)) ||
                (where.zone === 'field' && where.owner === player && isMonsterCard(c) && !c.isFusion),
            onPick: (c, where) => {
                if (where.zone === 'field') {
                    // The same monster again backs out; another one switches the fusion to it
                    if (where.index === this.fusionFieldIndex) this.closeFusionDialog();
                    else this.showFusionDialog(where.index);
                    return;
                }
                this.selectFusionCard(c);
            },
            picked: () => new Set([base.id, this.fusionSelectedHandCardId].filter(Boolean)),
            status: () => {
                const c = chosen();
                return c ? `${describeCard(base)} + ${describeCard(c)} = STR ${baseValue + getCardNumericValue(c.value)}` : '';
            },
            actions: () => [
                { label: 'Cancel', run: () => this.closeFusionDialog() },
                { label: 'Fuse', primary: true, disabled: !chosen(), run: () => this.confirmFusion() }
            ],
            cancel: () => this.closeFusionDialog()
        });
    }

    /**
     * Choose (or un-choose) the hand card to fuse with
     * @param {Card} card
     */
    selectFusionCard(card) {
        if (!card) return;
        this.fusionSelectedHandCardId = this.fusionSelectedHandCardId === card.id ? null : card.id;
    }

    /**
     * Leave the fusion prompt
     */
    closeFusionDialog() {
        this.fusionCards = [];
        this.fusionTargetSpace = null;
        this.fusionSelectedHandCardId = null;
        // A fusion that needs sacrifices hands over to the sacrifice prompt; leave that one open
        if (this.prompt && this.prompt.kind === 'fusion') this.endPrompt();
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
        // If the chosen hand card is a Big Monster, it needs sacrifices first (same as summoning that monster)
        const handCardType = getCardType(handCard.value);
        if (handCardType === CARD_TYPES.MONSTER_BIG) {
            this.closeFusionDialog();
            // After confirming sacrifices, create the fusion
            this.showSacrificeDialog(handCard, this.fusionFieldIndex, (sacrifices) => {
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
     * Ask the human defender whether to respond to an attack with a trap.
     * There is no time limit: the attack waits for the player's choice.
     * @param {Object} context - { attacker, attackerIndex, defender, defenderIndex, traps }
     * @returns {Promise<{trap: Card, target?: {player: Player, index: number}}|null>}
     */
    promptTrapResponse(context) {
        return new Promise((resolve) => {
            this._reaction = { context, resolve, jackTrap: null, targets: [] };
            this._showReactionOptions();
        });
    }

    /**
     * Your traps that can answer the attack glow in their slots; click one or let the attack through
     */
    _showReactionOptions() {
        const { context } = this._reaction;
        const player = this.game.player;
        const attackingCard = context.attacker.monsterSpaces[context.attackerIndex].card;
        const targetCard = context.defenderIndex === null ? null : context.defender.monsterSpaces[context.defenderIndex].card;
        const names = context.traps.map(t => `${getTrapName(t.value)} (${describeCard(t)})`).join(', ');

        this.startPrompt({
            kind: 'trap',
            tone: 'react',
            kicker: `${context.attacker.name}'s ${describeCard(attackingCard)} attacks ${targetCard ? `your ${describeCard(targetCard)}` : 'you directly'}`,
            text: `Click a glowing trap to respond: ${names}. Or let the attack through.`,
            canPick: (c, where) => where.zone === 'trap' && where.owner === player && context.traps.some(t => t.id === c.id),
            onPick: (c) => this._chooseReactionTrap(context.traps.find(t => t.id === c.id)),
            actions: () => [{ label: 'Let it through', run: () => this._finishReaction(null) }]
        });
    }

    /**
     * A trap was chosen. Most resolve at once; a Jack first needs the monster to redirect the attack to.
     * @param {Card} trap
     */
    _chooseReactionTrap(trap) {
        if (!this._reaction || !trap) return;
        if (trap.value !== CARD_VALUES.JACK) {
            this._finishReaction({ trap });
            return;
        }

        const { context } = this._reaction;
        const targets = this.game.board.getValidRedirectTargets(
            context.attackerIndex, context.attacker, context.defenderIndex, context.defender);
        if (targets.length === 0) {
            this.addLogMessage('No valid redirect targets for Jack');
            return;
        }
        this._reaction.jackTrap = trap;
        this._reaction.targets = targets;
        const targetAt = where => targets.find(t => t.player === where.owner && t.index === where.index);

        this.startPrompt({
            kind: 'redirect',
            tone: 'redirect',
            pickLabel: 'JACK',
            kicker: 'Jack: redirect the attack',
            text: 'Click the monster that should take the attack instead. It can be on either side of the board.',
            canPick: (c, where) => where.zone === 'field' && !!targetAt(where),
            onPick: (c, where) => this._finishReaction({ trap, target: targetAt(where) }),
            picked: () => new Set([trap.id]),
            actions: () => [{ label: 'Back', run: () => this._cancelRedirect() }],
            cancel: () => this._cancelRedirect()
        });
    }

    /**
     * Back out of the Jack's target choice to the list of traps
     */
    _cancelRedirect() {
        if (!this._reaction) return;
        this._reaction.jackTrap = null;
        this._reaction.targets = [];
        this._showReactionOptions();
    }

    _finishReaction(choice) {
        this.endPrompt();
        const reaction = this._reaction;
        this._reaction = null;
        if (reaction) reaction.resolve(choice);
    }

    /**
     * Ask the human whether to cancel the opponent's trap with one of their Queens
     * @param {Card} trap - The opponent's trap being activated
     * @param {Array} queens - Player Queens that can respond
     * @returns {Promise<Card|null>} - Queen to use, or null
     */
    promptCancelTrap(trap, queens) {
        return new Promise((resolve) => {
            this._queenPrompt = { queens, resolve };
            const player = this.game.player;
            this.startPrompt({
                kind: 'queen',
                tone: 'react',
                kicker: `${this.game.bot.name} springs ${describeCard(trap)}: ${getTrapName(trap.value)}`,
                text: 'Click your glowing Queen to cancel it, or let it happen.',
                canPick: (c, where) => where.zone === 'trap' && where.owner === player && queens.some(q => q.id === c.id),
                onPick: (c) => this._finishQueenPrompt(queens.find(q => q.id === c.id)),
                actions: () => [{ label: 'Don’t cancel', run: () => this._finishQueenPrompt(null) }]
            });
        });
    }

    /**
     * @param {Card|null} queen - the Queen to use, or null to let the trap happen
     */
    _finishQueenPrompt(queen) {
        this.endPrompt();
        const prompt = this._queenPrompt;
        this._queenPrompt = null;
        if (prompt) prompt.resolve(queen || null);
    }

    /**
     * End phase: pick monster cards on the field or in the hand to pay for each fusion
     * @param {Array|number} fusions - Active fusions, or how many there are
     */
    showFusionUpkeepDialog(fusions) {
        const needed = Array.isArray(fusions) ? fusions.length : Number(fusions) || 0;
        const s = needed === 1 ? '' : 's';
        const player = this.game.player;
        this.sacrificeCards = [];

        this.startPrompt({
            kind: 'upkeep',
            tone: 'danger',
            pickLabel: 'PAY',
            kicker: 'Fusion upkeep',
            text: `Pick ${needed} monster card${s} from your field or hand to keep your fusion${s}. An unpaid fusion breaks apart: only its stronger card stays.`,
            // Upkeep is paid with monster cards, never with a fusion
            canPick: (c, where) => isMonsterCard(c) && !c.isFusion &&
                (where.zone === 'hand' || (where.zone === 'field' && where.owner === player)),
            onPick: (c) => this.toggleUpkeepCard(c.id),
            picked: () => new Set(this.sacrificeCards.map(c => c.id)),
            status: () => `${this.sacrificeCards.length} / ${needed}`,
            actions: () => {
                const paid = this.sacrificeCards.length;
                return [
                    { label: `Break fusion${s}`, run: () => this.skipFusionUpkeep() },
                    {
                        label: paid >= needed ? 'Pay upkeep' : `Pay ${paid}, break ${needed - paid}`,
                        primary: true,
                        disabled: paid === 0,
                        run: () => this.confirmFusionUpkeep()
                    }
                ];
            }
        });
    }

    /**
     * Pay no upkeep: every fusion breaks apart, keeping its stronger card
     */
    skipFusionUpkeep() {
        this.endPrompt();
        this.sacrificeCards = [];
        this.game.handleFusionUpkeep([], false);
    }

    /**
     * Add or remove a card from the upkeep payment
     * @param {string} cardId - Card ID
     */
    toggleUpkeepCard(cardId) {
        const player = this.game.player;
        const card = player.hand.find(c => c.id === cardId) ||
            player.monsterSpaces.map(s => s.card).find(c => c && !c.isFusion && c.id === cardId);
        if (!card || !isMonsterCard(card)) return;

        const fusionCount = this.game.board.countActiveFusions(player);
        const existingIndex = this.sacrificeCards.findIndex(c => c.id === cardId);
        if (existingIndex !== -1) {
            this.sacrificeCards.splice(existingIndex, 1);
        } else if (this.sacrificeCards.length < fusionCount) {
            this.sacrificeCards.push(card);
        }
    }

    /**
     * Pay upkeep with the chosen cards; the game breaks apart any fusion left unpaid
     */
    confirmFusionUpkeep() {
        const cards = this.sacrificeCards;
        this.sacrificeCards = [];
        this.endPrompt();
        this.game.handleFusionUpkeep(cards);
    }

    /**
     * Over the hand limit: pick cards in the hand to discard
     * @param {number} excess - Number of cards to discard
     */
    showDiscardDialog(excess) {
        this.sacrificeCards = []; // Reuse for discard selection
        const s = excess === 1 ? '' : 's';

        this.startPrompt({
            kind: 'discard',
            tone: 'danger',
            pickLabel: 'DISCARD',
            kicker: 'Hand limit',
            text: `You hold ${this.game.player.hand.length} cards and the limit is ${GAME_SETTINGS.MAX_HAND_SIZE}. Pick ${excess} card${s} in your hand to discard.`,
            canPick: (c, where) => where.zone === 'hand',
            onPick: (c) => this.toggleDiscardCard(c.id),
            picked: () => new Set(this.sacrificeCards.map(c => c.id)),
            status: () => `${this.sacrificeCards.length} / ${excess}`,
            actions: () => [{
                label: `Discard ${excess}`,
                primary: true,
                disabled: this.sacrificeCards.length !== excess,
                run: () => this.confirmDiscard()
            }]
        });
    }

    /**
     * Add or remove a card from the discards
     * @param {string} cardId - Card ID
     */
    toggleDiscardCard(cardId) {
        const card = this.game.player.hand.find(c => c.id === cardId);
        if (!card) return;
        const excess = Math.max(0, this.game.player.hand.length - GAME_SETTINGS.MAX_HAND_SIZE);
        const existingIndex = this.sacrificeCards.findIndex(c => c.id === cardId);
        if (existingIndex !== -1) {
            this.sacrificeCards.splice(existingIndex, 1);
        } else if (this.sacrificeCards.length < excess) {
            this.sacrificeCards.push(card);
        }
    }

    /**
     * Confirm discard
     */
    confirmDiscard() {
        const cards = this.sacrificeCards;
        this.sacrificeCards = [];
        this.endPrompt();
        this.game.discardExcessCards(cards);
    }

    /**
     * Ask before playing the Joker, on the board rather than in a browser popup
     * @param {Card} card - the Joker
     */
    promptJoker(card) {
        const cancel = () => {
            this.endPrompt();
            this.selectedCard = null;
            this.updatePlayerHand();
            this.updateSidePanels();
        };
        this.selectedCard = card;
        this.updatePlayerHand();
        this.startPrompt({
            kind: 'joker',
            tone: 'you',
            kicker: 'Play the Joker?',
            text: 'The whole board and both hands are reset, the Joker leaves the match, and your Battle phase is skipped.',
            canPick: () => false,
            onPick: () => {},
            actions: () => [
                { label: 'Cancel', run: cancel },
                {
                    label: 'Play Joker',
                    primary: true,
                    run: () => {
                        this.endPrompt();
                        this.selectedCard = null;
                        this.game.playJoker(card);
                    }
                }
            ],
            cancel
        });
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
        } else if (winner === 'draw') {
            resultElement.textContent = 'Draw';
            messageElement.textContent = 'Both players fell at the same time.';
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
        const group = this.ensureLogTurn();
        const logEntry = document.createElement('li');
        logEntry.classList.add('log-entry');
        // Color the entry's dot by who it is about
        if (message.startsWith(this.game.player.name)) logEntry.classList.add('log-you');
        else if (message.startsWith(this.game.bot.name)) logEntry.classList.add('log-bot');
        logEntry.textContent = message;

        // Newest first
        const entries = group.querySelector('.log-entries');
        entries.prepend(logEntry);
        const count = entries.children.length;
        group.querySelector('.log-count').textContent = `${count} action${count === 1 ? '' : 's'}`;

        // A dot on the log button says there is something new to read
        if (document.getElementById('game-log').hidden) document.getElementById('log-btn').classList.add('has-unread');
    }

    /**
     * Get (or start) the battle log section for the current turn
     * @returns {HTMLElement}
     */
    ensureLogTurn() {
        const content = document.getElementById('log-content');
        const turn = String(this.game.turnCounter);
        let group = content.querySelector(`.log-turn[data-turn="${turn}"]`);
        if (!group) {
            group = document.createElement('li');
            group.className = 'log-turn';
            group.dataset.turn = turn;
            group.dataset.label = `Turn ${turn} · ${this.game.currentPlayer === this.game.player ? 'You' : this.game.bot.name}`;
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            const title = document.createElement('span');
            title.className = 'log-turn-title';
            const count = document.createElement('span');
            count.className = 'log-count';
            count.textContent = '0 actions';
            summary.append(title, count);
            const entries = document.createElement('ol');
            entries.className = 'log-entries';
            details.append(summary, entries);
            group.appendChild(details);
            content.prepend(group);
            // Keep the log bounded
            while (content.children.length > 40) content.lastElementChild.remove();
        }
        if (!group.classList.contains('is-current')) {
            // The current turn and the one before it start open; older turns collapse
            [...content.children].forEach((g, i) => {
                const current = g === group;
                g.classList.toggle('is-current', current);
                g.querySelector('details').open = i < 2;
                g.querySelector('.log-turn-title').textContent = current ? `This turn · ${g.dataset.label}` : g.dataset.label;
            });
        }
        return group;
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
        const { from, to } = this.attackEls(attackerIndex, attackerPlayer, defenderIndex, defenderPlayer);
        if (!from) return;

        // Attacker lunges at its target, then the target takes the hit
        await Fx.lunge(from.querySelector('.card') || from, to);
        const hit = defenderIndex === null ? to : (to && to.querySelector('.card')) || to;
        await Fx.impact(hit, 'danger');
    }

    /**
     * A trap was just sprung: its face flips up on the board (see animateBoardChanges) and a banner names it
     */
    async showTrapActivated(owner, trap) {
        Fx.announce({
            text: `${owner === this.game.player ? 'You spring' : `${owner.name} springs`} ${describeCard(trap)}: ${getTrapName(trap.value)}`,
            tone: 'react',
            cards: [trap],
            duration: 1500
        });
        await delay(900);
    }

    /**
     * A Queen cancelled a trap as it activated
     */
    async showTrapCancelled(canceller, queen, owner, trap) {
        const whose = owner === this.game.player ? 'your' : `${owner.name}'s`;
        Fx.announce({
            text: `${canceller === this.game.player ? 'Your Queen cancels' : `${canceller.name}'s Queen cancels`} ${whose} ${getTrapName(trap.value)}`,
            tone: 'react',
            cards: [queen, '×', trap],
            duration: 1700
        });
        await delay(1000);
    }

    /**
     * An Ace stopped the attacker's Battle phase
     */
    async showBattleEnded(attacker) {
        Fx.clearArrows();
        Fx.announce({
            text: `Ace: ${attacker === this.game.player ? 'your' : `${attacker.name}'s`} Battle phase is over`,
            tone: 'danger',
            duration: 1600
        });
        Fx.pulse(document.querySelector('#phase-steps li[data-phase="Battle"]'), 'danger');
        await delay(900);
    }

    /**
     * A King halved the attacker's strength
     */
    async showKingHalved(attacker, attackerIndex, card) {
        this.updateBoard();
        const halved = applyKingEffect(calculateMonsterStrength(card));
        const prefix = attacker === this.game.player ? 'player' : 'bot';
        const space = document.getElementById(`${prefix}-monster-${attackerIndex}`);
        Fx.floatText(space, `÷2 → ${halved}`, 'react');
        Fx.impact(space && space.querySelector('.card'), 'react');
        Fx.announce({
            text: `King halves ${this.ownerLabel(attacker, card)} to ${halved}`,
            tone: 'react',
            cards: [card],
            duration: 1500
        });
        await delay(800);
    }

    /**
     * A Jack sent the attack somewhere else: re-aim the arrow and mark the new target
     */
    async showRedirect(attacker, attackerIndex, oldDefender, oldIndex, newDefender, newIndex) {
        Fx.clearArrows();
        const { from, to } = this.attackEls(attackerIndex, attacker, newIndex, newDefender);
        const oldTarget = this.attackEls(attackerIndex, attacker, oldIndex, oldDefender).to;
        document.querySelectorAll('.monster-space.attack-target').forEach(el => el.classList.remove('attack-target'));
        document.querySelectorAll('.player-area.direct-attack-target').forEach(el => el.classList.remove('direct-attack-target'));
        to?.classList.add('attack-target');

        if (oldTarget && oldTarget !== to) Fx.arrow(oldTarget, to, 'redirect', { dashed: true });
        Fx.arrow(from, to, 'redirect');
        Fx.impact(to && to.querySelector('.card'), 'redirect');
        const card = newDefender.monsterSpaces[newIndex].card;
        Fx.announce({
            text: `Jack redirects the attack to ${this.ownerLabel(newDefender, card)}`,
            tone: 'redirect',
            cards: [card],
            duration: 1600
        });
        await delay(800);
    }

    /**
     * Banner for how an attack ended; destroyed monsters shatter on the next board render
     */
    showAttackResult(attacker, attackingCard, targetPlayer, targetCard, result) {
        const you = this.game.player;
        const name = p => (p === you ? 'You' : p.name);
        const takes = p => `${name(p)} ${p === you ? 'take' : 'takes'} ${result.damage}`;

        if (result.direct) {
            Fx.announce({ text: `Direct hit: ${takes(targetPlayer)}`, tone: targetPlayer === you ? 'danger' : 'success' });
            return;
        }
        if (result.attackerDestroyed) this.fxHint(attackingCard.id, 'destroy');
        if (result.defenderDestroyed && targetCard) this.fxHint(targetCard.id, 'destroy');

        let text;
        let hurt = null;
        if (result.attackerDestroyed && result.defenderDestroyed) {
            text = 'Both monsters destroyed. No damage';
        } else if (result.defenderDestroyed) {
            hurt = targetPlayer;
            text = `${this.ownerLabel(targetPlayer, targetCard, true)} is destroyed. ${takes(targetPlayer)}`;
        } else {
            hurt = attacker;
            text = `${this.ownerLabel(attacker, attackingCard, true)} is destroyed. ${takes(attacker)}`;
        }
        Fx.announce({
            text,
            tone: hurt === you ? 'danger' : hurt ? 'success' : 'neutral',
            cards: [attackingCard, '×', targetCard].filter(Boolean),
            duration: 1900
        });
    }

    /**
     * Resolves once the action banners on screen have been up long enough to read (see Fx.whenBannersRead)
     */
    whenBannersRead() {
        return Fx.whenBannersRead();
    }

    /**
     * Banner for a play. Your own summons and traps get only the card animation, since you just made them.
     * @param {Player|null} player - who played it; null for events that always show
     */
    announcePlay(player, text, cards = [], tone) {
        if (player === this.game.player) return;
        Fx.announce({ text, cards, tone: tone || (player ? 'bot' : 'neutral'), duration: player ? 1300 : 1900 });
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
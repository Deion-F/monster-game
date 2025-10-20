/**
 * Main entry point for Monster Card Battle game
 */
document.addEventListener('DOMContentLoaded', () => {
    // Initialize game components
    initializeGame();
    setupEventListeners();
});

/**
 * Initialize game components
 */
function initializeGame() {
    // Initialize tutorial system
    TutorialManager.initializeTutorial();
    
    // Create game instance
    window.game = new Game();
    
    // Show welcome screen
    document.getElementById('welcome-dialog').showModal();
    
    // Set default game settings
    // Note: player-name input uses placeholder text, not a default value
    document.getElementById('difficulty-medium').checked = true;
}

/**
 * Set up global event listeners
 */
function setupEventListeners() {
    // Welcome dialog events (guarded)
    const startBtn = document.getElementById('start-game');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            const playerInput = document.getElementById('player-name');
            const playerName = (playerInput && playerInput.value.trim()) ? playerInput.value.trim() : 'Player';

            let difficulty = 'medium';
            const easy = document.getElementById('difficulty-easy');
            const medium = document.getElementById('difficulty-medium');
            const hard = document.getElementById('difficulty-hard');
            if (easy && easy.checked) difficulty = 'easy';
            else if (hard && hard.checked) difficulty = 'hard';

            const welcomeDialog = document.getElementById('welcome-dialog');
            if (welcomeDialog && typeof welcomeDialog.close === 'function') welcomeDialog.close();
            startNewGame(playerName, difficulty);
        });
    }

    const showTutorialBtn = document.getElementById('show-tutorial');
    if (showTutorialBtn) {
        showTutorialBtn.addEventListener('click', (event) => {
            event.preventDefault();
            const welcomeDialog = document.getElementById('welcome-dialog');
            const tutorialDialog = document.getElementById('tutorial-dialog');
            try {
                if (welcomeDialog && typeof welcomeDialog.close === 'function') welcomeDialog.close();
            } catch (err) {
                if (welcomeDialog) welcomeDialog.style.display = 'none';
            }
            if (!tutorialDialog) return console.warn('Tutorial dialog element not found');
            if (typeof tutorialDialog.showModal === 'function') {
                try { tutorialDialog.showModal(); } catch (err) { tutorialDialog.classList.add('visible'); }
            } else {
                tutorialDialog.classList.add('visible');
            }
        });
    }

    // Delegated tutorial navigation (works if buttons are present or recreated)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest && e.target.closest('button');
        if (!btn) return;
        const id = btn.id;

        if (id === 'prev-tutorial') return TutorialManager.showPreviousPage();
        if (id === 'next-tutorial') return TutorialManager.showNextPage();
        if (id === 'back-to-welcome') {
            const tutorialDialog = document.getElementById('tutorial-dialog');
            const welcomeDialog = document.getElementById('welcome-dialog');
            try { if (tutorialDialog && typeof tutorialDialog.close === 'function') tutorialDialog.close(); }
            catch (err) { if (tutorialDialog) tutorialDialog.style.display = 'none'; }
            setTimeout(() => { if (welcomeDialog && typeof welcomeDialog.showModal === 'function') welcomeDialog.showModal(); }, 40);
            return;
        }
    });

    // Back to welcome screen (guarded)
    const backToWelcomeBtn = document.getElementById('back-to-welcome');
    if (backToWelcomeBtn) {
        backToWelcomeBtn.addEventListener('click', () => {
            const tutorialDialog = document.getElementById('tutorial-dialog');
            const welcomeDialog = document.getElementById('welcome-dialog');
            try { if (tutorialDialog && typeof tutorialDialog.close === 'function') tutorialDialog.close(); }
            catch (err) { if (tutorialDialog) tutorialDialog.style.display = 'none'; }
            setTimeout(() => { if (welcomeDialog && typeof welcomeDialog.showModal === 'function') welcomeDialog.showModal(); }, 60);
        });
    }

    // Game action buttons (guarded)
    const endPhaseBtn = document.getElementById('end-phase-btn');
    if (endPhaseBtn) endPhaseBtn.addEventListener('click', () => window.game.endCurrentPhase());

    const directAttackBtn = document.getElementById('direct-attack-btn');
    if (directAttackBtn) directAttackBtn.addEventListener('click', () => window.game.startDirectAttack && window.game.startDirectAttack());

    // Victory/defeat dialog - use 'new-game' which exists in HTML
    const newGameBtn = document.getElementById('new-game');
    if (newGameBtn) {
        newGameBtn.addEventListener('click', () => {
            const gameOverDialog = document.getElementById('game-over-dialog');
            if (gameOverDialog && typeof gameOverDialog.close === 'function') gameOverDialog.close();
            startNewGame(window.game.player ? window.game.player.name : 'Player', window.game.botPlayer ? window.game.botPlayer.difficulty : 'medium');
        });
    }

    // Help button (id in index.html is 'help-button')
    const helpButton = document.getElementById('help-button');
    if (helpButton) helpButton.addEventListener('click', () => {
        const tutorialDialog = document.getElementById('tutorial-dialog');
        if (!tutorialDialog) return;
        if (typeof tutorialDialog.showModal === 'function') tutorialDialog.showModal(); else tutorialDialog.classList.add('visible');
    });

    // Confirm and selection dialogs - guard existence before binding
    const confirmYes = document.getElementById('confirm-yes');
    if (confirmYes) confirmYes.addEventListener('click', () => { if (window.confirmCallback) window.confirmCallback(true); const dlg = document.getElementById('confirm-dialog'); if (dlg && typeof dlg.close === 'function') dlg.close(); });
    const confirmNo = document.getElementById('confirm-no');
    if (confirmNo) confirmNo.addEventListener('click', () => { if (window.confirmCallback) window.confirmCallback(false); const dlg = document.getElementById('confirm-dialog'); if (dlg && typeof dlg.close === 'function') dlg.close(); });

    const selectionCancel = document.getElementById('selection-cancel');
    if (selectionCancel) selectionCancel.addEventListener('click', () => { if (window.selectionCancelCallback) window.selectionCancelCallback(); const dlg = document.getElementById('selection-dialog'); if (dlg && typeof dlg.close === 'function') dlg.close(); });

    const sacrificeDone = document.getElementById('sacrifice-done');
    if (sacrificeDone) sacrificeDone.addEventListener('click', () => { if (window.sacrificeCallback) {
        const selectedCards = Array.from(document.querySelectorAll('#sacrifice-area .card.selected')).map(card => card.cardObject);
        window.sacrificeCallback(selectedCards);
    } const dlg = document.getElementById('sacrifice-dialog'); if (dlg && typeof dlg.close === 'function') dlg.close(); });

    const sacrificeCancel = document.getElementById('sacrifice-cancel');
    if (sacrificeCancel) sacrificeCancel.addEventListener('click', () => { if (window.sacrificeCancelCallback) window.sacrificeCancelCallback(); const dlg = document.getElementById('sacrifice-dialog'); if (dlg && typeof dlg.close === 'function') dlg.close(); });

    const actionBtn = document.getElementById('action-button');
    if (actionBtn) actionBtn.addEventListener('click', () => { if (window.actionButtonCallback) window.actionButtonCallback(); });

    // Setup key shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && document.activeElement && document.activeElement.tagName !== 'INPUT') {
            e.preventDefault();
            window.game.endCurrentPhase();
        }
        if (e.code === 'KeyH' && document.activeElement && document.activeElement.tagName !== 'INPUT') {
            const tutorialDialog = document.getElementById('tutorial-dialog');
            if (tutorialDialog && typeof tutorialDialog.showModal === 'function') tutorialDialog.showModal();
        }
    });
}

// Global fallback for inline onclick in welcome dialog
function openTutorialFromWelcome(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    console.log('openTutorialFromWelcome called');

    const welcomeDialog = document.getElementById('welcome-dialog');
    const tutorialDialog = document.getElementById('tutorial-dialog');

    try {
        if (welcomeDialog && typeof welcomeDialog.close === 'function') welcomeDialog.close();
        else if (welcomeDialog) welcomeDialog.style.display = 'none';
    } catch (err) {
        if (welcomeDialog) welcomeDialog.style.display = 'none';
        console.warn('Warning closing welcome dialog (inline fallback)', err);
    }

    if (!tutorialDialog) return console.warn('Tutorial dialog element not found');
    if (typeof tutorialDialog.showModal === 'function') {
        try {
            tutorialDialog.showModal();
        } catch (err) {
            tutorialDialog.setAttribute('open', '');
            tutorialDialog.style.display = 'block';
            tutorialDialog.classList.add('centered-dialog');
        }
    } else {
        tutorialDialog.setAttribute('open', '');
        tutorialDialog.style.display = 'block';
        tutorialDialog.classList.add('centered-dialog');
    }
}

// Inline fallback functions for tutorial controls
function tutorialPrev() {
    console.log('tutorialPrev called');
    TutorialManager.showPreviousPage();
}

function tutorialNext() {
    console.log('tutorialNext called');
    TutorialManager.showNextPage();
}

function backToWelcome() {
    console.log('backToWelcome called');
    const tutorialDialog = document.getElementById('tutorial-dialog');
    const welcomeDialog = document.getElementById('welcome-dialog');
    try {
        if (tutorialDialog && typeof tutorialDialog.close === 'function') tutorialDialog.close();
        else if (tutorialDialog) tutorialDialog.style.display = 'none';
    } catch (err) {
        if (tutorialDialog) tutorialDialog.style.display = 'none';
    }
    setTimeout(() => {
        if (welcomeDialog) {
            if (typeof welcomeDialog.showModal === 'function') welcomeDialog.showModal();
            else { welcomeDialog.style.display = 'block'; welcomeDialog.classList.add('centered-dialog'); }
        }
    }, 40);
}

/**
 * Start a new game with the given settings
 * @param {string} playerName - Name of the human player
 * @param {string} difficulty - Game difficulty (easy, medium, hard)
 */
function startNewGame(playerName, difficulty) {
    // Reset UI (guard elements that may not exist)
    const gameContainer = document.getElementById('game-container') || document.querySelector('.game-container');
    if (gameContainer) gameContainer.innerHTML = gameContainer.innerHTML; // keep structure; UI.updateGameState will render into existing elements
    const infoPanel = document.getElementById('info-panel');
    if (infoPanel) infoPanel.innerHTML = '';

    // Initialize new game
    window.game = new Game();
    
    // Set player name and bot difficulty directly
    window.game.player.name = playerName;
    window.game.botPlayer.difficulty = difficulty;
    
    // Start the first turn to automatically draw cards
    window.game.startTurn();
    
    // Update UI
    window.game.ui.updateGameState();
    window.game.ui.updateTurnAndPhase();
    
    // Enable help button (id in HTML is 'help-button')
    const helpBtn = document.getElementById('help-button') || document.getElementById('help-btn');
    if (helpBtn) helpBtn.disabled = false;
    
    console.log(`Starting new game: Player '${playerName}' vs Bot (${difficulty})`);
}

/**
 * Show a confirmation dialog
 * @param {string} message - Message to display
 * @param {function} callback - Function to call with boolean result
 */
function showConfirmation(message, callback) {
    document.getElementById('confirm-message').textContent = message;
    window.confirmCallback = callback;
    document.getElementById('confirm-dialog').showModal();
}

/**
 * Show a selection dialog with cards
 * @param {string} title - Dialog title
 * @param {Array} cards - Array of card objects to display
 * @param {number} minSelection - Minimum number of cards to select
 * @param {number} maxSelection - Maximum number of cards to select
 * @param {function} callback - Function called with selected cards array
 * @param {function} cancelCallback - Function called if selection is cancelled
 */
function showSelectionDialog(title, cards, minSelection, maxSelection, callback, cancelCallback) {
    const dialog = document.getElementById('selection-dialog');
    const content = document.getElementById('selection-content');
    const titleEl = document.getElementById('selection-title');
    
    titleEl.textContent = title;
    content.innerHTML = '';
    
    // Create card elements
    cards.forEach(card => {
        const cardElement = card.createCardElement();
        cardElement.classList.add('selectable');
        cardElement.addEventListener('click', () => {
            if (cardElement.classList.contains('selected')) {
                cardElement.classList.remove('selected');
            } else {
                const selectedCount = document.querySelectorAll('#selection-content .card.selected').length;
                if (selectedCount < maxSelection) {
                    cardElement.classList.add('selected');
                }
            }
            
            // Update confirm button state
            const selectedCount = document.querySelectorAll('#selection-content .card.selected').length;
            document.getElementById('selection-confirm').disabled = selectedCount < minSelection;
        });
        content.appendChild(cardElement);
    });
    
    // Set button state and callbacks
    document.getElementById('selection-confirm').disabled = minSelection > 0;
    document.getElementById('selection-confirm').textContent = 
        maxSelection === 1 ? 'Select' : 'Select Cards';
        
    document.getElementById('selection-confirm').onclick = () => {
        const selectedCards = Array.from(
            document.querySelectorAll('#selection-content .card.selected')
        ).map(el => {
            const cardId = el.getAttribute('data-card-id');
            return cards.find(c => c.id === cardId);
        });
        
        callback(selectedCards);
        dialog.close();
    };
    
    window.selectionCancelCallback = cancelCallback;
    
    // Show dialog
    dialog.showModal();
}

/**
 * Show sacrifice dialog for sacrificing cards
 * @param {string} title - Dialog title
 * @param {Array} cards - Array of card objects to select from
 * @param {number} requiredValue - Total value required for sacrifice
 * @param {function} callback - Function called with selected cards array
 * @param {function} cancelCallback - Function called if sacrifice is cancelled
 */
function showSacrificeDialog(title, cards, requiredValue, callback, cancelCallback) {
    const dialog = document.getElementById('sacrifice-dialog');
    const area = document.getElementById('sacrifice-area');
    const titleEl = document.getElementById('sacrifice-title');
    const valueEl = document.getElementById('sacrifice-value');
    
    titleEl.textContent = title;
    area.innerHTML = '';
    
    // Initialize sacrifice value
    let currentValue = 0;
    valueEl.textContent = `${currentValue} / ${requiredValue}`;
    document.getElementById('sacrifice-done').disabled = currentValue < requiredValue;
    
    // Create card elements
    cards.forEach(card => {
        const cardElement = card.createCardElement();
        cardElement.classList.add('selectable');
        cardElement.addEventListener('click', () => {
            if (cardElement.classList.contains('selected')) {
                cardElement.classList.remove('selected');
                currentValue -= card.value;
            } else {
                cardElement.classList.add('selected');
                currentValue += card.value;
            }
            
            // Update value display and button state
            valueEl.textContent = `${currentValue} / ${requiredValue}`;
            document.getElementById('sacrifice-done').disabled = currentValue < requiredValue;
        });
        area.appendChild(cardElement);
    });
    
    // Set callbacks
    window.sacrificeCallback = callback;
    window.sacrificeCancelCallback = cancelCallback;
    
    // Show dialog
    dialog.showModal();
}

/**
 * Show the game over dialog
 * @param {boolean} victory - Whether the player won
 * @param {string} message - Result message
 */
function showGameOver(victory, message) {
    const dialog = document.getElementById('game-over-dialog');
    const title = document.getElementById('game-over-title');
    const result = document.getElementById('game-over-result');
    
    title.textContent = victory ? 'Victory!' : 'Defeat';
    title.className = victory ? 'victory-text' : 'defeat-text';
    result.textContent = message;
    
    dialog.showModal();
}
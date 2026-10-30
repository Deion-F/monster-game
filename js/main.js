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
    document.getElementById('player-name').value = 'Player';
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

            const godMode = document.getElementById('god-mode');
            window.game.godMode = !!(godMode && godMode.checked);
            document.body.classList.toggle('god-mode', window.game.godMode);

            const welcomeDialog = document.getElementById('welcome-dialog');
            if (welcomeDialog && typeof welcomeDialog.close === 'function') welcomeDialog.close();
            startNewGame(playerName);
        });
    }

    // 'How to Play' uses the inline openTutorialFromWelcome handler in index.html

    // Tutorial Previous/Next/Back buttons use inline onclick handlers in index.html

    // Close tutorial (top-right X)
    const closeTutorialBtn = document.getElementById('close-tutorial');
    if (closeTutorialBtn) {
        closeTutorialBtn.addEventListener('click', () => {
            const tutorialDialog = document.getElementById('tutorial-dialog');
            if (tutorialDialog && typeof tutorialDialog.close === 'function') tutorialDialog.close();
            else if (tutorialDialog) tutorialDialog.classList.remove('visible');
        });
    }

    // End Phase, Help and other game buttons are bound once by UI.setupEventListeners

    // Victory/defeat dialog - use 'new-game' which exists in HTML
    const newGameBtn = document.getElementById('new-game');
    if (newGameBtn) {
        newGameBtn.addEventListener('click', () => {
            startNewGame(window.game.player ? window.game.player.name : 'Player');
        });
    }

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
        // Let Space activate a focused button normally instead of also ending the phase
        const active = document.activeElement;
        const typing = active && (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(active.tagName) || active.getAttribute('role') === 'button');
        const dialogOpen = document.querySelector('.dialog.visible, dialog[open]') || document.body.classList.contains('prompting');
        if (e.code === 'Space' && !typing && !dialogOpen) {
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
 */
function startNewGame(playerName) {
    const logContent = document.getElementById('log-content');
    if (logContent) logContent.innerHTML = '';
    const gameOverPop = document.getElementById('game-over-pop');
    if (gameOverPop) gameOverPop.hidden = true;

    // Reuse the same Game; startNewGame resets all match state and starts turn 1
    Sfx.play('shuffle');
    window.game.startNewGame(playerName);

    const helpBtn = document.getElementById('help-button');
    if (helpBtn) helpBtn.disabled = false;

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
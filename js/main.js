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
    
    // Set up UI event listeners (only once, after window.game is assigned)
    UI.setupGlobalEventListeners();
    
    // Show welcome screen
    document.getElementById('welcome-dialog').showModal();
    
    // Set default game settings
    // Note: difficulty selection was removed from the UI; guard in case elements are absent
    const diffMedium = document.getElementById('difficulty-medium');
    if (diffMedium) diffMedium.checked = true;
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

            // Check if recording is enabled
            const recordingCheckbox = document.getElementById('enable-recording');
            const recordingEnabled = recordingCheckbox ? recordingCheckbox.checked : false;

            let difficulty = 'medium';
            const easy = document.getElementById('difficulty-easy');
            const medium = document.getElementById('difficulty-medium');
            const hard = document.getElementById('difficulty-hard');
            if (easy && easy.checked) difficulty = 'easy';
            else if (hard && hard.checked) difficulty = 'hard';

            const welcomeDialog = document.getElementById('welcome-dialog');
            if (welcomeDialog && typeof welcomeDialog.close === 'function') welcomeDialog.close();
            startNewGame(playerName, difficulty, recordingEnabled);
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

    // View recordings button
    const viewRecordingsBtn = document.getElementById('view-recordings');
    if (viewRecordingsBtn) {
        viewRecordingsBtn.addEventListener('click', async () => {
            const recordingsDialog = document.getElementById('recordings-dialog');
            if (!recordingsDialog) return console.warn('Recordings dialog not found');
            
            // Load and display saved recordings
            await displaySavedRecordings();
            
            if (typeof recordingsDialog.showModal === 'function') {
                try { recordingsDialog.showModal(); } catch (err) { recordingsDialog.classList.add('visible'); }
            } else {
                recordingsDialog.classList.add('visible');
            }
        });
    }

    // Close recordings dialog button
    const closeRecordingsBtn = document.getElementById('close-recordings-btn');
    if (closeRecordingsBtn) {
        closeRecordingsBtn.addEventListener('click', () => {
            const recordingsDialog = document.getElementById('recordings-dialog');
            if (recordingsDialog && typeof recordingsDialog.close === 'function') recordingsDialog.close();
        });
    }

    // Tutorial navigation is handled by onclick attributes in HTML
    // (prev-tutorial, next-tutorial, and back-to-welcome buttons have onclick handlers)
    // Removed delegated event listeners to prevent duplicate calls

    // Game action buttons (guarded)
    // Note: end-phase-btn listener is in ui.js to avoid duplicate calls
    
    const directAttackBtn = document.getElementById('direct-attack-btn');
    if (directAttackBtn) directAttackBtn.addEventListener('click', () => window.game.startDirectAttack && window.game.startDirectAttack());

    // Victory/defeat dialog - use 'new-game' which exists in HTML
    const newGameBtn = document.getElementById('new-game');
    if (newGameBtn) {
        newGameBtn.addEventListener('click', () => {
            const gameOverDialog = document.getElementById('game-over-dialog');
            if (gameOverDialog && typeof gameOverDialog.close === 'function') gameOverDialog.close();
            startNewGame(window.game.player ? window.game.player.name : 'Player', window.game.botPlayer ? window.game.botPlayer.difficulty : 'medium', false);
        });
    }

    // Recording download buttons
    const downloadRecordingBtn = document.getElementById('download-recording');
    if (downloadRecordingBtn) {
        downloadRecordingBtn.addEventListener('click', () => {
            if (window.game && window.game.recorder) {
                window.game.recorder.downloadRecording();
            }
        });
    }

    const downloadAIAnalysisBtn = document.getElementById('download-ai-analysis');
    if (downloadAIAnalysisBtn) {
        downloadAIAnalysisBtn.addEventListener('click', () => {
            const notesTextarea = document.getElementById('analysis-notes');
            const playerNotes = notesTextarea ? notesTextarea.value : '';
            if (window.game && window.game.recorder) {
                window.game.recorder.downloadAIAnalysisPackage(playerNotes);
            }
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
        // Allow spaces and other keys in INPUT and TEXTAREA elements
        const isTextInput = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
        
        if (e.code === 'Space' && document.activeElement && !isTextInput) {
            e.preventDefault();
            window.game.endCurrentPhase();
        }
        if (e.code === 'KeyH' && document.activeElement && !isTextInput) {
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
 * @param {boolean} recordingEnabled - Whether to record the game
 */
function startNewGame(playerName, difficulty, recordingEnabled = false) {
    // Do NOT re-render or clone the DOM structure here.
    // Replacing innerHTML would destroy existing event listeners.

    // Initialize new game
    window.game = new Game();
    
    // Set player name and bot difficulty directly
    window.game.player.name = playerName;
    window.game.botPlayer.difficulty = difficulty;
    
    // Initialize recording
    window.game.startNewGame(playerName, difficulty, recordingEnabled);
    
    // Start the first turn to automatically draw cards
    window.game.startTurn();
    
    // Update UI
    window.game.ui.updateGameState();
    window.game.ui.updateTurnAndPhase();
    
    // Enable help button (id in HTML is 'help-button')
    const helpBtn = document.getElementById('help-button') || document.getElementById('help-btn');
    if (helpBtn) helpBtn.disabled = false;
    
    console.log(`Starting new game: Player '${playerName}' vs Bot (${difficulty})${recordingEnabled ? ' [RECORDING]' : ''}`);
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

/**
 * Display saved game recordings from database
 */
async function displaySavedRecordings() {
    if (!window.game || !window.game.recorder) {
        console.warn('Game recorder not available');
        return;
    }

    try {
        const recordings = await window.game.recorder.getAllRecordings();
        const listContainer = document.getElementById('recordings-list-container');
        const emptyMessage = document.getElementById('recordings-empty-message');
        const recordingsList = document.getElementById('recordings-list');

        if (!listContainer) return;

        if (recordings.length === 0) {
            emptyMessage.style.display = 'block';
            recordingsList.style.display = 'none';
            return;
        }

        emptyMessage.style.display = 'none';
        recordingsList.style.display = 'block';
        recordingsList.innerHTML = '';

        // Sort by timestamp descending (newest first)
        recordings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        recordings.forEach(recording => {
            const recordingItem = document.createElement('div');
            recordingItem.style.cssText = `
                padding: 10px;
                margin-bottom: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                background-color: #f9f9f9;
            `;

            const timestamp = new Date(recording.timestamp).toLocaleString();
            const winner = recording.winner === 'player' ? 'Player Won' : 'Bot Won';
            const turns = recording.turnCount || 0;

            recordingItem.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <strong>${recording.playerName}</strong> vs Bot (${recording.botDifficulty})<br>
                        <small style="color: #666;">
                            ${winner} • ${turns} turns • ${timestamp}
                        </small>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button class="dialog-button" style="padding: 5px 10px; font-size: 0.85em;" onclick="downloadRecordingById('${recording.gameId}')">Download</button>
                        <button class="dialog-button" style="padding: 5px 10px; font-size: 0.85em;" onclick="deleteRecordingById('${recording.gameId}')">Delete</button>
                    </div>
                </div>
            `;

            recordingsList.appendChild(recordingItem);
        });
    } catch (error) {
        console.error('Failed to display recordings:', error);
        const emptyMessage = document.getElementById('recordings-empty-message');
        if (emptyMessage) emptyMessage.textContent = 'Error loading recordings';
    }
}

/**
 * Download a specific recording by ID
 */
async function downloadRecordingById(gameId) {
    if (!window.game || !window.game.recorder) {
        console.warn('Game recorder not available');
        return;
    }

    try {
        const recording = await window.game.recorder.getRecordingById(gameId);
        if (!recording || !recording.fullRecording) {
            console.error('Recording not found');
            return;
        }

        const json = JSON.stringify(recording.fullRecording, null, 2);
        const timestamp = new Date(recording.timestamp).toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `game_${timestamp}_${gameId.slice(-8)}.json`;
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        console.log(`Recording downloaded: ${filename}`);
    } catch (error) {
        console.error('Failed to download recording:', error);
    }
}

/**
 * Delete a specific recording by ID
 */
async function deleteRecordingById(gameId) {
    if (!window.game || !window.game.recorder) {
        console.warn('Game recorder not available');
        return;
    }

    if (!confirm('Are you sure you want to delete this recording?')) return;

    try {
        await window.game.recorder.deleteRecording(gameId);
        // Refresh the recordings list
        await displaySavedRecordings();
        console.log('Recording deleted');
    } catch (error) {
        console.error('Failed to delete recording:', error);
    }
}
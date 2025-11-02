/**
 * GameRecorder.js
 * Records game state and moves for AI analysis
 * Can export to JSON format for dropping into chat with AI agents
 */

class GameRecorder {
    constructor(enabled = false) {
        this.enabled = enabled;
        this.recording = {
            metadata: {
                gameId: this.generateGameId(),
                timestamp: new Date().toISOString(),
                playerName: 'Unknown',
                playerType: 'human',
                botDifficulty: 'medium',
                recordingVersion: '1.0'
            },
            initialState: null,
            finalState: null,
            turns: [],
            gameOutcome: null,
            winner: null,
            reason: null
        };
        this.currentTurnIndex = 0;
        this.currentPhaseData = {};
        this.dbReady = false;
        this.initializeDB();
        // Optional local upload URL (set via enableLocalUpload)
        this.localUploadUrl = null; // e.g. 'http://localhost:8765/save-recording'
    }

    /**
     * Initialize IndexedDB for game recording storage
     */
    initializeDB() {
        return new Promise((resolve) => {
            if (!('indexedDB' in window)) {
                console.warn('IndexedDB not available - recordings will not be persisted');
                this.dbReady = false;
                resolve();
                return;
            }

            const request = indexedDB.open('MonsterGameRecordings', 1);

            request.onerror = () => {
                console.error('IndexedDB failed to open:', request.error);
                this.dbReady = false;
                resolve();
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.dbReady = true;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('recordings')) {
                    const store = db.createObjectStore('recordings', { keyPath: 'gameId' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('winner', 'winner', { unique: false });
                }
            };
        });
    }

    /**
     * Generate unique game ID
     */
    generateGameId() {
        return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Initialize recording with game metadata
     */
    initializeRecording(playerName, difficulty) {
        if (!this.enabled) return;
        
        this.recording.metadata.playerName = playerName;
        this.recording.metadata.botDifficulty = difficulty;
    }

    /**
     * Record initial game state
     */
    recordInitialState(game) {
        if (!this.enabled) return;
        
        this.recording.initialState = this.captureGameState(game, 'initial');
    }

    /**
     * Record turn start
     */
    recordTurnStart(game, turnNumber) {
        if (!this.enabled) return;
        
        const turnRecord = {
            turnNumber: turnNumber,
            currentPlayer: game.currentPlayer.type,
            playerName: game.currentPlayer.name,
            startState: this.captureGameState(game, 'turn_start'),
            phases: {},
            actions: []
        };
        
        this.currentTurnIndex = this.recording.turns.length;
        this.recording.turns.push(turnRecord);
    }

    /**
     * Record phase start
     */
    recordPhaseStart(game, phase) {
        if (!this.enabled) return;
        
        const currentTurn = this.recording.turns[this.currentTurnIndex];
        if (!currentTurn) return;
        
        if (!currentTurn.phases[phase]) {
            currentTurn.phases[phase] = {
                startState: this.captureGameState(game, `phase_start_${phase}`),
                endState: null,
                events: []
            };
        }
    }

    /**
     * Record phase end
     */
    recordPhaseEnd(game, phase) {
        if (!this.enabled) return;
        
        const currentTurn = this.recording.turns[this.currentTurnIndex];
        if (!currentTurn || !currentTurn.phases[phase]) return;
        
        currentTurn.phases[phase].endState = this.captureGameState(game, `phase_end_${phase}`);
    }

    /**
     * Record a player action (summon, trap, attack, etc)
     */
    recordAction(game, actionType, details = {}) {
        if (!this.enabled) return;
        
        const currentTurn = this.recording.turns[this.currentTurnIndex];
        if (!currentTurn) return;
        
        const action = {
            timestamp: Date.now(),
            actionType: actionType,
            actor: game.currentPlayer.type,
            details: details,
            boardStateBefore: this.captureGameState(game, `action_before_${actionType}`),
            boardStateAfter: null
        };
        
        currentTurn.actions.push(action);
    }

    /**
     * Update last action with board state after
     */
    recordActionComplete(game) {
        if (!this.enabled) return;
        
        const currentTurn = this.recording.turns[this.currentTurnIndex];
        if (!currentTurn || currentTurn.actions.length === 0) return;
        
        const lastAction = currentTurn.actions[currentTurn.actions.length - 1];
        lastAction.boardStateAfter = this.captureGameState(game, 'action_after');
    }

    /**
     * Record trap activation
     */
    recordTrapActivation(game, trapCard, trapType, result) {
        if (!this.enabled) return;
        
        this.recordAction(game, 'trap_activation', {
            trapCard: this.serializeCard(trapCard),
            trapType: trapType,
            result: result,
            success: result && result.success
        });
    }

    /**
     * Record card summon
     */
    recordSummon(game, card, spaceIndex, sacrifices = []) {
        if (!this.enabled) return;
        
        this.recordAction(game, 'summon', {
            card: this.serializeCard(card),
            cardType: getCardType(card.value),
            spaceIndex: spaceIndex,
            sacrifices: sacrifices.map(c => this.serializeCard(c)),
            sacrificedValue: sacrifices.reduce((sum, c) => sum + getCardNumericValue(c.value), 0)
        });
    }

    /**
     * Record fusion creation
     */
    recordFusion(game, monster1, monster2, fusionCard, targetSpace) {
        if (!this.enabled) return;
        
        this.recordAction(game, 'fusion_creation', {
            component1: this.serializeCard(monster1),
            component2: this.serializeCard(monster2),
            fusionCard: {
                value1: monster1.value,
                value2: monster2.value,
                fusionStrength: monster1.isFusion ? monster1.fusionStrength : getCardNumericValue(monster1.value) + 
                               (monster2.isFusion ? monster2.fusionStrength : getCardNumericValue(monster2.value)),
                isFromField: true
            },
            targetSpace: targetSpace
        });
    }

    /**
     * Record attack
     */
    recordAttack(game, attacker, target, result) {
        if (!this.enabled) return;
        
        const attackerStrength = attacker.isFusion ? attacker.fusionStrength : getCardNumericValue(attacker.value);
        const targetStrength = target ? (target.isFusion ? target.fusionStrength : getCardNumericValue(target.value)) : 0;
        
        this.recordAction(game, 'attack', {
            attacker: this.serializeCard(attacker),
            attackerStrength: attackerStrength,
            target: target ? this.serializeCard(target) : null,
            targetStrength: targetStrength,
            isDirectAttack: !target,
            result: result,
            damageDealt: result ? result.damageDealt : 0,
            targetDestroyed: result ? result.targetDestroyed : false
        });
    }

    /**
     * Record trap card placement
     */
    recordTrapPlacement(game, trapCard, spaceIndex) {
        if (!this.enabled) return;
        
        this.recordAction(game, 'trap_placement', {
            trapCard: this.serializeCard(trapCard),
            trapType: trapCard.value,
            spaceIndex: spaceIndex
        });
    }

    /**
     * Record game end and automatically save
     */
    recordGameEnd(game, winner, reason) {
        if (!this.enabled) return;
        
        this.recording.finalState = this.captureGameState(game, 'game_end');
        this.recording.gameOutcome = 'completed';
        this.recording.winner = winner.type;
        this.recording.reason = reason;

        // Automatically save to database
        if (this.dbReady) {
            this.saveToDatabase().catch(err => {
                console.error('Failed to auto-save recording:', err);
            });
        }

        // Also automatically download the file
        this.autoDownloadRecording();
    }

    /**
     * Automatically download recording when game ends
     */
    autoDownloadRecording() {
        if (!this.enabled) return;
        
        try {
            const json = this.exportToJSON();
            if (!json) return;
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const filename = `game_${timestamp}_${this.recording.metadata.gameId.slice(-8)}.json`;
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            console.log(`Game recording auto-downloaded: ${filename}`);
            // Also attempt to POST to local server if configured (non-blocking)
            try {
                const json = this.exportToJSON();
                if (json && this.localUploadUrl) {
                    this.tryUploadToLocalServer(json, this.localUploadUrl).catch(err => {
                        console.warn('Local upload failed:', err);
                    });
                }
            } catch (e) { /* ignore */ }

            return filename;
        } catch (error) {
            console.error('Failed to auto-download recording:', error);
            return null;
        }
    }

    /**
     * Enable uploading recordings to a local HTTP server endpoint.
     * Call with the full URL, e.g. 'http://localhost:8765/save-recording'
     */
    enableLocalUpload(url) {
        this.localUploadUrl = url;
    }

    /**
     * Disable local upload
     */
    disableLocalUpload() {
        this.localUploadUrl = null;
    }

    /**
     * Try to POST the recording JSON to a local server endpoint.
     * Non-fatal: errors are caught by callers.
     */
    async tryUploadToLocalServer(jsonString, url) {
        if (!jsonString || !url) return null;
        if (typeof fetch !== 'function') {
            // fetch not available in this environment
            return null;
        }

        // Fire-and-forget POST with JSON body
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const signal = controller ? controller.signal : undefined;
        // Timeout after 2500ms
        let timeoutId = null;
        if (controller) timeoutId = setTimeout(() => controller.abort(), 2500);

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: jsonString,
                signal
            });
            if (timeoutId) clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            try { console.log('Recording uploaded to local server:', url); } catch (e) {}
            return true;
        } catch (err) {
            if (timeoutId) clearTimeout(timeoutId);
            throw err;
        }
    }

    /**
     * Capture complete game state at a point in time
     */
    captureGameState(game, stateType = 'checkpoint') {
        if (!game) return null;
        
        return {
            timestamp: Date.now(),
            stateType: stateType,
            currentPhase: game.currentPhase,
            currentPlayer: game.currentPlayer.type,
            turnNumber: game.turnCounter,
            
            player: {
                name: game.player.name,
                type: game.player.type,
                health: game.player.health,
                hand: {
                    count: game.player.hand.length,
                    cards: game.player.hand.map(c => this.serializeCard(c))
                },
                field: {
                    monsters: game.player.monsterSpaces.map((space, idx) => ({
                        index: idx,
                        card: space.card ? this.serializeCard(space.card) : null,
                        canAttack: space.card ? !space.card.attacked : false
                    })),
                    traps: game.player.trapSpaces.map((space, idx) => ({
                        index: idx,
                        card: space.card ? this.serializeCard(space.card) : null
                    }))
                }
            },
            
            bot: {
                name: game.bot.name,
                type: game.bot.type,
                health: game.bot.health,
                hand: {
                    count: game.bot.hand.length,
                    cards: [] // Don't reveal bot hand - only show count
                },
                field: {
                    monsters: game.bot.monsterSpaces.map((space, idx) => ({
                        index: idx,
                        card: space.card ? this.serializeCard(space.card) : null,
                        canAttack: space.card ? !space.card.attacked : false
                    })),
                    traps: game.bot.trapSpaces.map((space, idx) => ({
                        index: idx,
                        card: space.card ? this.serializeCard(space.card) : null
                    }))
                }
            },
            
            deck: {
                remaining: game.deck.cards.length
            },
            
            discard: {
                count: game.deck.discardPile.length
            }
        };
    }

    /**
     * Serialize a card for recording
     */
    serializeCard(card) {
        if (!card) return null;
        
        return {
            id: card.id,
            value: card.value,
            suit: card.suit,
            type: getCardType(card.value),
            numericValue: getCardNumericValue(card.value),
            isFusion: card.isFusion || false,
            fusionStrength: card.isFusion ? card.fusionStrength : null,
            isJoker: card.value === CARD_VALUES.JOKER,
            state: card.state || CARD_STATES.IN_HAND
        };
    }

    /**
     * Export recording to JSON string
     */
    exportToJSON() {
        if (!this.enabled) return null;
        
        return JSON.stringify(this.recording, null, 2);
    }

    /**
     * Save recording to IndexedDB
     */
    saveToDatabase() {
        if (!this.dbReady || !this.db) {
            console.warn('Database not available - recording not saved');
            return Promise.reject('Database not ready');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['recordings'], 'readwrite');
            const store = transaction.objectStore('recordings');
            
            const recordingData = {
                gameId: this.recording.metadata.gameId,
                timestamp: this.recording.metadata.timestamp,
                playerName: this.recording.metadata.playerName,
                botDifficulty: this.recording.metadata.botDifficulty,
                winner: this.recording.winner,
                reason: this.recording.reason,
                turnCount: this.recording.turns.length,
                fullRecording: this.recording
            };

            const request = store.put(recordingData);

            request.onerror = () => {
                console.error('Failed to save recording to database:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                console.log(`Recording saved to database: ${this.recording.metadata.gameId}`);
                resolve(this.recording.metadata.gameId);
            };
        });
    }

    /**
     * Get all saved recordings from database
     */
    getAllRecordings() {
        if (!this.dbReady || !this.db) {
            return Promise.reject('Database not ready');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['recordings'], 'readonly');
            const store = transaction.objectStore('recordings');
            const request = store.getAll();

            request.onerror = () => {
                console.error('Failed to retrieve recordings:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                resolve(request.result || []);
            };
        });
    }

    /**
     * Get a specific recording by game ID
     */
    getRecordingById(gameId) {
        if (!this.dbReady || !this.db) {
            return Promise.reject('Database not ready');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['recordings'], 'readonly');
            const store = transaction.objectStore('recordings');
            const request = store.get(gameId);

            request.onerror = () => {
                console.error('Failed to retrieve recording:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                resolve(request.result);
            };
        });
    }

    /**
     * Delete a recording from database
     */
    deleteRecording(gameId) {
        if (!this.dbReady || !this.db) {
            return Promise.reject('Database not ready');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['recordings'], 'readwrite');
            const store = transaction.objectStore('recordings');
            const request = store.delete(gameId);

            request.onerror = () => {
                console.error('Failed to delete recording:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                console.log(`Recording deleted: ${gameId}`);
                resolve();
            };
        });
    }

    /**
     * Download recording as JSON file
     */
    downloadRecording(filename = null) {
        if (!this.enabled) return;
        
        const json = this.exportToJSON();
        if (!json) return;
        
        const filename_actual = filename || `game_${this.recording.metadata.gameId}.json`;
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename_actual;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log(`Game recording downloaded: ${filename_actual}`);
    }

    /**
     * Get recording as object
     */
    getRecording() {
        return this.recording;
    }

    /**
     * Export recording in AI-friendly format with analysis prompts
     */
    exportForAIAnalysis(playerAnalysisNotes = '') {
        const aiPackage = {
            type: 'game_recording_for_ai_analysis',
            version: '1.0',
            purpose: 'Game replay analysis to improve bot AI behavior based on player strategy',
            
            gameRecording: this.recording,
            
            analysisPrompt: `Please analyze this game recording and provide insights on the player's strategy and decision-making patterns.

INSTRUCTIONS FOR AI ANALYSIS:
1. Review the complete game flow in the "turns" array, which contains:
   - Each turn's board state at start and end
   - All phases (draw, setup, battle, end) with their states
   - Each action taken with board state before/after

2. Player Strategy Analysis:
   - When did the player summon big monsters vs normal monsters?
   - What was the sacrifice strategy (preserve hand cards? use field? balance)?
   - Attack patterns: which targets were prioritized?
   - Trap placement strategy: defensive vs aggressive positioning?
   - Hand management: when did they hold back cards?

3. Decision Quality Assessment:
   - Which decisions led to favorable positions?
   - Which decisions seemed suboptimal and why?
   - Was there a consistent strategy or adaptive play?

4. Bot Learning Recommendations:
   Based on the player's strategy, provide specific recommendations for improving bot behavior:
   - Setup phase sequencing changes
   - Attack selection criteria
   - Sacrifice prioritization
   - Trap placement strategy
   - Hand management tactics
   
5. Format your response as a JSON object with this structure:
{
  "playerStrategy": {
    "summary": "Brief overview of overall strategy",
    "patterns": ["pattern 1", "pattern 2", ...],
    "strengths": ["strength 1", "strength 2", ...],
    "weaknesses": ["weakness 1", "weakness 2", ...]
  },
  "botImprovements": {
    "setupPhase": "Recommended changes to setup logic",
    "battlePhase": "Recommended changes to attack logic",
    "sacrificeLogic": "Recommended changes to sacrifice selection",
    "trapStrategy": "Recommended changes to trap placement",
    "handManagement": "Recommended changes to hand management"
  },
  "codeChanges": [
    {
      "method": "method name",
      "currentBehavior": "what it does now",
      "suggestedBehavior": "what it should do",
      "rationale": "why this change would improve play"
    }
  ]
}`,
            
            playerNotes: playerAnalysisNotes,
            
            timestamp: new Date().toISOString(),
            
            howToUse: `
To use this for AI analysis:
1. Copy the entire JSON content
2. Paste it into your chat with the AI
3. Ask the AI to analyze the game recording and provide bot improvement recommendations
4. The AI will review the game flow and suggest specific code changes
5. Implement the suggested changes to make the bot play more like the player
            `.trim()
        };
        
        return JSON.stringify(aiPackage, null, 2);
    }

    /**
     * Download AI analysis package
     */
    downloadAIAnalysisPackage(playerNotes = '') {
        const json = this.exportForAIAnalysis(playerNotes);
        if (!json) return;
        
        const filename = `game_analysis_${this.recording.metadata.gameId}.json`;
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log(`AI analysis package downloaded: ${filename}`);
    }

    /**
     * Enable/disable recording
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }

    /**
     * Check if recording is enabled
     */
    isEnabled() {
        return this.enabled;
    }
}

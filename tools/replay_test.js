const fs = require('fs');
const path = require('path');

// Minimal shims for card utils used by bot
global.getCardNumericValue = function(v) {
    const map = { 'JOKER':0, 'J':11, 'Q':12, 'K':13, 'A':14 };
    if (typeof v === 'number') return v;
    if (map[v]) return map[v];
    const n = parseInt(v, 10);
    return isNaN(n) ? 0 : n;
};

// Minimal CARD_VALUES mapping so bot.js can be evaluated by the Node test harness
global.CARD_VALUES = {
    ACE: 'A',
    TWO: '2',
    THREE: '3',
    FOUR: '4',
    FIVE: '5',
    SIX: '6',
    SEVEN: '7',
    EIGHT: '8',
    NINE: '9',
    TEN: '10',
    JACK: 'J',
    QUEEN: 'Q',
    KING: 'K',
    JOKER: 'JOKER'
};

// -------------------------
// Unit test: first-turn attack restriction
// Verifies the rule that the player who started the game (firstPlayer) cannot attack on overall turn 1
// This runs before loading game/bot code so it doesn't depend on browser globals.
(function testFirstTurnAttackRestriction() {
    console.log('\nRunning unit test: first-turn attack restriction');
    const player = { name: 'Player' };
    const other = { name: 'Other' };

    // Reuse logic from Game.isAttackAllowedThisTurn (defensive copy for unit test)
    function isAttackAllowedThisTurn(gameObj, playerObj) {
        try {
            const fpName = gameObj.firstPlayer && gameObj.firstPlayer.name ? gameObj.firstPlayer.name : 'unknown';
            const pName = playerObj && playerObj.name ? playerObj.name : 'unknown';
            console.debug(`[unit-test] isAttackAllowedThisTurn turn=${gameObj.turnCounter}, firstPlayer=${fpName}, player=${pName}`);
        } catch (e) { /* ignore logging failures */ }

        if (!gameObj.firstPlayer) gameObj.firstPlayer = gameObj.player;

        if (gameObj.turnCounter === 1 && (playerObj === gameObj.firstPlayer || (playerObj && gameObj.firstPlayer && playerObj.name === gameObj.firstPlayer.name))) {
            return false;
        }
        return true;
    }

    // Case A: player is the starter and it's turn 1 -> should NOT be allowed
    const g1 = { turnCounter: 1, firstPlayer: player, player };
    const allowed1 = isAttackAllowedThisTurn(g1, player);
    if (allowed1) {
        console.error('Unit test FAILED: starter was allowed to attack on turn 1');
        process.exitCode = 1;
        return;
    }

    // Case B: other player on turn 1 should be allowed
    const allowed2 = isAttackAllowedThisTurn(g1, other);
    if (!allowed2) {
        console.error('Unit test FAILED: non-starter was blocked incorrectly on turn 1');
        process.exitCode = 1;
        return;
    }

    // Case C: turn >1 should allow starter as well
    const g2 = { turnCounter: 2, firstPlayer: player, player };
    const allowed3 = isAttackAllowedThisTurn(g2, player);
    if (!allowed3) {
        console.error('Unit test FAILED: starter was blocked on turn >1');
        process.exitCode = 1;
        return;
    }

    console.log('Unit test PASSED: first-turn attack restriction behaves as expected');
})();

// Use a synthetic final state similar to the recording (player: 10,4,6; bot traps: K,J,J)
const rec = {
    finalState: {
        player: {
            field: {
                monsters: [
                    { index:0, card: { id:'m10', value: '10' } },
                    { index:1, card: { id:'m4', value: '4' } },
                    { index:2, card: { id:'m6', value: '6' } }
                ],
                traps: [ { index:0, card: { id:'pK', value:'K' } }, { index:1, card: null }, { index:2, card: null } ]
            },
            hand: { cards: [ { id:'jok', value:'JOKER' } ] }
        },
        bot: {
            field: {
                monsters: [ { index:0, card: null }, { index:1, card: null }, { index:2, card: null } ],
                traps: [ { index:0, card: { id:'bK', value:'K' } }, { index:1, card: { id:'bJ1', value:'J' } }, { index:2, card: { id:'bJ2', value:'J' } } ]
            },
            hand: { cards: [] }
        },
        turnNumber: 9
    }
};

// Minimal mock Game/UI/Board/Player for calling bot.handleDefensiveTraps
class MockUI {
    addBotThinkingMessage(msg) { console.log('[BOT] ' + msg); }
    addLogMessage(msg) { console.log('[LOG] ' + msg); }
}

class MockDeck { discard(c) { /* noop */ } }

class MockBoard {
    constructor(record) { this.record = record; }
    getValidRedirectTargets(attackerIndex, player, originalTargetIndex, bot) {
        // Simplified: return player's monsters as potential redirect targets
        const targets = [];
        const playerMonsters = player.monsterSpaces || [];
        for (let i = 0; i < playerMonsters.length; i++) {
            if (playerMonsters[i] && playerMonsters[i].card) targets.push({ player: player, index: i });
        }
        // Also return bot monsters
        const botMonsters = bot.monsterSpaces || [];
        for (let i = 0; i < botMonsters.length; i++) {
            if (botMonsters[i] && botMonsters[i].card) targets.push({ player: bot, index: i });
        }
        return targets;
    }
}

// Minimal Bot wrapper: load bot.js code from project
const vm = require('vm');
const botCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'bot.js'), 'utf8');
// Ensure the bot code exports the Bot class when evaluated
const wrappedBotCode = botCode + "\n; if (typeof Bot !== 'undefined') { module.exports = Bot; }";
const script = new vm.Script(wrappedBotCode, { filename: 'bot.js' });
const sandbox = { module: {}, console, require, global, setTimeout, clearTimeout,
    CARD_VALUES: global.CARD_VALUES,
    getCardNumericValue: global.getCardNumericValue
};
// Provide a simple delay helper used by bot.js
sandbox.delay = function(ms) { return new Promise(resolve => setTimeout(resolve, ms)); };
vm.createContext(sandbox);
script.runInContext(sandbox);
const BotClass = sandbox.module.exports;

// Build minimal game/player objects from final state snapshot
const final = rec.finalState;
const game = {
    ui: new MockUI(),
    deck: new MockDeck(),
    board: null,
    player: JSON.parse(JSON.stringify(final.player.field)),
    bot: JSON.parse(JSON.stringify(final.bot.field)),
    botPlayer: null,
    playerObj: null
};

// Rework to expected shapes
game.player.monsterSpaces = final.player.field.monsters.map(m => ({ card: m.card }));
game.player.trapSpaces = final.player.field.traps.map(t => ({ card: t.card }));
game.bot.monsterSpaces = final.bot.field.monsters.map(m => ({ card: m.card }));
game.bot.trapSpaces = final.bot.field.traps.map(t => ({ card: t.card }));

game.board = new MockBoard(rec);

// Mock player and bot wrappers expected by Bot class
const playerWrapper = { name: 'Player', monsterSpaces: game.player.monsterSpaces, trapSpaces: game.player.trapSpaces, hand: final.player.hand.cards || [] };
const botWrapper = { name: 'Bot', monsterSpaces: game.bot.monsterSpaces, trapSpaces: game.bot.trapSpaces, hand: final.bot.hand.cards || [] };

game.player = playerWrapper;
game.bot = botWrapper;

// Attach minimal methods used by bot
playerWrapper.trapSpaces = game.player.trapSpaces;
botWrapper.trapSpaces = game.bot.trapSpaces;
botWrapper.getActivatableTraps = function(opts) { return botWrapper.trapSpaces.map(s => s.card).filter(Boolean); };
playerWrapper.getActivatableTraps = function(opts) { return playerWrapper.trapSpaces.map(s => s.card).filter(Boolean); };

// Instantiate bot
const bot = new BotClass({ ui: game.ui, board: game.board, deck: game.deck, bot: botWrapper, player: playerWrapper, gameOver: false, turnCounter: final.turnNumber }, 'medium');
bot.game = game; // assign
game.botPlayer = bot;
game.bot = botWrapper;

// Helper to call handleDefensiveTraps for each player's attacking monster on last turn
async function run() {
    console.log('Starting replay test - invoking trap eval for each attacking monster in final state');
    for (let i = 0; i < final.player.field.monsters.length; i++) {
        const m = final.player.field.monsters[i];
        if (!m.card) continue;
        // Find a bot target index: choose first non-null bot monster index or null for direct
        let targetIndex = null;
        for (let j = 0; j < game.bot.monsterSpaces.length; j++) {
            if (game.bot.monsterSpaces[j] && game.bot.monsterSpaces[j].card) { targetIndex = j; break; }
        }

        console.log(`Simulating attack: player monster ${m.card.value} (index ${i}) -> bot target ${targetIndex}`);
        // call handleDefensiveTraps with attacker index i and targetIndex
        if (typeof bot.handleDefensiveTraps === 'function') {
            await bot.handleDefensiveTraps(i, targetIndex, () => { console.log('resumeFunction called'); });
        }
    }
}

run().then(() => console.log('Replay test finished')).catch(err => console.error(err));


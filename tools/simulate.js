#!/usr/bin/env node
/**
 * Play the bot against a human stand-in, headless, using the real game code.
 *
 *   node tools/simulate.js [games=200] [--seed=1] [--mistakes=0.05] [--noise=4] [--opponent=casual|expert] [--quiet] [--trace]
 *
 * Opponents:
 *   casual - tools/sim/human-proxy.js: sound rules of thumb, plays to win (default)
 *   expert - the bot's own engine with no mistakes, playing the human's side
 *            (--expert-engine=baseline uses the frozen copy in tools/sim/bot-baseline.js)
 *
 * The human stand-in (tools/sim/human-proxy.js) plays to win with sound rules of thumb.
 * The human always takes the first turn, as in the real game. --trace prints the battle log of each game.
 * Bot settings default to BOT_SETTINGS in js/constants.js; --mistakes and --noise override them.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = process.argv.slice(2);
const games = Number(args.find(a => /^\d+$/.test(a)) || 200);
const option = (name, fallback) => {
    const hit = args.find(a => a.startsWith(`--${name}=`));
    return hit ? Number(hit.split('=')[1]) : fallback;
};
const quiet = args.includes('--quiet');
const opponent = (args.find(a => a.startsWith('--opponent=')) || '--opponent=casual').split('=')[1];
let seed = option('seed', 1);
const mistakes = option('mistakes', NaN);
const noise = option('noise', NaN);

// Seeded random numbers so runs are repeatable
function random() {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const root = path.join(__dirname, '..');
const sandbox = {
    console,
    Math: Object.create(Math),
    setTimeout: (fn) => setImmediate(fn),
    clearTimeout: () => {},
    Promise,
    Set, Map, Array, Object, JSON, Number, String, Boolean, Symbol, Error, Infinity, NaN, parseInt, parseFloat, isNaN
};
sandbox.Math.random = random;
sandbox.window = sandbox;
// Settings for the expert opponent's own mistakes (none by default)
sandbox.expertMistakes = option('expert-mistakes', 0);
sandbox.expertNoise = option('expert-noise', 0);
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
vm.createContext(sandbox);

// The UI is replaced by a stub: every call is a no-op except the ones that ask the human to choose
vm.runInContext(`
class UI {
    constructor(game) {
        this.game = game;
        return new Proxy(this, { get: (target, prop) => (prop in target ? target[prop] : () => undefined) });
    }
    addLogMessage(message) { if (window.traceLog) window.traceLog.push('T' + this.game.turnCounter + ' ' + message); }
    promptTrapResponse(context) { return Promise.resolve(window.human.chooseTrap(context)); }
    promptCancelTrap(trap, queens, chain) { return Promise.resolve(window.human.chooseQueen(trap, queens, chain)); }
    showFusionUpkeepDialog(count) {
        // A stand-in returns the cards to pay with, or { cards, keep } to also say which fusions to keep
        const choice = window.human.payUpkeep(count);
        if (Array.isArray(choice)) this.game.handleFusionUpkeep(choice, false);
        else this.game.handleFusionUpkeep(choice.cards, false, choice.keep);
    }
    showDiscardDialog(excess) { this.game.discardExcessCards(window.human.chooseDiscards(excess)); }
}
`, sandbox);

for (const file of ['constants', 'utils', 'card', 'deck', 'player', 'board', 'bot', 'game']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', `${file}.js`), 'utf8'), sandbox, { filename: `${file}.js` });
}
vm.runInContext(fs.readFileSync(path.join(__dirname, 'sim', 'human-proxy.js'), 'utf8'), sandbox, { filename: 'human-proxy.js' });

// --expert-engine=baseline plays the expert with a frozen earlier copy of the bot (tools/sim/bot-baseline.js),
// to check that a change to js/bot.js is actually an improvement
const baselineFile = path.join(__dirname, 'sim', 'bot-baseline.js');
if (fs.existsSync(baselineFile)) {
    const source = fs.readFileSync(baselineFile, 'utf8').replace(/\bclass Bot\b/, 'class BaselineBot').replace(/\bBOT_WEIGHTS\b/g, 'BASELINE_WEIGHTS');
    vm.runInContext(source, sandbox, { filename: 'bot-baseline.js' });
}
sandbox.expertEngine = (args.find(a => a.startsWith('--expert-engine=')) || '--expert-engine=current').split('=')[1];

// The expert: a Bot driving the human's side through a mirrored view of the game,
// where "bot" and "player" are swapped and every isBot flag is flipped
vm.runInContext(`
class ExpertHuman {
    constructor(game) {
        this.game = game;
        const flips = ['playMonsterCard', 'playTrapCard', 'playBigMonster', 'createFusion', 'playJoker', 'processAttack', 'handleFusionUpkeep'];
        const view = new Proxy(game, {
            get(target, prop) {
                if (prop === 'bot') return target.player;
                if (prop === 'player') return target.bot;
                if (prop === 'botPlayer') return undefined;
                const value = target[prop];
                if (typeof value !== 'function') return value;
                if (!flips.includes(prop)) return value.bind(target);
                return (...args) => {
                    const at = { playMonsterCard: 2, playTrapCard: 2, playBigMonster: 3, createFusion: 3, playJoker: 1, processAttack: 2, handleFusionUpkeep: 1 }[prop];
                    args[at] = !args[at];
                    return value.apply(target, args);
                };
            }
        });
        this.engine = window.expertEngine === 'baseline' ? new BaselineBot(view) : new Bot(view);
        this.engine.setMistakeRate(window.expertMistakes || 0, window.expertNoise || 0);
    }
    // Plays through the same path as a person: Setup, the End phase button, the upkeep prompt
    async playTurn() {
        const engine = this.engine;
        const game = this.game;
        engine.countUnseenCards();
        await engine.runSetup();
        if (game.gameOver) return;
        game.endCurrentPhase();
        if (game.currentPhase === 'Battle' && game.currentPlayer === game.player) {
            await engine.runBattle();
            if (!game.gameOver && game.currentPhase === 'Battle' && game.currentPlayer === game.player) game.endCurrentPhase();
        }
    }
    chooseTrap(context) { return this.engine.chooseDefensiveTrap(context, context.traps); }
    chooseQueen(trap, queens, chain) { return this.engine.chooseQueenCancel(trap, queens, chain); }
    // The frozen baseline engine only picks the cards (the game then keeps the strongest fusions)
    payUpkeep(count) { return this.engine.chooseUpkeep ? this.engine.chooseUpkeep() : this.engine.chooseUpkeepCards(); }
    chooseDiscards(excess) { return this.engine.selectCardsToDiscard(excess); }
}
`, sandbox);

const tick = () => new Promise(resolve => setImmediate(resolve));
const stats = { botAttacks: 0, badAttacks: 0 };
const calc = (card) => sandbox.calculateMonsterStrength ? sandbox.calculateMonsterStrength(card) : vm.runInContext('calculateMonsterStrength', sandbox)(card);

async function playGame() {
    const game = vm.runInContext('new Game()', sandbox);
    sandbox.game = game;
    sandbox.traceLog = args.includes('--trace') ? [] : null;
    sandbox.human = vm.runInContext(opponent === 'expert' ? 'new ExpertHuman(game)' : 'new HumanProxy(game)', sandbox);
    if (!Number.isNaN(mistakes) && game.botPlayer.setMistakeRate) game.botPlayer.setMistakeRate(mistakes, Number.isNaN(noise) ? undefined : noise);
    game.startNewGame('Player');
    if (!Number.isNaN(mistakes) && game.botPlayer.setMistakeRate) game.botPlayer.setMistakeRate(mistakes, Number.isNaN(noise) ? undefined : noise);

    // Count the bot's attacks, and those aimed at a monster stronger than the attacker
    const realProcess = game.processAttack.bind(game);
    game.processAttack = async (attackerIndex, defenderIndex, isBot) => {
        if (isBot) {
            const a = game.bot.monsterSpaces[attackerIndex].card;
            const d = defenderIndex === null ? null : game.player.monsterSpaces[defenderIndex].card;
            stats.botAttacks++;
            if (a && d && calc(a) < calc(d)) stats.badAttacks++;
        }
        const result = await realProcess(attackerIndex, defenderIndex, isBot);
        const side = isBot ? 'bot' : 'human';
        stats[side + 'Tries'] = (stats[side + 'Tries'] || 0) + 1;
        if (!result || result.success === false) stats[side + 'Failed'] = (stats[side + 'Failed'] || 0) + 1;
        return result;
    };

    let busy = false;
    for (let steps = 0; steps < 200000 && !game.gameOver; steps++) {
        if (game.turnCounter > 200) break;
        if (!busy && game.currentPlayer === game.player && game.currentPhase === 'Setup' && !game.awaitingDiscard) {
            busy = true;
            await sandbox.human.playTurn();
            busy = false;
        }
        await tick();
    }
    const outcome = !game.gameOver ? 'unfinished'
        : game.bot.health > 0 && game.player.health <= 0 ? 'bot'
        : game.player.health > 0 && game.bot.health <= 0 ? 'human' : 'draw';
    if (args.includes('--trace')) console.log(sandbox.traceLog.join('\n'));
    return { outcome, turns: game.turnCounter, botHp: game.bot.health, humanHp: game.player.health, jokers: game.jokersPlayed };
}

(async () => {
    const tally = { bot: 0, human: 0, draw: 0, unfinished: 0 };
    let turns = 0;
    const started = Date.now();
    for (let i = 0; i < games; i++) {
        const r = await playGame();
        tally[r.outcome]++;
        turns += r.turns;
        if (!quiet && (i + 1) % 50 === 0) {
            const done = i + 1;
            console.log(`${done} games: bot ${(100 * tally.bot / done).toFixed(1)}%, human ${(100 * tally.human / done).toFixed(1)}%`);
        }
    }
    const finished = games - tally.unfinished;
    console.log(JSON.stringify({
        games,
        botWinRate: +(100 * tally.bot / games).toFixed(1),
        humanWinRate: +(100 * tally.human / games).toFixed(1),
        draws: tally.draw,
        unfinished: tally.unfinished,
        avgTurns: +(turns / games).toFixed(1),
        seconds: +((Date.now() - started) / 1000).toFixed(1),
        decided: finished,
        botAttacks: stats.botAttacks,
        attacksIntoStrongerMonster: stats.badAttacks,
        attempts: { bot: stats.botTries || 0, botFailed: stats.botFailed || 0, human: stats.humanTries || 0, humanFailed: stats.humanFailed || 0 }
    }));
})();

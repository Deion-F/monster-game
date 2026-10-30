/**
 * Bot opponent.
 *
 * Each turn the bot looks a few turns ahead. For every sensible way to use its Setup phase it plays
 * out its own Battle phase, the human's likely reply, and its own next attack, then keeps the plan
 * that leaves it best placed. Attacks and trap responses are weighed the same way, including the
 * option of not acting at all, and the risk from the human's face-down traps is estimated by
 * counting the trap cards it hasn't seen yet.
 *
 * It only uses what a human could know: its own hand, the board, the discard pile and the human's
 * hand size. It isn't perfect: it misjudges close calls (BOT_SETTINGS.JUDGEMENT_NOISE) and, with a
 * small probability (BOT_SETTINGS.MISTAKE_RATE), blunders into its second-best option.
 */

// How much each part of a position is worth to the bot, in health points
const BOT_WEIGHTS = {
    hp: 1.0,          // each point of health difference
    lowHp: 0.6,       // extra per point below BOT_SETTINGS.LOW_HP: finishing blows and danger weigh more
    strength: 0.8,    // per point of monster strength on the field
    presence: 1.5,    // per monster on the field (it blocks direct attacks and threatens)
    upkeep: 1.2,      // a fusion's ongoing card cost
    handCard: 1.0,    // scale for the cards in the bot's hand
    oppCard: 1.0,     // per card in the human's hand
    trapSet: 2.5,     // per trap on the field
    win: 1000
};

class Bot {
    /**
     * @param {Game} game
     */
    constructor(game) {
        this.game = game;
        this.mistakeRate = BOT_SETTINGS.MISTAKE_RATE;
        this.noise = BOT_SETTINGS.JUDGEMENT_NOISE;
        this.currentAttack = null; // the bot's attack being resolved, for Queen decisions
        this.unseen = null;        // per-turn card counts the bot hasn't seen
    }

    /**
     * Used by the simulator to try other settings
     * @param {number} rate - blunder chance, 0 to 1
     * @param {number} [noise] - judgement noise in health points
     */
    setMistakeRate(rate, noise) {
        this.mistakeRate = rate;
        if (noise !== undefined) this.noise = noise;
    }

    // ------------------------------------------------------------------
    // Turn flow (called by Game)
    // ------------------------------------------------------------------

    async takeTurn() {
        const game = this.game;
        if (game.gameOver || game.currentPlayer !== game.bot) return;
        this.countUnseenCards();
        await delay(500);

        await this.runSetup();
        if (game.gameOver) return;

        if (game.bot.skipBattleThisTurn) {
            game.bot.skipBattleThisTurn = false;
            game.ui.addLogMessage("Bot's Battle phase is skipped due to Joker");
        } else {
            game.enterBattlePhase();
            await this.runBattle();
            if (game.gameOver) return;
        }

        game.enterEndPhase();
        this.payUpkeep();
        game.ui.updateGameState();
        await delay(700);
        if (game.gameOver) return;
        game.endTurn();
    }

    /**
     * Setup phase: maybe play the Joker, then carry out the best plan for monsters and traps
     */
    async runSetup() {
        const game = this.game;
        const joker = game.bot.hand.find(c => c.value === CARD_VALUES.JOKER);
        let plan = this.chooseSetupPlan(true);

        if (joker && this.jokerValue() > plan.value + BOT_SETTINGS.JOKER_MARGIN && !this.slip()) {
            game.playJoker(joker, true);
            await delay(800);
            this.countUnseenCards();
            plan = this.chooseSetupPlan(false);
        }

        for (const action of plan.actions) {
            if (game.gameOver) return;
            await delay(350);
            await this.bannersRead();
            this.perform(action);
        }
        game.ui.updateGameState();
    }

    /**
     * Battle phase: attack one at a time, re-planning after each result
     */
    async runBattle() {
        const game = this.game;
        if (!game.isAttackAllowedThisTurn(game.bot)) return;

        for (let step = 0; step < 6; step++) {
            // Stop once the Battle phase is over (an Ace can end it, and with it the turn)
            if (game.gameOver || game.battleEnded || game.currentPlayer !== game.bot || game.currentPhase !== PHASES.BATTLE) break;
            const S = this.snapshot();
            const choices = this.rankAttacks(S);
            const choice = this.pick(choices);
            if (!choice || choice.stop) break;

            await delay(450);
            await this.bannersRead();
            const target = choice.target ? choice.target.index : null;
            this.currentAttack = { attackerIndex: choice.attacker, target };
            await game.processAttack(choice.attacker, target, true);
            this.currentAttack = null;
            await delay(300);
        }
        game.resetAttackedFlags();
    }

    /**
     * End phase: pay upkeep for the fusions worth keeping
     */
    payUpkeep() {
        if (this.game.board.countActiveFusions(this.game.bot) === 0) return;
        this.game.handleFusionUpkeep(this.chooseUpkeepCards(), true);
    }

    /**
     * The cards to pay fusion upkeep with. An unpaid fusion breaks apart and keeps its stronger card,
     * so paying is worth it only when the weaker card's strength is worth more than the card paid
     * @returns {Card[]}
     */
    chooseUpkeepCards() {
        const bot = this.game.bot;
        const fusions = bot.monsterSpaces.filter(s => s.card && s.card.isFusion).map(s => s.card)
            .sort((a, b) => calculateMonsterStrength(b) - calculateMonsterStrength(a));
        if (fusions.length === 0) return [];

        const options = [
            ...bot.hand.filter(c => isMonsterCard(c)).map(card => ({ card, cost: this.handCardValue(card) })),
            ...bot.monsterSpaces.filter(s => s.card && !s.card.isFusion).map(s => ({ card: s.card, cost: this.monsterValue(this.monsterInfo(s.card)) }))
        ].sort((a, b) => a.cost - b.cost);

        const paid = [];
        for (const fusion of fusions) {
            const info = this.monsterInfo(fusion);
            const stronger = { str: info.str - info.weak, fusion: false };
            const keepValue = this.monsterValue(info) - this.monsterValue(stronger);
            const next = options.find(o => !paid.includes(o.card));
            if (next && next.cost < keepValue) paid.push(next.card);
        }
        return paid;
    }

    /**
     * Hand limit: discard the cards worth least
     * @param {number} count
     * @returns {Card[]}
     */
    selectCardsToDiscard(count) {
        return [...this.game.bot.hand]
            .sort((a, b) => this.handCardValue(a) - this.handCardValue(b))
            .slice(0, count);
    }

    /**
     * The human is attacking: answer with the trap (and Jack target) that leaves the bot best placed, or none
     * @param {Object} context - { attacker, attackerIndex, defender, defenderIndex }
     * @param {Card[]} traps - bot traps that may respond
     * @returns {Promise<{trap: Card, target?: Object}|null>}
     */
    async chooseDefensiveTrap(context, traps) {
        await delay(400);
        if (!this.unseen) this.countUnseenCards();
        const S = this.snapshot();
        const game = this.game;
        const ai = context.attackerIndex;
        const tgt = context.defenderIndex === null ? null : { side: 'me', index: context.defenderIndex };
        const withoutTrap = (state, trap) => {
            const i = state.me.traps.findIndex(t => t && t.card === trap);
            if (i !== -1) state.me.traps[i] = null;
            state.me.used.add(trap.value);
            return state;
        };
        // The rest of the human's Battle phase, with the bot's remaining traps defending
        const finish = state => this.evaluate(this.oppBattle(state, { fresh: false }));

        const options = [];
        const none = this.clone(S);
        this.resolve(none, 'opp', ai, tgt, false);
        options.push({ value: finish(none), choice: null });

        for (const trap of traps) {
            if (trap.value === CARD_VALUES.KING) {
                const k = withoutTrap(this.clone(S), trap);
                this.resolve(k, 'opp', ai, tgt, true);
                options.push({ value: finish(k), choice: { trap } });
            } else if (trap.value === CARD_VALUES.ACE) {
                // The attack is stopped and the human's Battle phase ends
                const a = withoutTrap(this.clone(S), trap);
                options.push({ value: this.evaluate(a), choice: { trap } });
            } else if (trap.value === CARD_VALUES.JACK) {
                const targets = game.board.getValidRedirectTargets(ai, context.attacker, context.defenderIndex, context.defender);
                for (const t of targets) {
                    const j = withoutTrap(this.clone(S), trap);
                    this.resolve(j, 'opp', ai, { side: t.player === game.bot ? 'me' : 'opp', index: t.index }, false);
                    options.push({ value: finish(j), choice: { trap, target: t } });
                }
            }
        }
        options.sort((a, b) => b.value - a.value);
        const chosen = this.pick(options);
        return chosen ? chosen.choice : null;
    }

    /**
     * The human sprang a trap against the bot's attack: cancel it with a Queen if that is worth the Queen
     * @param {Card} trap
     * @param {Card[]} queens
     * @returns {Card|null}
     */
    chooseQueenCancel(trap, queens) {
        const attack = this.currentAttack;
        if (!attack || queens.length === 0) return null;
        const S = this.snapshot();
        const tgt = attack.target === null ? null : { side: 'opp', index: attack.target };

        // Value if the trap goes through (the human chooses the Jack target that is worst for the bot)
        let trapValue;
        if (trap.value === CARD_VALUES.ACE) {
            trapValue = this.evaluate(S);
        } else if (trap.value === CARD_VALUES.KING) {
            const k = this.clone(S);
            this.resolve(k, 'me', attack.attackerIndex, tgt, true);
            trapValue = this.evaluate(k);
        } else {
            trapValue = Math.min(...this.redirects(S, attack.attackerIndex, tgt).map(r => {
                const j = this.clone(S);
                this.resolve(j, 'me', attack.attackerIndex, r, false);
                return this.evaluate(j);
            }), this.evaluate(S));
        }

        // Value if the Queen cancels it: the attack lands as planned, and the Queen is spent
        const c = this.clone(S);
        this.resolve(c, 'me', attack.attackerIndex, tgt, false);
        const cancelValue = this.evaluate(c) - BOT_WEIGHTS.trapSet;

        const options = [{ value: cancelValue, queen: queens[0] }, { value: trapValue, queen: null }]
            .sort((a, b) => b.value - a.value);
        return this.pick(options).queen;
    }

    /**
     * Give the player time to read the last action banner before acting again
     */
    async bannersRead() {
        const ui = this.game.ui;
        if (ui && typeof ui.whenBannersRead === 'function') await ui.whenBannersRead();
    }

    // ------------------------------------------------------------------
    // Choices and mistakes
    // ------------------------------------------------------------------

    /**
     * Pick an option as a person would: by its value as the bot judges it (with some noise, so close
     * calls can go either way), and now and then a blunder into the second best
     * @param {Array<{value: number}>} options - sorted best first
     */
    pick(options) {
        if (!options || options.length === 0) return null;
        // A mistake is never a reckless attack (into a stronger monster); those only happen when they truly pay
        const allowed = options.filter((o, i) => i === 0 || !o.reckless);
        if (allowed.length > 1 && this.slip()) return allowed[1];
        if (!this.noise) return options[0];
        let best = options[0];
        let bestJudged = -Infinity;
        for (const option of allowed) {
            const judged = option.value + this.noise * this.gaussian();
            if (judged > bestJudged) {
                bestJudged = judged;
                best = option;
            }
        }
        return best;
    }

    /**
     * A standard normal random number (Box-Muller)
     */
    gaussian() {
        const u = 1 - Math.random();
        const v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    slip() {
        return Math.random() < this.mistakeRate;
    }

    // ------------------------------------------------------------------
    // Setup planning
    // ------------------------------------------------------------------

    /**
     * Search ways to use the Setup phase, look ahead from each, and choose one
     * @param {boolean} battleThisTurn - false after a Joker (the Battle phase is skipped)
     * @returns {{actions: Array, value: number}}
     */
    chooseSetupPlan(battleThisTurn) {
        const S0 = this.snapshot();
        const plans = [];
        const seen = new Set();

        const explore = (S, actions) => {
            const key = this.signature(S);
            if (seen.has(key)) return;
            seen.add(key);
            plans.push({ S, actions });
            if (actions.length >= 5) return;

            const hand = S.me.hand;
            const empty = S.me.field.indexOf(null);

            hand.forEach((h, hi) => {
                // Normal monster into the first open space
                if (h.kind === CARD_TYPES.MONSTER_NORMAL && empty !== -1) {
                    const next = this.clone(S);
                    next.me.hand.splice(hi, 1);
                    next.me.field[empty] = this.monsterInfo(h.card);
                    explore(next, [...actions, { type: 'summon', card: h.card }]);
                }
                // Big monster, with the cheapest ways to pay for it
                if (h.kind === CARD_TYPES.MONSTER_BIG) {
                    for (const sac of this.sacrificeOptions(S, h)) {
                        const next = this.clone(S);
                        next.me.hand = next.me.hand.filter(x => x.card !== h.card && !sac.cards.includes(x.card));
                        next.me.field = next.me.field.map(m => (m && sac.cards.includes(m.card) ? null : m));
                        next.me.field[next.me.field.indexOf(null)] = this.monsterInfo(h.card);
                        explore(next, [...actions, { type: 'big', card: h.card, sacrifices: sac.cards }]);
                    }
                }
            });

            // Fusion: a field monster with a lower normal monster from the hand (the same rule the human plays by)
            S.me.field.forEach((m, slot) => {
                if (!m || m.fusion) return;
                hand.forEach((h, hi) => {
                    if (h.kind !== CARD_TYPES.MONSTER_NORMAL || h.str >= m.str) return;
                    const next = this.clone(S);
                    next.me.hand.splice(hi, 1);
                    next.me.field[slot] = { card: null, str: m.str + h.str, fusion: true, weak: h.str, attacked: false };
                    explore(next, [...actions, { type: 'fuse', base: m.card, card: h.card }]);
                });
            });
        };
        explore(S0, []);

        // Traps go down in every plan; then a quick score narrows the field before looking ahead
        plans.forEach(p => this.addTraps(p));
        plans.forEach(p => { p.quick = this.evaluate(p.S); });
        plans.sort((a, b) => b.quick - a.quick);
        const shortlist = plans.slice(0, BOT_SETTINGS.PLAN_SHORTLIST);
        if (!shortlist.includes(plans.find(p => p.actions.length === p.trapActions))) {
            const idle = plans.find(p => p.actions.length === p.trapActions);
            if (idle) shortlist.push(idle);
        }

        const canAttack = battleThisTurn && this.game.isAttackAllowedThisTurn(this.game.bot);
        shortlist.forEach(p => { p.value = this.lookahead(p.S, canAttack); });
        shortlist.sort((a, b) => b.value - a.value);
        return this.pick(shortlist);
    }

    /**
     * Fill empty trap spaces from the hand: King, Jack, Ace, then Queen, preferring types not already set
     */
    addTraps(plan) {
        const S = plan.S;
        const order = [CARD_VALUES.KING, CARD_VALUES.JACK, CARD_VALUES.ACE, CARD_VALUES.QUEEN];
        const traps = S.me.hand.filter(h => h.kind === CARD_TYPES.TRAP)
            .sort((a, b) => order.indexOf(a.card.value) - order.indexOf(b.card.value));
        const setValues = () => S.me.traps.filter(Boolean).map(t => t.value);
        const ordered = [...traps.filter(t => !setValues().includes(t.card.value)), ...traps.filter(t => setValues().includes(t.card.value))];
        const actions = [];
        for (const t of ordered) {
            const slot = S.me.traps.indexOf(null);
            if (slot === -1) break;
            S.me.traps[slot] = { card: t.card, value: t.card.value, armed: false };
            S.me.hand = S.me.hand.filter(h => h.card !== t.card);
            actions.push({ type: 'trap', card: t.card });
        }
        plan.trapActions = actions.length;
        plan.actions = [...plan.actions, ...actions];
    }

    /**
     * The cheapest sets of cards that can pay for a big monster
     * @returns {Array<{cards: Card[], cost: number}>}
     */
    sacrificeOptions(S, big) {
        const need = getRequiredSacrificeValue(big.card);
        const pool = [
            ...S.me.hand.filter(h => h.card !== big.card && (h.kind === CARD_TYPES.MONSTER_NORMAL || h.kind === CARD_TYPES.MONSTER_BIG))
                .map(h => ({ card: h.card, str: h.str, cost: this.handCardValue(h.card), field: false })),
            ...S.me.field.filter(m => m && m.card).map(m => ({ card: m.card, str: m.str, cost: this.monsterValue(m), field: true }))
        ];
        const hasSpace = S.me.field.includes(null);
        const options = [];
        const n = Math.min(pool.length, 9);
        for (let mask = 1; mask < (1 << n); mask++) {
            let str = 0, cost = 0, field = false;
            const cards = [];
            for (let i = 0; i < n; i++) {
                if (!(mask & (1 << i))) continue;
                str += pool[i].str;
                cost += pool[i].cost;
                field = field || pool[i].field;
                cards.push(pool[i].card);
            }
            if (str >= need && (hasSpace || field)) options.push({ cards, cost });
        }
        return options.sort((a, b) => a.cost - b.cost).slice(0, 3);
    }

    /**
     * How good the position is after playing it forward: this battle, the human's reply, and the bot's next attack
     * @param {Object} S - position after Setup
     * @param {boolean} canAttack - whether the bot may attack this turn
     */
    lookahead(S, canAttack) {
        let risk = 0;
        let state = S;
        if (canAttack) {
            const mine = this.myBattle(state);
            state = mine.S;
            risk += mine.risk;
        }
        if (this.isOver(state)) return this.evaluate(state) - risk;

        // The human's turn: they summon, then attack; the bot's traps (now armed) defend
        state = this.oppBattle(this.humanSummons(state), { fresh: true });
        if (this.isOver(state)) return this.evaluate(state) - risk;

        // The bot's next attack with the monsters it still has
        const next = this.myBattle(this.freshTurn(state, 'me'));
        return (this.evaluate(state) + this.evaluate(next.S) - next.risk) / 2 - risk;
    }

    // ------------------------------------------------------------------
    // Battle reasoning
    // ------------------------------------------------------------------

    /**
     * Every attack the bot could make now, plus stopping, best first. Each attack is judged by playing
     * on: the rest of this battle, the human's reply, and the bot's next turn.
     */
    rankAttacks(S) {
        const choices = [{ stop: true, value: this.lookahead(S, false) }];
        for (const option of this.attackOptions(S, {})) {
            const value = this.lookahead(option.after, true) - option.harm;
            const defender = option.target && S.opp.field[option.target.index];
            const reckless = !!defender && S.me.field[option.attacker].str < defender.str;
            choices.push({ attacker: option.attacker, target: option.target, value, reckless });
        }
        return choices.sort((a, b) => b.value - a.value);
    }

    /**
     * All attacks available to the bot with their trap-adjusted value
     * @param {Object} S
     * @param {Object} expectedUsed - chance each human trap type is already spent in this simulated battle
     */
    attackOptions(S, expectedUsed) {
        const options = [];
        const base = this.evaluate(S);
        const odds = this.trapOdds(S, expectedUsed);
        const targets = S.opp.field.some(Boolean)
            ? S.opp.field.map((m, i) => (m ? { side: 'opp', index: i } : null)).filter(Boolean)
            : [null];

        // What the rest of this battle is worth, roughly (lost if an Ace stops it)
        const bestGain = ai => Math.max(0, ...targets.map(t => {
            const s = this.clone(S);
            this.resolve(s, 'me', ai, t, false);
            return this.evaluate(s) - base;
        }));

        S.me.field.forEach((m, ai) => {
            if (!m || m.attacked) return;
            const rest = S.me.field.reduce((sum, other, oi) => (other && !other.attacked && oi !== ai ? sum + bestGain(oi) : sum), 0);
            for (const target of targets) {
                const after = this.clone(S);
                this.resolve(after, 'me', ai, target, false);
                const gain = this.evaluate(after) - base;
                const { harm, uses } = this.trapHarm(S, ai, target, gain, rest, odds, base);
                options.push({ attacker: ai, target, after, gain, harm, uses, value: gain - harm });
            }
        });
        return options;
    }

    /**
     * Expected loss from the human's possible trap answers to one attack
     */
    trapHarm(S, ai, target, gain, rest, odds, base) {
        const harms = [];
        if (odds[CARD_VALUES.KING] > 0) {
            const k = this.clone(S);
            this.resolve(k, 'me', ai, target, true);
            harms.push({ type: CARD_VALUES.KING, p: odds[CARD_VALUES.KING], harm: gain - (this.evaluate(k) - base) });
        }
        if (odds[CARD_VALUES.ACE] > 0) {
            harms.push({ type: CARD_VALUES.ACE, p: odds[CARD_VALUES.ACE], harm: gain + rest });
        }
        if (odds[CARD_VALUES.JACK] > 0) {
            const worst = Math.min(...this.redirects(S, ai, target).map(r => {
                const j = this.clone(S);
                this.resolve(j, 'me', ai, r, false);
                return this.evaluate(j) - base;
            }), gain);
            harms.push({ type: CARD_VALUES.JACK, p: odds[CARD_VALUES.JACK], harm: gain - worst });
        }

        // The human uses whichever trap hurts most; a ready Queen of the bot's would cancel it
        harms.sort((a, b) => b.harm - a.harm);
        let notYet = 1;
        let harm = 0;
        const uses = {};
        for (const h of harms) {
            if (h.harm <= 0) continue;
            const chance = notYet * h.p;
            harm += chance * h.harm;
            uses[h.type] = chance;
            notYet *= 1 - h.p;
        }
        if (this.queenReady(S)) harm *= 0.3;
        return { harm, uses };
    }

    /**
     * Greedy battle for the bot in a simulated position, attacking only while it pays after trap risk
     */
    myBattle(S) {
        let state = S;
        let risk = 0;
        const expectedUsed = {};
        for (let step = 0; step < 3; step++) {
            const options = this.attackOptions(state, expectedUsed);
            if (options.length === 0) break;
            options.sort((a, b) => b.value - a.value);
            const best = options[0];
            if (best.value <= 0) break;
            state = best.after;
            risk += best.harm;
            Object.entries(best.uses).forEach(([type, p]) => { expectedUsed[type] = Math.min(1, (expectedUsed[type] || 0) + p); });
            if (this.isOver(state)) break;
        }
        return { S: state, risk };
    }

    /**
     * The human's attacks in a simulated position. They attack whenever the visible result favors them;
     * the bot answers each attack with its best trap (it knows its own traps).
     * @param {Object} S
     * @param {{fresh: boolean}} opts - fresh: a new human turn (monsters ready, all bot traps armed)
     */
    oppBattle(S, { fresh }) {
        const state = fresh ? this.freshTurn(S, 'opp') : this.clone(S);
        if (fresh) state.me.traps.forEach(t => { if (t) t.armed = true; });

        for (let step = 0; step < 3; step++) {
            const base = this.evaluate(state);
            const targets = state.me.field.some(Boolean)
                ? state.me.field.map((m, i) => (m ? { side: 'me', index: i } : null)).filter(Boolean)
                : [null];
            let best = null;
            state.opp.field.forEach((m, ai) => {
                if (!m || m.attacked) return;
                for (const target of targets) {
                    const after = this.clone(state);
                    this.resolve(after, 'opp', ai, target, false);
                    const theirGain = base - this.evaluate(after);
                    if (!best || theirGain > best.gain) best = { ai, target, gain: theirGain };
                }
            });
            if (!best || best.gain <= 0) break;

            // The bot's answer: the trap (or none) that leaves it best placed
            const answers = [];
            const plain = this.clone(state);
            this.resolve(plain, 'opp', best.ai, best.target, false);
            answers.push({ S: plain, value: this.evaluate(plain), ends: false });
            state.me.traps.forEach((t, ti) => {
                if (!t || !t.armed || state.me.used.has(t.value)) return;
                const spend = () => {
                    const s = this.clone(state);
                    s.me.traps[ti] = null;
                    s.me.used.add(t.value);
                    return s;
                };
                if (t.value === CARD_VALUES.KING) {
                    const s = spend();
                    this.resolve(s, 'opp', best.ai, best.target, true);
                    answers.push({ S: s, value: this.evaluate(s), ends: false });
                } else if (t.value === CARD_VALUES.ACE) {
                    const s = spend();
                    answers.push({ S: s, value: this.evaluate(s), ends: true });
                } else if (t.value === CARD_VALUES.JACK) {
                    for (const r of this.redirects(state, best.ai, best.target, 'opp')) {
                        const s = spend();
                        this.resolve(s, 'opp', best.ai, r, false);
                        answers.push({ S: s, value: this.evaluate(s), ends: false });
                    }
                }
            });
            answers.sort((a, b) => b.value - a.value);
            const answer = answers[0];
            Object.assign(state, answer.S);
            const attacker = state.opp.field[best.ai];
            if (attacker) attacker.attacked = true;
            if (answer.ends || this.isOver(state)) break;
        }
        return state;
    }

    /**
     * Where a Jack could send an attack: the attacker's other monsters, or the defender's other monsters
     * @param {string} attackerSide - 'me' or 'opp'
     */
    redirects(S, ai, target, attackerSide = 'me') {
        const defenderSide = attackerSide === 'me' ? 'opp' : 'me';
        const out = [];
        S[attackerSide].field.forEach((m, i) => { if (m && i !== ai) out.push({ side: attackerSide, index: i }); });
        S[defenderSide].field.forEach((m, i) => {
            if (m && !(target && target.side === defenderSide && target.index === i)) out.push({ side: defenderSide, index: i });
        });
        return out;
    }

    /**
     * Chance that the human holds an armed, unspent trap of each type that can answer an attack
     */
    trapOdds(S, expectedUsed) {
        const armed = S.opp.traps.filter(t => t && t.armed).length;
        const odds = { [CARD_VALUES.KING]: 0, [CARD_VALUES.JACK]: 0, [CARD_VALUES.ACE]: 0 };
        if (armed === 0 || !this.unseen) return odds;
        const pool = this.unseen.traps;
        const total = Object.values(pool).reduce((a, b) => a + b, 0);
        if (total === 0) return odds;
        Object.keys(odds).forEach(type => {
            if (S.opp.used.has(type)) return;
            const p = 1 - Math.pow(1 - pool[type] / total, armed);
            odds[type] = p * (1 - (expectedUsed[type] || 0));
        });
        return odds;
    }

    queenReady(S) {
        return S.me.traps.some(t => t && t.armed && t.value === CARD_VALUES.QUEEN) && !S.me.used.has(CARD_VALUES.QUEEN);
    }

    /**
     * The human's next Setup phase, roughly: they add monsters from their hand to open spaces
     */
    humanSummons(S) {
        const state = this.clone(S);
        state.opp.handCount += 1; // their draw
        const open = state.opp.field.filter(m => !m).length;
        const count = Math.min(open, state.opp.handCount >= 4 ? 2 : state.opp.handCount >= 2 ? 1 : 0);
        for (let i = 0; i < count; i++) {
            const slot = state.opp.field.indexOf(null);
            state.opp.field[slot] = { card: null, str: this.unseen ? this.unseen.likelySummon : 5, fusion: false, attacked: false };
            state.opp.handCount -= 1;
        }
        return state;
    }

    // ------------------------------------------------------------------
    // Positions: a light copy of the game state the bot can play forward
    // ------------------------------------------------------------------

    snapshot() {
        const game = this.game;
        const side = (player, known) => ({
            hp: player.health,
            field: player.monsterSpaces.map(s => (s.card ? this.monsterInfo(s.card) : null)),
            // The bot knows its own traps; the human's are face-down
            traps: player.trapSpaces.map(s => (s.card ? { card: known ? s.card : null, value: known ? s.card.value : null, armed: !!s.card.active } : null)),
            hand: known ? player.hand.map(card => ({ card, kind: getCardType(card.value), str: isMonsterCard(card) ? getCardNumericValue(card.value) : 0 })) : [],
            handCount: player.hand.length,
            used: new Set(player.usedTrapTypes)
        });
        return { me: side(game.bot, true), opp: side(game.player, false) };
    }

    monsterInfo(card) {
        // weak: a fusion's weaker card, the strength it loses if its upkeep goes unpaid
        const weak = card.isFusion ? Math.min(...card.fusionCards.map(c => calculateMonsterStrength(c))) : 0;
        return { card, str: calculateMonsterStrength(card), fusion: !!card.isFusion, weak, attacked: !!card.attackedThisTurn };
    }

    clone(S) {
        const side = x => ({
            hp: x.hp,
            field: x.field.map(m => (m ? { ...m } : null)),
            traps: x.traps.map(t => (t ? { ...t } : null)),
            hand: x.hand.slice(),
            handCount: x.handCount,
            used: new Set(x.used)
        });
        return { me: side(S.me), opp: side(S.opp) };
    }

    /**
     * Start of a new turn for one side: its monsters may attack again and its trap limits reset
     */
    freshTurn(S, sideName) {
        const state = this.clone(S);
        state[sideName].field.forEach(m => { if (m) m.attacked = false; });
        state.me.used = new Set();
        state.opp.used = new Set();
        return state;
    }

    signature(S) {
        const field = S.me.field.map(m => (m ? `${m.str}${m.fusion ? 'f' : ''}` : '-')).sort().join(',');
        const hand = S.me.hand.map(h => h.card.id).sort().join(',');
        return `${field}|${hand}`;
    }

    /**
     * Resolve an attack in a simulated position, by the same rules as Board.handleAttack
     * @param {string} attackerSide - 'me' or 'opp'
     * @param {{side: string, index: number}|null} target - null for a direct attack
     * @param {boolean} halved - a King halves the attacker
     */
    resolve(S, attackerSide, ai, target, halved) {
        const attacker = S[attackerSide].field[ai];
        if (!attacker) return;
        attacker.attacked = true;
        const strength = halved ? applyKingEffect(attacker.str) : attacker.str;
        const defenderSide = attackerSide === 'me' ? 'opp' : 'me';
        if (!target) {
            S[defenderSide].hp -= strength;
            return;
        }
        const defender = S[target.side].field[target.index];
        if (!defender) return;
        if (strength > defender.str) {
            S[target.side].field[target.index] = null;
            S[target.side].hp -= strength - defender.str;
        } else if (strength < defender.str) {
            S[attackerSide].field[ai] = null;
            S[attackerSide].hp -= defender.str - strength;
        } else {
            S[target.side].field[target.index] = null;
            S[attackerSide].field[ai] = null;
        }
    }

    isOver(S) {
        return S.me.hp <= 0 || S.opp.hp <= 0;
    }

    /**
     * How good a position is for the bot, in health points
     */
    evaluate(S) {
        const W = BOT_WEIGHTS;
        if (S.me.hp <= 0 && S.opp.hp <= 0) return 0;
        if (S.opp.hp <= 0) return W.win + S.me.hp;
        if (S.me.hp <= 0) return -W.win - S.opp.hp;

        const low = BOT_SETTINGS.LOW_HP;
        let v = (S.me.hp - S.opp.hp) * W.hp;
        v -= Math.max(0, low - S.me.hp) * W.lowHp;
        v += Math.max(0, low - S.opp.hp) * W.lowHp;
        v += S.me.field.reduce((t, m) => t + (m ? this.monsterValue(m) : 0), 0);
        v -= S.opp.field.reduce((t, m) => t + (m ? this.monsterValue(m) : 0), 0);
        v += S.me.hand.reduce((t, h) => t + this.handCardValue(h.card), 0) * W.handCard;
        // Fusions need a monster card every End phase. Without spares in hand they break apart,
        // losing their weaker card, so count those weaker cards as likely lost
        const fusions = S.me.field.filter(m => m && m.fusion).sort((a, b) => a.weak - b.weak);
        const spares = S.me.hand.filter(h => h.kind === CARD_TYPES.MONSTER_NORMAL || h.kind === CARD_TYPES.MONSTER_BIG).length;
        fusions.slice(spares).forEach(m => { v -= m.weak * W.strength; });
        v -= S.opp.handCount * W.oppCard;
        v += (S.me.traps.filter(Boolean).length - S.opp.traps.filter(Boolean).length) * W.trapSet;
        return v;
    }

    monsterValue(m) {
        const W = BOT_WEIGHTS;
        return m.str * W.strength + W.presence - (m.fusion ? W.upkeep : 0);
    }

    /**
     * What a card in hand is worth: traps and big monsters most, low monsters least
     */
    handCardValue(card) {
        switch (getCardType(card.value)) {
            case CARD_TYPES.TRAP:
                return { [CARD_VALUES.KING]: 1.6, [CARD_VALUES.JACK]: 1.5, [CARD_VALUES.ACE]: 1.4, [CARD_VALUES.QUEEN]: 1.1 }[card.value] || 1.2;
            case CARD_TYPES.JOKER:
                return 1.5;
            case CARD_TYPES.MONSTER_BIG:
                return 1.4 + 0.08 * getCardNumericValue(card.value);
            default:
                return 0.9 + 0.08 * getCardNumericValue(card.value);
        }
    }

    // ------------------------------------------------------------------
    // Card counting and the Joker
    // ------------------------------------------------------------------

    /**
     * Count the cards the bot hasn't seen: everything except its own hand and traps, the cards
     * face up on the board, and the discard pile. Used to guess the human's traps and summons.
     */
    countUnseenCards() {
        const game = this.game;
        const seen = [
            ...game.bot.hand,
            ...game.bot.trapSpaces.map(s => s.card).filter(Boolean),
            ...game.deck.discardPile,
            ...[game.player, game.bot].flatMap(p => p.monsterSpaces.map(s => s.card).filter(Boolean)
                .flatMap(c => (c.isFusion ? c.fusionCards : [c])))
        ];
        const count = value => 4 - seen.filter(c => c.value === value).length;
        const traps = {
            [CARD_VALUES.ACE]: count(CARD_VALUES.ACE),
            [CARD_VALUES.JACK]: count(CARD_VALUES.JACK),
            [CARD_VALUES.QUEEN]: count(CARD_VALUES.QUEEN),
            [CARD_VALUES.KING]: count(CARD_VALUES.KING)
        };
        // A human usually summons their best monsters: average the stronger half of the unseen ones
        const monsters = [];
        ['2', '3', '4', '5', '6', '7'].forEach(v => {
            for (let i = 0; i < Math.max(0, count(v)); i++) monsters.push(Number(v));
        });
        monsters.sort((a, b) => b - a);
        const top = monsters.slice(0, Math.max(1, Math.ceil(monsters.length / 2)));
        const likelySummon = top.length ? top.reduce((a, b) => a + b, 0) / top.length : 5;
        this.unseen = { traps, likelySummon };
    }

    /**
     * The value of resetting everything with the Joker: empty boards, five fresh cards each, no battle this turn
     */
    jokerValue() {
        const S = this.snapshot();
        const reset = this.clone(S);
        reset.me.field = reset.me.field.map(() => null);
        reset.opp.field = reset.opp.field.map(() => null);
        reset.me.traps = reset.me.traps.map(() => null);
        reset.opp.traps = reset.opp.traps.map(() => null);
        reset.opp.handCount = GAME_SETTINGS.STARTING_HAND_SIZE;
        // Five unknown cards, valued as an average hand
        reset.me.hand = [];
        const average = 1.0;
        const state = this.oppBattle(this.humanSummons(reset), { fresh: true });
        return this.evaluate(state) + GAME_SETTINGS.STARTING_HAND_SIZE * average * BOT_WEIGHTS.handCard;
    }

    // ------------------------------------------------------------------
    // Carrying out a plan
    // ------------------------------------------------------------------

    perform(action) {
        const game = this.game;
        const bot = game.bot;
        const firstEmpty = () => bot.monsterSpaces.findIndex(s => s.card === null);
        switch (action.type) {
            case 'summon': {
                const slot = firstEmpty();
                if (slot !== -1) game.playMonsterCard(action.card, slot, true);
                break;
            }
            case 'big':
                game.playBigMonster(action.card, firstEmpty() === -1 ? null : firstEmpty(), action.sacrifices, true);
                break;
            case 'fuse': {
                const slot = bot.monsterSpaces.findIndex(s => s.card === action.base);
                if (slot !== -1) game.createFusion(action.base, action.card, slot, true);
                break;
            }
            case 'trap': {
                const slot = bot.trapSpaces.findIndex(s => s.card === null);
                if (slot !== -1) game.playTrapCard(action.card, slot, true);
                break;
            }
        }
        game.ui.updateGameState();
    }
}

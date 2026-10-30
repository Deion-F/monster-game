/**
 * A stand-in for a human who plays to win, used by tools/simulate.js.
 * It follows sound, readable rules of thumb rather than searching ahead:
 * it only makes attacks it wins, sets its traps, builds fusions that beat the bot's board,
 * and answers attacks with the trap that hurts the bot most.
 * Runs inside the simulator's VM context, so the game's globals are available.
 */
class HumanProxy {
    constructor(game) {
        this.game = game;
    }

    str(card) {
        return calculateMonsterStrength(card);
    }

    fieldMonsters(player) {
        return player.monsterSpaces.map((s, i) => ({ card: s.card, index: i })).filter(m => m.card);
    }

    strongest(player) {
        return Math.max(0, ...this.fieldMonsters(player).map(m => this.str(m.card)));
    }

    emptySlot(spaces) {
        return spaces.findIndex(s => s.card === null);
    }

    async playTurn() {
        const g = this.game;
        const me = g.player;
        const bot = g.bot;

        // Joker: reset when the bot's board is far ahead
        const joker = me.hand.find(c => c.value === CARD_VALUES.JOKER);
        const myBoard = this.fieldMonsters(me).reduce((t, m) => t + this.str(m.card), 0);
        const botBoard = this.fieldMonsters(bot).reduce((t, m) => t + this.str(m.card), 0);
        if (joker && botBoard - myBoard >= 10) g.playJoker(joker, false);

        // Traps: fill the trap row, preferring King, Jack, Ace, then Queen
        const order = [CARD_VALUES.KING, CARD_VALUES.JACK, CARD_VALUES.ACE, CARD_VALUES.QUEEN];
        me.hand.filter(c => getCardType(c.value) === CARD_TYPES.TRAP)
            .sort((a, b) => order.indexOf(a.value) - order.indexOf(b.value))
            .forEach(trap => {
                const slot = this.emptySlot(me.trapSpaces);
                if (slot !== -1) g.playTrapCard(trap, slot, false);
            });

        // Big monsters: summon when the sacrifices come cheaply from the hand, or when it beats the bot's best
        const bigs = me.hand.filter(c => getCardType(c.value) === CARD_TYPES.MONSTER_BIG)
            .sort((a, b) => this.str(b) - this.str(a));
        for (const big of bigs) {
            if (!me.hand.includes(big)) continue;
            const need = getRequiredSacrificeValue(big);
            const handFodder = me.hand.filter(c => c !== big && getCardType(c.value) === CARD_TYPES.MONSTER_NORMAL)
                .sort((a, b) => this.str(a) - this.str(b));
            const picks = [];
            let total = 0;
            for (const c of handFodder) {
                if (total >= need) break;
                picks.push(c);
                total += this.str(c);
            }
            const beatsBest = this.str(big) > this.strongest(bot);
            if (total >= need && this.emptySlot(me.monsterSpaces) !== -1 && (picks.length <= 2 || beatsBest)) {
                g.playBigMonster(big, this.emptySlot(me.monsterSpaces), picks, false);
            }
        }

        // Normal monsters: strongest first into open spaces, keeping one weak monster for upkeep if fusions are around
        me.hand.filter(c => getCardType(c.value) === CARD_TYPES.MONSTER_NORMAL)
            .sort((a, b) => this.str(b) - this.str(a))
            .forEach(card => {
                const slot = this.emptySlot(me.monsterSpaces);
                if (slot !== -1) g.playMonsterCard(card, slot, false);
            });

        // Fusion: a field monster plus a lower hand monster, when the result beats the bot's best and upkeep can be paid
        for (const base of this.fieldMonsters(me)) {
            if (base.card.isFusion) continue;
            const lower = me.hand.filter(c => getCardType(c.value) === CARD_TYPES.MONSTER_NORMAL && this.str(c) < this.str(base.card))
                .sort((a, b) => this.str(b) - this.str(a));
            const spareForUpkeep = me.hand.filter(c => isMonsterCard(c)).length >= 2;
            if (lower.length && spareForUpkeep && this.str(base.card) + this.str(lower[0]) > this.strongest(bot)) {
                g.createFusion(base.card, lower[0], base.index, false);
            }
        }

        // Battle
        g.endCurrentPhase();
        if (g.currentPhase === PHASES.BATTLE) {
            await this.attack();
            if (!g.gameOver && g.currentPhase === PHASES.BATTLE) g.endCurrentPhase();
        }
    }

    async attack() {
        const g = this.game;
        if (!g.isAttackAllowedThisTurn(g.player)) return;
        for (let guard = 0; guard < 6; guard++) {
            if (g.gameOver || g.battleEnded) return;
            const attackers = this.fieldMonsters(g.player).filter(m => m.card.canAttack())
                .sort((a, b) => this.str(b.card) - this.str(a.card));
            let acted = false;
            for (const a of attackers) {
                const targets = g.board.getValidAttackTargets(g.player, g.bot);
                if (targets.length === 1 && targets[0] === null) {
                    await g.processAttack(a.index, null);
                    acted = true;
                    break;
                }
                // Destroy the biggest monster this attacker beats
                const beatable = targets.map(i => ({ i, s: this.str(g.bot.monsterSpaces[i].card) }))
                    .filter(t => t.s < this.str(a.card))
                    .sort((x, y) => y.s - x.s);
                if (beatable.length) {
                    await g.processAttack(a.index, beatable[0].i);
                    acted = true;
                    break;
                }
            }
            if (!acted) return;
        }
    }

    /**
     * Answer the bot's attack with whichever trap hurts the bot most
     */
    chooseTrap(context) {
        const g = this.game;
        const attacker = context.attacker.monsterSpaces[context.attackerIndex].card;
        const target = context.defenderIndex === null ? null : context.defender.monsterSpaces[context.defenderIndex].card;
        const A = applyKingHalvings(this.str(attacker), Number(context.halved) || 0);
        const D = target ? this.str(target) : 0;
        const has = v => context.traps.find(t => t.value === v);

        // My attack on a bot monster was answered (say, halved by its King): if it now loses,
        // send it on to a bot monster it still beats
        if (context.responder === context.attacker && context.defender !== context.attacker) {
            const jack = has(CARD_VALUES.JACK);
            if (!jack || !target || A > D) return null;
            const prey = g.board.getValidRedirectTargets(context.attackerIndex, context.attacker, context.defenderIndex, context.defender)
                .find(o => o.player === context.defender && this.str(o.player.monsterSpaces[o.index].card) < A);
            return prey ? { trap: jack, target: prey } : null;
        }

        // The bot's Jack turned my own attack on my own monster: halve it if that saves my monster,
        // otherwise send it on to a bot monster it beats
        if (context.attacker === context.defender) {
            const jack = has(CARD_VALUES.JACK);
            const options = jack ? g.board.getValidRedirectTargets(context.attackerIndex, context.attacker, context.defenderIndex, context.defender) : [];
            const prey = options.find(o => o.player !== context.attacker && this.str(o.player.monsterSpaces[o.index].card) < A);
            if (prey) return { trap: jack, target: prey };
            const king = has(CARD_VALUES.KING);
            if (king && A >= D && applyKingEffect(A) < D) return { trap: king };
            return null;
        }

        // Jack: send the attack into another bot monster (the bot loses either way), or into my monster that beats it
        const jack = has(CARD_VALUES.JACK);
        if (jack) {
            const options = g.board.getValidRedirectTargets(context.attackerIndex, context.attacker, context.defenderIndex, context.defender);
            const own = options.find(o => o.player === context.attacker);
            const wall = options.filter(o => o.player === context.defender && this.str(o.player.monsterSpaces[o.index].card) > A)[0];
            if ((target === null || A > D) && (own || wall)) return { trap: jack, target: own || wall };
        }
        const king = has(CARD_VALUES.KING);
        if (king && (target === null ? A >= 4 : A > D)) return { trap: king };
        const ace = has(CARD_VALUES.ACE);
        if (ace && (target === null ? A >= 5 : A > D + 2)) return { trap: ace };
        return null;
    }

    chooseQueen(trap, queens) {
        return queens[0] || null;
    }

    payUpkeep(needed) {
        const me = this.game.player;
        const hand = me.hand.filter(c => isMonsterCard(c)).sort((a, b) => this.str(a) - this.str(b));
        const pay = hand.slice(0, needed);
        if (pay.length < needed) {
            const fusionStr = Math.max(0, ...this.fieldMonsters(me).filter(m => m.card.isFusion).map(m => this.str(m.card)));
            const field = this.fieldMonsters(me).filter(m => !m.card.isFusion && this.str(m.card) + 3 <= fusionStr)
                .sort((a, b) => this.str(a.card) - this.str(b.card));
            pay.push(...field.slice(0, needed - pay.length).map(m => m.card));
        }
        return pay;
    }

    chooseDiscards(excess) {
        const keep = c => {
            const type = getCardType(c.value);
            if (type === CARD_TYPES.TRAP || type === CARD_TYPES.JOKER) return 10;
            return this.str(c);
        };
        return [...this.game.player.hand].sort((a, b) => keep(a) - keep(b)).slice(0, excess);
    }
}

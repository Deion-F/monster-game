/**
 * Board class for managing the game board
 */
class Board {
    /**
     * Create a game board
     * @param {Player} player - Human player
     * @param {Player} bot - Bot player
     * @param {Deck} deck - Game deck
     */
    constructor(player, bot, deck) {
        this.player = player;
        this.bot = bot;
        this.deck = deck;
    }

    /**
     * Handle an attack from attacker to defender
     * @param {Player} attacker - Attacking player
     * @param {number} attackerMonsterIndex - Index of attacking monster
     * @param {Player} defender - Defending player
     * @param {number|null} defenderMonsterIndex - Index of defending monster (null for direct)
     * @param {Object} options - Additional options
     * @returns {Object} - Attack result
     */
    handleAttack(attacker, attackerMonsterIndex, defender, defenderMonsterIndex, options = {}) {
        const attackingCard = attacker.monsterSpaces[attackerMonsterIndex].card;
        if (!attackingCard) return { success: false, message: 'No attacking monster' };
        
        // Mark monster as having attacked
        attackingCard.attackedThisTurn = true;
        
        let attackingStrength = options.attackStrength || 
            calculateMonsterStrength(attackingCard);
        
        // Handle King effects if applied (a count: Kings stack)
        if (options.kingEffect) {
            attackingStrength = applyKingHalvings(attackingStrength, Number(options.kingEffect));
        }
        
        // Direct attack
        if (defenderMonsterIndex === null) {
            defender.takeDamage(attackingStrength);
            return { 
                success: true, 
                direct: true, 
                damage: attackingStrength,
                attackerHealth: attacker.health,
                defenderHealth: defender.health
            };
        }
        
        // Monster vs monster attack
        const defendingCard = defender.monsterSpaces[defenderMonsterIndex].card;
        if (!defendingCard) return { success: false, message: 'No defending monster' };
        
        const defendingStrength = calculateMonsterStrength(defendingCard);
        
        // Compare strengths
        let attackerDestroyed = false;
        let defenderDestroyed = false;
        let damage = 0;
        
        if (attackingStrength > defendingStrength) {
            // Attacker wins
            defenderDestroyed = true;
            damage = attackingStrength - defendingStrength;
            defender.takeDamage(damage);
        } else if (attackingStrength < defendingStrength) {
            // Defender wins
            attackerDestroyed = true;
            damage = defendingStrength - attackingStrength;
            attacker.takeDamage(damage);
        } else {
            // Equal strength - both destroyed
            attackerDestroyed = true;
            defenderDestroyed = true;
        }
        
        // Handle destruction
        if (attackerDestroyed) {
            this.destroyMonster(attacker, attackerMonsterIndex);
        }
        
        if (defenderDestroyed) {
            this.destroyMonster(defender, defenderMonsterIndex);
        }
        
        return {
            success: true,
            direct: false,
            attackerDestroyed,
            defenderDestroyed,
            damage,
            attackerHealth: attacker.health,
            defenderHealth: defender.health
        };
    }

    /**
     * Destroy a monster
     * @param {Player} player - Player who owns the monster
     * @param {number} monsterIndex - Monster index
     */
    destroyMonster(player, monsterIndex) {
        const monster = player.monsterSpaces[monsterIndex].card;
        
        if (!monster) return;
        
        // Handle fusion destruction
        if (monster.isFusion) {
            for (const component of monster.fusionCards) {
                this.deck.discard(component);
            }
        } else {
            this.deck.discard(monster);
        }
        
        player.monsterSpaces[monsterIndex].card = null;
    }

    /**
     * Handle Joker activation
     * @param {Player} activator - Player activating Joker
     * @param {Card} joker - Joker card
     */
    handleJokerEffect(activator, joker) {
        // 1. Destroy all cards on the field
        for (let i = 0; i < this.player.monsterSpaces.length; i++) {
            if (this.player.monsterSpaces[i].card) {
                this.destroyMonster(this.player, i);
            }
            if (this.bot.monsterSpaces[i].card) {
                this.destroyMonster(this.bot, i);
            }
        }
        
        for (let i = 0; i < this.player.trapSpaces.length; i++) {
            if (this.player.trapSpaces[i].card) {
                this.deck.discard(this.player.trapSpaces[i].card);
                this.player.trapSpaces[i].card = null;
            }
            if (this.bot.trapSpaces[i].card) {
                this.deck.discard(this.bot.trapSpaces[i].card);
                this.bot.trapSpaces[i].card = null;
            }
        }
        
        // 2. Both players discard their hands
        this.deck.discardMultiple(this.player.hand);
        this.deck.discardMultiple(this.bot.hand);
        this.player.hand = [];
        this.bot.hand = [];
        
        // 3. Shuffle discard pile into deck
        this.deck.returnDiscardsToDeck();
        
        // 4. Both players draw a fresh starting hand
        this.player.drawCards(this.deck, GAME_SETTINGS.STARTING_HAND_SIZE);
        this.bot.drawCards(this.deck, GAME_SETTINGS.STARTING_HAND_SIZE);
        
        // 5. Remove Joker from play for the rest of the match
        this.deck.removeFromGame(joker);
    }

    /**
     * Handle Ace trap activation
     */
    handleAceTrap() {
        // End battle phase
        return { endBattlePhase: true };
    }

    /**
     * Handle Jack trap activation
     * @param {number} targetIndex - Index of monster to redirect to
     * @param {Player} targetPlayer - Player who owns the target
     * @returns {Object} - Redirect info
     */
    handleJackTrap(targetIndex, targetPlayer) {
        return {
            redirectTarget: targetIndex,
            redirectPlayer: targetPlayer
        };
    }

    /**
     * Get all valid attack targets for the current player
     * @param {Player} attacker - Attacking player
     * @param {Player} defender - Defending player
     * @returns {Array} - Valid targets (index or null for direct)
     */
    getValidAttackTargets(attacker, defender) {
        // If defender has monsters, they must be attacked
        const defenderMonsters = defender.monsterSpaces
            .map((space, index) => space.card ? index : null)
            .filter(index => index !== null);
        
        if (defenderMonsters.length > 0) {
            return defenderMonsters;
        }
        
        // No monsters, direct attack allowed
        return [null];
    }

    /**
     * Get valid redirect targets for Jack trap
     * @param {number} attackingMonsterIndex - Original attacking monster index
     * @param {Player} attackingPlayer - Player who owns attacking monster
     * @param {number|null} targetMonsterIndex - Original target monster index
     * @param {Player} targetPlayer - Player who owns target monster
     * @returns {Array} - Valid redirect targets [{player, index}]
     */
    getValidRedirectTargets(attackingMonsterIndex, attackingPlayer, targetMonsterIndex, targetPlayer) {
        const validTargets = [];
        
        // Add player monsters (except the attacker)
        attackingPlayer.monsterSpaces.forEach((space, index) => {
            if (space.card && index !== attackingMonsterIndex) {
                validTargets.push({
                    player: attackingPlayer,
                    index
                });
            }
        });
        
        // Add opponent monsters (except the original target)
        const opponentPlayer = attackingPlayer === this.player ? this.bot : this.player;
        opponentPlayer.monsterSpaces.forEach((space, index) => {
            // Skip if this was the original target
            if (opponentPlayer === targetPlayer && index === targetMonsterIndex) {
                return;
            }
            
            if (space.card) {
                validTargets.push({
                    player: opponentPlayer,
                    index
                });
            }
        });
        
        return validTargets;
    }

    /**
     * Find potential fusion combinations for a player
     * @param {Player} player - Player to check
     * @returns {Array} - Valid fusion combinations
     */
    getPotentialFusions(player) {
        const combinations = [];
        const monsters = [];
        
        // Collect all monsters on field
        player.monsterSpaces.forEach((space, index) => {
            if (space.card && isMonsterCard(space.card) && !space.card.isFusion) {
                monsters.push({
                    card: space.card,
                    index
                });
            }
        });
        
        // Need at least 2 monsters to fuse
        if (monsters.length < 2) return [];
        
        // Check all combinations
        for (let i = 0; i < monsters.length; i++) {
            for (let j = i + 1; j < monsters.length; j++) {
                const monster1 = monsters[i];
                const monster2 = monsters[j];
                
                // Values must be different for fusion
                const value1 = getCardNumericValue(monster1.card.value);
                const value2 = getCardNumericValue(monster2.card.value);
                
                if (value1 !== value2) {
                    combinations.push({
                        monster1,
                        monster2,
                        fusionStrength: value1 + value2
                    });
                }
            }
        }
        
        return combinations;
    }

    /**
     * Count active fusions for a player
     * @param {Player} player - Player to check
     * @returns {number} - Count of active fusions
     */
    countActiveFusions(player) {
        return player.monsterSpaces.filter(
            space => space.card && space.card.isFusion
        ).length;
    }

    /**
     * Break apart every fusion whose upkeep wasn't paid. Each one splits: its stronger card
     * stays in the space as a normal monster and the weaker card goes to the discard pile.
     * @param {Player} player
     * @param {number[]} keep - monster spaces of the fusions that were paid for
     * @returns {Array} - list of broken fusions {spaceIndex, fusion, kept, discarded}
     */
    breakUnpaidFusions(player, keep = []) {
        const fusionIndexes = [];
        player.monsterSpaces.forEach((space, i) => {
            if (space.card && space.card.isFusion && !keep.includes(i)) fusionIndexes.push(i);
        });

        return fusionIndexes.map(spaceIndex => {
            const fusion = player.monsterSpaces[spaceIndex].card;
            const [kept, discarded] = [...fusion.fusionCards]
                .sort((a, b) => calculateMonsterStrength(b) - calculateMonsterStrength(a));

            kept.state = CARD_STATES.ON_FIELD;
            kept.faceUp = true;
            kept.attackedThisTurn = false;
            kept.kingWeakened = false;
            player.monsterSpaces[spaceIndex].card = kept;
            this.deck.discard(discarded);
            return { spaceIndex, fusion, kept, discarded };
        });
    }
}
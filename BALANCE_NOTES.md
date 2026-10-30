# Balance Notes

A running list of rules that were chosen for now and should be tested for balance.
Add to this list whenever a rule is settled provisionally.

| # | Rule as implemented | Why it's on the list | Open questions |
|---|---------------------|----------------------|----------------|
| 1 | Monsters can attack on the turn they are summoned. | No "summoning sickness" makes a strong Setup phase immediately decisive. | Does the player who draws a big monster first snowball? Compare against a one-turn delay. |
| 2 | A fusion needs only one of its two monsters on the field; the other can come from hand. | Fusing from hand turns a single field monster into a large threat in one turn. | Should both have to be on the field? |
| 3 | Unpaid fusion upkeep breaks the fusion apart: its stronger card stays on the field, the weaker card is discarded. | Changed from destroying the whole fusion. Fusions are now lower risk, since skipping upkeep only loses the weaker card. | Is upkeep (1 monster card per fusion per turn) still worth paying, or do players let fusions break and re-fuse? |
| 4 | Big monster sacrifices: monsters only, fusions count at full strength, overpaying is allowed. | Sacrificing a fusion for a single big monster is a large value swing. | Cap overpay? Should fusions count only at the higher card's value? |
| 5 | Jack can redirect an attack into one of the attacker's own monsters. | Can destroy two of the attacker's monsters with one card when the attacker loses. | Restrict redirects to the defender's side? |
| 6 | Each time the empty deck is rebuilt from the discard pile, both players take 10 damage. | Added to stop endless games. | In simulation reshuffles were rare (a handful per few hundred games), so 10 may never matter. The Joker's own reshuffle does **not** trigger this damage. Should it? |

## Related behavior to keep an eye on

- The defender may use only one trap per attack; the attacker gets one Queen response to it (no Queen-vs-Queen chains).
- One trap of each type per player per turn.
- The first player cannot attack on turn 1.
- Simulated mirror matches (the bot's engine on both sides, no mistakes, 400 games) end about 51% first player, 46% second player, 3% draws. The first player's turn-1 attack ban roughly offsets moving first.

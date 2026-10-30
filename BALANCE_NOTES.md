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
| 6 | Rebuilding the empty deck from the discard pile deals no damage (`RESHUFFLE_DAMAGE` is 0; it was 10). | The damage was added to stop endless games and has been turned off. Without it, long games are more common. In 400 simulated games against the expert stand-in, games past 60 turns went from 7 to 27 and the longest from 90 to 191 turns (the simulator stops at 200). The median went from 20 to 22. Against the casual stand-in there was little change (one game past 60 turns, longest 115). Win rates were close either way. | Do real games stall once the deck has cycled? In simulation a stall does happen between two cautious players: in one of 400 expert games neither side attacked for the last 50 turns (each wary of the other's armed traps) and it hit the 200-turn cap. If so, bring back a smaller penalty (set `RESHUFFLE_DAMAGE`), or add another way to end a long game. |

## Related behavior to keep an eye on

- Traps chain: the player an attack is aimed at answers first, then players take turns answering until both pass in a row. Limits are only where a trap would make no sense: a King only against an attack aimed at you (Kings stack: 9 → 5 → 3), an Ace for the attacker only once their own attack is turned on them, a Jack needs somewhere to send the attack, and a Queen cancels the trap just played (a Queen can cancel a Queen). One trap of each type per player per turn. In 400 simulated games per opponent, a Jack answered by a Jack happened 75–131 times and two Kings on one attack 2–7 times; win rates stayed close to before.
- One trap of each type per player per turn.
- The first player cannot attack on turn 1.
- Simulated mirror matches (the bot's engine on both sides, no mistakes, 400 games) end about 51% first player, 46% second player, 3% draws. The first player's turn-1 attack ban roughly offsets moving first.

/**
 * Sound effects. Each event plays one of its files from assets/sfx, picked at random so repeats vary.
 * A file that is missing or can't be decoded stays silent; the game never waits on a sound.
 * See assets/sfx/CREDITS.md for where the files come from.
 */
class Sfx {
    static muted = Sfx.loadMuted();
    static _cache = new Map();   // file -> HTMLAudioElement to clone from
    static _broken = new Set();  // files that failed to load

    static loadMuted() {
        try { return localStorage.getItem('sfx-muted') === '1'; } catch (e) { return false; }
    }

    static setMuted(muted) {
        Sfx.muted = muted;
        try { localStorage.setItem('sfx-muted', muted ? '1' : '0'); } catch (e) { /* per-viewer convenience only */ }
    }

    /**
     * @param {string} name - an event in SFX_EVENTS
     */
    static play(name) {
        if (Sfx.muted) return;
        const event = SFX_EVENTS[name];
        if (!event) return;
        const files = event.files.filter(f => !Sfx._broken.has(f));
        if (files.length === 0) return;
        const file = files[Math.floor(Math.random() * files.length)];

        let base = Sfx._cache.get(file);
        if (!base) {
            base = new Audio(`assets/sfx/${file}`);
            base.preload = 'auto';
            base.addEventListener('error', () => Sfx._broken.add(file), { once: true });
            Sfx._cache.set(file, base);
        }
        // A copy per play, so quick repeats overlap instead of cutting each other off
        const sound = base.cloneNode();
        sound.volume = event.volume;
        sound.addEventListener('error', () => Sfx._broken.add(file), { once: true });
        const started = sound.play();
        if (started && typeof started.catch === 'function') started.catch(() => { /* autoplay blocked or file missing */ });
    }
}

// Event -> files in assets/sfx and their volume. Frequent sounds are low, short and soft-edged
// (spectral centroid mostly under 1 kHz); volumes were set from each file's measured loudness.
const SFX_EVENTS = {
    draw:         { files: ['draw-1.ogg', 'draw-2.ogg', 'draw-3.ogg'], volume: 0.5 }, // cards dealt into your hand
    select:       { files: ['select-1.ogg', 'select-2.ogg'], volume: 0.35 }, // picking a card in hand
    place:        { files: ['place-1.ogg', 'place-2.ogg', 'place-3.ogg'], volume: 0.4 }, // a monster lands on the field
    'trap-set':   { files: ['trap-set.ogg'], volume: 0.45 }, // a trap is set face down
    fusion:       { files: ['fusion.ogg'], volume: 0.5 },
    joker:        { files: ['joker.ogg'], volume: 0.6 },
    shuffle:      { files: ['shuffle.ogg'], volume: 0.85 }, // new game, Joker reset, deck rebuilt
    attack:       { files: ['attack-1.ogg', 'attack-2.ogg'], volume: 0.5 }, // a monster lunges
    hit:          { files: ['hit-1.ogg', 'hit-2.ogg', 'hit-3.ogg'], volume: 0.55 }, // the attack connects
    destroy:      { files: ['destroy-1.ogg', 'destroy-2.ogg', 'destroy-3.ogg'], volume: 0.6 }, // a monster is destroyed
    damage:       { files: ['damage-1.ogg', 'damage-2.ogg', 'damage-3.ogg'], volume: 0.55 }, // a player loses health
    trap:         { files: ['trap.ogg'], volume: 0.5 }, // a trap springs, usually with a prompt to answer it
    cancel:       { files: ['cancel.ogg'], volume: 0.55 }, // Queen
    redirect:     { files: ['redirect.ogg'], volume: 0.55 }, // Jack
    halve:        { files: ['halve.ogg'], volume: 0.7 }, // King
    'battle-end': { files: ['battle-end.ogg'], volume: 0.55 }, // Ace
    turn:         { files: ['turn.ogg'], volume: 0.45 }, // a new turn starts, with its banner
    phase:        { files: ['phase-1.ogg', 'phase-2.ogg'], volume: 0.4 }, // the next phase starts
    victory:      { files: ['victory.ogg'], volume: 0.7 },
    defeat:       { files: ['defeat.ogg'], volume: 0.7 }
};

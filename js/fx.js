/**
 * Visual effects layered over the board: banners, attack arrows, card motion and ghosts.
 * Purely cosmetic. Game logic only waits on the promises some of these return.
 */
class Fx {
    static reducedMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    /**
     * Fixed, click-through layer that holds arrows, ghosts and floating text
     */
    static layer() {
        let layer = document.getElementById('fx-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'fx-layer';
            layer.setAttribute('aria-hidden', 'true');
            document.body.appendChild(layer);
        }
        return layer;
    }

    /**
     * Run a Web Animation; resolves when it ends (or right away if unsupported)
     */
    static play(el, keyframes, options) {
        if (!el || typeof el.animate !== 'function') return Promise.resolve();
        return el.animate(keyframes, options).finished.catch(() => {});
    }

    static center(rect) {
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    /**
     * Show a short banner over the middle of the board. Each banner stays up for at least
     * Fx.BANNER_MIN_VISIBLE ms before the next one replaces it, so it can be read; banners
     * announced sooner wait their turn.
     * @param {Object} opts
     * @param {string} opts.text - What happened
     * @param {string} [opts.tone] - you | bot | danger | success | react | redirect | neutral
     * @param {Array<Card|{card: Card, faceDown: boolean}|string>} [opts.cards] - mini cards; strings are connectors
     * @param {number} [opts.duration] - ms before it fades
     */
    static announce(opts) {
        Fx._queue.push(opts);
        Fx._showNextBanner();
    }

    /**
     * Resolves once every queued banner has been up long enough to read.
     * The bot waits on this before its next action so the banners keep pace with the game.
     */
    static whenBannersRead() {
        if (!Fx._bannerLocked && Fx._queue.length === 0) return Promise.resolve();
        return new Promise(resolve => Fx._readWaiters.push(resolve));
    }

    static _showNextBanner() {
        if (Fx._bannerLocked) return;
        const next = Fx._queue.shift();
        if (!next) {
            Fx._readWaiters.splice(0).forEach(resolve => resolve());
            return;
        }
        Fx._renderBanner(next);
        Fx._bannerLocked = true;
        setTimeout(() => {
            Fx._bannerLocked = false;
            Fx._showNextBanner();
        }, Fx.BANNER_MIN_VISIBLE);
    }

    static _renderBanner({ text, tone = 'neutral', cards = [], duration = 1700 }) {
        const host = document.querySelector('.board-panel');
        if (!host) return;
        host.querySelector('.fx-banner')?.remove();

        const banner = document.createElement('div');
        banner.className = `fx-banner tone-${tone}`;
        banner.setAttribute('aria-hidden', 'true');
        if (cards.length) {
            const row = document.createElement('div');
            row.className = 'fx-banner-cards';
            cards.forEach(item => row.appendChild(Fx.chip(item)));
            banner.appendChild(row);
        }
        const label = document.createElement('span');
        label.className = 'fx-banner-text';
        label.textContent = text;
        banner.appendChild(label);
        host.appendChild(banner);

        Fx.play(banner, [
            { opacity: 0, transform: 'translate(-50%, -50%) scale(0.92)' },
            { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }
        ], { duration: 180, easing: 'ease-out' });

        clearTimeout(Fx._bannerTimer);
        Fx._bannerTimer = setTimeout(() => {
            Fx.play(banner, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' })
                .then(() => banner.remove());
        }, duration);
    }

    /**
     * A small card face (or back) for banners
     */
    static chip(item) {
        const el = document.createElement('span');
        if (typeof item === 'string') {
            el.className = 'fx-connector';
            el.textContent = item;
            return el;
        }
        const card = item.card || item;
        el.className = 'fx-chip';
        if (item.faceDown) {
            el.classList.add('fx-chip-back');
        } else if (getCardArt(card)) {
            el.classList.add('has-art');
            el.style.backgroundImage = `url("${getCardArt(card)}")`;
        } else {
            if (card.getSuitColor && card.getSuitColor() === 'red') el.classList.add('red');
            el.textContent = card.isFusion ? String(card.fusionStrength) : describeCard(card);
        }
        return el;
    }

    /**
     * Draw an arrow between two elements, from edge to edge
     * @returns {SVGElement|null}
     */
    static arrow(fromEl, toEl, tone = 'you', { dashed = false, breathing = false } = {}) {
        if (!fromEl || !toEl) return null;
        const a = fromEl.getBoundingClientRect();
        const b = toEl.getBoundingClientRect();
        const p = Fx.center(a);
        const q = Fx.center(b);
        const len = Math.hypot(q.x - p.x, q.y - p.y);
        if (len < 1) return null;
        const ux = (q.x - p.x) / len;
        const uy = (q.y - p.y) / len;
        // Distance from a rect's center to its edge along the arrow's direction
        const edge = (r) => Math.min(
            ux ? (r.width / 2) / Math.abs(ux) : Infinity,
            uy ? (r.height / 2) / Math.abs(uy) : Infinity
        );
        const start = edge(a) + 6;
        const end = edge(b) + 10;
        if (start + end >= len) return null;
        const x1 = p.x + ux * start, y1 = p.y + uy * start;
        const x2 = q.x - ux * end, y2 = q.y - uy * end;

        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('class', `fx-arrow tone-${tone}${breathing ? ' breathing' : ''}`);
        svg.setAttribute('width', window.innerWidth);
        svg.setAttribute('height', window.innerHeight);

        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        if (dashed) line.setAttribute('stroke-dasharray', '7 6');
        svg.appendChild(line);

        // Arrowhead: a triangle pointing along the line
        const size = 12;
        const px = -uy, py = ux;
        const head = document.createElementNS(ns, 'polygon');
        head.setAttribute('points', [
            `${x2 + ux * 4},${y2 + uy * 4}`,
            `${x2 - ux * size + px * size * 0.6},${y2 - uy * size + py * size * 0.6}`,
            `${x2 - ux * size - px * size * 0.6},${y2 - uy * size - py * size * 0.6}`
        ].join(' '));
        svg.appendChild(head);

        Fx.layer().appendChild(svg);
        (Fx._arrows = Fx._arrows || []).push(svg);

        if (!dashed && !Fx.reducedMotion()) {
            const drawn = Math.hypot(x2 - x1, y2 - y1);
            line.style.strokeDasharray = `${drawn}`;
            Fx.play(line, [{ strokeDashoffset: drawn }, { strokeDashoffset: 0 }], { duration: 260, easing: 'ease-out' });
            Fx.play(head, [{ opacity: 0 }, { opacity: 0, offset: 0.7 }, { opacity: 1 }], { duration: 300 });
        }
        return svg;
    }

    /**
     * An arrow arcing over the board from one card to another, so it stays easy to see even
     * between neighbouring cards. It leaves from the upper part of the first card and lands on
     * the upper part of the second, bowing away from the board's middle.
     */
    static curvedArrow(fromEl, toEl, tone = 'redirect', { breathing = false } = {}) {
        if (!fromEl || !toEl) return null;
        const a = fromEl.getBoundingClientRect();
        const b = toEl.getBoundingClientRect();
        const p = { x: a.left + a.width / 2, y: a.top + a.height * 0.3 };
        const q = { x: b.left + b.width / 2, y: b.top + b.height * 0.3 };
        const len = Math.hypot(q.x - p.x, q.y - p.y);
        if (len < 1) return null;
        // Bow perpendicular to the line, toward the top of the screen (or left, for a vertical line)
        let nx = -(q.y - p.y) / len, ny = (q.x - p.x) / len;
        if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
        const bow = Math.max(70, len * 0.45);
        const c = { x: (p.x + q.x) / 2 + nx * bow, y: (p.y + q.y) / 2 + ny * bow };

        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('class', `fx-arrow tone-${tone}${breathing ? ' breathing' : ''}`);
        svg.setAttribute('width', window.innerWidth);
        svg.setAttribute('height', window.innerHeight);

        // Stop short of the target so the head sits on its edge of the curve
        const tx = q.x - c.x, ty = q.y - c.y, tl = Math.hypot(tx, ty);
        const ux = tx / tl, uy = ty / tl;
        const size = 14;
        const end = { x: q.x - ux * size, y: q.y - uy * size };
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', `M ${p.x} ${p.y} Q ${c.x} ${c.y} ${end.x} ${end.y}`);
        path.setAttribute('fill', 'none');
        svg.appendChild(path);

        const px = -uy, py = ux;
        const head = document.createElementNS(ns, 'polygon');
        head.setAttribute('points', [
            `${q.x},${q.y}`,
            `${end.x + px * size * 0.6},${end.y + py * size * 0.6}`,
            `${end.x - px * size * 0.6},${end.y - py * size * 0.6}`
        ].join(' '));
        svg.appendChild(head);

        Fx.layer().appendChild(svg);
        (Fx._arrows = Fx._arrows || []).push(svg);
        return svg;
    }

    /**
     * Remove one arrow right away
     */
    static removeArrow(svg) {
        if (!svg) return;
        svg.remove();
        Fx._arrows = (Fx._arrows || []).filter(a => a !== svg);
    }

    static clearArrows() {
        (Fx._arrows || []).forEach(svg => {
            Fx.play(svg, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).then(() => svg.remove());
        });
        Fx._arrows = [];
    }

    /**
     * Attacker winds up, lunges part of the way toward its target, and springs back
     */
    static lunge(el, targetEl) {
        if (!el) return Promise.resolve();
        if (Fx.reducedMotion()) return Fx.play(el, [{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }], { duration: 300 });
        let dx = 0, dy = -14;
        if (targetEl) {
            const a = Fx.center(el.getBoundingClientRect());
            const b = Fx.center(targetEl.getBoundingClientRect());
            dx = (b.x - a.x) * 0.42;
            dy = (b.y - a.y) * 0.42;
        }
        el.classList.add('fx-lifted');
        return Fx.play(el, [
            { transform: 'translate(0, 0) scale(1)' },
            { transform: `translate(${-dx * 0.08}px, ${-dy * 0.08}px) scale(1.03)`, offset: 0.3 },
            { transform: `translate(${dx}px, ${dy}px) scale(1.07)`, offset: 0.62, easing: 'ease-out' },
            { transform: 'translate(0, 0) scale(1)' }
        ], { duration: 560, easing: 'ease-in' }).then(() => el.classList.remove('fx-lifted'));
    }

    /**
     * Shake an element with a colored ring, for hits and damage
     */
    static impact(el, tone = 'danger') {
        if (!el) return Promise.resolve();
        el.classList.add(`fx-ring-${tone}`);
        const done = () => el.classList.remove(`fx-ring-${tone}`);
        if (Fx.reducedMotion()) return delay(350).then(done);
        return Fx.play(el, [
            { transform: 'translateX(0)' },
            { transform: 'translateX(-6px)' },
            { transform: 'translateX(5px)' },
            { transform: 'translateX(-3px)' },
            { transform: 'translateX(0)' }
        ], { duration: 360, easing: 'ease-out' }).then(done);
    }

    /**
     * A brief glow, e.g. on the phase tracker when the phase changes
     */
    static pulse(el, tone = 'you') {
        if (!el) return Promise.resolve();
        el.classList.add(`fx-ring-${tone}`);
        return delay(600).then(() => el.classList.remove(`fx-ring-${tone}`));
    }

    /**
     * Text that rises from an element and fades, such as "-5" over a health total
     */
    static floatText(anchorEl, text, tone = 'danger') {
        if (!anchorEl) return;
        const r = anchorEl.getBoundingClientRect();
        const el = document.createElement('span');
        el.className = `fx-float tone-${tone}`;
        el.textContent = text;
        el.style.left = `${r.left + r.width / 2}px`;
        el.style.top = `${r.top}px`;
        Fx.layer().appendChild(el);
        const rise = Fx.reducedMotion() ? 0 : 34;
        Fx.play(el, [
            { opacity: 0, transform: 'translate(-50%, 0) scale(0.9)' },
            { opacity: 1, transform: 'translate(-50%, -8px) scale(1.1)', offset: 0.15 },
            { opacity: 1, transform: `translate(-50%, ${-rise * 0.7}px) scale(1)`, offset: 0.7 },
            { opacity: 0, transform: `translate(-50%, ${-rise}px) scale(1)` }
        ], { duration: 1300, easing: 'ease-out' }).then(() => el.remove());
    }

    /**
     * Animate a card that just left a board slot, using a copy at its old position
     * @param {HTMLElement} cardEl - card element to show (a copy of the old one, or a revealed face)
     * @param {DOMRect} rect - the slot's position
     * @param {string} slotClass - 'monster-space' or 'trap-space', so the card keeps its slot styling
     * @param {'destroy'|'leave'|'reveal'} kind
     */
    static ghost(cardEl, rect, slotClass, kind = 'leave') {
        if (!cardEl || !rect || rect.width === 0) return Promise.resolve();
        const wrap = document.createElement('div');
        wrap.className = `fx-ghost ${slotClass} fx-${kind}`;
        Object.assign(wrap.style, {
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`
        });
        cardEl.classList.remove('selected', 'can-attack', 'disabled');
        wrap.appendChild(cardEl);
        Fx.layer().appendChild(wrap);

        const reduced = Fx.reducedMotion();
        const frames = {
            destroy: reduced
                ? [{ opacity: 1 }, { opacity: 0 }]
                : [
                    { transform: 'scale(1) rotate(0)', filter: 'brightness(1)', opacity: 1 },
                    { transform: 'scale(1.06) rotate(-2deg)', filter: 'brightness(1.35)', opacity: 1, offset: 0.18 },
                    { transform: 'scale(1.02) rotate(2deg)', opacity: 1, offset: 0.32 },
                    { transform: 'scale(0.5) rotate(18deg) translateY(16px)', filter: 'brightness(0.8)', opacity: 0 }
                ],
            leave: [
                { opacity: 1, transform: 'scale(1)' },
                { opacity: 0, transform: reduced ? 'scale(1)' : 'scale(0.9) translateY(8px)' }
            ],
            reveal: reduced
                ? [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
                : [
                    { transform: 'perspective(600px) rotateY(90deg)', opacity: 0.5 },
                    { transform: 'perspective(600px) rotateY(0deg) scale(1.1)', opacity: 1, offset: 0.16 },
                    { transform: 'perspective(600px) scale(1.1)', opacity: 1, offset: 0.8 },
                    { transform: 'perspective(600px) translateY(-20px) scale(1)', opacity: 0 }
                ]
        }[kind];
        const duration = { destroy: 750, leave: 380, reveal: 1600 }[kind];
        return Fx.play(wrap, frames, { duration, easing: 'ease-in-out', fill: 'forwards' }).then(() => wrap.remove());
    }

    /**
     * A card that just arrived somewhere: drops in from slightly above
     * @param {HTMLElement} el
     * @param {'place'|'fusion'|'draw'} kind
     * @param {number} [wait] - ms to wait first, for staggering
     */
    static enter(el, kind = 'place', wait = 0) {
        if (!el) return Promise.resolve();
        if (kind === 'fusion') el.classList.add('fx-ring-fusion');
        // Uses the individual translate/scale properties so it composes with any
        // transform the card already has (such as its angle in the hand fan)
        const reduced = Fx.reducedMotion();
        const from = reduced ? { translate: '0 0', scale: '1' }
            : kind === 'draw' ? { translate: '0 24px', scale: '0.96' } : { translate: '0 -18px', scale: '1.08' };
        return Fx.play(el, [
            { opacity: 0, ...from },
            { opacity: 1, translate: '0 0', scale: '1' }
        ], { duration: kind === 'fusion' ? 480 : 320, delay: wait, easing: 'cubic-bezier(.2,.8,.3,1.2)', fill: 'backwards' })
            .then(() => delay(kind === 'fusion' ? 500 : 0))
            .then(() => el.classList.remove('fx-ring-fusion'));
    }
}

// The shortest time a banner stays up before the next one may replace it
Fx.BANNER_MIN_VISIBLE = 750;
Fx._queue = [];
Fx._readWaiters = [];
Fx._bannerLocked = false;

window.Fx = Fx;

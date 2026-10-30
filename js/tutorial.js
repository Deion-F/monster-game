/**
 * Tutorial manager for game rules
 */
class TutorialManager {
    /**
     * Initialize tutorial pages
     */
    static initializeTutorial() {
        const tutorialPages = document.getElementById('tutorial-pages');
        if (!tutorialPages) {
            this.pages = [];
            return;
        }

        // Create tutorial pages
        this.pages = [
            {
                title: "Game Overview",
                content: `
                    <p>Welcome to Monster Card Battle, a strategic card game where you must defeat your opponent by reducing their health to zero.</p>
                    <p>The game uses a standard 52-card deck plus 2 Jokers. Each player starts with 40 health and a hand of 5 cards; your first draw brings it to 6.</p>
                    <h3>The Board</h3>
                    <ul>
                        <li>Each player has 3 Monster Spaces (for summoning monsters)</li>
                        <li>Each player has 3 Trap Spaces (for setting traps face-down)</li>
                        <li>Players draw from the same deck</li>
                        <li>Used/destroyed cards go to a shared Discard Pile</li>
                        <li>When the deck runs out, the discard pile is shuffled into a new deck and both players take 10 damage</li>
                    </ul>
                `
            },
            {
                title: "Card Types",
                content: `
                    <h3>Normal Monsters (2-7)</h3>
                    <p>Play directly to monster spaces without sacrifice. Strength equals card value.</p>
                    
                    <h3>Big Monsters (8-10)</h3>
                    <p>Sacrifice monsters from your hand or field with total value ≥ the big monster's value. Fusions count at their full strength, and you may overpay. Only monsters can be sacrificed.</p>
                    
                    <h3>Traps (A, J, Q, K)</h3>
                    <p>Traps are set face-down and arm at the end of the turn you set them. Each player can use one trap of each type per turn.</p>
                    <ul>
                        <li><strong>Ace:</strong> End the opponent's Battle Phase immediately</li>
                        <li><strong>Jack:</strong> Redirect an attack to any other monster, including the attacker's own</li>
                        <li><strong>Queen:</strong> Cancel an opponent's trap as it activates (not Jokers)</li>
                        <li><strong>King:</strong> Halve the attacking monster's strength (round up)</li>
                    </ul>
                    
                    <h3>Joker</h3>
                    <p>Setup Phase only. Destroys all cards on the field, discards both hands, shuffles the discard pile into the deck, and both players draw 5 cards. Playing it skips your Battle Phase this turn, and the Joker is removed from the match.</p>
                `
            },
            {
                title: "Turn Structure",
                content: `
                    <h3>1. Draw Phase</h3>
                    <p>Draw 1 card (or 5 if your hand is empty). Maximum hand size is 10 cards; discard down if you go over.</p>
                    
                    <h3>2. Setup Phase</h3>
                    <p>Play monsters, set traps, create fusions and play a Joker.</p>
                    
                    <h3>3. Battle Phase</h3>
                    <p>Attack with your monsters, including ones summoned this turn. Each monster can attack once. The first player cannot attack on their first turn.</p>
                    
                    <h3>4. End Phase</h3>
                    <p>Pay upkeep for fusions. Traps you set this turn become armed.</p>
                `
            },
            {
                title: "Combat & Damage",
                content: `
                    <h3>Monster vs Monster</h3>
                    <p>Compare strength values. The weaker monster is destroyed, and its controller takes damage equal to the difference in strength. This can be the attacker.</p>
                    <p>If strengths are equal, both monsters are destroyed with no damage.</p>
                    
                    <h3>Direct Attack</h3>
                    <p>If the opponent has no monsters, you can attack directly. They take damage equal to the attacking monster's strength.</p>
                    
                    <h3>Traps in Combat</h3>
                    <p>When attacked, the defender may respond with one armed trap. The attacker may then cancel that trap with an armed Queen. There is no time limit to respond.</p>
                `
            },
            {
                title: "Fusion System",
                content: `
                    <h3>Creating Fusions</h3>
                    <p>Fuse two monsters with different values; at least one must be on your field. Fusion strength equals the sum of both.</p>
                    <p>A fusion occupies one monster space and holds exactly 2 cards; it can't be fused again.</p>
                    
                    <h3>Fusion Upkeep</h3>
                    <p>During your End Phase, sacrifice 1 monster card (from hand or field) per fusion. Each fusion you don't pay for breaks apart: its stronger card stays on the field as a normal monster and the weaker card is discarded.</p>
                    
                    <h3>Victory Condition</h3>
                    <p>Reduce your opponent's health from 40 to 0. If both players reach 0 at the same time, the game is a draw.</p>
                `
            }
        ];
        
        // Create page elements
        // Clear any existing
        tutorialPages.innerHTML = '';

        this.pages.forEach((page, index) => {
            const pageElement = document.createElement('div');
            pageElement.classList.add('tutorial-page');
            pageElement.id = `tutorial-page-${index}`;

            pageElement.innerHTML = `
                <h3>${page.title}</h3>
                ${page.content}
            `;

            tutorialPages.appendChild(pageElement);
        });

        // Show first page if any
        this.currentPage = 0;
        if (this.pages.length > 0) this.showPage(this.currentPage);
    }
    
    /**
     * Show a specific tutorial page
     * @param {number} pageIndex - Page index to show
     */
    static showPage(pageIndex) {
        // Hide all pages
        document.querySelectorAll('.tutorial-page').forEach(page => page.classList.remove('active'));

        const pageEl = document.getElementById(`tutorial-page-${pageIndex}`);
        if (pageEl) pageEl.classList.add('active');

        // Update page indicator safely
        const indicator = document.getElementById('tutorial-page-indicator');
        if (indicator) indicator.textContent = `Page ${pageIndex + 1}/${this.pages.length}`;

        // Update navigation buttons safely
        const prevBtn = document.getElementById('prev-tutorial');
        const nextBtn = document.getElementById('next-tutorial');
        if (prevBtn) prevBtn.disabled = (pageIndex === 0);
        if (nextBtn) nextBtn.disabled = (pageIndex === this.pages.length - 1 || this.pages.length === 0);
    }
    
    /**
     * Show next page
     */
    static showNextPage() {
        if (this.currentPage < this.pages.length - 1) {
            this.currentPage++;
            this.showPage(this.currentPage);
        }
    }
    
    /**
     * Show previous page
     */
    static showPreviousPage() {
        if (this.currentPage > 0) {
            this.currentPage--;
            this.showPage(this.currentPage);
        }
    }
}
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
                    <p>The game uses a standard 52-card deck plus 2 Jokers. Each player starts with 40 health and a hand of 6 cards.</p>
                    <h3>The Board</h3>
                    <ul>
                        <li>Each player has 3 Monster Spaces (for summoning monsters)</li>
                        <li>Each player has 3 Trap Spaces (for setting traps)</li>
                        <li>Players draw from the same deck</li>
                        <li>Used/destroyed cards go to a shared Discard Pile</li>
                    </ul>
                `
            },
            {
                title: "Card Types",
                content: `
                    <h3>Normal Monsters (2-7)</h3>
                    <p>Play directly to monster spaces without sacrifice. Strength equals card value.</p>
                    
                    <h3>Big Monsters (8-10)</h3>
                    <p>Require sacrificing cards from hand/field with total value ≥ monster's value. Strength equals card value.</p>
                    
                    <h3>Traps (A, J, Q, K)</h3>
                    <ul>
                        <li><strong>Ace:</strong> End opponent's Battle Phase immediately</li>
                        <li><strong>Jack:</strong> Redirect an attack to any other monster</li>
                        <li><strong>Queen:</strong> Cancel any trap (except Joker)</li>
                        <li><strong>King:</strong> Halve attacking monster's strength (round up)</li>
                    </ul>
                    
                    <h3>Joker</h3>
                    <p>Reset the entire board - destroy all cards on field, discard all hands, shuffle discard into deck, both players draw 5 cards. Must be played at start of Setup Phase.</p>
                `
            },
            {
                title: "Turn Structure",
                content: `
                    <h3>1. Draw Phase</h3>
                    <p>Draw 1 card (or 5 if your hand is empty). Maximum hand size is 10 cards.</p>
                    
                    <h3>2. Setup Phase</h3>
                    <p>Play monsters, set traps, create fusions. Joker must be played first if using it.</p>
                    
                    <h3>3. Battle Phase</h3>
                    <p>Attack with your monsters. Each monster can attack once. First player cannot attack on their first turn.</p>
                    
                    <h3>4. End Phase</h3>
                    <p>Pay upkeep for fusions by sacrificing cards. Traps placed this turn become active.</p>
                `
            },
            {
                title: "Combat & Damage",
                content: `
                    <h3>Monster vs Monster</h3>
                    <p>Compare strength values. Higher strength wins, weaker monster is destroyed, and defender takes damage equal to the difference in strength.</p>
                    <p>If strengths are equal, both monsters are destroyed with no damage.</p>
                    
                    <h3>Direct Attack</h3>
                    <p>If opponent has no monsters, you can attack directly. Defender takes damage equal to attacking monster's strength.</p>
                    
                    <h3>Traps in Combat</h3>
                    <p>Traps can respond to attacks. Defender reveals traps first, then attacker can respond with their own traps.</p>
                `
            },
            {
                title: "Fusion System",
                content: `
                    <h3>Creating Fusions</h3>
                    <p>Combine two monsters on your field with different values. Fusion strength equals sum of both monsters.</p>
                    <p>Fusions occupy one monster space and can only contain 2 cards maximum.</p>
                    
                    <h3>Fusion Upkeep</h3>
                    <p>During End Phase, sacrifice 1 monster card per active fusion. If you cannot pay, the fusion breaks - lower-value card is destroyed, and higher-value card remains.</p>
                    
                    <h3>Victory Condition</h3>
                    <p>Reduce your opponent's health from 40 to 0 through strategic monster battles, trap cards, and powerful fusions!</p>
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
document.addEventListener('DOMContentLoaded', () => {
    // --- Setup ---
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    const startPauseBtn = document.getElementById('startPauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    const populationCountSpan = document.getElementById('populationCount');
    const maxAgeSpan = document.getElementById('maxAge');
    const avgEnergySpan = document.getElementById('avgEnergy');
    const speedSlider = document.getElementById('speedSlider');
    const lifespanSlider = document.getElementById('lifespanSlider');
    const mutationSlider = document.getElementById('mutationSlider');
    const foodSpawnSlider = document.getElementById('foodSpawnSlider');

    // --- Game Configuration ---
    const CONFIG = {
        RESOLUTION: 10,
        CANVAS_WIDTH: 800,
        CANVAS_HEIGHT: 600,
        FOOD_SPAWN_PROBABILITY: 0.05,
        INITIAL_ORGANISMS: 15,
        LIFESPAN_MULTIPLIER: 200,
        REPRODUCTION_ENERGY_COST: 5,
        MUTATION_RATE: 0.05, // 5%
        COLORS: {
            BACKGROUND: '#2a2a2a',
            FOOD: '#81d2c7', // Grayish-blue for food
        }
    };

    const COLS = CONFIG.CANVAS_WIDTH / CONFIG.RESOLUTION;
    const ROWS = CONFIG.CANVAS_HEIGHT / CONFIG.RESOLUTION;
    canvas.width = CONFIG.CANVAS_WIDTH;
    canvas.height = CONFIG.CANVAS_HEIGHT;

    // --- Game State ---
    let grid;
    let organisms = [];
    let isPaused = true;
    let animationFrameId;
    let lastFrameTime = 0;
    let fps = 30;

    // --- Grid Entity Types ---
    const ENTITY_TYPE = {
        EMPTY: 0,
        FOOD: 1,
        ORGANISM_CELL: 2
    };

    // --- Organism Cell Types ---
    const CELL_TYPES = {
        MOUTH: { name: 'Mouth', color: '#d14d72' }, // Orange-Red
        PRODUCER: { name: 'Producer', color: '#66a39b' }, // Green
        MOVER: { name: 'Mover', color: '#416788' }, // Light Blue
        KILLER: { name: 'Killer', color: '#ff4d4d' }, // Bright Red
        ARMOR: { name: 'Armor', color: '#c0e5c8' }, // Purple-ish
    };

    // --- Cell Class (part of an organism) ---
    class Cell {
        constructor(type, relativeX = 0, relativeY = 0) {
            this.type = type;
            this.relativeX = relativeX;
            this.relativeY = relativeY;
        }
    }

    // --- Organism Class ---
    class Organism {
        constructor(x, y, cells, parent = null) {
            this.x = x;
            this.y = y;
            this.cells = cells;
            this.energy = 5;
            this.age = 0;
            this.health = this.cells.length;
            this.lifespan = this.cells.length * CONFIG.LIFESPAN_MULTIPLIER;
            this.speciesId = parent ? parent.speciesId : `hsl(${Math.random() * 360}, 70%, 70%)`;

            if (parent && Math.random() < CONFIG.MUTATION_RATE) {
                this.mutate();
            }
        }

        update() {
            this.age++;
            this.energy -= 0.01; // Metabolic cost

            if (this.age > this.lifespan || this.energy <= 0 || this.health <= 0) {
                this.die();
                return;
            }

            this.performCellFunctions();

            const reproductionCost = this.cells.length + CONFIG.REPRODUCTION_ENERGY_COST;
            if (this.energy >= reproductionCost) {
                this.reproduce();
            }
        }

        performCellFunctions() {
            let hasMover = false;
            this.cells.forEach(cell => {
                const absoluteX = (this.x + cell.relativeX + COLS) % COLS;
                const absoluteY = (this.y + cell.relativeY + ROWS) % ROWS;

                if (cell.type === CELL_TYPES.MOUTH) {
                    this.findAndEat(absoluteX, absoluteY);
                } else if (cell.type === CELL_TYPES.PRODUCER) {
                    this.produceFood(absoluteX, absoluteY);
                } else if (cell.type === CELL_TYPES.KILLER) {
                    this.attack(absoluteX, absoluteY);
                }

                if (cell.type === CELL_TYPES.MOVER) {
                    hasMover = true;
                }
            });

            if (hasMover) {
                this.move();
            }
        }

        findAndEat(mouthX, mouthY) {
            for (let i = -1; i < 2; i++) {
                for (let j = -1; j < 2; j++) {
                    if (i === 0 && j === 0) continue;
                    const checkX = (mouthX + i + COLS) % COLS;
                    const checkY = (mouthY + j + ROWS) % ROWS;
                    if (grid[checkX][checkY] && grid[checkX][checkY].type === ENTITY_TYPE.FOOD) {
                        this.energy += 3;
                        grid[checkX][checkY] = { type: ENTITY_TYPE.EMPTY };
                        return;
                    }
                }
            }
        }

        produceFood(producerX, producerY) {
            if (Math.random() < 0.01) {
                for (let i = -1; i < 2; i++) {
                    for (let j = -1; j < 2; j++) {
                        if (i === 0 && j === 0) continue;
                        const checkX = (producerX + i + COLS) % COLS;
                        const checkY = (producerY + j + ROWS) % ROWS;
                        if (grid[checkX][checkY].type === ENTITY_TYPE.EMPTY) {
                            grid[checkX][checkY] = { type: ENTITY_TYPE.FOOD };
                            return;
                        }
                    }
                }
            }
        }

        attack(killerX, killerY) {
            for (let i = -1; i < 2; i++) {
                for (let j = -1; j < 2; j++) {
                    if (i === 0 && j === 0) continue;
                    const checkX = (killerX + i + COLS) % COLS;
                    const checkY = (killerY + j + ROWS) % ROWS;
                    const target = grid[checkX][checkY];
                    if (target && target.type === ENTITY_TYPE.ORGANISM_CELL && target.owner !== this) {
                        target.owner.takeDamage(1);
                    }
                }
            }
        }

        takeDamage(amount) {
            const hasArmor = this.cells.some(c => c.type === CELL_TYPES.ARMOR);
            if (!hasArmor) {
                this.health -= amount;
            }
        }

        move() {
            const moveX = Math.floor(Math.random() * 3) - 1;
            const moveY = Math.floor(Math.random() * 3) - 1;
            const newX = (this.x + moveX + COLS) % COLS;
            const newY = (this.y + moveY + ROWS) % ROWS;

            const canMove = this.cells.every(cell => {
                const targetX = (newX + cell.relativeX + COLS) % COLS;
                const targetY = (newY + cell.relativeY + ROWS) % ROWS;
                const targetCell = grid[targetX][targetY];
                return targetCell.type === ENTITY_TYPE.EMPTY || targetCell.owner === this;
            });

            if (canMove) {
                this.cells.forEach(cell => {
                    const oldX = (this.x + cell.relativeX + COLS) % COLS;
                    const oldY = (this.y + cell.relativeY + ROWS) % ROWS;
                    grid[oldX][oldY] = { type: ENTITY_TYPE.EMPTY };
                });

                this.x = newX;
                this.y = newY;
                this.cells.forEach(cell => {
                    const currentX = (this.x + cell.relativeX + COLS) % COLS;
                    const currentY = (this.y + cell.relativeY + ROWS) % ROWS;
                    grid[currentX][currentY] = { type: ENTITY_TYPE.ORGANISM_CELL, owner: this, cellRef: cell };
                });
            }
        }

        reproduce() {
            this.energy -= (this.cells.length + CONFIG.REPRODUCTION_ENERGY_COST);
            for (let i = -1; i < 2; i++) {
                for (let j = -1; j < 2; j++) {
                    if (i === 0 && j === 0) continue;
                    const newX = (this.x + i + COLS) % COLS;
                    const newY = (this.y + j + ROWS) % ROWS;

                    const childCells = this.cells.map(c => new Cell(c.type, c.relativeX, c.relativeY));

                    const canPlace = childCells.every(cell => {
                        const targetX = (newX + cell.relativeX + COLS) % COLS;
                        const targetY = (newY + cell.relativeY + ROWS) % ROWS;
                        return grid[targetX][targetY].type === ENTITY_TYPE.EMPTY;
                    });

                    if (canPlace) {
                        const newOrganism = new Organism(newX, newY, childCells, this);
                        organisms.push(newOrganism);
                        newOrganism.cells.forEach(cell => {
                            const childX = (newX + cell.relativeX + COLS) % COLS;
                            const childY = (newY + cell.relativeY + ROWS) % ROWS;
                            grid[childX][childY] = { type: ENTITY_TYPE.ORGANISM_CELL, owner: newOrganism, cellRef: cell };
                        });
                        return;
                    }
                }
            }
        }

        mutate() {
            const mutationType = Math.random();
            if (mutationType < 0.5) { // Add cell
                const randomCell = this.cells[Math.floor(Math.random() * this.cells.length)];
                const newPos = { x: randomCell.relativeX + Math.floor(Math.random() * 3) - 1, y: randomCell.relativeY + Math.floor(Math.random() * 3) - 1 };
                const posExists = this.cells.some(c => c.relativeX === newPos.x && c.relativeY === newPos.y);
                if (!posExists) {
                    const cellTypes = Object.values(CELL_TYPES);
                    const randomType = cellTypes[Math.floor(Math.random() * cellTypes.length)];
                    this.cells.push(new Cell(randomType, newPos.x, newPos.y));
                }
            } else if (mutationType < 0.8) { // Change cell
                const randomCell = this.cells[Math.floor(Math.random() * this.cells.length)];
                const cellTypes = Object.values(CELL_TYPES);
                randomCell.type = cellTypes[Math.floor(Math.random() * cellTypes.length)];
            } else { // Remove cell
                if (this.cells.length > 1) {
                    this.cells.splice(Math.floor(Math.random() * this.cells.length), 1);
                }
            }
            this.health = this.cells.length;
            this.lifespan = this.cells.length * CONFIG.LIFESPAN_MULTIPLIER;
            this.speciesId = `hsl(${Math.random() * 360}, 70%, 70%)`;
        }

        die() {
            this.cells.forEach(cell => {
                const absoluteX = (this.x + cell.relativeX + COLS) % COLS;
                const absoluteY = (this.y + cell.relativeY + ROWS) % ROWS;
                grid[absoluteX][absoluteY] = { type: ENTITY_TYPE.FOOD };
            });
            this.health = 0; // Mark for removal
        }
    }

    // --- Core Functions ---

    function buildGrid() {
        return new Array(COLS).fill(null)
            .map(() => new Array(ROWS).fill(null).map(() => ({ type: ENTITY_TYPE.EMPTY })));
    }

    function setup() {
        grid = buildGrid();
        organisms = [];
        for (let i = 0; i < CONFIG.INITIAL_ORGANISMS; i++) {
            const x = Math.floor(Math.random() * COLS);
            const y = Math.floor(Math.random() * ROWS);
            const startCells = [new Cell(CELL_TYPES.MOUTH, 0, 0), new Cell(CELL_TYPES.MOVER, 0, 1)];
            const canPlace = startCells.every(cell => {
                const checkX = (x + cell.relativeX + COLS) % COLS;
                const checkY = (y + cell.relativeY + ROWS) % ROWS;
                return grid[checkX][checkY].type === ENTITY_TYPE.EMPTY;
            });

            if (canPlace) {
                const org = new Organism(x, y, startCells);
                organisms.push(org);
                org.cells.forEach(cell => {
                    const cellX = (x + cell.relativeX + COLS) % COLS;
                    const cellY = (y + cell.relativeY + ROWS) % ROWS;
                    grid[cellX][cellY] = { type: ENTITY_TYPE.ORGANISM_CELL, owner: org, cellRef: cell };
                });
            }
        }
    }

    function drawGrid() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let col = 0; col < COLS; col++) {
            for (let row = 0; row < ROWS; row++) {
                const gridEntity = grid[col][row];

                ctx.beginPath();
                ctx.rect(col * CONFIG.RESOLUTION, row * CONFIG.RESOLUTION, CONFIG.RESOLUTION, CONFIG.RESOLUTION);

                switch (gridEntity.type) {
                    case ENTITY_TYPE.FOOD:
                        ctx.fillStyle = CONFIG.COLORS.FOOD;
                        break;
                    case ENTITY_TYPE.ORGANISM_CELL:
                        ctx.fillStyle = gridEntity.owner.speciesId;
                        break;
                    default:
                        ctx.fillStyle = CONFIG.COLORS.BACKGROUND;
                }
                ctx.fill();

                // Draw cell type indicator
                if (gridEntity.type === ENTITY_TYPE.ORGANISM_CELL) {
                    if (gridEntity.cellRef) {
                        ctx.fillStyle = gridEntity.cellRef.type.color;
                        ctx.fillRect(col * CONFIG.RESOLUTION + 2, row * CONFIG.RESOLUTION + 2, CONFIG.RESOLUTION - 4, CONFIG.RESOLUTION - 4);
                    }
                }
            }
        }
    }

    function update() {
        for (let i = organisms.length - 1; i >= 0; i--) {
            organisms[i].update();
            if (organisms[i].health <= 0) {
                organisms.splice(i, 1);
            }
        }

        if (Math.random() < CONFIG.FOOD_SPAWN_PROBABILITY) {
            const x = Math.floor(Math.random() * COLS);
            const y = Math.floor(Math.random() * ROWS);
            if (grid[x][y].type === ENTITY_TYPE.EMPTY) {
                grid[x][y] = { type: ENTITY_TYPE.FOOD };
            }
        }
    }

    function updateStats() {
        populationCountSpan.textContent = organisms.length;
        if (organisms.length > 0) {
            const maxAge = Math.max(...organisms.map(o => o.age));
            const totalEnergy = organisms.reduce((sum, o) => sum + o.energy, 0);
            maxAgeSpan.textContent = maxAge;
            avgEnergySpan.textContent = (totalEnergy / organisms.length).toFixed(2);
        } else {
            maxAgeSpan.textContent = 0;
            avgEnergySpan.textContent = '0.00';
        }
    }

    function gameLoop(timestamp) {
        if (isPaused) {
            return; // Stop the loop if paused
        }

        animationFrameId = requestAnimationFrame(gameLoop);

        const elapsed = timestamp - lastFrameTime;
        if (elapsed > 1000 / fps) {
            lastFrameTime = timestamp;
            update();
            updateStats();
            drawGrid();
        }
    }

    // --- Event Listeners ---
    startPauseBtn.addEventListener('click', () => {
        if (isPaused) {
            isPaused = false;
            startPauseBtn.textContent = 'Pause';
            lastFrameTime = performance.now();
            requestAnimationFrame(gameLoop); // Restart the loop
        } else {
            isPaused = true;
            startPauseBtn.textContent = 'Start';
            cancelAnimationFrame(animationFrameId); // Stop the loop
        }
    });

    resetBtn.addEventListener('click', () => {
        isPaused = true;
        startPauseBtn.textContent = 'Start';
        cancelAnimationFrame(animationFrameId); // Ensure any old loop is stopped
        setup();
        drawGrid();
        updateStats();
    });

    speedSlider.addEventListener('input', (e) => {
        fps = parseInt(e.target.value, 10);
    });
    lifespanSlider.addEventListener('input', (e) => {
        CONFIG.LIFESPAN_MULTIPLIER = parseInt(e.target.value, 10);
    });
    mutationSlider.addEventListener('input', (e) => {
        CONFIG.MUTATION_RATE = parseInt(e.target.value, 10) / 100;
    });
    foodSpawnSlider.addEventListener('input', (e) => {
        CONFIG.FOOD_SPAWN_PROBABILITY = parseFloat(e.target.value);
    });

    // Tab navigation
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            tabContents.forEach(content => {
                content.id === tabId ? content.classList.add('active') : content.classList.remove('active');
            });
        });
    });

    // --- Initial State ---
    resetBtn.click();
});
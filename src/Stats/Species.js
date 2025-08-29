const CellStates = require("../Organism/Cell/CellStates");
let FossilRecord = undefined; // workaround to a circular dependency problem
const getFossilRecord = () => {
    if (!FossilRecord)
        FossilRecord = require("./FossilRecord");
    return FossilRecord;
}

class Species {
    constructor(anatomy, ancestor, start_tick) {
        this.anatomy = anatomy;
        this.ancestor = ancestor; // eventually need to garbage collect ancestors to avoid memory problems
        this.population = 1;
        this.cumulative_pop = 1;
        this.start_tick = start_tick;
        this.end_tick = -1;
        this.name = Math.random().toString(36).slice(2, 12);
        this.extinct = false;
        this.calcAnatomyDetails();
    }

    calcAnatomyDetails() {
        if (!this.anatomy) return;

        // Initialize counts for all living cell types to 0
        const initialCounts = Object.fromEntries(
            CellStates.living.map(c => [c.name, 0])
        );

        // Use reduce to count the cells in the anatomy for a more functional approach
        this.cell_counts = this.anatomy.cells.reduce((counts, cell) => {
            // Ensure we only count valid, known cell types
            if (counts.hasOwnProperty(cell.state.name)) {
                counts[cell.state.name]++;
            }
            return counts;
        }, initialCounts);
    }

    addPop() {
        this.population++;
        this.cumulative_pop++;
    }

    decreasePop() {
        this.population--;
        if (this.population <= 0) {
            this.extinct = true;
            getFossilRecord().fossilize(this);
        }
    }

    lifespan() {
        return this.end_tick - this.start_tick;
    }
}

module.exports = Species;
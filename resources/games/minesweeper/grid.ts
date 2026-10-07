import { Vector } from "matter";

class Cell {
    visible: boolean;
    size: integer = 30;
    pos: Vector = new Vector();
    label: boolean = false;
    marked: boolean = false;

    constructor(visible: boolean) {
        this.visible = visible;
    }

    draw () {
        if (this.visible) {

        }
    }

}

class Grid {

    cells: Cell[][] = [];
    // search_dirs: [number, number][] = [[0,-1],[-1,-1],[-1,0],[-1,1],[0,1],[1,1],[1,0],[1,-1]];
    search_dirs = [
        [0, -1], [-1, -1], [-1, 0], [-1, 1],
        [0, 1], [1, 1], [1, 0], [1, -1]
    ] as const; // make search_dirs a tuple with exactly eight coordinate pairs

    constructor(){

    }

    draw (){

    }
}


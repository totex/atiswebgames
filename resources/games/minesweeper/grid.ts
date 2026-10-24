import Phaser, { Scene, GameObjects } from 'phaser';
import conf from './config';


class Cell {
    visible: boolean = false;
    size: number = 30;
    radius: number = this.size / 2;
    pos: Phaser.Math.Vector2;
    label: boolean = false;
    marked: boolean = false;
    mine: boolean = false;
    show_mine: boolean = false;
    explosion: boolean = false;
    mine_counter: number = 0;
    private labelObject?: GameObjects.Text;
    private mineCircle?: GameObjects.GameObject;

    constructor(mine: boolean, pos: Phaser.Math.Vector2) {
        this.mine = mine;
        this.pos = pos;
    }

    add(scene: Scene) {
        // if (this.show_mine) {
        //     scene.add.circle(this.pos.x, this.pos.y, this.radius, 0xff0000);
        // }

        if (this.label && !this.labelObject) {
            this.labelObject = scene.add.text(
                this.pos.x - 3.75,
                this.pos.y - 7.5,
                String(this.mine_counter),
                {
                    color: '#FFF',
                    fontFamily: 'monospace',
                    fontSize: '15px'
                }
            );
        }

        // if (this.label) {
        //     // TODO - precalculate these magic numbers: 3.75, 7.5
        //     scene.add.text(this.pos.x-3.75, this.pos.y-7.5, String(this.mine_counter), {
        //         color: '#FFF',
        //         fontFamily: 'monospace',
        //         fontSize: '15px'
        //     });
        // }
    }

    updateVisual(scene: Scene): void {
        if (this.label) {
            if (!this.labelObject) {
                this.add(scene);
            } else {
                this.labelObject.setText(String(this.mine_counter));
            }
        }

        if (this.mine && this.show_mine ) {
            if (!this.mineCircle) {
                    this.mineCircle = scene.add.circle(
                    this.pos.x,
                    this.pos.y,
                    6,          // Radius
                    0xff0000    // Red
                ); 
            }
        } else {
            if (this.mineCircle) {
                this.mineCircle.destroy();
                this.mineCircle = undefined;
            }
        }
    }

}

export class Grid {

    cells: Cell[][] = [];
    // search_dirs: [number, number][] = [[0,-1],[-1,-1],[-1,0],[-1,1],[0,1],[1,1],[1,0],[1,-1]];
    search_dirs = [
        [0, -1], [-1, -1], [-1, 0], [-1, 1],
        [0, 1], [1, 1], [1, 0], [1, -1]
    ] as const; // make search_dirs a tuple with exactly eight coordinate pairs
    width: number = 30;
    height: number = 30;

    scene: Scene;

    constructor(width: number, height: number, scene: Scene){
        this.scene = scene;
        // for (let x = 0; x < width; x++) {
        //     this.cells[x] = [];
        //     for (let y = 0; y < height; y++) {
        //         let radius = conf.circle_radius;
        //         let mine = this.randomMines();
        //         this.cells[x][y] = new Cell(mine, new Phaser.Math.Vector2(
        //             x * conf.cell_pixel_width + radius, 
        //             y * conf.cell_pixel_height + radius
        //         ));
        //     }
        // }

        for (let y = 0; y < height; y++) {
            this.cells[y] = [];
            for (let x = 0; x < width; x++) {
                let radius = conf.circle_radius;
                let mine = this.randomMines();
                this.cells[y][x] = new Cell(mine, new Phaser.Math.Vector2(
                    x * conf.cell_pixel_width + radius, 
                    y * conf.cell_pixel_height + radius
                ));
            }
        }
    }

    updateVisuals(): void {
        this.cells.forEach(column => {
            column.forEach(cell => {
                cell.updateVisual(this.scene);
            });
        });
    }

     show_mines(): void {
        this.cells.forEach(row => {
            row.forEach(cell => {
                cell.show_mine = !cell.show_mine;
                cell.updateVisual(this.scene);
            });
        });
    }

    is_within_bounds(x: number, y: number): boolean {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    search(x: number, y: number): void {

        if (! this.is_within_bounds(x, y)) return;

        // let cell = this.getCell(x, y);
        let cell = this.cells[y][x];
        if (cell.visible) return;

        if (cell.mine) {
            cell.explosion = true
            return;
        }

        cell.visible = true;
        let num_mines = this.num_of_mines(x, y);

        if (num_mines > 0) {
            cell.label = true;
            cell.mine_counter = num_mines; // String(num_mines);
            return;
        }

        // Reveal neighboring cells when there are no adjacent mines.
        for (const [dx, dy] of this.search_dirs) {
            this.search(x + dx, y + dy);
        }
        
    }

    num_of_mines(x: number, y: number): number {
        let counter = 0;
        for (const [dx, dy] of this.search_dirs) {
            if (
                this.is_within_bounds(x + dx, y + dy) &&
                this.cells[y + dy][x + dx].mine
            ) {
                counter++;
            }
        }
        return counter;
    }

    randomMines(): boolean{
        // let r = Math.random();
        // if (r < 0.05) { // Example: 5% chance to place a mine
        //     return true;
        // }
        // return false;
        return Math.floor(Math.random() * 11) > 9;
    }

    showGrid(): void {
        this.cells.forEach(row => {
            console.log(row.map(cell => cell.mine));
            // let rowValues = row.map(cell => cell.mine);
            // console.log(rowValues);
        });
    }

    click(x: number, y: number): void {
        let _x: number = Math.floor(x / conf.cell_pixel_width);
        let _y: number = Math.floor(y / conf.cell_pixel_height);
        // console.log(`Clicked on cell at (${_x}, ${_y})`);
        // if (this.getCell(_x, _y)?.mine) {
        //     console.log("Mine clicked!");
        // }
        this.search(_x, _y);
        this.updateVisuals();
    }

    getCell(x: number, y: number): Cell | null {
        if (y < 0 || x < 0 || y >= this.cells.length || x >= this.cells[y].length) {
            return null;
        }
        return this.cells[y][x];
    }

    setCell(x: number, y: number, cell: Cell): void {
        if (y < 0 || x < 0 || y >= this.cells.length || x >= this.cells[y].length) {
            return;
        }
        this.cells[y][x] = cell;
    }

    add(): void {
        this.cells.forEach(column => {
            column.forEach(cell => {
                cell.add(this.scene);
            });
        });
        // this.cells.forEach(row => {
        //     row.forEach(cell => {
        //         cell.add(scene);
        //         // if (cell.value === 0){
        //         //     cell.set_text_value("");
        //         // }
        //     })
        // })
    }
}

/* Not used:

placeMines(count: integer) {
    // Implementation for placing mines randomly on the grid
    let placed = 0;
    while (placed < count) {
        const x = Math.floor(Math.random() * this.cells.length);
        const y = Math.floor(Math.random() * this.cells[0].length);
        const cell = this.getCell(x, y);
        if (cell && !cell.mine) {
            cell.mine = true; // Mark the cell as a mine
            placed++;
        }
    }
}

// num_of_mines method foreach version
this.search_dirs.forEach(element => {
    if (
        this.is_within_bounds(x + element[0], y + element[1]) && 
        this.cells[y + element[1]][x + element[0]].mine
    ) {
        counter++;
    }
});

*/
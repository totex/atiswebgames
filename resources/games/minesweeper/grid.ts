import Phaser, { Scene } from 'phaser';
import conf from './config';


class Cell {
    visible: boolean;
    size: integer = 30;
    radius: integer = this.size / 2;
    pos: Phaser.Math.Vector2;
    label: boolean = false;
    marked: boolean = false;
    mine: boolean = false;

    constructor(visible: boolean, pos: Phaser.Math.Vector2) {
        this.visible = visible;
        this.pos = pos;
    }

    add(scene: Scene) {
        // if (this.visible) {

        // }
        scene.add.circle(this.pos.x, this.pos.y, this.radius, 0xff0000);
    }

}

export class Grid {

    cells: Cell[][] = [];
    // search_dirs: [number, number][] = [[0,-1],[-1,-1],[-1,0],[-1,1],[0,1],[1,1],[1,0],[1,-1]];
    search_dirs = [
        [0, -1], [-1, -1], [-1, 0], [-1, 1],
        [0, 1], [1, 1], [1, 0], [1, -1]
    ] as const; // make search_dirs a tuple with exactly eight coordinate pairs

    constructor(width: integer, height: integer){
        for (let x = 0; x < width; x++) {
            this.cells[x] = [];
            for (let y = 0; y < height; y++) {
                let radius = conf.circle_radius;
                this.cells[x][y] = new Cell(false, new Phaser.Math.Vector2(
                    x * conf.cell_pixel_width + radius, 
                    y * conf.cell_pixel_height + radius
                ));
            }
        }
        this.placeMines(Math.floor(width * height * 0.2)); // Example: place mines on 20% of the grid
        // this.showGrid();
    }

    showGrid() {
        this.cells.forEach(column => {
            let rowValues = column.map(cell => cell.mine);
            console.log(rowValues);
            // column.forEach(cell => {
            //     console.log(cell.mine);
            // });
        });
    }

    click(x: integer, y: integer) {
        let _x: number = Math.floor(x / conf.cell_pixel_width);
        let _y: number = Math.floor(y / conf.cell_pixel_height);
        console.log(`Clicked on cell at (${_x}, ${_y})`);
    }

    getCell(x: integer, y: integer): Cell | null {
        if (x < 0 || y < 0 || x >= this.cells.length || y >= this.cells[0].length) {
            return null;
        }
        return this.cells[x][y];
    }

    setCell(x: integer, y: integer, cell: Cell) {
        if (x < 0 || y < 0 || x >= this.cells.length || y >= this.cells[0].length) {
            return;
        }
        this.cells[x][y] = cell;
    }

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

    add(scene: Scene){
        this.cells.forEach(column => {
            column.forEach(cell => {
                cell.add(scene);
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


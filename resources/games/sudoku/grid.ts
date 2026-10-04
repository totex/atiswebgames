import {GameObjects, Scene} from "phaser";
import conf from "./config";

class Cell {
    x: integer;
    y: integer;
    width: integer;
    height: integer;
    value: integer;

    private textbox: GameObjects.Text | undefined;

    constructor(x: number, y: number, width: number, height: number, value: number) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.value = value;
    }

    // all methods are by default public
    get_value(): number {
        return this.value;
    }

    set_text_color(color: string): void{
        this.textbox?.setColor(color);
    }

    set_text_value(value: number | string): void {
        this.textbox?.setText(String(value));
    }

    set_value(value: number): void {
        this.value = value;
        this.set_text_value(value);
    }

    add(scene: Scene) {
        this.textbox = scene.add.text(
            this.x + 50,
            this.y + 50,
            String(this.value),
            {
                // color: this.value ? '#09F': '#0F0',
                color: '#09F',
                fontFamily: 'monospace',
                fontSize: '46px'
            }
        );
        this.textbox.setOrigin(0.5, 0.5);
    }

    clicked(): boolean {
        return true;
    }
}

export class Grid {

    width: integer;
    height: integer;
    cells: Cell[][] = [];
    grid: number[][] = [];
    win: boolean = false;

    readonly SUB_GRID_SIZE: number = 3;
    readonly GRID_SIZE: number = this.SUB_GRID_SIZE * this.SUB_GRID_SIZE;

    private readonly size: number = conf.cell_pixel_width;

    private difficulty: number = 5;  // 7 is ideal, or lower it to make the game harder

    constructor(width: integer, height: integer) {
        this.width = width;
        this.height = height;
        this.grid = this.create_grid();
        this.cells = this.create_cells(this.grid);
        this.remove_numbers(this.cells);
        // this.show();
        // this.set_cell(0, 0, 8);  // TODO delete / comment-out this, its' only for testing restart
    }

    restart(){
        this.grid = this.create_grid();
        this.cells = this.create_cells(this.grid);
        this.remove_numbers(this.cells);
        this.win = false;
    }
    pattern(row_num: integer, col_num: integer): integer {
        return (this.SUB_GRID_SIZE * (row_num % this.SUB_GRID_SIZE) +
            Math.floor(row_num / this.SUB_GRID_SIZE) + col_num) % this.GRID_SIZE;
    }

    shuffle(arr: number[]): number[] {
        const shuffled_array: number[] = [...arr];
        for (let i = shuffled_array.length - 1; i > 0; i--){
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled_array[i], shuffled_array[j]] = [shuffled_array[j], shuffled_array[i]];
        }
        return shuffled_array;
    }

    create_grid(): number[][] {
        let row_base: number[] = Array(0, 1, 2);

        const rows: number[] = this.shuffle(row_base).flatMap(g => this.shuffle(row_base).map(r => g * 3 + r));
        const cols: number[] = this.shuffle(row_base).flatMap(g => this.shuffle(row_base).map(c => g * 3 + c));
        const nums: number[] = this.shuffle([1,2,3,4,5,6,7,8,9]);

        // in Python
        // row_base = range(3)
        // rows = [g * 3 + r for g in shuffle(row_base) for r in shuffle(row_base))]
        // cols = [g * 3 + c for g in shuffle(row_base) for c in shuffle(row_base))]
        // return [[nums[pattern(r, c)] for c in cols] for r in rows]

        const outer: number[][] = [];
        for (const r of rows) {
            let inner: number [] = [];
            for (const c of cols){
                inner.push(nums[this.pattern(r, c)]);
            }
            outer.push(inner);
        }
        return outer;
    }

    create_cells(grid: number [][]): Cell[][] {
        let col: Cell[][] = [];
        for (let y = 0; y < this.height; y++){
            let row: Cell[] = [];
            for (let x = 0; x < this.width; x++){
                // let cell: Cell = new Cell(x*100, y*100, 100, 100, x+1);
                let cell: Cell = new Cell(x*this.size, y*this.size, this.size, this.size, grid[y][x]);
                row.push(cell);
            }
            col.push(row);
        }
        return col;
    }

    // check_grid_arr_with_cell_arr(x: number, y: number): boolean {
    //     return this.grid[y][x] === this.cells[y][x].get_value();
    // }

    check_win_state(): boolean {
        for (let y: number = 0; y < this.height; y++) {
            for (let x: number = 0; x < this.width; x++) {
                if (this.grid[y][x] !== this.cells[y][x].get_value()){
                    return false;
                }
            }
        }
        return true;
    }

    wrong_number_in_cell(x: number, y: number): boolean {
        return this.grid[y][x] !== this.cells[y][x].get_value();
    }

    remove_numbers(cells: Cell[][]) {
        let number_of_cells: number = this.GRID_SIZE * this.GRID_SIZE;
        let number_of_empty_cells: number = Math.floor((number_of_cells * 3) / this.difficulty);
        let range: number[] = Array.from({ length: number_of_cells }, (_, key) => key);
        for (let i: number = 0; i < number_of_empty_cells; i++) {
            let random_num: number = Math.floor(Math.random() * range.length);
            let row: number = Math.floor(random_num / this.GRID_SIZE);
            let col: number = random_num % this.GRID_SIZE;
            cells[row][col].set_value(0);
        }
    }

    show(): void {
        // this.cells.forEach(row => {
        //     console.log(row);
        // });
        this.grid.forEach(row => {
            console.log(row);
        });
    }

    get_cell(x: number, y: number): Cell{
        return this.cells[y][x];
    }

    set_cell(x: number, y: number, value: number): void{
        this.cells[y][x].set_value(value);
    }

    add(scene: Scene): void {
        this.cells.forEach(row => {
            row.forEach(cell => {
                cell.add(scene);
                if (cell.value === 0){
                    cell.set_text_value("");
                }
            })
        })
    }
}


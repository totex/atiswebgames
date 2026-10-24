import './style.css';
import {Scene, Game, WEBGL } from 'phaser';
import conf from './config';
import { Lines } from './lines';
import { Grid } from './grid';
import Pointer = Phaser.Input.Pointer;

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;

// creates the grid lines
const lines = new Lines();

// game grid stuff
// const grid: Grid = new Grid(conf.num_hor_cells, conf.num_ver_cells);


class GameScene extends Scene {
    grid: Grid;

    constructor() {
        super('scene-game');
        this.grid = new Grid(conf.num_hor_cells, conf.num_ver_cells, this);
    }

    create(){
        lines.add(this);
        this.grid.add();

        // Mouse events
        this.input.on('pointerdown', (pointer: Pointer) => {
            // console.log(pointer.x, pointer.y);
            this.grid.click(pointer.x, pointer.y);
            
        })

        // Keyboard events
        this.input.keyboard?.on('keydown-SPACE', () => {
            this.grid.show_mines();
            this.grid.showGrid();
        });
    }
}


const config = {
    type: WEBGL,
    // width: window.innerWidth,
    // height: window.innerHeight,
    width: conf.canvas_pixel_width,
    height: conf.canvas_pixel_height,
    canvas,
    scene: [
        GameScene
    ]
}

new Game(config);


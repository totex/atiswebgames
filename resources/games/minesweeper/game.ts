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
const grid: Grid = new Grid(conf.num_hor_cells, conf.num_ver_cells);


class GameScene extends Scene {
    constructor() {
        super('scene-game');
    }

    create(){
        lines.add(this);
        grid.add(this);

        // Mouse events
        this.input.on('pointerdown', (pointer: Pointer) => {
            // console.log(pointer.x, pointer.y);
            grid.click(pointer.x, pointer.y);
            
        })
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


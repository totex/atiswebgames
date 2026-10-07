import './style.css';
import {Scene, Game, WEBGL } from 'phaser';
import conf from './config';
import { Lines } from './lines';

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;

// creates the grid lines
const lines = new Lines();


class GameScene extends Scene {
    constructor() {
        super('scene-game');
    }

    create(){
        lines.add(this);
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


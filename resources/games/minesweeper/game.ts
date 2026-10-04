import './style.css';
import {Scene, Game, WEBGL } from 'phaser';
import conf from './config';

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;

class GameScene extends Scene {

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


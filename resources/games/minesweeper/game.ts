import './style.css';
import {Scene, Game, WEBGL, GameObjects} from 'phaser';

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;

class GameScene extends Scene {

}


const config = {
    type: WEBGL,
    // width: window.innerWidth,
    // height: window.innerHeight,
    width: 1200,
    height: 800,
    canvas,
    scene: [
        GameScene
    ]
}

new Game(config);


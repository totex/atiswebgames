import './style.css';
import {Scene, Game, WEBGL, GameObjects} from 'phaser';
import { Grid } from './grid';
import { Lines } from './lines';
import { GameButtons, Button } from './buttons'; // Don't need the file extension: buttons.ts
import Pointer = Phaser.Input.Pointer;
import conf from "./config";
import Key = Phaser.Input.Keyboard.Key;
import Phaser from 'phaser';

// npm run dev

// creates the grid lines
const lines = new Lines();

// game grid stuff
const grid: Grid = new Grid(conf.num_hor_cells, conf.num_ver_cells);

const buttons: GameButtons = new GameButtons();

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;

// enum GameState {
//     PLAYING = 1,
//     WIN,
// }

class GameScene extends Scene {
    private sudoku_text: GameObjects.Text | undefined;
    private win_text: GameObjects.Text | undefined;
    private restart_text: GameObjects.Text | undefined;

    private sudoku_text_anim: number = 0;
    private selected_num: number = 0;
    private selected_btn: Button | null = null;
    private selection_highlight: GameObjects.Graphics | undefined;
    // private keySpace: Key | undefined;

    constructor() {
        super('scene-game');
    }

    create() {
        this.sudoku_text = this.add.text(
            // window.innerWidth / 2,
            // window.innerHeight / 2,
            1100,
            100,
            'Sudoku',
            {
                color: '#FFF',
                fontFamily: 'monospace',
                fontSize: '26px'
            }
        );

        this.sudoku_text.setOrigin(0.5, 0.5);

        lines.add(this);
        grid.add(this);
        buttons.add(this);

        // Mouse events
        this.input.on('pointerdown', (pointer: Pointer)=> {

            // select numbers
            if (pointer.x > conf.grid_pixel_width && !grid.win){
                for (const btn of buttons.get_buttons()) {
                    if(btn.is_clicked(pointer.x, pointer.y)){
                        this.selected_num = btn.value;
                        this.selected_btn = btn;
                    }
                }
            }

            // place numbers on grid
            if (pointer.x < conf.grid_pixel_width && !grid.win) {
                let x: number = Math.floor(pointer.x / conf.cell_pixel_width);
                let y: number = Math.floor(pointer.y / conf.cell_pixel_height);
                if (this.selected_btn != null) {
                    if (grid.get_cell(x, y).get_value() == 0 || grid.wrong_number_in_cell(x, y)) {
                        grid.set_cell(x, y, this.selected_num);

                        if (!grid.wrong_number_in_cell(x, y)){
                            grid.get_cell(x, y).set_text_color('#0F0')
                        }else{
                            grid.get_cell(x, y).set_text_color('#F00')
                        }

                        if (grid.check_win_state()){
                            grid.win = true;
                            this.win_text = this.add.text(
                                // window.innerWidth / 2,
                                // window.innerHeight / 2,
                                1100,
                                800,
                                'You Win!',
                                {
                                    color: '#0F0',
                                    fontFamily: 'monospace',
                                    fontSize: '44px'
                                }
                            );
                            this.win_text.setOrigin(0.5, 0.5);

                            this.restart_text = this.add.text(
                                // window.innerWidth / 2,
                                // window.innerHeight / 2,
                                1100,
                                850,
                                'Press Space to restart',
                                {
                                    color: '#0F0',
                                    fontFamily: 'monospace',
                                    fontSize: '20px'
                                }
                            );
                            this.restart_text.setOrigin(0.5, 0.5);
                        }
                    }
                }
            }
            // grid.show();
        })

        // Space key event
        // @ts-ignore
        let keySpace: Key = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        keySpace.on('down', () => {
            if (grid.win){
                // restart game
                this.win_text?.setText("");
                grid.restart()
                grid.add(this);
                this.scene.restart();
            }
        })

        this.selection_highlight = this.add.graphics();
    }

    update(_time: number, _delta: number) {
        if (!this.sudoku_text) {
            return;
        }

        this.sudoku_text_anim += 0.05;
        // this.textbox.rotation += 0.0005 * delta;
        this.sudoku_text.rotation = Math.sin(this.sudoku_text_anim) * 0.2;

        if (this.selected_btn != null) {
            this.selection_highlight?.clear();
            this.selection_highlight?.lineStyle(6, 0xffff00);
            this.selection_highlight?.strokeRoundedRect(this.selected_btn.x, this.selected_btn.y, 80, 80, 8);
        }

        // if(this.keySpace.isDown) {
        //     console.log('Space key pressed')
        // }

        // buttons.get_buttons().map(btn => {
        //     if (btn.is_selected) {
        //         btn.rect.setStrokeStyle(6, 0xffff00);
        //     }else{
        //         btn.rect.setStrokeStyle(6, 0x000000);
        //     }
        // })
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


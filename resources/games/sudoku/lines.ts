import {Scene} from 'phaser';
import conf from './config'

export class Lines {

    private width: integer = conf.grid_pixel_width;
    private height: integer = conf.grid_pixel_height;

    private orange_line1: number = conf.cell_pixel_width * 3;   // 300
    private orange_line2: number = conf.cell_pixel_width * 6;   // 600

    private readonly cell_pixel_width: number;
    private readonly cell_pixel_height: number;

    constructor() {
        this.cell_pixel_width = conf.cell_pixel_width;
        this.cell_pixel_height = conf.cell_pixel_height;
    }

    add_horizontal(scene: Scene): void {
        for (let y = this.cell_pixel_height; y < this.height; y += this.cell_pixel_height) {
            if (y == this.orange_line1 || y == this.orange_line2) {
                scene.add.line(0, 0, 0, y, conf.grid_pixel_width, y, 0xffff00, 1).setOrigin(0);
                // line.setStrokeStyle(16, 0xffff00, 1);
            } else {
                scene.add.line(0, 0, 0, y, conf.grid_pixel_width, y, 0xffffff, 0.5).setOrigin(0);
            }
        }
    }

    add_vertical(scene: Scene): void {
        for (let x = this.cell_pixel_width; x < this.width + this.cell_pixel_width; x += this.cell_pixel_width) {
            if (x == this.orange_line1 || x == this.orange_line2) {
                scene.add.line(0, 0, x, 0, x, conf.grid_pixel_height, 0xffff00, 1).setOrigin(0);
            } else {
                scene.add.line(0, 0, x, 0, x, conf.grid_pixel_height, 0xffffff, 0.5).setOrigin(0);
            }
        }
    }

    add(scene: Scene): void {
        this.add_horizontal(scene);
        this.add_vertical(scene);
    }
}
import {Scene} from 'phaser';
import conf from './config'


export class Lines {
    private width: integer = conf.grid_pixel_width;
    private height: integer = conf.grid_pixel_height;

    private readonly cell_pixel_width: number;
    private readonly cell_pixel_height: number;

    constructor() {
        this.cell_pixel_width = conf.cell_pixel_width;
        this.cell_pixel_height = conf.cell_pixel_height;
    }

    add_horizontal(scene: Scene): void{
        for (let y = this.cell_pixel_height; y < this.height; y += this.cell_pixel_height) {
            scene.add.line(0, 0, 0, y, conf.grid_pixel_width, y, 0xffffff, 1).setOrigin(0);
        }
    }

    add_vertical(scene: Scene): void{
        for (let x = this.cell_pixel_width; x < this.width + this.cell_pixel_width; x += this.cell_pixel_width) {
            scene.add.line(0, 0, x, 0, x, conf.grid_pixel_height, 0xffffff, 0.5).setOrigin(0);
        }
    }

    add(scene: Scene): void {
        this.add_horizontal(scene);
        this.add_vertical(scene);
    }
}
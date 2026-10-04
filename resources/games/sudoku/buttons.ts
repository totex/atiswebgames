import {Scene, GameObjects } from "phaser";
import conf from "./config";
import Phaser from 'phaser';

export class Button{
    x: number;
    y: number;
    value: number;

    private readonly width: number = 80;
    private readonly height: number = 80;

    private readonly halfWidth: number = this.width / 2;
    private readonly halfHeight: number = this.height / 2;

    // public rect: GameObjects.Rectangle | undefined;
    // public is_selected: boolean = false;

    constructor(x: number, y: number, value: number) {
        this.x = x;
        this.y = y;
        this.value = value;
    }

    is_clicked(mouse_x: number, mouse_y: number): boolean {
        return mouse_x >= this.x && mouse_x <= this.x + this.width &&
            mouse_y >= this.y && mouse_y <= this.y + this.height;
    }

    add(scene: Scene){

        // add button text
        scene.add.text(
            this.x + this.halfWidth,
            this.y + this.halfHeight,
            String(this.value),
            {
                color: '#FFF',
                fontFamily: 'monospace',
                fontSize: '44px'
            }
        ).setOrigin(0.5, 0.5);

        // add button outline
        let btn_outline: GameObjects.Graphics = scene.add.graphics();
        // graphics.fillStyle(0xffff00, 1);
        // graphics.fillRoundedRect(this.x, this.y, this.width, this.height, 12);

        btn_outline.lineStyle(2, 0x10ff00, 1);
        btn_outline.strokeRoundedRect(this.x, this.y, this.width, this.height, 8);

        btn_outline.setInteractive(new Phaser.Geom.Rectangle(this.x, this.y, this.width, this.height),
            Phaser.Geom.Rectangle.Contains)

        btn_outline.on("pointerover", () => {
            btn_outline.clear()
            // btn_outline.setScale(1.1, 1.1);
            btn_outline.lineStyle(6, 0xffff00);
            btn_outline.strokeRoundedRect(this.x, this.y, this.width, this.height, 8);
        })
        btn_outline.on("pointerout", () => {
            btn_outline.clear()
            // btn_outline.setScale(1, 1);
            btn_outline.lineStyle(2, 0x10ff00);
            btn_outline.strokeRoundedRect(this.x, this.y, this.width, this.height, 8);
        })
    }
}

export class GameButtons {
    private buttons: Button[] = [];

    constructor() {
        this.create_buttons()
    }

    public get_buttons(): Button[] {
        return this.buttons;
    }

    create_buttons(): void {
        conf.button_positions.forEach((pos: number[], index: number): void  => {
            let btn: Button = new Button(pos[0], pos[1], index+1);
            this.buttons.push(btn);
        })
    }

    add(scene: Scene): void {
        for (const btn of this.buttons) {
            btn.add(scene);
        }
    }
}
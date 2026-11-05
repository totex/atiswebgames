/**
 * Tetris — a Phaser 4 port of the Python/Arcade game in `_my_old_games/Tetris`.
 *
 * The original board (12 columns x 15 rows, with walls around the well) and
 * its tetromino rotations are preserved. The presentation and a number of
 * rules have been brought up to date:
 *
 *   - 7-bag randomiser, hold slot, ghost piece and a three-piece next queue
 *   - wall kicks, lock delay, DAS/ARR movement, soft/hard drop
 *   - level speed curve, combo bonuses, perfect-clear bonus and a saved best
 *   - synthesized sound effects, line-clear particles, screen shake
 *   - keyboard and on-screen touch controls
 *
 * Controls
 *   LEFT / A, RIGHT / D   move
 *   DOWN / S              soft drop
 *   SPACE                 hard drop
 *   UP / X                rotate clockwise
 *   Z                     rotate counter-clockwise
 *   C / SHIFT             hold
 *   P / ESC               pause or resume
 *   R                     restart
 *   M                     mute or unmute
 *
 * The game is one self-contained scene; the page supplies only #gameCanvas.
 */

import './style.css';
import Phaser, { GameObjects, Scene } from 'phaser';
import {
  ARR_MS,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BOARD_X,
  BOARD_Y,
  CELL,
  CLEAR_ANIMATION_MS,
  COLS,
  DAS_DELAY_MS,
  EMPTY,
  GAME_HEIGHT,
  GAME_WIDTH,
  HUD_WIDTH,
  HUD_X,
  PIECES,
  PLAYFIELD_LEFT,
  PLAYFIELD_RIGHT,
  ROWS,
  SOFT_DROP_INTERVAL_MS,
  TYPE_BY_CODE,
  UI,
  WALL,
  shade,
  type PieceType,
} from './config';
import { TetrisWorld, type WorldEvent } from './world';
import { TetrisSounds } from './sounds';

/* ------------------------------------------------------------------ */
/* Layout constants                                                   */
/* ------------------------------------------------------------------ */

const FONT_FAMILY = '"Trebuchet MS", "Segoe UI", Arial, sans-serif';
const MONO_FAMILY = '"Consolas", "SFMono-Regular", "JetBrains Mono", monospace';
const BEST_SCORE_KEY = 'tetris-neon-best';

const SCORE_PANEL = { x: HUD_X, y: 112, w: HUD_WIDTH, h: 96 } as const;
const STAT_Y = 220;
const STAT_H = 84;
const STAT_W = (HUD_WIDTH - 24) / 3;
const STAT_GAP = 12;

const HOLD_PANEL = { x: HUD_X, y: 316, w: 148, h: 164 } as const;
const NEXT_PANEL = { x: HUD_X + 160, y: 316, w: 308, h: 164 } as const;

const MESSAGE_X = HUD_X + HUD_WIDTH / 2;
const MESSAGE_Y = 500;

const TOUCH_Y = 530;
const TOUCH_HEIGHT = 60;
const TOUCH_WIDTH = 64;
const TOUCH_GAP = 10;

const COMBO_PANEL = { x: HUD_X, y: 712, w: HUD_WIDTH, h: 54 } as const;
const CONTROLS_Y = 612;
const FOOTER_Y = 812;

const PREVIEW_Y = 412;
const HOLD_PREVIEW_X = HOLD_PANEL.x + HOLD_PANEL.w / 2;
const NEXT_PREVIEW_X = [
  NEXT_PANEL.x + 62,
  NEXT_PANEL.x + 154,
  NEXT_PANEL.x + 246,
];

/* ------------------------------------------------------------------ */
/* Small helpers                                                      */
/* ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function pad(value: number, length: number): string {
  return Math.max(0, Math.floor(value)).toString().padStart(length, '0');
}

function loadBestScore(): number {
  try {
    const raw = globalThis.localStorage?.getItem(BEST_SCORE_KEY);
    const value = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function saveBestScore(value: number): void {
  try {
    globalThis.localStorage?.setItem(BEST_SCORE_KEY, String(Math.floor(value)));
  } catch {
    // Private browsing can reject localStorage writes.
  }
}

function mixColor(from: number, to: number, amount: number): number {
  const t = clamp(amount, 0, 1);
  const r = Math.round(((from >> 16) & 0xff) * (1 - t) + ((to >> 16) & 0xff) * t);
  const g = Math.round(((from >> 8) & 0xff) * (1 - t) + ((to >> 8) & 0xff) * t);
  const b = Math.round((from & 0xff) * (1 - t) + (to & 0xff) * t);
  return (r << 16) | (g << 8) | b;
}

/** Draw a soft radial glow as a stack of translucent circles. */
function drawGlow(
  graphics: GameObjects.Graphics,
  x: number,
  y: number,
  radius: number,
  color: number,
  alpha: number
): void {
  const layers = 14;

  for (let i = layers; i >= 1; i -= 1) {
    const t = i / layers;
    graphics.fillStyle(color, alpha * (1 - t) * (1 - t));
    graphics.fillCircle(x, y, radius * t);
  }
}

function drawVerticalGradient(
  graphics: GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  top: number,
  bottom: number
): void {
  const steps = 90;
  const bandHeight = height / steps;

  for (let i = 0; i < steps; i += 1) {
    graphics.fillStyle(mixColor(top, bottom, i / (steps - 1)), 1);
    graphics.fillRect(x, y + i * bandHeight, width, bandHeight + 1);
  }
}

function drawPanel(
  graphics: GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 12,
  fill: number = UI.panel,
  stroke: number = UI.border
): void {
  graphics.fillStyle(0x000000, 0.3);
  graphics.fillRoundedRect(x + 2, y + 4, width, height, radius);

  graphics.fillStyle(fill, 1);
  graphics.fillRoundedRect(x, y, width, height, radius);

  graphics.lineStyle(1, stroke, 0.9);
  graphics.strokeRoundedRect(x, y, width, height, radius);
}

function drawBlock(
  graphics: GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha = 1
): void {
  if (size <= 0 || alpha <= 0) {
    return;
  }

  const inset = Math.max(1, size * 0.045);
  const inner = size - inset * 2;
  const radius = Math.min(inner / 2, Math.max(2, size * 0.16));
  const highlight = Math.max(2, size * 0.11);
  const shadow = Math.max(2, size * 0.14);

  // Soft outer glow.
  graphics.fillStyle(color, 0.14 * alpha);
  graphics.fillRoundedRect(
    x + inset * 0.2,
    y + inset * 0.2,
    size - inset * 0.4,
    size - inset * 0.4,
    radius + 2
  );

  // Body.
  graphics.fillStyle(color, alpha);
  graphics.fillRoundedRect(x + inset, y + inset, inner, inner, radius);

  // Top highlight and bottom shade give each cell a little depth.
  graphics.fillStyle(0xffffff, 0.18 * alpha);
  graphics.fillRoundedRect(
    x + inset * 2.2,
    y + inset * 2.2,
    Math.max(2, inner - inset * 2.4),
    highlight,
    Math.max(1, radius * 0.5)
  );

  graphics.fillStyle(0x000000, 0.2 * alpha);
  graphics.fillRoundedRect(
    x + inset * 2.2,
    y + size - inset * 2.2 - shadow,
    Math.max(2, inner - inset * 2.4),
    shadow,
    Math.max(1, radius * 0.4)
  );

  graphics.lineStyle(1.2, shade(color, 72), 0.55 * alpha);
  graphics.strokeRoundedRect(x + inset, y + inset, inner, inner, radius);
}

function drawWallBlock(
  graphics: GameObjects.Graphics,
  x: number,
  y: number,
  size: number
): void {
  const inset = Math.max(1, size * 0.035);
  const inner = size - inset * 2;

  graphics.fillStyle(0x111a2b, 1);
  graphics.fillRoundedRect(x + inset, y + inset, inner, inner, 5);

  graphics.fillStyle(0x1e2a42, 0.9);
  graphics.fillRoundedRect(
    x + inset + 3,
    y + inset + 3,
    Math.max(2, inner - 6),
    Math.max(3, size * 0.12),
    2
  );

  graphics.lineStyle(1, 0x33425f, 0.8);
  graphics.strokeRoundedRect(x + inset, y + inset, inner, inner, 5);
}

function drawGhostBlock(
  graphics: GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  color: number
): void {
  const inset = Math.max(1, size * 0.08);
  const inner = size - inset * 2;

  graphics.fillStyle(color, 0.07);
  graphics.fillRoundedRect(x + inset, y + inset, inner, inner, 5);

  graphics.lineStyle(1.5, color, 0.35);
  graphics.strokeRoundedRect(x + inset, y + inset, inner, inner, 5);
}

/* ------------------------------------------------------------------ */
/* Shared audio                                                       */
/* ------------------------------------------------------------------ */

let sharedSounds: TetrisSounds | null = null;
let audioChecked = false;

function getSharedSounds(): TetrisSounds | null {
  if (audioChecked) {
    return sharedSounds;
  }

  audioChecked = true;

  if (typeof window === 'undefined') {
    return null;
  }

  const audioWindow = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };

  if (!window.AudioContext && !audioWindow.webkitAudioContext) {
    return null;
  }

  try {
    sharedSounds = new TetrisSounds();
  } catch (error) {
    console.warn('Tetris audio is unavailable:', error);
    sharedSounds = null;
  }

  return sharedSounds;
}

/* ------------------------------------------------------------------ */
/* Keyboard                                                           */
/* ------------------------------------------------------------------ */

interface TetrisKeys {
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  w: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  x: Phaser.Input.Keyboard.Key;
  z: Phaser.Input.Keyboard.Key;
  c: Phaser.Input.Keyboard.Key;
  shift: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
  p: Phaser.Input.Keyboard.Key;
  esc: Phaser.Input.Keyboard.Key;
  r: Phaser.Input.Keyboard.Key;
  m: Phaser.Input.Keyboard.Key;
  enter: Phaser.Input.Keyboard.Key;
}

type PadAction = 'left' | 'right' | 'rotate' | 'soft' | 'hard' | 'hold';
type OverlayMode = 'paused' | 'gameover';

/* ------------------------------------------------------------------ */
/* Scene                                                              */
/* ------------------------------------------------------------------ */

export class TetrisScene extends Scene {
  private world!: TetrisWorld;
  private sounds: TetrisSounds | null = null;
  private keys: TetrisKeys | null = null;

  private boardGraphics!: GameObjects.Graphics;
  private activeGraphics!: GameObjects.Graphics;
  private clearGraphics!: GameObjects.Graphics;
  private hudGraphics!: GameObjects.Graphics;
  private holdGraphics!: GameObjects.Graphics;
  private nextGraphics!: GameObjects.Graphics;

  private scoreText!: GameObjects.Text;
  private bestText!: GameObjects.Text;
  private linesText!: GameObjects.Text;
  private levelText!: GameObjects.Text;
  private comboText!: GameObjects.Text;
  private messageText!: GameObjects.Text;
  private footerText!: GameObjects.Text;

  private pauseBtnLabel!: GameObjects.Text;
  private soundBtnLabel!: GameObjects.Text;

  private overlay!: GameObjects.Container;
  private overlayPanel!: GameObjects.Rectangle;
  private overlayTitle!: GameObjects.Text;
  private overlaySubtitle!: GameObjects.Text;
  private overlayStats!: GameObjects.Text;
  private overlayPrompt!: GameObjects.Text;
  private overlayButtonBg!: GameObjects.Rectangle;
  private overlayButtonText!: GameObjects.Text;
  private overlayMode: OverlayMode = 'paused';

  private best = 0;
  private startingBest = 0;
  private bestDirty = false;
  private paused = false;
  private gameOverShown = false;

  private clearing = false;
  private clearingTimer = 0;
  private clearingRows: number[] = [];

  private lastBoardRevision = -1;
  private lastActiveSignature = '';
  private lastPreviewSignature = '';
  private lastScore = -1;
  private lastBest = -1;
  private lastLines = -1;
  private lastLevel = -1;
  private lastCombo = -1;

  private moveDirection: -1 | 0 | 1 = 0;
  private moveTimer = 0;
  private softHeld = false;
  private softTimer = 0;

  private touchLeft = false;
  private touchRight = false;
  private touchDown = false;

  private messageTimer: Phaser.Time.TimerEvent | null = null;
  private onWindowBlur: (() => void) | null = null;
  private onWindowPointerUp: (() => void) | null = null;
  private onVisibilityChange: (() => void) | null = null;

  constructor() {
    super({ key: 'TetrisScene' });
  }

  create(): void {
    this.world = new TetrisWorld();
    this.sounds = getSharedSounds();
    this.keys = null;
    this.paused = false;
    this.gameOverShown = false;
    this.clearing = false;
    this.clearingTimer = 0;
    this.clearingRows = [];
    this.best = loadBestScore();
    this.startingBest = this.best;
    this.bestDirty = false;
    this.lastBoardRevision = -1;
    this.lastActiveSignature = '';
    this.lastPreviewSignature = '';
    this.lastScore = -1;
    this.lastBest = -1;
    this.lastLines = -1;
    this.lastLevel = -1;
    this.lastCombo = -1;
    this.moveDirection = 0;
    this.moveTimer = 0;
    this.softHeld = false;
    this.softTimer = 0;
    this.touchLeft = false;
    this.touchRight = false;
    this.touchDown = false;
    this.messageTimer = null;

    this.drawBackdrop();
    this.createLayers();
    this.createHud();
    this.createTouchPad();
    this.createOverlay();
    this.bindInput();

    // The initial spawn happened inside the world's constructor; there is no
    // piece to announce and no sound to play at load time.
    this.world.consumeEvents();
    this.sync(true);
  }

  /* ---------------------------------------------------------------- */
  /* Static rendering                                                  */
  /* ---------------------------------------------------------------- */

  private drawBackdrop(): void {
    const background = this.add.graphics().setDepth(0);

    drawVerticalGradient(
      background,
      0,
      0,
      GAME_WIDTH,
      GAME_HEIGHT,
      UI.backgroundTop,
      UI.backgroundBottom
    );

    drawGlow(background, 250, 150, 360, 0x2dd4bf, 0.055);
    drawGlow(background, 1130, 760, 440, 0x6366f1, 0.06);
    drawGlow(background, 690, -80, 380, 0x38bdf8, 0.04);
    drawGlow(background, 60, 860, 300, 0x0ea5e9, 0.035);

    // A quiet star field keeps the large canvas from feeling flat.
    for (let i = 0; i < 74; i += 1) {
      const x = Math.random() * GAME_WIDTH;
      const y = Math.random() * GAME_HEIGHT;
      const radius = 0.6 + Math.random() * 1.5;
      const alpha = 0.04 + Math.random() * 0.14;
      background.fillStyle(0xd7e9ff, alpha);
      background.fillCircle(x, y, radius);
    }

    // Board drop shadow and playfield.
    const board = this.add.graphics().setDepth(1);

    board.fillStyle(0x000000, 0.42);
    board.fillRoundedRect(
      BOARD_X - 16,
      BOARD_Y - 12,
      BOARD_WIDTH + 32,
      BOARD_HEIGHT + 30,
      20
    );

    board.fillStyle(UI.board, 1);
    board.fillRoundedRect(BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT, 10);

    // Faint interior grid.
    board.lineStyle(1, 0x7dd3fc, 0.045);
    for (let x = 1; x < COLS; x += 1) {
      board.beginPath();
      board.moveTo(BOARD_X + x * CELL, BOARD_Y);
      board.lineTo(BOARD_X + x * CELL, BOARD_Y + BOARD_HEIGHT);
      board.strokePath();
    }
    for (let y = 1; y < ROWS; y += 1) {
      board.beginPath();
      board.moveTo(BOARD_X, BOARD_Y + y * CELL);
      board.lineTo(BOARD_X + BOARD_WIDTH, BOARD_Y + y * CELL);
      board.strokePath();
    }

    // Layered frame: wide glow, solid edge, bright hairline.
    board.lineStyle(18, UI.boardEdge, 0.035);
    board.strokeRoundedRect(
      BOARD_X - 10,
      BOARD_Y - 10,
      BOARD_WIDTH + 20,
      BOARD_HEIGHT + 20,
      18
    );

    board.lineStyle(2, UI.boardEdge, 0.38);
    board.strokeRoundedRect(
      BOARD_X - 1,
      BOARD_Y - 1,
      BOARD_WIDTH + 2,
      BOARD_HEIGHT + 2,
      11
    );

    board.lineStyle(1, 0xb9fff5, 0.5);
    board.strokeRoundedRect(
      BOARD_X + 1,
      BOARD_Y + 1,
      BOARD_WIDTH - 2,
      BOARD_HEIGHT - 2,
      10
    );
  }

  private createLayers(): void {
    this.boardGraphics = this.add.graphics().setDepth(3);
    this.activeGraphics = this.add.graphics().setDepth(4);
    this.clearGraphics = this.add.graphics().setDepth(5);
    this.hudGraphics = this.add.graphics().setDepth(9);
    this.holdGraphics = this.add.graphics().setDepth(10);
    this.nextGraphics = this.add.graphics().setDepth(10);
  }

  /* ---------------------------------------------------------------- */
  /* HUD                                                               */
  /* ---------------------------------------------------------------- */

  private createHud(): void {
    const hud = this.hudGraphics;

    // Title and tagline.
    this.add
      .text(HUD_X + 20, 23, 'TETRIS', {
        fontFamily: FONT_FAMILY,
        fontSize: '46px',
        fontStyle: 'bold',
        color: UI.text,
      })
      .setDepth(11)
      .setShadow(0, 0, '#5ef2d6', 16, false, true);

    this.add
      .text(HUD_X + 22, 82, 'N E O N   D R O P', {
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
        color: UI.accentText,
      })
      .setDepth(11)
      .setAlpha(0.75);

    // Pause and sound controls at the top-right of the HUD.
    this.createMiniButton(
      HUD_X + 326,
      51,
      'PAUSE',
      () => this.togglePause(),
      (label) => {
        this.pauseBtnLabel = label;
      }
    );
    this.createMiniButton(
      HUD_X + 400,
      51,
      'SOUND',
      () => this.toggleMute(),
      (label) => {
        this.soundBtnLabel = label;
      }
    );

    // Score card.
    drawPanel(hud, SCORE_PANEL.x, SCORE_PANEL.y, SCORE_PANEL.w, SCORE_PANEL.h);

    hud.fillStyle(UI.accent, 0.6);
    hud.fillRoundedRect(
      SCORE_PANEL.x + 20,
      SCORE_PANEL.y,
      SCORE_PANEL.w - 40,
      2,
      1
    );

    this.add
      .text(SCORE_PANEL.x + 20, SCORE_PANEL.y + 14, 'SCORE', {
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
        fontStyle: 'bold',
        color: UI.muted,
      })
      .setDepth(11);

    this.scoreText = this.add
      .text(SCORE_PANEL.x + 20, SCORE_PANEL.y + 34, '000000', {
        fontFamily: MONO_FAMILY,
        fontSize: '40px',
        fontStyle: 'bold',
        color: UI.text,
      })
      .setDepth(11);

    // Level / lines / best cards.
    const statLabels = ['LEVEL', 'LINES', 'BEST'];
    const statValues: GameObjects.Text[] = [];

    for (let i = 0; i < 3; i += 1) {
      const x = HUD_X + i * (STAT_W + STAT_GAP);
      drawPanel(hud, x, STAT_Y, STAT_W, STAT_H, 11);

      this.add
        .text(x + 16, STAT_Y + 12, statLabels[i], {
          fontFamily: FONT_FAMILY,
          fontSize: '10px',
          fontStyle: 'bold',
          color: UI.muted,
        })
        .setDepth(11);

      statValues.push(
        this.add
          .text(x + 16, STAT_Y + 33, i === 0 ? '01' : '000', {
            fontFamily: MONO_FAMILY,
            fontSize: '24px',
            fontStyle: 'bold',
            color: i === 2 ? UI.accentText : UI.text,
          })
          .setDepth(11)
      );
    }

    this.levelText = statValues[0];
    this.linesText = statValues[1];
    this.bestText = statValues[2];

    // Hold card.
    drawPanel(hud, HOLD_PANEL.x, HOLD_PANEL.y, HOLD_PANEL.w, HOLD_PANEL.h, 12);
    this.add
      .text(HOLD_PANEL.x + 16, HOLD_PANEL.y + 13, 'HOLD', {
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
        fontStyle: 'bold',
        color: UI.muted,
      })
      .setDepth(11);

    // Next card.
    drawPanel(hud, NEXT_PANEL.x, NEXT_PANEL.y, NEXT_PANEL.w, NEXT_PANEL.h, 12);
    this.add
      .text(NEXT_PANEL.x + 16, NEXT_PANEL.y + 13, 'NEXT', {
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
        fontStyle: 'bold',
        color: UI.muted,
      })
      .setDepth(11);

    // Slot separators under the next previews.
    hud.lineStyle(1, UI.border, 0.55);
    for (const x of [NEXT_PANEL.x + 108, NEXT_PANEL.x + 216]) {
      hud.beginPath();
      hud.moveTo(x, NEXT_PANEL.y + 42);
      hud.lineTo(x, NEXT_PANEL.y + HOLD_PANEL.h - 16);
      hud.strokePath();
    }

    this.messageText = this.add
      .text(MESSAGE_X, MESSAGE_Y, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        fontStyle: 'bold',
        color: UI.greenText,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(11);

    // Controls legend.
    this.add
      .text(
        HUD_X + 20,
        CONTROLS_Y,
        [
          '← → / A D    move',
          '↑ / X  rotate      Z  rotate back',
          '↓ / S  soft drop   SPACE  hard drop',
          'C / SHIFT  hold    P / ESC  pause',
        ].join('\n'),
        {
          fontFamily: FONT_FAMILY,
          fontSize: '13px',
          color: UI.muted,
          lineSpacing: 7,
        }
      )
      .setDepth(11);

    // Combo strip.
    drawPanel(hud, COMBO_PANEL.x, COMBO_PANEL.y, COMBO_PANEL.w, COMBO_PANEL.h, 10);

    this.add
      .text(COMBO_PANEL.x + 20, COMBO_PANEL.y + 12, 'COMBO', {
        fontFamily: FONT_FAMILY,
        fontSize: '10px',
        fontStyle: 'bold',
        color: UI.muted,
      })
      .setDepth(11);

    this.comboText = this.add
      .text(COMBO_PANEL.x + COMBO_PANEL.w - 20, COMBO_PANEL.y + 10, '—', {
        fontFamily: MONO_FAMILY,
        fontSize: '24px',
        fontStyle: 'bold',
        color: UI.dim,
      })
      .setOrigin(1, 0)
      .setDepth(11);

    this.footerText = this.add
      .text(HUD_X + 20, FOOTER_Y, 'R  RESTART          M  SOUND', {
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
        color: UI.dim,
      })
      .setDepth(11);

    this.updateSoundLabel();
    this.updatePauseLabel();
  }

  private createMiniButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    assign: (text: GameObjects.Text) => void
  ): void {
    const background = this.add
      .rectangle(x, y, 66, 30, UI.panel, 0.94)
      .setStrokeStyle(1, UI.border, 1)
      .setDepth(11)
      .setInteractive({ useHandCursor: true });

    const text = this.add
      .text(x, y, label, {
        fontFamily: FONT_FAMILY,
        fontSize: '10px',
        fontStyle: 'bold',
        color: UI.muted,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(12);

    background.on('pointerover', () => {
      background.setFillStyle(UI.panelStrong, 1);
      background.setStrokeStyle(1, UI.accentDim, 1);
    });

    background.on('pointerout', () => {
      background.setFillStyle(UI.panel, 0.94);
      background.setStrokeStyle(1, UI.border, 1);
    });

    background.on('pointerdown', () => {
      this.sounds?.unlock();
      onClick();
    });

    assign(text);
  }

  private updateSoundLabel(): void {
    if (!this.soundBtnLabel) {
      return;
    }

    if (!this.sounds) {
      this.soundBtnLabel.setText('NO AUDIO');
      this.soundBtnLabel.setColor(UI.dim);
      return;
    }

    const muted = this.sounds.isMuted();
    this.soundBtnLabel.setText(muted ? 'MUTED' : 'SOUND');
    this.soundBtnLabel.setColor(muted ? UI.muted : UI.accentText);
  }

  private updatePauseLabel(): void {
    if (!this.pauseBtnLabel) {
      return;
    }

    if (this.world?.phase === 'gameover') {
      this.pauseBtnLabel.setText('PAUSE');
      this.pauseBtnLabel.setColor(UI.dim);
      return;
    }

    this.pauseBtnLabel.setText(this.paused ? 'RESUME' : 'PAUSE');
    this.pauseBtnLabel.setColor(this.paused ? UI.accentText : UI.muted);
  }

  /* ---------------------------------------------------------------- */
  /* Touch pad                                                         */
  /* ---------------------------------------------------------------- */

  private createTouchPad(): void {
    const totalWidth = 6 * TOUCH_WIDTH + 5 * TOUCH_GAP;
    const startX = HUD_X + (HUD_WIDTH - totalWidth) / 2;

    const buttons: ReadonlyArray<{
      readonly action: PadAction;
      readonly icon: string;
      readonly caption: string;
      readonly fill: number;
      readonly stroke: number;
    }> = [
      { action: 'left', icon: '◀', caption: 'LEFT', fill: 0x1c2b4a, stroke: 0x4f74b8 },
      { action: 'right', icon: '▶', caption: 'RIGHT', fill: 0x1c2b4a, stroke: 0x4f74b8 },
      { action: 'rotate', icon: '↻', caption: 'ROTATE', fill: 0x2c2450, stroke: 0x8a6bff },
      { action: 'soft', icon: '▼', caption: 'SOFT', fill: 0x173340, stroke: 0x3d9bb8 },
      { action: 'hard', icon: '⇩', caption: 'DROP', fill: 0x45251d, stroke: 0xff9f43 },
      { action: 'hold', icon: 'H', caption: 'HOLD', fill: 0x1f3629, stroke: 0x57e389 },
    ];

    buttons.forEach((definition, index) => {
      const centerX = startX + index * (TOUCH_WIDTH + TOUCH_GAP) + TOUCH_WIDTH / 2;
      const centerY = TOUCH_Y + TOUCH_HEIGHT / 2;

      const background = this.add
        .rectangle(centerX, centerY, TOUCH_WIDTH, TOUCH_HEIGHT, definition.fill, 0.32)
        .setStrokeStyle(1.5, definition.stroke, 0.85)
        .setDepth(12)
        .setInteractive({ useHandCursor: true });

      const icon = this.add
        .text(centerX, centerY - 7, definition.icon, {
          fontFamily: FONT_FAMILY,
          fontSize: '21px',
          fontStyle: 'bold',
          color: UI.text,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(13);

      this.add
        .text(centerX, centerY + 18, definition.caption, {
          fontFamily: FONT_FAMILY,
          fontSize: '8px',
          fontStyle: 'bold',
          color: UI.muted,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(13);

      background.on('pointerover', () => {
        background.setFillStyle(definition.fill, 0.54);
        background.setStrokeStyle(1.5, shade(definition.stroke, 30), 1);
      });

      background.on('pointerout', () => {
        background.setFillStyle(definition.fill, 0.32);
        background.setStrokeStyle(1.5, definition.stroke, 0.85);
        this.releasePadAction(definition.action);
      });

      background.on('pointerdown', () => {
        this.sounds?.unlock();
        background.setFillStyle(definition.fill, 0.78);
        icon.setScale(0.92);
        this.tweens.add({
          targets: icon,
          scale: 1,
          duration: 90,
          ease: 'Quad.easeOut',
        });
        this.pressPadAction(definition.action);
      });

      background.on('pointerup', () => {
        background.setFillStyle(definition.fill, 0.54);
        this.releasePadAction(definition.action);
      });
    });

    this.onWindowPointerUp = () => this.clearTouchState();
    window.addEventListener('pointerup', this.onWindowPointerUp);

    this.events.once('shutdown', () => {
      if (this.onWindowPointerUp) {
        window.removeEventListener('pointerup', this.onWindowPointerUp);
      }
    });
  }

  private pressPadAction(action: PadAction): void {
    if (this.paused || this.world.phase === 'gameover') {
      return;
    }

    if (action === 'left') {
      this.touchLeft = true;
      this.moveDirection = -1;
      this.moveTimer = 0;
      if (this.world.phase === 'playing') {
        this.world.move(-1);
      }
      this.handleWorldEvents();
      this.sync();
      return;
    }

    if (action === 'right') {
      this.touchRight = true;
      this.moveDirection = 1;
      this.moveTimer = 0;
      if (this.world.phase === 'playing') {
        this.world.move(1);
      }
      this.handleWorldEvents();
      this.sync();
      return;
    }

    if (action === 'soft') {
      this.touchDown = true;
      this.softHeld = true;
      this.softTimer = 0;
      if (this.world.phase === 'playing') {
        this.world.softDrop();
      }
      this.handleWorldEvents();
      this.sync();
      return;
    }

    if (this.world.phase !== 'playing' || this.paused) {
      return;
    }

    if (action === 'rotate') {
      this.world.rotate(1);
    } else if (action === 'hard') {
      this.hardDrop();
      return;
    } else if (action === 'hold') {
      this.world.hold();
    }

    this.handleWorldEvents();
    this.sync();
  }

  private releasePadAction(action: PadAction): void {
    if (action === 'left') {
      this.touchLeft = false;
    } else if (action === 'right') {
      this.touchRight = false;
    } else if (action === 'soft') {
      this.touchDown = false;
    }
  }

  private clearTouchState(): void {
    this.touchLeft = false;
    this.touchRight = false;
    this.touchDown = false;
  }

  /* ---------------------------------------------------------------- */
  /* Overlay                                                           */
  /* ---------------------------------------------------------------- */

  private createOverlay(): void {
    const dim = this.add
      .rectangle(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        GAME_WIDTH,
        GAME_HEIGHT,
        0x02040a,
        0.78
      )
      .setOrigin(0.5, 0.5);

    this.overlayPanel = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 560, 310, UI.panel, 0.98)
      .setStrokeStyle(2, UI.accent, 0.55);

    this.overlayTitle = this.add
      .text(GAME_WIDTH / 2, 368, 'PAUSED', {
        fontFamily: FONT_FAMILY,
        fontSize: '46px',
        fontStyle: 'bold',
        color: UI.accentText,
      })
      .setOrigin(0.5, 0.5);

    this.overlaySubtitle = this.add
      .text(GAME_WIDTH / 2, 424, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: UI.muted,
      })
      .setOrigin(0.5, 0.5);

    this.overlayStats = this.add
      .text(GAME_WIDTH / 2, 466, '', {
        fontFamily: MONO_FAMILY,
        fontSize: '15px',
        color: UI.text,
      })
      .setOrigin(0.5, 0.5);

    this.overlayPrompt = this.add
      .text(GAME_WIDTH / 2, 506, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        color: UI.muted,
      })
      .setOrigin(0.5, 0.5);

    this.overlayButtonBg = this.add
      .rectangle(GAME_WIDTH / 2, 558, 200, 44, UI.accent, 0.15)
      .setStrokeStyle(1.5, UI.accent, 0.8)
      .setInteractive({ useHandCursor: true });

    this.overlayButtonText = this.add
      .text(GAME_WIDTH / 2, 558, 'RESUME', {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        fontStyle: 'bold',
        color: UI.accentText,
      })
      .setOrigin(0.5, 0.5);

    this.overlayButtonBg.on('pointerover', () => {
      this.overlayButtonBg.setFillStyle(UI.accent, 0.28);
    });

    this.overlayButtonBg.on('pointerout', () => {
      this.overlayButtonBg.setFillStyle(UI.accent, 0.15);
    });

    this.overlayButtonBg.on('pointerdown', () => {
      if (!this.overlay.visible) {
        return;
      }

      if (this.overlayMode === 'paused') {
        this.setPaused(false);
      } else {
        this.scene.restart();
      }
    });

    this.overlay = this.add
      .container(0, 0, [
        dim,
        this.overlayPanel,
        this.overlayTitle,
        this.overlaySubtitle,
        this.overlayStats,
        this.overlayPrompt,
        this.overlayButtonBg,
        this.overlayButtonText,
      ])
      .setDepth(30)
      .setVisible(false);
  }

  private showOverlay(mode: OverlayMode, newBest = false): void {
    this.overlayMode = mode;

    if (mode === 'paused') {
      this.overlayTitle.setText('PAUSED').setColor(UI.accentText);
      this.overlaySubtitle.setText('The board is on hold.').setColor(UI.muted);
      this.overlayStats.setText('');
      this.overlayPrompt.setText('Press P or ESC to resume');
      this.overlayButtonText.setText('RESUME').setColor(UI.accentText);
      this.overlayPanel.setStrokeStyle(2, UI.accent, 0.55);
    } else {
      this.overlayTitle.setText('GAME OVER').setColor(UI.dangerText);
      this.overlaySubtitle
        .setText(
          newBest
            ? 'New personal best! The well wins this round.'
            : 'No more room at the top.'
        )
        .setColor(newBest ? UI.goldText : UI.muted);
      this.overlayStats.setText(
        `SCORE ${pad(this.world.score, 6)}     LINES ${pad(
          this.world.lines,
          3
        )}     LEVEL ${pad(this.world.level, 2)}`
      );
      this.overlayPrompt.setText('Press R or SPACE to play again');
      this.overlayButtonText.setText('PLAY AGAIN').setColor(UI.dangerText);
      this.overlayPanel.setStrokeStyle(2, UI.danger, 0.55);
    }

    this.overlay.setVisible(true);
    this.overlay.setAlpha(0);
    this.tweens.killTweensOf(this.overlay);
    this.tweens.add({
      targets: this.overlay,
      alpha: 1,
      duration: 160,
      ease: 'Quad.easeOut',
    });

    this.updatePauseLabel();
  }

  private hideOverlay(): void {
    if (!this.overlay.visible) {
      return;
    }

    this.tweens.killTweensOf(this.overlay);
    this.tweens.add({
      targets: this.overlay,
      alpha: 0,
      duration: 120,
      ease: 'Quad.easeOut',
      onComplete: () => this.overlay.setVisible(false),
    });
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  private bindInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    this.keys = keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      x: Phaser.Input.Keyboard.KeyCodes.X,
      z: Phaser.Input.Keyboard.KeyCodes.Z,
      c: Phaser.Input.Keyboard.KeyCodes.C,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      p: Phaser.Input.Keyboard.KeyCodes.P,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
      r: Phaser.Input.Keyboard.KeyCodes.R,
      m: Phaser.Input.Keyboard.KeyCodes.M,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
    }) as unknown as TetrisKeys;

    keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.P,
      Phaser.Input.Keyboard.KeyCodes.ESC,
      Phaser.Input.Keyboard.KeyCodes.R,
      Phaser.Input.Keyboard.KeyCodes.M,
      Phaser.Input.Keyboard.KeyCodes.C,
      Phaser.Input.Keyboard.KeyCodes.X,
      Phaser.Input.Keyboard.KeyCodes.Z,
      Phaser.Input.Keyboard.KeyCodes.SHIFT,
      Phaser.Input.Keyboard.KeyCodes.ENTER,
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.D,
      Phaser.Input.Keyboard.KeyCodes.S,
      Phaser.Input.Keyboard.KeyCodes.W,
    ]);

    this.onWindowBlur = () => {
      this.clearTouchState();
      this.resetRepeatState();
      this.input.keyboard?.resetKeys();

      if (!this.paused && this.world.phase !== 'gameover') {
        this.setPaused(true);
      }
    };

    window.addEventListener('blur', this.onWindowBlur);

    // Mobile browsers do not always fire `blur` when switching tabs, so also
    // pause when the document becomes hidden.
    this.onVisibilityChange = () => {
      if (
        document.hidden &&
        !this.paused &&
        this.world.phase !== 'gameover'
      ) {
        this.setPaused(true);
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.events.once('shutdown', () => {
      if (this.onWindowBlur) {
        window.removeEventListener('blur', this.onWindowBlur);
      }
      if (this.onVisibilityChange) {
        document.removeEventListener(
          'visibilitychange',
          this.onVisibilityChange
        );
      }
      this.saveBest();
    });
  }

  update(_time: number, delta: number): void {
    if (!this.keys || !this.world) {
      this.sync();
      return;
    }

    const keys = this.keys;

    // Global keys work while playing, paused and after game over.
    if (Phaser.Input.Keyboard.JustDown(keys.m)) {
      this.toggleMute();
    }

    if (Phaser.Input.Keyboard.JustDown(keys.r)) {
      this.scene.restart();
      return;
    }

    if (this.world.phase === 'gameover') {
      if (
        Phaser.Input.Keyboard.JustDown(keys.space) ||
        Phaser.Input.Keyboard.JustDown(keys.enter)
      ) {
        this.scene.restart();
        return;
      }

      this.sync();
      return;
    }

    if (
      Phaser.Input.Keyboard.JustDown(keys.p) ||
      Phaser.Input.Keyboard.JustDown(keys.esc)
    ) {
      this.togglePause();
      this.sync();
      return;
    }

    if (this.paused) {
      this.sync();
      return;
    }

    if (this.world.phase === 'clearing') {
      this.updateClearing(delta);
      this.sync();
      return;
    }

    if (
      Phaser.Input.Keyboard.JustDown(keys.up) ||
      Phaser.Input.Keyboard.JustDown(keys.x)
    ) {
      this.world.rotate(1);
    }

    if (Phaser.Input.Keyboard.JustDown(keys.z)) {
      this.world.rotate(-1);
    }

    if (
      Phaser.Input.Keyboard.JustDown(keys.c) ||
      Phaser.Input.Keyboard.JustDown(keys.shift)
    ) {
      this.world.hold();
    }

    if (Phaser.Input.Keyboard.JustDown(keys.space)) {
      this.hardDrop();
    }

    this.updateHorizontal(delta);
    this.updateSoftDrop(delta);

    if (this.world.phase === 'playing') {
      this.world.update(delta);
    }

    this.handleWorldEvents();
    this.sync();
  }

  private updateHorizontal(delta: number): void {
    const keys = this.keys;
    if (!keys) {
      return;
    }

    const left =
      keys.left.isDown || keys.a.isDown || this.touchLeft;
    const right =
      keys.right.isDown || keys.d.isDown || this.touchRight;

    let direction: -1 | 0 | 1 = 0;
    if (left && !right) {
      direction = -1;
    } else if (right && !left) {
      direction = 1;
    }

    if (direction !== this.moveDirection) {
      this.moveDirection = direction;
      this.moveTimer = 0;

      if (direction !== 0) {
        this.world.move(direction);
      }
      return;
    }

    if (direction === 0) {
      this.moveTimer = 0;
      return;
    }

    this.moveTimer += delta;

    if (this.moveTimer >= DAS_DELAY_MS) {
      this.world.move(direction);
      this.moveTimer = DAS_DELAY_MS - ARR_MS;
    }
  }

  private updateSoftDrop(delta: number): void {
    const keys = this.keys;
    if (!keys) {
      return;
    }

    const down = keys.down.isDown || keys.s.isDown || this.touchDown;

    if (!down) {
      this.softHeld = false;
      this.softTimer = 0;
      return;
    }

    if (!this.softHeld) {
      this.softHeld = true;
      this.softTimer = 0;
      this.world.softDrop();
      return;
    }

    this.softTimer += delta;

    let steps = 0;
    while (
      this.softTimer >= SOFT_DROP_INTERVAL_MS &&
      steps < 8
    ) {
      steps += 1;
      this.softTimer -= SOFT_DROP_INTERVAL_MS;
      this.world.softDrop();
    }
  }

  private hardDrop(): void {
    const active = this.world.active;
    if (!active || this.world.phase !== 'playing') {
      return;
    }

    const piece = active.type;
    const rotation = active.rotation;
    const originX = active.x;
    const startY = active.y;
    const distance = this.world.hardDrop();

    if (distance > 0) {
      this.drawDropTrail(piece, rotation, originX, startY, distance);
    }

    this.handleWorldEvents();
    this.sync();
  }

  private togglePause(): void {
    if (this.world.phase === 'gameover') {
      return;
    }

    this.setPaused(!this.paused);
  }

  private setPaused(paused: boolean): void {
    if (this.world.phase === 'gameover') {
      return;
    }

    if (this.paused === paused) {
      return;
    }

    this.paused = paused;
    this.resetRepeatState();
    this.clearTouchState();
    this.input.keyboard?.resetKeys();

    if (paused) {
      this.sounds?.pause();
      this.showOverlay('paused');
    } else {
      this.sounds?.resume();
      this.hideOverlay();
    }

    this.updatePauseLabel();
  }

  private resetRepeatState(): void {
    this.moveDirection = 0;
    this.moveTimer = 0;
    this.softHeld = false;
    this.softTimer = 0;
  }

  /* ---------------------------------------------------------------- */
  /* World events                                                      */
  /* ---------------------------------------------------------------- */

  private handleWorldEvents(): void {
    for (const event of this.world.consumeEvents()) {
      this.handleWorldEvent(event);
    }
  }

  private handleWorldEvent(event: WorldEvent): void {
    switch (event.type) {
      case 'move':
        this.sounds?.move();
        break;

      case 'rotate':
        this.sounds?.rotate();
        break;

      case 'hold':
        this.sounds?.hold();
        break;

      case 'harddrop':
        this.sounds?.hardDrop(event.distance);
        if (event.distance >= 5) {
          this.cameras.main.shake(
            Math.min(170, 60 + event.distance * 4),
            Math.min(0.006, 0.0012 + event.distance * 0.0002)
          );
        }
        break;

      case 'lock':
        this.sounds?.lock();
        break;

      case 'clear':
        this.beginClear(event);
        break;

      case 'perfect':
        this.showMessage('PERFECT CLEAR', UI.goldText, 1400);
        this.popText(
          `+${event.bonus}`,
          BOARD_X + BOARD_WIDTH / 2,
          BOARD_Y + BOARD_HEIGHT * 0.42,
          UI.goldText
        );
        this.cameras.main.shake(160, 0.004);
        break;

      case 'levelup':
        this.sounds?.levelUp();
        this.popText(
          `LEVEL ${event.level}`,
          BOARD_X + BOARD_WIDTH / 2,
          BOARD_Y + BOARD_HEIGHT * 0.3,
          UI.accentText
        );
        this.cameras.main.shake(120, 0.0025);
        break;

      case 'gameover':
        this.onGameOver();
        break;

      case 'spawn':
        break;
    }
  }

  private beginClear(event: Extract<WorldEvent, { type: 'clear' }>): void {
    this.clearing = true;
    this.clearingTimer = 0;
    this.clearingRows = [...event.rows];

    this.sounds?.lineClear(event.count);

    const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS!'];
    let label = names[event.count] ?? 'CLEAR';

    if (event.combo > 1) {
      label += `   ×${event.combo} COMBO`;
    }

    this.showMessage(
      label,
      event.count >= 4 ? UI.goldText : UI.greenText,
      1050
    );

    this.spawnClearParticles(event.rows);
    this.cameras.main.shake(
      event.count >= 4 ? 190 : 90,
      event.count >= 4 ? 0.006 : 0.0024
    );

    const points = event.base + event.comboBonus;
    const averageRow =
      event.rows.reduce((sum, row) => sum + row, 0) / event.rows.length;

    this.popText(
      `+${points}`,
      BOARD_X + BOARD_WIDTH / 2,
      BOARD_Y + (averageRow + 0.5) * CELL,
      event.count >= 4 ? UI.goldText : UI.greenText
    );
  }

  private updateClearing(delta: number): void {
    this.clearingTimer += delta;

    if (this.clearingTimer >= CLEAR_ANIMATION_MS) {
      this.clearing = false;
      this.clearingRows = [];
      this.clearingTimer = 0;
      this.clearGraphics.clear();

      this.world.completeLineClear();
      this.handleWorldEvents();
    }
  }

  private onGameOver(): void {
    if (this.gameOverShown) {
      return;
    }

    this.gameOverShown = true;
    this.paused = false;
    this.clearTouchState();
    this.resetRepeatState();

    if (this.messageTimer) {
      this.messageTimer.remove(false);
      this.messageTimer = null;
    }
    this.messageText.setText('').setAlpha(1);

    const newBest = this.world.score > this.startingBest;

    if (this.world.score > this.best) {
      this.best = this.world.score;
      this.bestDirty = true;
    }

    this.saveBest();
    this.sounds?.gameOver();
    this.showOverlay('gameover', newBest);
    this.syncHud(true);
  }

  private saveBest(): void {
    if (!this.bestDirty) {
      return;
    }

    saveBestScore(this.best);
    this.bestDirty = false;
  }

  private toggleMute(): void {
    if (!this.sounds) {
      return;
    }

    this.sounds.toggleMute();
    this.updateSoundLabel();
  }

  /* ---------------------------------------------------------------- */
  /* Frame sync                                                        */
  /* ---------------------------------------------------------------- */

  private sync(force = false): void {
    if (!this.world || !this.scoreText) {
      return;
    }

    if (
      force ||
      this.world.boardRevision !== this.lastBoardRevision
    ) {
      this.lastBoardRevision = this.world.boardRevision;
      this.drawSettled();
    }

    const activeSignature = this.getActiveSignature();
    if (force || activeSignature !== this.lastActiveSignature) {
      this.lastActiveSignature = activeSignature;
      this.drawActive();
    }

    if (this.clearing) {
      this.drawClearFx(
        clamp(this.clearingTimer / CLEAR_ANIMATION_MS, 0, 1)
      );
    } else {
      this.clearGraphics.clear();
    }

    this.syncPreviews(force);
    this.syncHud(force);
  }

  private drawSettled(): void {
    const graphics = this.boardGraphics;
    graphics.clear();

    const hiddenRows = this.clearing
      ? new Set(this.clearingRows)
      : null;

    for (let y = 0; y < ROWS; y += 1) {
      const hidePlayfield = hiddenRows?.has(y) ?? false;

      for (let x = 0; x < COLS; x += 1) {
        // The side walls are part of the board, but they are never cleared.
        // Keep them visible while the playfield row shrinks away.
        if (hidePlayfield && x >= PLAYFIELD_LEFT && x <= PLAYFIELD_RIGHT) {
          continue;
        }

        const value = this.world.board[y][x];
        if (value === EMPTY) {
          continue;
        }

        const pixelX = BOARD_X + x * CELL;
        const pixelY = BOARD_Y + y * CELL;

        if (value === WALL) {
          drawWallBlock(graphics, pixelX, pixelY, CELL);
          continue;
        }

        const type = TYPE_BY_CODE[value];
        if (type) {
          drawBlock(graphics, pixelX, pixelY, CELL, PIECES[type].color);
        }
      }
    }
  }

  private drawActive(): void {
    const graphics = this.activeGraphics;
    graphics.clear();

    const active = this.world.active;
    if (!active) {
      return;
    }

    const shape = PIECES[active.type].rotations[active.rotation];
    const color = PIECES[active.type].color;
    const ghostY = this.world.ghostY();

    if (ghostY !== active.y) {
      for (const [cellX, cellY] of shape.cells) {
        const x = active.x + cellX;
        const y = ghostY + cellY;

        if (y >= 0 && y < ROWS) {
          drawGhostBlock(
            graphics,
            BOARD_X + x * CELL,
            BOARD_Y + y * CELL,
            CELL,
            color
          );
        }
      }
    }

    for (const [cellX, cellY] of shape.cells) {
      const x = active.x + cellX;
      const y = active.y + cellY;

      if (y >= 0 && y < ROWS) {
        drawBlock(
          graphics,
          BOARD_X + x * CELL,
          BOARD_Y + y * CELL,
          CELL,
          color
        );
      }
    }
  }

  private drawClearFx(progress: number): void {
    const graphics = this.clearGraphics;
    graphics.clear();

    if (!this.clearing) {
      return;
    }

    const eased = progress * progress;
    const scale = 1 - eased * 0.9;
    const alpha = 1 - eased * 0.85;

    for (const row of this.clearingRows) {
      const rowY = BOARD_Y + row * CELL;

      // A brief bright beam across the completed row.
      graphics.fillStyle(0xffffff, 0.16 * (1 - progress));
      graphics.fillRect(
        BOARD_X + CELL,
        rowY + 4,
        BOARD_WIDTH - CELL * 2,
        CELL - 8
      );

      graphics.lineStyle(2, 0xffffff, 0.7 * (1 - progress));
      graphics.beginPath();
      graphics.moveTo(BOARD_X + CELL, rowY + CELL / 2);
      graphics.lineTo(BOARD_X + BOARD_WIDTH - CELL, rowY + CELL / 2);
      graphics.strokePath();

      for (let x = PLAYFIELD_LEFT; x <= PLAYFIELD_RIGHT; x += 1) {
        const value = this.world.board[row][x];
        const type = TYPE_BY_CODE[value];
        if (!type) {
          continue;
        }

        const size = CELL * scale;
        const centerX = BOARD_X + x * CELL + CELL / 2;
        const centerY = rowY + CELL / 2;

        drawBlock(
          graphics,
          centerX - size / 2,
          centerY - size / 2,
          size,
          PIECES[type].color,
          alpha
        );
      }
    }
  }

  private syncPreviews(force: boolean): void {
    const next = this.world.getNext(3);
    const signature = `${this.world.holdType ?? '-'}|${next.join('')}`;

    if (!force && signature === this.lastPreviewSignature) {
      return;
    }

    this.lastPreviewSignature = signature;
    this.holdGraphics.clear();
    this.nextGraphics.clear();

    if (this.world.holdType) {
      this.drawPreview(
        this.holdGraphics,
        this.world.holdType,
        HOLD_PREVIEW_X,
        PREVIEW_Y,
        21
      );
    }

    next.forEach((piece, index) => {
      this.drawPreview(
        this.nextGraphics,
        piece,
        NEXT_PREVIEW_X[index],
        PREVIEW_Y,
        19
      );
    });
  }

  private drawPreview(
    graphics: GameObjects.Graphics,
    type: PieceType,
    centerX: number,
    centerY: number,
    cellSize: number
  ): void {
    const shape = PIECES[type].rotations[0];
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const [cellX, cellY] of shape.cells) {
      minX = Math.min(minX, cellX);
      maxX = Math.max(maxX, cellX);
      minY = Math.min(minY, cellY);
      maxY = Math.max(maxY, cellY);
    }

    const width = (maxX - minX + 1) * cellSize;
    const height = (maxY - minY + 1) * cellSize;
    const originX = centerX - width / 2;
    const originY = centerY - height / 2;

    for (const [cellX, cellY] of shape.cells) {
      drawBlock(
        graphics,
        originX + (cellX - minX) * cellSize,
        originY + (cellY - minY) * cellSize,
        cellSize,
        PIECES[type].color
      );
    }
  }

  private syncHud(force = false): void {
    const world = this.world;

    if (force || world.score !== this.lastScore) {
      this.lastScore = world.score;
      this.scoreText.setText(pad(world.score, 6));

      if (world.score > this.best) {
        this.best = world.score;
        this.bestDirty = true;
      }
    }

    if (force || this.best !== this.lastBest) {
      this.lastBest = this.best;
      this.bestText.setText(pad(this.best, 6));
    }

    if (force || world.lines !== this.lastLines) {
      this.lastLines = world.lines;
      this.linesText.setText(pad(world.lines, 3));
    }

    if (force || world.level !== this.lastLevel) {
      this.lastLevel = world.level;
      this.levelText.setText(pad(world.level, 2));
    }

    if (force || world.combo !== this.lastCombo) {
      this.lastCombo = world.combo;
      this.comboText.setText(world.combo > 0 ? `×${world.combo}` : '—');
      this.comboText.setColor(
        world.combo > 1 ? UI.greenText : UI.dim
      );
    }

    this.updatePauseLabel();
  }

  private getActiveSignature(): string {
    const active = this.world.active;
    if (!active) {
      return '';
    }

    return [
      active.type,
      active.rotation,
      active.x,
      active.y,
      this.world.ghostY(),
    ].join(':');
  }

  /* ---------------------------------------------------------------- */
  /* Effects                                                           */
  /* ---------------------------------------------------------------- */

  private spawnClearParticles(rows: readonly number[]): void {
    for (const row of rows) {
      for (let x = PLAYFIELD_LEFT; x <= PLAYFIELD_RIGHT; x += 1) {
        const value = this.world.board[row][x];
        const type = TYPE_BY_CODE[value];
        const color = type ? PIECES[type].color : UI.accent;
        const pixelX = BOARD_X + x * CELL + CELL / 2;
        const pixelY = BOARD_Y + row * CELL + CELL / 2;

        this.spawnParticles(pixelX, pixelY, color, 3);
      }
    }
  }

  private spawnParticles(
    x: number,
    y: number,
    color: number,
    count: number
  ): void {
    for (let i = 0; i < count; i += 1) {
      const size = 3 + Math.random() * 5;
      const particle = this.add
        .rectangle(x, y, size, size, color, 0.95)
        .setDepth(8)
        .setAngle(Math.random() * 360);

      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 170;
      const gravity = 70 + Math.random() * 110;

      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed + gravity,
        angle: particle.angle + (Math.random() * 360 - 180),
        alpha: 0,
        scale: 0.25,
        duration: 340 + Math.random() * 300,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private drawDropTrail(
    piece: PieceType,
    rotation: number,
    originX: number,
    startY: number,
    distance: number
  ): void {
    const shape = PIECES[piece].rotations[rotation];
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;

    for (const [cellX] of shape.cells) {
      minX = Math.min(minX, originX + cellX);
      maxX = Math.max(maxX, originX + cellX);
    }

    const centerX = BOARD_X + ((minX + maxX + 1) / 2) * CELL;
    const top = Math.max(BOARD_Y, BOARD_Y + startY * CELL);
    const bottom = Math.min(
      BOARD_Y + BOARD_HEIGHT,
      BOARD_Y + (startY + distance + 1) * CELL
    );
    const height = bottom - top;

    if (height <= 0) {
      return;
    }

    const color = PIECES[piece].color;

    const trail = this.add
      .rectangle(
        centerX,
        (top + bottom) / 2,
        (maxX - minX + 1) * CELL * 0.72,
        height,
        color,
        0.16
      )
      .setDepth(6);

    const core = this.add
      .rectangle(
        centerX,
        (top + bottom) / 2,
        (maxX - minX + 1) * CELL * 0.22,
        height,
        shade(color, 70),
        0.28
      )
      .setDepth(6);

    this.tweens.add({
      targets: [trail, core],
      alpha: 0,
      scaleX: 0.4,
      duration: 240,
      ease: 'Quad.easeOut',
      onComplete: () => {
        trail.destroy();
        core.destroy();
      },
    });
  }

  private showMessage(
    text: string,
    color: string,
    duration: number
  ): void {
    this.messageText.setText(text);
    this.messageText.setColor(color);
    this.messageText.setAlpha(1);
    this.messageText.setScale(0.9);

    this.tweens.killTweensOf(this.messageText);
    this.tweens.add({
      targets: this.messageText,
      scale: 1,
      duration: 160,
      ease: 'Back.easeOut',
    });

    if (this.messageTimer) {
      this.messageTimer.remove(false);
    }

    this.messageTimer = this.time.delayedCall(duration, () => {
      this.tweens.add({
        targets: this.messageText,
        alpha: 0,
        duration: 260,
        ease: 'Quad.easeOut',
      });
    });
  }

  private popText(
    text: string,
    x: number,
    y: number,
    color: string
  ): void {
    const label = this.add
      .text(x, y, text, {
        fontFamily: FONT_FAMILY,
        fontSize: '26px',
        fontStyle: 'bold',
        color,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(12)
      .setShadow(0, 2, '#000000', 8, true, true);

    this.tweens.add({
      targets: label,
      y: y - 64,
      alpha: 0,
      duration: 950,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('gameCanvas');

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Tetris: the #gameCanvas element is missing.');
}

canvas.setAttribute('aria-label', 'Tetris game');
canvas.setAttribute('role', 'application');

const config: Phaser.Types.Core.GameConfig = {
  // Phaser needs an explicit renderer when the canvas comes from the page.
  type: Phaser.WEBGL,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  canvas,
  backgroundColor: '#040711',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
  },
  scene: [TetrisScene],
};

new Phaser.Game(config);

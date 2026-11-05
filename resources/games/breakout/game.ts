/**
 * Breakout / Arkanoid — a Phaser 4 port of Breakout-Arkanoid/BreakoutGame.py
 *
 * The original drives a Pymunk space at a fixed 120 Hz. Phaser's Arcade
 * Physics is deliberately not used here: this port reproduces the original
 * rules (constant ball speed, a paddle hit that sets the outgoing angle from
 * the hit offset, one point value per brick row) with a tiny fixed-step world
 * simulation. Phaser handles rendering, input and the game loop.
 *
 * Coordinates are screen coordinates: the origin is the top-left corner and
 * y grows downwards. The Pyglet original uses a bottom-left origin, so every
 * vertical position below is the original value converted with `900 - y`.
 *
 * Controls
 *   LEFT / A, RIGHT / D   move the paddle
 *   SPACE                 launch the ball (or restart after game over)
 *   R                     restart
 *   ESC                   pause / resume (the browser cannot quit itself)
 *   M                     mute / unmute the synthesized brick pops
 *
 * Brick pops and paddle thumps are generated with the Web Audio API; see
 * sounds.ts.
 */

import Phaser, { GameObjects, Scene } from 'phaser';
import { BreakoutSounds } from './sounds';
import './styles.css';

/* ------------------------------------------------------------------ */
/* Tunables                                                           */
/* ------------------------------------------------------------------ */

const CONFIG = Object.freeze({
  width: 1280,
  height: 900,

  // Playfield. The 100 px strip above it holds the HUD.
  field: Object.freeze({ left: 50, right: 1230, top: 100, bottom: 850 }),
  wallRadius: 4,

  ballRadius: 10,
  ballSpeed: 600,
  ballStartY: 780,

  paddleWidth: 100,
  paddleHeight: 16,
  paddleY: 800,
  paddleSpeed: 700,
  paddleMaxAngle: Math.PI / 3, // 60 degrees from vertical

  brickColumns: 10,
  brickRows: 10,
  brickWidth: 100,
  brickHeight: 18,
  brickGapX: 10,
  brickGapY: 12,
  brickTop: 120, // centre of the top row
  brickLeft: 95, // left edge of the leftmost brick

  startingLives: 3,

  // Physics runs at a fixed rate, independent of the render rate.
  fixedDt: 1 / 120,
  maxFrameTime: 0.25, // avoid a huge catch-up after a stalled frame
} as const);

const FIELD = CONFIG.field;

const STATE = {
  READY: 'ready',
  PLAYING: 'playing',
  GAME_OVER: 'game-over',
  WON: 'won',
} as const;

type GameState = (typeof STATE)[keyof typeof STATE];

// One colour per brick row, top to bottom.
const BRICK_COLORS = [
  0xef476f,
  0xf77448,
  0xffa630,
  0xffd166,
  0xaad648,
  0x4cc9b0,
  0x40c4ff,
  0x4895ef,
  0x8369dd,
  0xd65db1,
] as const;

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function lighten(color: number, amount = 55): number {
  const r = Math.min(255, ((color >> 16) & 0xff) + amount);
  const g = Math.min(255, ((color >> 8) & 0xff) + amount);
  const b = Math.min(255, (color & 0xff) + amount);
  return (r << 16) | (g << 8) | b;
}

function formatScore(score: number): string {
  return String(score).padStart(6, '0');
}

/* ------------------------------------------------------------------ */
/* Simulation                                                         */
/* ------------------------------------------------------------------ */

interface Paddle {
  x: number;
  direction: number;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface Brick {
  id: number;
  row: number;
  column: number;
  x: number;
  y: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  color: number;
  edgeColor: number;
  points: number;
  alive: boolean;
}

interface CollisionNormal {
  x: number;
  y: number;
  depth: number;
}

type RandomFn = () => number;
type PaddleHitHandler = (offset: number, x: number) => void;

/**
 * The whole game simulation, with no Phaser dependency.
 *
 * The scene reads `ball`, `paddle`, `bricks`, `score`, `lives` and `state`
 * after calling `update()`.
 */
export class BreakoutWorld {
  readonly random: RandomFn;
  readonly onPaddleHit: PaddleHitHandler | null;

  score = 0;
  lives: number = CONFIG.startingLives;
  state: GameState = STATE.READY;
  accumulator = 0;
  paddle: Paddle = { x: CONFIG.width / 2, direction: 0 };
  ball: Ball = {
    x: CONFIG.width / 2,
    y: CONFIG.ballStartY,
    vx: 0,
    vy: 0,
    radius: CONFIG.ballRadius,
  };
  bricks: Brick[] = [];
  remainingBricks = 0;

  constructor(
    random: RandomFn = Math.random,
    onPaddleHit: PaddleHitHandler | null = null
  ) {
    this.random = random;
    this.onPaddleHit =
      typeof onPaddleHit === 'function' ? onPaddleHit : null;
    this.reset();
  }

  /** Start a completely new game (score, lives and brick wall). */
  reset(): void {
    this.score = 0;
    this.lives = CONFIG.startingLives;
    this.state = STATE.READY;
    this.accumulator = 0;
    this.paddle = {
      x: CONFIG.width / 2,
      direction: 0,
    };
    this.ball = {
      x: this.paddle.x,
      y: CONFIG.ballStartY,
      vx: 0,
      vy: 0,
      radius: CONFIG.ballRadius,
    };
    this.buildBricks();
    this.resetBall();
  }

  buildBricks(): void {
    this.bricks = [];
    this.remainingBricks = 0;
    let id = 0;

    for (let row = 0; row < CONFIG.brickRows; row += 1) {
      const color = BRICK_COLORS[row % BRICK_COLORS.length];

      for (let column = 0; column < CONFIG.brickColumns; column += 1) {
        const x =
          CONFIG.brickLeft +
          CONFIG.brickWidth / 2 +
          column * (CONFIG.brickWidth + CONFIG.brickGapX);
        const y =
          CONFIG.brickTop +
          row * (CONFIG.brickHeight + CONFIG.brickGapY);

        this.bricks.push({
          id: id++,
          row,
          column,
          x,
          y,
          left: x - CONFIG.brickWidth / 2,
          right: x + CONFIG.brickWidth / 2,
          top: y - CONFIG.brickHeight / 2,
          bottom: y + CONFIG.brickHeight / 2,
          color,
          edgeColor: lighten(color),
          points: (CONFIG.brickRows - row) * 10,
          alive: true,
        });
      }
    }

    this.remainingBricks = this.bricks.length;
  }

  /** Put the ball back on the paddle, ready for another launch. */
  resetBall(): void {
    this.ball.x = this.paddle.x;
    this.ball.y = CONFIG.ballStartY;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.state = STATE.READY;
  }

  isRunning(): boolean {
    return this.state === STATE.READY || this.state === STATE.PLAYING;
  }

  isFinished(): boolean {
    return this.state === STATE.GAME_OVER || this.state === STATE.WON;
  }

  setPaddleDirection(direction: number): void {
    this.paddle.direction = clamp(direction, -1, 1);
  }

  /** Launch the ball upwards at a random angle between 55 and 125 degrees. */
  launch(): boolean {
    if (this.state !== STATE.READY) {
      return false;
    }

    const angle = (55 + this.random() * 70) * (Math.PI / 180);
    this.ball.vx = Math.cos(angle) * CONFIG.ballSpeed;
    this.ball.vy = -Math.sin(angle) * CONFIG.ballSpeed;
    this.state = STATE.PLAYING;
    return true;
  }

  /**
   * Advance by `deltaMs`, running as many fixed 120 Hz steps as needed.
   * Returns the number of steps that were simulated.
   */
  update(deltaMs: number): number {
    if (!this.isRunning()) {
      return 0;
    }

    const seconds = clamp(deltaMs / 1000, 0, CONFIG.maxFrameTime);
    this.accumulator = Math.min(
      this.accumulator + seconds,
      CONFIG.maxFrameTime
    );

    let steps = 0;
    while (this.accumulator >= CONFIG.fixedDt && steps < 240) {
      this.step(CONFIG.fixedDt);
      this.accumulator -= CONFIG.fixedDt;
      steps += 1;

      if (!this.isRunning()) {
        break;
      }
    }

    return steps;
  }

  step(dt: number): void {
    if (!this.isRunning()) {
      return;
    }

    this.movePaddle(dt);

    if (this.state === STATE.READY) {
      this.holdBall();
      return;
    }

    this.moveBall(dt);
  }

  movePaddle(dt: number): void {
    const half = CONFIG.paddleWidth / 2;
    const minX = FIELD.left + CONFIG.wallRadius + half;
    const maxX = FIELD.right - CONFIG.wallRadius - half;

    this.paddle.x = clamp(
      this.paddle.x + this.paddle.direction * CONFIG.paddleSpeed * dt,
      minX,
      maxX
    );
  }

  holdBall(): void {
    this.ball.x = this.paddle.x;
    this.ball.y = CONFIG.ballStartY;
    this.ball.vx = 0;
    this.ball.vy = 0;
  }

  moveBall(dt: number): void {
    const ball = this.ball;

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    this.collideWalls();
    this.collidePaddle();
    this.collideBricks();
    this.checkBottom();

    if (this.state === STATE.PLAYING) {
      this.keepBallMoving();
    }
  }

  collideWalls(): void {
    const ball = this.ball;
    const radius = ball.radius;
    const minX = FIELD.left + CONFIG.wallRadius + radius;
    const maxX = FIELD.right - CONFIG.wallRadius - radius;
    const minY = FIELD.top + CONFIG.wallRadius + radius;

    if (ball.x < minX) {
      ball.x = minX;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x > maxX) {
      ball.x = maxX;
      ball.vx = -Math.abs(ball.vx);
    }

    if (ball.y < minY) {
      ball.y = minY;
      ball.vy = Math.abs(ball.vy);
    }
  }

  collidePaddle(): void {
    const ball = this.ball;

    // Only a ball that is falling and is still above the paddle centre can
    // be caught. A ball that has fallen past the paddle is already lost.
    if (ball.vy <= 0 || ball.y >= CONFIG.paddleY) {
      return;
    }

    const halfWidth = CONFIG.paddleWidth / 2;
    const halfHeight = CONFIG.paddleHeight / 2;
    const left = this.paddle.x - halfWidth;
    const right = this.paddle.x + halfWidth;
    const top = CONFIG.paddleY - halfHeight;
    const bottom = CONFIG.paddleY + halfHeight;

    const nearestX = clamp(ball.x, left, right);
    const nearestY = clamp(ball.y, top, bottom);
    const dx = ball.x - nearestX;
    const dy = ball.y - nearestY;

    if (dx * dx + dy * dy > ball.radius * ball.radius) {
      return;
    }

    // Paddle centre sends the ball straight up; the edges send it out at
    // up to 60 degrees, exactly like the Pyglet version.
    const offset = clamp((ball.x - this.paddle.x) / halfWidth, -1, 1);
    const angle = offset * CONFIG.paddleMaxAngle;

    ball.y = top - ball.radius - 0.01;
    ball.vx = Math.sin(angle) * CONFIG.ballSpeed;
    ball.vy = -Math.cos(angle) * CONFIG.ballSpeed;

    if (this.onPaddleHit) {
      this.onPaddleHit(offset, ball.x);
    }
  }

  collideBricks(): void {
    const ball = this.ball;
    const radius = ball.radius;
    let hitCount = 0;
    let bestNormal: CollisionNormal | null = null;

    for (const brick of this.bricks) {
      if (!brick.alive) {
        continue;
      }

      // Cheap AABB rejection before the circle/rectangle test.
      if (
        ball.x + radius < brick.left ||
        ball.x - radius > brick.right ||
        ball.y + radius < brick.top ||
        ball.y - radius > brick.bottom
      ) {
        continue;
      }

      const nearestX = clamp(ball.x, brick.left, brick.right);
      const nearestY = clamp(ball.y, brick.top, brick.bottom);
      const dx = ball.x - nearestX;
      const dy = ball.y - nearestY;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq > radius * radius) {
        continue;
      }

      let nx = 0;
      let ny = 0;
      let depth = 0;

      if (distanceSq > 1e-8) {
        const distance = Math.sqrt(distanceSq);
        nx = dx / distance;
        ny = dy / distance;
        depth = radius - distance;
      } else {
        // The centre is inside the brick: leave through the nearest face.
        const toLeft = ball.x - brick.left;
        const toRight = brick.right - ball.x;
        const toTop = ball.y - brick.top;
        const toBottom = brick.bottom - ball.y;
        const smallest = Math.min(toLeft, toRight, toTop, toBottom);

        if (smallest === toLeft) {
          nx = -1;
          ny = 0;
          depth = toLeft + radius;
        } else if (smallest === toRight) {
          nx = 1;
          ny = 0;
          depth = toRight + radius;
        } else if (smallest === toTop) {
          nx = 0;
          ny = -1;
          depth = toTop + radius;
        } else {
          nx = 0;
          ny = 1;
          depth = toBottom + radius;
        }
      }

      brick.alive = false;
      this.remainingBricks -= 1;
      this.score += brick.points;
      hitCount += 1;

      if (!bestNormal || depth > bestNormal.depth) {
        bestNormal = { x: nx, y: ny, depth };
      }
    }

    if (hitCount === 0) {
      return;
    }

    if (this.remainingBricks <= 0) {
      this.state = STATE.WON;
      ball.vx = 0;
      ball.vy = 0;
      return;
    }

    if (bestNormal) {
      const dot = ball.vx * bestNormal.x + ball.vy * bestNormal.y;

      // Reflect only when the ball is still moving into the brick.
      if (dot < 0) {
        ball.vx -= 2 * dot * bestNormal.x;
        ball.vy -= 2 * dot * bestNormal.y;
      }

      ball.x += bestNormal.x * (bestNormal.depth + 0.01);
      ball.y += bestNormal.y * (bestNormal.depth + 0.01);
    }
  }

  checkBottom(): void {
    if (
      this.state === STATE.PLAYING &&
      this.ball.y - this.ball.radius > FIELD.bottom
    ) {
      this.loseLife();
    }
  }

  loseLife(): void {
    this.lives = Math.max(0, this.lives - 1);

    if (this.lives === 0) {
      this.state = STATE.GAME_OVER;
      this.ball.vx = 0;
      this.ball.vy = 0;
      return;
    }

    this.resetBall();
  }

  /**
   * Keep the ball at the original constant speed and prevent a nearly
   * horizontal trajectory from bouncing between the side walls forever.
   */
  keepBallMoving(): void {
    const ball = this.ball;
    let speed = Math.hypot(ball.vx, ball.vy);

    if (speed < 1e-6) {
      ball.vx = 0;
      ball.vy = -CONFIG.ballSpeed;
      return;
    }

    ball.vx *= CONFIG.ballSpeed / speed;
    ball.vy *= CONFIG.ballSpeed / speed;

    const minVertical = CONFIG.ballSpeed * 0.18;
    if (Math.abs(ball.vy) < minVertical) {
      ball.vy = ball.vy < 0 ? -minVertical : minVertical;

      speed = Math.hypot(ball.vx, ball.vy);
      ball.vx *= CONFIG.ballSpeed / speed;
      ball.vy *= CONFIG.ballSpeed / speed;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Phaser scene                                                       */
/* ------------------------------------------------------------------ */

const FONT_FAMILY = '"Trebuchet MS", "Segoe UI", Arial, sans-serif';

const TEXT_COLOR = '#ebf0ff';
const MUTED_COLOR = '#647091';
const TITLE_COLOR = '#526491';
const READY_COLOR = '#8cdcff';
const GOLD_COLOR = '#ffd666';
const DANGER_COLOR = '#ff646e';
const SUB_COLOR = '#bec8e1';

interface BreakoutKeys {
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
  r: Phaser.Input.Keyboard.Key;
  esc: Phaser.Input.Keyboard.Key;
  m: Phaser.Input.Keyboard.Key;
}

// One audio context per page, reused across scene restarts.
let sharedSounds: BreakoutSounds | null = null;

export class BreakoutScene extends Scene {
  private world!: BreakoutWorld;
  private sounds: BreakoutSounds | null = null;
  private brickSprites = new Map<number, GameObjects.Rectangle>();
  private paddle!: GameObjects.Rectangle;
  private ball!: GameObjects.Arc;

  private scoreText!: GameObjects.Text;
  private livesText!: GameObjects.Text;
  private readyText!: GameObjects.Text;
  private fpsText!: GameObjects.Text;
  private soundText!: GameObjects.Text;
  private messageText!: GameObjects.Text;
  private subText!: GameObjects.Text;
  private overlay!: GameObjects.Container;

  private keys: BreakoutKeys | null = null;
  private paused = false;
  private lastScore = -1;
  private lastLives = -1;
  private lastFpsUpdate = 0;
  private onWindowBlur: (() => void) | null = null;

  constructor() {
    super({ key: 'BreakoutScene' });
  }

  create(): void {
    this.sounds = this.createAudio();
    this.world = new BreakoutWorld(Math.random, (offset, x) => {
      this.sounds?.popPaddle(offset, x, CONFIG.width);
    });
    this.brickSprites = new Map();
    this.paused = false;
    this.lastScore = -1;
    this.lastLives = -1;
    this.lastFpsUpdate = 0;

    this.drawBackdrop();
    this.drawBricks();
    this.createActors();
    this.createHud();
    this.createOverlay();
    this.bindInput();

    this.sync(0);
  }

  private createAudio(): BreakoutSounds | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const audioWindow = window as Window & {
      webkitAudioContext?: typeof AudioContext;
    };

    if (!window.AudioContext && !audioWindow.webkitAudioContext) {
      return null;
    }

    if (!sharedSounds) {
      try {
        sharedSounds = new BreakoutSounds();
      } catch (error) {
        console.warn('Breakout audio is unavailable:', error);
        return null;
      }
    }

    return sharedSounds;
  }

  /* ---------------------------------------------------------------- */
  /* Rendering                                                        */
  /* ---------------------------------------------------------------- */

  private drawBackdrop(): void {
    const g = this.add.graphics().setDepth(0);

    // Full-window backdrop, then the slightly lighter playfield.
    g.fillStyle(0x070912, 1);
    g.fillRect(0, 0, CONFIG.width, CONFIG.height);

    g.fillStyle(0x0d1120, 1);
    g.fillRect(
      FIELD.left,
      FIELD.top,
      FIELD.right - FIELD.left,
      FIELD.bottom - FIELD.top
    );
    g.lineStyle(2, 0x243052, 1);
    g.strokeRect(
      FIELD.left,
      FIELD.top,
      FIELD.right - FIELD.left,
      FIELD.bottom - FIELD.top
    );

    // Walls: a soft wide line under a brighter thin one, for a subtle glow.
    const walls = this.add.graphics().setDepth(1);
    const segments: ReadonlyArray<
      readonly [number, number, number, number]
    > = [
      [FIELD.left, FIELD.top, FIELD.left, FIELD.bottom],
      [FIELD.left, FIELD.top, FIELD.right, FIELD.top],
      [FIELD.right, FIELD.top, FIELD.right, FIELD.bottom],
    ];

    for (const [x1, y1, x2, y2] of segments) {
      walls.lineStyle(14, 0x2d4b91, 0.18);
      walls.beginPath();
      walls.moveTo(x1, y1);
      walls.lineTo(x2, y2);
      walls.strokePath();

      walls.lineStyle(CONFIG.wallRadius * 2, 0x5880c8, 1);
      walls.beginPath();
      walls.moveTo(x1, y1);
      walls.lineTo(x2, y2);
      walls.strokePath();
    }

    // The bottom is the "lost ball" line rather than a bouncy wall.
    walls.lineStyle(3, 0xbe4664, 1);
    walls.beginPath();
    walls.moveTo(FIELD.left, FIELD.bottom);
    walls.lineTo(FIELD.right, FIELD.bottom);
    walls.strokePath();
  }

  private drawBricks(): void {
    for (const brick of this.world.bricks) {
      const sprite = this.add
        .rectangle(
          brick.x,
          brick.y,
          CONFIG.brickWidth,
          CONFIG.brickHeight,
          brick.color
        )
        .setStrokeStyle(2, brick.edgeColor)
        .setDepth(2);

      this.brickSprites.set(brick.id, sprite);
    }
  }

  private createActors(): void {
    this.paddle = this.add
      .rectangle(
        this.world.paddle.x,
        CONFIG.paddleY,
        CONFIG.paddleWidth,
        CONFIG.paddleHeight,
        0x28aacd
      )
      .setStrokeStyle(2, 0x96ebff)
      .setDepth(4);

    this.ball = this.add
      .circle(this.world.ball.x, this.world.ball.y, CONFIG.ballRadius, 0xffeea0)
      .setDepth(5);
  }

  private createHud(): void {
    const controls = this.sounds
      ? 'LEFT / A   RIGHT / D   move        SPACE   launch        R   restart        ESC   pause        M   mute'
      : 'LEFT / A   RIGHT / D   move        SPACE   launch        R   restart        ESC   pause';

    this.scoreText = this.add
      .text(FIELD.left, 50, 'SCORE  000000', {
        fontFamily: FONT_FAMILY,
        fontSize: '26px',
        fontStyle: 'bold',
        color: TEXT_COLOR,
      })
      .setOrigin(0, 0.5)
      .setDepth(10);

    this.add
      .text(CONFIG.width / 2, 50, 'BREAKOUT', {
        fontFamily: FONT_FAMILY,
        fontSize: '24px',
        fontStyle: 'bold',
        color: TITLE_COLOR,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(10);

    this.livesText = this.add
      .text(FIELD.right, 50, 'LIVES  3', {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        fontStyle: 'bold',
        color: TEXT_COLOR,
      })
      .setOrigin(1, 0.5)
      .setDepth(10);

    this.add
      .text(CONFIG.width / 2, 876, controls, {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        color: MUTED_COLOR,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(10);

    this.readyText = this.add
      .text(CONFIG.width / 2, 430, 'PRESS SPACE TO LAUNCH', {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        fontStyle: 'bold',
        color: READY_COLOR,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(12);

    this.fpsText = this.add
      .text(FIELD.right, 878, '0 FPS', {
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
        color: '#6e7a9b',
      })
      .setOrigin(1, 0.5)
      .setDepth(10);

    this.soundText = this.add
      .text(
        FIELD.left,
        878,
        this.sounds?.isMuted() ? 'SOUND OFF' : 'SOUND ON',
        {
          fontFamily: FONT_FAMILY,
          fontSize: '12px',
          color: '#6e7a9b',
        }
      )
      .setOrigin(0, 0.5)
      .setDepth(10)
      .setVisible(Boolean(this.sounds));
  }

  private createOverlay(): void {
    const dim = this.add.rectangle(
      (FIELD.left + FIELD.right) / 2,
      (FIELD.top + FIELD.bottom) / 2,
      FIELD.right - FIELD.left,
      FIELD.bottom - FIELD.top,
      0x040710,
      0.8
    );

    this.messageText = this.add
      .text(CONFIG.width / 2, 420, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '52px',
        fontStyle: 'bold',
        color: GOLD_COLOR,
      })
      .setOrigin(0.5, 0.5);

    this.subText = this.add
      .text(CONFIG.width / 2, 485, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        color: SUB_COLOR,
      })
      .setOrigin(0.5, 0.5);

    this.overlay = this.add
      .container(0, 0, [dim, this.messageText, this.subText])
      .setDepth(20)
      .setVisible(false);
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                            */
  /* ---------------------------------------------------------------- */

  private bindInput(): void {
    this.keys = null;

    const keyboard = this.input.keyboard;

    if (!keyboard) {
      return;
    }

    this.keys = keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      r: Phaser.Input.Keyboard.KeyCodes.R,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
      m: Phaser.Input.Keyboard.KeyCodes.M,
    }) as BreakoutKeys;

    // Don't leave the paddle moving if the window loses focus mid-press.
    this.onWindowBlur = () => {
      this.world.setPaddleDirection(0);
      this.input.keyboard?.resetKeys();
    };
    window.addEventListener('blur', this.onWindowBlur);

    this.events.once('shutdown', () => {
      if (this.onWindowBlur) {
        window.removeEventListener('blur', this.onWindowBlur);
      }
    });
  }

  update(time: number, delta: number): void {
    if (!this.keys) {
      this.sync(time);
      return;
    }

    const keys = this.keys;

    // ESC pauses/resumes. There is no window to close in a browser.
    if (
      Phaser.Input.Keyboard.JustDown(keys.esc) &&
      (this.world.state === STATE.READY ||
        this.world.state === STATE.PLAYING)
    ) {
      this.paused = !this.paused;
      this.world.setPaddleDirection(0);
    }

    if (Phaser.Input.Keyboard.JustDown(keys.r)) {
      this.scene.restart();
      return;
    }

    if (this.sounds && Phaser.Input.Keyboard.JustDown(keys.m)) {
      const muted = this.sounds.toggleMute();
      this.soundText.setText(muted ? 'SOUND OFF' : 'SOUND ON');
    }

    if (this.paused) {
      // Consume SPACE so a press made while paused cannot launch on resume.
      Phaser.Input.Keyboard.JustDown(keys.space);
      this.sync(time);
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(keys.space)) {
      if (this.world.state === STATE.READY) {
        this.world.launch();
      } else if (this.world.isFinished()) {
        this.scene.restart();
        return;
      }
    }

    let direction = 0;
    if (keys.left.isDown || keys.a.isDown) {
      direction -= 1;
    }
    if (keys.right.isDown || keys.d.isDown) {
      direction += 1;
    }

    this.world.setPaddleDirection(direction);
    this.world.update(delta);
    this.sync(time);
  }

  /* ---------------------------------------------------------------- */
  /* View sync                                                        */
  /* ---------------------------------------------------------------- */

  private sync(time: number): void {
    const world = this.world;

    this.paddle.setPosition(world.paddle.x, CONFIG.paddleY);

    const ballVisible =
      world.state === STATE.READY || world.state === STATE.PLAYING;
    this.ball.setPosition(world.ball.x, world.ball.y).setVisible(ballVisible);

    for (const brick of world.bricks) {
      if (!brick.alive) {
        const sprite = this.brickSprites.get(brick.id);
        if (sprite && sprite.visible) {
          sprite.setVisible(false);

          this.sounds?.popBrick(brick, CONFIG.width);
        }
      }
    }

    if (world.score !== this.lastScore) {
      this.lastScore = world.score;
      this.scoreText.setText(`SCORE  ${formatScore(world.score)}`);
    }

    if (world.lives !== this.lastLives) {
      this.lastLives = world.lives;
      this.livesText.setText(`LIVES  ${world.lives}`);
    }

    this.readyText.setVisible(world.state === STATE.READY && !this.paused);

    const showOverlay = this.paused || world.isFinished();
    this.overlay.setVisible(showOverlay);

    if (showOverlay) {
      if (this.paused) {
        this.messageText.setText('PAUSED').setColor(READY_COLOR);
        this.subText.setText('Press ESC to resume');
      } else if (world.state === STATE.GAME_OVER) {
        this.messageText.setText('GAME OVER').setColor(DANGER_COLOR);
        this.subText.setText('Press R (or SPACE) to play again');
      } else {
        this.messageText.setText('BOARD CLEARED!').setColor(GOLD_COLOR);
        this.subText.setText('Press R (or SPACE) to play again');
      }
    }

    if (time - this.lastFpsUpdate >= 250) {
      this.lastFpsUpdate = time;
      const fps = Math.round(this.game.loop.actualFps || 0);
      this.fpsText.setText(`${fps} FPS`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('gameCanvas');

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Breakout: the #gameCanvas element is missing.');
}

const config: Phaser.Types.Core.GameConfig = {
  // Phaser requires an explicit renderer when the canvas is supplied by the
  // page. WEBGL matches the other games in this project.
  type: Phaser.WEBGL,
  width: CONFIG.width,
  height: CONFIG.height,
  canvas,
  backgroundColor: '#070912',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
  },
  scene: [BreakoutScene],
};

new Phaser.Game(config);

export { CONFIG, STATE, BRICK_COLORS };
export type { Brick, Ball, Paddle, GameState };

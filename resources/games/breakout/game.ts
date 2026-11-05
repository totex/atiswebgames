'use strict';

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
 * sounds.js.
 */

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
});

const FIELD = CONFIG.field;

const STATE = Object.freeze({
  READY: 'ready',
  PLAYING: 'playing',
  GAME_OVER: 'game-over',
  WON: 'won',
});

// One colour per brick row, top to bottom.
const BRICK_COLORS = Object.freeze([
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
]);

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function lighten(color, amount = 55) {
  const r = Math.min(255, ((color >> 16) & 0xff) + amount);
  const g = Math.min(255, ((color >> 8) & 0xff) + amount);
  const b = Math.min(255, (color & 0xff) + amount);
  return (r << 16) | (g << 8) | b;
}

function formatScore(score) {
  return String(score).padStart(6, '0');
}

/* ------------------------------------------------------------------ */
/* Simulation                                                         */
/* ------------------------------------------------------------------ */

/**
 * The whole game simulation, with no Phaser dependency.
 *
 * The scene reads `ball`, `paddle`, `bricks`, `score`, `lives` and `state`
 * after calling `update()`. This keeps the rules testable in plain Node.
 */
class BreakoutWorld {
  constructor(random = Math.random, onPaddleHit = null) {
    this.random = random;
    this.onPaddleHit =
      typeof onPaddleHit === 'function' ? onPaddleHit : null;
    this.reset();
  }

  /** Start a completely new game (score, lives and brick wall). */
  reset() {
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

  buildBricks() {
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
  resetBall() {
    this.ball.x = this.paddle.x;
    this.ball.y = CONFIG.ballStartY;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.state = STATE.READY;
  }

  isRunning() {
    return this.state === STATE.READY || this.state === STATE.PLAYING;
  }

  isFinished() {
    return this.state === STATE.GAME_OVER || this.state === STATE.WON;
  }

  setPaddleDirection(direction) {
    this.paddle.direction = clamp(direction, -1, 1);
  }

  /** Launch the ball upwards at a random angle between 55 and 125 degrees. */
  launch() {
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
  update(deltaMs) {
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

  step(dt) {
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

  movePaddle(dt) {
    const half = CONFIG.paddleWidth / 2;
    const minX = FIELD.left + CONFIG.wallRadius + half;
    const maxX = FIELD.right - CONFIG.wallRadius - half;

    this.paddle.x = clamp(
      this.paddle.x + this.paddle.direction * CONFIG.paddleSpeed * dt,
      minX,
      maxX
    );
  }

  holdBall() {
    this.ball.x = this.paddle.x;
    this.ball.y = CONFIG.ballStartY;
    this.ball.vx = 0;
    this.ball.vy = 0;
  }

  moveBall(dt) {
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

  collideWalls() {
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

  collidePaddle() {
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

  collideBricks() {
    const ball = this.ball;
    const radius = ball.radius;
    let hitCount = 0;
    let bestNormal = null;

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

      let nx;
      let ny;
      let depth;

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

  checkBottom() {
    if (
      this.state === STATE.PLAYING &&
      this.ball.y - this.ball.radius > FIELD.bottom
    ) {
      this.loseLife();
    }
  }

  loseLife() {
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
  keepBallMoving() {
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

// Allows this file to be required from Node for the logic tests. In the
// browser Phaser is present and the real Scene base class is used.
const SceneBase =
  typeof Phaser !== 'undefined' && Phaser.Scene ? Phaser.Scene : class {};

const FONT_FAMILY = '"Trebuchet MS", "Segoe UI", Arial, sans-serif';

const TEXT_COLOR = '#ebf0ff';
const MUTED_COLOR = '#647091';
const TITLE_COLOR = '#526491';
const READY_COLOR = '#8cdcff';
const GOLD_COLOR = '#ffd666';
const DANGER_COLOR = '#ff646e';
const SUB_COLOR = '#bec8e1';

class BreakoutScene extends SceneBase {
  constructor() {
    super({ key: 'BreakoutScene' });
  }

  create() {
    this.sounds = this.createAudio();
    this.world = new BreakoutWorld(Math.random, (offset, x) => {
      if (this.sounds) {
        this.sounds.popPaddle(offset, x, CONFIG.width);
      }
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

  createAudio() {
    if (
      typeof window === 'undefined' ||
      !window.BreakoutSounds ||
      (!window.AudioContext && !window.webkitAudioContext)
    ) {
      return null;
    }

    try {
      // One context for the whole page, reused across scene restarts.
      if (!window.breakoutSounds) {
        window.breakoutSounds = new window.BreakoutSounds();
      }

      return window.breakoutSounds;
    } catch (error) {
      console.warn('Breakout audio is unavailable:', error);
      return null;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Rendering                                                        */
  /* ---------------------------------------------------------------- */

  drawBackdrop() {
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
    const segments = [
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

  drawBricks() {
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

  createActors() {
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

  createHud() {
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

    this.titleText = this.add
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

    this.controlsText = this.add
      .text(
        CONFIG.width / 2,
        876,
        controls,
        {
          fontFamily: FONT_FAMILY,
          fontSize: '13px',
          color: MUTED_COLOR,
        }
      )
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
        this.sounds && this.sounds.isMuted() ? 'SOUND OFF' : 'SOUND ON',
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

  createOverlay() {
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

  bindInput() {
    this.keys = null;

    if (!this.input.keyboard) {
      return;
    }

    this.keys = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      r: Phaser.Input.Keyboard.KeyCodes.R,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
      m: Phaser.Input.Keyboard.KeyCodes.M,
    });

    // Don't leave the paddle moving if the window loses focus mid-press.
    this.onWindowBlur = () => {
      this.world.setPaddleDirection(0);
      if (this.input && this.input.keyboard && this.input.keyboard.resetKeys) {
        this.input.keyboard.resetKeys();
      }
    };
    window.addEventListener('blur', this.onWindowBlur);

    this.events.once('shutdown', () => {
      window.removeEventListener('blur', this.onWindowBlur);
    });
  }

  update(time, delta) {
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

  sync(time) {
    const world = this.world;

    this.paddle.setPosition(world.paddle.x, CONFIG.paddleY);

    const ballVisible =
      world.state === STATE.READY || world.state === STATE.PLAYING;
    this.ball
      .setPosition(world.ball.x, world.ball.y)
      .setVisible(ballVisible);

    for (const brick of world.bricks) {
      if (!brick.alive) {
        const sprite = this.brickSprites.get(brick.id);
        if (sprite && sprite.visible) {
          sprite.setVisible(false);

          if (this.sounds) {
            this.sounds.popBrick(brick, CONFIG.width);
          }
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

    if (time !== undefined && time - this.lastFpsUpdate >= 250) {
      this.lastFpsUpdate = time;
      const fps = Math.round(this.game.loop.actualFps || 0);
      this.fpsText.setText(`${fps} FPS`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */

function bootGame() {
  const shell = document.getElementById('game-shell');

  if (!shell) {
    return;
  }

  if (typeof Phaser === 'undefined') {
    shell.innerHTML =
      '<p class="load-error">Could not load Phaser. Check your connection and reload the page.</p>';
    return;
  }

  window.breakoutGame = new Phaser.Game({
    type: Phaser.AUTO,
    width: CONFIG.width,
    height: CONFIG.height,
    parent: 'game-shell',
    backgroundColor: '#070912',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
    },
    scene: [BreakoutScene],
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'complete') {
    bootGame();
  } else {
    window.addEventListener('load', bootGame, { once: true });
  }
}

// Exported only when this file is loaded by Node for the logic tests.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BreakoutWorld,
    BreakoutScene,
    CONFIG,
    STATE,
    BRICK_COLORS,
  };
}

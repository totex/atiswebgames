/**
 * Tetris simulation — deliberately free of Phaser imports.
 *
 * The Phaser scene owns rendering, input, audio and animation; this class owns
 * the board, active tetromino, next queue, hold slot, scoring and timing. That
 * separation keeps the rules testable and makes the render loop simple.
 *
 * Improvements over the Python reference:
 *   - 7-bag randomiser instead of independent random picks
 *   - hold slot, ghost piece and a three-piece next queue
 *   - lock delay with a reset cap, soft drop and hard drop
 *   - wall kicks so rotations work against the walls/floor
 *   - combo and perfect-clear scoring, and a level/speed curve
 */

import {
  CODE_BY_TYPE,
  COLS,
  COMBO_BONUS,
  EMPTY,
  HARD_DROP_POINTS,
  LINES_PER_LEVEL,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
  PERFECT_CLEAR_BONUS,
  PIECES,
  PIECE_TYPES,
  PLAYFIELD_LEFT,
  PLAYFIELD_RIGHT,
  PLAYFIELD_WIDTH,
  ROWS,
  SCORE_TABLE,
  SOFT_DROP_POINTS,
  WALL,
  gravityMs,
  type PieceType,
} from './config';

export type Phase = 'playing' | 'clearing' | 'gameover';

export interface ActivePiece {
  type: PieceType;
  rotation: number;
  x: number;
  y: number;
}

export interface CellCoord {
  readonly x: number;
  readonly y: number;
}

export type WorldEvent =
  | { readonly type: 'spawn'; readonly piece: PieceType }
  | { readonly type: 'move'; readonly direction: -1 | 1 }
  | { readonly type: 'rotate'; readonly direction: 1 | -1; readonly kicked: boolean }
  | { readonly type: 'hold'; readonly held: PieceType | null }
  | { readonly type: 'harddrop'; readonly distance: number; readonly piece: PieceType }
  | { readonly type: 'lock'; readonly piece: PieceType; readonly cells: readonly CellCoord[] }
  | {
      readonly type: 'clear';
      readonly rows: readonly number[];
      readonly count: number;
      readonly combo: number;
      readonly base: number;
      readonly comboBonus: number;
    }
  | { readonly type: 'perfect'; readonly bonus: number }
  | { readonly type: 'levelup'; readonly level: number }
  | { readonly type: 'gameover' };

/**
 * Kick offsets tried in order when a rotation would overlap something.
 * The first entry is the unmodified rotation; the rest nudge it away from
 * walls, the floor and settled blocks. The ±2 offsets are mainly for the I.
 */
const ROTATION_KICKS: readonly (readonly [number, number])[] = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [-2, 0],
  [2, 0],
  [-1, -1],
  [1, -1],
  [-2, -1],
  [2, -1],
  [0, 1],
];

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = items.slice();

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }

  return copy;
}

function createBoard(): number[][] {
  const board: number[][] = [];

  for (let y = 0; y < ROWS; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < COLS; x += 1) {
      const isWall = x === 0 || x === COLS - 1 || y === ROWS - 1;
      row.push(isWall ? WALL : EMPTY);
    }
    board.push(row);
  }

  return board;
}

function makeInnerRow(): number[] {
  const row = Array.from({ length: COLS }, () => EMPTY);
  row[0] = WALL;
  row[COLS - 1] = WALL;
  return row;
}

function makeFloorRow(): number[] {
  return Array.from({ length: COLS }, () => WALL);
}

export class TetrisWorld {
  board: number[][] = createBoard();
  active: ActivePiece | null = null;
  queue: PieceType[] = [];
  holdType: PieceType | null = null;
  canHold = true;
  phase: Phase = 'playing';

  score = 0;
  lines = 0;
  level = 1;
  combo = 0;

  clearingRows: number[] = [];
  boardRevision = 0;

  private readonly random: () => number;
  private bag: PieceType[] = [];
  private events: WorldEvent[] = [];
  private gravityTimer = 0;
  private lockTimer = 0;
  private lockResets = 0;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.reset();
  }

  /** Start a completely new game. */
  reset(): void {
    this.board = createBoard();
    this.active = null;
    this.queue = [];
    this.bag = [];
    this.holdType = null;
    this.canHold = true;
    this.phase = 'playing';
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = 0;
    this.clearingRows = [];
    this.boardRevision += 1;
    this.events = [];
    this.gravityTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;

    this.refillQueue();
    this.spawnNext(true);
  }

  /* ---------------------------------------------------------------- */
  /* Queue and spawning                                               */
  /* ---------------------------------------------------------------- */

  private refillQueue(): void {
    while (this.queue.length < 5) {
      if (this.bag.length === 0) {
        this.bag = shuffle(PIECE_TYPES, this.random);
      }

      const piece = this.bag.pop();
      if (!piece) {
        break;
      }
      this.queue.push(piece);
    }
  }

  private takeNext(): PieceType {
    this.refillQueue();
    const piece = this.queue.shift();
    this.refillQueue();

    // refillQueue guarantees an element; the fallback keeps TypeScript and a
    // pathological random function from ever producing `undefined`.
    return piece ?? PIECE_TYPES[0];
  }

  private spawnNext(quiet = false): void {
    this.spawn(this.takeNext(), quiet);
  }

  private spawn(type: PieceType, quiet = false): void {
    const shape = PIECES[type].rotations[0];
    const x =
      PLAYFIELD_LEFT + Math.floor((PLAYFIELD_WIDTH - shape.width) / 2);
    const y = 0;

    this.active = { type, rotation: 0, x, y };
    this.gravityTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;

    if (!this.canPlace(type, 0, x, y)) {
      this.active = null;
      this.phase = 'gameover';
      if (!quiet) {
        this.emit({ type: 'gameover' });
      }
      return;
    }

    if (!quiet) {
      this.emit({ type: 'spawn', piece: type });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Geometry                                                         */
  /* ---------------------------------------------------------------- */

  canPlace(
    type: PieceType,
    rotation: number,
    originX: number,
    originY: number
  ): boolean {
    const shape = PIECES[type].rotations[rotation];
    if (!shape) {
      return false;
    }

    for (const [cellX, cellY] of shape.cells) {
      const boardX = originX + cellX;
      const boardY = originY + cellY;

      if (
        boardX < 0 ||
        boardX >= COLS ||
        boardY < 0 ||
        boardY >= ROWS
      ) {
        return false;
      }

      if (this.board[boardY][boardX] !== EMPTY) {
        return false;
      }
    }

    return true;
  }

  /** Y coordinate the active piece would land at after a hard drop. */
  ghostY(): number {
    const active = this.active;
    if (!active) {
      return 0;
    }

    let y = active.y;
    while (this.canPlace(active.type, active.rotation, active.x, y + 1)) {
      y += 1;
    }
    return y;
  }

  /* ---------------------------------------------------------------- */
  /* Actions                                                          */
  /* ---------------------------------------------------------------- */

  move(direction: -1 | 1): boolean {
    const active = this.active;
    if (!active || this.phase !== 'playing') {
      return false;
    }

    if (
      !this.canPlace(
        active.type,
        active.rotation,
        active.x + direction,
        active.y
      )
    ) {
      return false;
    }

    active.x += direction;
    this.touchLockDelay();
    this.emit({ type: 'move', direction });
    return true;
  }

  rotate(direction: 1 | -1): boolean {
    const active = this.active;
    if (!active || this.phase !== 'playing') {
      return false;
    }

    const rotations = PIECES[active.type].rotations;
    if (rotations.length <= 1) {
      return false;
    }

    const nextRotation =
      (active.rotation + direction + rotations.length) % rotations.length;

    for (const [offsetX, offsetY] of ROTATION_KICKS) {
      const nextX = active.x + offsetX;
      const nextY = active.y + offsetY;

      if (this.canPlace(active.type, nextRotation, nextX, nextY)) {
        active.rotation = nextRotation;
        active.x = nextX;
        active.y = nextY;
        this.touchLockDelay();
        this.emit({
          type: 'rotate',
          direction,
          kicked: offsetX !== 0 || offsetY !== 0,
        });
        return true;
      }
    }

    return false;
  }

  softDrop(): boolean {
    const active = this.active;
    if (!active || this.phase !== 'playing') {
      return false;
    }

    if (
      !this.canPlace(
        active.type,
        active.rotation,
        active.x,
        active.y + 1
      )
    ) {
      return false;
    }

    active.y += 1;
    this.score += SOFT_DROP_POINTS;
    this.gravityTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    return true;
  }

  hardDrop(): number {
    const active = this.active;
    if (!active || this.phase !== 'playing') {
      return 0;
    }

    const piece = active.type;
    let distance = 0;

    while (
      this.canPlace(active.type, active.rotation, active.x, active.y + 1)
    ) {
      active.y += 1;
      distance += 1;
    }

    if (distance > 0) {
      this.score += distance * HARD_DROP_POINTS;
    }

    this.emit({ type: 'harddrop', distance, piece });
    this.lockPiece();
    return distance;
  }

  hold(): boolean {
    const active = this.active;
    if (!active || this.phase !== 'playing' || !this.canHold) {
      return false;
    }

    const current = active.type;
    const previous = this.holdType;

    this.holdType = current;
    this.canHold = false;
    this.active = null;
    this.emit({ type: 'hold', held: this.holdType });

    if (previous) {
      this.spawn(previous);
    } else {
      this.spawnNext();
    }

    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Gravity and locking                                              */
  /* ---------------------------------------------------------------- */

  update(deltaMs: number): void {
    if (this.phase !== 'playing' || !this.active) {
      return;
    }

    // Clamp a stalled frame so a tab that was backgrounded cannot teleport a
    // piece through the stack.
    const dt = clamp(deltaMs, 0, 120);
    const interval = gravityMs(this.level);

    this.gravityTimer += dt;

    let steps = 0;
    while (this.gravityTimer >= interval && steps < 20) {
      steps += 1;
      this.gravityTimer -= interval;

      if (!this.dropOne()) {
        this.gravityTimer = 0;
        break;
      }
    }

    if (this.phase !== 'playing' || !this.active) {
      return;
    }

    if (!this.canMoveDown()) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY_MS) {
        this.lockPiece();
      }
    } else {
      this.lockTimer = 0;
    }
  }

  private dropOne(): boolean {
    const active = this.active;
    if (!active) {
      return false;
    }

    if (
      !this.canPlace(
        active.type,
        active.rotation,
        active.x,
        active.y + 1
      )
    ) {
      return false;
    }

    active.y += 1;
    this.lockTimer = 0;
    this.lockResets = 0;
    return true;
  }

  private canMoveDown(): boolean {
    const active = this.active;
    if (!active) {
      return false;
    }
    return this.canPlace(
      active.type,
      active.rotation,
      active.x,
      active.y + 1
    );
  }

  /**
   * A move or rotation while resting on the stack gets a fresh lock delay,
   * but only up to MAX_LOCK_RESETS. Without the cap a player could spin
   * forever at the bottom.
   */
  private touchLockDelay(): void {
    if (this.canMoveDown()) {
      this.lockTimer = 0;
      return;
    }

    if (this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets += 1;
    }
  }

  private lockPiece(): void {
    const active = this.active;
    if (!active) {
      return;
    }

    const shape = PIECES[active.type].rotations[active.rotation];
    const cells: CellCoord[] = [];

    for (const [cellX, cellY] of shape.cells) {
      const boardX = active.x + cellX;
      const boardY = active.y + cellY;

      if (
        boardX >= 0 &&
        boardX < COLS &&
        boardY >= 0 &&
        boardY < ROWS
      ) {
        this.board[boardY][boardX] = CODE_BY_TYPE[active.type];
        cells.push({ x: boardX, y: boardY });
      }
    }

    this.boardRevision += 1;
    this.active = null;
    this.canHold = true;
    this.gravityTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;

    this.emit({ type: 'lock', piece: active.type, cells });

    const fullRows = this.findFullRows();

    if (fullRows.length === 0) {
      this.combo = 0;
      this.spawnNext();
      return;
    }

    this.combo += 1;

    const count = fullRows.length;
    const base = (SCORE_TABLE[count] ?? 0) * this.level;
    const comboBonus =
      this.combo > 1 ? COMBO_BONUS * (this.combo - 1) * this.level : 0;

    this.score += base + comboBonus;
    this.lines += count;

    const previousLevel = this.level;
    this.level = Math.min(99, 1 + Math.floor(this.lines / LINES_PER_LEVEL));

    this.clearingRows = fullRows;
    this.phase = 'clearing';

    this.emit({
      type: 'clear',
      rows: fullRows,
      count,
      combo: this.combo,
      base,
      comboBonus,
    });

    if (this.level > previousLevel) {
      this.emit({ type: 'levelup', level: this.level });
    }
  }

  /**
   * Called by the scene once its clear animation has finished. The board keeps
   * the full rows while the scene animates them, which is why removal is a
   * separate step.
   */
  completeLineClear(): void {
    if (this.phase !== 'clearing') {
      return;
    }

    const cleared = new Set(this.clearingRows);
    const rebuilt: number[][] = [];

    for (let y = 0; y < ROWS - 1; y += 1) {
      if (!cleared.has(y)) {
        rebuilt.push(this.board[y].slice());
      }
    }

    while (rebuilt.length < ROWS - 1) {
      rebuilt.unshift(makeInnerRow());
    }
    rebuilt.push(makeFloorRow());

    this.board = rebuilt;
    this.clearingRows = [];
    this.phase = 'playing';
    this.boardRevision += 1;

    if (this.isPlayfieldEmpty()) {
      const bonus = PERFECT_CLEAR_BONUS * this.level;
      this.score += bonus;
      this.emit({ type: 'perfect', bonus });
    }

    this.spawnNext();
  }

  private findFullRows(): number[] {
    const rows: number[] = [];

    for (let y = 0; y < ROWS - 1; y += 1) {
      let full = true;

      for (let x = PLAYFIELD_LEFT; x <= PLAYFIELD_RIGHT; x += 1) {
        if (this.board[y][x] === EMPTY) {
          full = false;
          break;
        }
      }

      if (full) {
        rows.push(y);
      }
    }

    return rows;
  }

  private isPlayfieldEmpty(): boolean {
    for (let y = 0; y < ROWS - 1; y += 1) {
      for (let x = PLAYFIELD_LEFT; x <= PLAYFIELD_RIGHT; x += 1) {
        if (this.board[y][x] !== EMPTY) {
          return false;
        }
      }
    }
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Read-only helpers for the scene                                  */
  /* ---------------------------------------------------------------- */

  getNext(count = 3): PieceType[] {
    this.refillQueue();
    return this.queue.slice(0, count);
  }

  getGravityInterval(): number {
    return gravityMs(this.level);
  }

  getActiveCells(): CellCoord[] {
    const active = this.active;
    if (!active) {
      return [];
    }

    return PIECES[active.type].rotations[active.rotation].cells.map(
      ([cellX, cellY]) => ({
        x: active.x + cellX,
        y: active.y + cellY,
      })
    );
  }

  consumeEvents(): WorldEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  private emit(event: WorldEvent): void {
    this.events.push(event);
  }
}

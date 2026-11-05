/**
 * Tetris — shared configuration.
 *
 * The playfield, tetromino shapes and colours are ported from the original
 * Python/Arcade game (`_my_old_games/Tetris`). The original board is 12 x 15
 * cells: the first/last column and the last row are walls, leaving a 10 x 14
 * playable well. Keeping those dimensions means the reference's rotations can
 * be used almost verbatim.
 */

export type PieceType = 'T' | 'I' | 'O' | 'Z' | 'S' | 'L' | 'J';

export interface Rotation {
  /** Row-major bitmap, '1' marks a filled cell. Useful for previews too. */
  readonly rows: readonly string[];
  readonly width: number;
  readonly height: number;
  /** Filled cells as [column, row] offsets from the bitmap's top-left. */
  readonly cells: readonly (readonly [number, number])[];
}

export interface PieceDefinition {
  readonly type: PieceType;
  readonly color: number;
  readonly rotations: readonly Rotation[];
}

function makeRotation(rows: readonly string[]): Rotation {
  const cells: Array<readonly [number, number]> = [];
  let width = 0;

  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === '1') {
        cells.push([x, y]);
        if (x + 1 > width) {
          width = x + 1;
        }
      }
    }
  });

  return { rows, width, height: rows.length, cells };
}

/* ------------------------------------------------------------------ */
/* Canvas and playfield geometry                                      */
/* ------------------------------------------------------------------ */

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 900;

export const COLS = 12;
export const ROWS = 15;
export const CELL = 54;

export const BOARD_X = 64;
export const BOARD_Y = 45;
export const BOARD_WIDTH = COLS * CELL;
export const BOARD_HEIGHT = ROWS * CELL;

export const PLAYFIELD_LEFT = 1;
export const PLAYFIELD_RIGHT = COLS - 2;
export const PLAYFIELD_WIDTH = PLAYFIELD_RIGHT - PLAYFIELD_LEFT + 1;

/** Right-hand HUD column. */
export const HUD_X = 752;
export const HUD_WIDTH = 468;

/* ------------------------------------------------------------------ */
/* Board cell values                                                  */
/* ------------------------------------------------------------------ */

export const EMPTY = 0;
export const WALL = 8;

export const CODE_BY_TYPE: Record<PieceType, number> = {
  T: 1,
  I: 2,
  O: 3,
  Z: 4,
  S: 5,
  L: 6,
  J: 7,
};

export const TYPE_BY_CODE: Record<number, PieceType> = {
  1: 'T',
  2: 'I',
  3: 'O',
  4: 'Z',
  5: 'S',
  6: 'L',
  7: 'J',
};

/* ------------------------------------------------------------------ */
/* Tetrominoes                                                        */
/* ------------------------------------------------------------------ */

/**
 * Shapes and colours follow the Python reference. The palette is brightened a
 * little so it reads well on a dark, modern board, while each letter keeps its
 * original colour family (T red, I blue, O green, Z jasmine, S violet,
 * L orange, J amethyst).
 */
export const PIECES: Record<PieceType, PieceDefinition> = {
  T: {
    type: 'T',
    color: 0xff4f63,
    rotations: [
      makeRotation(['111', '010']),
      makeRotation(['001', '011', '001']),
      makeRotation(['000', '010', '111']),
      makeRotation(['10', '11', '10']),
    ],
  },
  I: {
    type: 'I',
    color: 0x4d8dff,
    rotations: [
      makeRotation(['010', '010', '010', '010']),
      makeRotation(['0000', '1111', '0000']),
    ],
  },
  O: {
    type: 'O',
    color: 0x37d67a,
    rotations: [makeRotation(['11', '11'])],
  },
  Z: {
    type: 'Z',
    color: 0xf4d35e,
    rotations: [
      makeRotation(['110', '011']),
      makeRotation(['001', '011', '010']),
    ],
  },
  S: {
    type: 'S',
    color: 0xc084fc,
    rotations: [
      makeRotation(['011', '110']),
      makeRotation(['100', '110', '010']),
    ],
  },
  L: {
    type: 'L',
    color: 0xff9f43,
    rotations: [
      makeRotation(['010', '010', '011']),
      makeRotation(['000', '111', '100']),
      makeRotation(['110', '010', '010']),
      makeRotation(['001', '111', '000']),
    ],
  },
  J: {
    type: 'J',
    color: 0x9b6bff,
    rotations: [
      makeRotation(['010', '010', '110']),
      makeRotation(['100', '111', '000']),
      makeRotation(['011', '010', '010']),
      makeRotation(['000', '111', '001']),
    ],
  },
};

/** The order used by the 7-bag randomiser. */
export const PIECE_TYPES: readonly PieceType[] = [
  'T',
  'I',
  'O',
  'Z',
  'S',
  'L',
  'J',
];

/* ------------------------------------------------------------------ */
/* Timing and scoring                                                 */
/* ------------------------------------------------------------------ */

/** The reference game drops every 0.5 s on level 1. */
export const BASE_GRAVITY_MS = 500;
export const GRAVITY_FACTOR = 0.85;
export const MIN_GRAVITY_MS = 65;

export const LOCK_DELAY_MS = 480;
export const MAX_LOCK_RESETS = 15;

export const SOFT_DROP_INTERVAL_MS = 45;
export const DAS_DELAY_MS = 150;
export const ARR_MS = 38;

export const CLEAR_ANIMATION_MS = 320;
export const LINES_PER_LEVEL = 10;

export const SOFT_DROP_POINTS = 1;
export const HARD_DROP_POINTS = 2;

/** Indexed by the number of rows cleared at once. */
export const SCORE_TABLE: readonly number[] = [0, 100, 300, 500, 800];
export const COMBO_BONUS = 50;
export const PERFECT_CLEAR_BONUS = 1000;

/** Gravity interval for a level (level 1 = 500 ms, then ~15% faster). */
export function gravityMs(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.max(
    MIN_GRAVITY_MS,
    Math.round(BASE_GRAVITY_MS * Math.pow(GRAVITY_FACTOR, safeLevel - 1))
  );
}

/* ------------------------------------------------------------------ */
/* UI palette                                                         */
/* ------------------------------------------------------------------ */

export const UI = {
  backgroundTop: 0x040711,
  backgroundBottom: 0x0a1324,
  board: 0x070c17,
  boardEdge: 0x5ef2d6,
  panel: 0x0c1526,
  panelStrong: 0x101c32,
  border: 0x22304d,
  accent: 0x5ef2d6,
  accentDim: 0x2a8f82,
  danger: 0xff5f7a,
  gold: 0xffd166,
  green: 0x57e389,
  text: '#eef4ff',
  muted: '#7f8fb0',
  dim: '#5b6a88',
  accentText: '#5ef2d6',
  dangerText: '#ff5f7a',
  goldText: '#ffd166',
  greenText: '#57e389',
} as const;

/** Lighten (positive) or darken (negative) a 0xRRGGBB colour. */
export function shade(color: number, delta: number): number {
  const r = Math.max(0, Math.min(255, ((color >> 16) & 0xff) + delta));
  const g = Math.max(0, Math.min(255, ((color >> 8) & 0xff) + delta));
  const b = Math.max(0, Math.min(255, (color & 0xff) + delta));
  return (r << 16) | (g << 8) | b;
}

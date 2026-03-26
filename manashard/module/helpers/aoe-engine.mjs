/**
 * AOE Engine — targeting, filtering, and visual highlights for Area of Effect skills.
 *
 * Shapes:
 *   Circle — Chebyshev radius around a center token
 *   Line   — Straight line from caster toward target, N tiles long
 *   Cross  — Plus (+) pattern centered on target, configurable arm length
 *
 * Uses the same grid highlight API as movement-highlight.mjs and threat-range-highlight.mjs.
 */

import { gridDistance } from "./combat.mjs";

const HIGHLIGHT_NAME = "manashard.aoeHighlight";
const HIGHLIGHT_ALPHA = 0.3;
const HIGHLIGHT_BORDER_ALPHA = 0.6;
const HIGHLIGHT_DURATION_MS = 3000;

// Element → highlight color mapping
const ELEMENT_COLORS = {
  fire: 0xff6644,
  ice: 0x44ccff,
  water: 0x4488ff,
  lightning: 0xffcc22,
  wind: 0x66ddaa,
  earth: 0x88aa44,
  light: 0xffe877,
  dark: 0xaa66ee,
  null: 0x8899aa
};
const DEFAULT_AOE_COLOR = 0xcc44ff; // Magenta fallback

// ═══════════════════════════════════════════════════════════════
// GRID COORDINATE HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get the grid column/row of a token's top-left corner.
 * @param {Token|TokenDocument} token
 * @returns {{col: number, row: number, w: number, h: number}}
 */
function tokenGridPos(token) {
  const gs = canvas.grid.size;
  const doc = token.document ?? token;
  return {
    col: Math.round((doc.x ?? 0) / gs),
    row: Math.round((doc.y ?? 0) / gs),
    w: doc.width ?? 1,
    h: doc.height ?? 1
  };
}

/**
 * Get all grid cells occupied by a token.
 * @param {Token|TokenDocument} token
 * @returns {Set<string>} Set of "col,row" keys
 */
function tokenCells(token) {
  const { col, row, w, h } = tokenGridPos(token);
  const cells = new Set();
  for (let dc = 0; dc < w; dc++) {
    for (let dr = 0; dr < h; dr++) {
      cells.add(`${col + dc},${row + dr}`);
    }
  }
  return cells;
}

/**
 * Get the center grid cell of a token (for multi-tile, picks the middle).
 * @param {Token|TokenDocument} token
 * @returns {{col: number, row: number}}
 */
function tokenCenter(token) {
  const { col, row, w, h } = tokenGridPos(token);
  return {
    col: col + Math.floor((w - 1) / 2),
    row: row + Math.floor((h - 1) / 2)
  };
}

// ═══════════════════════════════════════════════════════════════
// SHAPE CELL COMPUTATION
// ═══════════════════════════════════════════════════════════════

/**
 * Compute all grid cells in a circle (Chebyshev distance) around a center.
 * @param {number} cx - Center column
 * @param {number} cy - Center row
 * @param {number} radius - Chebyshev radius in tiles
 * @returns {Set<string>} Set of "col,row" keys
 */
function getCircleCells(cx, cy, radius) {
  const cells = new Set();
  for (let dc = -radius; dc <= radius; dc++) {
    for (let dr = -radius; dr <= radius; dr++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) <= radius) {
        cells.add(`${cx + dc},${cy + dr}`);
      }
    }
  }
  return cells;
}

/**
 * Compute all grid cells in a cross (+) pattern centered on a point.
 * @param {number} cx - Center column
 * @param {number} cy - Center row
 * @param {number} armLength - How many tiles each arm extends from center
 * @returns {Set<string>} Set of "col,row" keys
 */
function getCrossCells(cx, cy, armLength) {
  const cells = new Set();
  // Center tile
  cells.add(`${cx},${cy}`);
  // Four arms
  for (let i = 1; i <= armLength; i++) {
    cells.add(`${cx + i},${cy}`); // East
    cells.add(`${cx - i},${cy}`); // West
    cells.add(`${cx},${cy + i}`); // South
    cells.add(`${cx},${cy - i}`); // North
  }
  return cells;
}

/**
 * Compute all grid cells along a line from caster toward target, extending `length` tiles.
 * Uses Bresenham-like stepping along the dominant axis from caster center toward target center.
 * @param {number} fromCol - Caster center column
 * @param {number} fromRow - Caster center row
 * @param {number} toCol - Target center column
 * @param {number} toRow - Target center row
 * @param {number} length - Line length in tiles
 * @returns {Set<string>} Set of "col,row" keys
 */
function getLineCells(fromCol, fromRow, toCol, toRow, length) {
  const cells = new Set();

  const dx = toCol - fromCol;
  const dy = toRow - fromRow;

  // If caster and target are on the same cell, default to a line going east
  if (dx === 0 && dy === 0) {
    for (let i = 1; i <= length; i++) {
      cells.add(`${fromCol + i},${fromRow}`);
    }
    return cells;
  }

  // Normalize direction and step along it
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  const stepX = dx / dist;
  const stepY = dy / dist;

  for (let i = 1; i <= length; i++) {
    const col = Math.round(fromCol + stepX * i);
    const row = Math.round(fromRow + stepY * i);
    cells.add(`${col},${row}`);
  }

  return cells;
}

// ═══════════════════════════════════════════════════════════════
// TOKEN TARGETING
// ═══════════════════════════════════════════════════════════════

/**
 * Get the set of AOE cells for a given shape configuration.
 * @param {Token} centerToken - The token marking the AOE center
 * @param {string} shape - "circle" | "line" | "cross"
 * @param {number} size - Shape size parameter
 * @param {Token} [casterToken] - The casting token (needed for line shape)
 * @returns {Set<string>} Set of "col,row" keys
 */
export function getAoeCells(centerToken, shape, size, casterToken = null) {
  const center = tokenCenter(centerToken);

  switch (shape) {
    case "circle":
      return getCircleCells(center.col, center.row, size);

    case "cross":
      return getCrossCells(center.col, center.row, size);

    case "line": {
      if (!casterToken) return new Set();
      const from = tokenCenter(casterToken);
      return getLineCells(from.col, from.row, center.col, center.row, size);
    }

    default:
      // Fallback: treat as circle
      return getCircleCells(center.col, center.row, size);
  }
}

/**
 * Find all tokens within an AOE area.
 * A token is "in" the AOE if any of its occupied cells overlap with the AOE cells.
 * @param {Token} centerToken - The token marking the AOE center
 * @param {string} shape - "circle" | "line" | "cross"
 * @param {number} size - Shape size parameter
 * @param {Token} [casterToken] - The casting token (needed for line shape direction)
 * @returns {Token[]} Array of Token placeables within the shape
 */
export function getTokensInAoe(centerToken, shape, size, casterToken = null) {
  if (!canvas?.tokens) return [];

  const aoeCells = getAoeCells(centerToken, shape, size, casterToken);
  const results = [];

  for (const token of canvas.tokens.placeables) {
    const occupied = tokenCells(token);
    // Check if any occupied cell overlaps with AOE cells
    for (const cell of occupied) {
      if (aoeCells.has(cell)) {
        results.push(token);
        break;
      }
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// TARGET FILTERING
// ═══════════════════════════════════════════════════════════════

/**
 * Filter tokens by AOE target filter relative to the caster.
 * @param {Token[]} tokens - Candidate tokens
 * @param {Token} casterToken - The casting token
 * @param {string} filter - "enemies" | "allies" | "all" | "allExcludeSelf"
 * @returns {Token[]}
 */
export function filterAoeTargets(tokens, casterToken, filter) {
  if (!casterToken) return tokens;

  const casterDisposition = casterToken.document?.disposition ?? casterToken.disposition ?? 1;
  const casterActorId = casterToken.actor?.id;

  return tokens.filter(token => {
    const tokenDisposition = token.document?.disposition ?? token.disposition ?? 0;
    const isSelf = token.actor?.id === casterActorId;
    const sameTeam = tokenDisposition === casterDisposition;

    switch (filter) {
      case "enemies":
        return !sameTeam;
      case "allies":
        return sameTeam;
      case "all":
        return true;
      case "allExcludeSelf":
        return !isSelf;
      default:
        return !sameTeam; // Default to enemies
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// VISUAL HIGHLIGHT
// ═══════════════════════════════════════════════════════════════

let _clearTimer = null;

/**
 * Show a grid highlight for an AOE area.
 * Auto-clears after a short delay.
 * @param {Token} centerToken - The token marking the AOE center
 * @param {string} shape - "circle" | "line" | "cross"
 * @param {number} size - Shape size parameter
 * @param {Token} [casterToken] - The casting token (needed for line shape)
 * @param {string} [element] - Element key for color tinting
 */
export function showAoeHighlight(centerToken, shape, size, casterToken = null, element = "") {
  if (!canvas?.interface?.grid) return;

  const aoeCells = getAoeCells(centerToken, shape, size, casterToken);
  const gs = canvas.grid.size;
  const color = ELEMENT_COLORS[element] ?? DEFAULT_AOE_COLOR;

  // Clear any previous AOE highlight
  clearAoeHighlight();

  canvas.interface.grid.addHighlightLayer(HIGHLIGHT_NAME);

  for (const key of aoeCells) {
    const [col, row] = key.split(",").map(Number);
    canvas.interface.grid.highlightPosition(HIGHLIGHT_NAME, {
      x: col * gs,
      y: row * gs,
      color,
      alpha: HIGHLIGHT_ALPHA,
      border: color,
      borderAlpha: HIGHLIGHT_BORDER_ALPHA
    });
  }

  // Auto-clear after delay
  _clearTimer = setTimeout(() => {
    clearAoeHighlight();
  }, HIGHLIGHT_DURATION_MS);
}

/**
 * Clear the AOE highlight layer immediately.
 */
export function clearAoeHighlight() {
  if (_clearTimer) {
    clearTimeout(_clearTimer);
    _clearTimer = null;
  }
  if (!canvas?.interface?.grid) return;
  canvas.interface.grid.destroyHighlightLayer(HIGHLIGHT_NAME);
}

/**
 * Movement Range Highlight — Fire Emblem-style movement range display.
 *
 * When a token is selected, highlights all grid squares reachable within
 * the token's MOV stat. Uses 4-directional BFS (no diagonals).
 * Allies are passable but not valid stopping squares; enemies fully block.
 * Pass Through grants passage through enemies at normal cost.
 */

const HIGHLIGHT_NAME = "manashard.movementRange";
const HIGHLIGHT_COLOR_ALLY = 0x34d399;   // Emerald green
const HIGHLIGHT_COLOR_ENEMY = 0xf43f5e;  // Rose-red
const HIGHLIGHT_ALPHA = 0.25;
const HIGHLIGHT_BORDER_ALPHA = 0.5;

// Cardinal directions only (no diagonals)
const DIRECTIONS = [
  { dx: 0, dy: -1 }, // North
  { dx: 1, dy: 0 },  // East
  { dx: 0, dy: 1 },  // South
  { dx: -1, dy: 0 }  // West
];

/**
 * Show movement range highlight for a token.
 * @param {Token} token - The canvas Token placeable
 */
export function showMovementRange(token) {
  if (!canvas?.grid) return;
  const actor = token.actor;
  if (!actor) return;

  const mov = actor.system.mov;
  if (!mov || mov <= 0) return;

  // Pick color based on token disposition (hostile = red, friendly/neutral = green)
  const isEnemy = (token.document.disposition ?? 0) < 0;
  const color = isEnemy ? HIGHLIGHT_COLOR_ENEMY : HIGHLIGHT_COLOR_ALLY;

  // Destroy old layer completely, then create fresh
  canvas.interface.grid.destroyHighlightLayer(HIGHLIGHT_NAME);
  canvas.interface.grid.addHighlightLayer(HIGHLIGHT_NAME);

  const reachable = computeReachableSquares(token, mov);

  // Cache for movement validation
  _lastTokenId = token.document.id;
  _lastReachable = new Set(reachable.map(({ col, row }) => `${col},${row}`));

  if (!reachable.length) return;

  const gs = canvas.grid.size;
  const tokenSize = token.document.width ?? 1;

  // For multi-tile tokens, highlight all squares the token would occupy at each position
  const highlighted = new Set();
  for (const { col, row } of reachable) {
    for (let dc = 0; dc < tokenSize; dc++) {
      for (let dr = 0; dr < tokenSize; dr++) {
        const key = `${col + dc},${row + dr}`;
        if (highlighted.has(key)) continue;
        highlighted.add(key);
        canvas.interface.grid.highlightPosition(HIGHLIGHT_NAME, {
          x: (col + dc) * gs,
          y: (row + dr) * gs,
          color,
          alpha: HIGHLIGHT_ALPHA,
          border: color,
          borderAlpha: HIGHLIGHT_BORDER_ALPHA
        });
      }
    }
  }
}

/**
 * Clear the movement range highlight layer.
 */
export function clearMovementRange() {
  if (!canvas?.interface?.grid) return;
  canvas.interface.grid.destroyHighlightLayer(HIGHLIGHT_NAME);
  _lastReachable = null;
  _lastTokenId = null;
}

// Cache the last computed reachable set for movement validation
let _lastReachable = null;
let _lastTokenId = null;

/**
 * Check if a destination grid position is within the last computed movement range.
 * @param {TokenDocument} tokenDoc - The token document being moved
 * @param {number} destX - Destination pixel X
 * @param {number} destY - Destination pixel Y
 * @returns {boolean}
 */
export function isWithinMovementRange(tokenDoc, destX, destY) {
  if (!canvas?.grid) return true;
  if (_lastTokenId !== tokenDoc.id || !_lastReachable) return true;

  const gs = canvas.grid.size;
  const col = Math.round(destX / gs);
  const row = Math.round(destY / gs);
  const key = `${col},${row}`;
  return _lastReachable.has(key);
}

/**
 * BFS to find all reachable grid squares from a token's position.
 * 4-directional only (Manhattan distance). Allies passable but not stoppable.
 * Enemies fully block (unless Pass Through is active).
 *
 * @param {Token} token - The selected token
 * @param {number} mov - Movement range in grid squares
 * @returns {Array<{col: number, row: number}>} Reachable stopping positions
 */
function computeReachableSquares(token, mov) {
  const gs = canvas.grid.size;
  const tokenSize = token.document.width ?? 1;
  const disposition = token.document.disposition;

  // Check if this token has the Pass Through movement mode
  const passThrough = token.actor?.system?._movementModes?.has?.("passThrough") ?? false;

  // Build blocked (enemy) and ally-occupied sets
  const blocked = new Set();
  const allyOccupied = new Set();

  for (const other of canvas.tokens.placeables) {
    if (other.id === token.id) continue;
    // Traps never block movement
    if (other.actor?.type === "trap") continue;
    const otherSize = other.document.width ?? 1;
    const otherCol = Math.round(other.document.x / gs);
    const otherRow = Math.round(other.document.y / gs);
    const sameTeam = other.document.disposition === disposition;

    for (let dc = 0; dc < otherSize; dc++) {
      for (let dr = 0; dr < otherSize; dr++) {
        const key = `${otherCol + dc},${otherRow + dr}`;
        if (sameTeam || passThrough) {
          // Allies are always passable; enemies become passable with Pass Through
          allyOccupied.add(key);
        } else {
          blocked.add(key);
        }
      }
    }
  }


  // Starting grid position (top-left corner of token)
  const startCol = Math.round(token.document.x / gs);
  const startRow = Math.round(token.document.y / gs);

  // BFS
  const visited = new Map(); // "col,row" -> lowest cost to reach
  const queue = [{ col: startCol, row: startRow, cost: 0 }];
  const startKey = `${startCol},${startRow}`;
  visited.set(startKey, 0);

  const reachable = [];

  while (queue.length) {
    const { col, row, cost } = queue.shift();

    // Add to reachable if not the start and not ally-occupied
    if (cost > 0 && canStopAt(col, row, tokenSize, blocked, allyOccupied)) {
      reachable.push({ col, row });
    }

    if (cost >= mov) continue;

    for (const { dx, dy } of DIRECTIONS) {
      const nc = col + dx;
      const nr = row + dy;
      const newCost = cost + 1;

      // Check that the token can physically enter this square
      if (!canEnter(nc, nr, tokenSize, blocked)) continue;

      // Check that no movement-blocking wall lies between the two squares
      if (_isWallBlocking(col, row, nc, nr, tokenSize, gs)) continue;

      const key = `${nc},${nr}`;
      if (visited.has(key) && visited.get(key) <= newCost) continue;
      visited.set(key, newCost);
      queue.push({ col: nc, row: nr, cost: newCost });
    }
  }

  return reachable;
}

/**
 * Check if a token of given size can enter a grid position.
 * All squares the token would occupy must be within bounds and not enemy-blocked.
 * Ally squares ARE enterable (passable).
 */
function canEnter(col, row, size, blocked) {
  const maxCol = canvas.grid.columns ?? Math.ceil(canvas.dimensions.width / canvas.grid.size);
  const maxRow = canvas.grid.rows ?? Math.ceil(canvas.dimensions.height / canvas.grid.size);

  for (let dc = 0; dc < size; dc++) {
    for (let dr = 0; dr < size; dr++) {
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= maxCol || r >= maxRow) return false;
      if (blocked.has(`${c},${r}`)) return false;
    }
  }
  return true;
}

/**
 * Check if a token can stop at a grid position.
 * Must be enterable AND none of the occupied squares can be ally-occupied.
 */
function canStopAt(col, row, size, blocked, allyOccupied) {
  for (let dc = 0; dc < size; dc++) {
    for (let dr = 0; dr < size; dr++) {
      const key = `${col + dc},${row + dr}`;
      if (blocked.has(key)) return false;
      if (allyOccupied.has(key)) return false;
    }
  }
  return true;
}

/**
 * Check if a movement-blocking wall lies between two adjacent grid positions.
 * For multi-tile tokens, checks all edge squares that cross the boundary.
 * @param {number} fromCol - Origin column
 * @param {number} fromRow - Origin row
 * @param {number} toCol - Destination column
 * @param {number} toRow - Destination row
 * @param {number} size - Token size in grid squares
 * @param {number} gs - Grid size in pixels
 * @returns {boolean} True if a wall blocks the movement
 */
function _isWallBlocking(fromCol, fromRow, toCol, toRow, size, gs) {
  const backend = CONFIG.Canvas.polygonBackends?.move;
  if (!backend) return false;

  const dx = toCol - fromCol;
  const dy = toRow - fromRow;

  // For each tile along the crossing edge, raycast center-to-center
  const edgeCount = size;
  for (let i = 0; i < edgeCount; i++) {
    // Determine which sub-tile to check along the edge
    let fc, fr;
    if (dx !== 0) {
      // Horizontal move — check each row of the token edge
      fc = dx > 0 ? fromCol + size - 1 : fromCol;
      fr = fromRow + i;
    } else {
      // Vertical move — check each column of the token edge
      fc = fromCol + i;
      fr = dy > 0 ? fromRow + size - 1 : fromRow;
    }

    const ax = fc * gs + gs / 2;
    const ay = fr * gs + gs / 2;
    const bx = (fc + dx) * gs + gs / 2;
    const by = (fr + dy) * gs + gs / 2;

    const hasCollision = backend.testCollision(
      { x: ax, y: ay },
      { x: bx, y: by },
      { type: "move", mode: "any" }
    );
    if (hasCollision) return true;
  }

  return false;
}


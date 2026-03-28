/**
 * Enemy Threat Range Highlight — shows combined enemy threat zones.
 *
 * When toggled on during combat, highlights all grid squares that hostile
 * tokens can reach (MOV) and attack from (REACH) as red tiles.
 * Uses Chebyshev distance (king-move) to match the attack range system.
 */

const HIGHLIGHT_NAME = "manashard.threatRange";
const HIGHLIGHT_COLOR = 0xff3333;
const HIGHLIGHT_ALPHA = 0.15;
const HIGHLIGHT_BORDER_ALPHA = 0.35;

/**
 * Show the combined threat range of all enemies hostile to the controlled token.
 * If controlledToken is null (GM mode), shows threat range for all hostile tokens.
 * @param {Token|null} controlledToken - The player's selected token, or null for GM overview
 */
export function showThreatRange(controlledToken) {
  if (!canvas?.grid) return;
  if (!game.combat?.started) return;

  // GM mode (no token selected): show all hostile (disposition -1) threat zones
  // Player mode: show enemies relative to the controlled token's disposition
  const friendlyDisposition = controlledToken
    ? controlledToken.document.disposition
    : 1; // Treat friendly as the "safe" side for GM view

  const gs = canvas.grid.size;
  const maxCol = canvas.grid.columns ?? Math.ceil(canvas.dimensions.width / gs);
  const maxRow = canvas.grid.rows ?? Math.ceil(canvas.dimensions.height / gs);

  const threatened = new Set();

  for (const token of canvas.tokens.placeables) {
    if (controlledToken && token.id === controlledToken.id) continue;
    // Only show threat from tokens hostile to the reference disposition
    if (token.document.disposition === friendlyDisposition) continue;
    // In GM mode, also skip neutral tokens — only show hostile threat
    if (!controlledToken && token.document.disposition >= 0) continue;

    const actor = token.actor;
    if (!actor) continue;

    const mov = actor.system.mov ?? 0;
    const reach = actor.system.reach ?? 1;
    const threat = mov + reach;
    if (threat <= 0) continue;

    const size = token.document.width ?? 1;
    const originCol = Math.round(token.document.x / gs);
    const originRow = Math.round(token.document.y / gs);

    // Collect all cells this token occupies (for multi-tile)
    const occupied = [];
    for (let dc = 0; dc < size; dc++) {
      for (let dr = 0; dr < size; dr++) {
        occupied.push({ col: originCol + dc, row: originRow + dr });
      }
    }

    // Mark all tiles within Chebyshev distance <= threat from any occupied cell
    const minCol = Math.max(0, originCol - threat);
    const maxC = Math.min(maxCol - 1, originCol + size - 1 + threat);
    const minRow = Math.max(0, originRow - threat);
    const maxR = Math.min(maxRow - 1, originRow + size - 1 + threat);

    for (let c = minCol; c <= maxC; c++) {
      for (let r = minRow; r <= maxR; r++) {
        // Chebyshev distance (king-move) to nearest occupied cell
        let minDist = Infinity;
        for (const { col: oc, row: or } of occupied) {
          const dist = Math.max(Math.abs(c - oc), Math.abs(r - or));
          if (dist < minDist) minDist = dist;
        }
        if (minDist <= threat) {
          threatened.add(`${c},${r}`);
        }
      }
    }
  }

  // Remove tiles occupied by the controlled token itself
  if (controlledToken) {
    const ctrlCol = Math.round(controlledToken.document.x / gs);
    const ctrlRow = Math.round(controlledToken.document.y / gs);
    const ctrlSize = controlledToken.document.width ?? 1;
    for (let dc = 0; dc < ctrlSize; dc++) {
      for (let dr = 0; dr < ctrlSize; dr++) {
        threatened.delete(`${ctrlCol + dc},${ctrlRow + dr}`);
      }
    }
  }

  // Render
  canvas.interface.grid.destroyHighlightLayer(HIGHLIGHT_NAME);
  canvas.interface.grid.addHighlightLayer(HIGHLIGHT_NAME);

  for (const key of threatened) {
    const [c, r] = key.split(",").map(Number);
    canvas.interface.grid.highlightPosition(HIGHLIGHT_NAME, {
      x: c * gs,
      y: r * gs,
      color: HIGHLIGHT_COLOR,
      alpha: HIGHLIGHT_ALPHA,
      border: HIGHLIGHT_COLOR,
      borderAlpha: HIGHLIGHT_BORDER_ALPHA
    });
  }
}

/**
 * Clear the threat range highlight layer.
 */
export function clearThreatRange() {
  if (!canvas?.interface?.grid) return;
  canvas.interface.grid.destroyHighlightLayer(HIGHLIGHT_NAME);
}

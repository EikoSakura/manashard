/**
 * Token Status Effect Ring Renderer
 *
 * Draws status effect icons in a circle around the token (PF2e-style),
 * with duration counters overlaid on each icon. Replaces Foundry's default
 * grid layout by hiding the built-in effects container.
 *
 * Textures are pre-loaded at canvas ready time so that the synchronous
 * refreshToken hook can draw immediately without async delays.
 */

const CONTAINER_NAME = "manashard-status-ring";

/** Pre-loaded texture cache: status key → PIXI.Texture */
const _textures = new Map();

/**
 * Pre-load all status effect textures. Call once on canvasReady.
 * After this completes, drawStatusEffectRing can render synchronously.
 */
export async function preloadStatusTextures() {
  const iconPaths = CONFIG.MANASHARD?.statusIconPaths ?? {};
  const promises = [];
  for (const [key, path] of Object.entries(iconPaths)) {
    promises.push(
      foundry.canvas.loadTexture(path, { fallback: "icons/svg/hazard.svg" }).then(tex => {
        if (tex) _textures.set(key, tex);
      })
    );
  }
  await Promise.allSettled(promises);
}

/**
 * Draw status effect icons in a circle ring around the token.
 * Called synchronously from the refreshToken hook.
 * @param {Token} token - The Token placeable object
 */
export function drawStatusEffectRing(token) {
  // Clean up previous ring
  const existing = token.children.find(c => c.name === CONTAINER_NAME);
  if (existing) {
    existing.destroy({ children: true });
  }

  // Hide Foundry's default effect icon grid — we render our own
  if (token.effects) {
    token.effects.renderable = false;
  }

  const actor = token.document?.actor;
  if (!actor) return;

  const statuses = [...(actor.system.statusEffects ?? [])];
  if (!statuses.length) return;

  const durations = actor.getFlag("manashard", "statusDurations") ?? {};

  const container = new PIXI.Container();
  container.name = CONTAINER_NAME;
  container.eventMode = "none";

  // Token dimensions — use the placeable's actual pixel size
  const width = token.w;
  const height = token.h;
  const tokenSize = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;

  // Icon sizing: fixed 20px with scaling for many effects
  const numEffects = statuses.length;
  let iconSize = 20;
  if (numEffects > 8) iconSize = 16;

  // Ring just outside the token edge
  const radius = (tokenSize / 2) + (iconSize * 0.3);

  // Start at top-left (-135°) and proceed clockwise around the ring
  const arcGap = (iconSize + 2) / radius;
  const startAngle = -3 * Math.PI / 4;

  for (let i = 0; i < numEffects; i++) {
    const statusKey = statuses[i];
    const tex = _textures.get(statusKey);
    if (!tex || tex === PIXI.Texture.EMPTY) continue;

    const angle = startAngle + (i * arcGap);
    const ix = cx + radius * Math.cos(angle);
    const iy = cy + radius * Math.sin(angle);

    // Dark circular background
    const bg = new PIXI.Graphics();
    bg.beginFill(0x000000, 0.6);
    bg.drawCircle(ix, iy, iconSize * 0.58);
    bg.endFill();
    container.addChild(bg);

    // Icon sprite
    const sprite = new PIXI.Sprite(tex);
    sprite.width = iconSize;
    sprite.height = iconSize;
    sprite.anchor.set(0.5, 0.5);
    sprite.position.set(ix, iy);
    container.addChild(sprite);

    // Duration counter
    const turns = durations[statusKey];
    if (turns !== undefined && turns !== null) {
      const fontSize = Math.max(7, Math.round(iconSize * 0.45));
      const style = new PIXI.TextStyle({
        fontFamily: "Signika, sans-serif",
        fontSize,
        fill: 0xFFFFFF,
        stroke: 0x000000,
        strokeThickness: 3,
        fontWeight: "bold"
      });
      const text = new PIXI.Text(String(turns), style);
      text.anchor.set(1, 1);
      text.position.set(ix + iconSize * 0.45, iy + iconSize * 0.45);
      container.addChild(text);
    }
  }

  if (container.children.length) {
    token.addChild(container);
  }
}

/**
 * Status Effect → ActiveEffect Sync Module
 *
 * Syncs the actor's system.statusEffects (source of truth) to display-only
 * ActiveEffects so that Foundry's token rendering shows status icons on tokens.
 * These AEs are flagged with manashard.statusDisplay = true and carry no rules.
 */

/** Debounce timers keyed by actor ID. */
const _syncTimers = new Map();

/**
 * Schedule a debounced sync of status effects → display ActiveEffects.
 * Debounces by 50ms to coalesce the two-call pattern where statusEffects
 * and statusDurations are updated separately.
 * @param {Actor} actor
 */
export function scheduleSyncStatusEffects(actor) {
  if (!game.user.isGM) return;
  const key = actor.id;
  if (_syncTimers.has(key)) clearTimeout(_syncTimers.get(key));
  _syncTimers.set(key, setTimeout(() => {
    _syncTimers.delete(key);
    _syncStatusEffects(actor);
  }, 50));
}

/**
 * Immediately sync status effects → display ActiveEffects for an actor.
 * Creates AEs for active statuses that lack one; removes AEs for expired statuses.
 * @param {Actor} actor
 */
async function _syncStatusEffects(actor) {
  if (!game.user.isGM || !actor) return;

  const activeStatuses = new Set(actor.system.statusEffects ?? []);
  const statusConfig = CONFIG.MANASHARD?.statusEffects ?? {};
  const iconPaths = CONFIG.MANASHARD?.statusIconPaths ?? {};

  // Find existing display-only AEs
  const displayEffects = actor.effects.filter(e => e.getFlag("manashard", "statusDisplay"));
  const existingMap = new Map();
  for (const effect of displayEffects) {
    const statusId = effect.getFlag("manashard", "statusId");
    if (statusId) existingMap.set(statusId, effect);
  }

  const toCreate = [];
  const toDelete = [];

  // Remove AEs for statuses no longer active, or broken AEs missing img
  for (const [statusId, effect] of existingMap) {
    if (!activeStatuses.has(statusId)) {
      toDelete.push(effect.id);
    } else if (!effect.img) {
      // Old AE created with deprecated 'icon' field — delete and recreate
      toDelete.push(effect.id);
      existingMap.delete(statusId);
    }
  }

  // Create AEs for new statuses (or re-create after cleanup above)
  for (const statusKey of activeStatuses) {
    if (existingMap.has(statusKey)) continue;
    const cfg = statusConfig[statusKey];
    if (!cfg) continue;

    toCreate.push({
      name: game.i18n.localize(cfg.label),
      img: iconPaths[statusKey] ?? "icons/svg/aura.svg",
      disabled: false,
      statuses: [statusKey],
      flags: {
        manashard: {
          statusDisplay: true,
          statusId: statusKey
        }
      }
    });
  }

  // Batch operations
  if (toDelete.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
  }
  if (toCreate.length) {
    await actor.createEmbeddedDocuments("ActiveEffect", toCreate);
  }
}

/**
 * Run an initial sync pass for all tokens on the current scene.
 * Called on canvasReady to ensure display AEs exist for pre-existing statuses.
 */
export async function syncAllTokenStatuses() {
  if (!game.user.isGM || !canvas?.scene) return;
  const seen = new Set();
  for (const token of canvas.scene.tokens.contents) {
    const actor = token.actor;
    if (!actor || seen.has(actor.id)) continue;
    seen.add(actor.id);
    await _syncStatusEffects(actor);
  }
}

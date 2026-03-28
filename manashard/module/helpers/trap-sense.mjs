/**
 * Custom Detection Mode: Trap Sense
 * Allows characters with Trap Sense to detect hidden trap-type tokens
 * within their Vision range, rendering them as a dark silhouette.
 */

const DetectionMode = foundry.canvas.perception.DetectionMode;

export class DetectionModeTrapSense extends DetectionMode {

  /** @override */
  static defineSchema() {
    const schema = super.defineSchema();
    return schema;
  }

  /**
   * Only detect trap-type actors.
   * @override
   */
  _canDetect(visionSource, target) {
    const actor = target?.actor;
    if (!actor || actor.type !== "trap") return false;
    // Only detect armed traps
    if (actor.system?.armed === false) return false;
    return true;
  }

  /**
   * Check range and (optionally) LOS.
   * Trap Sense pierces walls, so we only check range.
   * @override
   */
  _testPoint(visionSource, mode, target, test) {
    if (!this._testRange(visionSource, mode, target, test)) return false;
    return true;
  }

  /**
   * Return a PIXI filter that renders detected traps as a dark, desaturated silhouette.
   * @override
   */
  static getDetectionFilter() {
    if (this._detectionFilter) return this._detectionFilter;
    const filter = new PIXI.ColorMatrixFilter();
    filter.desaturate();
    filter.brightness(0.25, false);
    this._detectionFilter = filter;
    return this._detectionFilter;
  }

  /** Cached filter instance */
  static _detectionFilter = undefined;
}

/**
 * Sync Trap Sense detection mode onto a token based on the actor's rule engine
 * results and/or active effect flags. Range is always the actor's Vision stat.
 * Called when AEs/items are created/updated/deleted on an actor.
 * @param {Actor} actor - The actor to check for Trap Sense
 */
export async function syncTrapSenseDetection(actor) {
  if (!game.user.isGM && actor.ownership[game.user.id] !== 3) return;

  // Determine if the actor has Trap Sense from any source
  let hasTrapSense = actor.system._hasTrapSense ?? false;

  // Also check direct AE flags (manual buff application)
  if (!hasTrapSense) {
    for (const effect of actor.effects) {
      const ts = effect.getFlag("manashard", "trapSense");
      if (ts && !effect.disabled) {
        hasTrapSense = true;
        break;
      }
    }
  }

  // Range = actor's Vision stat (derived from SPI + modifiers)
  const raw = actor.system.vision;
  const visionRange = Number.isFinite(raw) ? raw : 6;

  // Sanitize a detection modes array: ensure every entry has a finite range
  const sanitizeModes = (modes) => modes.map(m => ({
    ...m,
    range: Number.isFinite(m.range) ? m.range : 0
  }));

  // Current detection modes on the prototype token
  const protoModes = actor.prototypeToken.detectionModes ?? [];
  const existing = protoModes.find(m => m.id === "trapSense");

  if (hasTrapSense && !existing) {
    const updated = sanitizeModes([...protoModes, { id: "trapSense", range: visionRange, enabled: true }]);
    await actor.update({ "prototypeToken.detectionModes": updated });
  } else if (hasTrapSense && existing && existing.range !== visionRange) {
    const updated = sanitizeModes(protoModes.map(m =>
      m.id === "trapSense" ? { ...m, range: visionRange } : m
    ));
    await actor.update({ "prototypeToken.detectionModes": updated });
  } else if (!hasTrapSense && existing) {
    const updated = sanitizeModes(protoModes.filter(m => m.id !== "trapSense"));
    await actor.update({ "prototypeToken.detectionModes": updated });
  }

  // Also update any placed tokens for this actor
  for (const token of actor.getActiveTokens(false)) {
    const tokenModes = token.document.detectionModes ?? [];
    const tokenExisting = tokenModes.find(m => m.id === "trapSense");

    if (hasTrapSense && !tokenExisting) {
      const updated = sanitizeModes([...tokenModes, { id: "trapSense", range: visionRange, enabled: true }]);
      await token.document.update({ detectionModes: updated });
    } else if (hasTrapSense && tokenExisting && tokenExisting.range !== visionRange) {
      const updated = sanitizeModes(tokenModes.map(m =>
        m.id === "trapSense" ? { ...m, range: visionRange } : m
      ));
      await token.document.update({ detectionModes: updated });
    } else if (!hasTrapSense && tokenExisting) {
      const updated = sanitizeModes(tokenModes.filter(m => m.id !== "trapSense"));
      await token.document.update({ detectionModes: updated });
    }
  }
}

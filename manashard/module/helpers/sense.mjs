/**
 * Custom Detection Mode: Sense
 * Allows characters with Sense to detect hidden hostile creature tokens
 * within their Vision range, rendering them as a red-tinted silhouette.
 */

const DetectionMode = foundry.canvas.perception.DetectionMode;

export class DetectionModeSense extends DetectionMode {

  /** @override */
  static defineSchema() {
    const schema = super.defineSchema();
    return schema;
  }

  /**
   * Only detect hidden hostile creature tokens (not traps).
   * @override
   */
  _canDetect(visionSource, target) {
    const actor = target?.actor;
    if (!actor || actor.type === "trap") return false;
    // Only detect hostile tokens
    if (target?.document?.disposition !== -1) return false;
    return true;
  }

  /**
   * Check range only — Sense pierces walls, same as Trap Sense.
   * @override
   */
  _testPoint(visionSource, mode, target, test) {
    if (!this._testRange(visionSource, mode, target, test)) return false;
    return true;
  }

  /**
   * Return a PIXI filter that renders detected threats as a red-tinted silhouette.
   * @override
   */
  static getDetectionFilter() {
    if (this._detectionFilter) return this._detectionFilter;
    const filter = new PIXI.ColorMatrixFilter();
    filter.desaturate();
    filter.brightness(0.3, false);
    // Red tint: boost red channel, reduce green/blue
    const redTint = [
      1.4, 0,   0,   0, 0,
      0,   0.4, 0,   0, 0,
      0,   0,   0.4, 0, 0,
      0,   0,   0,   1, 0
    ];
    filter._loadMatrix(redTint, false);
    this._detectionFilter = filter;
    return this._detectionFilter;
  }

  /** Cached filter instance */
  static _detectionFilter = undefined;
}

/**
 * Sync Sense detection mode onto a token based on the actor's rule engine
 * results and/or active effect flags. Range is always the actor's Vision stat.
 * Called when AEs/items are created/updated/deleted on an actor.
 * @param {Actor} actor - The actor to check for Sense
 */
export async function syncSenseDetection(actor) {
  if (!game.user.isGM && actor.ownership[game.user.id] !== 3) return;

  // Determine if the actor has Sense from any source
  let hasSense = actor.system._hasSense ?? false;

  // Also check direct AE flags (manual buff application)
  if (!hasSense) {
    for (const effect of actor.effects) {
      const s = effect.getFlag("manashard", "sense");
      if (s && !effect.disabled) {
        hasSense = true;
        break;
      }
    }
  }

  // Range = actor's Vision stat (derived from SPI + modifiers)
  const raw = actor.system.vision;
  const visionRange = Number.isFinite(raw) ? raw : 4;

  // Sanitize a detection modes array: ensure every entry has a finite range
  const sanitizeModes = (modes) => modes.map(m => ({
    ...m,
    range: Number.isFinite(m.range) ? m.range : 0
  }));

  // Current detection modes on the prototype token
  const protoModes = actor.prototypeToken.detectionModes ?? [];
  const existing = protoModes.find(m => m.id === "sense");

  if (hasSense && !existing) {
    const updated = sanitizeModes([...protoModes, { id: "sense", range: visionRange, enabled: true }]);
    await actor.update({ "prototypeToken.detectionModes": updated });
  } else if (hasSense && existing && existing.range !== visionRange) {
    const updated = sanitizeModes(protoModes.map(m =>
      m.id === "sense" ? { ...m, range: visionRange } : m
    ));
    await actor.update({ "prototypeToken.detectionModes": updated });
  } else if (!hasSense && existing) {
    const updated = sanitizeModes(protoModes.filter(m => m.id !== "sense"));
    await actor.update({ "prototypeToken.detectionModes": updated });
  }

  // Also update any placed tokens for this actor
  for (const token of actor.getActiveTokens(false)) {
    const tokenModes = token.document.detectionModes ?? [];
    const tokenExisting = tokenModes.find(m => m.id === "sense");

    if (hasSense && !tokenExisting) {
      const updated = sanitizeModes([...tokenModes, { id: "sense", range: visionRange, enabled: true }]);
      await token.document.update({ detectionModes: updated });
    } else if (hasSense && tokenExisting && tokenExisting.range !== visionRange) {
      const updated = sanitizeModes(tokenModes.map(m =>
        m.id === "sense" ? { ...m, range: visionRange } : m
      ));
      await token.document.update({ detectionModes: updated });
    } else if (!hasSense && tokenExisting) {
      const updated = sanitizeModes(tokenModes.filter(m => m.id !== "sense"));
      await token.document.update({ detectionModes: updated });
    }
  }
}

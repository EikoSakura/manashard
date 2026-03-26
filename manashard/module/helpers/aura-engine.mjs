/**
 * Aura Engine — automatically applies/removes aura effects based on token proximity.
 *
 * When a token with Aura rule elements is on the scene, nearby tokens matching
 * the aura's target type automatically gain the aura's nested effect as an ActiveEffect.
 * Moving out of range removes it.
 */

import { collectRules } from "./rule-engine.mjs";
import { gridDistance } from "./combat.mjs";

// --- Debounce ---

let _refreshTimer = null;

/**
 * Schedule a debounced aura refresh for the given scene.
 * @param {Scene} scene
 */
export function scheduleAuraRefresh(scene) {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  _refreshTimer = setTimeout(() => {
    _refreshTimer = null;
    refreshAuras(scene);
  }, 100);
}

// --- Core Logic ---

/**
 * Refresh all aura effects on a scene.
 * Compares desired state (which tokens should have which aura effects)
 * against actual state (which ActiveEffects with aura flags exist),
 * then creates/removes effects to reconcile.
 *
 * @param {Scene} scene
 */
async function refreshAuras(scene) {
  if (!scene) return;
  if (!canvas?.scene || canvas.scene.id !== scene.id) return;

  const tokens = scene.tokens.contents;
  if (!tokens.length) return;

  // 1. Build desired aura state: Map<targetActorId, Set<auraKey>>
  const desired = new Map(); // targetActorId → Map<auraKey, {effect, source}>
  const allAuraKeys = new Set();

  for (const sourceToken of tokens) {
    const sourceActor = sourceToken.actor;
    if (!sourceActor) continue;

    // Get aura rules from the actor's cached rules
    const auras = sourceActor.system?._ruleCache?.auras;
    if (!auras?.length) continue;

    for (let i = 0; i < auras.length; i++) {
      const aura = auras[i];
      if (!aura.effect?.key) continue;

      const auraKey = `${sourceActor.id}.${aura._source?.itemId ?? "unknown"}.${i}`;
      allAuraKeys.add(auraKey);

      for (const targetToken of tokens) {
        if (targetToken.id === sourceToken.id) continue;
        const targetActor = targetToken.actor;
        if (!targetActor) continue;

        // Check distance
        const dist = gridDistance(sourceToken, targetToken);
        if (dist > (aura.radius ?? 2)) continue;

        // Check disposition match
        if (!dispositionMatch(sourceToken, targetToken, aura.target ?? "allies")) continue;

        // Add to desired state
        if (!desired.has(targetActor.id)) desired.set(targetActor.id, new Map());
        desired.get(targetActor.id).set(auraKey, {
          effect: aura.effect,
          sourceName: sourceActor.name,
          sourceItemName: aura._source?.itemName ?? "Aura",
          label: aura.label ?? "Aura"
        });
      }
    }
  }

  // 2. Compare with actual state and reconcile
  for (const token of tokens) {
    const actor = token.actor;
    if (!actor) continue;

    const existingAuraEffects = actor.effects.filter(e =>
      e.getFlag("manashard", "auraSource")
    );

    const desiredForActor = desired.get(actor.id) ?? new Map();

    // Effects to remove: exist on actor but not in desired set
    const toRemove = [];
    for (const effect of existingAuraEffects) {
      const auraKey = effect.getFlag("manashard", "auraKey");
      if (!desiredForActor.has(auraKey)) {
        toRemove.push(effect.id);
      }
    }

    // Effects to create: in desired set but don't exist on actor
    const existingKeys = new Set(existingAuraEffects.map(e => e.getFlag("manashard", "auraKey")));
    const toCreate = [];
    for (const [auraKey, auraData] of desiredForActor) {
      if (!existingKeys.has(auraKey)) {
        toCreate.push(_buildAuraEffect(auraKey, auraData));
      }
    }

    // Apply changes
    if (toRemove.length) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", toRemove);
    }
    if (toCreate.length) {
      await actor.createEmbeddedDocuments("ActiveEffect", toCreate);
    }
  }
}

/**
 * Build an ActiveEffect data object for an aura effect.
 * @param {string} auraKey - Unique identifier for this aura instance
 * @param {object} auraData - { effect, sourceName, sourceItemName, label }
 * @returns {object} ActiveEffect creation data
 */
function _buildAuraEffect(auraKey, auraData) {
  return {
    name: `${auraData.label} (from ${auraData.sourceName})`,
    img: "icons/svg/aura.svg",
    origin: null,
    disabled: false,
    flags: {
      manashard: {
        auraSource: auraKey.split(".")[0], // source actor ID
        auraKey,
        rules: [auraData.effect]
      }
    }
  };
}


/**
 * Check if target token matches the aura's target type relative to source.
 * @param {TokenDocument} source
 * @param {TokenDocument} target
 * @param {string} targetType - "allies" or "enemies"
 * @returns {boolean}
 */
function dispositionMatch(source, target, targetType) {
  const sameTeam = source.disposition === target.disposition;
  if (targetType === "allies") return sameTeam;
  if (targetType === "enemies") return !sameTeam;
  return false;
}

/**
 * Remove all aura-granted ActiveEffects from all actors on a scene.
 * Called when the scene changes or on cleanup.
 * @param {Scene} scene
 */
export async function cleanupAuras(scene) {
  if (!scene) return;
  for (const token of scene.tokens.contents) {
    const actor = token.actor;
    if (!actor) continue;
    const auraEffects = actor.effects.filter(e => e.getFlag("manashard", "auraSource"));
    if (auraEffects.length) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", auraEffects.map(e => e.id));
    }
  }
}

/**
 * Central combat resolution engine for the Manashard system.
 * Pure functions for damage calculation, elemental interactions,
 * status infliction, and the Apply Damage chat button handler.
 */

// ═══════════════════════════════════════════════════════════════
// GRID DISTANCE UTILITY
// ═══════════════════════════════════════════════════════════════

/**
 * Compute grid distance between two tokens (Chebyshev / king-move).
 * Uses edge-to-edge measurement: the minimum Chebyshev distance between
 * any cell of token A and any cell of token B.
 * Returns distance in grid squares. Returns Infinity if canvas is unavailable.
 * @param {Token|TokenDocument} a
 * @param {Token|TokenDocument} b
 * @returns {number}
 */
export function gridDistance(a, b) {
  const gs = canvas?.grid?.size;
  if (!gs) return Infinity;

  // Extract position and size, supporting both Token placeables and TokenDocuments
  // Round pixel→grid to avoid floating-point drift with sub-pixel token positions
  const ax = Math.round((a.document?.x ?? a.x ?? 0) / gs);
  const ay = Math.round((a.document?.y ?? a.y ?? 0) / gs);
  const aw = a.document?.width ?? a.width ?? 1;
  const ah = a.document?.height ?? a.height ?? 1;

  const bx = Math.round((b.document?.x ?? b.x ?? 0) / gs);
  const by = Math.round((b.document?.y ?? b.y ?? 0) / gs);
  const bw = b.document?.width ?? b.width ?? 1;
  const bh = b.document?.height ?? b.height ?? 1;

  // Edge-to-edge gap on each axis (0 if adjacent/overlapping)
  const gapX = Math.max(0, ax - (bx + bw), bx - (ax + aw));
  const gapY = Math.max(0, ay - (by + bh), by - (ay + ah));

  // Distance in tiles: adjacent = 1, one tile gap = 2, etc.
  return Math.max(gapX, gapY) + 1;
}

/**
 * Validate that an attack is within weapon range.
 * Returns { valid: true } or { valid: false, reason: "..." }.
 * @param {object} options
 * @param {number} options.distance - Grid distance to target
 * @param {number} options.minRange - Weapon minimum range
 * @param {number} options.maxRange - Weapon maximum range
 * @param {string} options.rangeType - "melee", "ranged", or "thrown"
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateAttackRange({ distance, minRange = 1, maxRange = 1, rangeType = "melee" }) {
  if (distance === Infinity) return { valid: true }; // No canvas — skip validation

  if (distance < minRange) {
    if (rangeType === "ranged") return { valid: false, reason: "Target is too close for a ranged attack!" };
    return { valid: false, reason: "Target is too close!" };
  }
  if (distance > maxRange) {
    if (rangeType === "melee") return { valid: false, reason: "Target is out of melee range!" };
    if (rangeType === "thrown") return { valid: false, reason: "Target is out of throwing range!" };
    return { valid: false, reason: "Target is out of range!" };
  }
  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════
// TARGET RESTRICTION CHECK
// ═══════════════════════════════════════════════════════════════

/**
 * Check whether an attack is allowed against a defender based on TargetRestriction rules.
 * Rules can come from equipped items, skills, or Active Effects via the rule cache.
 * @param {object} attackerSystem - Attacker's system data (must have _ruleCache)
 * @param {Actor|null} defenderActor - Defender actor
 * @param {string|null} [attackingItemId=null] - Item ID of the skill being used (filters skill-scoped rules)
 * @returns {{ allowed: boolean, blockedType: string|null }}
 */
export function checkTargetRestrictions(attackerSystem, defenderActor, attackingItemId = null) {
  const restrictions = attackerSystem?._ruleCache?.targetRestrictions;
  if (!restrictions?.length) return { allowed: true, blockedType: null };
  if (!defenderActor) return { allowed: true, blockedType: null };

  // Filter by skill scope — restrictions on active skills only apply when that skill is attacking
  const scoped = restrictions.filter(r => {
    const src = r._source;
    if (!src) return true;
    if (src.skillType && COMBAT_SKILL_TYPES.has(src.skillType)) {
      return src.itemId === attackingItemId;
    }
    return true;
  });

  const defenderTypes = _getCreatureTypes(defenderActor);

  for (const rule of scoped) {
    const types = rule.creatureTypes ?? [];
    if (!types.length) continue;

    // Check if any of the defender's types match any of the rule's types
    const matches = defenderTypes.some(dt => types.includes(dt));

    if (rule.mode === "only" && !matches) {
      const label = defenderTypes.map(t => _getCreatureTypeLabel(t)).join("/") || "Unknown";
      return { allowed: false, blockedType: label };
    }
    if (rule.mode === "except" && matches) {
      const label = defenderTypes.map(t => _getCreatureTypeLabel(t)).join("/") || "Unknown";
      return { allowed: false, blockedType: label };
    }
  }

  return { allowed: true, blockedType: null };
}

/**
 * Get the localized label for a creature type key.
 */
function _getCreatureTypeLabel(type) {
  const key = CONFIG.MANASHARD?.creatureTypes?.[type];
  return key ? (game?.i18n?.localize(key) ?? type) : type;
}

// ═══════════════════════════════════════════════════════════════
// CONDITIONAL BONUS EVALUATION
// ═══════════════════════════════════════════════════════════════

/**
 * Check if the defender matches a creature type.
 */
function _targetIsCreatureType(defenderActor, type) {
  const sys = defenderActor?.system;
  if (!sys) return false;
  const ct = sys.creatureType;
  return Array.isArray(ct) ? ct.includes(type) : ct === type;
}

/**
 * Get the defender's creature types as an array.
 */
function _getCreatureTypes(defenderActor) {
  const sys = defenderActor?.system;
  if (!sys) return [];
  const ct = sys.creatureType;
  return Array.isArray(ct) ? ct : (ct ? [ct] : []);
}

/**
 * Active skill types — rules from these sources only apply when that skill is the attacking skill.
 * Rules from other sources (passives, weapons, equipment, species) always apply.
 */
const COMBAT_SKILL_TYPES = new Set(["magic", "art", "active", "command"]);

/**
 * Filter rules by skill scope: rules on active skills only apply when that skill is being used.
 * Rules on passives, equipment, weapons, and species always apply.
 * @param {object[]} rules - Array of rules with _source
 * @param {string|null} attackingItemId - The item ID of the skill being used
 * @returns {object[]} Filtered rules
 */
function filterBySkillScope(rules, attackingItemId) {
  if (!rules?.length) return [];
  return rules.filter(r => {
    const src = r._source;
    if (!src) return true;
    if (src.skillType && COMBAT_SKILL_TYPES.has(src.skillType)) {
      return src.itemId === attackingItemId;
    }
    return true;
  });
}

/**
 * Check if a condition is met in the current combat context.
 * @param {string} condition - Condition key from ruleConditions
 * @param {object} context - { system, defenderActor, element, damageType, isInitiator }
 * @returns {boolean}
 */
function checkCondition(condition, context) {
  const { system, defenderActor, element, damageType, isInitiator, weaponMinRange, weaponMaxRange, weaponRangeType, attackDistance, isHealing, weaponCategory, attackerActorId, targetTokenId } = context;
  const hp = system?.stats?.hp;
  const mp = system?.stats?.mp;
  const hpPct = (hp?.max > 0) ? hp.value / hp.max : 1;
  const mpPct = (mp?.max > 0) ? mp.value / mp.max : 1;

  switch (condition) {
    case "initiating": return isInitiator === true;
    case "defending": return isInitiator === false;
    case "hpBelow50": return hpPct < 0.5;
    case "hpBelow25": return hpPct < 0.25;
    case "hpFull": return hpPct >= 1;
    case "mpBelow50": return mpPct < 0.5;
    case "attackingWithFire": return element === "fire";
    case "attackingWithIce": return element === "ice";
    case "attackingWithWater": return element === "water";
    case "attackingWithLightning": return element === "lightning";
    case "attackingWithWind": return element === "wind";
    case "attackingWithEarth": return element === "earth";
    case "attackingWithLight": return element === "light";
    case "attackingWithDark": return element === "dark";
    case "targetIsBoss": return !!defenderActor?.system?.isBoss;
    case "weaponIsPhysical": return damageType === "physical";
    case "weaponIsMagical": return damageType === "magical";
    case "attackIsMelee": {
      if (weaponRangeType === "thrown") return (attackDistance ?? 1) <= 1;
      return weaponRangeType === "melee";
    }
    case "attackIsRanged": {
      if (weaponRangeType === "thrown") return (attackDistance ?? 1) >= 2;
      return weaponRangeType === "ranged";
    }
    case "attackIsThrown": return weaponRangeType === "thrown";
    case "skillIsHealing": return !!isHealing;
    case "receivingHealing": return !!isHealing;
    case "self": return !!context.weaponItemId && context.weaponItemId === context.ruleSource?.itemId;
    case "wieldingSwords": return weaponCategory === "swords";
    case "wieldingAxes": return weaponCategory === "axes";
    case "wieldingDaggers": return weaponCategory === "daggers";
    case "wieldingPolearms": return weaponCategory === "polearms";
    case "wieldingChains": return weaponCategory === "chains";
    case "wieldingFist": return weaponCategory === "fist";
    case "wieldingBows": return weaponCategory === "bows";
    case "wieldingFirearms": return weaponCategory === "firearms";
    case "wieldingGrimoires": return weaponCategory === "grimoires";
    case "wieldingStaves": return weaponCategory === "staves";
    case "wieldingShields": return weaponCategory === "shields";
    case "allyWithinReachOfTarget": {
      if (!targetTokenId || !attackerActorId) return 0;
      const tgtTok = canvas.tokens?.get(targetTokenId);
      const atkTok = canvas.tokens?.placeables.find(t => t.actor?.id === attackerActorId);
      if (!tgtTok || !atkTok) return 0;
      const atkDisp = atkTok.document.disposition;
      return canvas.tokens.placeables.filter(t => {
        if (!t.actor || t.actor.id === attackerActorId) return false;
        if (t.document.disposition !== atkDisp) return false;
        const allyReach = t.actor.system?.reach ?? 1;
        return gridDistance(t, tgtTok) <= allyReach;
      }).length;
    }
    default: return false;
  }
}

/**
 * Evaluate conditional Modifier rules against combat context.
 * Rules on active skills are filtered to only apply when that skill is being used.
 * Returns bonuses grouped by selector.
 * @param {object[]} conditionalRules - Array of conditioned rules from _ruleCache
 * @param {object} context - { system, defenderActor, element, damageType, isInitiator, weaponItemId }
 * @returns {{ statBonuses: object }}
 */
export function evaluateConditionalRules(conditionalRules, context) {
  const statBonuses = {};
  if (!conditionalRules?.length) return { statBonuses };

  // Filter by skill scope — active skill rules only apply when that skill is attacking
  const scoped = filterBySkillScope(conditionalRules, context.weaponItemId);

  for (const rule of scoped) {
    if (typeof rule.value !== "number") continue;
    if (rule.key !== "Modifier" || !rule.selector) continue;
    // Must have a condition or targetTypes to be conditional
    if (!rule.condition && !rule.targetTypes?.length) continue;

    context.ruleSource = rule._source;

    // Check condition (if present)
    let condResult = true;
    if (rule.condition) {
      condResult = checkCondition(rule.condition, context);
      if (!condResult) continue;
    }

    // Check targetTypes (if present) — defender must match at least one
    if (rule.targetTypes?.length) {
      const defenderTypes = _getCreatureTypes(context.defenderActor);
      if (!rule.targetTypes.some(t => defenderTypes.includes(t) || _targetIsCreatureType(context.defenderActor, t))) continue;
    }

    let effectiveValue = rule.value;
    // Stacking: multiply value by condition count (e.g. per ally in reach)
    if (rule.stacks && typeof condResult === "number" && condResult > 1) {
      effectiveValue *= condResult;
    }
    statBonuses[rule.selector] = (statBonuses[rule.selector] ?? 0) + effectiveValue;
  }
  context.ruleSource = null;

  return { statBonuses };
}

// ═══════════════════════════════════════════════════════════════
// COMBAT NOTE EVALUATION
// ═══════════════════════════════════════════════════════════════

/**
 * Evaluate CombatNote rules against combat context.
 * Rules on active skills are filtered to only apply when that skill is being used.
 * Returns notes whose conditions pass (or that have no condition).
 * @param {object[]} notes - CombatNote rules from _ruleCache.combatNotes
 * @param {object} context - { system, defenderActor, element, damageType, isInitiator, weaponCategory, weaponItemId }
 * @returns {Array<{ text: string, source: object }>}
 */
export function evaluateCombatNotes(notes, context) {
  if (!notes?.length) return [];

  // Filter by skill scope — active skill notes only show when that skill is used
  const scoped = filterBySkillScope(notes, context.weaponItemId);

  const result = [];
  for (const note of scoped) {
    if (!note.text) continue;
    context.ruleSource = note._source;
    if (note.condition && !checkCondition(note.condition, context)) continue;
    result.push({ text: note.text, source: note._source });
  }
  context.ruleSource = null;
  return result;
}

// ═══════════════════════════════════════════════════════════════
// ELEMENTAL MULTIPLIER
// ═══════════════════════════════════════════════════════════════

/**
 * Compute elemental damage multiplier based on defender's profile.
 * @param {string} element - Attack element (may be empty/"null")
 * @param {Actor|null} defenderActor - Defender actor (for elemental profile)
 * @returns {{ multiplier: number, tier: string }}
 */
export function computeElementalMultiplier(element, defenderActor) {
  const neutral = { multiplier: 1.0, tier: "neutral" };
  if (!element || element === "null" || element === "") return neutral;

  // Check for ElementalAffinity rule overrides on defender (e.g., from equipment)
  // These take priority over the base elemental profile
  const defCache = defenderActor?.system?._ruleCache;
  if (defCache?.elementalAffinities?.length) {
    for (const rule of defCache.elementalAffinities) {
      if (rule.element === element && rule.tier) {
        const overrideTier = rule.tier;
        const mult = CONFIG.MANASHARD.elementalMultipliers?.[overrideTier] ?? 1.0;
        return { multiplier: mult, tier: overrideTier };
      }
    }
  }

  // Check defender's base elemental profile (NPCs have this natively)
  const profile = defenderActor?.system?.elementalProfile;
  if (!profile) return neutral;

  const tier = profile[element] ?? "neutral";
  const multiplier = CONFIG.MANASHARD.elementalMultipliers?.[tier] ?? 1.0;
  return { multiplier, tier };
}

// ═══════════════════════════════════════════════════════════════
// STATUS INFLICTION
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a status is immune on the defender.
 * @param {object[]} immunities - StatusImmunity rules from defender's _ruleCache
 * @param {string} statusKey - Status effect key
 * @returns {boolean}
 */
export function checkStatusImmunity(immunities, statusKey) {
  if (!immunities?.length) return false;
  return immunities.some(r => r.status === statusKey);
}

/**
 * Roll status infliction chances and check immunities.
 * @param {object[]} inflictions - StatusInflict rules from attacker's _ruleCache
 * @param {Actor|null} defenderActor - Defender actor
 * @returns {Array<{ status: string, statusLabel: string, success: boolean, roll: number, chance: number, immune: boolean, duration: number }>}
 */
export function rollStatusInflictions(inflictions, defenderActor) {
  if (!inflictions?.length) return [];

  const defImmunities = defenderActor?.system?._ruleCache?.statusImmunities ?? [];
  const defResistances = defenderActor?.system?.statusResistances ?? {};
  const results = [];

  for (const rule of inflictions) {
    if (!rule.status || typeof rule.chance !== "number") continue;

    // Check immunity from both rule-based immunities and resistance tier
    const tier = defResistances[rule.status] ?? "neutral";
    const immune = tier === "immune" || checkStatusImmunity(defImmunities, rule.status);

    // Apply resistance tier modifier (±25pp)
    let baseChance = rule.chance;
    if (tier === "vulnerable") baseChance += 25;
    else if (tier === "resist") baseChance -= 25;
    const effectiveChance = Math.min(100, Math.max(0, baseChance));

    // Use config base duration directly
    const statusConfig = CONFIG.MANASHARD.statusEffects?.[rule.status];
    const baseDuration = statusConfig?.duration ?? 3;
    const effectiveDuration = Math.max(1, baseDuration);

    const roll = Math.ceil(Math.random() * 100);
    const success = !immune && roll <= effectiveChance;

    const statusLabel = statusConfig
      ? (game.i18n?.localize(statusConfig.label) ?? rule.status)
      : rule.status.charAt(0).toUpperCase() + rule.status.slice(1);

    results.push({
      status: rule.status,
      statusLabel,
      success,
      roll,
      chance: effectiveChance,
      immune,
      duration: effectiveDuration
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// SCALING PARSER
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// MAIN COMBAT RESOLUTION
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve an attack's computed values (before rolling dice).
 * @param {object} params
 * @param {object} params.attackerSystem - Attacker's system data
 * @param {Actor|null} params.defenderActor - Defender actor document
 * @param {string} params.element - Attack element
 * @param {string} params.damageType - "physical" or "magical"
 * @param {number} params.baseDamage - Raw damage before defense
 * @param {number} params.accuracy - Attacker's accuracy
 * @param {number} params.critical - Attacker's critical rate
 * @param {number} params.defenderEvasion - Defender's evasion
 * @param {number} params.defenderDef - Defender's defense (pdef or mdef)
 * @param {number} params.defenderCritAvoid - Defender's crit avoid
 * @param {number} params.defenderBlockChance - Defender's block chance (shield)
 * @param {number} [params.chantModifier=1.0] - Chant effect modifier for skills
 * @param {boolean} [params.isInitiator=false] - Whether the attacker is initiating (their turn) vs reacting
 * @returns {object} CombatResult object (pre-roll)
 */
export function resolveAttack(params) {
  const {
    attackerSystem, defenderActor,
    element, damageType,
    baseDamage, accuracy, critical,
    defenderEvasion, defenderDef, defenderCritAvoid, defenderBlockChance,
    chantModifier = 1.0,
    damageMultiplier = 1.0,
    isInitiator = false,
    isHealing = false,
    weaponItemId = null,
    weaponCategory = null,
    attackerActorId = null,
    targetTokenId = null
  } = params;

  const ruleCache = attackerSystem?._ruleCache ?? {};

  // Resolve element — GrantElement rules can override the attack's element
  let resolvedElement = element;
  if (!resolvedElement || resolvedElement === "null") {
    if (ruleCache.grantedElements?.length) {
      resolvedElement = ruleCache.grantedElements[0].element;
    }
  }

  const atkContext = { system: attackerSystem, defenderActor, element: resolvedElement, damageType, isInitiator, isHealing, weaponItemId, weaponCategory, attackerActorId, targetTokenId };

  // Evaluate attacker conditional rules
  const atkConditionals = ruleCache.conditionalRules ?? [];
  const atkCond = evaluateConditionalRules(atkConditionals, atkContext, baseDamage);

  // Evaluate defender conditional rules (defending = not on their turn)
  const defRuleCache = defenderActor?.system?._ruleCache ?? {};
  const defIsInitiator = !!defenderActor && (game.combat?.combatant?.actorId === defenderActor.id);
  const defContext = { system: defenderActor?.system, defenderActor: null, element: resolvedElement, damageType, isInitiator: defIsInitiator, isHealing };
  const defCond = evaluateConditionalRules(defRuleCache.conditionalRules, defContext);

  // Apply attacker conditional bonuses
  let modAccuracy = accuracy + (atkCond.statBonuses.accuracy ?? 0);
  let modCritical = critical + (atkCond.statBonuses.critical ?? 0);
  let modDamage = baseDamage + (atkCond.statBonuses.damage ?? 0);

  // Impair: halve attacker's ACC and CRIT at resolution time
  const atkStatuses = new Set(attackerSystem?.statusEffects ?? []);
  const impairApplied = atkStatuses.has("impair");
  if (impairApplied) {
    modAccuracy = Math.floor(modAccuracy / 2);
    modCritical = Math.floor(modCritical / 2);
  }

  // Apply piercing (reduces defender's effective defense)
  const piercingAmount = atkCond.statBonuses.piercing ?? 0;

  // Apply defender conditional bonuses, then subtract piercing
  let modDefenderDef = Math.max(0, defenderDef + (defCond.statBonuses.def ?? 0) - piercingAmount);
  const evaBonus = damageType === "magical" ? (defCond.statBonuses.meva ?? 0) : (defCond.statBonuses.peva ?? 0);
  let modDefenderEvasion = defenderEvasion + evaBonus;
  const modDefenderCritAvoid = defenderCritAvoid + (defCond.statBonuses.critAvoid ?? 0);
  const modDefenderBlockChance = defenderBlockChance + (defCond.statBonuses.blockChance ?? 0);

  // Expose: halve defender's EVA and DEF at resolution time
  const defStatuses = new Set(defenderActor?.system?.statusEffects ?? []);
  const exposeApplied = defStatuses.has("expose");
  if (exposeApplied) {
    modDefenderEvasion = Math.floor(modDefenderEvasion / 2);
    modDefenderDef = Math.floor(modDefenderDef / 2);
  }

  // Defense subtraction
  let rawDamage = Math.max(0, modDamage - modDefenderDef);

  // Defender healing received bonus (e.g. +3 healing received from equipment)
  const defHealBonus = isHealing ? (defCond.statBonuses.damage ?? 0) : 0;
  if (defHealBonus) rawDamage = Math.max(0, rawDamage + defHealBonus);

  // Elemental multiplier
  let { multiplier: elemMult, tier: elemTier } = computeElementalMultiplier(resolvedElement, defenderActor);

  // Apply elemental multiplier, chant modifier, and damage multiplier to get pre-roll damage
  const elementalDamage = Math.floor(rawDamage * elemMult);
  const chantedDamage = Math.floor(Math.floor(elementalDamage * chantModifier) * damageMultiplier);

  // Hit and crit chances
  const hitChance = Math.max(0, modAccuracy - modDefenderEvasion);
  const critChance = Math.max(0, modCritical - modDefenderCritAvoid);

  return {
    // Computed values
    hitChance,
    critChance,
    baseDamage: modDamage,
    defReduction: modDefenderDef,
    rawDamage,
    attackerConditionals: atkCond,
    defenderConditionals: defCond,
    element: resolvedElement || "",
    elementTier: elemTier,
    elementMultiplier: elemMult,
    blockChance: modDefenderBlockChance ?? 0,
    chantModifier,
    chantedDamage,
    damageMultiplier,
    _damageType: damageType,
    piercingAmount,
    damageBonusTotal: atkCond.statBonuses.damage ?? 0,
    impairApplied,
    exposeApplied,
    // Roll results (populated by executeCombatRolls)
    hitRoll: null,
    hit: null,
    critRoll: null,
    critHit: null,
    blockRoll: null,
    blocked: null,
    finalDamage: null,
    isHealing: false,
    statusResults: []
  };
}

/**
 * Execute the d100 combat rolls and compute final damage.
 * Mutates and returns the CombatResult object.
 * @param {object} result - CombatResult from resolveAttack()
 * @param {object} attackerSystem - Attacker's system data (for status inflictions)
 * @param {Actor|null} defenderActor - Defender actor (for status immunities)
 * @param {string|null} [attackingItemId=null] - Item ID of the skill/weapon being used (filters status inflictions)
 * @returns {Promise<object>} The populated CombatResult
 */
export async function executeCombatRolls(result, attackerSystem, defenderActor, attackingItemId = null) {
  // Hit roll
  const hitRoll = await new Roll("1d100").evaluate();
  result.hitRoll = hitRoll.total;
  result.hit = hitRoll.total <= result.hitChance;
  result._rolls = [hitRoll];

  if (!result.hit) {
    result.finalDamage = 0;
    result.critHit = false;
    result.blocked = false;
    return result;
  }

  // Crit roll
  const critRoll = await new Roll("1d100").evaluate();
  result.critRoll = critRoll.total;
  result.critHit = critRoll.total <= result.critChance;
  result._rolls.push(critRoll);

  // Block roll (only if defender has block chance)
  result.blocked = false;
  if (result.blockChance > 0) {
    const blockRoll = await new Roll("1d100").evaluate();
    result.blockRoll = blockRoll.total;
    result.blocked = blockRoll.total <= result.blockChance;
    result._rolls.push(blockRoll);
  }

  // Compute final damage
  let dmg = result.chantedDamage;
  if (result.critHit) dmg *= 2;
  if (result.blocked) dmg = Math.floor(dmg * 0.5);

  // (Impair and Expose are applied during resolveAttack, not here)

  // Handle absorb (negative multiplier -> healing)
  if (result.elementMultiplier < 0) {
    result.isHealing = true;
    result.finalDamage = Math.abs(dmg);
  } else {
    result.finalDamage = Math.max(0, dmg);
  }

  // Status inflictions (only on hit)
  // Active skill inflictions only apply when that skill is being used.
  // Passive/equipment/weapon inflictions always apply.
  const ruleCache = attackerSystem?._ruleCache ?? {};
  const inflictions = filterBySkillScope(ruleCache.statusInflictions ?? [], attackingItemId);
  result.statusResults = rollStatusInflictions(inflictions, defenderActor);

  return result;
}

// ═══════════════════════════════════════════════════════════════
// APPLY DAMAGE (Chat Button Handler)
// ═══════════════════════════════════════════════════════════════

/**
 * Apply damage or healing to a token from a chat card button click.
 * Also applies any inflicted status effects.
 * @param {Event} event - Click event from the chat button
 * @param {HTMLElement} [buttonEl] - The button element (used with event delegation)
 */
export async function applyDamageFromChat(event, buttonEl) {
  event.preventDefault();
  const btn = buttonEl ?? event.currentTarget;
  const tokenId = btn.dataset.tokenId;
  const damage = Number(btn.dataset.damage) || 0;
  const isHealing = btn.dataset.healing === "true";
  const isBarrier = btn.dataset.barrier === "true";
  const isRetaliatory = btn.dataset.retaliatory === "true";

  // Find the token on the canvas
  const token = canvas.tokens?.get(tokenId);
  if (!token?.actor) {
    ui.notifications.warn("Target token not found on the canvas.");
    return;
  }

  // Permission check
  if (!token.actor.isOwner && !game.user.isGM) {
    ui.notifications.warn("You don't have permission to modify this actor.");
    return;
  }

  const hp = token.actor.system.stats.hp;
  const oldHp = hp.value;
  const oldBarrier = hp.barrier ?? 0;
  let newHp = oldHp;
  let newBarrier = oldBarrier;
  let barrierAbsorbed = 0;

  if (isRetaliatory) {
    // Retaliatory skill: buff was already applied during rollSkillAttack, no HP change needed
  } else if (isBarrier) {
    // Barrier skill: add to target's barrier pool
    newBarrier = oldBarrier + damage;
  } else if (isHealing) {
    newHp = Math.min(hp.max, oldHp + damage);
  } else {
    // Barrier absorbs damage first
    if (oldBarrier > 0) {
      barrierAbsorbed = Math.min(oldBarrier, damage);
      newBarrier = oldBarrier - barrierAbsorbed;
      const remainder = damage - barrierAbsorbed;
      newHp = Math.max(0, oldHp - remainder);
    } else {
      newHp = Math.max(0, oldHp - damage);
    }
  }

  const updateData = {};
  if (newHp !== oldHp) updateData["system.stats.hp.value"] = newHp;
  if (newBarrier !== oldBarrier) updateData["system.stats.hp.barrier"] = newBarrier;
  if (Object.keys(updateData).length) await token.actor.update(updateData);

  // Auto-defeat: mark combatant as defeated when HP reaches 0
  const wasJustDowned = newHp <= 0 && oldHp > 0 && !isHealing && !isBarrier && !isRetaliatory;
  if (newHp <= 0 && game.combat?.started) {
    const combatant = game.combat.combatants.find(c => c.tokenId === tokenId);
    if (combatant && !combatant.isDefeated) {
      await combatant.update({ defeated: true });
    }
  }

  // Pillage passive: auto-loot on enemy down
  if (wasJustDowned && game.combat?.started) {
    const attackerTokenId = btn.dataset.attackerTokenId;
    const attackerToken = attackerTokenId ? canvas.tokens?.get(attackerTokenId) : null;
    if (attackerToken?.actor && actorHasPillage(attackerToken.actor)) {
      await triggerPillage(attackerToken.actor, attackerToken, token.actor, token);
    }
  }

  // Trigger rules: on-defeat effects for the attacker
  if (wasJustDowned && game.combat?.started) {
    const attackerTokenId = btn.dataset.attackerTokenId;
    const attackerToken = attackerTokenId ? canvas.tokens?.get(attackerTokenId) : null;
    if (attackerToken?.actor) {
      await processDefeatTriggers(attackerToken.actor, attackerToken);
    }
  }

  // Apply inflicted status effects
  const statusData = btn.dataset.statuses;
  if (statusData) {
    try {
      const statuses = JSON.parse(statusData);
      if (statuses.length > 0) {
        const current = new Set(token.actor.system.statusEffects ?? []);
        const durations = foundry.utils.deepClone(
          token.actor.getFlag("manashard", "statusDurations") ?? {}
        );
        for (const { status, duration } of statuses) {
          current.add(status);
          durations[status] = duration ?? CONFIG.MANASHARD.statusEffects[status]?.duration ?? 3;
        }
        await token.actor.update({ "system.statusEffects": [...current] });
        await token.actor.setFlag("manashard", "statusDurations", durations);
      }
    } catch (e) {
      console.warn("Manashard | Failed to parse status data", e);
    }
  }

  // ── Retaliatory damage trigger ──
  // When actual damage is dealt to a target with a retaliatory buff, apply true damage to the attacker
  if (!isHealing && !isBarrier && !isRetaliatory && damage > 0) {
    const attackerTokenId = btn.dataset.attackerTokenId;
    const attackerToken = attackerTokenId ? canvas.tokens?.get(attackerTokenId) : null;
    if (attackerToken?.actor) {
      const retEffect = token.actor.effects.find(e =>
        e.getFlag("manashard", "buffDebuff") && e.getFlag("manashard", "retaliatory")
      );
      if (retEffect) {
        const mode = retEffect.getFlag("manashard", "retaliationMode") ?? "flat";
        const storedValue = retEffect.getFlag("manashard", "retaliationValue") ?? 0;
        let retDamage = 0;
        if (mode === "flat") {
          retDamage = storedValue;
        } else if (mode === "percent") {
          retDamage = Math.floor(damage * storedValue / 100);
        } else if (mode === "stat") {
          const statKey = retEffect.getFlag("manashard", "retaliationStat") ?? "mag";
          const resolved = statKey === "auto" ? "mag" : statKey;
          // Use the caster's stat, not the buffed actor's
          const casterId = retEffect.getFlag("manashard", "retaliationCasterId");
          const casterActor = casterId ? game.actors.get(casterId) : null;
          const statSource = casterActor ?? token.actor;
          retDamage = statSource.system.stats?.[resolved]?.value ?? storedValue;
        }
        if (retDamage > 0) {
          // Apply true damage to attacker (bypass defenses)
          const atkHp = attackerToken.actor.system.stats.hp;
          const atkOldHp = atkHp.value;
          const atkNewHp = Math.max(0, atkOldHp - retDamage);
          await attackerToken.actor.update({ "system.stats.hp.value": atkNewHp });

          // Auto-defeat attacker if HP reaches 0
          if (atkNewHp <= 0 && game.combat?.started) {
            const atkCombatant = game.combat.combatants.find(c => c.tokenId === attackerTokenId);
            if (atkCombatant && !atkCombatant.isDefeated) {
              await atkCombatant.update({ defeated: true });
            }
          }

          // Post retaliation chat card
          const retCardContent = await foundry.applications.handlebars.renderTemplate(
            "systems/manashard/templates/chat/retaliation-card.hbs",
            {
              defenderName: token.actor.name,
              defenderImg: token.actor.img ?? "icons/svg/mystery-man.svg",
              attackerName: attackerToken.actor.name,
              attackerImg: attackerToken.actor.img ?? "icons/svg/mystery-man.svg",
              attackerOldHp: atkOldHp,
              attackerNewHp: atkNewHp,
              retDamage,
              effectName: retEffect.name
            }
          );
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: token.actor }),
            content: retCardContent
          });
        }
      }
    }
  }

  // Visual feedback on the button
  btn.disabled = true;
  btn.classList.add("applied");
  let feedbackText;
  if (isRetaliatory) {
    feedbackText = `Retaliatory buff applied (${damage} dmg)`;
  } else if (isBarrier) {
    feedbackText = `+${damage} Barrier (${oldBarrier} → ${newBarrier})`;
  } else if (isHealing) {
    feedbackText = `${oldHp} +${damage} = ${newHp} HP`;
  } else if (barrierAbsorbed > 0 && newHp === oldHp) {
    feedbackText = `${barrierAbsorbed} barrier absorbed, HP unchanged`;
  } else if (barrierAbsorbed > 0) {
    feedbackText = `${barrierAbsorbed} barrier + ${damage - barrierAbsorbed} HP = ${oldHp} → ${newHp} HP`;
  } else {
    feedbackText = `${oldHp} -${damage} = ${newHp} HP`;
  }
  btn.innerHTML = `<i class="fas fa-check"></i> Applied (${feedbackText})`;
}

// ═══════════════════════════════════════════════════════════════
// BUFF / DEBUFF ACTIVE EFFECT APPLICATION
// ═══════════════════════════════════════════════════════════════

/**
 * Apply a buff/debuff ActiveEffect to an actor. If an effect with the same
 * name already exists, refreshes the duration instead of stacking.
 * @param {Actor} actor - Target actor
 * @param {string} name - Effect name (usually the skill name)
 * @param {string} img - Icon path
 * @param {number} duration - Turns remaining
 * @param {object[]} rules - Modifier rule elements
 * @param {string} [description] - Skill description for tooltip display
 * @param {object|null} [retaliationFlags] - Retaliation data for retaliatory buffs
 */
export async function applyBuffEffect(actor, name, img, duration, rules, description = "", retaliationFlags = null) {
  if (!actor) return;

  // Refresh duration if already active
  const existing = actor.effects.find(e =>
    e.getFlag("manashard", "buffDebuff") && e.name === name
  );
  if (existing) {
    await existing.setFlag("manashard", "duration", duration);
    if (retaliationFlags) {
      for (const [key, val] of Object.entries(retaliationFlags)) {
        await existing.setFlag("manashard", key, val);
      }
    }
    return;
  }

  const flagData = {
    buffDebuff: true,
    duration,
    rules: rules ?? [],
    description: description || ""
  };
  if (retaliationFlags) Object.assign(flagData, retaliationFlags);

  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name,
    img: img || "icons/svg/aura.svg",
    disabled: false,
    flags: { manashard: flagData }
  }]);
}

// ═══════════════════════════════════════════════════════════════
// STEAL RESOLUTION
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve a Steal attempt: hit roll, then loot table roll on success.
 * LUK is added to each loot entry's base chance, making rare items (low base %)
 * much more attainable for lucky thieves while barely affecting common items.
 * @param {Actor} attackerActor - The thief
 * @param {Actor|null} defenderActor - The target being stolen from
 * @param {number} accuracy - Thief's computed accuracy (FIN*2 + LUK + skillHit)
 * @param {number} defenderEvasion - Target's evasion
 * @returns {object} Result with hit, hitRoll, hitChance, stolen, itemName, itemIndex, etc.
 */
export function resolveSteal(attackerActor, defenderActor, accuracy, defenderEvasion) {
  const hitChance = Math.max(1, accuracy - defenderEvasion);
  const hitRoll = Math.ceil(Math.random() * 100);
  const hit = hitRoll <= hitChance;

  if (!hit) return { hit: false, hitRoll, hitChance };

  const lootTable = defenderActor?.system?.lootTable ?? [];
  const hasAvailable = lootTable.some(e => !e.stolen && e.itemName);

  if (!hasAvailable) return { hit: true, hitRoll, hitChance, stolen: false, noLoot: true };

  // LUK bonus: added to each loot entry's base chance (capped at 100)
  const luk = attackerActor?.system?.stats?.luk?.value ?? 0;

  // Roll against each entry's chance + LUK, first success wins
  for (let i = 0; i < lootTable.length; i++) {
    const entry = lootTable[i];
    if (entry.stolen || !entry.itemName) continue;
    const effectiveChance = Math.min(100, (entry.chance ?? 0) + luk);
    const lootRoll = Math.ceil(Math.random() * 100);
    if (lootRoll <= effectiveChance) {
      return {
        hit: true, hitRoll, hitChance,
        stolen: true, itemIndex: i,
        itemName: entry.itemName, itemUuid: entry.itemUuid,
        lootRoll, lootChance: effectiveChance, baseChance: entry.chance, lukBonus: luk
      };
    }
  }

  return { hit: true, hitRoll, hitChance, stolen: false, noLoot: false };
}

/**
 * Apply a steal result from a chat card button click.
 * Marks the loot entry as stolen on the defender and creates the item on the thief.
 * @param {Event} event - Click event from the chat button
 * @param {HTMLElement} [buttonEl] - The button element
 */
export async function applyStealFromChat(event, buttonEl) {
  event.preventDefault();
  const btn = buttonEl ?? event.currentTarget;
  const targetTokenId = btn.dataset.targetTokenId;
  const thiefTokenId = btn.dataset.thiefTokenId;
  const itemIndex = Number(btn.dataset.itemIndex);
  const itemUuid = btn.dataset.itemUuid || "";
  const itemName = btn.dataset.itemName || "Stolen Item";

  // Find tokens
  const targetToken = canvas.tokens?.get(targetTokenId);
  const thiefToken = canvas.tokens?.get(thiefTokenId);

  if (!targetToken?.actor) {
    ui.notifications.warn("Target token not found on the canvas.");
    return;
  }
  if (!thiefToken?.actor) {
    ui.notifications.warn("Thief token not found on the canvas.");
    return;
  }

  // Mark loot entry as stolen on the defender
  const lootTable = foundry.utils.deepClone(targetToken.actor.system.lootTable ?? []);
  if (lootTable[itemIndex]) {
    lootTable[itemIndex].stolen = true;
    await targetToken.actor.update({ "system.lootTable": lootTable });
  }

  // Create item on thief's inventory
  if (itemUuid) {
    try {
      const sourceItem = await fromUuid(itemUuid);
      if (sourceItem) {
        await thiefToken.actor.createEmbeddedDocuments("Item", [sourceItem.toObject()]);
      } else {
        // UUID invalid — create a basic consumable placeholder
        await thiefToken.actor.createEmbeddedDocuments("Item", [{
          name: itemName,
          type: "consumable",
          img: "icons/svg/item-bag.svg"
        }]);
      }
    } catch {
      await thiefToken.actor.createEmbeddedDocuments("Item", [{
        name: itemName,
        type: "consumable",
        img: "icons/svg/item-bag.svg"
      }]);
    }
  } else {
    // No UUID — create a basic consumable placeholder
    await thiefToken.actor.createEmbeddedDocuments("Item", [{
      name: itemName,
      type: "consumable",
      img: "icons/svg/item-bag.svg"
    }]);
  }

  // Visual feedback
  btn.disabled = true;
  btn.classList.add("applied");
  btn.innerHTML = `<i class="fas fa-check"></i> ${itemName} transferred!`;
}

// ═══════════════════════════════════════════════════════════════
// PILLAGE (PASSIVE — AUTO-LOOT ON ENEMY DOWN)
// ═══════════════════════════════════════════════════════════════

/**
 * Check if an actor has the Pillage passive equipped.
 * For characters: must be in the skill loadout.
 * For NPCs: any skill manacite with skillType "passive" named "Pillage".
 * @param {Actor} actor - The actor to check
 * @returns {boolean}
 */
export function actorHasPillage(actor) {
  if (!actor) return false;
  const isCharacter = actor.type === "character";
  const items = actor.items ?? [];

  if (isCharacter) {
    const loadout = new Set(actor.system.skillLoadout ?? []);
    for (const item of items) {
      if (item.type !== "manacite") continue;
      const s = item.system;
      if (s.manaciteType === "skill" && s.skillType === "passive"
          && item.name === "Pillage" && loadout.has(item.id)) {
        return true;
      }
    }
  } else {
    for (const item of items) {
      if (item.type !== "manacite") continue;
      const s = item.system;
      if (s.manaciteType === "skill" && s.skillType === "passive" && item.name === "Pillage") {
        return true;
      }
    }
  }
  return false;
}

/**
 * Resolve a Pillage trigger: pick one random unstolen loot entry from the
 * downed enemy. No hit roll — Pillage is automatic.
 * @param {Actor} attackerActor - The actor with Pillage
 * @param {Actor} defenderActor - The downed enemy
 * @returns {object} { pillaged, itemIndex, itemName, itemImg, itemUuid, noLoot }
 */
export function resolvePillage(attackerActor, defenderActor) {
  const lootTable = defenderActor?.system?.lootTable ?? [];
  const available = [];
  for (let i = 0; i < lootTable.length; i++) {
    const entry = lootTable[i];
    if (entry.stolen) continue;
    const item = defenderActor.items.get(entry.itemId);
    if (!item) continue;
    available.push({ index: i, item, entry });
  }

  if (available.length === 0) {
    return { pillaged: false, noLoot: true };
  }

  // Pick one random available entry
  const pick = available[Math.floor(Math.random() * available.length)];
  return {
    pillaged: true,
    noLoot: false,
    itemIndex: pick.index,
    itemName: pick.item.name,
    itemImg: pick.item.img ?? "icons/svg/item-bag.svg",
    itemUuid: pick.item.uuid ?? ""
  };
}

/**
 * Trigger Pillage after an enemy is downed: resolve, post chat card.
 * Called from applyDamageFromChat when HP reaches 0 and attacker has Pillage.
 * @param {Actor} attackerActor - The actor with Pillage
 * @param {Token} attackerToken - Attacker's token
 * @param {Actor} defenderActor - The downed enemy
 * @param {Token} defenderToken - Defender's token
 */
export async function triggerPillage(attackerActor, attackerToken, defenderActor, defenderToken) {
  const result = resolvePillage(attackerActor, defenderActor);

  const templateData = {
    actorImg: attackerActor.img ?? "icons/svg/mystery-man.svg",
    actorName: attackerActor.name,
    targetName: defenderActor.name,
    targetTokenId: defenderToken.id,
    looterTokenId: attackerToken.id,
    ...result
  };

  const chatContent = await foundry.applications.handlebars.renderTemplate(
    "systems/manashard/templates/chat/pillage-result.hbs",
    templateData
  );

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attackerActor }),
    content: chatContent
  });
}

/**
 * Apply a Pillage result from a chat card button click.
 * Marks the loot entry as stolen on the defender and creates the item on the looter.
 * @param {Event} event - Click event from the chat button
 * @param {HTMLElement} [buttonEl] - The button element
 */
export async function applyPillageFromChat(event, buttonEl) {
  event.preventDefault();
  const btn = buttonEl ?? event.currentTarget;
  const targetTokenId = btn.dataset.targetTokenId;
  const looterTokenId = btn.dataset.looterTokenId;
  const itemIndex = Number(btn.dataset.itemIndex);
  const itemUuid = btn.dataset.itemUuid || "";
  const itemName = btn.dataset.itemName || "Pillaged Item";

  const targetToken = canvas.tokens?.get(targetTokenId);
  const looterToken = canvas.tokens?.get(looterTokenId);

  if (!targetToken?.actor) {
    ui.notifications.warn("Target token not found on the canvas.");
    return;
  }
  if (!looterToken?.actor) {
    ui.notifications.warn("Looter token not found on the canvas.");
    return;
  }

  // Mark loot entry as stolen on the defender
  const lootTable = foundry.utils.deepClone(targetToken.actor.system.lootTable ?? []);
  if (lootTable[itemIndex]) {
    lootTable[itemIndex].stolen = true;
    await targetToken.actor.update({ "system.lootTable": lootTable });
  }

  // Create item on looter's inventory
  if (itemUuid) {
    try {
      const sourceItem = await fromUuid(itemUuid);
      if (sourceItem) {
        await looterToken.actor.createEmbeddedDocuments("Item", [sourceItem.toObject()]);
      } else {
        await looterToken.actor.createEmbeddedDocuments("Item", [{
          name: itemName, type: "consumable", img: "icons/svg/item-bag.svg"
        }]);
      }
    } catch {
      await looterToken.actor.createEmbeddedDocuments("Item", [{
        name: itemName, type: "consumable", img: "icons/svg/item-bag.svg"
      }]);
    }
  } else {
    await looterToken.actor.createEmbeddedDocuments("Item", [{
      name: itemName, type: "consumable", img: "icons/svg/item-bag.svg"
    }]);
  }

  // Visual feedback
  btn.disabled = true;
  btn.classList.add("applied");
  btn.innerHTML = `<i class="fas fa-check"></i> ${itemName} transferred!`;
}

// ═══════════════════════════════════════════════════════════════
// TRIGGER RULES (EVENT-DRIVEN EFFECTS)
// ═══════════════════════════════════════════════════════════════

/**
 * Process on-defeat Trigger rules for the attacker.
 * Checks _ruleCache.triggers for event: "onDefeat" and executes the actions.
 * @param {Actor} actor - The actor who defeated an enemy
 * @param {Token} token - The actor's token
 */
async function processDefeatTriggers(actor, token) {
  if (!actor) return;
  const triggers = actor.system?._ruleCache?.triggers ?? [];
  const defeatTriggers = triggers.filter(t => t.event === "onDefeat");
  if (!defeatTriggers.length) return;

  for (const trigger of defeatTriggers) {
    const value = trigger.value ?? 0;
    if (value <= 0) continue;
    const skillName = trigger._source?.itemName ?? "Trigger";
    const skillImg = trigger._source?.itemImg ?? null;

    if (trigger.action === "restoreHP") {
      const hp = actor.system.stats?.hp;
      if (!hp || hp.value >= hp.max) continue;
      const newHp = Math.min(hp.max, hp.value + value);
      const restored = newHp - hp.value;
      await actor.update({ "system.stats.hp.value": newHp });

      const content = await foundry.applications.handlebars.renderTemplate(
        "systems/manashard/templates/chat/trigger-card.hbs",
        {
          actorImg: actor.img ?? "icons/svg/mystery-man.svg",
          actorName: actor.name,
          skillName,
          skillImg,
          resultText: `Restored <strong>${restored} HP</strong> on enemy defeat.`
        }
      );
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
    } else if (trigger.action === "restoreMP") {
      const mp = actor.system.stats?.mp;
      if (!mp || mp.value >= mp.max) continue;
      const newMp = Math.min(mp.max, mp.value + value);
      const restored = newMp - mp.value;
      await actor.update({ "system.stats.mp.value": newMp });

      const content = await foundry.applications.handlebars.renderTemplate(
        "systems/manashard/templates/chat/trigger-card.hbs",
        {
          actorImg: actor.img ?? "icons/svg/mystery-man.svg",
          actorName: actor.name,
          skillName,
          skillImg,
          resultText: `Restored <strong>${restored} MP</strong> on enemy defeat.`
        }
      );
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// STATUS CHECKS
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a defender is prevented from counterattacking due to Stun status.
 * @param {Actor} actor - The defending actor
 * @returns {boolean} True if the actor cannot counterattack
 */
export function isCounterDisabled(actor) {
  const statuses = new Set(actor?.system?.statusEffects ?? []);
  return statuses.has("stun");
}

/**
 * Check if an actor is Silenced (cannot use Magic Skills).
 * @param {Actor} actor - The actor to check
 * @returns {boolean} True if the actor is silenced
 */
export function isSilenced(actor) {
  const statuses = new Set(actor?.system?.statusEffects ?? []);
  return statuses.has("silence");
}

/**
 * Get the MP cost multiplier from status effects.
 * No status currently modifies MP cost (Hex was removed).
 * @param {Actor} actor - The actor casting the skill
 * @returns {number} Multiplier (always 1.0)
 */
export function getMPCostMultiplier(actor) {
  return 1.0;
}

// ═══════════════════════════════════════════════════════════════
// ELEMENTAL TIER LABELS
// ═══════════════════════════════════════════════════════════════

/**
 * Get a human-readable label for an elemental tier.
 * @param {string} tier - "weak", "neutral", "resist", "immune", "absorb"
 * @returns {string}
 */
export function getElementalTierLabel(tier) {
  switch (tier) {
    case "weak": return "Super Effective!";
    case "resist": return "Not Very Effective...";
    case "immune": return "No Effect!";
    case "absorb": return "Absorbed!";
    default: return "";
  }
}

// ═══════════════════════════════════════════════════════════════
// CONSUMABLE APPLICATION
// ═══════════════════════════════════════════════════════════════

/**
 * Apply a consumable's HP/MP restoration from a chat card Apply button.
 * Reads restoreType and restoreAmount from the button data attributes,
 * applies healing, decrements quantity, and updates the button state.
 * @param {Event} event - Click event
 * @param {HTMLElement} btn - The apply button element
 */
export async function applyConsumableFromChat(event, btn) {
  event.preventDefault();

  const targetTokenId = btn.dataset.targetTokenId;
  const userActorId = btn.dataset.userActorId;
  const itemId = btn.dataset.itemId;
  const consumed = btn.dataset.consumed === "true";
  const restoreType = btn.dataset.restoreType ?? "hp";
  const restoreAmount = Number(btn.dataset.restoreAmount) || 0;

  // Resolve target — fall back to user's own token for self-targeted items
  let targetToken = targetTokenId ? canvas.tokens?.get(targetTokenId) : null;
  const userActor = game.actors.get(userActorId);
  if (!targetToken && userActor) {
    targetToken = canvas.tokens?.placeables.find(t => t.actor?.id === userActor.id);
  }
  if (!targetToken?.actor) {
    ui.notifications.warn("Target token not found on the canvas.");
    return;
  }

  // Permission check
  if (!userActor?.isOwner && !game.user.isGM) {
    ui.notifications.warn("You don't have permission to use this item.");
    return;
  }

  const targetActor = targetToken.actor;
  let summary = "Applied";

  // Apply HP or MP restoration
  if (restoreAmount > 0) {
    if (restoreType === "hp") {
      const hp = targetActor.system.stats.hp;
      const oldVal = hp.value;
      const newVal = Math.min(hp.max, oldVal + restoreAmount);
      await targetActor.update({ "system.stats.hp.value": newVal });
      summary = `HP: ${oldVal} → ${newVal}`;
    } else if (restoreType === "mp") {
      const mp = targetActor.system.stats.mp;
      const oldVal = mp.value;
      const newVal = Math.min(mp.max, oldVal + restoreAmount);
      await targetActor.update({ "system.stats.mp.value": newVal });
      summary = `MP: ${oldVal} → ${newVal}`;
    }
  }

  // Decrement quantity if consumed
  if (consumed && userActor) {
    const item = userActor.items.get(itemId);
    if (item) {
      const newQty = Math.max(0, item.system.quantity - 1);
      if (newQty <= 0) {
        await item.delete();
      } else {
        await item.update({ "system.quantity": newQty });
      }
    }
  }

  // Update button to "Applied" state
  btn.disabled = true;
  btn.classList.add("applied");
  btn.innerHTML = `<i class="fas fa-check"></i> ${summary}`;
}

// ═══════════════════════════════════════════════════════════════
// EXP CALCULATION
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate combat EXP earned by a PC for engaging an enemy.
 * Uses a level-differential table scaled by enemy role.
 * @param {number} pcLevel - The player character's level
 * @param {number} enemyLevel - The enemy's level
 * @param {string} enemyRole - Enemy role key ("minion", "standard", "elite", "boss", "legendary")
 * @param {boolean} isKill - True for kill EXP, false for participation (combat) EXP
 * @returns {number} EXP earned (rounded)
 */
export function calculateCombatEXP(pcLevel, enemyLevel, enemyRole, isKill) {
  const diff = Math.max(-6, Math.min(6, pcLevel - enemyLevel));
  const entry = CONFIG.MANASHARD.expTable?.[String(diff)] ?? { kill: 5, combat: 1 };
  const base = isKill ? entry.kill : entry.combat;
  const multiplier = CONFIG.MANASHARD.expRoleMultipliers?.[enemyRole] ?? 1.0;
  return Math.round(base * multiplier);
}

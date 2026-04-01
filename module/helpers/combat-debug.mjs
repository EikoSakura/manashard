/**
 * Combat Debug Data Collection
 * Collects detailed breakdown data from attacker/defender actors and combat resolution
 * for the Combat Inspector dialog.
 */

/**
 * Convert ModifierTracker entries into a flat array of { source, value, icon } objects.
 * @param {ModifierTracker} tracker
 * @param {string} selector - The stat key to get entries for
 * @returns {Array<{source: string, value: number, icon: string}>}
 */
function trackerEntries(tracker, selector) {
  if (!tracker?.getEntries) return [];
  const entries = tracker.getEntries(selector);
  return entries.map(e => ({
    source: e.source?.itemName ?? "Unknown",
    value: e.value,
    icon: _iconForType(e.source?.itemType)
  }));
}

function _iconForType(type) {
  switch (type) {
    case "weapon": return "fas fa-sword";
    case "armor": return "fas fa-shield-halved";
    case "accessory": return "fas fa-ring";
    case "manacite": return "fas fa-gem";
    case "species": return "fas fa-dna";
    case "activeEffect": return "fas fa-magic";
    case "status": return "fas fa-skull-crossbones";
    case "category": return "fas fa-tag";
    case "keyword": return "fas fa-key";
    default: return "fas fa-circle";
  }
}

/**
 * Build debug data for a single-target skill attack.
 * @param {object} params
 * @param {Actor} params.attacker - Attacker actor
 * @param {Actor|null} params.defender - Defender actor
 * @param {object} params.result - The CombatResult from resolveAttack + executeCombatRolls
 * @param {object} params.skill - Skill system data
 * @param {Array} params.formulaSteps - The formula breakdown steps
 * @param {number} params.accuracy - Pre-resolve accuracy value
 * @param {string} params.damageType - "physical" or "magical"
 * @param {number} params.chantAccuracyBonus - Chant accuracy bonus
 * @param {string} params.chantLabel - Chant mode label
 * @param {number} params.chantModifier - Chant damage modifier
 * @param {string} params.scalingLabel - Label for the scaling stat
 * @param {number} params.scalingStat - Value of the scaling stat
 * @returns {object} Debug data for the inspector
 */
export function buildCombatDebugData({
  attacker, defender, result, skill, formulaSteps,
  accuracy, damageType, chantAccuracyBonus, chantLabel,
  chantModifier, scalingLabel, scalingStat
}) {
  const atkSys = attacker.system;
  const defSys = defender?.system;
  const atkTracker = atkSys._modifiers;
  const defTracker = defSys?._modifiers;
  const atkBase = atkSys._baseDerived ?? {};
  const defBase = defSys?._baseDerived ?? {};

  const isMagical = damageType === "magical";
  const stats = atkSys.stats ?? {};

  // Attacker accuracy breakdown
  const isFixedAcc = skill.baseRateMode === "fixed" && (skill.skillHit ?? 0) > 0;
  let accuracyFormula;
  if (isFixedAcc) {
    const ssKey = skill.scalingStat ?? "auto";
    const accStatLabel = ssKey === "auto"
      ? (isMagical ? "MAG" : "STR")
      : ssKey.toUpperCase();
    accuracyFormula = `${accStatLabel}×2 + Skill Hit (${skill.skillHit})`;
  } else {
    accuracyFormula = `70 + AGI(${stats.agi?.value ?? 0})×2 + LUK(${stats.luk?.value ?? 0})`;
  }

  // Attacker crit breakdown
  const critFormula = `AGI(${stats.agi?.value ?? 0})/2 + LUK(${stats.luk?.value ?? 0})/2 + Weapon Crit`;

  // Defender formulas
  let evasionFormula = null;
  let defFormula = null;
  if (defSys) {
    const defStats = defSys.stats ?? {};
    if (isMagical) {
      evasionFormula = `10 + SPI(${defStats.spi?.value ?? 0})×3`;
      defFormula = `Armor MDEF + SPI(${defStats.spi?.value ?? 0})`;
    } else {
      evasionFormula = `10 + AGI(${defStats.agi?.value ?? 0})×3`;
      defFormula = `Armor PDEF + END(${defStats.end?.value ?? 0})`;
    }
  }

  const evaStat = isMagical ? "meva" : "peva";
  const defStat = isMagical ? "mdef" : "pdef";

  // Granted element info
  const grantedElements = atkSys._ruleCache?.grantedElements ?? [];
  const grantedElement = grantedElements.length
    ? grantedElements.map(g => `${g._source?.itemName ?? "?"}: ${g.element}`).join(", ")
    : null;

  // Defender elemental affinities
  const defAffinities = defSys?._ruleCache?.elementalAffinities ?? [];
  const elementalAffinities = defAffinities.map(a => ({
    element: a.element,
    tier: a.tier,
    source: a._source?.itemName ?? "Base"
  }));

  // Status effects
  const atkStatuses = [...(atkSys.statusEffects ?? [])];
  const defStatuses = defSys ? [...(defSys.statusEffects ?? [])] : [];

  // Conditional bonuses from resolution result
  const atkCond = result.attackerConditionals?.statBonuses ?? {};
  const defCond = result.defenderConditionals?.statBonuses ?? {};
  const atkCondEntries = result.attackerConditionals?.statBonusEntries ?? [];
  const defCondEntries = result.defenderConditionals?.statBonusEntries ?? [];

  // Helper: filter conditional entries by selector
  const condEntriesFor = (entries, selector) => entries
    .filter(e => e.selector === selector)
    .map(e => ({ source: e.source, value: e.value, icon: e.icon, condition: e.condition }));

  return {
    attacker: {
      name: attacker.name,
      img: attacker.img,
      // Accuracy
      accuracyFormula,
      baseAccuracy: atkBase.accuracy ?? accuracy,
      accuracyModifiers: trackerEntries(atkTracker, "accuracy"),
      chantAccuracyBonus: chantAccuracyBonus || 0,
      chantLabel,
      accuracyConditionals: condEntriesFor(atkCondEntries, "accuracy"),
      impairApplied: result.impairApplied ?? false,
      finalAccuracy: accuracy + (atkCond.accuracy ?? 0) + (chantAccuracyBonus || 0),
      // Damage
      formulaSteps: formulaSteps ?? [],
      damageModifiers: trackerEntries(atkTracker, "damage"),
      damageConditionals: condEntriesFor(atkCondEntries, "damage"),
      // Critical
      critFormula,
      baseCritical: atkBase.critical ?? (atkSys.critical ?? 0),
      critModifiers: trackerEntries(atkTracker, "critical"),
      critConditionals: condEntriesFor(atkCondEntries, "critical"),
      finalCritical: (atkSys.critical ?? 0) + (atkCond.critical ?? 0),
      // Element
      grantedElement,
      // Status
      statuses: atkStatuses
    },
    defender: defender ? {
      name: defender.name,
      img: defender.img,
      // Evasion
      evasionFormula,
      baseEvasion: defBase[evaStat] ?? 0,
      evasionModifiers: trackerEntries(defTracker, evaStat),
      evasionConditionals: condEntriesFor(defCondEntries, isMagical ? "meva" : "peva"),
      finalEvasion: defSys?.[evaStat] ?? 0,
      // Defense
      defFormula,
      baseDef: defBase[defStat] ?? 0,
      defModifiers: trackerEntries(defTracker, defStat),
      defConditionals: condEntriesFor(defCondEntries, "def"),
      // Critical Avoidance
      critAvoid: defSys?.critEvo ?? 0,
      // Block
      baseBlockChance: defBase.blockChance ?? 0,
      blockModifiers: trackerEntries(defTracker, "blockChance"),
      // Elemental
      elementalAffinities,
      // Status
      statuses: defStatuses
    } : null,
    resolution: {
      damageType,
      element: result.element ?? "",
      hitChance: result.hitChance,
      hitRoll: result.hitRoll,
      hit: result.hit,
      critChance: result.critChance,
      critRoll: result.critRoll,
      critHit: result.critHit,
      blockChance: result.blockChance,
      blockRoll: result.blockRoll,
      blocked: result.blocked,
      baseDamage: result.baseDamage,
      defReduction: result.defReduction,
      rawDamage: result.rawDamage,
      elementMultiplier: result.elementMultiplier,
      elementTier: result.elementTier,
      elementTierLabel: result.elementTierLabel ?? result.elementTier,
      chantModifier: chantModifier !== 1.0 ? chantModifier : null,
      chantLabel,
      damageMultiplier: result.damageMultiplier !== 1.0 ? result.damageMultiplier : null,
      piercingAmount: result.piercingAmount ?? 0,
      percentPiercing: result._percentPiercing ?? 0,
      impairApplied: result.impairApplied ?? false,
      exposeApplied: result.exposeApplied ?? false,
      brutalCrit: result._brutalCrit ?? false,
      finalDamage: result.finalDamage
    }
  };
}

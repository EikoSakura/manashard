/**
 * Shared combat forecast context builder for the Manashard system.
 * Computes all data needed to render the combat-forecast.hbs template,
 * integrating every modifier source: conditional rules, granted elements,
 * support links, status inflictions, and combat notes.
 */

import {
  evaluateConditionalRules,
  evaluateCombatNotes,
  computeElementalMultiplier,
  getElementalTierLabel,
  checkStatusImmunity,
  gridDistance,
  validateAttackRange
} from "./combat.mjs";

// ═══════════════════════════════════════════════════════════════
// MAIN FORECAST BUILDER
// ═══════════════════════════════════════════════════════════════

/**
 * Build the full context object for the combat forecast template.
 * @param {Actor} actor - The attacking actor
 * @param {Token|null} targetToken - The targeted token (may be null)
 * @param {object} [options={}]
 * @param {"weapon"|"natural"|"skill"|"heal"} options.mode - Forecast mode
 * @param {object} [options.skillData] - Skill system data (for skill/heal modes)
 * @param {string} [options.skillName] - Display name of the skill
 * @param {Item} [options.weaponItem] - Specific weapon item (for natural attacks)
 * @param {number} [options.mpCost] - MP cost (skills only)
 * @param {string} [options.chantMode] - Initial chant mode key
 * @param {string} [options.itemId] - Item ID for chant mode memory
 * @param {object} [options.castingMods] - Available casting modifiers from _ruleCache
 * @param {Function} [options.findCastingMod] - Function to find casting mod for a chant
 * @returns {object} Template context object
 */
export function buildForecastContext(actor, targetToken, options = {}) {
  const {
    mode = "weapon",
    skillData = null,
    skillName = null,
    weaponItem = null,
    mpCost = 0,
    chantMode: initChantKey = "normal",
    itemId = null,
    castingMods = [],
    findCastingMod = null
  } = options;

  const system = actor.system;
  const defActor = targetToken?.actor ?? null;
  const hasTarget = !!defActor;

  // ── Mode Flags ──
  const isSkill = mode === "skill" || mode === "heal";
  const isNatural = mode === "natural";
  const isHealSkill = mode === "heal" || (skillData?.isHealing ?? false);
  const isBarrierSkill = skillData?.isBarrier ?? skillData?.damageType === "barrier";
  const isRetaliatory = skillData?.isRetaliatory ?? skillData?.damageType === "retaliatory";
  const isSpell = skillData?.skillType === "magic";

  // Check if target is undead (healing becomes damage against undead)
  const defSys = defActor?.system;
  const targetIsUndead = defSys?.creatureType?.includes?.("undead") ?? false;
  const healMode = isHealSkill && !targetIsUndead;

  // ── Resolve Element ──
  const wpn = weaponItem ?? actor.items.find(i => i.type === "weapon" && i.system.equipped && i.system.equipSlot !== "offhand");
  let rawElement = "";
  if (isSkill && skillData) {
    rawElement = skillData.element || "";
  } else if (wpn) {
    rawElement = wpn.system?.element || "";
  }

  // Check for GrantElement rules if no native element
  const ruleCache = system._ruleCache ?? {};
  if ((!rawElement || rawElement === "null") && ruleCache.grantedElements?.length) {
    rawElement = ruleCache.grantedElements[0].element;
  }

  const damageType = isSkill
    ? (skillData?.damageType || "none")
    : (isNatural ? (weaponItem?.system?.damageType ?? "physical") : (wpn?.system?.damageType ?? "physical"));
  const isMagical = damageType === "magical";

  // ── Range Check ──
  let outOfRange = false;
  let rangeWarning = "";
  let attackDistance = Infinity;
  // Determine range params: weapon-mode skills use weapon range, fixed-mode skills use skill range
  const isSkillWeaponMode = isSkill && skillData?.baseRateMode === "weapon";
  const isSkillWeaponRange = isSkill && skillData?.rangeType === "weapon";
  let rngType, minRng, maxRng;
  const actorReach = actor.system.reach ?? 1;
  if (!isSkill || isSkillWeaponMode || isSkillWeaponRange) {
    rngType = wpn?.system?.rangeType ?? "melee";
    minRng = wpn?.system?.minRange ?? 1;
    maxRng = rngType === "melee" ? actorReach : (wpn?.system?.maxRange ?? 1);
  } else if (skillData?.rangeType === "melee") {
    rngType = "melee";
    minRng = 1;
    maxRng = actorReach;
  } else if (isSkill && (skillData?.rangeType === "none" || skillData?.rangeType === "self")) {
    rngType = skillData.rangeType;
    minRng = 0;
    maxRng = 0;
  } else {
    rngType = skillData?.rangeType ?? "ranged";
    minRng = skillData?.minRange ?? 1;
    maxRng = skillData?.maxRange ?? 1;
  }
  const skipForecastRange = isSkill && (skillData?.rangeType === "none" || skillData?.rangeType === "self");
  // Throw range: melee weapons can also attack at range if throwRange > 0
  const throwRange = actor.system.throwRange ?? 0;
  const canThrow = rngType === "melee" && throwRange > 0 && !isSkill;

  const attackerToken = actor.token?.object ?? canvas.tokens?.placeables.find(t => t.actor?.id === actor.id);
  if (targetToken && !healMode && !skipForecastRange) {
    if (attackerToken && targetToken) {
      attackDistance = gridDistance(attackerToken, targetToken);
      const rangeCheck = validateAttackRange({ distance: attackDistance, minRange: minRng, maxRange: maxRng, rangeType: rngType });
      if (!rangeCheck.valid && canThrow) {
        // Melee missed — check if within throw range instead
        const throwCheck = validateAttackRange({ distance: attackDistance, minRange: 2, maxRange: throwRange, rangeType: "thrown" });
        if (throwCheck.valid) {
          rangeCheck.valid = true;
        }
      }
      if (!rangeCheck.valid) {
        outOfRange = true;
        rangeWarning = rangeCheck.reason;
      }
    }
  }

  // ── Attacker Base Stats ──
  const isInitiator = game.combat?.combatant?.actorId === actor.id;
  const condCtx = {
    system,
    defenderActor: defActor,
    element: rawElement,
    damageType,
    isInitiator,
    isHealing: isHealSkill,
    weaponMinRange: minRng,
    weaponMaxRange: maxRng,
    weaponRangeType: rngType,
    attackDistance,
    weaponItemId: isSkill ? itemId : (wpn?.id ?? null),
    weaponCategory: wpn?.system?.category ?? null,
    attackerActorId: actor.id,
    attackerTokenId: attackerToken?.id ?? null,
    targetTokenId: targetToken?.id ?? null
  };
  const atkConditionals = ruleCache.conditionalRules ?? [];
  const condBonuses = evaluateConditionalRules(atkConditionals, condCtx).statBonuses;

  let baseDmg;
  let acc;
  let crit;

  if (isSkill && skillData) {
    // Skill damage: baseRate (+ weapon might if weapon mode) + scaling stat
    let effectiveBaseRate = skillData.baseRate ?? 0;
    if (skillData.baseRateMode === "weapon") {
      effectiveBaseRate += wpn?.system?.might ?? 0;
    }
    const ssKey = skillData.scalingStat ?? "auto";
    let scalingStatVal = 0;
    const retMode = skillData.retaliationMode ?? "flat";
    const skipScaling = isRetaliatory && retMode === "flat";
    if (skipScaling) {
      scalingStatVal = 0;
    } else if (ssKey === "auto") {
      scalingStatVal = (isMagical || isBarrierSkill || isHealSkill || isRetaliatory)
        ? (system.stats?.mag?.value ?? 0)
        : (system.stats?.str?.value ?? 0);
    } else if (ssKey !== "none") {
      scalingStatVal = system.stats?.[ssKey]?.value ?? 0;
    }
    baseDmg = scalingStatVal + effectiveBaseRate + (condBonuses.damage ?? 0);
    // Accuracy: fixed-mode skills with skillHit use 80 base + scaling stat instead of AGI
    const skillHitVal = skillData.skillHit ?? 0;
    if (skillData.baseRateMode === "fixed" && skillHitVal > 0) {
      const accStat = ssKey === "none" ? 0 : scalingStatVal;
      acc = 80 + (accStat * 2) + skillHitVal + (condBonuses.accuracy ?? 0);
    } else {
      acc = (system.accuracy ?? 0) + (condBonuses.accuracy ?? 0);
    }
    crit = (system.critical ?? 0) + (condBonuses.critical ?? 0);
  } else if (isNatural && weaponItem) {
    // Natural weapon: custom formula
    const stats = system.stats;
    const natCat = weaponItem.system?.category;
    const natMagCat = natCat === "staves" || natCat === "grimoires";
    const scalingStat = (isMagical || natMagCat) ? (stats?.mag?.value ?? 0) : (stats?.str?.value ?? 0);
    baseDmg = scalingStat + (weaponItem.system?.might ?? 0) + (condBonuses.damage ?? 0);
    acc = 80 + (stats?.agi?.value ?? 0) * 2 + (condBonuses.accuracy ?? 0);
    crit = (stats?.luk?.value ?? 0) * 2 + (weaponItem.system?.crit ?? 0) + (condBonuses.critical ?? 0);
  } else if (weaponItem) {
    // Explicit weapon (e.g. off-hand) — compute from weapon stats directly
    const stats = system.stats;
    // Scaling stat: Staves/Grimoires/magical → MAG, Swords → max(STR,AGI), else → STR
    const wpnCat = weaponItem.system?.category;
    const wpnMagCat = wpnCat === "staves" || wpnCat === "grimoires";
    const physStat = (!isMagical && wpnCat === "swords")
      ? Math.max(stats?.str?.value ?? 0, stats?.agi?.value ?? 0)
      : (stats?.str?.value ?? 0);
    const scalingStat = (isMagical || wpnMagCat) ? (stats?.mag?.value ?? 0) : physStat;
    baseDmg = scalingStat + (weaponItem.system?.might ?? 0) + (condBonuses.damage ?? 0);
    acc = 80 + (stats?.agi?.value ?? 0) * 2 + (condBonuses.accuracy ?? 0);
    crit = (stats?.luk?.value ?? 0) * 2 + (weaponItem.system?.crit ?? 0) + (condBonuses.critical ?? 0);
  } else {
    // Standard weapon attack — uses derived stats (mainhand)
    baseDmg = (system.damage ?? 0) + (condBonuses.damage ?? 0);
    acc = (system.accuracy ?? 0) + (condBonuses.accuracy ?? 0);
    crit = (system.critical ?? 0) + (condBonuses.critical ?? 0);
  }

  // ── Defender Stats ──
  const defRuleCache = defActor?.system?._ruleCache ?? {};
  const defIsInitiator = !!defActor && (game.combat?.combatant?.actorId === defActor.id);
  const defCondCtx = {
    system: defActor?.system,
    defenderActor: null,
    element: rawElement,
    damageType,
    isInitiator: defIsInitiator,
    isHealing: isHealSkill
  };
  const defCondBonuses = evaluateConditionalRules(defRuleCache.conditionalRules, defCondCtx).statBonuses;

  const piercingAmount = condBonuses.piercing ?? 0;
  const atkGrants = ruleCache.grants ?? {};

  const baseDefEva = isMagical ? (defActor?.system?.meva ?? 0) : (defActor?.system?.peva ?? 0);
  const defEvaBonus = isMagical ? (defCondBonuses.meva ?? 0) : (defCondBonuses.peva ?? 0);
  const isNoneDamage = skillData?.damageType === "none";
  const skipDefenses = healMode || isRetaliatory;
  const defEva = skipDefenses ? 0 : baseDefEva + defEvaBonus;
  let defDefRaw = (skipDefenses || isNoneDamage) ? 0 : Math.max(0, (isMagical ? (defActor?.system?.mdef ?? 0) : (defActor?.system?.pdef ?? 0)) + (defCondBonuses.def ?? 0) - piercingAmount);
  // Firearms (Penetrating): ignore percentage of DEF
  if (atkGrants.percentPiercing) {
    const pct = atkGrants.percentPiercing.percentPiercing ?? 0;
    defDefRaw = Math.floor(defDefRaw * (1 - pct / 100));
  }
  const defDef = defDefRaw;
  const defCritAvoid = skipDefenses ? 0 : (defActor?.system?.critEvo ?? 0) + (defCondBonuses.critEvo ?? 0);
  const defBlockChance = (skipDefenses || isNoneDamage) ? 0 : (defActor?.system?.blockChance ?? 0) + (defCondBonuses.blockChance ?? 0);
  const defHealBonus = healMode ? (defCondBonuses.damage ?? 0) : 0;

  const defHp = defActor?.system?.stats?.hp?.value ?? "??";
  const defMaxHp = defActor?.system?.stats?.hp?.max ?? defHp;
  const defHpPct = (typeof defHp === "number" && defMaxHp > 0) ? Math.round((defHp / defMaxHp) * 100) : 100;

  const hp = system.stats?.hp?.value ?? 0;
  const maxHp = system.stats?.hp?.max ?? hp;
  const hpPct = maxHp > 0 ? Math.round((hp / maxHp) * 100) : 100;

  // ── Chant Mode ──
  const chantData = CONFIG.MANASHARD.chantModes[initChantKey] ?? CONFIG.MANASHARD.chantModes.normal;
  const effectMod = chantData.effectModifier;
  const supportDmgMultiplier = 1;

  // ── Forecast Calculation ──
  let forecastDmg;
  if (isNoneDamage) {
    forecastDmg = 0;
  } else if (healMode) {
    forecastDmg = Math.floor(Math.max(0, baseDmg + defHealBonus) * effectMod);
  } else {
    forecastDmg = Math.floor(Math.max(0, baseDmg - defDef) * effectMod);
  }

  // Elemental multiplier preview
  let elementBadge = null;
  if (rawElement && hasTarget && !healMode) {
    const { tier } = computeElementalMultiplier(rawElement, defActor);
    const tierLabel = getElementalTierLabel(tier);
    if (tierLabel) {
      const badgeClass = tier === "weak" ? "effective" : tier === "resist" ? "resisted" : tier === "immune" ? "nullified" : tier === "absorb" ? "absorbed" : "";
      elementBadge = { cssClass: badgeClass, html: tierLabel };
      // Apply elemental multiplier to forecast damage
      const { multiplier } = computeElementalMultiplier(rawElement, defActor);
      forecastDmg = Math.floor(forecastDmg * multiplier);
    }
  }
  // Undead warning badge
  if (isHealSkill && targetIsUndead) {
    elementBadge = { cssClass: "cf-undead-warn", html: '<i class="fas fa-skull"></i> Undead — Heals deal damage!' };
  }

  // Projected HP
  let projectedDefHp;
  let projectedDefHpPct;
  if (typeof defHp === "number") {
    if (healMode) {
      projectedDefHp = Math.min(defMaxHp, defHp + forecastDmg);
    } else {
      projectedDefHp = Math.max(0, defHp - forecastDmg);
    }
    projectedDefHpPct = defMaxHp > 0 ? Math.round((projectedDefHp / defMaxHp) * 100) : 100;
  } else {
    projectedDefHpPct = defHpPct;
  }

  // ── Status Infliction Preview ──
  const attackingItemId = isSkill ? itemId : (weaponItem?.id ?? null);
  const statusInflictions = _buildStatusInflictionPreview(ruleCache, defActor, attackingItemId, system);

  // ── Combat Notes ──
  const rawCombatNotes = evaluateCombatNotes(ruleCache.combatNotes ?? [], condCtx);
  // Resolve inline [[...]] roll expressions for dialog display (chat messages do this automatically)
  const combatNotes = rawCombatNotes.map(note => {
    let text = note.text;
    const sourceItem = note.source?.itemId ? actor.items.get(note.source.itemId) : null;
    const rollData = sourceItem?.getRollData?.() ?? actor.getRollData?.() ?? {};
    text = text.replace(/\[\[([^\]]+)\]\]/g, (_, expr) => {
      try {
        const roll = new Roll(expr, rollData);
        roll.evaluateSync();
        return roll.total;
      } catch { return `[[${expr}]]`; }
    });
    return { ...note, text };
  });

  let atkProjectedHpPct = hpPct;

  // ── Off-Hand Strike Indicator ──
  const offhandWeapon = actor.items.find(i => i.type === "weapon" && i.system.equipSlot === "offhand");
  const showOffhand = (mode === "weapon") && !!offhandWeapon;
  const offhandName = offhandWeapon?.name ?? null;
  let offhandForecast = null;
  if (showOffhand) {
    const ohSys = offhandWeapon.system;
    const ohIsMagical = (ohSys.damageType ?? "physical") === "magical";
    const ohScaling = ohIsMagical ? (system.stats?.mag?.value ?? 0) : (system.stats?.str?.value ?? 0);
    const ohDmg = (ohScaling * 2) + (ohSys.might ?? 0) + (condBonuses.damage ?? 0);
    const ohAcc = 80 + (system.stats?.agi?.value ?? 0) * 2 + (condBonuses.accuracy ?? 0);
    const ohCrit = (system.stats?.luk?.value ?? 0) * 2 + (ohSys.crit ?? 0) + (condBonuses.critical ?? 0);
    const ohDefBase = ohIsMagical ? (defActor?.system?.mdef ?? 0) : (defActor?.system?.pdef ?? 0);
    const ohDefVal = Math.max(0, ohDefBase + (defCondBonuses.def ?? 0));
    const ohRawDmg = Math.max(0, ohDmg - ohDefVal);
    offhandForecast = {
      hit: Math.max(0, ohAcc - defEva),
      crit: Math.max(0, ohCrit - defCritAvoid),
      damage: Math.floor(ohRawDmg * 0.5)
    };
  }

  // ── Chant MP Multiplier ──
  const chantMpMult = chantData.mpMultiplier ?? 1.0;
  const chantMpCost = Math.ceil(mpCost * chantMpMult);

  // ── MP Check ──
  const currentMp = system.stats?.mp?.value ?? 0;
  const outOfMp = isSkill && chantMpCost > 0 && currentMp < chantMpCost;
  const mpWarning = outOfMp ? `Need ${chantMpCost} MP, have ${currentMp}.` : "";

  // ── Casting Modifier ──
  let castingModData = null;
  if (isSpell && findCastingMod) {
    const found = findCastingMod(initChantKey);
    if (found) {
      castingModData = {
        label: game.i18n.localize(found.def.label),
        mpMultiplier: found.def.mpMultiplier
      };
    }
  }

  // ── Weapon Name ──
  let weaponName;
  if (isSkill) {
    weaponName = skillName ?? "Skill";
  } else if (isNatural) {
    weaponName = weaponItem?.name ?? "Natural Weapon";
  } else {
    weaponName = wpn?.name ?? "Unarmed";
  }

  return {
    // Mode flags
    healMode,
    barrierMode: isBarrierSkill,
    retaliationMode: isRetaliatory,
    buffDuration: skillData?.buffDuration ?? 0,
    isSpell,
    isNatural,
    showMpCost: isSkill && mpCost > 0,
    showChantSelector: isSpell,
    showCastingMod: isSpell && castingMods.length > 0,
    hasTarget,
    chantMode: initChantKey,

    // Attacker
    attacker: {
      img: actor.img,
      portraitOffsetX: actor.system.portraitOffsetX ?? 50,
      portraitOffsetY: actor.system.portraitOffsetY ?? 0,
      portraitMirrored: actor.system.portraitMirrored ?? false,
      name: actor.name,
      weaponName,
      element: rawElement,
      elementPip: !!rawElement,
      hp,
      maxHp,
      hpPct,
      atkProjectedHpPct,
      damage: baseDmg,
      accuracy: acc,
      critical: crit,
      damageTypeLabel: isMagical ? "Magical" : "Physical",
      mpCost
    },

    // Defender
    defender: {
      img: defActor?.img ?? "icons/svg/mystery-man.svg",
      portraitOffsetX: defActor?.system?.portraitOffsetX ?? 50,
      portraitOffsetY: defActor?.system?.portraitOffsetY ?? 0,
      portraitMirrored: defActor?.system?.portraitMirrored ?? false,
      name: defActor?.name ?? (healMode ? "Ally" : "Enemy"),
      hp: defHp,
      maxHp: defMaxHp,
      hpPct: defHpPct,
      projectedHpPct: projectedDefHpPct,
      eva: defEva,
      def: defDef,
      critEvo: defCritAvoid,
      defLabel: isMagical ? "SPI" : "DEF",
      evaLabel: isMagical ? "M.EVA" : "P.EVA"
    },

    // Forecast
    forecast: {
      hit: (healMode || isRetaliatory) ? 100 : Math.max(0, acc - defEva),
      crit: (healMode || isRetaliatory) ? crit : Math.max(0, crit - defCritAvoid),
      damage: forecastDmg,
      block: defBlockChance,
      showBlock: !healMode && !isRetaliatory && defBlockChance > 0
    },

    // Element
    elementBadge,

    // Status inflictions
    statusInflictions,

    // Combat notes
    combatNotes,

    // Off-hand strike
    showOffhand,
    offhandName,
    offhandForecast,

    // Range validation
    outOfRange,
    rangeWarning,

    // MP validation
    outOfMp,
    mpWarning,

    // Chant-modified MP cost
    chantMpCost,

    // Casting modifier
    castingMod: castingModData,

    // ── Raw values for live recalculation in the dialog ──
    _raw: {
      baseDmg,
      acc,
      crit,
      defEva,
      defDef,
      defCritAvoid,
      defBlockChance,
      defHealBonus,
      effectMod,
      supportDmgMultiplier,
      isMagical,
      rawElement,
      hp,
      maxHp,
      defHp,
      defMaxHp,
      mpCost,
      isSpell,
      healMode,
      condBonuses,
      defActor,
      actor,
      skillData,
      weaponItem,
      mode,
      itemId,
      castingMods,
      findCastingMod
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// RECALCULATE FORECAST VALUES (for live-updating dialog)
// ═══════════════════════════════════════════════════════════════

/**
 * Recalculate forecast values from raw data + current input overrides.
 * Used by the dialog's live-update callback.
 * @param {object} raw - The _raw object from buildForecastContext
 * @param {object} overrides - { eva, def, critEvo, chantKey }
 * @returns {object} Updated forecast values
 */
export function recalculateForecast(raw, overrides = {}) {
  const eva = overrides.eva ?? raw.defEva;
  const def = overrides.def ?? raw.defDef;
  const critEvo = overrides.critEvo ?? raw.defCritAvoid;
  const chantKey = overrides.chantKey ?? "normal";
  const chantData = CONFIG.MANASHARD.chantModes[chantKey] ?? CONFIG.MANASHARD.chantModes.normal;
  const effectMod = chantData.effectModifier;

  // Recalculate skill base damage if chant changes affect it
  // (chant doesn't change base damage, only the multiplier)
  const baseDmg = raw.baseDmg;

  let forecastDmg;
  if (raw.healMode) {
    forecastDmg = Math.floor(Math.max(0, baseDmg + raw.defHealBonus) * effectMod * raw.supportDmgMultiplier);
  } else {
    forecastDmg = Math.floor(Math.max(0, baseDmg - def) * effectMod * raw.supportDmgMultiplier);
  }

  // Apply elemental multiplier
  if (raw.rawElement && raw.defActor && !raw.healMode) {
    const { multiplier } = computeElementalMultiplier(raw.rawElement, raw.defActor);
    forecastDmg = Math.floor(forecastDmg * multiplier);
  }

  // Projected HP
  let projectedDefHpPct;
  if (typeof raw.defHp === "number" && raw.defMaxHp > 0) {
    const projHp = raw.healMode
      ? Math.min(raw.defMaxHp, raw.defHp + forecastDmg)
      : Math.max(0, raw.defHp - forecastDmg);
    projectedDefHpPct = Math.round((projHp / raw.defMaxHp) * 100);
  } else {
    projectedDefHpPct = 100;
  }

  // Chant-modified MP cost
  const chantMpMult = chantData.mpMultiplier ?? 1.0;
  const chantMpCost = Math.ceil(raw.mpCost * chantMpMult);

  // MP check
  const currentMp = raw.actor?.system?.stats?.mp?.value ?? 0;
  const rawIsSkill = raw.mode === "skill" || raw.mode === "heal";
  const outOfMp = rawIsSkill && chantMpCost > 0 && currentMp < chantMpCost;
  const mpWarning = outOfMp ? `Need ${chantMpCost} MP, have ${currentMp}.` : "";

  return {
    hit: raw.healMode ? 100 : Math.max(0, raw.acc - eva),
    crit: raw.healMode ? raw.crit : Math.max(0, raw.crit - critEvo),
    damage: forecastDmg,
    projectedDefHpPct,
    chantMpCost,
    outOfMp,
    mpWarning
  };
}

// ═══════════════════════════════════════════════════════════════
// PRIVATE HELPERS
// ═══════════════════════════════════════════════════════════════


/**
 * Build status infliction preview data.
 * @param {object} ruleCache - Attacker's _ruleCache
 * @param {Actor|null} defActor - Defender actor
 * @returns {object[]} Status preview entries
 */
function _buildStatusInflictionPreview(ruleCache, defActor, attackingItemId = null, attackerSystem = null) {
  const allInflictions = ruleCache.statusInflictions ?? [];
  if (!allInflictions.length) return [];

  // Filter: only include inflictions from the attacking item or from non-combat-skill sources
  const COMBAT_SKILL_TYPES = new Set(["magic", "art", "active", "command"]);
  const inflictions = allInflictions.filter(r => {
    const src = r._source;
    if (!src) return true;
    if (src.skillType && COMBAT_SKILL_TYPES.has(src.skillType)) {
      return src.itemId === attackingItemId;
    }
    return true;
  });

  const defImmunities = defActor?.system?._ruleCache?.statusImmunities ?? [];
  const defResistances = defActor?.system?.statusResistances ?? {};
  return inflictions.map(rule => {
    if (!rule.status || typeof rule.chance !== "number") return null;

    // Check immunity from both rule-based immunities and resistance tier
    const tier = defResistances[rule.status] ?? "neutral";
    const immune = tier === "immune" || checkStatusImmunity(defImmunities, rule.status);

    // Apply resistance tier modifier (±25pp) — matches rollStatusInflictions in combat.mjs
    let baseChance = rule.chance;
    if (tier === "vulnerable") baseChance += 25;
    else if (tier === "resist") baseChance -= 25;
    const effectiveChance = Math.min(100, Math.max(0, baseChance));

    const statusConfig = CONFIG.MANASHARD.statusEffects?.[rule.status];
    const statusLabel = statusConfig
      ? (game.i18n?.localize(statusConfig.label) ?? rule.status)
      : rule.status.charAt(0).toUpperCase() + rule.status.slice(1);

    return { status: rule.status, statusLabel, chance: effectiveChance, immune };
  }).filter(Boolean);
}



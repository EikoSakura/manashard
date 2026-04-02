/**
 * Rule Engine for the Manashard Active Effect system.
 * Collects rule elements from equipped items and active status effects,
 * applies them to actor data in two phases (core stats, then derived stats),
 * and tracks all modifiers for UI display.
 *
 * Rule types: Aura, CombatNote, Elemental, Grant, Modifier, Status
 */

import { migrateRule } from "./rule-migration.mjs";

// --- Constants ---

const CORE_STATS = new Set(["agi", "chm", "end", "int", "luk", "mag", "spi", "str"]);

const DERIVED_STATS = new Set([
  "accuracy", "blockChance", "carryingCapacity", "critEvo", "critical",
  "damage", "loadoutSlots", "mdef", "meva", "mov", "mpRegen", "pdef", "peva",
  "piercing", "reach", "throwRange", "vision"
]);

const RESOURCE_STATS = new Set(["hp.barrier", "hp.max", "mp.max"]);

const GROWTH_STATS = new Set([
  "growth.hp", "growth.mp", "growth.str", "growth.agi", "growth.mag",
  "growth.end", "growth.spi", "growth.luk", "growth.int", "growth.chm"
]);

// --- Modifier Tracker ---

/**
 * Tracks all modifiers applied to each stat for UI breakdown display.
 * Stored on systemData._modifiers after rule application.
 */
export class ModifierTracker {
  constructor() {
    /** @type {Map<string, Array<{value: number, source: {itemId: string|null, itemName: string, itemType: string}, type: string}>>} */
    this._entries = new Map();
  }

  /**
   * Record a modifier entry for a stat.
   * @param {string} selector - The stat key
   * @param {{value: number, source: object, type: string}} entry
   */
  add(selector, entry) {
    if (!this._entries.has(selector)) this._entries.set(selector, []);
    this._entries.get(selector).push(entry);
  }

  /**
   * Get total modifier sum for a stat.
   * @param {string} selector
   * @returns {number}
   */
  getTotal(selector) {
    const entries = this._entries.get(selector);
    if (!entries) return 0;
    return entries.reduce((sum, e) => sum + e.value, 0);
  }

  /**
   * Get all modifier entries for a stat (for tooltip breakdown).
   * @param {string} selector
   * @returns {Array}
   */
  getEntries(selector) {
    return this._entries.get(selector) ?? [];
  }

  /**
   * Check if a stat has any modifiers.
   * @param {string} selector
   * @returns {boolean}
   */
  hasModifiers(selector) {
    return (this._entries.get(selector)?.length ?? 0) > 0;
  }

  /**
   * Get all selectors that have modifiers.
   * @returns {string[]}
   */
  getModifiedSelectors() {
    return [...this._entries.keys()];
  }
}

// --- Rule Collection ---

/**
 * Collect all active rule elements from an actor's equipped items and status effects.
 * All rules are migrated to the new 6-type format on collection.
 * @param {Actor} actor
 * @returns {object[]} Array of rule element objects with _source info attached
 */
export function collectRules(actor) {
  const rules = [];
  if (!actor?.items) return rules;

  // For NPCs, track which skill names have already contributed rules so that
  // duplicate copies (e.g. loot-table copies) don't double-apply.
  const seenNpcSkills = new Set();

  // Collect from equipped items and species
  for (const item of actor.items) {
    let isActive = item.system.equipped === true || item.type === "species"
      || (item.type === "weapon" && item.system.category === "natural");

    // For characters, skill manacites use loadout membership instead of equipped boolean
    if (actor.type === "character" && item.type === "manacite" && item.system.manaciteType === "skill") {
      const loadout = actor.system.skillLoadout ?? [];
      isActive = loadout.includes(item.id) || (actor.system._loadoutFreeSkillIds?.has(item.id));
    }

    // For NPCs, skill manacites are always active (no loadout system)
    // but deduplicate by name so loot-table copies don't stack rules.
    if (actor.type !== "character" && item.type === "manacite" && item.system.manaciteType === "skill") {
      if (seenNpcSkills.has(item.name)) continue;
      seenNpcSkills.add(item.name);
      isActive = true;
    }

    // Items with permanent grant rules are always active when owned
    if (!isActive) {
      const itemRules = item.system.rules ?? [];
      if (itemRules.some(r => {
        // Support both old and new key formats
        if (r.key === "Grant" && ["armorProficiency", "weaponProficiency", "movementMode", "creatureType"].includes(r.subtype)) return true;
        if (r.key === "GrantWeaponProficiency" || r.key === "GrantArmorProficiency") return true;
        return false;
      })) {
        isActive = true;
      }
    }

    if (!isActive) continue;

    // Skills with buffDuration > 0: their Modifier rules only apply via the
    // buff ActiveEffect created when the skill is cast, not permanently.
    const hasBuff = item.type === "manacite" && (item.system.buffDuration ?? 0) > 0;

    const itemRules = item.system.rules ?? [];
    for (let rule of itemRules) {
      // If rule has no key but has a legacy type field, promote type → key for migration
      if (!rule.key && rule.type) {
        rule = { ...rule, key: rule.type };
      }
      if (!rule.key) continue;
      // Skip Modifier/Status rules from buff skills — they apply via AE on cast
      if (hasBuff && (rule.key === "Modifier" || rule.key === "Status")) continue;
      const source = { itemId: item.id, itemName: item.name, itemImg: item.img, itemType: item.type };
      if (item.type === "manacite" && item.system.manaciteType === "skill") {
        source.skillType = item.system.skillType;
      }
      rules.push({ ...migrateRule(rule), _source: source });
    }

  }

  // Collect rules from granted ActiveEffects on the actor
  if (actor.effects) {
    for (const effect of actor.effects) {
      if (effect.disabled) continue;
      // Skip display-only status AEs (status rules are injected separately below)
      if (effect.getFlag?.("manashard", "statusDisplay")) continue;
      const effectRules = effect.getFlag?.("manashard", "rules") ?? [];
      for (const rule of effectRules) {
        if (!rule.key) continue;
        rules.push({
          ...migrateRule(rule),
          _source: { itemId: effect.id, itemName: effect.name, itemType: "activeEffect" }
        });
      }
    }
  }

  // Inject status effect rules
  const activeStatuses = actor.system.statusEffects ?? new Set();
  const statusEffectRules = CONFIG.MANASHARD?.statusEffectRules ?? {};
  for (const statusKey of activeStatuses) {
    const statusRules = statusEffectRules[statusKey] ?? [];
    for (const rule of statusRules) {
      rules.push({
        ...migrateRule(rule),
        _source: { itemId: null, itemName: statusKey, itemType: "status" }
      });
    }
  }

  // Inject weapon category identity rules
  const mainhandWeapon = actor.items.find(
    i => i.type === "weapon" && i.system.equipped && i.system.equipSlot === "mainhand"
  );
  const wpnCategory = mainhandWeapon?.system.category;
  if (wpnCategory) {
    const categoryRules = CONFIG.MANASHARD?.weaponCategoryRules?.[wpnCategory]?.rules ?? [];
    for (const rule of categoryRules) {
      const catLabel = CONFIG.MANASHARD.weaponCategories?.[wpnCategory];
      const catName = catLabel ? game.i18n.localize(catLabel) : wpnCategory;
      rules.push({ ...rule, _source: { itemId: null, itemName: catName, itemType: "category" } });
    }
  }

  // Inject weapon keyword rules from mainhand weapon tags
  const weaponTags = (mainhandWeapon?.system.tags ?? "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  const weaponKeywords = CONFIG.MANASHARD?.weaponKeywords ?? {};
  for (const tag of weaponTags) {
    const keyword = weaponKeywords[tag];
    if (keyword?.rules) {
      for (const rule of keyword.rules) {
        rules.push({ ...rule, _source: { itemId: null, itemName: keyword.label, itemType: "keyword" } });
      }
    }
  }

  return rules;
}

// --- Rule Application ---

/**
 * Apply a Modifier rule with mode "override" to a core or derived stat.
 */
function applyOverride(systemData, rule, tracker) {
  const { selector, value } = rule;
  if (typeof value !== "number") return;

  if (CORE_STATS.has(selector)) {
    const base = systemData.stats[selector].value;
    systemData.stats[selector].value = value;
    tracker.add(selector, { value: value - base, source: rule._source, type: "override" });
  } else if (DERIVED_STATS.has(selector)) {
    const base = systemData[selector] ?? 0;
    systemData[selector] = value;
    tracker.add(selector, { value: value - base, source: rule._source, type: "override" });
  }
}

/**
 * Apply a Modifier rule (flat or percent mode) to a core, derived, or resource stat.
 */
function applyModifier(systemData, rule, tracker, targetSet) {
  const { selector, value } = rule;
  if (typeof value !== "number" || value === 0) return;
  if (!targetSet.has(selector) && !RESOURCE_STATS.has(selector)) return;

  let effectiveValue = value;

  const mode = rule.mode ?? "flat";

  if (CORE_STATS.has(selector)) {
    const bonus = mode === "percent"
      ? Math.floor(systemData.stats[selector].value * effectiveValue / 100)
      : effectiveValue;
    systemData.stats[selector].value += bonus;
    tracker.add(selector, { value: bonus, source: rule._source, type: mode });
  } else if (selector === "hp.barrier") {
    const bonus = mode === "percent"
      ? Math.floor((systemData.stats.hp.barrier ?? 0) * effectiveValue / 100)
      : effectiveValue;
    systemData.stats.hp.barrier = (systemData.stats.hp.barrier ?? 0) + bonus;
    tracker.add("hp.barrier", { value: bonus, source: rule._source, type: mode });
  } else if (selector === "hp.max") {
    const bonus = mode === "percent"
      ? Math.floor(systemData.stats.hp.max * effectiveValue / 100)
      : effectiveValue;
    systemData.stats.hp.max += bonus;
    tracker.add("hp.max", { value: bonus, source: rule._source, type: mode });
  } else if (selector === "mp.max") {
    const bonus = mode === "percent"
      ? Math.floor(systemData.stats.mp.max * effectiveValue / 100)
      : effectiveValue;
    systemData.stats.mp.max += bonus;
    tracker.add("mp.max", { value: bonus, source: rule._source, type: mode });
  } else if (selector === "piercing" && mode === "percent") {
    // Percent piercing = "ignore X% of DEF", stored separately for combat resolution
    systemData.percentPiercing = (systemData.percentPiercing ?? 0) + effectiveValue;
    tracker.add("percentPiercing", { value: effectiveValue, source: rule._source, type: mode });
  } else if (DERIVED_STATS.has(selector)) {
    const bonus = mode === "percent"
      ? Math.floor((systemData[selector] ?? 0) * effectiveValue / 100)
      : effectiveValue;
    systemData[selector] = (systemData[selector] ?? 0) + bonus;
    tracker.add(selector, { value: bonus, source: rule._source, type: mode });
  }
}

/**
 * Apply a Grant rule based on subtype.
 */
function applyGrant(systemData, rule, tracker) {
  switch (rule.subtype) {
    case "movementMode":
      if (!rule.movementMode) return;
      if (!systemData._movementModes) systemData._movementModes = new Set();
      systemData._movementModes.add(rule.movementMode);
      tracker.add(`movementMode.${rule.movementMode}`, { value: 1, source: rule._source, type: "grant" });
      break;
    case "creatureType": {
      const ctTypes = Array.isArray(rule.creatureType) ? rule.creatureType : [rule.creatureType].filter(Boolean);
      if (!ctTypes.length) return;
      if (!Array.isArray(systemData.creatureType)) systemData.creatureType = [];
      for (const ct of ctTypes) {
        if (!systemData.creatureType.includes(ct)) {
          systemData.creatureType.push(ct);
        }
        tracker.add(`creatureType.${ct}`, { value: 1, source: rule._source, type: "grant" });
      }
      break;
    }
    case "weaponProficiency":
      if (!rule.weaponCategory) return;
      if (!systemData._weaponProficiencies) systemData._weaponProficiencies = new Set();
      systemData._weaponProficiencies.add(rule.weaponCategory);
      tracker.add(`weaponProf.${rule.weaponCategory}`, { value: 1, source: rule._source, type: "grant" });
      break;
    case "armorProficiency":
      if (!rule.armorCategory) return;
      if (!systemData._armorProficiencies) systemData._armorProficiencies = new Set();
      systemData._armorProficiencies.add(rule.armorCategory);
      tracker.add(`armorProf.${rule.armorCategory}`, { value: 1, source: rule._source, type: "grant" });
      break;
    case "trapSense":
      systemData._hasTrapSense = true;
      tracker.add("trapSense", { value: 1, source: rule._source, type: "grant" });
      break;
    case "sense":
      systemData._hasSense = true;
      tracker.add("sense", { value: 1, source: rule._source, type: "grant" });
      break;
    case "spatialInventory":
      systemData._hasSpatialInventory = true;
      tracker.add("spatialInventory", { value: 1, source: rule._source, type: "grant" });
      break;
    case "dualWield":
      systemData._hasDualWield = true;
      tracker.add("dualWield", { value: 1, source: rule._source, type: "grant" });
      break;
  }
}

// --- Two-Phase Engine ---

/**
 * Create a rule engine for two-phase application.
 * Phase 1 (applyCoreModifiers): Runs BEFORE derived stat formulas.
 * Phase 2 (applyDerivedModifiers): Runs AFTER derived stat formulas.
 *
 * @param {TypeDataModel} systemData - The actor's system data model instance
 * @param {object[]} rules - Collected rules from collectRules()
 * @param {object} [options] - Optional context
 * @returns {{ tracker: ModifierTracker, applyCoreModifiers: Function, applyDerivedModifiers: Function, cacheRemainingRules: Function }}
 */
export function createRuleEngine(systemData, rules) {
  const tracker = new ModifierTracker();

  return {
    tracker,

    /**
     * Phase 1: Apply core stat modifications (before derived formulas).
     */
    applyCoreModifiers() {
      // Overrides on core stats first
      for (const rule of rules) {
        if (rule.key !== "Modifier" || rule.mode !== "override") continue;
        if (!CORE_STATS.has(rule.selector)) continue;
        try {
          applyOverride(systemData, rule, tracker);
        } catch (e) {
          console.warn(`Manashard | Invalid Modifier override from ${rule._source?.itemName}`, e);
        }
      }

      // Flat/percent modifiers on core stats (skip conditioned, targetTypes, and checkOnly rules)
      for (const rule of rules) {
        if (rule.key !== "Modifier") continue;
        if (rule.mode === "override" || rule.mode === "checkOnly") continue;
        if (rule.condition || rule.targetTypes?.length) continue;
        try {
          applyModifier(systemData, rule, tracker, CORE_STATS);
        } catch (e) {
          console.warn(`Manashard | Invalid Modifier from ${rule._source?.itemName}`, e);
        }
      }

      // Floor core stats at 0
      for (const key of CORE_STATS) {
        if (systemData.stats[key]) {
          systemData.stats[key].value = Math.max(0, systemData.stats[key].value);
        }
      }
    },

    /**
     * Phase 2: Apply derived stat modifications (after derived formulas).
     */
    applyDerivedModifiers() {
      // Overrides on derived stats
      for (const rule of rules) {
        if (rule.key !== "Modifier" || rule.mode !== "override") continue;
        if (!DERIVED_STATS.has(rule.selector)) continue;
        try {
          applyOverride(systemData, rule, tracker);
        } catch (e) {
          console.warn(`Manashard | Invalid Modifier override from ${rule._source?.itemName}`, e);
        }
      }

      // Flat/percent modifiers on derived stats
      // All conditional modifiers (including weapon-category) are deferred to combat
      // so they only apply when the condition is actually met for the attack being made.
      for (const rule of rules) {
        if (rule.key !== "Modifier") continue;
        if (rule.mode === "override" || rule.mode === "checkOnly") continue;
        if (rule.targetTypes?.length) continue; // Target-type modifiers deferred to combat
        if (rule.condition) continue; // All conditions deferred to combat
        try {
          applyModifier(systemData, rule, tracker, DERIVED_STATS);
        } catch (e) {
          console.warn(`Manashard | Invalid Modifier from ${rule._source?.itemName}`, e);
        }
      }

      // Grants (movement mode, creature type, weapon proficiency, armor proficiency, trap sense)
      for (const rule of rules) {
        if (rule.key !== "Grant") continue;
        if (!["movementMode", "creatureType", "weaponProficiency", "armorProficiency", "trapSense", "sense", "spatialInventory", "dualWield"].includes(rule.subtype)) continue;
        try {
          applyGrant(systemData, rule, tracker);
        } catch (e) {
          console.warn(`Manashard | Invalid Grant from ${rule._source?.itemName}`, e);
        }
      }

      // Growth Rate modifiers — flat bonuses tracked for actor-character.mjs consumption
      for (const rule of rules) {
        if (rule.key !== "Modifier") continue;
        if (!GROWTH_STATS.has(rule.selector)) continue;
        const value = rule.value;
        if (typeof value !== "number" || value === 0) continue;
        const effectiveValue = value;
        tracker.add(rule.selector, { value: effectiveValue, source: rule._source, type: "flat" });
      }

      // Check Bonuses — stored separately, only affect skill check rolls
      systemData._checkBonuses = {};
      for (const rule of rules) {
        if (rule.key !== "Modifier") continue;
        if (rule.mode !== "checkOnly") continue;
        if (rule.condition || rule.targetTypes?.length) continue;
        const statKey = rule.selector;
        const value = rule.value;
        if (typeof value !== "number" || value === 0) continue;
        systemData._checkBonuses[statKey] = (systemData._checkBonuses[statKey] ?? 0) + value;
        tracker.add(`check.${statKey}`, { value, source: rule._source, type: "checkOnly" });
      }

      // Floor derived stats at 0
      for (const key of DERIVED_STATS) {
        if (typeof systemData[key] === "number") {
          systemData[key] = Math.max(0, systemData[key]);
        }
      }
      // Floor MOV at 0
      if (typeof systemData.mov === "number") {
        systemData.mov = Math.max(0, systemData.mov);
      }
    },

    /**
     * Cache combat-time rules that aren't applied during preparation.
     * These are evaluated during attack resolution or other runtime checks.
     * Cache property names are preserved for backward compatibility with consumers.
     */
    cacheRemainingRules() {
      systemData._ruleCache = {
        auras: rules.filter(r => r.key === "Aura"),
        castingModifiers: [], // CastingModifier removed — keep empty for compat
        combatNotes: rules.filter(r => r.key === "CombatNote"),
        conditionalCheckBonuses: rules.filter(r => r.key === "Modifier" && r.mode === "checkOnly" && r.condition),
        conditionalRules: rules.filter(r => !!r.condition || r.targetTypes?.length),
        damageReductions: rules.filter(r => r.key === "Modifier" && r.selector === "damageTaken" && r.damageType),
        damageTaken: rules.filter(r => r.key === "Modifier" && r.selector === "damageTaken" && !r.damageType),
        elementalAffinities: rules.filter(r => r.key === "Elemental"),
        elementalVulnerabilities: rules.filter(r => r.key === "Elemental" && (r.multiplier > 1 || r.tier === "weakness")),
        grantedElements: rules.filter(r => r.key === "Grant" && r.subtype === "element"),
        mpCostMultipliers: rules.filter(r => r.key === "Modifier" && r.selector === "mpCost"),
        statusImmunities: rules.filter(r => r.key === "Status" && r.action === "immune"),
        statusInflictions: rules.filter(r => r.key === "Status" && r.action === "inflict"),
        statusRemove: rules.some(r => r.key === "Status" && r.action === "remove"),
        targetRestrictions: rules.filter(r => r.key === "TargetRestriction"),
        triggers: rules.filter(r => r.key === "Trigger"),
        // Weapon category/keyword grants (versatile, brutalCrit, precision, etc.)
        grants: Object.fromEntries(
          rules.filter(r => r.key === "Grant" && r.grant)
            .map(r => [r.grant, r])
        )
      };
    }
  };
}

// --- Utility: Generate human-readable rule summary ---

/**
 * Generate a short human-readable summary of a rule element.
 * @param {object} rule - A rule element object
 * @returns {string}
 */
export function ruleSummary(rule) {
  if (!rule?.key) return "Invalid rule";
  return _ruleSummaryInner(rule);
}

function _ruleSummaryInner(rule) {
  const sign = (v) => v >= 0 ? `+${v}` : `${v}`;
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : "?";
  const selectorLabel = (sel) => {
    const labels = CONFIG.MANASHARD?.ruleSelectors ?? {};
    const key = labels[sel];
    return key ? (game?.i18n?.localize(key) ?? sel.toUpperCase()) : sel.toUpperCase();
  };

  // Helper to build a readable condition clause (includes targetTypes)
  const condSuffix = (r) => {
    const parts = [];
    if (r.condition) {
      const condLabels = CONFIG.MANASHARD?.ruleConditions ?? {};
      const condKey = condLabels[r.condition];
      parts.push(condKey ? (game?.i18n?.localize(condKey) ?? r.condition) : r.condition);
    }
    if (r.targetTypes?.length) {
      const typeLabels = r.targetTypes.map(t => cap(t)).join("/");
      parts.push(`vs ${typeLabels}`);
    }
    return parts.length ? ` (${parts.join(", ")})` : "";
  };

  switch (rule.key) {
    case "Aura": {
      const r = rule.radius ?? "?";
      const t = rule.target ?? "?";
      const tLabel = t === "allies" ? "allies" : t === "enemies" ? "enemies" : t;
      const effectDesc = rule.effect ? ruleSummary(rule.effect) : "?";
      return `Aura: ${effectDesc} to ${tLabel} within ${r} tiles`;
    }

    case "CombatNote": {
      const text = rule.text ?? "?";
      const preview = text.length > 50 ? text.slice(0, 47) + "..." : text;
      return `${preview}${condSuffix(rule)}`;
    }

    case "Elemental":
      if (rule.multiplier) {
        return `${cap(rule.element)} vulnerability (×${rule.multiplier} damage)`;
      }
      return `${cap(rule.element)} affinity: ${cap(rule.tier)}`;

    case "Grant": {
      switch (rule.subtype) {
        case "armorProficiency": {
          if (rule.choiceMode) {
            if (rule.armorCategory) {
              const aCatLabel = CONFIG.MANASHARD?.armorCategories?.[rule.armorCategory];
              return `Choose armor proficiency: ${aCatLabel ? game.i18n.localize(aCatLabel) : rule.armorCategory}`;
            }
            return "Choose an armor proficiency";
          }
          const aCatLabel = CONFIG.MANASHARD?.armorCategories?.[rule.armorCategory];
          return `Grants ${aCatLabel ? game.i18n.localize(aCatLabel) : rule.armorCategory ?? "?"} armor proficiency`;
        }
        case "element":
          return `Grants ${cap(rule.element)} element`;
        case "item": {
          if (rule.choiceMode === "custom" && rule.choiceItems?.length) {
            const names = rule.choiceItems.map(ci => ci.name);
            if (names.length <= 3) return `Choose from: ${names.join(", ")}`;
            return `Choose from: ${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
          }
          if (rule.choiceMode) {
            const filters = rule.choiceFilters ?? {};
            const parts = Object.values(filters).map(v => cap(v));
            return `Choose a ${parts.join(" ")} skill`;
          }
          const name = rule.grantName || rule.uuid || "?";
          const typeLabel = rule.grantType === "ActiveEffect" ? "effect" : "skill";
          return `Grants ${typeLabel}: ${name}`;
        }
        case "movementMode": {
          const mmLabel = CONFIG.MANASHARD?.movementModes?.[rule.movementMode];
          return `Grants ${mmLabel ? game.i18n.localize(mmLabel) : rule.movementMode} movement`;
        }
        case "creatureType": {
          const ctArr = Array.isArray(rule.creatureType) ? rule.creatureType : [rule.creatureType].filter(Boolean);
          const ctLabels = ctArr.map(ct => {
            const l = CONFIG.MANASHARD?.creatureTypes?.[ct];
            return l ? game.i18n.localize(l) : ct;
          });
          return `Adds ${ctLabels.join(", ") || "?"} creature type`;
        }
        case "weaponProficiency": {
          if (rule.choiceMode) {
            if (rule.weaponCategory) {
              const catLabel = CONFIG.MANASHARD?.weaponCategories?.[rule.weaponCategory];
              return `Choose weapon proficiency: ${catLabel ? game.i18n.localize(catLabel) : rule.weaponCategory}`;
            }
            return "Choose a weapon proficiency";
          }
          const catLabel = CONFIG.MANASHARD?.weaponCategories?.[rule.weaponCategory];
          return `Grants ${catLabel ? game.i18n.localize(catLabel) : rule.weaponCategory ?? "?"} proficiency`;
        }
        case "trapSense":
          return `Grants Trap Sense (Vision range)`;
        case "sense":
          return `Grants Sense (Vision range)`;
        case "spatialInventory":
          return `Grants Spatial Inventory`;
        case "dualWield":
          return `Grants Dual Wield (off-hand at full damage)`;
        default:
          return `Grant: ${rule.subtype ?? "?"}`;
      }
    }

    case "Modifier": {
      const mode = rule.mode ?? "flat";

      // Override mode
      if (mode === "override") {
        return `Set ${selectorLabel(rule.selector)} to ${rule.value}`;
      }

      // Damage reduction (damageTaken with damageType)
      if (rule.selector === "damageTaken" && rule.damageType) {
        const dt = rule.damageType ?? "all";
        const mult = rule.value ?? 0.5;
        return `${cap(dt)} damage reduced to ×${mult}`;
      }

      // Damage taken flat modifier
      if (rule.selector === "damageTaken" && !rule.damageType) {
        return `${sign(rule.value)} damage taken from attacks`;
      }

      // MP cost multiplier
      if (rule.selector === "mpCost") {
        return `Skill MP cost ×${rule.value ?? "?"}`;
      }

      // Check only mode
      if (mode === "checkOnly") {
        return `${sign(rule.value)} ${selectorLabel(rule.selector)} (checks only)${condSuffix(rule)}`;
      }

      // Standard flat/percent modifier
      const pct = mode === "percent" ? "%" : "";
      const valStr = `${sign(rule.value)}${pct}`;
      const stackStr = rule.stacks ? " per stack" : "";
      return `${valStr} ${selectorLabel(rule.selector)}${condSuffix(rule)}${stackStr}`;
    }

    case "Status": {
      switch (rule.action) {
        case "immune":
          return `Immune to ${cap(rule.status)}`;
        case "inflict": {
          const chanceStr = `${rule.chance ?? 0}%`;
          return `${chanceStr} chance to inflict ${cap(rule.status)} on hit`;
        }
        case "remove":
          return "Removes a status effect from target";
        default:
          return `Status: ${rule.action ?? "?"}`;
      }
    }

    case "TargetRestriction": {
      const types = (rule.creatureTypes ?? []).map(t => cap(t));
      const typeList = types.length ? types.join(", ") : "None";
      if (rule.mode === "except") return `Cannot affect: ${typeList}`;
      return `Only affects: ${typeList}`;
    }

    case "Trigger": {
      const eventLabels = CONFIG.MANASHARD?.triggerEvents ?? {};
      const actionLabels = CONFIG.MANASHARD?.triggerActions ?? {};
      const evtKey = eventLabels[rule.event];
      const actKey = actionLabels[rule.action];
      const evtStr = evtKey ? (game?.i18n?.localize(evtKey) ?? rule.event) : (rule.event ?? "?");
      const actStr = actKey ? (game?.i18n?.localize(actKey) ?? rule.action) : (rule.action ?? "?");
      return `${evtStr}: ${actStr} ${rule.value ?? 0}`;
    }

    default:
      return `Unknown: ${rule.key}`;
  }
}

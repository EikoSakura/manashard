/**
 * Rule Migration — converts old 20-type rule format to new 6-type format.
 * Pure function with no side effects; safe to call on every rule at collection time.
 */

/** Old key → already new format (no migration needed) */
const NEW_KEYS = new Set(["Aura", "CombatNote", "Elemental", "Grant", "Modifier", "Status"]);

/**
 * Migrate a single rule element from old format to new format.
 * Returns a new object (never mutates the input).
 * If the rule is already in new format, returns a shallow clone.
 *
 * @param {object} rule - A rule element object
 * @returns {object} Migrated rule element
 */
/** Renamed condition keys — migrated on the fly. */
const CONDITION_RENAMES = {
  weaponIsMelee: "attackIsMelee",
  weaponIsRanged: "attackIsRanged",
  weaponIsThrown: "attackIsThrown"
};

/** Legacy targetIs* conditions → creature type key for targetTypes migration. */
const TARGET_IS_CREATURE = {
  targetIsAquatic: "aquatic",
  targetIsBeast: "beast",
  targetIsConstruct: "construct",
  targetIsDemon: "demon",
  targetIsDragon: "dragon",
  targetIsHumanoid: "humanoid",
  targetIsPlant: "plant",
  targetIsSpirit: "spirit",
  targetIsUndead: "undead"
};

export function migrateRule(rule) {
  // If rule has no key but has a legacy type field, promote type → key
  if (!rule?.key && rule?.type) {
    rule = { ...rule, key: rule.type };
  }
  if (!rule?.key) return rule;

  // Migrate renamed condition keys on any rule type
  if (rule.condition && CONDITION_RENAMES[rule.condition]) {
    rule = { ...rule, condition: CONDITION_RENAMES[rule.condition] };
  }

  // Migrate targetIs* conditions → targetTypes array on Modifier rules
  if (rule.condition && TARGET_IS_CREATURE[rule.condition]) {
    const creatureKey = TARGET_IS_CREATURE[rule.condition];
    rule = { ...rule, targetTypes: [creatureKey], condition: undefined };
  }

  if (NEW_KEYS.has(rule.key)) {
    // Already new format — only recurse into Aura nested effects
    if (rule.key === "Aura" && rule.effect) {
      return { ...rule, effect: migrateRule(rule.effect) };
    }
    // Normalize legacy boolean choiceMode to string for Grant item rules
    if (rule.key === "Grant" && rule.subtype === "item" && rule.choiceMode === true) {
      return { ...rule, choiceMode: "filtered" };
    }
    return { ...rule };
  }

  switch (rule.key) {
    // ── Modifier merges ──────────────────────────────────────────

    case "FlatModifier": {
      const migrated = { ...rule, key: "Modifier" };
      // Convert check.* selectors to checkOnly mode
      if (migrated.selector?.startsWith("check.")) {
        migrated.selector = migrated.selector.replace("check.", "");
        migrated.mode = "checkOnly";
      }
      // Default mode is flat (strip if already flat for cleanliness)
      if (!migrated.mode) migrated.mode = "flat";
      return migrated;
    }

    case "ResourceModifier": {
      // Legacy → Modifier with resource as selector
      return {
        ...rule,
        key: "Modifier",
        selector: rule.resource,
        mode: rule.mode ?? "flat",
        resource: undefined
      };
    }

    case "StatOverride":
      return { ...rule, key: "Modifier", mode: "override" };

    case "DamageTaken":
      return { ...rule, key: "Modifier", selector: "damageTaken", mode: "flat" };

    case "DamageReduction":
      return {
        ...rule,
        key: "Modifier",
        selector: "damageTaken",
        mode: "percent",
        value: rule.multiplier ?? 0.5,
        damageType: rule.damageType ?? "all",
        multiplier: undefined
      };

    case "MPCostMultiplier":
      return {
        ...rule,
        key: "Modifier",
        selector: "mpCost",
        mode: "percent",
        value: rule.value ?? rule.multiplier ?? 1,
        multiplier: undefined
      };

    // ── Grant merges ─────────────────────────────────────────────

    case "GrantElement":
      return { ...rule, key: "Grant", subtype: "element" };

    case "GrantWeaponProficiency":
      return { ...rule, key: "Grant", subtype: "weaponProficiency" };

    case "GrantArmorProficiency":
      return { ...rule, key: "Grant", subtype: "armorProficiency" };

    case "GrantItem":
      return { ...rule, key: "Grant", subtype: "item" };

    // ── Elemental merge ──────────────────────────────────────────

    case "ElementalAffinity":
      return { ...rule, key: "Elemental" };

    case "ElementalVulnerability":
      return { ...rule, key: "Elemental" };

    // ── Status merge ─────────────────────────────────────────────

    case "StatusImmunity":
      return { ...rule, key: "Status", action: "immune" };

    case "StatusInflict":
      return { ...rule, key: "Status", action: "inflict" };

    case "StatusRemove":
      return { ...rule, key: "Status", action: "remove" };

    // ── Removed types ────────────────────────────────────────────

    case "CastingModifier":
      // Removed — return as CombatNote so it's visible but harmless
      return { ...rule, key: "CombatNote", text: `[Legacy] Casting: ${rule.modifier ?? "?"}` };

    // ── Aura (recurse nested effect) ─────────────────────────────

    case "Aura":
      return {
        ...rule,
        effect: rule.effect ? migrateRule(rule.effect) : rule.effect
      };

    default:
      return { ...rule };
  }
}

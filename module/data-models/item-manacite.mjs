const { HTMLField, NumberField, StringField, BooleanField, ArrayField, ObjectField, SchemaField } = foundry.data.fields;

/**
 * Unified data model for Manacite items.
 * Two main types via manaciteType:
 *
 *   Job  — Provides ONE unique, role-defining ability. One equipped per character.
 *   Skill — Three sub-types:
 *     Magic (green)    — Spells with MP cost, Chant modes, elements.
 *     Art (gold)       — Physical/hybrid combat techniques with MP cost.
 *     Passive (purple) — Always-on effects while equipped.
 *
 * Manacite provides abilities — Jobs define roles, Skills provide combat/passive effects.
 */
export class ManaciteData extends foundry.abstract.TypeDataModel {

  /** Migrate legacy fields before validation. */
  static migrateData(source) {
    // Remove legacy fields
    delete source.rarity;
    delete source.rank;
    delete source.jp;
    delete source.jpThreshold;
    delete source.jpLevel;

    // Migrate old skill sub-types to current 3-type system
    const typeMap = {
      support: "passive",
      command: "art",
      reaction: "art"
    };
    if (source.skillType && typeMap[source.skillType]) {
      console.warn(`Manashard | Migrating skillType "${source.skillType}" → "${typeMap[source.skillType]}"`);
      source.skillType = typeMap[source.skillType];
    }
    const validSkillTypes = ["magic", "art", "passive"];
    if (source.skillType && !validSkillTypes.includes(source.skillType)) {
      console.warn(`Manashard | Migrating invalid skillType "${source.skillType}" → "art"`);
      source.skillType = "art";
    }

    // Migrate FIN/SPD scaling → AGI
    if (source.scalingStat === "fin" || source.scalingStat === "spd") {
      source.scalingStat = "agi";
    }

    // Migrate DEF scaling → END
    if (source.scalingStat === "def") {
      source.scalingStat = "end";
    }

    // Remove legacy Job Manacite fields silently
    delete source.weaponAccess;
    delete source.armorAccess;
    delete source.mov;
    delete source.specialQualities;
    delete source.innateActiveUuid;
    delete source.innatePassiveUuid;
    delete source.masteryThreshold;
    delete source.currentMasteryXP;
    delete source.mastered;
    delete source.masteryGrowthBonuses;

    // Remove legacy Skill Manacite fields
    delete source.skillGroup;
    delete source.requiredSkillLevel;
    delete source.reactionTrigger;
    delete source.skillCategory;
    delete source.supportLinkType;
    delete source.activationStat;
    delete source.activationRate;
    delete source.hpThreshold;
    delete source.commandTarget;

    // Migrate isHealing boolean → damageType "healing"
    if (source.isHealing) {
      source.damageType = "healing";
    }
    delete source.isHealing;

    // Migrate empty/blank damageType (old "Auto") → "none"
    // Do NOT include undefined here: migrateData is called on partial update
    // payloads in Foundry V13, where damageType may simply be absent. Treating
    // undefined as "" would overwrite the stored value (e.g. "healing") with
    // "none". Schema initial:"none" handles truly missing fields on new items.
    if (source.damageType === "" || source.damageType === null) {
      source.damageType = "none";
    }

    // Migrate legacy range string → minRange/maxRange
    if (typeof source.range === "string" && source.range.trim()) {
      const dash = source.range.trim().match(/^(\d+)\s*-\s*(\d+)$/);
      const single = source.range.trim().match(/^(\d+)$/);
      if (dash) {
        source.minRange = parseInt(dash[1], 10);
        source.maxRange = parseInt(dash[2], 10);
      } else if (single) {
        source.minRange = parseInt(single[1], 10);
        source.maxRange = parseInt(single[1], 10);
      }
    }
    delete source.range;

    delete source.levelBonuses;

    // Migrate legacy Job fields → prerequisites array
    delete source.grantedSkillUuid;
    delete source.unlockRequirements;

    return super.migrateData(source);
  }

  static defineSchema() {
    return {
      description: new HTMLField({ required: false, blank: true }),

      // ═══════════════════════════════════════════════════════════
      // MANACITE TYPE (Job or Skill)
      // ═══════════════════════════════════════════════════════════

      manaciteType: new StringField({
        required: true, initial: "skill",
        choices: ["job", "skill"]
      }),

      // ═══════════════════════════════════════════════════════════
      // SHARED FIELDS
      // ═══════════════════════════════════════════════════════════

      equipped: new BooleanField({ initial: false }),
      price: new NumberField({ required: true, integer: true, min: 0, initial: 200 }),

      // ═══════════════════════════════════════════════════════════
      // JOB-SPECIFIC FIELDS
      // ═══════════════════════════════════════════════════════════

      // Prerequisites — drag-drop Job or Skill Manacites with required level
      prerequisites: new ArrayField(new SchemaField({
        uuid: new StringField({ required: true, blank: false }),
        type: new StringField({ required: true, choices: ["job", "skill"] }),
        level: new NumberField({ required: false, integer: true, min: 1, max: 10, initial: 1 })
      })),

      // Growth rates — integer percentages added to character base growths on level-up
      growthRates: new SchemaField({
        hp: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 0 }),
        mp: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 0 }),
        str: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 0 }),
        agi: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 0 }),
        mag: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 0 }),
        end: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 0 }),
        spi: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 0 }),
        int: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 0 }),
        chm: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 0 }),
        luk: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 0 })
      }),

      // ═══════════════════════════════════════════════════════════
      // SKILL — ABSORPTION
      // ═══════════════════════════════════════════════════════════

      // When true, the Manacite has been absorbed — skill is permanently learned
      absorbed: new BooleanField({ initial: false }),

      // ═══════════════════════════════════════════════════════════
      // SKILL CLASSIFICATION
      // ═══════════════════════════════════════════════════════════

      /** Sub-type determines WHAT the skill does mechanically. */
      skillType: new StringField({
        required: true, initial: "magic",
        choices: ["magic", "art", "passive"]
      }),

      // ═══════════════════════════════════════════════════════════
      // SKILL COMBAT STATS (Magic, Art)
      // ═══════════════════════════════════════════════════════════

      mpCost: new NumberField({ required: false, integer: true, min: 0, initial: 0 }),
      baseRateMode: new StringField({
        required: true, initial: "fixed",
        choices: ["fixed", "weapon"]
      }),
      baseRate: new NumberField({ required: false, integer: true, min: 0, initial: 0 }),

      /**
       * Skill-specific accuracy bonus for fixed-mode skills.
       * Added to the base 80 + scaling stat × 2 accuracy formula.
       * 0 = fall back to equipped weapon's accuracy. Only used when baseRateMode is "fixed".
       */
      skillHit: new NumberField({ required: false, integer: true, min: 0, initial: 0 }),

      minRange: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
      maxRange: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
      rangeType: new StringField({
        required: true, initial: "ranged",
        choices: ["none", "self", "melee", "ranged", "weapon"]
      }),
      element: new StringField({
        required: false, blank: true, initial: "",
        choices: ["", "fire", "ice", "water", "lightning", "wind", "earth", "light", "dark", "null"]
      }),

      /** Which stat the skill scales with. "auto" = STR for physical, MAG for magical. */
      scalingStat: new StringField({
        required: true, initial: "auto",
        choices: ["auto", "str", "agi", "mag", "end", "spi", "int", "chm", "luk", "none"]
      }),

      /** Combat classification. */
      damageType: new StringField({
        required: true, initial: "none",
        choices: ["none", "physical", "magical", "elemental", "healing", "barrier", "retaliatory"]
      }),

      /** Retaliation mode — only relevant when damageType is "retaliatory". */
      retaliationMode: new StringField({
        required: false, blank: true, initial: "flat",
        choices: ["flat", "percent", "stat"]
      }),
      targetType: new StringField({
        required: true, initial: "single",
        choices: ["single", "aoe", "self"]
      }),

      /** AOE shape — only relevant when targetType is "aoe". */
      aoeShape: new StringField({
        required: false, blank: true, initial: "",
        choices: ["", "circle", "line", "cross"]
      }),
      /** AOE size — radius for circle, arm length for cross, length for line. */
      aoeSize: new NumberField({ required: false, integer: true, min: 1, initial: 1 }),
      /** Who the AOE targets relative to the caster's disposition. */
      aoeTargetFilter: new StringField({
        required: false, blank: true, initial: "enemies",
        choices: ["enemies", "allies", "all", "allExcludeSelf"]
      }),


      // ═══════════════════════════════════════════════════════════
      // PASSIVE FLAGS (Passive sub-type)
      // ═══════════════════════════════════════════════════════════

      /**
       * Whether this passive has a condition for activation.
       * "always" = unconditional, always active
       * "conditional" = requires a specific condition (described in description/rules)
       */
      passiveMode: new StringField({
        required: false, blank: true, initial: "always",
        choices: ["always", "conditional"]
      }),

      // ═══════════════════════════════════════════════════════════
      // BUFF / DEBUFF DURATION (Magic, Art)
      // ═══════════════════════════════════════════════════════════

      /**
       * When > 0, casting this skill creates a temporary ActiveEffect on the
       * target lasting this many turns. The AE carries the skill's Modifier
       * rules and is displayed in the status effect panel.
       */
      buffDuration: new NumberField({ required: false, integer: true, min: 0, initial: 0 }),

      // ═══════════════════════════════════════════════════════════
      // RULES (all types)
      // ═══════════════════════════════════════════════════════════

      /** Rule elements (Active Effect system). */
      rules: new ArrayField(new ObjectField(), { required: false, initial: [] })
    };
  }

  /** Display string for range, e.g. "1-3", "1", or "Weapon" for melee/weapon-mode skills. */
  get rangeDisplay() {
    if (this.rangeType === "none") return "None";
    if (this.rangeType === "self") return "Self";
    if (this.rangeType === "melee" || this.rangeType === "weapon") return "Weapon";
    return this.minRange === this.maxRange ? `${this.minRange}` : `${this.minRange}-${this.maxRange}`;
  }

  /** Derived: true when damageType is "healing". Backward-compatible with old isHealing boolean. */
  get isHealing() {
    return this.damageType === "healing";
  }

  /** Derived: true when damageType is "barrier". */
  get isBarrier() {
    return this.damageType === "barrier";
  }

  /** Derived: true when damageType is "retaliatory". */
  get isRetaliatory() {
    return this.damageType === "retaliatory";
  }
}

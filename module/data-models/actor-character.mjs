const { HTMLField, SchemaField, NumberField, StringField, SetField, ArrayField, BooleanField, ObjectField } = foundry.data.fields;
import { collectRules, createRuleEngine } from "../helpers/rule-engine.mjs";

/**
 * Data model for player character actors in Manashard.
 * 10 core stats with growth rates, Adventurer Rank progression,
 * rank-based stat caps, and derived combat stats.
 */
export class CharacterData extends foundry.abstract.TypeDataModel {

  /** Migrate legacy fields before validation. */
  static migrateData(source) {
    // Remove legacy mastery tracking
    delete source.masteredJobs;

    // Merge FIN + SPD → AGI
    if (source.stats?.fin || source.stats?.spd) {
      const finVal = source.stats.fin?.value ?? 1;
      const spdVal = source.stats.spd?.value ?? 1;
      const finGrowth = source.stats.fin?.growth ?? 5;
      const spdGrowth = source.stats.spd?.growth ?? 5;
      source.stats.agi = { value: Math.max(finVal, spdVal), growth: Math.max(finGrowth, spdGrowth) };
      delete source.stats.fin;
      delete source.stats.spd;
    }

    // Rename DEF → END
    if (source.stats?.def && !source.stats?.end) {
      source.stats.end = source.stats.def;
      delete source.stats.def;
    }

    // Migrate old status effect keys → new conditions
    if (source.statusEffects) {
      const oldToNew = { burn: "blight", poison: "blight", hex: "blight", frozen: "stun", shock: "stun", root: "immobilize", blind: "impair", windshear: "impair", soak: "expose" };
      const validKeys = new Set(["beguile","blight","expose","immobilize","impair","silence","stun","taunt"]);
      const migrated = new Set();
      for (const key of (source.statusEffects ?? [])) {
        const mapped = oldToNew[key] ?? key;
        if (validKeys.has(mapped)) migrated.add(mapped);
      }
      source.statusEffects = [...migrated];
    }

    // Clear old statusResistances keys
    if (source.statusResistances) {
      const validKeys = new Set(["beguile","blight","expose","immobilize","impair","silence","stun","taunt"]);
      for (const key of Object.keys(source.statusResistances)) {
        if (!validKeys.has(key)) delete source.statusResistances[key];
      }
    }

    return super.migrateData(source);
  }

  static defineSchema() {
    return {
      // Portrait framing: offset (0–100 %) and horizontal flip
      portraitOffsetX: new NumberField({ required: true, initial: 50, min: 0, max: 100 }),
      portraitOffsetY: new NumberField({ required: true, initial: 0, min: 0, max: 100 }),
      portraitMirrored: new BooleanField({ initial: false }),

      // Sheet accent color
      sheetAccentPreset: new StringField({ required: true, initial: "gold" }),
      sheetAccentCustom: new StringField({ required: false, blank: true, initial: "" }),

      biography: new HTMLField({ required: false, blank: true }),
      age: new StringField({ required: false, blank: true, initial: "" }),
      height: new StringField({ required: false, blank: true, initial: "" }),
      weight: new StringField({ required: false, blank: true, initial: "" }),
      pronouns: new StringField({ required: false, blank: true, initial: "" }),
      eyes: new StringField({ required: false, blank: true, initial: "" }),
      hair: new StringField({ required: false, blank: true, initial: "" }),
      skin: new StringField({ required: false, blank: true, initial: "" }),
      gender: new StringField({ required: false, blank: true, initial: "" }),
      // Creature types (base + granted by Active Effects)
      creatureType: new ArrayField(new StringField(), { required: true, initial: [] }),

      level: new NumberField({ required: true, integer: true, min: 1, max: 40, initial: 1 }),
      exp: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      rank: new StringField({ required: true, initial: "f", choices: ["f", "e", "d", "c", "b", "a", "s"] }),
      rankPoints: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      eiress: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),

      // Skill Library — UUIDs/IDs of permanently absorbed skills
      skillLibrary: new ArrayField(new StringField(), { required: false, initial: [] }),

      // Skill Loadout — IDs of active skills equipped in loadout slots
      skillLoadout: new ArrayField(new StringField(), { required: false, initial: [] }),

      // Active status effects (set of condition keys like "blight", "stun", etc.)
      statusEffects: new SetField(new StringField()),

      // Status Resistances — innate resistance tiers per condition
      statusResistances: new SchemaField({
        beguile:    new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
        blight:     new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
        expose:     new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
        immobilize: new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
        impair:     new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
        silence:    new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
        stun:       new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
        taunt:      new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
      }),

      // Elemental Profile — each element mapped to an interaction tier
      elementalProfile: new SchemaField({
        fire: new StringField({ required: true, initial: "neutral", choices: ["weak", "neutral", "resist", "immune", "absorb"] }),
        ice: new StringField({ required: true, initial: "neutral", choices: ["weak", "neutral", "resist", "immune", "absorb"] }),
        water: new StringField({ required: true, initial: "neutral", choices: ["weak", "neutral", "resist", "immune", "absorb"] }),
        lightning: new StringField({ required: true, initial: "neutral", choices: ["weak", "neutral", "resist", "immune", "absorb"] }),
        wind: new StringField({ required: true, initial: "neutral", choices: ["weak", "neutral", "resist", "immune", "absorb"] }),
        earth: new StringField({ required: true, initial: "neutral", choices: ["weak", "neutral", "resist", "immune", "absorb"] }),
        light: new StringField({ required: true, initial: "neutral", choices: ["weak", "neutral", "resist", "immune", "absorb"] }),
        dark: new StringField({ required: true, initial: "neutral", choices: ["weak", "neutral", "resist", "immune", "absorb"] })
      }),

      // Core stats — each has a value and a growth rate (percentage chance to increase on level-up)
      stats: new SchemaField({
        hp: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
          max: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
          barrier: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
          growth: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 5 })
        }),
        mp: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
          max: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
          growth: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 5 })
        }),
        str: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
          growth: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 5 })
        }),
        agi: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
          growth: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 5 })
        }),
        mag: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
          growth: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 5 })
        }),
        end: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
          growth: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 5 })
        }),
        spi: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
          growth: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 5 })
        }),
        luk: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
          growth: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 5 })
        }),
        int: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
          growth: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 5 })
        }),
        chm: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
          growth: new NumberField({ required: true, integer: true, min: 0, max: 200, initial: 5 })
        })
      })
    };
  }

  /** @override */
  prepareDerivedData() {
    const stats = this.stats;
    const actor = this.parent;

    // --- Rank Stat Caps ---
    const rankStatCaps = CONFIG.MANASHARD.rankStatCaps?.[this.rank];
    this.rankStatCaps = rankStatCaps ?? {};

    // --- Find equipped items from owned items ---
    let equippedWeapon = null;
    let equippedWeaponItem = null;
    let equippedOffhand = null;
    let equippedOffhandItem = null;
    let equippedArmor = null;
    let equippedArmorItem = null;
    let equippedJob = null;
    let equippedJobItem = null;
    const equippedAccessories = [];

    if (actor?.items) {
      for (const item of actor.items) {
        if (item.type === "weapon" && item.system.equipped) {
          if (item.system.equipSlot === "offhand") {
            equippedOffhand = item.system;
            equippedOffhandItem = item;
          } else {
            equippedWeapon = item.system;
            equippedWeaponItem = item;
          }
        } else if (item.type === "armor" && item.system.equipped) {
          equippedArmor = item.system;
          equippedArmorItem = item;
        } else if (item.type === "accessory" && item.system.equipped) {
          equippedAccessories.push(item.system);
        } else if (item.type === "manacite" && item.system.manaciteType === "job" && item.system.equipped) {
          equippedJob = item.system;
          equippedJobItem = item;
        }
      }
    }

    // --- Equipment Weight (with per-category breakdown) ---
    const weaponWeight = equippedWeapon?.weight ?? 0;
    const offhandWeight = equippedOffhand?.weight ?? 0;
    const armorWeight = equippedArmor?.weight ?? 0;
    const accessoryWeight = equippedAccessories.reduce((sum, acc) => sum + (acc.weight ?? 0), 0);
    this.weightBreakdown = { weapon: weaponWeight, offhand: offhandWeight, armor: armorWeight, accessory: accessoryWeight };
    this.totalWeight = weaponWeight + offhandWeight + armorWeight + accessoryWeight;

    // --- Size & Reach (from equipped species, default 1) ---
    let equippedSpecies = null;
    let equippedSpeciesItem = null;
    if (actor?.items) {
      for (const item of actor.items) {
        if (item.type === "species") { equippedSpecies = item.system; equippedSpeciesItem = item; break; }
      }
    }
    this.size = equippedSpecies?.size ?? 1;


    const weaponRange = equippedWeapon?.rangeType === "melee" ? (equippedWeapon?.maxRange ?? 1) : 1;
    this.reach = Math.max(this.size, weaponRange);

    // --- Throw Range (default 0, granted by passives like Telekinesis) ---
    this.throwRange = 0;

    // --- MOV (flat base 6, modified by rules/effects) ---
    this.mov = 6;

    // --- Vision (base 6 tiles, modified by rules/effects) ---
    this.vision = 6;

    // --- Movement Modes (walk by default, expanded by grants) ---
    this._movementModes = new Set(["walk"]);

    // --- Max Accessory Slots ---
    this.maxAccessorySlots = 2;

    // --- Max Skill Loadout Slots (by Adventurer Rank) ---
    const loadoutSlotsByRank = { f: 5, e: 6, d: 7, c: 9, b: 11, a: 13, s: 15 };
    this.maxLoadoutSlots = loadoutSlotsByRank[this.rank] ?? 5;

    // --- Skill Loadout Slot Counting ---
    // Determine which skills are "free" (granted by Species or Job Manacite)
    this._loadoutFreeSkillIds = new Set();
    const freeGrantorIds = new Set();
    if (actor?.items) {
      for (const item of actor.items) {
        if (item.type === "species") freeGrantorIds.add(item.id);
        if (item.type === "manacite" && item.system.manaciteType === "job" && item.system.equipped) freeGrantorIds.add(item.id);
      }

      for (const item of actor.items) {
        if (item.type !== "manacite" || item.system.manaciteType !== "skill") continue;
        const grantedBy = item.getFlag?.("manashard", "grantedBy");

        // Species-granted and Job-granted skills are always free
        if (grantedBy && freeGrantorIds.has(grantedBy)) {
          this._loadoutFreeSkillIds.add(item.id);
        }
      }
    }

    // Count used loadout slots (free skills and stale IDs don't count)
    let loadoutSlotsUsed = 0;
    for (const skillId of (this.skillLoadout ?? [])) {
      if (!actor.items.has(skillId)) continue; // skip deleted items
      if (!this._loadoutFreeSkillIds.has(skillId)) loadoutSlotsUsed++;
    }
    this._loadoutSlotsUsed = loadoutSlotsUsed;

    // --- Natural Weapons (always-available innate attacks, never equipped in paperdoll) ---
    this._naturalWeapons = [];
    if (actor?.items) {
      for (const item of actor.items) {
        if (item.type === "weapon" && item.system.category === "natural") {
          this._naturalWeapons.push(item);
        }
      }
    }

    // --- Offhand item reference (for sheet context) ---
    this._equippedOffhandItem = equippedOffhandItem;

    // --- Weapon handedness & range type (for sheet context and combat) ---
    this._mainhandIs2H = equippedWeapon?.handedness === "2h";
    this._weaponRangeType = equippedWeapon?.rangeType ?? "melee";

    // ═══════════════════════════════════════════════════════
    // PHASE 1: Collect and apply CORE STAT rule modifiers
    // (before derived stat formulas use the modified values)
    // ═══════════════════════════════════════════════════════
    const rules = collectRules(actor);
    const engine = createRuleEngine(this, rules, { weaponCategory: equippedWeapon?.category ?? null });

    // Enforce rank stat caps on BASE values (before rule modifiers, so job/equipment
    // bonuses stack on top and are never eaten by the cap)
    if (rankStatCaps) {
      for (const key of Object.keys(stats)) {
        const cap = rankStatCaps[key];
        if (cap !== undefined) {
          if (key === "hp" || key === "mp") {
            if (stats[key].max > cap) stats[key].max = cap;
            if (stats[key].value > stats[key].max) stats[key].value = stats[key].max;
          } else {
            if (stats[key].value > cap) stats[key].value = cap;
          }
        }
      }
    }

    // Store base stats (post-cap, pre-modifier) for UI comparison and level-up cap checks
    this._baseStats = {};
    for (const key of Object.keys(stats)) {
      if (key === "hp" || key === "mp") {
        this._baseStats[key] = stats[key].max;
      } else {
        this._baseStats[key] = stats[key].value;
      }
    }

    engine.applyCoreModifiers();

    // --- Rank HP/MP Base Bonuses ---
    const rankData = CONFIG.MANASHARD.ranks?.[this.rank];
    const rankHpBase = rankData?.hpBase ?? 0;
    const rankMpBase = rankData?.mpBase ?? 0;
    stats.hp.max += rankHpBase;
    if (stats.hp.value > stats.hp.max) stats.hp.value = stats.hp.max;
    stats.mp.max += rankMpBase;
    if (stats.mp.value > stats.mp.max) stats.mp.value = stats.mp.max;

    // ═══════════════════════════════════════════════════════
    // Derived Stats (computed from now-modified core stats)
    // ═══════════════════════════════════════════════════════

    // MP Regen per turn = 1 + SPI / 4 (rounded down, minimum 1)
    this.mpRegen = 1 + Math.floor(stats.spi.value / 4);

    // Carrying Capacity = 10 + STR + (END / 2), rounded down
    this.carryingCapacity = 10 + stats.str.value + Math.floor(stats.end.value / 2);

    // Overencumbered check
    this.overencumbered = this.totalWeight > this.carryingCapacity;

    // Weapon stats
    const weaponMight = equippedWeapon?.might ?? 0;
    const weaponCrit = equippedWeapon?.crit ?? 0;
    const weaponDamageType = equippedWeapon?.damageType ?? "physical";

    // Damage = STR/MAG + Weapon Might (character power drives damage)
    // Scaling stat determined by weapon category and damage type:
    //   Staves/Grimoires → MAG (inherently magical weapons)
    //   Swords (Versatile) → max(STR, AGI)
    //   Magical damageType → MAG
    //   Everything else → STR
    const weaponCategory = equippedWeapon?.category ?? null;
    const isMagicCategory = weaponCategory === "staves" || weaponCategory === "grimoires";
    if (weaponDamageType === "magical" || isMagicCategory) {
      this.damage = stats.mag.value + weaponMight;
    } else if (weaponCategory === "swords") {
      this.damage = Math.max(stats.str.value, stats.agi.value) + weaponMight;
    } else {
      this.damage = stats.str.value + weaponMight;
    }

    // Accuracy = 60 + AGI × 2 + LUK
    this.accuracy = 60 + (stats.agi.value * 2) + stats.luk.value;

    // Critical = AGI/2 + LUK/2 + Weapon Crit
    this.critical = Math.floor(stats.agi.value / 2) + Math.floor(stats.luk.value / 2) + weaponCrit;

    // P.EVA = 20 + AGI × 2, M.EVA = 20 + SPI × 2
    this.peva = 20 + (stats.agi.value * 2);
    this.meva = 20 + (stats.spi.value * 2);

    // C.EVO (Crit Evasion) = 5 + LUK
    this.critEvo = 5 + stats.luk.value;

    // Armor Stats
    this.armorPdef = equippedArmor?.pdef ?? 0;
    this.armorMdef = equippedArmor?.mdef ?? 0;

    // P.DEF = Armor PDEF + END, M.DEF = Armor MDEF + SPI
    this.pdef = this.armorPdef + stats.end.value;
    this.mdef = this.armorMdef + stats.spi.value;

    // Shield Block = Shield + END
    this.blockChance = 0;
    const blockSource = equippedOffhand?.block ? equippedOffhand : equippedWeapon;
    if (blockSource?.block) {
      this.blockChance = blockSource.block + stats.end.value;
    }

    // Loadout Slots (base from rank, modifiable by effects)
    this.loadoutSlots = this.maxLoadoutSlots;

    // ═══════════════════════════════════════════════════════
    // PHASE 2: Apply DERIVED STAT rule modifiers
    // (after derived formulas, adds flat bonuses to derived stats)
    // ═══════════════════════════════════════════════════════
    engine.applyDerivedModifiers();

    // Apply loadout slot modifiers back to maxLoadoutSlots
    this.maxLoadoutSlots = this.loadoutSlots;

    // Cache combat-time rules (GrantElement, ElementalAffinity, conditionals, etc.)
    engine.cacheRemainingRules();

    // Store modifier tracker for UI display
    this._modifiers = engine.tracker;

    // Store base derived values (pre-modifier) for UI comparison
    this._baseDerived = {
      damage: this.damage - engine.tracker.getTotal("damage"),
      accuracy: this.accuracy - engine.tracker.getTotal("accuracy"),
      critical: this.critical - engine.tracker.getTotal("critical"),
      peva: this.peva - engine.tracker.getTotal("peva"),
      meva: this.meva - engine.tracker.getTotal("meva"),
      critEvo: this.critEvo - engine.tracker.getTotal("critEvo"),
      mov: this.mov - engine.tracker.getTotal("mov"),
      blockChance: this.blockChance - engine.tracker.getTotal("blockChance"),
      mpRegen: this.mpRegen - engine.tracker.getTotal("mpRegen"),
      carryingCapacity: this.carryingCapacity - engine.tracker.getTotal("carryingCapacity"),
      vision: this.vision - engine.tracker.getTotal("vision"),
      pdef: this.pdef - engine.tracker.getTotal("pdef"),
      mdef: this.mdef - engine.tracker.getTotal("mdef"),
      throwRange: this.throwRange - engine.tracker.getTotal("throwRange")
    };

    // --- Growth Rate Totals ---
    let growthTotal = 0;
    for (const key of Object.keys(stats)) {
      growthTotal += stats[key].growth;
    }
    this.growthTotal = growthTotal;

    // --- Effective Growth Rates (base + Job bonus + Rule bonuses) ---
    this._jobGrowthContributions = {};
    this._growthRuleBonuses = {};
    this._effectiveGrowths = {};
    for (const key of Object.keys(stats)) {
      let jobBonus = 0;
      if (equippedJob?.growthRates) {
        jobBonus = equippedJob.growthRates[key] ?? 0;
      }
      this._jobGrowthContributions[key] = jobBonus;
      const ruleBonus = engine.tracker.getTotal(`growth.${key}`);
      this._growthRuleBonuses[key] = ruleBonus;
      this._effectiveGrowths[key] = stats[key].growth + jobBonus + ruleBonus;
    }
    this._equippedJobName = equippedJobItem?.name ?? null;
  }
}

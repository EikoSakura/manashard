const { HTMLField, SchemaField, NumberField, StringField, BooleanField, SetField, ArrayField, ObjectField } = foundry.data.fields;
import { collectRules, createRuleEngine } from "../helpers/rule-engine.mjs";

/**
 * Data model for NPC actors in Manashard.
 * Similar stat block to characters but with size, elemental profile, and no growth rates.
 */
export class NpcData extends foundry.abstract.TypeDataModel {

  /** Migrate legacy fields before validation. */
  static migrateData(source) {
    // Merge FIN + SPD → AGI
    if (source.stats?.fin || source.stats?.spd) {
      const finVal = source.stats.fin?.value ?? 4;
      const spdVal = source.stats.spd?.value ?? 4;
      source.stats.agi = { value: Math.max(finVal, spdVal) };
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

    // Migrate creatureType from string → array
    if (typeof source.creatureType === "string") {
      source.creatureType = source.creatureType ? [source.creatureType] : ["humanoid"];
    }

    // Remove legacy specialQualities field
    delete source.specialQualities;

    // Migrate missing role field — derive from rank-based isBoss
    if (!source.role) {
      const rank = source.rank ?? "f";
      source.role = (rank === "a" || rank === "s") ? "boss" : "standard";
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
      sheetAccentPreset: new StringField({ required: true, initial: "crimson" }),
      sheetAccentCustom: new StringField({ required: false, blank: true, initial: "" }),

      biography: new HTMLField({ required: false, blank: true }),
      level: new NumberField({ required: true, integer: true, min: 1, initial: 1 }),
      size: new NumberField({ required: true, integer: true, min: 1, max: 5, initial: 1 }),
      isBoss: new BooleanField({ initial: false }),
      creatureType: new ArrayField(
        new StringField({ blank: false }),
        { initial: ["humanoid"] }
      ),
      rank: new StringField({
        required: true, initial: "f",
        choices: ["f", "e", "d", "c", "b", "a", "s"]
      }),
      role: new StringField({
        required: true, initial: "standard",
        choices: ["minion", "standard", "elite", "boss", "legendary"]
      }),
      actionsPerTurn: new NumberField({ required: true, integer: true, min: 1, max: 5, initial: 1 }),
      crystallizeInstantly: new BooleanField({ initial: false }),

      // Eiress dropped on defeat
      eiressDrop: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),

      // Owner actor ID (companion units — links to the bonded player character)
      ownerId: new StringField({ required: false, blank: true, initial: "" }),

      // Active status effects
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

      // Core stats — no growth rates for NPCs
      stats: new SchemaField({
        hp: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 15 }),
          max: new NumberField({ required: true, integer: true, min: 0, initial: 15 }),
          barrier: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
        }),
        mp: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 4 }),
          max: new NumberField({ required: true, integer: true, min: 0, initial: 4 })
        }),
        str: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 3 })
        }),
        agi: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 3 })
        }),
        mag: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 1 })
        }),
        end: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 2 })
        }),
        spi: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 1 })
        }),
        luk: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 1 })
        }),
        int: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
        }),
        chm: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
        })
      }),

      // MOV set directly for NPCs
      mov: new NumberField({ required: true, integer: true, min: 0, initial: 6 }),

      // Movement Modes (GM-editable)
      movementModes: new ArrayField(new StringField(), { required: true, initial: ["walk"] }),

      // Loot table for Steal and drop mechanics — references embedded item IDs
      lootTable: new ArrayField(new SchemaField({
        itemId: new StringField({ required: true, blank: true, initial: "" }),
        chance: new NumberField({ required: true, integer: true, min: 1, max: 100, initial: 50 }),
        stolen: new BooleanField({ initial: false })
      })),

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
      })
    };
  }

  /** @override */
  prepareDerivedData() {
    // Derive isBoss from role
    this.isBoss = this.role === "boss" || this.role === "legendary";

    // Auto-derive actionsPerTurn from role (GM can override via sheet)
    const roleActions = CONFIG.MANASHARD?.enemyRoleActions?.[this.role] ?? 1;
    if (this.actionsPerTurn === 1 && roleActions > 1) {
      this.actionsPerTurn = roleActions;
    }

    const stats = this.stats;
    const actor = this.parent;

    // --- Find equipped weapon, offhand, armor, and accessories ---
    let equippedWeapon = null;
    let equippedOffhand = null;
    let equippedArmor = null;
    const equippedAccessories = [];

    if (actor?.items) {
      for (const item of actor.items) {
        if (item.type === "weapon" && item.system.equipped) {
          if (item.system.equipSlot === "offhand") {
            equippedOffhand = item.system;
          } else {
            equippedWeapon = item.system;
          }
        } else if (item.type === "armor" && item.system.equipped) {
          equippedArmor = item.system;
        } else if (item.type === "accessory" && item.system.equipped) {
          equippedAccessories.push(item.system);
        }
      }
    }

    const weaponWeight = equippedWeapon?.weight ?? 0;
    const offhandWeight = equippedOffhand?.weight ?? 0;
    const armorWeight = equippedArmor?.weight ?? 0;
    const accessoryWeight = equippedAccessories.reduce((sum, acc) => sum + (acc.weight ?? 0), 0);
    this.weightBreakdown = { weapon: weaponWeight, offhand: offhandWeight, armor: armorWeight, accessory: accessoryWeight };
    this.totalWeight = weaponWeight + offhandWeight + armorWeight + accessoryWeight;

    // Natural weapons (always-available innate attacks)
    this._naturalWeapons = [];
    if (actor?.items) {
      for (const item of actor.items) {
        if (item.type === "weapon" && item.system.category === "natural") {
          this._naturalWeapons.push(item);
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 1: Collect and apply CORE STAT rule modifiers
    // ═══════════════════════════════════════════════════════
    const rules = collectRules(actor);
    const engine = createRuleEngine(this, rules, { weaponCategory: equippedWeapon?.category ?? null });
    engine.applyCoreModifiers();

    // Store base stats (pre-modifier) for UI comparison
    this._baseStats = {};
    for (const key of Object.keys(stats)) {
      if (key === "hp" || key === "mp") continue;
      this._baseStats[key] = stats[key].value - (engine.tracker.getTotal(key));
    }

    // ═══════════════════════════════════════════════════════
    // Derived Stats (computed from now-modified core stats)
    // ═══════════════════════════════════════════════════════

    // MP Regen per turn = 1 + SPI / 4 (rounded down, minimum 1)
    this.mpRegen = 1 + Math.floor(stats.spi.value / 4);

    // Carrying Capacity = 5 + STR + (END / 2), rounded down
    this.carryingCapacity = 5 + stats.str.value + Math.floor(stats.end.value / 2);

    // Weapon stats
    const weaponMight = equippedWeapon?.might ?? 0;
    const weaponCrit = equippedWeapon?.crit ?? 0;
    const weaponDamageType = equippedWeapon?.damageType ?? "physical";

    // Scaling stat: Staves/Grimoires/magical → MAG, Swords → max(STR,AGI), else → STR
    const weaponCategory = equippedWeapon?.category ?? null;
    const isMagicCategory = weaponCategory === "staves" || weaponCategory === "grimoires";
    const physScaling = weaponCategory === "swords" ? Math.max(stats.str.value, stats.agi.value) : stats.str.value;
    this.damage = ((weaponDamageType === "magical" || isMagicCategory) ? stats.mag.value : physScaling) + weaponMight;
    this.accuracy = 60 + (stats.agi.value * 2) + stats.luk.value;
    this.critical = Math.floor(stats.agi.value / 2) + Math.floor(stats.luk.value / 2) + weaponCrit;
    this.peva = 20 + (stats.agi.value * 2);
    this.meva = 20 + (stats.spi.value * 2);
    this.critEvo = 5 + stats.luk.value;

    this.armorPdef = equippedArmor?.pdef ?? 0;
    this.armorMdef = equippedArmor?.mdef ?? 0;

    // P.DEF = Armor PDEF + END, M.DEF = Armor MDEF + SPI
    this.pdef = this.armorPdef + stats.end.value;
    this.mdef = this.armorMdef + stats.spi.value;

    this.blockChance = 0;
    const blockSource = equippedOffhand?.block ? equippedOffhand : equippedWeapon;
    if (blockSource?.block) {
      this.blockChance = blockSource.block + stats.end.value;
    }

    // Reach = max(Size, weapon Range) — only melee weapons extend reach
    const weaponRange = equippedWeapon?.rangeType === "melee" ? (equippedWeapon?.maxRange ?? 1) : 1;
    this.reach = Math.max(this.size, weaponRange);

    // Throw Range (default 0, granted by passives like Telekinesis)
    this.throwRange = 0;

    // Vision: base 6, huge creatures (size 4+) get 7
    this.vision = this.size >= 4 ? 7 : 6;

    // Movement Modes (start from persisted array, grants can add more)
    this._movementModes = new Set(this.movementModes);

    // ═══════════════════════════════════════════════════════
    // PHASE 2: Apply DERIVED STAT rule modifiers
    // ═══════════════════════════════════════════════════════
    engine.applyDerivedModifiers();
    engine.cacheRemainingRules();
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
  }
}

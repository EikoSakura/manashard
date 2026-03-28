const { HTMLField, SchemaField, NumberField, StringField, BooleanField } = foundry.data.fields;

/**
 * Data model for Trap actors in Manashard.
 * Represents environmental hazards — pit traps, poison darts, magic wards, etc.
 * Simplified compared to threats: no stats, no equipment, no combat derivation.
 */
export class TrapData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      // Portrait framing: offset (0–100 %) and horizontal flip
      portraitOffsetX: new NumberField({ required: true, initial: 50, min: 0, max: 100 }),
      portraitOffsetY: new NumberField({ required: true, initial: 0, min: 0, max: 100 }),
      portraitMirrored: new BooleanField({ initial: false }),

      biography: new HTMLField({ required: false, blank: true }),
      level: new NumberField({ required: true, integer: true, min: 1, max: 40, initial: 1 }),
      rank: new StringField({
        required: true, initial: "f",
        choices: ["f", "e", "d", "c", "b", "a", "s"]
      }),
      armed: new BooleanField({ initial: true }),

      // --- Trigger & Disarm ---
      triggerType: new StringField({
        required: true, initial: "proximity",
        choices: ["proximity", "pressure", "tripwire", "magic", "manual"]
      }),
      disarmStat: new StringField({
        required: true, initial: "agi",
        choices: ["str", "agi", "mag", "end", "spi", "int", "chm", "luk"]
      }),
      difficultyPenalty: new NumberField({
        required: true, integer: true, min: -50, max: 0, initial: 0
      }),

      // --- Effect on Trigger ---
      damage: new NumberField({ required: true, integer: true, min: 0, initial: 5 }),
      damageType: new StringField({
        required: true, initial: "physical",
        choices: ["physical", "magical", "elemental"]
      }),
      element: new StringField({
        required: true, initial: "null",
        choices: ["null", "fire", "ice", "water", "lightning", "wind", "earth", "light", "dark"]
      }),
      statusInflict: new StringField({
        required: true, initial: "none",
        choices: ["none", "beguile", "blight", "expose", "immobilize", "impair", "silence", "stun", "taunt"]
      }),
      statusChance: new NumberField({ required: true, integer: true, min: 0, max: 100, initial: 0 }),

      // --- Area & Behavior ---
      aoeSize: new NumberField({ required: true, integer: true, min: 0, max: 3, initial: 0 }),
      repeating: new BooleanField({ initial: false })
    };
  }

  /** @override */
  prepareDerivedData() {
    // Rank pips (matches threat pattern)
    const rankPips = { f: 1, e: 1, d: 2, c: 2, b: 3, a: 4, s: 5 };
    this._pipCount = rankPips[this.rank] ?? 1;
  }
}

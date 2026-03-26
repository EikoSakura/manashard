const { HTMLField, NumberField, StringField, BooleanField, ArrayField, ObjectField } = foundry.data.fields;

/**
 * Data model for weapon items.
 * Covers all 12 weapon categories: Swords, Daggers, Axes, Polearms, Chains,
 * Fist, Bows, Firearms, Grimoires, Staves, Shields, Natural.
 */
export class WeaponData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      description: new HTMLField({ required: false, blank: true }),
      category: new StringField({
        required: true, initial: "swords",
        choices: ["swords", "daggers", "axes", "polearms", "chains", "fist", "bows", "firearms", "grimoires", "staves", "shields", "natural"]
      }),
      damageType: new StringField({
        required: true, initial: "physical",
        choices: ["physical", "magical", "elemental"]
      }),
      rangeType: new StringField({
        required: true, initial: "melee",
        choices: ["melee", "ranged", "thrown"]
      }),
      handedness: new StringField({
        required: true, initial: "1h",
        choices: ["1h", "2h"]
      }),

      // Core weapon stats
      might: new NumberField({ required: true, integer: true, min: 0, initial: 4 }),
      hit: new NumberField({ required: true, integer: true, initial: 85 }),
      crit: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      weight: new NumberField({ required: true, integer: true, min: 0, initial: 4 }),
      minRange: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
      maxRange: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),

      // Grimoire-specific: elemental affinity
      element: new StringField({
        required: false, blank: true, initial: "",
        choices: ["", "fire", "ice", "water", "lightning", "wind", "earth", "light", "dark", "null"]
      }),

      // Shield-specific: block chance base
      block: new NumberField({ required: false, integer: true, min: 0, initial: 0 }),


      price: new NumberField({ required: true, integer: true, min: 0, initial: 100 }),
      rank: new StringField({
        required: true, initial: "f",
        choices: ["f", "e", "d", "c", "b", "a", "s"]
      }),
      tags: new StringField({ required: false, blank: true, initial: "" }),
      equipped: new BooleanField({ initial: false }),
      equipSlot: new StringField({
        required: true, initial: "none",
        choices: ["none", "mainhand", "offhand"]
      }),
      special: new StringField({ required: false, blank: true, initial: "" }),

      // Rule elements (Active Effect system)
      rules: new ArrayField(new ObjectField(), { required: false, initial: [] })
    };
  }

  prepareDerivedData() {
    if (this.rangeType === "melee") {
      this.minRange = 1;
    }
  }

  /** Formatted range display (e.g., "1" or "1-2"). */
  get rangeDisplay() {
    return this.minRange === this.maxRange ? `${this.minRange}` : `${this.minRange}-${this.maxRange}`;
  }
}

const { HTMLField, NumberField, StringField, BooleanField, ArrayField, ObjectField } = foundry.data.fields;

/**
 * Data model for armor items.
 * Three categories: Cloth (SPI-focused), Light (balanced), Heavy (DEF-focused).
 */
export class ArmorData extends foundry.abstract.TypeDataModel {

  /** Migrate legacy fields before validation. */
  static migrateData(source) {
    // Rename def → pdef, spi → mdef
    if ("def" in source && !("pdef" in source)) {
      source.pdef = source.def;
      delete source.def;
    }
    if ("spi" in source && !("mdef" in source)) {
      source.mdef = source.spi;
      delete source.spi;
    }
    return super.migrateData(source);
  }

  static defineSchema() {
    return {
      description: new HTMLField({ required: false, blank: true }),
      category: new StringField({
        required: true, initial: "light",
        choices: ["cloth", "light", "heavy"]
      }),
      pdef: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      mdef: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      weight: new NumberField({ required: true, integer: true, min: 0, initial: 3 }),
      price: new NumberField({ required: true, integer: true, min: 0, initial: 80 }),
      rank: new StringField({
        required: true, initial: "f",
        choices: ["f", "e", "d", "c", "b", "a", "s"]
      }),
      tags: new StringField({ required: false, blank: true, initial: "" }),
      equipped: new BooleanField({ initial: false }),
      special: new StringField({ required: false, blank: true, initial: "" }),

      // Rule elements (Active Effect system)
      rules: new ArrayField(new ObjectField(), { required: false, initial: [] })
    };
  }
}

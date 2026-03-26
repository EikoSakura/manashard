const { HTMLField, NumberField, ArrayField, ObjectField } = foundry.data.fields;

/**
 * Data model for species items.
 * Each species provides a size, a description, and active effects (rules).
 */
export class SpeciesData extends foundry.abstract.TypeDataModel {

  static migrateData(source) {
    // Remove legacy specialQualities field
    delete source.specialQualities;
    return super.migrateData(source);
  }

  static defineSchema() {
    return {
      description: new HTMLField({ required: false, blank: true }),

      // Size category (1–5, matching NPC size)
      size: new NumberField({ required: true, integer: true, min: 1, max: 5, initial: 1 }),

      // Rule elements (Active Effect system)
      rules: new ArrayField(new ObjectField(), { required: false, initial: [] })
    };
  }
}

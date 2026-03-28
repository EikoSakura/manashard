const { HTMLField, NumberField, StringField, BooleanField, ArrayField, ObjectField } = foundry.data.fields;

/**
 * Data model for accessory items.
 * Two slots, no duplicates. Must be equipped to grant active effects.
 */
export class AccessoryData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      description: new HTMLField({ required: false, blank: true }),
      price: new NumberField({ required: true, integer: true, min: 0, initial: 150 }),
      weight: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
      rank: new StringField({
        required: true, initial: "f",
        choices: ["f", "e", "d", "c", "b", "a", "s"]
      }),
      tags: new StringField({ required: false, blank: true, initial: "" }),
      equipped: new BooleanField({ initial: false }),

      // Rule elements (Active Effect system)
      rules: new ArrayField(new ObjectField(), { required: false, initial: [] })
    };
  }
}

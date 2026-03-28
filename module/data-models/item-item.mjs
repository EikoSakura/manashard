const { HTMLField, NumberField, ArrayField, ObjectField } = foundry.data.fields;

/**
 * Data model for generic items.
 * Miscellaneous loot, quest items, key items, crafting materials, etc.
 */
export class ItemData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      description: new HTMLField({ required: false, blank: true }),
      quantity: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
      price: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      weight: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),

      // Rule elements (Active Effect system)
      rules: new ArrayField(new ObjectField(), { required: false, initial: [] })
    };
  }
}

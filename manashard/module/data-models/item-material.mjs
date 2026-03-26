const { HTMLField, NumberField, StringField, ArrayField, ObjectField } = foundry.data.fields;

/**
 * Data model for material items.
 * Crafting ingredients: ores, herbs, monster parts, crystals, etc.
 */
export class MaterialData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      description: new HTMLField({ required: false, blank: true }),
      quantity: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
      price: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
      weight: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      maxStack: new NumberField({ required: true, integer: true, min: 1, initial: 99 }),
      sources: new StringField({ required: false, blank: true, initial: "" }),
      tags: new StringField({ required: false, blank: true, initial: "" }),

      // Rule elements (Active Effect system)
      rules: new ArrayField(new ObjectField(), { required: false, initial: [] })
    };
  }
}

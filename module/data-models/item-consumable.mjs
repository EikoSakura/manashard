const { HTMLField, NumberField, StringField, BooleanField, ArrayField, ObjectField } = foundry.data.fields;

/**
 * Data model for consumable items.
 * Single-use items: potions, scrolls, food, bombs, utility.
 */
export class ConsumableData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      description: new HTMLField({ required: false, blank: true }),
      category: new StringField({
        required: true, initial: "potion",
        choices: ["potion", "scroll", "food", "bomb", "utility", "healing"]
      }),
      targetType: new StringField({
        required: true, initial: "self",
        choices: ["self", "single", "aoe"]
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
      quantity: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
      maxStack: new NumberField({ required: true, integer: true, min: 1, initial: 10 }),
      consumedOnUse: new BooleanField({ required: true, initial: true }),
      price: new NumberField({ required: true, integer: true, min: 0, initial: 15 }),
      effect: new StringField({ required: true, initial: "" }),
      restoreType: new StringField({
        required: true, initial: "hp",
        choices: ["hp", "mp"]
      }),
      restoreAmount: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),

      // Rule elements (Active Effect system)
      rules: new ArrayField(new ObjectField(), { required: false, initial: [] })
    };
  }
}

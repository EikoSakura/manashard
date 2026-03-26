const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * Spatial Inventory — a pocket-dimension storage dialog.
 * Opened from the equipment tab when the actor has the Spatial Inventory skill.
 */
export class SpatialInventory extends HandlebarsApplicationMixin(ApplicationV2) {

  /* ─── Category Definitions ────────────────────────────────── */

  static CATEGORIES = [
    { id: "all",         label: "All",          icon: "fa-box-open" },
    { id: "weapon",      label: "Weapons",      icon: "fa-sword" },
    { id: "armor",       label: "Armor",        icon: "fa-shield-halved" },
    { id: "accessory",   label: "Accessories",  icon: "fa-ring" },
    { id: "consumable",  label: "Consumables",  icon: "fa-flask" },
    { id: "other",       label: "Other",        icon: "fa-cube" }
  ];

  /* ─── ApplicationV2 Options ──────────────────────────────── */

  static PARTS = {
    shell: { template: "systems/manashard/templates/apps/spatial-inventory.hbs" }
  };

  static DEFAULT_OPTIONS = {
    classes: ["manashard", "spatial-inventory"],
    position: { width: 620, height: 480 },
    window: {
      resizable: true,
      icon: "fas fa-box-open"
    },
    tag: "div",
    actions: {
      switchCategory:  SpatialInventory.#onSwitchCategory,
      retrieveItem:    SpatialInventory.#onRetrieveItem,
      viewItem:        SpatialInventory.#onViewItem,
      deleteItem:      SpatialInventory.#onDeleteItem
    }
  };

  /* ─── Private State ──────────────────────────────────────── */

  #actor;
  #activeCategory = "all";
  #hookIds = [];

  /* ─── Constructor ────────────────────────────────────────── */

  constructor(actor, options = {}) {
    const id = `spatial-inventory-${actor.id}`;
    super({ ...options, id, window: { ...options.window, title: `Spatial Inventory — ${actor.name}` } });
    this.#actor = actor;
  }

  get actor() { return this.#actor; }

  /* ─── Singleton per actor ────────────────────────────────── */

  static #instances = new Map();

  static open(actor) {
    if (!SpatialInventory.#instances.has(actor.id)) {
      SpatialInventory.#instances.set(actor.id, new SpatialInventory(actor));
    }
    SpatialInventory.#instances.get(actor.id).render(true);
  }

  /* ─── Lifecycle ──────────────────────────────────────────── */

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    const hookUpdate = Hooks.on("updateItem", (item) => {
      if (item.parent?.id === this.#actor.id) this.render(true);
    });
    const hookCreate = Hooks.on("createItem", (item) => {
      if (item.parent?.id === this.#actor.id) this.render(true);
    });
    const hookDelete = Hooks.on("deleteItem", (item) => {
      if (item.parent?.id === this.#actor.id) this.render(true);
    });
    this.#hookIds = [
      ["updateItem", hookUpdate],
      ["createItem", hookCreate],
      ["deleteItem", hookDelete]
    ];
  }

  _onClose() {
    super._onClose?.();
    for (const [name, id] of this.#hookIds) Hooks.off(name, id);
    this.#hookIds = [];
    SpatialInventory.#instances.delete(this.#actor.id);
  }

  /* ─── Context Preparation ────────────────────────────────── */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.#actor;
    const catId = this.#activeCategory;

    // Categories
    context.categories = SpatialInventory.CATEGORIES.map(c => ({ ...c, active: c.id === catId }));
    context.activeCategory = catId;

    // Gather all spatial-stored items
    const storable = new Set(["weapon", "armor", "accessory", "consumable", "item", "material"]);
    let items = actor.items.filter(i => storable.has(i.type) && i.getFlag("manashard", "spatialStorage"));

    // Category filter
    if (catId !== "all") {
      if (catId === "other") {
        items = items.filter(i => i.type === "item" || i.type === "material");
      } else {
        items = items.filter(i => i.type === catId);
      }
    }

    // Map to display objects
    context.items = items
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(i => ({
        id: i.id,
        name: i.name,
        img: i.img,
        type: i.type,
        typeLabel: i.type.charAt(0).toUpperCase() + i.type.slice(1),
        quantity: i.system.quantity ?? null,
        weight: i.system.weight ?? 0
      }));

    context.itemCount = actor.items.filter(i => storable.has(i.type) && i.getFlag("manashard", "spatialStorage")).length;
    context.actorName = actor.name;

    return context;
  }

  /* ─── Actions ────────────────────────────────────────────── */

  static #onSwitchCategory(event, target) {
    this.#activeCategory = target.dataset.category ?? "all";
    this.render(true);
  }

  static async #onRetrieveItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) await item.unsetFlag("manashard", "spatialStorage");
  }

  static #onViewItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    item?.sheet?.render(true);
  }

  static async #onDeleteItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete Item" },
      content: `<p>Delete <strong>${item.name}</strong> permanently?</p>`
    });
    if (confirm) await item.delete();
  }
}

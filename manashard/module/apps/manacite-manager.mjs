const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
import { postAbsorptionCard } from "../helpers/item-cards.mjs";

/**
 * Manacite Manager — a dialog for browsing your skill library, managing loadout,
 * absorbing crystals, and equipping jobs. Opened from the character sheet.
 */
export class ManaciteManager extends HandlebarsApplicationMixin(ApplicationV2) {

  /* ─── Tab Definitions ───────────────────────────────────── */

  static TABS = [
    { id: "library",  label: "Skill Library", icon: "fa-book" },
    { id: "crystals", label: "Manacite",       icon: "fa-gem" }
  ];

  /* ─── ApplicationV2 Options ─────────────────────────────── */

  static PARTS = {
    shell: { template: "systems/manashard/templates/apps/manacite-manager.hbs" }
  };

  static DEFAULT_OPTIONS = {
    classes: ["manashard", "manacite-manager"],
    position: { width: 720, height: 600 },
    window: {
      resizable: true,
      icon: "fas fa-gem"
    },
    tag: "div",
    actions: {
      switchTab:       ManaciteManager.#onSwitchTab,
      toggleFilter:    ManaciteManager.#onToggleFilter,
      clearFilters:    ManaciteManager.#onClearFilters,
      toggleLoadout:   ManaciteManager.#onToggleLoadout,
      absorbSkill:     ManaciteManager.#onAbsorbSkill,
      equipJob:        ManaciteManager.#onEquipJob,
      unequipJob:      ManaciteManager.#onUnequipJob,
      viewItem:        ManaciteManager.#onViewItem,
      deleteItem:      ManaciteManager.#onDeleteItem
    }
  };

  /* ─── Private State ─────────────────────────────────────── */

  #actor;
  #activeTab = "library";
  #searchQuery = "";
  #filters = {};  // { [filterKey]: Set<string> }
  #hookIds = [];

  /* ─── Constructor ───────────────────────────────────────── */

  constructor(actor, options = {}) {
    const id = `manacite-manager-${actor.id}`;
    super({ ...options, id, window: { ...options.window, title: `Manacite — ${actor.name}` } });
    this.#actor = actor;
  }

  get actor() { return this.#actor; }

  /* ─── Singleton per actor ───────────────────────────────── */

  static #instances = new Map();

  static open(actor) {
    if (!ManaciteManager.#instances.has(actor.id)) {
      ManaciteManager.#instances.set(actor.id, new ManaciteManager(actor));
    }
    ManaciteManager.#instances.get(actor.id).render(true);
  }

  /* ─── Lifecycle ─────────────────────────────────────────── */

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    // Re-render when actor data changes
    const hookUpdate = Hooks.on("updateActor", (actor) => {
      if (actor.id === this.#actor.id) this.render(true);
    });
    const hookItem = Hooks.on("updateItem", (item) => {
      if (item.parent?.id === this.#actor.id) this.render(true);
    });
    const hookCreate = Hooks.on("createItem", (item) => {
      if (item.parent?.id === this.#actor.id) this.render(true);
    });
    const hookDelete = Hooks.on("deleteItem", (item) => {
      if (item.parent?.id === this.#actor.id) this.render(true);
    });
    this.#hookIds = [
      ["updateActor", hookUpdate],
      ["updateItem", hookItem],
      ["createItem", hookCreate],
      ["deleteItem", hookDelete]
    ];
  }

  _onClose() {
    super._onClose?.();
    for (const [name, id] of this.#hookIds) Hooks.off(name, id);
    this.#hookIds = [];
    ManaciteManager.#instances.delete(this.#actor.id);
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Wire search input
    const searchInput = this.element?.querySelector('input[name="manager-search"]');
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.#searchQuery = e.target.value;
        this.#renderPreservingScroll();
      });
      if (this.#searchQuery) {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      }
    }
  }

  /* ─── Scroll Preservation ───────────────────────────────── */

  async #renderPreservingScroll() {
    const list = this.element?.querySelector(".manager-results");
    const scrollTop = list?.scrollTop ?? 0;
    await this.render(true);
    const newList = this.element?.querySelector(".manager-results");
    if (newList) newList.scrollTop = scrollTop;
  }

  /* ─── Context Preparation ───────────────────────────────── */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.#actor;
    const system = actor.system;
    const tabId = this.#activeTab;

    // Tabs
    context.tabs = ManaciteManager.TABS.map(t => ({ ...t, active: t.id === tabId }));
    context.activeTab = tabId;
    context.searchQuery = this.#searchQuery;

    // Loadout info
    context.loadoutSlotsUsed = system._loadoutSlotsUsed ?? 0;
    context.maxLoadoutSlots = system.maxLoadoutSlots ?? 5;
    const loadoutIds = new Set(system.skillLoadout ?? []);
    const freeIds = system._loadoutFreeSkillIds ?? new Set();

    const allManacites = (actor.itemTypes.manacite ?? []);

    if (tabId === "library") {
      let results = allManacites
        .filter(m => m.system.manaciteType === "skill" && m.system.absorbed)
        .map(m => ({
          id: m.id,
          name: m.name,
          img: m.img,
          skillType: m.system.skillType,
          inLoadout: loadoutIds.has(m.id),
          isFree: freeIds.has(m.id),
          mpCost: m.system.mpCost,
          element: m.system.element,
          baseRate: m.system.baseRate
        }));

      // Filters
      const filterContext = {};
      filterContext.skillType = this.#buildFilterChoices("skillType", { magic: "Magic", art: "Art", passive: "Passive" });
      filterContext.loadoutStatus = this.#buildFilterChoices("loadoutStatus", { loaded: "In Loadout", unloaded: "Not Loaded" });
      results = this.#applyFilter(results, "skillType", e => e.skillType);
      results = this.#applyFilter(results, "loadoutStatus", e => e.inLoadout ? "loaded" : "unloaded");

      // Text search
      const query = this.#searchQuery.trim().toLowerCase();
      if (query) results = results.filter(e => e.name.toLowerCase().includes(query));

      // Sort: in-loadout first, then alphabetical
      results.sort((a, b) => {
        if (a.inLoadout !== b.inLoadout) return a.inLoadout ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      context.results = results;
      context.resultCount = results.length;
      context.filters = filterContext;

    } else if (tabId === "crystals") {
      // Job manacites
      const equippedJobId = allManacites.find(m => m.system.manaciteType === "job" && m.system.equipped)?.id;
      context.jobManacites = allManacites
        .filter(m => m.system.manaciteType === "job")
        .map(m => ({
          id: m.id,
          name: m.name,
          img: m.img,
          isEquipped: m.system.equipped
        }));

      // Unabsorbed skill crystals
      let unabsorbed = allManacites
        .filter(m => m.system.manaciteType === "skill" && !m.system.absorbed)
        .map(m => {
          // Check if a duplicate already exists in library
          const duplicate = actor.items.find(i =>
            i.type === "manacite" && i.system.manaciteType === "skill" && i.system.absorbed
            && i.id !== m.id && i.name.toLowerCase() === m.name.toLowerCase()
          );
          return {
            id: m.id,
            name: m.name,
            img: m.img,
            skillType: m.system.skillType,
            cannotAbsorb: !!duplicate,
            duplicateReason: duplicate ? `${m.name} is already in your library` : null
          };
        });

      // Text search
      const query = this.#searchQuery.trim().toLowerCase();
      if (query) {
        context.jobManacites = context.jobManacites.filter(e => e.name.toLowerCase().includes(query));
        unabsorbed = unabsorbed.filter(e => e.name.toLowerCase().includes(query));
      }

      context.unabsorbedSkills = unabsorbed;
      context.filters = {};
      context.resultCount = context.jobManacites.length + unabsorbed.length;
    }

    return context;
  }

  /* ─── Filter Helpers ────────────────────────────────────── */

  #buildFilterChoices(filterKey, sourceObj) {
    const active = this.#filters[filterKey] || new Set();
    return Object.entries(sourceObj).map(([key, label]) => ({
      key, label, active: active.has(key)
    }));
  }

  #applyFilter(results, filterKey, valueFn) {
    const active = this.#filters[filterKey];
    if (!active || active.size === 0) return results;
    return results.filter(entry => active.has(valueFn(entry)));
  }

  /* ─── Action Handlers ───────────────────────────────────── */

  static #onSwitchTab(event, target) {
    const tabId = target.dataset.tab;
    if (!tabId || tabId === this.#activeTab) return;
    this.#activeTab = tabId;
    this.#searchQuery = "";
    this.#filters = {};
    this.render(true);
  }

  static #onToggleFilter(event, target) {
    const key = target.dataset.filterKey;
    const value = target.dataset.filterValue;
    if (!key || !value) return;
    if (!this.#filters[key]) this.#filters[key] = new Set();
    if (this.#filters[key].has(value)) {
      this.#filters[key].delete(value);
    } else {
      this.#filters[key].add(value);
    }
    this.#renderPreservingScroll();
  }

  static #onClearFilters() {
    this.#filters = {};
    this.#searchQuery = "";
    this.render(true);
  }

  static async #onToggleLoadout(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    if (!itemId) return;
    const actor = this.#actor;
    const loadout = [...(actor.system.skillLoadout ?? [])];
    const sys = actor.system;

    if (loadout.includes(itemId)) {
      // Remove from loadout
      await actor.update({ "system.skillLoadout": loadout.filter(id => id !== itemId) });
    } else {
      // Check slot capacity
      const isFree = sys._loadoutFreeSkillIds?.has(itemId);
      if (!isFree && sys._loadoutSlotsUsed >= sys.maxLoadoutSlots) {
        ui.notifications.warn(`Loadout full! (${sys._loadoutSlotsUsed}/${sys.maxLoadoutSlots} slots)`);
        return;
      }
      loadout.push(itemId);
      await actor.update({ "system.skillLoadout": loadout });
    }
  }

  static async #onAbsorbSkill(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const actor = this.#actor;
    const item = actor.items.get(itemId);
    if (!item || item.type !== "manacite" || item.system.manaciteType !== "skill") return;
    if (item.system.absorbed) return;

    // Check for duplicate
    const existingSkill = actor.items.find(i =>
      i.type === "manacite" && i.system.manaciteType === "skill" && i.system.absorbed
      && i.id !== item.id && i.name.toLowerCase() === item.name.toLowerCase()
    );
    if (existingSkill) {
      ui.notifications.warn(`${existingSkill.name} is already in your skill library!`);
      return;
    }

    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Absorb Manacite" },
      content: `<p>Absorb <strong>${item.name}</strong>?</p><p>This will permanently learn the skill and destroy the crystal.</p>`,
      yes: { label: "Absorb", icon: "fas fa-sun" },
      no: { label: "Cancel" }
    });
    if (!confirm) return;

    const library = [...(actor.system.skillLibrary ?? [])];
    if (!library.includes(item.id)) library.push(item.id);
    await item.update({ "system.absorbed": true });
    await actor.update({ "system.skillLibrary": library });
    await postAbsorptionCard(item, actor);
  }

  static async #onEquipJob(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const actor = this.#actor;
    const item = actor.items.get(itemId);
    if (!item || item.system.manaciteType !== "job") return;

    // Unequip current job first
    const updates = [];
    for (const m of actor.itemTypes.manacite ?? []) {
      if (m.system.manaciteType === "job" && m.system.equipped && m.id !== itemId) {
        updates.push({ _id: m.id, "system.equipped": false });
      }
    }
    updates.push({ _id: itemId, "system.equipped": true });
    await actor.updateEmbeddedDocuments("Item", updates);
  }

  static async #onUnequipJob(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const actor = this.#actor;
    const item = actor.items.get(itemId);
    if (!item) return;
    await item.update({ "system.equipped": false });
  }

  static async #onViewItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.#actor.items.get(itemId);
    if (item) item.sheet.render(true);
  }

  static async #onDeleteItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const actor = this.#actor;
    const item = actor.items.get(itemId);
    if (!item) return;

    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete Manacite" },
      content: `<p>Delete <strong>${item.name}</strong>?</p><p>This cannot be undone.</p>`,
      yes: { label: "Delete", icon: "fas fa-trash" },
      no: { label: "Cancel" }
    });
    if (!confirm) return;

    // Remove from loadout/library if present
    const updates = {};
    const loadout = actor.system.skillLoadout ?? [];
    const library = actor.system.skillLibrary ?? [];
    if (loadout.includes(itemId)) {
      updates["system.skillLoadout"] = loadout.filter(id => id !== itemId);
    }
    if (library.includes(itemId)) {
      updates["system.skillLibrary"] = library.filter(id => id !== itemId);
    }
    if (Object.keys(updates).length) await actor.update(updates);
    await item.delete();
  }
}

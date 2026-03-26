const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * Compendium Browser — a unified search-and-filter interface for all system compendiums.
 * Inspired by PF2e's Compendium Browser. Uses pack indexes for performance.
 */
export class CompendiumBrowser extends HandlebarsApplicationMixin(ApplicationV2) {

  /* ─── Tab Definitions ───────────────────────────────────── */

  static TABS = [
    { id: "equipment",   label: "Equipment",   icon: "fa-shield-halved",  packs: ["weapons", "armor", "accessories"] },
    { id: "manacite",    label: "Manacite",     icon: "fa-gem",            packs: ["manacite"] },
    { id: "consumables", label: "Consumables",  icon: "fa-flask",          packs: ["consumables"] },
    { id: "species",     label: "Species",      icon: "fa-paw",            packs: ["species"] },
    { id: "bestiary",    label: "Bestiary",     icon: "fa-dragon",         packs: ["monsters"] }
  ];

  /* ─── Sort configs per tab ──────────────────────────────── */

  static SORT_OPTIONS = {
    equipment:   [{ field: "name", label: "Name" }, { field: "might", label: "Might" }, { field: "pdef", label: "PDef" }, { field: "price", label: "Price" }],
    manacite:    [{ field: "name", label: "Name" }, { field: "mpCost", label: "MP" }, { field: "baseRate", label: "Base" }],
    consumables: [{ field: "name", label: "Name" }, { field: "price", label: "Price" }],
    species:     [{ field: "name", label: "Name" }],
    bestiary:    [{ field: "name", label: "Name" }, { field: "hp", label: "HP" }]
  };

  /* ─── ApplicationV2 Options ─────────────────────────────── */

  static PARTS = {
    shell: { template: "systems/manashard/templates/apps/compendium-browser.hbs" }
  };

  static DEFAULT_OPTIONS = {
    id: "compendium-browser",
    classes: ["manashard", "compendium-browser"],
    position: { width: 880, height: 720 },
    window: {
      title: "Compendium Browser",
      resizable: true,
      icon: "fas fa-book-open"
    },
    tag: "div",
    actions: {
      switchTab:    CompendiumBrowser.#onSwitchTab,
      toggleFilter: CompendiumBrowser.#onToggleFilter,
      clearFilters: CompendiumBrowser.#onClearFilters,
      viewItem:     CompendiumBrowser.#onViewItem,
      sortResults:  CompendiumBrowser.#onSortResults
    }
  };

  /* ─── Private State ─────────────────────────────────────── */

  #activeTab = "equipment";
  #searchQuery = "";
  #filters = {};       // { [filterKey]: Set<string> }
  #sortField = "name";
  #sortDir = "asc";
  #indexCache = {};    // { [tabId]: Array<object> }

  /* ─── Singleton ─────────────────────────────────────────── */

  static #instance = null;

  static open() {
    if (!CompendiumBrowser.#instance) {
      CompendiumBrowser.#instance = new CompendiumBrowser();
    }
    CompendiumBrowser.#instance.render(true);
  }

  /* ─── Lifecycle ─────────────────────────────────────────── */

  _onClose() {
    super._onClose?.();
    CompendiumBrowser.#instance = null;
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Wire search input
    const searchInput = this.element?.querySelector('input[name="browser-search"]');
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

    // Wire drag-and-drop on result rows
    this.element?.querySelectorAll(".browser-result-row[data-uuid]").forEach(row => {
      row.addEventListener("dragstart", (e) => {
        const uuid = row.dataset.uuid;
        const type = row.dataset.docType || "Item";
        e.dataTransfer.setData("text/plain", JSON.stringify({ type, uuid }));
      });
    });
  }

  /* ─── Scroll Preservation ───────────────────────────────── */

  async #renderPreservingScroll() {
    const list = this.element?.querySelector(".browser-results-list");
    const scrollTop = list?.scrollTop ?? 0;
    await this.render(true);
    const newList = this.element?.querySelector(".browser-results-list");
    if (newList) newList.scrollTop = scrollTop;
  }

  /* ─── Index Loading ─────────────────────────────────────── */

  async #loadTabIndex(tabId) {
    if (this.#indexCache[tabId]) return this.#indexCache[tabId];

    const tabDef = CompendiumBrowser.TABS.find(t => t.id === tabId);
    const results = [];
    const fields = this.#getIndexFields(tabId);

    for (const packName of tabDef.packs) {
      const pack = game.packs.get(`manashard.${packName}`);
      if (!pack) continue;

      const index = await pack.getIndex({ fields });
      for (const entry of index) {
        const sys = entry.system ?? {};
        results.push({
          _id: entry._id,
          name: entry.name,
          img: entry.img || "icons/svg/item-bag.svg",
          uuid: `Compendium.manashard.${packName}.${pack.documentName}.${entry._id}`,
          docType: pack.documentName,
          packName,
          system: sys
        });
      }
    }

    this.#indexCache[tabId] = results;
    return results;
  }

  #getIndexFields(tabId) {
    switch (tabId) {
      case "equipment":
        return ["system.category", "system.rank", "system.damageType", "system.rangeType",
                "system.handedness", "system.might", "system.hit", "system.pdef", "system.mdef",
                "system.weight", "system.price", "system.element", "system.block"];
      case "manacite":
        return ["system.manaciteType", "system.skillType", "system.element",
                "system.mpCost", "system.baseRate", "system.baseRateMode",
                "system.damageType", "system.targetType", "system.rangeType",
                "system.minRange", "system.maxRange", "system.scalingStat"];
      case "consumables":
        return ["system.targetType", "system.price"];
      case "species":
        return ["system.size"];
      case "bestiary":
        return ["system.rank", "system.size", "system.creatureType",
                "system.stats.hp.max", "system.mov", "system.level"];
      default:
        return [];
    }
  }

  /* ─── Context Preparation ───────────────────────────────── */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const tabId = this.#activeTab;
    const cfg = CONFIG.MANASHARD;

    // Load index
    let results = await this.#loadTabIndex(tabId);

    // Build filter UI context and apply active filters
    const filterContext = {};

    if (tabId === "equipment") {
      filterContext.equipType = this.#buildFilterChoices("equipType", {
        weapon: "Weapon", armor: "Armor", accessory: "Accessory"
      });
      filterContext.rank = this.#buildFilterChoices("rank", cfg.ranks, true);
      filterContext.weaponCategory = this.#buildFilterChoices("weaponCategory", cfg.weaponCategories, true);
      filterContext.handedness = this.#buildFilterChoices("handedness", cfg.handedness, true);
      filterContext.rangeType = this.#buildFilterChoices("rangeType", cfg.rangeTypes, true);
      filterContext.element = this.#buildFilterChoices("element", cfg.elements, true);

      // Apply filters
      results = this.#applyFilter(results, "equipType", (entry) => {
        if (entry.packName === "weapons") return "weapon";
        if (entry.packName === "armor") return "armor";
        return "accessory";
      });
      results = this.#applyFilter(results, "rank", (entry) => entry.system.rank);
      results = this.#applyFilter(results, "weaponCategory", (entry) => entry.system.category);
      results = this.#applyFilter(results, "handedness", (entry) => entry.system.handedness);
      results = this.#applyFilter(results, "rangeType", (entry) => entry.system.rangeType);
      results = this.#applyFilter(results, "element", (entry) => entry.system.element);
    }

    if (tabId === "manacite") {
      filterContext.manaciteType = this.#buildFilterChoices("manaciteType", cfg.manaciteTypes, true);
      filterContext.skillType = this.#buildFilterChoices("skillType", cfg.manaciteSubTypes, true);
      filterContext.element = this.#buildFilterChoices("element", cfg.elements, true);
      filterContext.damageType = this.#buildFilterChoices("damageType", cfg.damageTypes, true);
      filterContext.targetType = this.#buildFilterChoices("targetType", cfg.targetTypes, true);
      filterContext.rangeType = this.#buildFilterChoices("rangeType", cfg.skillRangeTypes, true);

      results = this.#applyFilter(results, "manaciteType", (entry) => entry.system.manaciteType);
      results = this.#applyFilter(results, "skillType", (entry) => entry.system.skillType);
      results = this.#applyFilter(results, "element", (entry) => entry.system.element);
      results = this.#applyFilter(results, "damageType", (entry) => entry.system.damageType);
      results = this.#applyFilter(results, "targetType", (entry) => entry.system.targetType);
      results = this.#applyFilter(results, "rangeType", (entry) => entry.system.rangeType);
    }

    if (tabId === "consumables") {
      filterContext.targetType = this.#buildFilterChoices("targetType", cfg.targetTypes, true);
      results = this.#applyFilter(results, "targetType", (entry) => entry.system.targetType);
    }

    if (tabId === "bestiary") {
      filterContext.rank = this.#buildFilterChoices("rank", cfg.ranks, true);
      filterContext.creatureType = this.#buildFilterChoices("creatureType", cfg.creatureTypes, true);

      results = this.#applyFilter(results, "rank", (entry) => entry.system.rank);
      results = this.#applyFilter(results, "creatureType", (entry) => {
        const ct = entry.system.creatureType;
        return Array.isArray(ct) ? ct : [ct];
      });
    }

    // Apply text search
    const query = this.#searchQuery.trim().toLowerCase();
    if (query) {
      results = results.filter(entry => entry.name.toLowerCase().includes(query));
    }

    // Map results to display data
    results = results.map(entry => this.#mapResultDisplay(entry, tabId));

    // Sort
    results = this.#sortResults(results);

    // Build sort options
    const sortOpts = (CompendiumBrowser.SORT_OPTIONS[tabId] || []).map(opt => ({
      ...opt,
      active: this.#sortField === opt.field
    }));

    // Tabs
    context.tabs = CompendiumBrowser.TABS.map(t => ({
      ...t,
      active: t.id === tabId
    }));
    context.activeTab = tabId;
    context.results = results;
    context.resultCount = results.length;
    context.searchQuery = this.#searchQuery;
    context.filters = filterContext;
    context.sortOptions = sortOpts;
    context.sortDir = this.#sortDir;
    context.loading = false;

    return context;
  }

  /* ─── Filter Helpers ────────────────────────────────────── */

  #buildFilterChoices(filterKey, sourceObj, localize = false) {
    const active = this.#filters[filterKey] || new Set();
    return Object.entries(sourceObj).map(([key, val]) => {
      const label = localize && typeof val === "string" && val.startsWith("MANASHARD.")
        ? game.i18n.localize(val)
        : (typeof val === "object" && val.label ? game.i18n.localize(val.label) : val);
      return { key, label, active: active.has(key) };
    });
  }

  #applyFilter(results, filterKey, valueFn) {
    const active = this.#filters[filterKey];
    if (!active || active.size === 0) return results;
    return results.filter(entry => {
      const val = valueFn(entry);
      if (Array.isArray(val)) return val.some(v => active.has(v));
      return active.has(val);
    });
  }

  /* ─── Result Display Mapping ────────────────────────────── */

  #mapResultDisplay(entry, tabId) {
    const sys = entry.system;
    const base = {
      uuid: entry.uuid,
      name: entry.name,
      img: entry.img,
      docType: entry.docType
    };

    if (tabId === "equipment") {
      const typeLabel = entry.packName === "weapons" ? "Weapon"
        : entry.packName === "armor" ? "Armor" : "Accessory";
      const categoryLabel = sys.category
        ? game.i18n.localize(CONFIG.MANASHARD.weaponCategories?.[sys.category]
          || CONFIG.MANASHARD.armorCategories?.[sys.category] || "")
        : "";
      return {
        ...base, typeLabel, categoryLabel,
        rank: sys.rank,
        handedness: sys.handedness ? sys.handedness.toUpperCase() : "",
        might: sys.might, hit: sys.hit,
        pdef: sys.pdef, mdef: sys.mdef,
        block: sys.block, price: sys.price
      };
    }

    if (tabId === "manacite") {
      const mt = sys.manaciteType;
      const st = sys.skillType;
      const skillTypeLabel = st ? game.i18n.localize(CONFIG.MANASHARD.manaciteSubTypes?.[st] || "") : "";
      const elementLabel = sys.element ? game.i18n.localize(CONFIG.MANASHARD.elements?.[sys.element] || "") : "";
      const damageTypeLabel = sys.damageType ? game.i18n.localize(CONFIG.MANASHARD.damageTypes?.[sys.damageType] || "") : "";
      let rangeLabel = "";
      if (sys.rangeType && sys.rangeType !== "none") {
        rangeLabel = sys.minRange !== undefined && sys.maxRange !== undefined
          ? `${sys.minRange}-${sys.maxRange}` : sys.rangeType;
      }
      return {
        ...base, manaciteType: mt, skillType: st, skillTypeLabel,
        elementLabel, damageTypeLabel, rangeLabel,
        mpCost: sys.mpCost, baseRate: sys.baseRate
      };
    }

    if (tabId === "consumables") {
      const targetTypeLabel = sys.targetType
        ? game.i18n.localize(CONFIG.MANASHARD.targetTypes?.[sys.targetType] || "") : "";
      return { ...base, typeLabel: "Consumable", targetTypeLabel, price: sys.price };
    }

    if (tabId === "species") {
      return { ...base, size: sys.size };
    }

    if (tabId === "bestiary") {
      const creatureTypeLabel = Array.isArray(sys.creatureType)
        ? sys.creatureType.map(ct => game.i18n.localize(CONFIG.MANASHARD.creatureTypes?.[ct] || ct)).join(", ")
        : "";
      return {
        ...base,
        rank: sys.rank,
        creatureTypeLabel,
        hp: sys.stats?.hp?.max,
        mov: sys.mov
      };
    }

    return base;
  }

  /* ─── Sorting ───────────────────────────────────────────── */

  #sortResults(results) {
    const field = this.#sortField;
    const dir = this.#sortDir === "asc" ? 1 : -1;
    return results.sort((a, b) => {
      const va = a[field] ?? "";
      const vb = b[field] ?? "";
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }

  /* ─── Action Handlers ───────────────────────────────────── */

  static #onSwitchTab(event, target) {
    const tabId = target.dataset.tab;
    if (!tabId || tabId === this.#activeTab) return;
    this.#activeTab = tabId;
    this.#searchQuery = "";
    this.#filters = {};
    this.#sortField = "name";
    this.#sortDir = "asc";
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

  static async #onViewItem(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid ?? target.dataset.uuid;
    if (!uuid) return;
    const doc = await fromUuid(uuid);
    if (doc) doc.sheet.render(true);
  }

  static #onSortResults(event, target) {
    const field = target.dataset.sortField;
    if (!field) return;
    if (this.#sortField === field) {
      this.#sortDir = this.#sortDir === "asc" ? "desc" : "asc";
    } else {
      this.#sortField = field;
      this.#sortDir = "asc";
    }
    this.#renderPreservingScroll();
  }
}

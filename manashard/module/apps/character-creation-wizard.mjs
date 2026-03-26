const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
import { PortraitAdjuster } from "./portrait-adjuster.mjs";

/**
 * Character Creation Wizard — a multi-step guided flow for building a new character.
 * All choices are stored internally until the player confirms on the final Summary step.
 */
export class CharacterCreationWizard extends HandlebarsApplicationMixin(ApplicationV2) {

  /** Step definitions */
  static STEPS = [
    { id: "name",      label: "MANASHARD.Wizard.StepName",      icon: "fa-signature" },
    { id: "species",   label: "MANASHARD.Wizard.StepSpecies",   icon: "fa-paw" },
    { id: "job",       label: "MANASHARD.Wizard.StepJob",       icon: "fa-briefcase" },
    { id: "skills",    label: "MANASHARD.Wizard.StepSkills",    icon: "fa-wand-sparkles" },
    { id: "stats",     label: "MANASHARD.Wizard.StepStats",     icon: "fa-chart-bar" },
    { id: "growth",    label: "MANASHARD.Wizard.StepGrowth",    icon: "fa-arrow-trend-up" },
    { id: "equipment", label: "MANASHARD.Wizard.StepEquipment", icon: "fa-shield-halved" },
    { id: "biography", label: "MANASHARD.Wizard.StepBio",       icon: "fa-book-open" },
    { id: "summary",   label: "MANASHARD.Wizard.StepSummary",   icon: "fa-clipboard-check" }
  ];

  static PARTS = {
    shell: { template: "systems/manashard/templates/apps/wizard/wizard-shell.hbs" }
  };

  static DEFAULT_OPTIONS = {
    id: "character-creation-wizard-{id}",
    classes: ["manashard", "character-creation-wizard"],
    position: { width: 740, height: 680 },
    window: {
      title: "MANASHARD.Wizard.Title",
      resizable: true
    },
    tag: "div",
    actions: {
      nextStep: CharacterCreationWizard.#onNextStep,
      prevStep: CharacterCreationWizard.#onPrevStep,
      goToStep: CharacterCreationWizard.#onGoToStep,
      editPortrait: CharacterCreationWizard.#onEditPortrait,
      selectSpecies: CharacterCreationWizard.#onSelectSpecies,
      selectJob: CharacterCreationWizard.#onSelectJob,
      adjustStat: CharacterCreationWizard.#onAdjustStat,
      adjustGrowth: CharacterCreationWizard.#onAdjustGrowth,
      addToCart: CharacterCreationWizard.#onAddToCart,
      removeFromCart: CharacterCreationWizard.#onRemoveFromCart,
      selectSkill: CharacterCreationWizard.#onSelectSkill,
      filterSkills: CharacterCreationWizard.#onFilterSkills,
      filterSkillElement: CharacterCreationWizard.#onFilterSkillElement,
      confirmCreate: CharacterCreationWizard.#onConfirmCreate,
      viewItem: CharacterCreationWizard.#onViewItem,
      filterShop: CharacterCreationWizard.#onFilterShop,
      filterShopSub: CharacterCreationWizard.#onFilterShopSub,
      sortShop: CharacterCreationWizard.#onSortShop
    }
  };

  /** Internal wizard state — NOT written to actor until final confirm */
  #wizardState;

  /** Scroll position to restore after re-render */
  #pendingScrollTop = null;

  /** Cached compendium data */
  #speciesCache = null;
  #jobCache = null;
  #skillCache = null;
  #equipmentCache = null;

  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;

    // Initialize state — pre-fill from actor if it has data
    const sys = actor.system;
    const mins = CONFIG.MANASHARD.statMinimums;
    const hasCustomStats = Object.keys(mins).some(k => (sys.stats?.[k]?.value ?? 0) > (mins[k] ?? 0));

    this.#wizardState = {
      step: 0,
      name: actor.name !== "New Character" ? actor.name : "",
      img: actor.img || "icons/svg/mystery-man.svg",
      portraitOffsetX: sys.portraitOffsetX ?? 50,
      portraitOffsetY: sys.portraitOffsetY ?? 0,
      portraitMirrored: sys.portraitMirrored ?? false,
      speciesUuid: null,
      speciesData: null,
      jobUuid: null,
      jobData: null,
      selectedSkills: [],     // [{ uuid, data }] — free skill picks (base + unconstrained bonus)
      constrainedSlots: [],   // [{ label, allowedUuids, choiceItems, pick: null|{uuid,data} }]
      maxSkillPicks: 1,       // 1 base + N from species GrantItem choice rules (unconstrained only)
      skillTypeFilter: "all",
      skillElementFilter: "all",
      skillSearchQuery: "",
      stats: hasCustomStats
        ? Object.fromEntries(Object.keys(mins).map(k => [k, sys.stats[k]?.value ?? mins[k]]))
        : { ...mins },
      growthRates: Object.fromEntries(
        Object.keys(mins).map(k => [k, sys.stats?.[k]?.growth ?? (game.settings.get("manashard", "creationGrowthBaseline") ?? CONFIG.MANASHARD.growthRateBaseline)])
      ),
      eiress: game.settings.get("manashard", "creationStartingEiress") ?? CONFIG.MANASHARD.startingEiress,
      cart: [],
      biography: sys.biography || "",
      shopCategoryFilter: "all",
      shopSubFilter: "all",
      shopSort: "name",
      shopSearchQuery: ""
    };

    // Pre-fill species/job from existing equipped items
    const equippedSpecies = actor.items?.find(i => i.type === "species");
    if (equippedSpecies) {
      this.#wizardState.speciesUuid = equippedSpecies.uuid;
      this.#wizardState.speciesData = equippedSpecies;
    }
    const equippedJob = actor.items?.find(i => i.type === "manacite" && i.system.manaciteType === "job" && i.system.equipped);
    if (equippedJob) {
      this.#wizardState.jobUuid = equippedJob.uuid;
      this.#wizardState.jobData = equippedJob;
    }
  }

  /** Save scroll position and re-render, restoring scroll after. */
  #renderPreservingScroll() {
    const scrollEl = this.element?.querySelector(".wizard-step-content");
    if (scrollEl) this.#pendingScrollTop = scrollEl.scrollTop;
    this.render();
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    if (this.#pendingScrollTop != null) {
      const scrollEl = this.element?.querySelector(".wizard-step-content");
      if (scrollEl) scrollEl.scrollTop = this.#pendingScrollTop;
      this.#pendingScrollTop = null;
    }

    // Bind skill search input (live filtering without full re-render)
    const searchInput = this.element?.querySelector('input[name="skill-search"]');
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.#wizardState.skillSearchQuery = e.target.value;
        this.#renderPreservingScroll();
      });
      // Restore focus to search input after re-render
      if (this.#wizardState.skillSearchQuery) {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      }
    }

    // Bind stat label hover tooltips
    for (const label of this.element.querySelectorAll(".stat-label[data-stat-key]")) {
      label.addEventListener("mouseenter", (e) => this.#showStatTooltip(e, label));
      label.addEventListener("mouseleave", () => this.#hideStatTooltip());
    }

    // Bind shop search input
    const shopSearchInput = this.element?.querySelector('input[name="shop-search"]');
    if (shopSearchInput) {
      shopSearchInput.addEventListener("input", (e) => {
        this.#wizardState.shopSearchQuery = e.target.value;
        this.#renderPreservingScroll();
      });
      if (this.#wizardState.shopSearchQuery) {
        shopSearchInput.focus();
        shopSearchInput.setSelectionRange(shopSearchInput.value.length, shopSearchInput.value.length);
      }
    }
  }

  /* -------------------------------------------- */
  /*  Stat Hover Tooltip                            */
  /* -------------------------------------------- */

  static #STAT_DESCRIPTIONS = {
    hp:  "MANASHARD.StatsDesc.HP",
    mp:  "MANASHARD.StatsDesc.MP",
    str: "MANASHARD.StatsDesc.STR",
    agi: "MANASHARD.StatsDesc.AGI",
    mag: "MANASHARD.StatsDesc.MAG",
    end: "MANASHARD.StatsDesc.END",
    spi: "MANASHARD.StatsDesc.SPI",
    luk: "MANASHARD.StatsDesc.LUK",
    int: "MANASHARD.StatsDesc.INT",
    chm: "MANASHARD.StatsDesc.CHM"
  };

  #showStatTooltip(event, el) {
    this.#hideStatTooltip();
    const key = el.dataset.statKey;
    const descKey = CharacterCreationWizard.#STAT_DESCRIPTIONS[key];
    if (!descKey) return;

    const name = game.i18n.localize(CONFIG.MANASHARD.stats[key]);
    const desc = game.i18n.localize(descKey);

    const tooltip = document.createElement("div");
    tooltip.classList.add("ms-info-tooltip");
    tooltip.innerHTML = `<div style="margin-bottom:2px;"><strong>${name}</strong></div><div style="font-size:11px;color:#8ab4c0;">${desc}</div>`;

    const container = this.element.querySelector(".window-content") ?? this.element;
    container.appendChild(tooltip);

    const rect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const ttRect = tooltip.getBoundingClientRect();

    let top = rect.bottom - containerRect.top + 6;
    if (top + ttRect.height > containerRect.height) {
      top = rect.top - containerRect.top - ttRect.height - 6;
    }
    let left = rect.left - containerRect.left;
    if (left + ttRect.width > containerRect.width) {
      left = containerRect.width - ttRect.width - 4;
    }

    tooltip.style.position = "absolute";
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${Math.max(0, left)}px`;
    tooltip.style.zIndex = "200";
  }

  #hideStatTooltip() {
    (this.element.querySelector(".window-content") ?? this.element)
      .querySelector(".ms-info-tooltip")?.remove();
  }

  /* -------------------------------------------- */
  /*  Context Preparation                          */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const state = this.#wizardState;
    const step = state.step;

    // Step metadata for progress bar
    context.steps = CharacterCreationWizard.STEPS.map((s, i) => ({
      ...s,
      label: game.i18n.localize(s.label),
      index: i,
      active: i === step,
      completed: i < step,
      reachable: i <= step,
      cssClass: i === step ? "active" : i < step ? "completed" : "upcoming"
    }));

    // Navigation state
    context.showPrev = step > 0;
    context.showNext = step < CharacterCreationWizard.STEPS.length - 1;
    context.showConfirm = step === CharacterCreationWizard.STEPS.length - 1;
    context.canAdvance = this.#canAdvanceFromStep(step);

    // Render current step content
    context.stepContent = await this.#renderStepContent(step);

    return context;
  }

  /* -------------------------------------------- */
  /*  Step Content Rendering                       */
  /* -------------------------------------------- */

  async #renderStepContent(step) {
    const state = this.#wizardState;
    const stepId = CharacterCreationWizard.STEPS[step].id;
    const templatePath = `systems/manashard/templates/apps/wizard/step-${stepId}.hbs`;

    let stepContext = {};

    switch (stepId) {
      case "name":
        stepContext = {
          name: state.name,
          img: state.img,
          portraitOffsetX: state.portraitOffsetX,
          portraitOffsetY: state.portraitOffsetY,
          portraitMirrored: state.portraitMirrored
        };
        break;

      case "species": {
        if (!this.#speciesCache) this.#speciesCache = await this.#loadCompendiumItems("species", "species");
        const excludedSpecies = this.#parseExclusionList(game.settings.get("manashard", "creationExcludedSpecies"));
        const filteredSpecies = this.#speciesCache.filter(s => !excludedSpecies.has(s.uuid));
        filteredSpecies.sort((a, b) => a.name.localeCompare(b.name));
        stepContext = {
          candidates: filteredSpecies,
          selectedUuid: state.speciesUuid,
          isEmpty: filteredSpecies.length === 0
        };
        break;
      }

      case "job": {
        if (!this.#jobCache) this.#jobCache = await this.#loadJobManacite();
        const excludedJobs = this.#parseExclusionList(game.settings.get("manashard", "creationExcludedJobs"));
        const filteredJobs = this.#jobCache.filter(j => !excludedJobs.has(j.uuid));
        filteredJobs.sort((a, b) => a.name.localeCompare(b.name));
        stepContext = {
          candidates: filteredJobs,
          selectedUuid: state.jobUuid,
          isEmpty: filteredJobs.length === 0,
          config: CONFIG.MANASHARD
        };
        break;
      }

      case "skills":
        if (!this.#skillCache) this.#skillCache = await this.#loadSkillManacite();
        stepContext = this.#prepareSkillContext();
        break;

      case "stats":
        stepContext = this.#prepareStatContext(state.stats, game.settings.get("manashard", "creationStatPool") ?? CONFIG.MANASHARD.statPointPool, CONFIG.MANASHARD.statMinimums, CONFIG.MANASHARD.rankStatCaps.f);
        break;

      case "growth":
        stepContext = this.#prepareGrowthContext();
        break;

      case "equipment":
        if (!this.#equipmentCache) this.#equipmentCache = await this.#loadEquipmentItems();
        stepContext = this.#prepareEquipmentContext();
        break;

      case "biography":
        stepContext = { biography: state.biography };
        break;

      case "summary":
        stepContext = this.#prepareSummaryContext();
        break;
    }

    return foundry.applications.handlebars.renderTemplate(templatePath, stepContext);
  }

  #prepareStatContext(stats, pool, mins, caps) {
    const minsTotal = Object.values(mins).reduce((sum, v) => sum + v, 0);
    const allocated = Object.values(stats).reduce((sum, v) => sum + v, 0);
    const spent = allocated - minsTotal;
    const remaining = pool - spent;
    const rows = Object.entries(stats).map(([key, value]) => ({
      key,
      label: game.i18n.localize(CONFIG.MANASHARD.stats[key]),
      abbr: game.i18n.localize(CONFIG.MANASHARD.statAbbreviations[key]),
      value,
      min: mins[key],
      max: caps[key],
      barWidth: Math.round((value / caps[key]) * 100),
      canIncrease: value < caps[key] && remaining > 0,
      canDecrease: value > mins[key]
    }));
    return { rows, remaining, pool, isComplete: remaining === 0 };
  }

  #prepareGrowthContext() {
    const state = this.#wizardState;
    const pool = game.settings.get("manashard", "creationGrowthPool") ?? CONFIG.MANASHARD.growthRatePool;
    const baseline = game.settings.get("manashard", "creationGrowthBaseline") ?? CONFIG.MANASHARD.growthRateBaseline;
    const creationCaps = CONFIG.MANASHARD.creationGrowthCaps;
    const baselineTotal = Object.keys(state.growthRates).length * baseline;
    const allocated = Object.values(state.growthRates).reduce((sum, v) => sum + v, 0);
    const spent = allocated - baselineTotal;
    const remaining = pool - spent;
    const rows = Object.entries(state.growthRates).map(([key, value]) => {
      const cap = creationCaps[key] ?? 60;
      return {
        key,
        label: game.i18n.localize(CONFIG.MANASHARD.stats[key]),
        abbr: game.i18n.localize(CONFIG.MANASHARD.statAbbreviations[key]),
        value,
        min: baseline,
        max: cap,
        barWidth: Math.round((value / cap) * 100),
        canIncrease: value < cap && remaining > 0,
        canDecrease: value > baseline
      };
    });
    return { rows, remaining, pool, isComplete: remaining === 0 };
  }

  #prepareSkillContext() {
    const state = this.#wizardState;
    const selectedUuids = new Set(state.selectedSkills.map(s => s.uuid));

    // Collect skill UUIDs that are fixed (non-choice) grants from species and job
    const grantedUuids = new Set();
    for (const source of [state.speciesData, state.jobData]) {
      for (const r of source?.system?.rules ?? []) {
        if (r.choiceMode) continue;
        const isGrant = (r.key === "Grant" && r.subtype === "item") || r.key === "GrantItem";
        if (isGrant && r.uuid) grantedUuids.add(r.uuid);
      }
    }

    const allSkills = (this.#skillCache || []).filter(s =>
      s.system.manaciteType === "skill" && !grantedUuids.has(s.uuid)
    );

    // Apply type filter
    let filtered = allSkills;
    if (state.skillTypeFilter !== "all") {
      filtered = filtered.filter(s => s.system.skillType === state.skillTypeFilter);
    }

    // Apply element filter
    if (state.skillElementFilter !== "all") {
      filtered = filtered.filter(s => (s.system.element || "") === state.skillElementFilter);
    }

    // Apply search query
    const query = (state.skillSearchQuery || "").trim().toLowerCase();
    if (query) {
      filtered = filtered.filter(s => s.name.toLowerCase().includes(query));
    }

    // Sort: selected first, then alphabetically
    filtered.sort((a, b) => {
      const aSelected = selectedUuids.has(a.uuid);
      const bSelected = selectedUuids.has(b.uuid);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      return a.name.localeCompare(b.name);
    });

    // Strip HTML tags for plain-text tooltip
    const stripHtml = (html) => {
      if (!html) return "";
      return html.replace(/<[^>]*>/g, "").trim();
    };

    // Map to display objects
    const skills = filtered.map(skill => ({
      uuid: skill.uuid,
      name: skill.name,
      img: skill.img,
      skillType: skill.system.skillType,
      element: skill.system.element || null,
      mpCost: skill.system.mpCost ?? 0,
      rangeDisplay: skill.system.rangeDisplay,
      damageType: skill.system.damageType || "",
      targetType: skill.system.targetType || "single",
      unlockRequirements: skill.system.unlockRequirements || "",
      hasPrerequisites: !!(skill.system.unlockRequirements?.trim()),
      selected: selectedUuids.has(skill.uuid),
      description: stripHtml(skill.system.description)
    }));

    // Collect unique elements present in the full (unfiltered) skill list for filter buttons
    const elementSet = new Set();
    for (const s of allSkills) {
      if (s.system.element) elementSet.add(s.system.element);
    }
    const elements = [...elementSet].sort().map(key => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      active: state.skillElementFilter === key
    }));

    // Build constrained slot display data
    const constrainedSlots = (state.constrainedSlots || []).map((slot, slotIdx) => {
      const items = (slot.choiceItems || []).map(ci => {
        const cached = this.#skillCache?.find(d => d.uuid === ci.uuid);
        return {
          uuid: ci.uuid,
          name: cached?.name || ci.name,
          img: cached?.img || ci.img || "icons/svg/item-bag.svg",
          type: ci.type ?? "Item",
          selected: slot.pick?.uuid === ci.uuid,
          slotIdx
        };
      });
      return {
        label: slot.label,
        items,
        hasPick: !!slot.pick,
        slotIdx
      };
    });

    // Total picks = free picks + constrained picks
    const constrainedPickCount = (state.constrainedSlots || []).filter(s => s.pick).length;
    const totalPicksUsed = state.selectedSkills.length + constrainedPickCount;
    const totalPicksMax = state.maxSkillPicks + (state.constrainedSlots || []).length;

    return {
      skills,
      filteredCount: skills.length,
      singleResult: skills.length === 1,
      isEmpty: allSkills.length === 0 && constrainedSlots.length === 0,
      searchQuery: state.skillSearchQuery || "",
      activeTypeFilter: state.skillTypeFilter,
      activeElementFilter: state.skillElementFilter,
      elements,
      picksUsed: totalPicksUsed,
      picksMax: totalPicksMax,
      constrainedSlots,
      hasConstrainedSlots: constrainedSlots.length > 0
    };
  }

  /** Rank order for filtering comparisons. */
  static RANK_ORDER = ["f", "e", "d", "c", "b", "a", "s"];

  #prepareEquipmentContext() {
    const state = this.#wizardState;
    const cache = this.#equipmentCache;
    const spent = state.cart.reduce((sum, item) => sum + item.price, 0);
    const remaining = state.eiress - spent;

    // Filter based on max equipment rank setting
    const maxRank = game.settings.get("manashard", "creationMaxEquipRank") || "f";
    const maxIdx = CharacterCreationWizard.RANK_ORDER.indexOf(maxRank);
    const rankFilter = (item) => {
      const itemRank = item.system.rank || "f";
      return CharacterCreationWizard.RANK_ORDER.indexOf(itemRank) <= maxIdx;
    };

    let weapons = cache.weapons.filter(rankFilter);
    let armors = cache.armors.filter(rankFilter);
    let accessories = cache.accessories.filter(rankFilter);

    // Apply search query
    const query = (state.shopSearchQuery || "").trim().toLowerCase();
    if (query) {
      const match = (item) => item.name.toLowerCase().includes(query);
      weapons = weapons.filter(match);
      armors = armors.filter(match);
      accessories = accessories.filter(match);
    }

    // Counts before category/sub filter for tab counts
    const weaponCount = weapons.length;
    const armorCount = armors.length;
    const accessoryCount = accessories.length;

    // Apply main category filter
    const catFilter = state.shopCategoryFilter || "all";
    if (catFilter !== "all") {
      if (catFilter !== "weapon") weapons = [];
      if (catFilter !== "armor") armors = [];
      if (catFilter !== "accessory") accessories = [];
    }

    // Build sub-filter options from the active category's items
    const subFilters = [];
    const subFilter = state.shopSubFilter || "all";
    if (catFilter === "weapon") {
      const cats = new Set(weapons.map(w => w.system.category).filter(Boolean));
      for (const key of [...cats].sort()) {
        const locKey = CONFIG.MANASHARD.weaponCategories[key];
        subFilters.push({ key, label: locKey ? game.i18n.localize(locKey) : key, active: subFilter === key });
      }
      if (subFilter !== "all") weapons = weapons.filter(w => w.system.category === subFilter);
    } else if (catFilter === "armor") {
      const cats = new Set(armors.map(a => a.system.category).filter(Boolean));
      for (const key of [...cats].sort()) {
        const locKey = CONFIG.MANASHARD.armorCategories[key];
        subFilters.push({ key, label: locKey ? game.i18n.localize(locKey) : key, active: subFilter === key });
      }
      if (subFilter !== "all") armors = armors.filter(a => a.system.category === subFilter);
    }

    // Sort items
    const sortKey = state.shopSort || "name";
    const sortFn = (a, b) => {
      switch (sortKey) {
        case "price": return (a.system.price ?? 0) - (b.system.price ?? 0);
        case "weight": return (a.system.weight ?? 0) - (b.system.weight ?? 0);
        case "might": return (b.system.might ?? 0) - (a.system.might ?? 0);
        case "pdef": return (b.system.pdef ?? 0) - (a.system.pdef ?? 0);
        case "mdef": return (b.system.mdef ?? 0) - (a.system.mdef ?? 0);
        default: return a.name.localeCompare(b.name);
      }
    };
    weapons.sort(sortFn);
    armors.sort(sortFn);
    accessories.sort(sortFn);

    // Strip HTML tags for plain-text tooltip
    const stripHtml = (html) => {
      if (!html) return "";
      return html.replace(/<[^>]*>/g, "").trim();
    };

    // Build plain objects for Handlebars (Documents don't spread cleanly)
    const markAffordable = (items) => items.map(item => ({
      uuid: item.uuid,
      name: item.name,
      img: item.img,
      price: item.system.price ?? 0,
      itemType: item.type,
      canAfford: (item.system.price ?? 0) <= remaining,
      inCart: state.cart.some(c => c.uuid === item.uuid),
      description: stripHtml(item.system.description),
      category: item.system.category || "",
      special: item.system.special || "",
      might: item.system.might ?? null,
      hit: item.system.hit ?? null,
      pdef: item.system.pdef ?? null,
      mdef: item.system.mdef ?? null,
      weight: item.system.weight ?? null
    }));

    const w = markAffordable(weapons);
    const a = markAffordable(armors);
    const acc = markAffordable(accessories);

    // Determine which sort options are relevant for the current category
    const sortOptions = [{ key: "name", label: "Name", active: sortKey === "name" }];
    sortOptions.push({ key: "price", label: "Price", active: sortKey === "price" });
    if (catFilter === "all" || catFilter === "weapon") {
      sortOptions.push({ key: "might", label: "Might", active: sortKey === "might" });
    }
    if (catFilter === "all" || catFilter === "armor") {
      sortOptions.push({ key: "pdef", label: "P.DEF", active: sortKey === "pdef" });
      sortOptions.push({ key: "mdef", label: "M.DEF", active: sortKey === "mdef" });
    }
    sortOptions.push({ key: "weight", label: "Weight", active: sortKey === "weight" });

    // Weight monitor: sum cart item weights and compute carrying capacity from stats
    const cartWeight = state.cart.reduce((sum, item) => sum + (item.weight ?? 0), 0);
    const strStat = state.stats?.str ?? 0;
    const endStat = state.stats?.end ?? 0;
    const carryingCapacity = 10 + strStat + Math.floor(endStat / 2);
    const overencumbered = cartWeight > carryingCapacity;

    return {
      weapons: w,
      armors: a,
      accessories: acc,
      allCount: weaponCount + armorCount + accessoryCount,
      weaponCount,
      armorCount,
      accessoryCount,
      cart: state.cart,
      eiressRemaining: remaining,
      eiressTotal: state.eiress,
      eiressSpent: spent,
      cartWeight,
      carryingCapacity,
      overencumbered,
      isEmpty: weaponCount === 0 && armorCount === 0 && accessoryCount === 0,
      hasJob: !!state.jobData,
      activeCategoryFilter: catFilter,
      activeSubFilter: subFilter,
      subFilters,
      hasSubFilters: subFilters.length > 1,
      sortOptions,
      activeSort: sortKey,
      searchQuery: state.shopSearchQuery || ""
    };
  }

  #prepareSummaryContext() {
    const state = this.#wizardState;
    const spent = state.cart.reduce((sum, item) => sum + item.price, 0);
    const statRows = Object.entries(state.stats).map(([key, value]) => ({
      abbr: game.i18n.localize(CONFIG.MANASHARD.statAbbreviations[key]),
      value
    }));
    const growthRows = Object.entries(state.growthRates).map(([key, value]) => ({
      abbr: game.i18n.localize(CONFIG.MANASHARD.statAbbreviations[key]),
      value: `${value}%`
    }));
    return {
      name: state.name,
      img: state.img,
      portraitOffsetX: state.portraitOffsetX,
      portraitOffsetY: state.portraitOffsetY,
      portraitMirrored: state.portraitMirrored,
      speciesName: state.speciesData?.name || "None",
      speciesImg: state.speciesData?.img || null,
      jobName: state.jobData?.name || "None",
      jobImg: state.jobData?.img || null,
      skillName: [
        ...state.selectedSkills.map(s => s.data?.name),
        ...(state.constrainedSlots || []).filter(s => s.pick).map(s => s.pick.data?.name)
      ].filter(Boolean).join(", ") || "None",
      skillImg: state.selectedSkills[0]?.data?.img || (state.constrainedSlots || []).find(s => s.pick)?.pick?.data?.img || null,
      statRows,
      growthRows,
      cart: state.cart,
      eiressSpent: spent,
      eiressRemaining: state.eiress - spent,
      biography: state.biography,
      hasBiography: state.biography.trim().length > 0
    };
  }

  /* -------------------------------------------- */
  /*  Compendium Loading                           */
  /* -------------------------------------------- */

  async #loadCompendiumItems(packName, itemType) {
    const pack = game.packs.get(`manashard.${packName}`);
    if (!pack) return [];
    const docs = await pack.getDocuments();
    return docs.filter(d => d.type === itemType);
  }

  /**
   * Parse a comma-separated UUID exclusion list into a Set.
   * @param {string} str
   * @returns {Set<string>}
   */
  #parseExclusionList(str) {
    if (!str) return new Set();
    return new Set(str.split(",").map(s => s.trim()).filter(Boolean));
  }

  async #loadJobManacite() {
    const pack = game.packs.get("manashard.manacite");
    if (!pack) return [];
    const docs = await pack.getDocuments();
    return docs.filter(d => d.type === "manacite" && d.system.manaciteType === "job");
  }

  async #loadSkillManacite() {
    const results = [];
    // Check all packs that may contain manacite items (system + world compendiums)
    for (const pack of game.packs) {
      if (pack.documentName !== "Item") continue;
      const docs = await pack.getDocuments();
      for (const doc of docs) {
        if (doc.type === "manacite" && doc.system.manaciteType === "skill") {
          results.push(doc);
        }
      }
    }
    return results;
  }

  async #loadEquipmentItems() {
    const [weapons, armors, accessories] = await Promise.all([
      this.#loadCompendiumItems("weapons", "weapon"),
      this.#loadCompendiumItems("armor", "armor"),
      this.#loadCompendiumItems("accessories", "accessory")
    ]);
    return { weapons, armors, accessories };
  }

  /* -------------------------------------------- */
  /*  Validation                                   */
  /* -------------------------------------------- */

  #canAdvanceFromStep(step) {
    const state = this.#wizardState;
    const stepId = CharacterCreationWizard.STEPS[step]?.id;
    switch (stepId) {
      case "name": return state.name.trim().length > 0;
      case "species": return true;   // Species optional
      case "job": return true;       // Job optional
      case "skills": return true;    // Skill optional
      case "stats": {
        const allocated = Object.values(state.stats).reduce((sum, v) => sum + v, 0);
        const minsTotal = Object.values(CONFIG.MANASHARD.statMinimums).reduce((sum, v) => sum + v, 0);
        const statPool = game.settings.get("manashard", "creationStatPool") ?? CONFIG.MANASHARD.statPointPool;
        return (allocated - minsTotal) === statPool;
      }
      case "growth": {
        const allocated = Object.values(state.growthRates).reduce((sum, v) => sum + v, 0);
        const growthBaseline = game.settings.get("manashard", "creationGrowthBaseline") ?? CONFIG.MANASHARD.growthRateBaseline;
        const baselineTotal = Object.keys(state.growthRates).length * growthBaseline;
        const growthPool = game.settings.get("manashard", "creationGrowthPool") ?? CONFIG.MANASHARD.growthRatePool;
        return (allocated - baselineTotal) === growthPool;
      }
      case "equipment": return true;  // Equipment optional
      case "biography": return true;  // Bio optional
      case "summary": return true;    // Summary always confirmable
      default: return false;
    }
  }

  /* -------------------------------------------- */
  /*  Action Handlers                              */
  /* -------------------------------------------- */

  static async #onNextStep(event, target) {
    const state = this.#wizardState;
    if (!this.#canAdvanceFromStep(state.step)) return;

    // Capture current step inputs before advancing
    this.#captureStepInputs();

    if (state.step < CharacterCreationWizard.STEPS.length - 1) {
      state.step++;
      this.render();
    }
  }

  static async #onPrevStep(event, target) {
    this.#captureStepInputs();
    if (this.#wizardState.step > 0) {
      this.#wizardState.step--;
      this.render();
    }
  }

  static async #onGoToStep(event, target) {
    const stepIndex = parseInt(target.dataset.step);
    if (isNaN(stepIndex) || stepIndex < 0 || stepIndex >= CharacterCreationWizard.STEPS.length) return;
    // Only allow navigating to completed or current steps
    if (stepIndex > this.#wizardState.step) return;
    this.#captureStepInputs();
    this.#wizardState.step = stepIndex;
    this.render();
  }

  /** Capture text inputs from the current step before navigation */
  #captureStepInputs() {
    const state = this.#wizardState;
    const stepId = CharacterCreationWizard.STEPS[state.step].id;
    const el = this.element;
    if (!el) return;

    if (stepId === "name") {
      const nameInput = el.querySelector('input[name="wizard-name"]');
      if (nameInput) state.name = nameInput.value;
    }
    if (stepId === "biography") {
      const bioInput = el.querySelector('textarea[name="wizard-biography"]');
      if (bioInput) state.biography = bioInput.value;
    }
  }

  static async #onEditPortrait(event, target) {
    const state = this.#wizardState;
    const result = await PortraitAdjuster.open({
      img: state.img,
      offsetX: state.portraitOffsetX,
      offsetY: state.portraitOffsetY,
      mirrored: state.portraitMirrored
    });
    if (!result) return;
    state.img = result.img;
    state.portraitOffsetX = result.offsetX;
    state.portraitOffsetY = result.offsetY;
    state.portraitMirrored = result.mirrored;
    this.render();
  }

  static async #onSelectSpecies(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    if (!uuid) return;

    if (this.#wizardState.speciesUuid === uuid) {
      // Deselect
      this.#wizardState.speciesUuid = null;
      this.#wizardState.speciesData = null;
    } else {
      const doc = this.#speciesCache?.find(d => d.uuid === uuid);
      this.#wizardState.speciesUuid = uuid;
      this.#wizardState.speciesData = doc || null;
    }
    await this.#recalcBonusSkillSlots();
    this.#renderPreservingScroll();
  }

  static async #onSelectJob(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    if (!uuid) return;

    if (this.#wizardState.jobUuid === uuid) {
      this.#wizardState.jobUuid = null;
      this.#wizardState.jobData = null;
    } else {
      const doc = this.#jobCache?.find(d => d.uuid === uuid);
      this.#wizardState.jobUuid = uuid;
      this.#wizardState.jobData = doc || null;
    }
    // Clear equipment cache since filtering may change
    this.#equipmentCache = null;
    this.#renderPreservingScroll();
  }

  static async #onSelectSkill(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    if (!uuid) return;

    const state = this.#wizardState;
    const doc = this.#skillCache?.find(d => d.uuid === uuid);

    // Check if this is a constrained slot pick
    const slotIdx = Number(target.closest("[data-uuid]")?.dataset.constrainedSlot ?? -1);
    if (slotIdx >= 0) {
      const slot = state.constrainedSlots[slotIdx];
      if (!slot) return;
      // Toggle: deselect if already picked, otherwise select
      if (slot.pick?.uuid === uuid) {
        slot.pick = null;
      } else {
        slot.pick = { uuid, data: doc || null };
      }
      this.#renderPreservingScroll();
      return;
    }

    // Free pick logic
    const existingIdx = state.selectedSkills.findIndex(s => s.uuid === uuid);

    if (existingIdx >= 0) {
      // Deselect
      state.selectedSkills.splice(existingIdx, 1);
    } else {
      // Check if we've hit the free pick limit
      if (state.selectedSkills.length >= state.maxSkillPicks) {
        ui.notifications.warn(`You can only select ${state.maxSkillPicks} skill(s).`);
        return;
      }
      state.selectedSkills.push({ uuid, data: doc || null });
    }
    this.#renderPreservingScroll();
  }

  static #onFilterSkills(event, target) {
    this.#wizardState.skillTypeFilter = target.dataset.filterType || "all";
    this.#renderPreservingScroll();
  }

  static #onFilterSkillElement(event, target) {
    this.#wizardState.skillElementFilter = target.dataset.filterElement || "all";
    this.#renderPreservingScroll();
  }

  /**
   * Recalculate max skill picks based on the currently selected species.
   * Counts GrantItem choiceMode rules on the species and its innate skills.
   * Custom-list choice rules become constrained slots; filtered/legacy choices become free bonus picks.
   */
  async #recalcBonusSkillSlots() {
    const state = this.#wizardState;
    const species = state.speciesData;

    if (!species) {
      state.maxSkillPicks = 1;
      state.constrainedSlots = [];
      if (state.selectedSkills.length > 1) {
        state.selectedSkills.length = 1;
      }
      return;
    }

    let unconstrainedBonusCount = 0;
    const constrainedSlots = [];
    const rules = species.system?.rules ?? [];

    for (const r of rules) {
      const isItemChoice = ((r.key === "Grant" && r.subtype === "item") || r.key === "GrantItem") && r.choiceMode;
      if (!isItemChoice) continue;

      if (r.choiceMode === "custom" && r.choiceItems?.length) {
        constrainedSlots.push({
          label: r.label || "Species Bonus Skill",
          allowedUuids: r.choiceItems.map(ci => ci.uuid),
          choiceItems: r.choiceItems,
          pick: null
        });
      } else {
        unconstrainedBonusCount++;
      }
    }

    state.constrainedSlots = constrainedSlots;
    state.maxSkillPicks = 1 + unconstrainedBonusCount;

    // Trim free selections if new max is lower
    if (state.selectedSkills.length > state.maxSkillPicks) {
      state.selectedSkills.length = state.maxSkillPicks;
    }
  }

  static async #onAdjustStat(event, target) {
    const stat = target.dataset.stat;
    const delta = parseInt(target.dataset.delta);
    if (!stat || isNaN(delta)) return;

    const state = this.#wizardState;
    const caps = CONFIG.MANASHARD.rankStatCaps.f;
    const mins = CONFIG.MANASHARD.statMinimums;
    const current = state.stats[stat];
    const newVal = current + delta;

    if (newVal < mins[stat] || newVal > caps[stat]) return;

    const allocated = Object.values(state.stats).reduce((sum, v) => sum + v, 0);
    const minsTotal = Object.values(mins).reduce((sum, v) => sum + v, 0);
    const statPool = game.settings.get("manashard", "creationStatPool") ?? CONFIG.MANASHARD.statPointPool;
    if (delta > 0 && (allocated - minsTotal) >= statPool) return;

    state.stats[stat] = newVal;
    this.#renderPreservingScroll();
  }

  static async #onAdjustGrowth(event, target) {
    const stat = target.dataset.stat;
    const delta = parseInt(target.dataset.delta);
    if (!stat || isNaN(delta)) return;

    const state = this.#wizardState;
    const baseline = game.settings.get("manashard", "creationGrowthBaseline") ?? CONFIG.MANASHARD.growthRateBaseline;
    const creationCaps = CONFIG.MANASHARD.creationGrowthCaps;
    const cap = creationCaps[stat] ?? 60;
    const current = state.growthRates[stat];
    const newVal = current + delta;

    if (newVal < baseline || newVal > cap) return;

    const baselineTotal = Object.keys(state.growthRates).length * baseline;
    const allocated = Object.values(state.growthRates).reduce((sum, v) => sum + v, 0);
    const spent = allocated - baselineTotal;
    const growthPool = game.settings.get("manashard", "creationGrowthPool") ?? CONFIG.MANASHARD.growthRatePool;
    if (delta > 0 && spent >= growthPool) return;

    state.growthRates[stat] = newVal;
    this.#renderPreservingScroll();
  }

  static async #onAddToCart(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    if (!uuid) return;

    const state = this.#wizardState;
    // Find item from cache
    const allItems = [...(this.#equipmentCache?.weapons || []), ...(this.#equipmentCache?.armors || []), ...(this.#equipmentCache?.accessories || [])];
    const item = allItems.find(i => i.uuid === uuid);
    if (!item) return;

    const price = item.system.price ?? 0;
    const spent = state.cart.reduce((sum, c) => sum + c.price, 0);
    if (price > (state.eiress - spent)) return;

    state.cart.push({
      uuid: item.uuid,
      name: item.name,
      img: item.img,
      price,
      type: item.type,
      weight: item.system.weight ?? 0
    });
    this.#renderPreservingScroll();
  }

  static async #onRemoveFromCart(event, target) {
    const index = parseInt(target.dataset.cartIndex);
    if (isNaN(index)) return;
    this.#wizardState.cart.splice(index, 1);
    this.#renderPreservingScroll();
  }

  static async #onViewItem(event, target) {
    event.stopPropagation();
    const uuid = target.dataset.uuid || target.closest("[data-uuid]")?.dataset.uuid;
    if (!uuid) return;
    const doc = await fromUuid(uuid);
    if (doc?.sheet) doc.sheet.render(true);
  }

  static #onFilterShop(event, target) {
    const filter = target.dataset.filter;
    this.#wizardState.shopCategoryFilter = filter || "all";
    this.#wizardState.shopSubFilter = "all";
    this.#renderPreservingScroll();
  }

  static #onFilterShopSub(event, target) {
    this.#wizardState.shopSubFilter = target.dataset.subFilter || "all";
    this.#renderPreservingScroll();
  }

  static #onSortShop(event, target) {
    this.#wizardState.shopSort = target.dataset.sortKey || "name";
    this.#renderPreservingScroll();
  }

  static async #onConfirmCreate(event, target) {
    const state = this.#wizardState;
    const actor = this.actor;

    // Build update data
    const updateData = {
      name: state.name,
      "prototypeToken.name": state.name,
      img: state.img,
      "system.level": 1,
      "system.rank": "f",
      "system.exp": 0,
      "system.biography": state.biography,
      "system.eiress": state.eiress - state.cart.reduce((sum, c) => sum + c.price, 0),
      "system.portraitOffsetX": state.portraitOffsetX,
      "system.portraitOffsetY": state.portraitOffsetY,
      "system.portraitMirrored": state.portraitMirrored
    };

    // Set stat values and growth rates
    for (const [key, val] of Object.entries(state.stats)) {
      updateData[`system.stats.${key}.value`] = val;
      if (key === "hp" || key === "mp") {
        updateData[`system.stats.${key}.max`] = val;
      }
    }
    for (const [key, val] of Object.entries(state.growthRates)) {
      updateData[`system.stats.${key}.growth`] = val;
    }

    // Apply actor update
    await actor.update(updateData);

    // Clear existing species/job items before adding new ones
    const existingSpecies = actor.items.filter(i => i.type === "species");
    const existingJobs = actor.items.filter(i => i.type === "manacite" && i.system.manaciteType === "job");
    const toDelete = [...existingSpecies, ...existingJobs].map(i => i.id);
    if (toDelete.length) await actor.deleteEmbeddedDocuments("Item", toDelete);

    // Add species item (skip choice grants — wizard handles them inline)
    if (state.speciesUuid) {
      const speciesDoc = await fromUuid(state.speciesUuid);
      if (speciesDoc) {
        const itemData = speciesDoc.toObject();
        await actor.createEmbeddedDocuments("Item", [itemData], { _skipChoiceGrants: true });
      }
    }

    // Add job item (equipped)
    if (state.jobUuid) {
      const jobDoc = await fromUuid(state.jobUuid);
      if (jobDoc) {
        const itemData = jobDoc.toObject();
        itemData.system.equipped = true;
        await actor.createEmbeddedDocuments("Item", [itemData]);
      }
    }

    // Add chosen skills (absorbed + loadout) — free picks + constrained slot picks
    const allPicks = [
      ...state.selectedSkills,
      ...(state.constrainedSlots || []).filter(s => s.pick).map(s => s.pick)
    ];
    for (const pick of allPicks) {
      if (!pick.uuid) continue;
      const skillDoc = await fromUuid(pick.uuid);
      if (!skillDoc) continue;
      const itemData = skillDoc.toObject();
      itemData.system.absorbed = true;
      itemData.system.equipped = true;
      await actor.createEmbeddedDocuments("Item", [itemData]);
    }

    // Collect ALL absorbed skill IDs (both player-selected and granted by species/job)
    // This must happen after all item creation so granted skills from _onCreate are included.
    const allSkillIds = actor.items
      .filter(i => i.type === "manacite" && i.system.manaciteType === "skill" && i.system.absorbed)
      .map(i => i.id);
    if (allSkillIds.length) {
      await actor.update({
        "system.skillLibrary": allSkillIds,
        "system.skillLoadout": allSkillIds
      });
    }

    // Add purchased equipment
    if (state.cart.length > 0) {
      const equipDocs = await Promise.all(
        state.cart.map(c => fromUuid(c.uuid))
      );
      const equipData = equipDocs.filter(Boolean).map(d => {
        const data = d.toObject();
        data.system.equipped = true;
        return data;
      });
      if (equipData.length) await actor.createEmbeddedDocuments("Item", equipData);
    }

    ui.notifications.info(`${state.name} has been created!`);
    this.close();
  }
}

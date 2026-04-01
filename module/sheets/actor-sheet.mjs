const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
import { ruleSummary } from "../helpers/rule-engine.mjs";
import { resolveSteal, isSilenced, getMPCostMultiplier, gridDistance, applyBuffEffect } from "../helpers/combat.mjs";
import { buildForecastContext } from "../helpers/forecast.mjs";
import { PortraitAdjuster } from "../apps/portrait-adjuster.mjs";
import { showForecastDialog } from "../helpers/forecast-dialog.mjs";

import { showStatCheckForecastDialog, resolveStatCheck, resolveContestedCheck, postStatCheckCard, requestContestedStatPick, showContestedStatPickDialog } from "../helpers/stat-check.mjs";
import { postItemCard, postAbsorptionCard, postLevelUpCard } from "../helpers/item-cards.mjs";
import { renderTagInput, bindTagInput } from "../apps/tag-input.mjs";

/**
 * Actor sheet for Manashard Adventurers and Enemy Units.
 * Uses ApplicationV2 with HandlebarsApplicationMixin and partial rendering via PARTS.
 */
export class ManashardActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** Track the currently active tab */
  _activeTab = "stats";

  /** Temporary chant mode selections per skill item ID (Feature 3) */
  _chantModes = new Map();

  /** Inventory sort mode per section */
  _sortModes = { weapons: "name", armors: "name", accessories: "name", consumables: "name" };

  static PARTS = {
    header: { template: "systems/manashard/templates/actor/parts/actor-header.hbs" },
    sidebar: { template: "systems/manashard/templates/actor/parts/actor-sidebar.hbs", scrollable: [""] },
    tabs: { template: "systems/manashard/templates/actor/parts/actor-tabs.hbs" },
    stats: { template: "systems/manashard/templates/actor/parts/actor-stats.hbs", scrollable: [""] },
    equipment: { template: "systems/manashard/templates/actor/parts/actor-equipment.hbs", scrollable: [""] },
    skills: { template: "systems/manashard/templates/actor/parts/actor-skills.hbs", scrollable: [""] },
    combat: { template: "systems/manashard/templates/actor/parts/actor-combat.hbs", scrollable: [""] },
    loot: { template: "systems/manashard/templates/actor/parts/actor-loot.hbs", scrollable: [""] },
    biography: { template: "systems/manashard/templates/actor/parts/actor-biography.hbs", scrollable: [""] },
    trap: { template: "systems/manashard/templates/actor/parts/actor-trap.hbs", scrollable: [""] }
  };

  static DEFAULT_OPTIONS = {
    classes: ["manashard", "actor", "sheet"],
    position: { width: 860, height: 800 },
    window: {
      resizable: true
    },
    tag: "form",
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    dragDrop: [
      { dragSelector: ".inventory-list .item.draggable, .inventory-grid .inventory-grid-card.draggable, .adv-tile-grid .adv-tile.draggable", dropSelector: ".weapon-card, .offhand-card, .armor-card, .loadout-accessories, .paperdoll-accessory-slot" },
      { dragSelector: ".library-skill-card.draggable, .adv-tile-grid .adv-tile.draggable", dropSelector: ".skill-loadout-zone" }
    ],
    actions: {
      switchTab: ManashardActorSheet.#onSwitchTab,
      rollStat: ManashardActorSheet.#onRollStat,
      addItem: ManashardActorSheet.#onAddItem,
      editItem: ManashardActorSheet.#onEditItem,
      deleteItem: ManashardActorSheet.#onDeleteItem,
      toggleEquip: ManashardActorSheet.#onToggleEquip,
      rollAttack: ManashardActorSheet.#onRollAttack,
      useConsumable: ManashardActorSheet.#onUseConsumable,
      editImage: ManashardActorSheet.#onEditImage,
      levelUp: ManashardActorSheet.#onLevelUp,
      useSkill: ManashardActorSheet.#onUseSkill,
      toggleStatus: ManashardActorSheet.#onToggleStatus,
      cycleSort: ManashardActorSheet.#onCycleSort,
      cycleElementTier: ManashardActorSheet.#onCycleElementTier,
      addLootEntry: ManashardActorSheet.#onAddLootEntry,
      removeLootEntry: ManashardActorSheet.#onRemoveLootEntry,
      sortLootTable: ManashardActorSheet.#onSortLootTable,
      postItemToChat: ManashardActorSheet.#onPostItemToChat,
      unequipOffhand: ManashardActorSheet.#onUnequipOffhand,
      unequipJob: ManashardActorSheet.#onUnequipJob,
      rollNaturalAttack: ManashardActorSheet.#onRollNaturalAttack,
      openWizard: ManashardActorSheet.#onOpenWizard,

      toggleGrowth: ManashardActorSheet.#onToggleGrowth,
      selectOwner: ManashardActorSheet.#onSelectOwner,
      clearOwner: ManashardActorSheet.#onClearOwner,
      absorbSkill: ManashardActorSheet.#onAbsorbSkill,
      equipToLoadout: ManashardActorSheet.#onEquipToLoadout,
      removeFromLoadout: ManashardActorSheet.#onRemoveFromLoadout,
      cycleStatusTier: ManashardActorSheet.#onCycleStatusTier,
      openManaciteManager: ManashardActorSheet.#onOpenManaciteManager,
      openSpatialInventory: ManashardActorSheet.#onOpenSpatialInventory,
      stowInSpatial: ManashardActorSheet.#onStowInSpatial,
      adjustEiress: ManashardActorSheet.#onAdjustEiress,
      setAccentPreset: ManashardActorSheet.#onSetAccentPreset,
      setAccentCustom: ManashardActorSheet.#onSetAccentCustom
    }
  };

  /** @override */
  get title() {
    const name = this.actor.name;
    const typeLabels = {
      character: "Adventurer",
      threat: "Threat",
      trap: "Trap"
    };
    const label = typeLabels[this.actor.type] ?? this.actor.type;
    return `${label}: ${name}`;
  }

  /** Build the tab definitions with active state */
  _getTabs() {
    // Characters: Combat | Equipment | Skills | Bio
    if (this.actor.type === "character") {
      const tabs = [
        { id: "stats", label: "Combat", icon: "fa-swords" },
        { id: "equipment", label: "Equipment", icon: "fa-shield-halved" },
        { id: "skills", label: "Skills", icon: "fa-sparkles" },
        { id: "biography", label: "Bio", icon: "fa-book-open" },
      ];
      for (const tab of tabs) {
        tab.active = tab.id === this._activeTab;
        tab.cssClass = tab.active ? "active" : "";
      }
      return tabs;
    }

    // Traps: Trap | Bio
    if (this.actor.type === "trap") {
      const tabs = [
        { id: "trap", label: "Trap", icon: "fa-land-mine-on" },
        { id: "biography", label: "Bio", icon: "fa-book-open" },
      ];
      for (const tab of tabs) {
        tab.active = tab.id === this._activeTab;
        tab.cssClass = tab.active ? "active" : "";
      }
      return tabs;
    }

    // Threats: Combat | Loadout | Loot | Bio
    const tabs = [
      { id: "stats", label: "Combat", icon: "fa-swords" },
      { id: "skills", label: "Loadout", icon: "fa-backpack" },
      { id: "loot", label: "Loot", icon: "fa-shield-halved" },
      { id: "biography", label: "Bio", icon: "fa-book-open" },
    ];
    for (const tab of tabs) {
      tab.active = tab.id === this._activeTab;
      tab.cssClass = tab.active ? "active" : "";
    }
    return tabs;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const system = actor.system;

    context.actor = actor;
    context.system = system;
    context.flags = actor.flags;
    context.isCharacter = actor.type === "character";
    context.isNpc = CONFIG.MANASHARD.NPC_TYPES.has(actor.type);
    context.isThreat = actor.type === "threat";
    context.isTrap = actor.type === "trap";
    // Pre-localize config for templates (V13 Handlebars localize helper unreliable)
    const L = (key) => typeof key === "string" ? game.i18n.localize(key) : "";
    const localizeMap = (obj) => {
      if (!obj) return {};
      return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, L(v)]));
    };
    context.config = {
      ...CONFIG.MANASHARD,
      ranks: Object.fromEntries(
        Object.entries(CONFIG.MANASHARD.ranks).map(([k, v]) => [k, { ...v, label: L(v.label) }])
      ),
      elements: localizeMap(CONFIG.MANASHARD.elements),
    };
    context.editable = this.isEditable;

    // Base HP/MP max values (pre-modifier) for form inputs — prevents derived bonuses
    // from being written back to the database on form submission (submitOnChange).
    context.baseHpMax = system._baseStats?.hp ?? system.stats?.hp?.max ?? 0;
    context.baseMpMax = system._baseStats?.mp ?? system.stats?.mp?.max ?? 0;

    // Barrier HP bar percentages (precomputed for templates)
    const hp = system.stats?.hp ?? { value: 0, max: 0, barrier: 0 };
    const hpPct = hp.max > 0 ? Math.min(100, Math.round((hp.value / hp.max) * 100)) : 0;
    const barrierRaw = hp.barrier ?? 0;
    const barrierPct = (barrierRaw > 0 && hp.max > 0) ? Math.min(hpPct, Math.round((barrierRaw / hp.max) * 100)) : 0;
    context.hpPercent = hpPct;
    context.barrierPercent = barrierPct;
    context.barrierRight = 100 - hpPct;

    // MP bar percentage (capped at 100%)
    const mp = system.stats?.mp ?? { value: 0, max: 0 };
    context.mpPercent = mp.max > 0 ? Math.min(100, Math.round((mp.value / mp.max) * 100)) : 0;

    // Tab state — ensure active tab is valid for this actor type
    const availableTabs = this._getTabs();
    if (!availableTabs.some(t => t.id === this._activeTab)) {
      this._activeTab = availableTabs[0]?.id ?? "stats";
      for (const tab of availableTabs) {
        tab.active = tab.id === this._activeTab;
        tab.cssClass = tab.active ? "active" : "";
      }
    }
    context.tabs = availableTabs;
    context.activeTab = this._activeTab;

    // Organize items by type and sort per user preference
    const sortItems = (arr, mode) => {
      const sorted = [...arr];
      if (mode === "weight") return sorted.sort((a, b) => (b.system.weight ?? 0) - (a.system.weight ?? 0));
      if (mode === "equipped") return sorted.sort((a, b) => (b.system.equipped ? 1 : 0) - (a.system.equipped ? 1 : 0));
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    };
    // Tag items that were auto-granted or taught (for template display)
    const tagGranted = (item) => {
      item._isGranted = !!item.getFlag("manashard", "grantedBy");
      item._isTaught = !!item.getFlag("manashard", "taughtSkill");
      item._taughtByName = item.getFlag("manashard", "taughtByName") ?? "";
      return item;
    };
    // Build set of item IDs that exist only as loot entries (threats only)
    const lootItemIds = new Set();
    if (actor.type === "threat") {
      for (const entry of (system.lootTable ?? [])) {
        if (entry.itemId) lootItemIds.add(entry.itemId);
      }
    }
    const notLootOnly = (item) => !lootItemIds.has(item.id);

    context.weapons = sortItems(actor.itemTypes.weapon ?? [], this._sortModes.weapons).map(tagGranted).filter(notLootOnly);
    context.armors = sortItems(actor.itemTypes.armor ?? [], this._sortModes.armors).map(tagGranted).filter(notLootOnly);
    context.accessories = sortItems(actor.itemTypes.accessory ?? [], this._sortModes.accessories).map(tagGranted).filter(notLootOnly);
    context.consumables = sortItems(actor.itemTypes.consumable ?? [], this._sortModes.consumables).map(tagGranted).filter(notLootOnly);
    const allManacites = (actor.itemTypes.manacite ?? []).map(tagGranted).filter(notLootOnly);
    context.jobManacites = allManacites.filter(m => m.system.manaciteType === "job");
    context.skillManacites = allManacites.filter(m => m.system.manaciteType === "skill");
    context.species = (actor.itemTypes.species ?? []).map(tagGranted);
    context.sortModes = this._sortModes;

    // Equipped items for quick reference
    // Mainhand: equipped weapon that is NOT in offhand slot (legacy compat: equipSlot="none" treated as mainhand)
    context.equippedWeapon = context.weapons.find(w => w.system.equipped && w.system.equipSlot !== "offhand");
    context.equippedOffhand = context.weapons.find(w => w.system.equipSlot === "offhand");
    context.equippedArmor = context.armors.find(a => a.system.equipped);
    context.equippedAccessories = context.accessories.filter(a => a.system.equipped);
    context.equippedJob = context.jobManacites.find(j => j.system.equipped);

    // Skill Library & Loadout (characters only)
    if (context.isCharacter) {
      // Absorbed skills = skill library
      context.skillLibrary = context.skillManacites.filter(s => s.system.absorbed);

      // Unabsorbed crystals still in inventory
      context.unabsorbedSkills = context.skillManacites.filter(s => !s.system.absorbed);

      // Loadout: ordered items from skillLoadout IDs
      const loadoutIds = system.skillLoadout ?? [];
      const freeIds = system._loadoutFreeSkillIds ?? new Set();
      context.skillLoadout = loadoutIds.map(id => actor.items.get(id)).filter(Boolean);
      for (const skill of context.skillLoadout) {
        skill._isLoadoutFree = freeIds.has(skill.id);
      }
      // Slot info
      context.loadoutSlotsUsed = system._loadoutSlotsUsed ?? 0;
      context.maxLoadoutSlots = system.maxLoadoutSlots ?? 5;
      context.loadoutFreeSkillIds = system._loadoutFreeSkillIds ?? new Set();
      // Job growth rates for display — merge hardcoded growthRates + rule-based growth bonuses
      const hardcodedGrowth = context.equippedJob?.system.growthRates ?? {};
      const ruleBonuses = system._growthRuleBonuses ?? {};
      const merged = {};
      for (const key of Object.keys(system.stats ?? {})) {
        const total = (hardcodedGrowth[key] ?? 0) + (ruleBonuses[key] ?? 0);
        if (total) merged[key] = total;
      }
      context.jobGrowthRates = Object.keys(merged).length ? merged : null;
      // equippedSkills = loadout skills (backward compat with chant modes etc.)
      context.equippedSkills = context.skillLoadout;

      // Spatial Inventory: granted by the rule engine via Grant: spatialInventory
      context.hasSpatialInventory = !!this.actor.system._hasSpatialInventory;
    } else {
      // Hostile & Companion units: all skill manacites are auto-available (no slotting needed)
      context.equippedSkills = [...context.skillManacites];
    }

    // Off-hand weapon for combat tab (shields can attack too)
    context.offhandWeapon = context.equippedOffhand ?? null;

    // Natural weapons (always-available, not equipped in paperdoll)
    context.naturalWeapons = context.weapons.filter(w => w.system.category === "natural");

    // Accessory slots (fixed count, filled or null)
    const maxAccessorySlots = actor.system.maxAccessorySlots ?? 2;
    context.accessorySlots = [];
    for (let i = 0; i < maxAccessorySlots; i++) {
      context.accessorySlots.push(context.equippedAccessories[i] ?? null);
    }

    // Two-handed flag — blocks offhand slot
    context.mainhandIs2H = actor.system._mainhandIs2H ?? false;

    // Merged inventory: all unequipped non-natural items + consumables
    // Exclude items stowed in spatial inventory
    const notSpatial = (i) => !i.getFlag("manashard", "spatialStorage");
    context.inventory = [
      ...context.weapons.filter(w => !w.system.equipped && w.system.category !== "natural" && notSpatial(w)),
      ...context.armors.filter(a => !a.system.equipped && notSpatial(a)),
      ...context.accessories.filter(a => !a.system.equipped && notSpatial(a)),
      ...context.consumables.filter(notSpatial)
    ];

    // Combat-usable skills: for characters, from loadout; for NPCs, all non-passive skill manacites
    const skillSource = context.isCharacter ? (context.skillLoadout ?? []) : context.skillManacites;
    context.combatSkills = skillSource.filter(s => s.system.skillType && s.system.skillType !== "passive");

    // Enrich biography
    context.enrichedBiography = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.biography ?? "",
      { secrets: this.document.isOwner, rollData: actor.getRollData() }
    );

    // Stats array for iteration in templates (with modifier coloring)
    const modifiers = system._modifiers;
    const getModClass = (total) => total > 0 ? "buffed" : total < 0 ? "debuffed" : "";

    const rankCaps = CONFIG.MANASHARD.rankStatCaps?.[system.rank] ?? {};
    context.statEntries = Object.entries(system.stats ?? {}).map(([key, stat]) => {
      const modTotal = modifiers?.getTotal(key) ?? 0;
      const cap = rankCaps[key] ?? 40;
      const currentVal = (key === "hp" || key === "mp") ? (stat.max ?? stat.value) : stat.value;
      return {
        key,
        label: game.i18n.localize(CONFIG.MANASHARD.stats[key]),
        abbr: game.i18n.localize(CONFIG.MANASHARD.statAbbreviations[key]),
        value: stat.value,
        max: stat.max,
        growth: stat.growth,
        isResource: key === "hp" || key === "mp",
        modTotal,
        modClass: getModClass(modTotal),
        hasModifiers: modTotal !== 0,
        baseValue: system._baseStats?.[key] ?? stat.value,
        rankCap: cap,
        capPct: Math.min(100, Math.round((currentVal / cap) * 100)),
        atCap: currentVal >= cap
      };
    });

    // Derived stat modifier info for coloring
    context.derivedModifiers = {};
    const derivedKeys = ["damage", "accuracy", "critical", "peva", "meva", "critEvo",
      "blockChance", "mov", "mpRegen", "carryingCapacity", "vision", "pdef", "mdef"];
    for (const key of derivedKeys) {
      const total = modifiers?.getTotal(key) ?? 0;
      context.derivedModifiers[key] = {
        modTotal: total,
        modClass: getModClass(total),
        hasModifiers: total !== 0,
        baseValue: system._baseDerived?.[key] ?? (system[key] ?? 0)
      };
    }

    // Rank info
    if (context.isCharacter) {
      const rankData = CONFIG.MANASHARD.ranks[system.rank];
      context.rankLabel = rankData ? game.i18n.localize(rankData.label) : system.rank.toUpperCase();
      context.growthTotal = system.growthTotal ?? 0;
      context.rankStatCaps = system.rankStatCaps ?? {};
      const baseline = CONFIG.MANASHARD.growthRateBaseline ?? 0;
      const statCount = Object.keys(system.stats).length;
      context.growthPool = CONFIG.MANASHARD.growthRatePool + (baseline * statCount);
      context.growthOverBudget = context.growthTotal > context.growthPool;
    }

    // Species (first species item)
    context.equippedSpecies = context.species.length > 0 ? context.species[0] : null;

    // Build unified skills list for the Skills tab (all sources)
    context.allSkills = [];
    // For characters, source from loadout; for NPCs, from all combat skills
    const skillItemSource = context.isCharacter ? (context.skillLoadout ?? []) : (context.combatSkills ?? []);
    for (const s of skillItemSource) {
      const isFree = context.isCharacter && context.loadoutFreeSkillIds?.has(s.id);
      context.allSkills.push({
        name: s.name, img: s.img, skillType: s.system.skillType,
        mpCost: s.system.mpCost, range: s.system.rangeDisplay, rangeType: s.system.rangeType ?? "ranged",
        element: s.system.element, description: s.system.description,
        source: isFree ? "Job" : (s._isTaught ? "Taught" : "Loadout"),
        sourceIcon: isFree ? "fas fa-briefcase" : (s._isTaught ? "fas fa-chalkboard-teacher" : "fas fa-gem"),
        id: s.id, _isTaught: s._isTaught, _taughtByName: s._taughtByName, _isFree: isFree
      });
    }

    // Enrich skill descriptions so inline formulas like [[2 * SL]] evaluate.
    // Uses a Set to avoid enriching the same object twice across shared arrays.
    const enrichDesc = async (item) => {
      let raw = item.system?.description ?? item.description;
      if (!raw) return;
      const sl = 1;
      // Resolve [[...]] formulas containing SL by evaluating them inline
      raw = raw.replace(/\[\[([^\]]+)\]\]/g, (match, expr) => {
        if (!expr.includes("SL")) return match;
        try {
          const resolved = expr.replace(/\bSL\b/g, String(sl));
          // Safe eval: only math operators and digits
          if (/^[\d\s+\-*/().]+$/.test(resolved)) return String(Math.floor(eval(resolved)));
          return match;
        } catch { return match; }
      });
      const rollData = { SL: sl };
      item._enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        raw, { secrets: this.document.isOwner, rollData }
      );
    };
    const seen = new Set();
    const toEnrich = [];
    for (const arr of [context.combatSkills, context.allSkills, context.skillLoadout,
                       context.skillLibrary, context.equippedSkills]) {
      for (const item of (arr ?? [])) {
        if (!seen.has(item)) { seen.add(item); toEnrich.push(item); }
      }
    }
    await Promise.all(toEnrich.map(enrichDesc));

    // Status effects data for header display (with duration tracking)
    if (context.isCharacter || context.isThreat) {
      const activeStatuses = system.statusEffects ?? new Set();
      const durations = actor.getFlag("manashard", "statusDurations") ?? {};
      context.statusEffectEntries = Object.entries(CONFIG.MANASHARD.statusEffects).map(([key, data]) => ({
        key,
        label: game.i18n.localize(data.label),
        active: activeStatuses.has(key),
        duration: activeStatuses.has(key) ? (durations[key] ?? null) : null
      }));
      // Active-only status effects for combat tab display
      context.activeStatusEffects = context.statusEffectEntries.filter(e => e.active);
    }

    // Feature 3: Chant mode data for magic skill cards only (load from flags on first access)
    if (this._chantModes.size === 0) {
      const saved = actor.getFlag("manashard", "chantModes") ?? {};
      for (const [k, v] of Object.entries(saved)) this._chantModes.set(k, v);
    }
    context.chantModes = CONFIG.MANASHARD.chantModes;
    context.chantModeSelections = {};
    for (const skill of context.equippedSkills) {
      // Only magic skills have chant modes; arts and passives always use "normal"
      if (skill.system.skillType === "magic") {
        context.chantModeSelections[skill.id] = this._chantModes.get(skill.id) ?? "normal";
      }
    }

    // Chant effect summaries for inline display (magic only)
    context.chantEffectSummaries = {};
    for (const [skillId, mode] of Object.entries(context.chantModeSelections)) {
      const chant = CONFIG.MANASHARD.chantModes[mode];
      if (mode === "normal" || !chant) {
        context.chantEffectSummaries[skillId] = "";
      } else {
        const mpText = chant.mpMultiplier !== 1.0 ? `MP ×${chant.mpMultiplier}` : "";
        const effText = `${Math.round(chant.effectModifier * 100)}%`;
        const chargeText = chant.chargesTurn ? "Next Turn" : "";
        const parts = [mpText, chargeText, `${effText} Effect`].filter(Boolean);
        context.chantEffectSummaries[skillId] = parts.join(", ");
      }
    }

    // Unequipped weapons/armor for stat comparison (pre-compute deltas)
    context.unequippedWeapons = context.weapons.filter(w => !w.system.equipped);
    context.unequippedArmors = context.armors.filter(a => !a.system.equipped);
    context.unequippedAccessories = context.accessories.filter(a => !a.system.equipped);

    // Derived stat sources for context display
    const wpn = context.equippedWeapon;
    const arm = context.equippedArmor;
    context.derivedSources = {
      damage: wpn ? wpn.name : "Unarmed",
      accuracy: wpn ? wpn.name : "Unarmed",
      critical: wpn ? wpn.name : "Unarmed",
      block: wpn?.system.block ? wpn.name : null,
      armor: arm ? arm.name : "None",
      mov: "Base"
    };

    // Aggregate rule elements from all owned items
    context.allRules = [];
    for (const item of actor.items) {
      const rules = item.system.rules ?? [];
      for (let i = 0; i < rules.length; i++) {
        context.allRules.push({
          ...rules[i],
          _index: i,
          _summary: ruleSummary(rules[i]),
          _itemName: item.name,
          _itemId: item.id,
          _itemImg: item.img
        });
      }
    }

    // Creature type tag input (editable for NPCs, read-only for characters)
    {
      const ctChoices = {};
      for (const [key, locKey] of Object.entries(CONFIG.MANASHARD.creatureTypes)) {
        ctChoices[key] = game.i18n.localize(locKey);
      }
      const ctSelected = Array.isArray(system.creatureType) ? system.creatureType : [system.creatureType].filter(Boolean);
      if (context.isNpc) {
        context.creatureTypeTags = renderTagInput({ name: "creatureType", choices: ctChoices, selected: ctSelected, placeholder: "Add type..." });
      } else {
        context.creatureTypeTags = ctSelected.map(k => `<span class="tag-chip readonly">${ctChoices[k] ?? k}</span>`).join("");
      }
    }

    // Movement mode tags (editable for NPCs, read-only for characters)
    {
      const mmChoices = {};
      for (const [key, locKey] of Object.entries(CONFIG.MANASHARD.movementModes)) {
        mmChoices[key] = game.i18n.localize(locKey);
      }
      if (context.isNpc) {
        const mmSelected = Array.isArray(system.movementModes) ? system.movementModes : ["walk"];
        context.movementModeTags = renderTagInput({ name: "movementModes", choices: mmChoices, selected: mmSelected, placeholder: "Add mode..." });
      } else {
        const mmSelected = system._movementModes ? [...system._movementModes] : ["walk"];
        context.movementModeTags = mmSelected.map(k => `<span class="tag-chip readonly">${mmChoices[k] ?? k}</span>`).join("");
      }
    }

    // Threats have loot in a dedicated tab, not in combat tab
    context.showLootInCombat = false;

    // Hostile unit: threat pips and creature type icon for sidebar
    if (context.isThreat) {
      // Threat pips derived from rank
      const rankPips = { f: 1, e: 1, d: 2, c: 2, b: 3, a: 4, s: 5 };
      const pipCount = rankPips[system.rank] ?? 1;
      context.threatPips = Array.from({ length: 5 }, (_, i) => i < pipCount);

      // Rank options for dropdown
      const rankChoices = ["f", "e", "d", "c", "b", "a", "s"];
      context.rankOptions = rankChoices.map(r => ({
        key: r, label: r.toUpperCase(), selected: system.rank === r
      }));

      // Role options for dropdown
      context.roleOptions = Object.entries(CONFIG.MANASHARD.enemyRoles).map(([key, locKey]) => ({
        key, label: game.i18n.localize(locKey), selected: key === system.role
      }));

      // Resolve loot table entries to actual embedded items
      context.resolvedLoot = (system.lootTable ?? []).map((entry, index) => {
        const item = actor.items.get(entry.itemId);
        return {
          index,
          itemId: entry.itemId,
          item,
          name: item?.name ?? "(Missing Item)",
          img: item?.img ?? "icons/svg/item-bag.svg",
          chance: entry.chance,
          stolen: entry.stolen
        };
      });
    }

    // Trap-specific context
    if (context.isTrap) {
      // Localized trigger type options
      const triggerChoices = CONFIG.MANASHARD.triggerTypes;
      context.triggerTypeOptions = Object.entries(triggerChoices).map(([key, locKey]) => ({
        key, label: L(locKey), selected: system.triggerType === key
      }));

      // Localized disarm stat options
      const disarmChoices = CONFIG.MANASHARD.disarmStats;
      context.disarmStatOptions = Object.entries(disarmChoices).map(([key, locKey]) => ({
        key, label: L(locKey), selected: system.disarmStat === key
      }));

      // Damage type options
      const dmgChoices = CONFIG.MANASHARD.trapDamageTypes;
      context.damageTypeOptions = Object.entries(dmgChoices).map(([key, locKey]) => ({
        key, label: L(locKey), selected: system.damageType === key
      }));

      // Element options (include null as "None")
      context.elementOptions = Object.entries(CONFIG.MANASHARD.elements).map(([key, locKey]) => ({
        key, label: L(locKey), selected: system.element === key
      }));

      // Status inflict options
      const statusChoices = { none: "MANASHARD.None", ...Object.fromEntries(
        Object.entries(CONFIG.MANASHARD.statusEffects).map(([k, v]) => [k, v.label])
      )};
      context.statusInflictOptions = Object.entries(statusChoices).map(([key, locKey]) => ({
        key, label: L(locKey), selected: system.statusInflict === key
      }));

      // Rank options
      const rankChoices = ["f", "e", "d", "c", "b", "a", "s"];
      context.rankOptions = rankChoices.map(r => ({
        key: r, label: r.toUpperCase(), selected: system.rank === r
      }));

      // Threat pips from rank
      const rankPips = { f: 1, e: 1, d: 2, c: 2, b: 3, a: 4, s: 5 };
      const pipCount = rankPips[system.rank] ?? 1;
      context.threatPips = Array.from({ length: 5 }, (_, i) => i < pipCount);
    }

    // Growth rate toggle state (character only, persisted per-actor)
    if (context.isCharacter) {
      context.showGrowth = actor.getFlag("manashard", "showGrowth") ?? false;
      context.canLevelUp = system.exp >= 100 && system.level < 40;
    }

    // Passive abilities for character/hostile/companion profile
    if (context.isCharacter) {
      context.passiveAbilities = (context.allSkills ?? []).filter(s => s.skillType === "passive");
    } else if (context.isThreat) {
      // For threats, passives come directly from skillManacites (allSkills already excludes passives)
      context.passiveAbilities = (context.skillManacites ?? [])
        .filter(s => s.system.skillType === "passive")
        .map(s => ({
          name: s.name, img: s.img, skillType: s.system.skillType,
          description: s.system.description, id: s.id,
          source: "Innate", sourceIcon: "fas fa-star"
        }));
      await Promise.all(context.passiveAbilities.map(enrichDesc));
    }

    // Active skills for the Skills tab (everything except passives, plus job signature)
    context.allActiveSkills = (context.allSkills ?? []).filter(s => s.skillType !== "passive");
    if (context.jobSignatureSkill?.name) {
      const sig = context.jobSignatureSkill;
      const sigEntry = {
        id: `job-sig-${context.equippedJob?.id}`,
        name: sig.name,
        img: sig.img ?? context.equippedJob?.img,
        skillType: sig.skillType ?? "art",
        mpCost: sig.mpCost, range: sig.range, rangeType: sig.rangeType ?? "ranged",
        element: sig.element, description: sig.description,
        source: "Job", sourceIcon: "fas fa-briefcase",
        _isJobInnate: true, _isFree: true
      };
      await enrichDesc(sigEntry);
      context.allActiveSkills.unshift(sigEntry);
    }

    // Elemental profile for all actors
    if (system.elementalProfile) {
      context.elementalEntries = Object.entries(system.elementalProfile).map(([key, tier]) => ({
        key,
        label: game.i18n.localize(CONFIG.MANASHARD.elements[key]),
        tier,
        tierLabel: game.i18n.localize(CONFIG.MANASHARD.elementalTiers[tier])
      }));
    }

    // Status resistances (character + NPC)
    const statusResistances = system.statusResistances ?? {};
    if (CONFIG.MANASHARD.statusEffects) {
      context.statusResistanceEntries = Object.entries(CONFIG.MANASHARD.statusEffects)
        .map(([key, cfg]) => ({
          key,
          label: game.i18n.localize(cfg.label),
          tier: statusResistances[key] ?? "neutral",
          tierLabel: (statusResistances[key] ?? "neutral").charAt(0).toUpperCase()
                   + (statusResistances[key] ?? "neutral").slice(1),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }

    this._lastContext = context;
    return context;
  }

  /**
   * Prevent derived HP/MP bonuses (from jobs, rank, rule modifiers) from being
   * written back to the database on form submission. The inputs display the
   * derived total, but we must save the base value.
   *
   * If the user didn't change the max (it still matches the derived value),
   * restore the original stored base. If the user DID change it, compute the
   * intended base by subtracting the modifier portion.
   * @override
   */
  _prepareSubmitData(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const system = this.actor.system;

    for (const key of ["hp", "mp"]) {
      const submittedMax = data.system?.stats?.[key]?.max;
      if (submittedMax === undefined) continue;

      const derivedMax = system.stats[key].max;    // current derived total (base + bonuses)
      const baseMax = system._baseStats?.[key] ?? derivedMax; // stored base before modifiers

      if (submittedMax === derivedMax) {
        // User didn't touch the max input — restore the original base
        data.system.stats[key].max = baseMax;
      } else {
        // User manually edited the max — treat their input as the new desired
        // derived total and back out the bonus portion to get the new base
        const modBonus = system._modifiers?.getTotal(`${key}.max`) ?? 0;
        const rankBonus = CONFIG.MANASHARD.ranks?.[system.rank]?.[`${key}Base`] ?? 0;
        data.system.stats[key].max = submittedMax - modBonus - rankBonus;
      }
    }

    return data;
  }

  /**
   * Protect active ProseMirror editors from being destroyed by re-renders
   * triggered by other form fields changing (via submitOnChange).
   * @override
   */
  async _renderHTML(context, options) {
    // Preserve scroll positions of all scrollable containers before re-render
    if (this.element) {
      this._savedScrollPositions = {};
      for (const el of this.element.querySelectorAll(".tab-content, .job-details-panel, .adv-sidebar, .hu-sidebar, .trap-sidebar")) {
        const key = el.dataset.tab || el.className;
        if (el.scrollTop > 0) this._savedScrollPositions[key] = el.scrollTop;
      }
    }

    if (this.element) {
      const activePM = this.element.querySelector("prose-mirror.active, prose-mirror[open]");
      if (activePM) {
        const partEl = activePM.closest("[data-application-part]");
        if (partEl) {
          const activePartId = partEl.dataset.applicationPart;
          if (!options.parts) {
            options.parts = Object.keys(this.constructor.PARTS).filter(p => p !== activePartId);
          } else if (Array.isArray(options.parts)) {
            options.parts = options.parts.filter(p => p !== activePartId);
          }
        }
      }
    }
    return super._renderHTML(context, options);
  }

  /**
   * Resolve the sheet accent color and apply CSS custom properties.
   */
  _applySheetAccent() {
    const sys = this.actor.system;
    const presets = CONFIG.MANASHARD.sheetAccentPresets;
    const preset = presets[sys.sheetAccentPreset] ?? presets.gold;
    const color = (sys.sheetAccentPreset === "custom" && sys.sheetAccentCustom)
      ? sys.sheetAccentCustom
      : (preset.color ?? "#c49a2a");

    const el = this.element;
    el.style.setProperty("--sheet-accent", color);
    el.style.setProperty("--sheet-accent-light", this._lightenColor(color, 30));
    el.style.setProperty("--sheet-accent-dim", this._hexToRgba(color, 0.25));
    el.style.setProperty("--sheet-accent-glow", this._hexToRgba(color, 0.3));
    el.style.setProperty("--sheet-accent-glow-strong", this._hexToRgba(color, 0.5));
    el.style.setProperty("--sheet-accent-border", this._hexToRgba(color, 0.35));
  }

  /** Convert hex to rgba string. */
  _hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /** Lighten a hex color by a percentage. */
  _lightenColor(hex, percent) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    r = Math.min(255, Math.round(r + (255 - r) * (percent / 100)));
    g = Math.min(255, Math.round(g + (255 - g) * (percent / 100)));
    b = Math.min(255, Math.round(b + (255 - b) * (percent / 100)));
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // ── Set initial tab visibility via hidden attribute on part wrappers ──
    // Also sync .active on inner .tab-content for the CSS visibility rule
    const tabPartNames = ['stats', 'equipment', 'skills', 'biography', 'combat', 'loot', 'trap'];
    for (const partName of tabPartNames) {
      const wrapper = this.element.querySelector(`[data-application-part="${partName}"]`);
      if (wrapper) {
        const isActive = partName === this._activeTab;
        wrapper.hidden = !isActive;
        // In V13, data-application-part is on the root <section class="tab-content"> itself,
        // so toggle .active directly on the wrapper (not a child).
        wrapper.classList.toggle('active', isActive);
      }
    }
    // Set initial active tab button
    this.element.querySelectorAll('.ms-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === this._activeTab);
    });

    // ── Sheet accent color injection ──
    this._applySheetAccent();

    // Add layout class for two-column sidebar layouts
    if (this.actor.type === "character") {
      this.element.classList.add("adv-layout");
    } else if (this.actor.type === "trap") {
      this.element.classList.add("trap-layout");
    } else if (this.actor.type === "threat") {
      this.element.classList.add("hu-layout");
      // Bind creature type tag input
      const choices = {};
      for (const [key, locKey] of Object.entries(CONFIG.MANASHARD.creatureTypes)) {
        choices[key] = game.i18n.localize(locKey);
      }
      bindTagInput(this.element, "creatureType", choices, (tags) => {
        this.actor.update({ "system.creatureType": tags });
      });

      // Bind movement modes tag input
      const mmChoices = {};
      for (const [key, locKey] of Object.entries(CONFIG.MANASHARD.movementModes)) {
        mmChoices[key] = game.i18n.localize(locKey);
      }
      bindTagInput(this.element, "movementModes", mmChoices, (tags) => {
        this.actor.update({ "system.movementModes": tags });
      });
    }

    // Inject wizard button into the window title bar for characters
    if (this.actor.type === "character") {
      const header = this.element.closest(".application")?.querySelector(".window-header");
      if (header && !header.querySelector(".wizard-header-btn")) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wizard-header-btn";
        btn.dataset.action = "openWizard";
        btn.title = game.i18n.localize("MANASHARD.Wizard.Launch");
        btn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i>';
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const wizard = new game.manashard.CharacterCreationWizard(this.actor);
          wizard.render(true);
        });
        // Insert before the kebab menu (three dots)
        const kebab = header.querySelector(".controls-dropdown, .header-control.icon.fa-ellipsis-vertical, [data-action='controls']")
          || header.querySelector("button.close")?.previousElementSibling
          || header.lastElementChild;
        header.insertBefore(btn, kebab);
      }
    }
    // Restore scroll positions after re-render
    if (this._savedScrollPositions) {
      for (const el of this.element.querySelectorAll(".tab-content, .job-details-panel, .adv-sidebar, .hu-sidebar, .trap-sidebar")) {
        const key = el.dataset.tab || el.className;
        if (this._savedScrollPositions[key]) el.scrollTop = this._savedScrollPositions[key];
      }
      this._savedScrollPositions = null;
    }

    // Restore focus to the previously focused input after re-render
    if (this._focusedInput) {
      const el = this.element.querySelector(this._focusedInput.selector);
      if (el) {
        el.focus();
        // Restore caret/selection for text-like inputs
        if (typeof el.setSelectionRange === "function" && this._focusedInput.selStart != null) {
          el.setSelectionRange(this._focusedInput.selStart, this._focusedInput.selEnd);
        }
      }
      this._focusedInput = null;
    }

    // --- Animated Stat Change Flash ---
    const sys = this.actor.system;
    const newStats = {
      damage: sys.damage, accuracy: sys.accuracy, critical: sys.critical,
      peva: sys.peva, meva: sys.meva, critEvo: sys.critEvo, mov: sys.mov,
      blockChance: sys.blockChance, mpRegen: sys.mpRegen
    };
    if (this._previousDerivedStats) {
      for (const [key, oldVal] of Object.entries(this._previousDerivedStats)) {
        const newVal = newStats[key];
        if (newVal !== oldVal) {
          const cell = this.element.querySelector(`.derived-cell[data-stat="${key}"]`);
          if (cell) {
            const cls = newVal > oldVal ? "stat-flash-up" : "stat-flash-down";
            cell.classList.add(cls);
            setTimeout(() => cell.classList.remove(cls), 800);
          }
        }
      }
    }
    this._previousDerivedStats = { ...newStats };

    // --- Drag-and-Drop Highlight on Paperdoll Slots ---
    this.element.querySelectorAll(".weapon-card, .offhand-card, .armor-card, .loadout-accessories, .paperdoll-accessory-slot").forEach(slot => {
      slot.addEventListener("dragover", (e) => {
        e.preventDefault();
        slot.classList.add("drop-target-highlight");
      });
      slot.addEventListener("dragleave", () => slot.classList.remove("drop-target-highlight"));
      slot.addEventListener("drop", () => slot.classList.remove("drop-target-highlight"));
    });

    // --- Drag-and-Drop Highlight on Skill Loadout Zone ---
    this.element.querySelectorAll(".skill-loadout-zone").forEach(zone => {
      zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        zone.classList.add("drop-target-highlight");
      });
      zone.addEventListener("dragleave", () => zone.classList.remove("drop-target-highlight"));
      zone.addEventListener("drop", () => zone.classList.remove("drop-target-highlight"));
    });

    // --- Drag-and-Drop on Loot Section ---
    this.element.querySelectorAll(".hu-loot-section").forEach(section => {
      section.addEventListener("dragover", (e) => {
        e.preventDefault();
        section.classList.add("drop-target-highlight");
      });
      section.addEventListener("dragleave", () => section.classList.remove("drop-target-highlight"));
      section.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        section.classList.remove("drop-target-highlight");
        this.#onLootDrop(e);
      });
    });

    // --- Loot item drag-out (so items can be dragged to other sheets) ---
    this.element.querySelectorAll(".hu-loot-entry[data-item-id]").forEach(entry => {
      entry.setAttribute("draggable", "true");
      entry.addEventListener("dragstart", (e) => {
        const item = this.actor.items.get(entry.dataset.itemId);
        if (!item) return;
        e.dataTransfer.setData("text/plain", JSON.stringify({
          type: "Item",
          uuid: item.uuid,
          itemId: item.id,
          itemType: item.type
        }));
      });
    });

    // --- Modifier Breakdown Tooltips on Buffed/Debuffed Stats ---
    this.element.querySelectorAll(".stat-value-buffed, .stat-value-debuffed, .derived-value.buffed, .derived-value.debuffed").forEach(el => {
      el.addEventListener("mouseenter", (e) => this.#showModifierTooltip(e, el));
      el.addEventListener("mouseleave", () => this.#hideModifierTooltip());
    });


    // --- Mastery Growth Tooltips on Growth Inputs ---
    this.element.querySelectorAll(".growth-input").forEach(el => {
      el.addEventListener("mouseenter", (e) => this.#showGrowthTooltip(e, el));
      el.addEventListener("mouseleave", () => this.#hideGrowthTooltip());
    });

    // --- Elemental Profile Right-Click Reverse Cycling ---
    this.element.querySelectorAll(".elemental-entry[data-action='cycleElementTier'], .ms-el-cell[data-action='cycleElementTier']").forEach(entry => {
      entry.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        ManashardActorSheet.#onCycleElementTier.call(this, e, entry);
      });
    });

    // --- Item Right-Click Context Menu (Edit / Delete) ---
    this.element.querySelectorAll("[data-item-id]").forEach(el => {
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const itemId = el.dataset.itemId;
        if (!itemId) return;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        const isLoot = !!el.closest(".hu-loot-section");
        const isLibrary = !!el.closest(".skill-library-section");
        const isLoadout = !!el.closest(".skill-loadout-zone");
        this.#showItemContextMenu(e, item, { isLoot, isLibrary, isLoadout });
      });
    });

    // --- Level-Up Growth Preview Tooltip ---
    const luBtn = this.element.querySelector(".level-up-button");
    if (luBtn) {
      luBtn.addEventListener("mouseenter", (e) => this.#showLevelUpPreview(e, luBtn));
      luBtn.addEventListener("mouseleave", () => this.#hideLevelUpPreview());
    }


    // --- Chant Mode Select Change Listeners (persist to flags) ---
    this.element.querySelectorAll(".chant-select").forEach(sel => {
      sel.addEventListener("change", (e) => {
        const itemId = e.target.closest("[data-item-id]")?.dataset.itemId;
        if (itemId) {
          this._chantModes.set(itemId, e.target.value);
          // Update inline chant effect summary if present
          const summary = e.target.closest(".chant-mode-row")?.querySelector(".chant-effect-summary");
          if (summary) {
            const mode = e.target.value;
            const chant = CONFIG.MANASHARD.chantModes[mode];
            if (mode === "normal") {
              summary.textContent = "";
            } else {
              const mpText = chant.mpMultiplier !== 1.0 ? `MP ×${chant.mpMultiplier}` : "";
              const effText = `${Math.round(chant.effectModifier * 100)}%`;
              const chargeText = chant.chargesTurn ? "Next Turn" : "";
              const parts = [mpText, chargeText, `${effText} Effect`].filter(Boolean);
              summary.textContent = parts.join(", ");
            }
          }
          // Debounce save to flags (render: false to avoid re-render resetting the select)
          clearTimeout(this._chantSaveTimeout);
          this._chantSaveTimeout = setTimeout(() => {
            this.actor.update(
              { "flags.manashard.chantModes": Object.fromEntries(this._chantModes) },
              { render: false }
            );
          }, 300);
        }
      });
    });

    // --- Info Tooltips ---
    // Skills & Job Manacites
    this.element.querySelectorAll(".skill-grid-card[data-item-id]").forEach(el => {
      el.addEventListener("mouseenter", (e) => {
        const itemId = el.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        const html = (item.type === "manacite" && item.system.manaciteType === "job")
          ? this.#buildJobTooltip(item)
          : this.#buildSkillTooltip(item);
        this.#showInfoTooltip(e, el, html);
      });
      el.addEventListener("mouseleave", () => this.#hideInfoTooltip());
    });
    // Passives
    this.element.querySelectorAll(".passive-card[data-item-id]").forEach(el => {
      el.addEventListener("mouseenter", (e) => {
        const itemId = el.dataset.itemId;
        const prepared = this._lastContext?.passiveAbilities?.find(s => s.id === itemId);
        const item = prepared ?? this.actor.items.get(itemId);
        if (!item) return;
        this.#showInfoTooltip(e, el, this.#buildSkillTooltip(item));
      });
      el.addEventListener("mouseleave", () => this.#hideInfoTooltip());
    });
    // Core stats (sidebar + NPC)
    this.element.querySelectorAll(".ms-stat[data-stat]").forEach(el => {
      el.addEventListener("mouseenter", (e) => {
        const statKey = el.dataset.stat ?? el.closest("[data-stat-key]")?.dataset.statKey;
        if (!statKey) return;
        const html = this.#buildStatTooltip(statKey);
        if (html) this.#showInfoTooltip(e, el, html);
      });
      el.addEventListener("mouseleave", () => this.#hideInfoTooltip());
    });
    // Combat stats (PlayerUnit + NPC + Crystal sheet)
    this.element.querySelectorAll(".ms-hero-stat[data-stat], .ms-def-cell[data-stat], .ms-tac-chip[data-stat]").forEach(el => {
      el.addEventListener("mouseenter", (e) => {
        const statKey = el.dataset.stat;
        if (!statKey) return;
        const html = this.#buildCombatStatTooltip(statKey);
        if (html) this.#showInfoTooltip(e, el, html);
      });
      el.addEventListener("mouseleave", () => this.#hideInfoTooltip());
    });
    // Inventory items
    this.element.querySelectorAll(".inventory-grid-card[data-item-id], .ms-inv-card[data-item-id], .inventory-section .adv-tile[data-item-id]").forEach(el => {
      el.addEventListener("mouseenter", (e) => {
        const item = this.actor.items.get(el.dataset.itemId);
        if (!item) return;
        this.#showInfoTooltip(e, el, this.#buildItemTooltip(item));
      });
      el.addEventListener("mouseleave", () => this.#hideInfoTooltip());
    });
    // Equipped paperdoll slots
    this.element.querySelectorAll(".slot-card-inner[data-item-id]").forEach(el => {
      el.addEventListener("mouseenter", (e) => {
        const item = this.actor.items.get(el.dataset.itemId);
        if (!item) return;
        this.#showInfoTooltip(e, el, this.#buildItemTooltip(item));
      });
      el.addEventListener("mouseleave", () => this.#hideInfoTooltip());
    });

    // Track focus on inputs so we can restore after re-render (bind only once)
    if (!this._focusinBound) {
      this._focusinBound = true;
      this.element.addEventListener("focusin", (e) => {
        const el = e.target;
        if (el.matches("input, select, textarea")) {
          const name = el.getAttribute("name");
          if (name) {
            this._focusedInput = {
              selector: `[name="${name}"]`,
              selStart: el.selectionStart,
              selEnd: el.selectionEnd
            };
          }
        }
      });
    }
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    // Each tab content part gets its active state
    const tabParts = ["stats", "combat", "equipment", "skills", "manacite", "rules", "biography", "loot", "trap"];
    if (tabParts.includes(partId)) {
      const isActive = partId === this._activeTab;
      context.tab = { active: isActive, cssClass: isActive ? "active" : "" };
    }
    return context;
  }

  // --- Drag & Drop Equip ---

  /** @override */
  _onDragStart(event) {
    const li = event.currentTarget.closest("[data-item-id]");
    if (!li) return super._onDragStart(event);
    const item = this.actor.items.get(li.dataset.itemId);
    if (!item) return;
    event.dataTransfer.setData("text/plain", JSON.stringify({
      type: "Item",
      uuid: item.uuid,
      itemId: item.id,
      itemType: item.type
    }));
  }

  /** @override */
  async _onDrop(event) {
    event.preventDefault();

    // Foundry V2 uses event delegation — event.currentTarget is the form,
    // so we must resolve the actual drop target from event.target upward.
    const dropSelectors = [
      "weapon-card", "offhand-card", "armor-card",
      "loadout-accessories", "paperdoll-accessory-slot",
      "skill-loadout-zone"
    ];
    const resolveDropTarget = (el) => {
      while (el && el !== event.currentTarget) {
        for (const cls of dropSelectors) {
          if (el.classList.contains(cls)) return el;
        }
        el = el.parentElement;
      }
      return event.currentTarget;
    };
    const target = resolveDropTarget(event.target);
    target.classList.remove("drop-target-highlight");

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return super._onDrop(event);
    }

    // Handle items dragged from the party stash
    if (data.type === "Item" && data.fromPartyStash) {
      const itemData = data.data;
      if (!itemData) return;
      delete itemData._id;
      delete itemData.flags?.manashard?.depositedBy;
      delete itemData.flags?.manashard?.depositedById;
      await this.actor.createEmbeddedDocuments("Item", [itemData]);
      // Remove from stash
      const stash = game.settings.get("manashard", "partyStash");
      const updated = [...stash];
      updated.splice(data.stashIndex, 1);
      await game.settings.set("manashard", "partyStash", updated);
      ui.notifications.info(`${this.actor.name} withdrew ${itemData.name} from the party stash.`);
      // Re-render the party sheet if open
      const ps = Object.values(foundry.applications.instances).find(a => a.constructor.name === "PartySheet");
      if (ps) ps.render();
      return;
    }

    // Only handle our own actor's items for equip-on-drop
    if (data.type !== "Item" || !data.itemId) return super._onDrop(event);
    const item = this.actor.items.get(data.itemId);
    if (!item) return super._onDrop(event);

    const isWeaponSlot = target.classList.contains("weapon-card");
    const isOffhandSlot = target.classList.contains("offhand-card");
    const isArmorSlot = target.classList.contains("armor-card");
    const isAccessorySlot = target.classList.contains("loadout-accessories") || target.classList.contains("paperdoll-accessory-slot");
    const isLoadoutZone = target.classList.contains("skill-loadout-zone");

    if (isWeaponSlot && item.type === "weapon") {
      // Don't allow natural weapons in paperdoll slots
      if (item.system.category === "natural") return;
      // Unequip current mainhand weapon, equip this one as mainhand
      const current = this.actor.items.find(i => i.type === "weapon" && i.system.equipped && i.system.equipSlot !== "offhand" && i.id !== item.id);
      const updates = [{ _id: item.id, "system.equipped": true, "system.equipSlot": "mainhand" }];
      if (current) updates.push({ _id: current.id, "system.equipped": false, "system.equipSlot": "none" });
      // If the new weapon is 2H, auto-unequip offhand
      if (item.system.handedness === "2h") {
        const offhand = this.actor.items.find(i => i.type === "weapon" && i.system.equipSlot === "offhand");
        if (offhand && !updates.find(u => u._id === offhand.id)) {
          updates.push({ _id: offhand.id, "system.equipped": false, "system.equipSlot": "none" });
        }
      }
      await this.actor.updateEmbeddedDocuments("Item", updates);
    } else if (isOffhandSlot && item.type === "weapon") {
      if (item.system.category === "natural") return;
      // Block offhand if mainhand is 2H
      const mainhand = this.actor.items.find(i => i.type === "weapon" && i.system.equipped && i.system.equipSlot !== "offhand");
      if (mainhand?.system?.handedness === "2h") {
        ui.notifications.warn("Cannot equip off-hand — mainhand weapon is two-handed!");
        return;
      }
      // 2H weapons cannot go in offhand
      if (item.system.handedness === "2h") {
        ui.notifications.warn("Two-handed weapons cannot be equipped in the off-hand!");
        return;
      }
      const current = this.actor.items.find(i => i.type === "weapon" && i.system.equipSlot === "offhand" && i.id !== item.id);
      const updates = [{ _id: item.id, "system.equipped": true, "system.equipSlot": "offhand" }];
      if (current) updates.push({ _id: current.id, "system.equipped": false, "system.equipSlot": "none" });
      await this.actor.updateEmbeddedDocuments("Item", updates);
    } else if (isArmorSlot && item.type === "armor") {
      const current = this.actor.items.find(i => i.type === "armor" && i.system.equipped && i.id !== item.id);
      const updates = [{ _id: item.id, "system.equipped": true }];
      if (current) updates.push({ _id: current.id, "system.equipped": false });
      await this.actor.updateEmbeddedDocuments("Item", updates);
    } else if (isAccessorySlot && item.type === "accessory") {
      // Enforce accessory slot cap
      const maxSlots = this.actor.system.maxAccessorySlots ?? 2;
      const currentCount = this.actor.items.filter(i => i.type === "accessory" && i.system.equipped).length;
      if (currentCount >= maxSlots) {
        ui.notifications.warn(`No empty accessory slots! (${currentCount}/${maxSlots})`);
        return;
      }
      await item.update({ "system.equipped": true });
    } else if (isLoadoutZone && item.type === "manacite" && item.system.manaciteType === "skill") {
      // Drop skill onto loadout zone — absorb if needed, then add to loadout
      if (!item.system.absorbed) {
        // Check for duplicate skill in library
        const existingSkill = this.actor.items.find(i =>
          i.type === "manacite" && i.system.manaciteType === "skill" && i.system.absorbed
          && i.id !== item.id && i.name.toLowerCase() === item.name.toLowerCase()
        );

        if (existingSkill) {
          ui.notifications.warn(`${existingSkill.name} is already in your skill library!`);
          return;
        }

        // First-time absorption
        const confirm = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Absorb Manacite" },
          content: `<p>Absorb <strong>${item.name}</strong>?</p><p>This will permanently learn the skill and destroy the crystal.</p>`,
          yes: { label: "Absorb", icon: "fas fa-sun" },
          no: { label: "Cancel" }
        });
        if (!confirm) return;
        const library = [...(this.actor.system.skillLibrary ?? [])];
        if (!library.includes(item.id)) library.push(item.id);
        await item.update({ "system.absorbed": true });
        await this.actor.update({ "system.skillLibrary": library });
        await postAbsorptionCard(item, this.actor);
      }
      // Add to loadout if not already there
      const loadout = [...(this.actor.system.skillLoadout ?? [])];
      if (!loadout.includes(item.id)) {
        const sys = this.actor.system;
        const isFree = sys._loadoutFreeSkillIds?.has(item.id);
        if (!isFree && sys._loadoutSlotsUsed >= sys.maxLoadoutSlots) {
          ui.notifications.warn(`Loadout full! (${sys._loadoutSlotsUsed}/${sys.maxLoadoutSlots} slots)`);
          return;
        }
        loadout.push(item.id);
        await this.actor.update({ "system.skillLoadout": loadout });
      }
    } else {
      return super._onDrop(event);
    }
  }

  // --- Action Handlers ---

  /**
   * Switch the active tab.
   */
  static #onSwitchTab(event, target) {
    const tab = target.dataset.tab;
    if (!tab) return;
    this._activeTab = tab;

    // Toggle tab bar button active state
    this.element.querySelectorAll('.ms-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });

    // Toggle PART section visibility using the hidden attribute
    // Also toggle .active directly on the wrapper (which IS the .tab-content element in V13)
    const tabPartNames = ['stats', 'equipment', 'skills', 'biography', 'combat', 'loot', 'trap'];
    for (const partName of tabPartNames) {
      const wrapper = this.element.querySelector(`[data-application-part="${partName}"]`);
      if (wrapper) {
        const isActive = partName === tab;
        wrapper.hidden = !isActive;
        wrapper.classList.toggle('active', isActive);
      }
    }
  }

  /**
   * Open the stat check forecast dialog, then roll and post a styled chat card.
   * If a target token is selected, initiates a contested check via socket.
   */
  static async #onRollStat(event, target) {
    const statKey = target.dataset.stat;
    if (!statKey) return;

    // Check for targeted token (contested check)
    const targeted = game.user.targets.first();
    const targetActor = targeted?.actor ?? null;

    // Show forecast dialog
    const dialogResult = await showStatCheckForecastDialog(this.actor, {
      defaultStat: statKey,
      targetActor
    });
    if (!dialogResult) return;

    if (targetActor) {
      // ── Contested Check Flow ──
      const initiatorStatLabel = game.i18n.localize(
        CONFIG.MANASHARD.statAbbreviations[dialogResult.statKey]
      ) || dialogResult.statKey.toUpperCase();

      const contestData = {
        initiatorName: this.actor.name,
        initiatorStatLabel,
        targetActorId: targetActor.id,
        difficultyKey: dialogResult.difficultyKey,
        context: dialogResult.context
      };

      // Find the owning player for the target actor (not GM).
      // Uses Foundry's ownership: a player with OWNER-level permission on the actor.
      const owningPlayer = game.users.find(u =>
        !u.isGM && u.active && targetActor.testUserPermission(u, "OWNER")
      );

      let opponentStatKey;
      if (owningPlayer) {
        // Target is a Player Character with an active owning player — ask them via socket
        opponentStatKey = await requestContestedStatPick(owningPlayer.id, contestData);
      } else {
        // Target is an NPC or no player is connected — GM handles it locally
        opponentStatKey = await showContestedStatPickDialog(contestData);
      }

      if (!opponentStatKey) {
        ui.notifications.info("Contested check was declined or timed out.");
        return;
      }

      // Resolve both checks
      const myResult = await resolveStatCheck(this.actor, dialogResult.statKey, dialogResult.difficultyKey, dialogResult.conditionalBonus ?? 0);
      const theirResult = await resolveStatCheck(targetActor, opponentStatKey, dialogResult.difficultyKey);
      const { winnerId, reason } = resolveContestedCheck(myResult, theirResult);

      await postStatCheckCard(this.actor, myResult, {
        context: dialogResult.context,
        activeCondLabels: dialogResult.activeCondLabels ?? [],
        contested: true,
        targetActor,
        opponentResult: theirResult,
        winnerId,
        reason
      });
    } else {
      // ── Solo Check Flow ──
      const result = await resolveStatCheck(this.actor, dialogResult.statKey, dialogResult.difficultyKey, dialogResult.conditionalBonus ?? 0);
      await postStatCheckCard(this.actor, result, {
        context: dialogResult.context,
        activeCondLabels: dialogResult.activeCondLabels ?? []
      });
    }
  }

  static async #onAddItem(event, target) {
    const type = target.dataset.type;
    if (!type) return;
    const typeLabels = {
      weapon: "New Weapon",
      armor: "New Armor",
      accessory: "New Accessory",
      manacite: "New Manacite",
      consumable: "New Consumable",
      species: "New Species"
    };
    await Item.create({
      name: typeLabels[type] ?? `New ${type}`,
      type,
      img: "icons/svg/item-bag.svg"
    }, { parent: this.actor });
  }

  static async #onEditItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    if (!itemId) return;
    const item = this.actor.items.get(itemId);
    item?.sheet.render(true);
  }

  static async #onDeleteItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    if (!itemId) return;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Delete ${item.name}?` },
      content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`
    });
    if (confirmed) await item.delete();
  }

  static async #onToggleEquip(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    if (!itemId) return;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    // Accessory slot cap: prevent equipping beyond max slots
    if (item.type === "accessory" && !item.system.equipped && this.actor.type === "character") {
      const maxSlots = this.actor.system.maxAccessorySlots ?? 2;
      const currentCount = this.actor.items.filter(i => i.type === "accessory" && i.system.equipped).length;
      if (currentCount >= maxSlots) {
        ui.notifications.warn(`No empty accessory slots! (${currentCount}/${maxSlots})`);
        return;
      }
    }

    // Weight cap: prevent equipping gear that would exceed carrying capacity
    if ((item.type === "weapon" || item.type === "armor") && !item.system.equipped && this.actor.type === "character") {
      const sys = this.actor.system;
      const itemWeight = item.system.weight ?? 0;
      // Calculate what total weight would be with this item equipped
      let newTotal = sys.totalWeight + itemWeight;
      // If swapping (same type already equipped), subtract the old item's weight
      if (item.type === "weapon") {
        const curWpn = this.actor.items.find(i => i.type === "weapon" && i.system.equipped && i.system.equipSlot !== "offhand");
        if (curWpn) newTotal -= curWpn.system.weight ?? 0;
      } else if (item.type === "armor") {
        const curArm = this.actor.items.find(i => i.type === "armor" && i.system.equipped);
        if (curArm) newTotal -= curArm.system.weight ?? 0;
      }
      if (newTotal > sys.carryingCapacity) return;
    }

    // Weapons: sync equipSlot with equipped boolean
    if (item.type === "weapon") {
      const newEquipped = !item.system.equipped;
      // Unequip the currently equipped mainhand weapon (if any) before equipping a new one
      if (newEquipped) {
        const curMainhand = this.actor.items.find(i => i.type === "weapon" && i.system.equipped && i.system.equipSlot !== "offhand" && i.id !== item.id);
        if (curMainhand) {
          await curMainhand.update({ "system.equipped": false, "system.equipSlot": "none" });
        }
      }
      await item.update({
        "system.equipped": newEquipped,
        "system.equipSlot": newEquipped ? "mainhand" : "none"
      });
    } else if (item.type === "manacite" && item.system.manaciteType === "job") {
      // Job exclusivity: only one Job can be equipped at a time
      const newEquipped = !item.system.equipped;
      if (newEquipped) {
        const curJob = this.actor.items.find(i => i.type === "manacite" && i.system.manaciteType === "job" && i.system.equipped && i.id !== item.id);
        if (curJob) {
          await curJob.update({ "system.equipped": false });
        }
      }
      await item.update({ "system.equipped": newEquipped });
    } else {
      await item.update({ "system.equipped": !item.system.equipped });
    }
  }

  static async #onUnequipOffhand(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    if (!itemId) return;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    await item.update({ "system.equipped": false, "system.equipSlot": "none" });
  }

  static async #onUnequipJob(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    if (!itemId) return;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    await item.update({ "system.equipped": false });
  }

  static async #onRollAttack(event, target) {
    const actor = this.actor;
    const wpn = actor.items.find(i => i.type === "weapon" && i.system.equipped && i.system.equipSlot !== "offhand");
    const isMagical = (wpn?.system?.damageType ?? "physical") === "magical";
    const targeted = game.user.targets.first();
    const defBlockChance = (targeted?.actor?.system?.blockChance ?? 0);

    // Build forecast context and show dialog
    const ctx = buildForecastContext(actor, targeted, { mode: "weapon", weaponItem: wpn });
    const result = await showForecastDialog(ctx);
    if (!result) return;

    const attackOptions = {
      defenderActor: targeted?.actor ?? null,
      defenderEvasion: result.eva,
      defenderDef: isMagical ? 0 : result.def,
      defenderSpi: isMagical ? result.def : 0,
      defenderCritAvoid: result.critEvo,
      defenderBlockChance: defBlockChance,
      targetTokenId: targeted?.id ?? null,
      weaponOverride: wpn
    };

    // Execute the attack
    await actor.rollAttack(attackOptions);

    // Off-hand strike: if user opted in via the forecast checkbox
    if (result.offhand) {
      const offhandWeapon = actor.items.find(i => i.type === "weapon" && i.system.equipSlot === "offhand");
      if (offhandWeapon) {
        const offhandIsMagical = (offhandWeapon.system?.damageType ?? "physical") === "magical";
        await actor.rollAttack({
          defenderActor: targeted?.actor ?? null,
          defenderEvasion: result.eva,
          defenderDef: offhandIsMagical ? 0 : result.def,
          defenderSpi: offhandIsMagical ? result.def : 0,
          defenderCritAvoid: result.critEvo,
          defenderBlockChance: defBlockChance,
          targetTokenId: targeted?.id ?? null,
          weaponOverride: offhandWeapon,
          damageMultiplier: 0.5,
          isOffhand: true
        });
      }
    }

    // Auto-advance combat turn
    const combat = game.combat;
    if (combat?.combatant?.actor?.id === actor.id) {
      await combat.endTurn();
    }
  }

  /**
   * Roll an attack using a specific natural weapon.
   */
  static async #onRollNaturalAttack(event, target) {
    const actor = this.actor;
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const weapon = actor.items.get(itemId);
    if (!weapon) return;

    const isMagical = (weapon.system?.damageType ?? "physical") === "magical";
    const targeted = game.user.targets.first();
    const defBlockChance = targeted?.actor?.system?.blockChance ?? 0;

    // Build forecast context and show dialog
    const ctx = buildForecastContext(actor, targeted, { mode: "natural", weaponItem: weapon });
    const result = await showForecastDialog(ctx);
    if (!result) return;

    const attackOptions = {
      weaponOverride: weapon,
      defenderActor: targeted?.actor ?? null,
      defenderEvasion: result.eva,
      defenderDef: isMagical ? 0 : result.def,
      defenderSpi: isMagical ? result.def : 0,
      defenderCritAvoid: result.critEvo,
      defenderBlockChance: defBlockChance,
      targetTokenId: targeted?.id ?? null
    };

    await actor.rollAttack(attackOptions);

    const combat = game.combat;
    if (combat?.combatant?.actor?.id === actor.id) {
      await combat.endTurn();
    }
  }

  /**
   * Open the FilePicker to change the actor's portrait image.
   */
  static async #onOpenWizard(event, target) {
    const wizard = new game.manashard.CharacterCreationWizard(this.actor);
    wizard.render(true);
  }

  static async #onEditImage(event, target) {
    const sys = this.actor.system;
    const result = await PortraitAdjuster.open({
      img: this.actor.img,
      offsetX: sys.portraitOffsetX ?? 50,
      offsetY: sys.portraitOffsetY ?? 0,
      mirrored: sys.portraitMirrored ?? false
    });
    if (!result) return;
    await this.actor.update({
      img: result.img,
      "system.portraitOffsetX": result.offsetX,
      "system.portraitOffsetY": result.offsetY,
      "system.portraitMirrored": result.mirrored
    });
  }

  static async #onUseConsumable(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    if (!itemId) return;
    await this.actor.useConsumable(itemId);
  }


  // --- Item Context Menu (Right-Click) ---

  #showItemContextMenu(event, item, { isLoot = false, isLibrary = false, isLoadout = false } = {}) {
    // Remove any existing context menu
    document.querySelector(".ms-context-menu")?.remove();

    // Determine if item is equippable (manacite uses socketing, not equip toggle)
    const equippableTypes = new Set(["weapon", "armor", "accessory"]);
    const isEquippable = !isLoot && equippableTypes.has(item.type);
    const isEquipped = item.system.equipped;
    const isJobManacite = !isLoot && item.type === "manacite" && item.system.manaciteType === "job";
    const isSkillManacite = !isLoot && item.type === "manacite" && item.system.manaciteType === "skill";

    // Build menu options
    let options = "";
    if (isEquippable) {
      if (isEquipped) {
        options += `<a class="ms-ctx-option" data-ctx="unequip"><i class="fas fa-circle-xmark"></i> Unequip</a>`;
      } else if (item.type === "weapon" && item.system.handedness === "1h") {
        // 1-handed weapons and shields can go in either hand
        options += `<a class="ms-ctx-option" data-ctx="equip-main"><i class="fas fa-hand-fist"></i> Equip (Main)</a>`;
        options += `<a class="ms-ctx-option" data-ctx="equip-off"><i class="fas fa-shield-halved"></i> Equip (Off)</a>`;
      } else {
        options += `<a class="ms-ctx-option" data-ctx="equip-main"><i class="fas fa-hand-fist"></i> Equip</a>`;
      }
    }
    if (isJobManacite) {
      if (isEquipped) {
        options += `<a class="ms-ctx-option" data-ctx="unequip-job"><i class="fas fa-circle-xmark"></i> Unequip Job</a>`;
      } else {
        options += `<a class="ms-ctx-option" data-ctx="equip-job"><i class="fas fa-briefcase"></i> Equip Job</a>`;
      }
    }
    if (isSkillManacite) {
      if (!item.system.absorbed && this.actor.type === "character") {
        options += `<a class="ms-ctx-option" data-ctx="absorb"><i class="fas fa-sun"></i> Absorb</a>`;
      } else if (isLoadout) {
        options += `<a class="ms-ctx-option" data-ctx="remove-from-loadout"><i class="fas fa-circle-xmark"></i> Remove from Loadout</a>`;
      } else if (isLibrary) {
        const inLoadout = (this.actor.system.skillLoadout ?? []).includes(item.id);
        if (!inLoadout) {
          options += `<a class="ms-ctx-option" data-ctx="add-to-loadout"><i class="fas fa-plus-circle"></i> Add to Loadout</a>`;
        } else {
          options += `<a class="ms-ctx-option" data-ctx="remove-from-loadout"><i class="fas fa-circle-xmark"></i> Remove from Loadout</a>`;
        }
      }
    }
    options += `<a class="ms-ctx-option" data-ctx="edit"><i class="fas fa-edit"></i> Edit</a>`;
    options += `<a class="ms-ctx-option ms-ctx-danger" data-ctx="delete"><i class="fas fa-trash"></i> Delete</a>`;

    const menu = document.createElement("div");
    menu.classList.add("ms-context-menu");
    menu.innerHTML = options;

    // Position at cursor
    menu.style.position = "fixed";
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.style.zIndex = "10000";

    document.body.appendChild(menu);

    // Keep menu on screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 4}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 4}px`;

    // Handle clicks
    menu.addEventListener("click", async (e) => {
      const action = e.target.closest("[data-ctx]")?.dataset.ctx;
      menu.remove();
      if (action === "edit") {
        item.sheet.render(true);
      } else if (action === "unequip") {
        if (item.type === "weapon") {
          await item.update({ "system.equipped": false, "system.equipSlot": "none" });
        } else {
          await item.update({ "system.equipped": false });
        }
      } else if (action === "equip-main") {
        if (item.type === "weapon") {
          // Unequip current mainhand weapon
          const curMainhand = this.actor.items.find(i => i.type === "weapon" && i.system.equipped && i.system.equipSlot !== "offhand" && i.id !== item.id);
          if (curMainhand) {
            await curMainhand.update({ "system.equipped": false, "system.equipSlot": "none" });
          }
          // If 2H, also unequip offhand
          if (item.system.handedness === "2h") {
            const curOffhand = this.actor.items.find(i => i.type === "weapon" && i.system.equipped && i.system.equipSlot === "offhand");
            if (curOffhand) {
              await curOffhand.update({ "system.equipped": false, "system.equipSlot": "none" });
            }
          }
          await item.update({ "system.equipped": true, "system.equipSlot": "mainhand" });
        } else {
          await item.update({ "system.equipped": true });
        }
      } else if (action === "equip-off") {
        // Equip 1H weapon/shield to off hand
        const mainhandIs2H = this.actor.system._mainhandIs2H ?? false;
        if (mainhandIs2H) {
          ui.notifications.warn("Cannot equip off-hand while wielding a two-handed weapon.");
        } else {
          const curOffhand = this.actor.items.find(i => i.type === "weapon" && i.system.equipped && i.system.equipSlot === "offhand");
          if (curOffhand) {
            await curOffhand.update({ "system.equipped": false, "system.equipSlot": "none" });
          }
          await item.update({ "system.equipped": true, "system.equipSlot": "offhand" });
        }
      } else if (action === "equip-job") {
        // Unequip current job first
        const curJob = this.actor.items.find(i => i.type === "manacite" && i.system.manaciteType === "job" && i.system.equipped && i.id !== item.id);
        if (curJob) await curJob.update({ "system.equipped": false });
        await item.update({ "system.equipped": true });
      } else if (action === "unequip-job") {
        await item.update({ "system.equipped": false });
      } else if (action === "equip-skill") {
        await item.update({ "system.equipped": true });
      } else if (action === "unequip-skill") {
        await item.update({ "system.equipped": false });
      } else if (action === "absorb") {
        this.#absorbSkillFromContext(item);
      } else if (action === "add-to-loadout") {
        const loadout = [...(this.actor.system.skillLoadout ?? [])];
        if (!loadout.includes(item.id)) {
          loadout.push(item.id);
          await this.actor.update({ "system.skillLoadout": loadout });
        }
      } else if (action === "remove-from-loadout") {
        const loadout = (this.actor.system.skillLoadout ?? []).filter(id => id !== item.id);
        await this.actor.update({ "system.skillLoadout": loadout });
      } else if (action === "delete") {
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          title: `Delete ${item.name}?`,
          content: `<p>Remove <strong>${item.name}</strong> from this actor?</p>`
        });
        if (confirmed) {
          // If this item is in the loot table, remove its entry too
          if (isLoot) {
            const lootTable = foundry.utils.deepClone(this.actor.system.lootTable ?? []);
            const idx = lootTable.findIndex(e => e.itemId === item.id);
            if (idx !== -1) {
              lootTable.splice(idx, 1);
              await this.actor.update({ "system.lootTable": lootTable });
            }
          }
          await item.delete();
        }
      }
    });

    // Close on click elsewhere or Escape
    const close = (e) => {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("pointerdown", close); }
    };
    const closeKey = (e) => {
      if (e.key === "Escape") { menu.remove(); document.removeEventListener("keydown", closeKey); }
    };
    setTimeout(() => {
      document.addEventListener("pointerdown", close);
      document.addEventListener("keydown", closeKey);
    }, 0);
  }

  /**
   * Absorb a skill manacite from the context menu (same logic as drop-to-loadout absorption).
   */
  async #absorbSkillFromContext(item) {
    if (item.system.absorbed) return;

    // Check for duplicate skill in library
    const existingSkill = this.actor.items.find(i =>
      i.type === "manacite" && i.system.manaciteType === "skill" && i.system.absorbed
      && i.id !== item.id && i.name.toLowerCase() === item.name.toLowerCase()
    );

    if (existingSkill) {
      ui.notifications.warn(`${existingSkill.name} is already in your skill library!`);
      return;
    }

    // First-time absorption
    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Absorb Manacite" },
      content: `<p>Absorb <strong>${item.name}</strong>?</p><p>This will permanently learn the skill and destroy the crystal.</p>`,
      yes: { label: "Absorb", icon: "fas fa-sun" },
      no: { label: "Cancel" }
    });
    if (!confirm) return;
    const library = [...(this.actor.system.skillLibrary ?? [])];
    if (!library.includes(item.id)) library.push(item.id);
    await item.update({ "system.absorbed": true });
    await this.actor.update({ "system.skillLibrary": library });
    await postAbsorptionCard(item, this.actor);
  }

  // --- Unified Info Tooltip System ---

  static #STAT_INFO = {
    str: { name: "Strength", hint: "Physical DMG" },
    agi: { name: "Agility", hint: "ACC, CRIT, P.EVA" },
    mag: { name: "Magic", hint: "Magical DMG, MP Regen" },
    end: { name: "Endurance", hint: "P.DEF, BLOCK, CARRY" },
    spi: { name: "Spirit", hint: "M.EVA, M.DEF" },
    luk: { name: "Luck", hint: "ACC, CRIT, C.EVO" },
    int: { name: "Intelligence", hint: "Skill checks" },
    chm: { name: "Charisma", hint: "Skill checks" }
  };

  static #COMBAT_STAT_INFO = {
    damage:      { name: "Damage",     formula: "STR/MAG + Might" },
    accuracy:    { name: "Accuracy",   formula: "60 + AGI\u00d72 + LUK" },
    critical:    { name: "Critical",   formula: "AGI/2 + LUK/2 + Weapon Crit" },
    peva:        { name: "P.EVA",      formula: "20 + AGI×2" },
    meva:        { name: "M.EVA",      formula: "20 + SPI×2" },
    critEvo:     { name: "C.EVO",      formula: "5 + LUK" },
    pdef:        { name: "P.DEF",      formula: "Armor + END" },
    mdef:        { name: "M.DEF",      formula: "Armor + SPI" },
    blockChance: { name: "Block",      formula: "Shield + END" },
    mov:         { name: "Movement",   formula: "Base 6 + modifiers" },
    vision:      { name: "Vision",     formula: "Base 6 + modifiers" },
    mpRegen:     { name: "MP Regen",   formula: "SPI / 4" },
    carry:       { name: "Carry",      formula: "5 + STR + END/2" }
  };

  #showInfoTooltip(event, el, html) {
    this.#hideInfoTooltip();
    const tooltip = document.createElement("div");
    tooltip.classList.add("ms-info-tooltip");
    tooltip.innerHTML = html;

    const container = this.element.querySelector(".window-content") ?? this.element;
    container.appendChild(tooltip);

    const rect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const ttRect = tooltip.getBoundingClientRect();

    let top = rect.bottom - containerRect.top + 6;
    // Flip above if near bottom
    if (top + ttRect.height > containerRect.height) {
      top = rect.top - containerRect.top - ttRect.height - 6;
    }
    let left = rect.left - containerRect.left;
    // Keep on screen
    if (left + ttRect.width > containerRect.width) {
      left = containerRect.width - ttRect.width - 4;
    }

    tooltip.style.position = "absolute";
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${Math.max(0, left)}px`;
    tooltip.style.zIndex = "200";
  }

  #hideInfoTooltip() {
    (this.element.querySelector(".window-content") ?? this.element)
      .querySelector(".ms-info-tooltip")?.remove();
  }

  #buildSkillTooltip(itemOrData) {
    // Handle both raw item objects and prepared skill data
    const name = itemOrData.name;
    const img = itemOrData.img;
    const skillType = itemOrData.skillType ?? itemOrData.system?.skillType ?? "";
    const mpCost = itemOrData.mpCost ?? itemOrData.system?.mpCost ?? 0;
    const range = itemOrData.range ?? itemOrData.system?.rangeDisplay ?? "";
    const element = itemOrData.element ?? itemOrData.system?.element ?? "";
    const rawDesc = itemOrData.description ?? itemOrData.system?.description ?? "";
    const source = itemOrData.source ?? "";

    let stats = "";
    if (mpCost) stats += `<div class="ms-tt-stat"><span class="ms-tt-stat-lbl">MP</span><span class="ms-tt-stat-val">${mpCost}</span></div>`;
    if (range) stats += `<div class="ms-tt-stat"><span class="ms-tt-stat-lbl">RNG</span><span class="ms-tt-stat-val">${range}</span></div>`;
    if (element) stats += `<div class="ms-tt-stat"><span class="ms-tt-stat-lbl">ELE</span><span class="ms-tt-stat-val element-text-${element}">${element}</span></div>`;

    // Resolve [[...]] formulas containing SL, then strip HTML for plain text preview
    const sl = 1;
    const resolvedDesc = rawDesc.replace(/\[\[([^\]]+)\]\]/g, (match, expr) => {
      if (!expr.includes("SL")) return match;
      try {
        const resolved = expr.replace(/\bSL\b/g, String(sl));
        if (/^[\d\s+\-*/().]+$/.test(resolved)) return String(Math.floor(eval(resolved)));
        return match;
      } catch { return match; }
    });
    const plainDesc = resolvedDesc ? resolvedDesc.replace(/<[^>]*>/g, "").trim() : "";

    return `
      <div class="ms-tt-header">
        <img src="${img}" class="ms-tt-icon" />
        <div class="ms-tt-title-col">
          <span class="ms-tt-name">${name}</span>
          ${skillType ? `<span class="skill-type-badge ${skillType}">${skillType}</span>` : ""}
        </div>
      </div>
      ${stats ? `<div class="ms-tt-stats">${stats}</div>` : ""}
      ${plainDesc ? `<div class="ms-tt-desc">${plainDesc}</div>` : ""}
      ${source ? `<div class="ms-tt-source">${source}</div>` : ""}
    `;
  }

  #buildJobTooltip(item) {
    const name = item.name;
    const img = item.img;
    const growthRates = item.system.growthRates ?? {};
    const desc = item.system.description ?? "";

    let growthRows = "";
    for (const [key, val] of Object.entries(growthRates)) {
      if (!val) continue;
      const abbr = game.i18n.localize(CONFIG.MANASHARD.statAbbreviations?.[key]) || key;
      growthRows += `<div class="ms-tt-stat"><span class="ms-tt-stat-lbl">${abbr}</span><span class="ms-tt-stat-val">+${val}%</span></div>`;
    }

    const plainDesc = desc ? desc.replace(/<[^>]*>/g, "").trim() : "";
    const truncDesc = plainDesc.length > 120 ? plainDesc.slice(0, 120) + "..." : plainDesc;

    return `
      <div class="ms-tt-header">
        <img src="${img}" class="ms-tt-icon" />
        <div class="ms-tt-title-col">
          <span class="ms-tt-name">${name}</span>
          <span class="skill-type-badge" style="background:rgba(68,204,255,0.15);color:#44ccff;">Job</span>
        </div>
      </div>
      ${growthRows ? `<div class="ms-tt-stats">${growthRows}</div>` : ""}
      ${truncDesc ? `<div class="ms-tt-desc">${truncDesc}</div>` : ""}
    `;
  }

  #buildStatTooltip(statKey) {
    const info = ManashardActorSheet.#STAT_INFO[statKey];
    if (!info) return null;
    const stat = this.actor.system.stats[statKey];
    if (!stat) return null;

    return `
      <div class="ms-tt-header">
        <div class="ms-tt-title-col">
          <span class="ms-tt-name">${info.name}</span>
          <span class="ms-tt-formula">${info.hint}</span>
        </div>
      </div>
      <div class="ms-tt-stats">
        <div class="ms-tt-stat"><span class="ms-tt-stat-lbl">Value</span><span class="ms-tt-stat-val">${stat.value}</span></div>
        ${stat.growth !== undefined ? `<div class="ms-tt-stat"><span class="ms-tt-stat-lbl">Growth</span><span class="ms-tt-stat-val">${this.actor.system._effectiveGrowths?.[statKey] ?? stat.growth}%</span></div>` : ""}
      </div>
    `;
  }

  #buildCombatStatTooltip(statKey) {
    const info = ManashardActorSheet.#COMBAT_STAT_INFO[statKey];
    if (!info) return null;
    const system = this.actor.system;
    // Map short keys to actual system property names where they differ
    const propKey = statKey === "carry" ? "carryingCapacity" : statKey;
    const value = system[propKey];

    let modRows = "";
    const modifiers = system._modifiers;
    if (modifiers?.hasModifiers(propKey)) {
      const entries = modifiers.getEntries(propKey);
      for (const entry of entries) {
        const sign = entry.value >= 0 ? "+" : "";
        const cls = entry.value >= 0 ? "ms-tt-positive" : "ms-tt-negative";
        const sourceName = entry.source.itemType === "status"
          ? entry.source.itemName.charAt(0).toUpperCase() + entry.source.itemName.slice(1)
          : entry.source.itemName;
        modRows += `<div class="ms-tt-stat"><span class="ms-tt-stat-lbl">${sourceName}</span><span class="ms-tt-stat-val ${cls}">${sign}${entry.value}</span></div>`;
      }
    }

    return `
      <div class="ms-tt-header">
        <div class="ms-tt-title-col">
          <span class="ms-tt-name">${info.name}</span>
          <span class="ms-tt-formula">${info.formula}</span>
        </div>
      </div>
      <div class="ms-tt-stats">
        <div class="ms-tt-stat"><span class="ms-tt-stat-lbl">Total</span><span class="ms-tt-stat-val ms-tt-bright">${value ?? "—"}</span></div>
        ${modRows}
      </div>
    `;
  }

  #buildItemTooltip(item) {
    const name = item.name;
    const img = item.img;
    const type = item.type;
    const sys = item.system;
    const actorStats = this.actor.system.stats;

    let stats = "";
    let deltaRows = "";

    if (type === "weapon") {
      stats += `<div class="ms-tt-stat"><span class="ms-tt-stat-lbl">Might</span><span class="ms-tt-stat-val">${sys.might ?? 0}</span></div>`;
      stats += `<div class="ms-tt-stat"><span class="ms-tt-stat-lbl">Crit</span><span class="ms-tt-stat-val">${sys.crit ?? 0}</span></div>`;
      const rangeLabel = sys.rangeType === "melee" ? "Reach" : "Range";
      const rangeVal = sys.minRange === sys.maxRange ? `${sys.minRange}` : `${sys.minRange}\u2013${sys.maxRange}`;
      stats += `<div class="ms-tt-stat"><span class="ms-tt-stat-lbl">${rangeLabel}</span><span class="ms-tt-stat-val">${rangeVal}</span></div>`;
      stats += `<div class="ms-tt-stat"><span class="ms-tt-stat-lbl">Weight</span><span class="ms-tt-stat-val">${sys.weight ?? 0}</span></div>`;

      // Comparison deltas
      if (actorStats) {
        const deltas = [];
        // Helper: resolve scaling stat for a weapon's category and damageType
        const resolveScaling = (cat, dt) => {
          const magCat = cat === "staves" || cat === "grimoires";
          if (dt === "magical" || magCat) return actorStats.mag.value;
          if (cat === "swords") return Math.max(actorStats.str.value, actorStats.agi.value);
          return actorStats.str.value;
        };
        if (sys.equipped) {
          const scalingStat = resolveScaling(sys.category, sys.damageType);
          const unarmedDmg = scalingStat;
          const equippedDmg = scalingStat + (sys.might ?? 0);
          deltas.push({ label: "DMG", delta: equippedDmg - unarmedDmg });
          // Accuracy no longer depends on weapon hit — no ACC delta for equipped weapon
          deltas.push({ label: "ACC", delta: 0 });
          const baseCrit = actorStats.luk.value * 2;
          deltas.push({ label: "CRIT", delta: baseCrit - (baseCrit + (sys.crit ?? 0)) });
          deltas.push({ label: "WT", delta: -(sys.weight ?? 0), invertColor: true });
        } else {
          const cur = this.actor.items.find(i => i.type === "weapon" && i.system.equipped);
          const curMight = cur?.system.might ?? 0, curCrit = cur?.system.crit ?? 0, curWt = cur?.system.weight ?? 0;
          const curScaling = resolveScaling(cur?.system.category, cur?.system.damageType ?? "physical");
          const newScaling = resolveScaling(sys.category, sys.damageType);
          const curDmg = curScaling + curMight;
          const newDmg = newScaling + (sys.might ?? 0);
          deltas.push({ label: "DMG", delta: newDmg - curDmg });
          // Accuracy no longer depends on weapon hit — no ACC delta for weapon swap
          deltas.push({ label: "ACC", delta: 0 });
          deltas.push({ label: "CRIT", delta: (sys.crit ?? 0) - curCrit });
          deltas.push({ label: "WT", delta: (sys.weight ?? 0) - curWt, invertColor: true });
        }
        deltaRows = this.#buildDeltaRows(deltas);
      }
    } else if (type === "armor") {
      stats += `<div class="ms-tt-stat"><span class="ms-tt-stat-lbl">PDEF</span><span class="ms-tt-stat-val">${sys.pdef ?? 0}</span></div>`;
      stats += `<div class="ms-tt-stat"><span class="ms-tt-stat-lbl">MDEF</span><span class="ms-tt-stat-val">${sys.mdef ?? 0}</span></div>`;
      stats += `<div class="ms-tt-stat"><span class="ms-tt-stat-lbl">Weight</span><span class="ms-tt-stat-val">${sys.weight ?? 0}</span></div>`;

      if (actorStats) {
        const deltas = [];
        if (sys.equipped) {
          deltas.push({ label: "PDEF", delta: -(sys.pdef ?? 0) });
          deltas.push({ label: "MDEF", delta: -(sys.mdef ?? 0) });
          deltas.push({ label: "WT", delta: -(sys.weight ?? 0), invertColor: true });
        } else {
          const cur = this.actor.items.find(i => i.type === "armor" && i.system.equipped);
          deltas.push({ label: "PDEF", delta: (sys.pdef ?? 0) - (cur?.system.pdef ?? 0) });
          deltas.push({ label: "MDEF", delta: (sys.mdef ?? 0) - (cur?.system.mdef ?? 0) });
          deltas.push({ label: "WT", delta: (sys.weight ?? 0) - (cur?.system.weight ?? 0), invertColor: true });
        }
        deltaRows = this.#buildDeltaRows(deltas);
      }
    } else if (type === "consumable") {
      const desc = sys.description ? sys.description.replace(/<[^>]*>/g, "").trim() : "";
      const truncDesc = desc.length > 100 ? desc.slice(0, 100) + "..." : desc;
      if (sys.quantity) stats += `<div class="ms-tt-stat"><span class="ms-tt-stat-lbl">Qty</span><span class="ms-tt-stat-val">${sys.quantity}</span></div>`;
      if (truncDesc) return `
        <div class="ms-tt-header">
          <img src="${img}" class="ms-tt-icon" />
          <div class="ms-tt-title-col">
            <span class="ms-tt-name">${name}</span>
            <span class="ms-tt-type">${type}</span>
          </div>
        </div>
        ${stats ? `<div class="ms-tt-stats">${stats}</div>` : ""}
        <div class="ms-tt-desc">${truncDesc}</div>
      `;
    }

    return `
      <div class="ms-tt-header">
        <img src="${img}" class="ms-tt-icon" />
        <div class="ms-tt-title-col">
          <span class="ms-tt-name">${name}</span>
          <span class="ms-tt-type">${type}</span>
        </div>
      </div>
      ${stats ? `<div class="ms-tt-stats">${stats}</div>` : ""}
      ${deltaRows ? `<div class="ms-tt-deltas">${deltaRows}</div>` : ""}
    `;
  }

  #buildDeltaRows(deltas) {
    return deltas.map(d => {
      if (d.delta === 0) return `<div class="ms-tt-stat"><span class="ms-tt-stat-lbl">${d.label}</span><span class="ms-tt-stat-val ms-tt-neutral">—</span></div>`;
      const positive = d.invertColor ? d.delta < 0 : d.delta > 0;
      const cls = positive ? "ms-tt-positive" : "ms-tt-negative";
      const sign = d.delta > 0 ? "+" : "";
      return `<div class="ms-tt-stat"><span class="ms-tt-stat-lbl">${d.label}</span><span class="ms-tt-stat-val ${cls}">${sign}${d.delta}</span></div>`;
    }).join("");
  }

  // --- Modifier Breakdown Tooltip ---

  #showModifierTooltip(event, el) {
    this.#hideModifierTooltip();

    // Determine the stat key from data attributes or parent
    const statKey = el.dataset.statKey ?? el.closest(".derived-cell")?.dataset.stat;
    if (!statKey) return;

    const system = this.actor.system;
    const modifiers = system._modifiers;
    if (!modifiers?.hasModifiers(statKey)) return;

    const entries = modifiers.getEntries(statKey);
    const baseValue = system._baseStats?.[statKey] ?? system._baseDerived?.[statKey] ?? "?";
    const total = modifiers.getTotal(statKey);
    const totalSign = total >= 0 ? "+" : "";

    let rows = `<div class="mt-base">Base: ${baseValue}</div>`;
    for (const entry of entries) {
      const sign = entry.value >= 0 ? "+" : "";
      const cls = entry.value >= 0 ? "mt-positive" : "mt-negative";
      const iType = entry.source.itemType;
      let sourceName = iType === "status"
        ? entry.source.itemName.charAt(0).toUpperCase() + entry.source.itemName.slice(1)
        : entry.source.itemName;
      const sourceClass = iType === "jobSignature" ? "mt-source mt-source-job" : iType === "speciesPassive" ? "mt-source mt-source-species" : "mt-source";
      const sourceIcon = iType === "jobSignature" ? '<i class="fas fa-briefcase"></i> ' : iType === "speciesPassive" ? '<i class="fas fa-dna"></i> ' : "";
      rows += `<div class="mt-entry">
        <span class="${sourceClass}">${sourceIcon}${sourceName}</span>
        <span class="${cls}">${sign}${entry.value}</span>
      </div>`;
    }
    rows += `<div class="mt-total">Net: <span class="${total >= 0 ? "mt-positive" : "mt-negative"}">${totalSign}${total}</span></div>`;

    const tooltip = document.createElement("div");
    tooltip.classList.add("modifier-tooltip");
    tooltip.innerHTML = rows;

    const container = this.element.querySelector(".window-content") ?? this.element;
    const rect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    tooltip.style.position = "absolute";
    tooltip.style.top = `${rect.top - containerRect.top + el.offsetHeight + 4}px`;
    tooltip.style.left = `${rect.left - containerRect.left}px`;
    tooltip.style.zIndex = "100";
    container.appendChild(tooltip);
  }

  #hideModifierTooltip() {
    (this.element.querySelector(".window-content") ?? this.element)
      .querySelector(".modifier-tooltip")?.remove();
  }

  // --- Growth Rate Breakdown Tooltip ---

  #showGrowthTooltip(event, el) {
    this.#hideGrowthTooltip();
    const statRow = el.closest(".stat-row");
    const statInput = statRow?.querySelector(".stat-input");
    const statKey = statInput?.dataset.statKey;
    if (!statKey) return;

    const system = this.actor.system;
    const baseGrowth = system.stats[statKey]?.growth ?? 0;
    const rankData = CONFIG.MANASHARD.ranks[system.rank];
    const rankBonus = rankData?.growthBonus ?? 0;
    const jobBonus = system._jobGrowthContributions?.[statKey] ?? 0;
    const jobName = system._equippedJobName;

    let rows = `<div class="gt-row"><span class="gt-label">Base Growth</span><span class="gt-value">${baseGrowth}%</span></div>`;

    if (jobBonus > 0) {
      rows += `<div class="gt-row"><span class="gt-source">${jobName ?? "Job"}</span><span class="gt-value gt-positive">+${jobBonus}%</span></div>`;
    }

    // Rule-based growth bonuses (from equipped items' Active Effects)
    const ruleEntries = system._modifiers?.getEntries(`growth.${statKey}`) ?? [];
    for (const entry of ruleEntries) {
      const sourceName = entry.source?.itemName ?? "Unknown";
      const sign = entry.value >= 0 ? "+" : "";
      rows += `<div class="gt-row"><span class="gt-source">${sourceName}</span><span class="gt-value ${entry.value >= 0 ? "gt-positive" : "gt-negative"}">${sign}${entry.value}%</span></div>`;
    }

    if (rankBonus > 0) {
      rows += `<div class="gt-row"><span class="gt-source">Rank Bonus</span><span class="gt-value gt-positive">+${rankBonus}%</span></div>`;
    }

    const ruleBonus = system._growthRuleBonuses?.[statKey] ?? 0;
    const totalEffective = Math.min(200, baseGrowth + jobBonus + ruleBonus + rankBonus);
    rows += `<div class="gt-total"><span class="gt-label">Effective</span><span class="gt-value">${totalEffective}%</span></div>`;

    const tooltip = document.createElement("div");
    tooltip.classList.add("growth-tooltip");
    tooltip.innerHTML = rows;

    const container = this.element.querySelector(".window-content") ?? this.element;
    const rect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    tooltip.style.position = "absolute";
    tooltip.style.top = `${rect.bottom - containerRect.top + 4}px`;
    tooltip.style.left = `${rect.left - containerRect.left}px`;
    tooltip.style.zIndex = "100";
    container.appendChild(tooltip);
  }

  #hideGrowthTooltip() {
    (this.element.querySelector(".window-content") ?? this.element)
      .querySelector(".growth-tooltip")?.remove();
  }

  // --- Level-Up Preview Tooltip ---

  #showLevelUpPreview(event, el) {
    this.#hideLevelUpPreview();
    const system = this.actor.system;
    if (this.actor.type !== "character" || system.level >= 40) return;

    const rankData = CONFIG.MANASHARD.ranks[system.rank];
    const growthBonus = rankData?.growthBonus ?? 0;
    const rankCaps = CONFIG.MANASHARD.rankStatCaps?.[system.rank] ?? {};

    const rateClass = (r) => {
      if (r >= 90) return "lup-excellent";
      if (r >= 70) return "lup-good";
      if (r >= 50) return "lup-average";
      if (r >= 25) return "lup-poor";
      return "lup-terrible";
    };

    let rows = "";
    for (const [key, stat] of Object.entries(system.stats)) {
      if (key === "hp" || key === "mp") continue;
      const jobContribution = system._jobGrowthContributions?.[key] ?? 0;
      const ruleBonus = system._growthRuleBonuses?.[key] ?? 0;
      const effective = Math.min(200, stat.growth + jobContribution + ruleBonus + growthBonus);
      const cap = rankCaps[key];
      const atCap = cap !== undefined && stat.value >= cap;
      const label = game.i18n.localize(CONFIG.MANASHARD.statAbbreviations[key]);

      if (atCap) {
        rows += `<div class="lup-row"><span class="lup-stat">${label}</span><span class="lup-rate lup-capped">MAX</span></div>`;
      } else {
        rows += `<div class="lup-row"><span class="lup-stat">${label}</span><span class="lup-rate ${rateClass(effective)}">${effective}%</span></div>`;
      }
    }

    const tooltip = document.createElement("div");
    tooltip.classList.add("level-up-preview");
    tooltip.innerHTML = `<div class="lup-title">Growth Rates</div>${rows}`;

    const container = this.element.querySelector(".window-content") ?? this.element;
    const rect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    tooltip.style.position = "absolute";
    tooltip.style.top = `${rect.bottom - containerRect.top + 4}px`;
    tooltip.style.left = `${rect.left - containerRect.left}px`;
    container.appendChild(tooltip);
  }

  #hideLevelUpPreview() {
    (this.element.querySelector(".window-content") ?? this.element)
      .querySelector(".level-up-preview")?.remove();
  }

  // --- Growth Rate Toggle ---

  static async #onToggleGrowth(event, target) {
    if (this.actor.type !== "character") return;
    const current = this.actor.getFlag("manashard", "showGrowth") ?? false;
    await this.actor.setFlag("manashard", "showGrowth", !current);
  }

  // --- Level-Up ---

  static async #onLevelUp(event, target) {
    if (this.actor.type !== "character") return;
    const system = this.actor.system;

    if (system.level >= 40) {
      ui.notifications.warn("Already at max level (40)!");
      return;
    }

    // Roll growth for each stat
    const rankData = CONFIG.MANASHARD.ranks[system.rank];
    const growthBonus = rankData?.growthBonus ?? 0;
    const results = [];

    const rankStatCaps = CONFIG.MANASHARD.rankStatCaps?.[system.rank] ?? {};
    const jobName = system._equippedJobName ?? null;

    for (const [key, stat] of Object.entries(system.stats)) {
      // Growth rate = base + job bonus + rule bonus + rank bonus, capped at 200%
      const jobContribution = system._jobGrowthContributions?.[key] ?? 0;
      const ruleBonus = system._growthRuleBonuses?.[key] ?? 0;
      const effectiveGrowth = Math.min(200, stat.growth + jobContribution + ruleBonus + growthBonus);

      // Check rank stat cap using base stats (excludes temporary bonuses from jobs/equipment)
      const cap = rankStatCaps[key];
      const currentVal = system._baseStats?.[key] ?? ((key === "hp" || key === "mp") ? stat.max : stat.value);
      const atCap = cap !== undefined && currentVal >= cap;

      // Growth rates > 100% mean guaranteed +1 with (rate-100)% chance of +2
      let increased = false;
      let gainAmount = 0;
      if (!atCap) {
        if (effectiveGrowth > 100) {
          gainAmount = 1; // Guaranteed first point
          const bonusChance = effectiveGrowth - 100;
          const bonusRoll = Math.ceil(Math.random() * 100);
          if (bonusRoll <= bonusChance) gainAmount = 2;
        } else {
          const roll = Math.ceil(Math.random() * 100);
          if (roll <= effectiveGrowth) gainAmount = 1;
        }
        // Enforce cap on gain
        if (cap !== undefined && currentVal + gainAmount > cap) {
          gainAmount = Math.max(0, cap - currentVal);
        }
        increased = gainAmount > 0;
      }

      const label = game.i18n.localize(CONFIG.MANASHARD.statAbbreviations[key]) || key.toUpperCase();
      results.push({ key, label, growth: stat.growth, effectiveGrowth, increased, gainAmount, atCap });
    }

    const totalGains = results.reduce((sum, r) => sum + r.gainAmount, 0);
    const newLevel = system.level + 1;

    // Build dialog content
    const resultRows = results.map(r => {
      const cls = r.atCap ? "level-up-cap" : r.increased ? "level-up-gain" : "level-up-miss";
      const icon = r.atCap ? `<span class="cap-icon">CAP</span>`
        : r.gainAmount === 2 ? `<span class="gain-icon gain-double">+2</span>`
        : r.gainAmount === 1 ? `<span class="gain-icon">+1</span>`
        : `<span class="miss-icon">—</span>`;
      return `<div class="level-up-row ${cls} lu-hidden">
        <span class="lu-stat">${r.label}</span>
        <span class="lu-growth">${r.effectiveGrowth}%</span>
        ${icon}
      </div>`;
    }).join("");

    const jobLine = jobName ? `<div class="lu-job-name"><i class="fas fa-briefcase"></i> ${jobName}</div>` : "";
    const content = `
      <div class="manashard level-up-dialog">
        <div class="level-up-header">
          <span class="lu-old-level">Lv ${system.level}</span>
          <i class="fas fa-arrow-right"></i>
          <span class="lu-new-level">Lv ${newLevel}</span>
          ${jobLine}
        </div>
        <div class="level-up-grid">
          <div class="level-up-row level-up-header-row">
            <span class="lu-stat">Stat</span>
            <span class="lu-growth">Rate</span>
            <span></span>
          </div>
          ${resultRows}
        </div>
        <div class="level-up-summary">${totalGains} stat point${totalGains !== 1 ? "s" : ""} gained!</div>
      </div>
    `;

    // Feature 5: Animate level-up rows after dialog renders
    const animateRows = () => {
      const rows = document.querySelectorAll(".level-up-row.lu-hidden");
      if (rows.length === 0) return requestAnimationFrame(animateRows);
      rows.forEach((row, i) => {
        setTimeout(() => row.classList.remove("lu-hidden"), 100 * (i + 1));
      });
    };
    requestAnimationFrame(animateRows);

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Level Up — ${this.actor.name}` },
      content,
      yes: { label: "Confirm Level Up" },
      no: { label: "Cancel" }
    });

    if (!confirmed) return;

    // Apply changes
    const updates = { "system.level": newLevel, "system.exp": 0 };
    for (const r of results) {
      if (r.gainAmount > 0) {
        const isResource = r.key === "hp" || r.key === "mp";
        updates[`system.stats.${r.key}.value`] = system.stats[r.key].value + r.gainAmount;
        if (isResource) {
          updates[`system.stats.${r.key}.max`] = system.stats[r.key].max + r.gainAmount;
        }
      }
    }
    await this.actor.update(updates);

    // Chat card
    await postLevelUpCard(this.actor, system.level, newLevel, results, jobName);
  }

  // --- Feature 1: Use Skill ---

  /**
   * Use an equipped skill from its card.
   * Offensive skills (active with baseRate > 0) show a combat forecast dialog.
   * Non-offensive skills deduct MP and post an info card.
   */
  static async #onUseSkill(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    if (!itemId) return;

    const actor = this.actor;
    const item = actor.items.get(itemId);
    let skillData, skillName, isJobSkill;

    if (item?.type === "manacite" && item.system.manaciteType === "skill") {
      skillData = item.system;
      skillName = item.name;
      isJobSkill = false;
    }
    if (!skillData) return;

    // Silence: block magic skills
    if (skillData.skillType === "magic" && isSilenced(actor)) {
      ui.notifications.warn(`${actor.name} is Silenced and cannot use magic skills!`);
      return;
    }

    // Hex: skills cost +50% MP
    const hexMpMult = getMPCostMultiplier(actor);
    const mpCost = Math.ceil(Math.max(0, skillData.mpCost ?? 0) * hexMpMult);
    const currentMp = actor.system.stats.mp.value;

    // Check if this is a steal-type skill (art with skillHit > 0, no damage, single target enemy)
    const isStealCommand = skillData.skillType === "art"
      && skillData.targetType === "single"
      && (skillData.skillHit ?? 0) > 0
      && (skillData.baseRate ?? 0) === 0;

    // Check if this is an offensive skill (magic or art with baseRate > 0, weapon mode, or skillHit > 0)
    const isOffensive = (skillData.skillType === "magic" || skillData.skillType === "art")
      && ((skillData.baseRate ?? 0) > 0 || skillData.baseRateMode === "weapon" || (skillData.skillHit ?? 0) > 0);

    // Barrier / healing / retaliatory skills route through forecast even with baseRate 0
    const isBarrierSkill = skillData.isBarrier ?? skillData.damageType === "barrier";
    const isHealingSkill = skillData.isHealing ?? skillData.damageType === "healing";
    const isRetaliatory = skillData.isRetaliatory ?? skillData.damageType === "retaliatory";

    // Check if this skill has a StatusRemove rule element
    const skillRules = isJobSkill ? [] : (skillData.rules ?? []);
    const hasStatusRemove = skillRules.some(r =>
      (r.key === "Status" && r.action === "remove") || r.key === "StatusRemove"
    );

    if (hasStatusRemove) {
      // ═══ STATUS REMOVE: Show Purify Dialog ═══
      await ManashardActorSheet.#showStatusRemoveDialog.call(this, actor, skillData, skillName, itemId, mpCost);
    } else if (isStealCommand) {
      // ═══ STEAL COMMAND: Show Steal Forecast Dialog ═══
      await ManashardActorSheet.#showStealForecast.call(this, actor, skillData, skillName, itemId, mpCost);
    } else if (isOffensive || isBarrierSkill || isHealingSkill || isRetaliatory) {
      // ═══ OFFENSIVE / BARRIER / HEALING / RETALIATORY SKILL: Show Combat Forecast Dialog ═══
      await ManashardActorSheet.#showSkillForecast.call(this, actor, skillData, skillName, itemId, mpCost);
    } else {
      // ═══ NON-OFFENSIVE SKILL: Post info card and deduct MP ═══
      const isMagic = skillData.skillType === "magic";
      const chantKey = isMagic ? (this._chantModes.get(itemId) ?? "normal") : "normal";
      const chant = CONFIG.MANASHARD.chantModes[chantKey];
      const chantLabel = game.i18n.localize(chant.label);
      const effectMod = chant.effectModifier;
      const element = skillData.element ?? "";
      const range = skillData.rangeDisplay ?? "";
      const isMeleeSkill = skillData.rangeType === "melee" || skillData.rangeType === "weapon";
      const description = skillData.description ?? "";
      const targetType = skillData.targetType ?? "single";

      // Apply chant MP multiplier
      const chantMpMult = chant.mpMultiplier ?? 1.0;

      // Check for casting modifiers (e.g. Quicken)
      let useCastingMod = false;
      let nonOffCastingMod = null;
      if (isMagic && mpCost > 0) {
        const castingMods = actor.system._ruleCache?.castingModifiers ?? [];
        for (const r of castingMods) {
          const def = CONFIG.MANASHARD.castingModifiers[r.modifier];
          if (def && def.fromChant === chantKey) {
            nonOffCastingMod = def;
            break;
          }
        }
        if (nonOffCastingMod) {
          const modMpCost = Math.ceil(mpCost * chantMpMult * nonOffCastingMod.mpMultiplier);
          if (currentMp >= modMpCost) {
            const modLabel = game.i18n.localize(nonOffCastingMod.label);
            useCastingMod = await foundry.applications.api.DialogV2.confirm({
              window: { title: modLabel },
              content: `<p>${game.i18n.localize(nonOffCastingMod.description)}</p><p>MP Cost: ${mpCost} → ${modMpCost}</p>`,
              yes: { label: modLabel },
              no: { label: "Normal" }
            });
          }
        }
      }

      const castingMult = useCastingMod ? nonOffCastingMod.mpMultiplier : 1;
      const effectiveMpCost = Math.ceil(mpCost * chantMpMult * castingMult);
      if (effectiveMpCost > 0) {
        await actor.update({ "system.stats.mp.value": currentMp - effectiveMpCost });
      }

      // Check if this is a Full chant spell (declare now, resolve next turn)
      const isFullChantCharge = chant.chargesTurn === true;

      // Resolve target info for display
      const targeted = game.user.targets.first();
      const targetActor = targeted?.actor;
      const targetName = targetActor?.name ?? null;

      const templateData = {
        actorImg: actor.img,
        actorName: actor.name,
        skillName,
        skillType: skillData.skillType,
        isHealing: skillData.isHealing ?? false,
        targetType,
        targetName,
        mpCost: effectiveMpCost,
        range,
        isMeleeSkill,
        element,
        chantKey,
        chantLabel: chantKey !== "normal" ? chantLabel : "",
        showEffectMod: effectMod !== 1.0 && chantKey !== "normal",
        effectModifier: effectMod,
        isCharging: isFullChantCharge,
        description,
        buffDuration: skillData.buffDuration ?? 0,
        actorId: actor.id,
        itemId: item.id,
        skillImg: item.img ?? "icons/svg/aura.svg",
        buffRulesJson: (() => {
          const bd = skillData.buffDuration ?? 0;
          if (bd <= 0) return "";
          const rules = (skillData.rules ?? []).filter(r => r.key === "Modifier");
          if (!rules.length) return "";
          return JSON.stringify({ name: skillName, img: item.img ?? "icons/svg/aura.svg", duration: bd, rules, description: skillData.description ?? "" })
            .replace(/"/g, "&quot;");
        })()
      };

      // Non-offensive buffs auto-apply below — hide the manual button to prevent double-application
      templateData.buffDuration = 0;
      templateData.buffRulesJson = "";

      const content = await foundry.applications.handlebars.renderTemplate(
        "systems/manashard/templates/chat/skill-info.hbs",
        templateData
      );

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content
      });

      // Auto-apply buff/debuff for non-offensive skills with buffDuration
      const buffDuration = skillData.buffDuration ?? 0;
      if (buffDuration > 0) {
        const buffRules = (skillData.rules ?? []).filter(r => r.key === "Modifier" || r.key === "Status");
        if (buffRules.length) {
          const desc = skillData.description ?? "";
          const buffRadius = Number(skillData.aoeSize) || 0;
          const buffFilter = skillData.aoeTargetFilter || "allies";

          if (buffRadius > 0 && canvas?.tokens) {
            // Area buff: apply to all matching tokens within radius of caster
            const casterToken = actor.token?.object ?? canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
            if (casterToken) {
              let buffCount = 0;
              for (const t of canvas.tokens.placeables) {
                if (!t.actor || t.actor.id === actor.id) continue;
                const dist = gridDistance(casterToken, t);
                if (dist > buffRadius) continue;
                // Filter by disposition
                const sameTeam = casterToken.document.disposition === t.document.disposition;
                if (buffFilter === "allies" && !sameTeam) continue;
                if (buffFilter === "enemies" && sameTeam) continue;
                await applyBuffEffect(t.actor, skillName, item.img, buffDuration, buffRules, desc);
                buffCount++;
              }
              // Also apply to self if allies or all filter
              if (buffFilter === "allies" || buffFilter === "all") {
                await applyBuffEffect(actor, skillName, item.img, buffDuration, buffRules, desc);
                buffCount++;
              }
              if (buffCount > 0) {
                ui.notifications.info(`${skillName} applied to ${buffCount} target${buffCount !== 1 ? "s" : ""}.`);
              }
            }
          } else {
            // No radius: apply to self for self-target skills, or to targeted token for single-target
            if (targetType === "self") {
              await applyBuffEffect(actor, skillName, item.img, buffDuration, buffRules, desc);
            } else if (targetType === "single" && targetActor) {
              await applyBuffEffect(targetActor, skillName, item.img, buffDuration, buffRules, desc);
            }
          }
        }
      }

      // Auto-advance combat turn for non-offensive skills
      const combat = game.combat;
      if (combat?.combatant?.actor?.id === actor.id) {
        await combat.endTurn();
      }
    }
  }

  /**
   * Show a combat forecast dialog for an offensive skill, then execute the skill attack.
   */
  static async #showSkillForecast(actor, skillData, skillName, itemId, mpCost) {
    const system = actor.system;
    const element = skillData.element || "";
    const damageType = skillData.damageType || "none";
    const isMagical = damageType === "magical";
    const isSpell = skillData.skillType === "magic";
    const isHealing = skillData.isHealing ?? false;
    const isBarrier = skillData.isBarrier ?? skillData.damageType === "barrier";

    // Check undead target for heal mode
    const targeted = game.user.targets.first();
    const defActor = targeted?.actor;
    const defSys = defActor?.system;
    const targetIsUndead = defSys?.creatureType?.includes?.("undead") ?? false;
    const isRetaliatorySk = skillData.isRetaliatory ?? skillData.damageType === "retaliatory";
    const isNoneDamageSk = skillData.damageType === "none";
    const healMode = (isHealing && !targetIsUndead) || isBarrier;
    const defBlockChance = (healMode || isRetaliatorySk || isNoneDamageSk) ? 0 : (defActor?.system?.blockChance ?? 0);

    // Build casting modifier finder (needed by forecast and post-dialog)
    const castingMods = system._ruleCache?.castingModifiers ?? [];
    const findCastingMod = (chantKey) => {
      for (const r of castingMods) {
        const def = CONFIG.MANASHARD.castingModifiers[r.modifier];
        if (def && def.fromChant === chantKey) return { rule: r, def };
      }
      return null;
    };
    const initChantKey = isSpell ? (this._chantModes?.get(itemId) ?? "normal") : "normal";
    let activeCastingMod = isSpell ? findCastingMod(initChantKey) : null;

    // Build forecast context and show dialog
    const ctx = buildForecastContext(actor, targeted, {
      mode: (isHealing || isBarrier) ? "heal" : "skill",
      skillData,
      skillName,
      mpCost,
      chantMode: initChantKey,
      itemId,
      castingMods,
      findCastingMod
    });

    const result = await showForecastDialog(ctx);
    if (!result) return;

    // Update activeCastingMod for the selected chant mode
    activeCastingMod = isSpell ? findCastingMod(result.chantMode) : null;

    // Resolve casting modifier (e.g. Quicken) if active
    const useCastingMod = result.castingModActive && activeCastingMod;
    const selectedChantData = CONFIG.MANASHARD.chantModes[result.chantMode];
    const chantMpMult = selectedChantData?.mpMultiplier ?? 1.0;
    const castingMult = useCastingMod ? activeCastingMod.def.mpMultiplier : 1;
    const effectiveMpCost = Math.ceil(mpCost * chantMpMult * castingMult);

    // Re-check MP sufficiency for modified cost
    if (effectiveMpCost > 0 && actor.system.stats.mp.value < effectiveMpCost) {
      ui.notifications.warn(`Not enough MP! Need ${effectiveMpCost}, have ${actor.system.stats.mp.value}.`);
      return;
    }

    // Deduct MP after confirmation
    if (effectiveMpCost > 0) {
      await actor.update({ "system.stats.mp.value": actor.system.stats.mp.value - effectiveMpCost });
    }

    // Check if this is a Full chant (declare now, resolve next turn)
    const isFullChantCharge = selectedChantData?.chargesTurn === true;

    if (isFullChantCharge) {
      // Begin charging — spell resolves at start of caster's next turn
      const combat = game.combat;
      const combatant = combat?.combatant;
      if (combat && combatant && combatant.actor?.id === actor.id) {
        await combat.beginCharging(combatant.id, {
          skillItemId: itemId,
          skillName,
          chantMode: result.chantMode,
          targetTokenId: targeted?.id ?? null,
          mpCost: effectiveMpCost
        });
        return; // beginCharging calls endTurn internally
      }
    }

    // Immediate execution (Swift or Normal chant)
    const skipAllDef = healMode || isRetaliatorySk;
    await actor.rollSkillAttack({
      skill: skillData,
      skillName,
      chantMode: result.chantMode,
      defenderActor: defActor,
      defenderEvasion: skipAllDef ? 0 : result.eva,
      defenderDef: (skipAllDef || isNoneDamageSk) ? 0 : (isMagical ? 0 : result.def),
      defenderSpi: (skipAllDef || isNoneDamageSk) ? 0 : (isMagical ? result.def : 0),
      defenderCritAvoid: skipAllDef ? 0 : result.critEvo,
      defenderBlockChance: (skipAllDef || isNoneDamageSk) ? 0 : defBlockChance,
      targetTokenId: targeted?.id ?? null,
      mpCost: effectiveMpCost,
      itemId
    });

    // Auto-advance combat turn
    const combat = game.combat;
    if (combat?.combatant?.actor?.id === actor.id) {
      await combat.endTurn();
    }
  }

  // --- Feature 3b: Steal Forecast ---

  /**
   * Show a dialog to select and remove a status effect from the targeted actor.
   */
  static async #showStatusRemoveDialog(actor, skillData, skillName, itemId, mpCost) {
    const targeted = game.user.targets.first();
    const targetActor = targeted?.actor;

    if (!targetActor) {
      ui.notifications.warn("Select a target first.");
      return;
    }

    const statuses = [...(targetActor.system.statusEffects ?? [])];
    const statusConfig = CONFIG.MANASHARD.statusEffects;

    if (!statuses.length) {
      ui.notifications.info(`${targetActor.name} has no status effects to remove.`);
      return;
    }

    // Build status buttons
    const statusButtons = statuses.map(key => {
      const label = statusConfig[key]?.label
        ? game.i18n.localize(statusConfig[key].label)
        : key.charAt(0).toUpperCase() + key.slice(1);
      return `<button type="button" class="sr-status-btn" data-status="${key}">${label}</button>`;
    }).join("");

    let selectedStatus = null;

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: `${skillName} — Remove Status`, classes: ["manashard", "status-remove-dialog"] },
      content: `
        <div class="status-remove-form">
          <p>Choose a status effect to remove from <strong>${targetActor.name}</strong>:</p>
          <div class="sr-status-grid">${statusButtons}</div>
        </div>`,
      buttons: [
        {
          action: "confirm",
          label: "Remove",
          icon: "fas fa-check",
          default: true,
          callback: () => selectedStatus
        },
        { action: "cancel", label: "Cancel" }
      ],
      render: (event, dialog) => {
        const el = dialog.element;
        const confirmBtn = el.querySelector("[data-action='confirm']");
        if (confirmBtn) confirmBtn.disabled = true;

        el.querySelectorAll(".sr-status-btn").forEach(btn => {
          btn.addEventListener("click", () => {
            el.querySelectorAll(".sr-status-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            selectedStatus = btn.dataset.status;
            if (confirmBtn) confirmBtn.disabled = false;
          });
        });
      }
    });

    if (result === "cancel" || !selectedStatus) return;

    // Deduct MP
    const currentMp = actor.system.stats.mp.value;
    if (mpCost > 0) {
      await actor.update({ "system.stats.mp.value": currentMp - mpCost });
    }

    // Remove the status
    await targetActor.removeStatus(selectedStatus);

    // Post status removal chat card
    const statusLabel = statusConfig[selectedStatus]?.label
      ? game.i18n.localize(statusConfig[selectedStatus].label)
      : selectedStatus;
    const statusIcon = CONFIG.MANASHARD.statusIcons?.[selectedStatus] ?? "fas fa-circle-xmark";
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/manashard/templates/chat/status-removal.hbs",
      {
        actorName: targetActor.name,
        actorImg: targetActor.img ?? "icons/svg/mystery-man.svg",
        source: "cleansed",
        statuses: [{ icon: statusIcon, label: statusLabel, tag: "CLEANSED" }]
      }
    );
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content
    });

    // Auto-advance combat turn
    const combat = game.combat;
    if (combat?.combatant?.actor?.id === actor.id) {
      await combat.endTurn();
    }
  }

  /**
   * Show a simplified forecast dialog for Steal-type commands (hit vs evasion only).
   */
  static async #showStealForecast(actor, skillData, skillName, itemId, mpCost) {
    const system = actor.system;
    const luk = system.stats?.luk?.value ?? 0;
    // Use scaling stat for fixed-mode accuracy instead of AGI
    const ssKey = skillData.scalingStat ?? "auto";
    const damageType = skillData.damageType ?? "physical";
    let accStat = 0;
    if (ssKey === "auto") {
      accStat = damageType === "magical"
        ? (system.stats?.mag?.value ?? 0)
        : (system.stats?.str?.value ?? 0);
    } else if (ssKey !== "none") {
      accStat = system.stats?.[ssKey]?.value ?? 0;
    }
    const accuracy = (accStat * 2) + (skillData.skillHit ?? 0);

    // Target info from selected token
    const targeted = game.user.targets.first();
    const defActor = targeted?.actor;
    const defName = defActor?.name ?? "Enemy";
    const defImg = defActor?.img ?? "icons/svg/mystery-man.svg";
    const hasTarget = !!defActor;

    const defEva = defActor?.system?.peva ?? 0;
    const hitForecast = Math.max(0, accuracy - defEva);

    // Loot table preview (show LUK-boosted chances)
    const lootTable = defActor?.system?.lootTable ?? [];
    const availableLoot = lootTable.filter(e => {
      if (e.stolen) return false;
      const item = defActor.items.get(e.itemId);
      return !!item;
    });
    const lootPreview = availableLoot.length > 0
      ? availableLoot.map(e => {
          const item = defActor.items.get(e.itemId);
          const effective = Math.min(100, (e.chance ?? 0) + luk);
          const boosted = luk > 0 && effective > e.chance;
          return `<div class="sf-loot-row"><span class="sf-loot-name">${item.name}</span><span class="sf-loot-chance">${boosted ? `<span class="sf-loot-base">${e.chance}%</span> → ` : ""}${effective}%</span></div>`;
        }).join("")
      : `<div class="sf-loot-empty">No loot available</div>`;

    const content = `
      <div class="manashard combat-forecast steal-forecast">
        <!-- ═══ THIEF PANEL ═══ -->
        <div class="cf-panel cf-attacker">
          <div class="cf-portrait-frame">
            <img src="${actor.img}" class="cf-portrait" style="object-position: ${actor.system.portraitOffsetX ?? 50}% ${actor.system.portraitOffsetY ?? 0}%;${actor.system.portraitMirrored ? ' transform: scaleX(-1);' : ''}" />
          </div>
          <div class="cf-name-banner">
            <span class="cf-name">${actor.name}</span>
          </div>
          <div class="cf-weapon-row">
            <i class="fas fa-hand-sparkles"></i>
            <span class="cf-weapon-name">${skillName}</span>
          </div>
          <div class="cf-mp-cost">MP Cost: ${mpCost}</div>
          <div class="cf-stat-rows">
            <div class="cf-stat-row"><span class="cf-stat-label">Hit</span><span class="cf-stat-value">${accuracy}<small>%</small></span></div>
          </div>
        </div>

        <!-- ═══ CENTER ═══ -->
        <div class="cf-center">
          <div class="cf-versus"><i class="fas fa-hand-sparkles"></i></div>
          <div class="cf-forecast-rows">
            <div class="cf-forecast-row">
              <span class="cf-forecast-label">Hit%</span>
              <span class="cf-forecast-value sf-hit-val">${hitForecast}</span>
            </div>
          </div>
          <div class="cf-arrow-row">
            <i class="fas fa-arrow-right cf-arrow-atk"></i>
          </div>
        </div>

        <!-- ═══ TARGET PANEL ═══ -->
        <div class="cf-panel cf-defender">
          <div class="cf-portrait-frame">
            <img src="${defImg}" class="cf-portrait" style="object-position: ${defActor?.system?.portraitOffsetX ?? 50}% ${defActor?.system?.portraitOffsetY ?? 0}%;${defActor?.system?.portraitMirrored ? ' transform: scaleX(-1);' : ''}" />
          </div>
          <div class="cf-name-banner">
            <span class="cf-name">${defName}</span>
          </div>
          <div class="cf-weapon-row cf-weapon-row-empty">
            ${hasTarget ? "" : `<em>No target selected</em>`}
          </div>
          <div class="cf-stat-rows cf-defender-inputs">
            <div class="cf-stat-row">
              <span class="cf-stat-label">P.EVA</span>
              <input type="number" class="sf-eva cf-input-field" value="${defEva}" min="0" tabindex="1" />
            </div>
          </div>
          ${hasTarget ? `<div class="sf-loot-preview">
            <div class="sf-loot-header">Loot</div>
            ${lootPreview}
          </div>` : ""}
        </div>
      </div>`;

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: `Steal Forecast — ${skillName}` },
      content,
      buttons: [
        {
          action: "steal",
          label: "Steal",
          default: true,
          callback: (event, btn, dialog) => {
            const el = dialog.element;
            const eva = Number(el.querySelector(".sf-eva")?.value) || 0;
            return { eva };
          }
        },
        { action: "cancel", label: "Cancel" }
      ],
      render: (event, dialog) => {
        const el = dialog.element;
        el.querySelector(".sf-eva")?.addEventListener("input", () => {
          const eva = Number(el.querySelector(".sf-eva")?.value) || 0;
          const hitVal = el.querySelector(".sf-hit-val");
          if (hitVal) hitVal.textContent = Math.max(0, accuracy - eva);
        });
        el.querySelector(".sf-eva")?.focus();
      }
    });

    if (result === "cancel" || !result || result === null) return;

    // Deduct MP
    if (mpCost > 0) {
      await actor.update({ "system.stats.mp.value": actor.system.stats.mp.value - mpCost });
    }

    // Resolve steal
    const stealResult = await resolveSteal(actor, defActor, accuracy, result.eva);

    // Build and post chat card
    const templateData = {
      actorImg: actor.img,
      actorName: actor.name,
      targetName: defName,
      targetTokenId: targeted?.id ?? "",
      thiefTokenId: (actor.token?.object ?? canvas.tokens?.placeables.find(t => t.actor?.id === actor.id))?.id ?? "",
      skillName,
      ...stealResult
    };

    const chatContent = await foundry.applications.handlebars.renderTemplate(
      "systems/manashard/templates/chat/steal-result.hbs",
      templateData
    );

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: chatContent
    });

    // Auto-advance combat turn
    const combat = game.combat;
    if (combat?.combatant?.actor?.id === actor.id) {
      await combat.endTurn();
    }
  }

  // --- Feature 4: Toggle Status Effect ---

  /**
   * Toggle a status effect on/off for the actor.
   */
  static async #onToggleStatus(event, target) {
    const statusKey = target.dataset.status;
    if (!statusKey) return;

    const current = new Set(this.actor.system.statusEffects ?? []);
    const durations = foundry.utils.deepClone(this.actor.getFlag("manashard", "statusDurations") ?? {});

    if (current.has(statusKey)) {
      current.delete(statusKey);
      delete durations[statusKey];
    } else {
      current.add(statusKey);
      durations[statusKey] = CONFIG.MANASHARD.statusEffects[statusKey]?.duration ?? 3;
    }

    await this.actor.update({ "system.statusEffects": [...current] });
    await this.actor.setFlag("manashard", "statusDurations", durations);
  }

  static #onCycleSort(event, target) {
    const section = target.dataset.section;
    if (!section) return;
    const modes = ["name", "weight", "equipped"];
    const current = this._sortModes[section] ?? "name";
    const idx = modes.indexOf(current);
    this._sortModes[section] = modes[(idx + 1) % modes.length];
    this.render();
  }


  // --- Elemental Profile Tier Cycling ---

  static #onCycleElementTier(event, target) {
    const entry = target.closest(".elemental-entry") ?? target.closest(".ms-el-cell");
    if (!entry) return;
    const element = entry.dataset.element;
    if (!element) return;

    const tiers = ["weak", "neutral", "resist", "immune", "absorb"];
    const current = this.actor.system.elementalProfile?.[element] ?? "neutral";
    const idx = tiers.indexOf(current);
    // Right-click cycles backward
    const next = event.type === "contextmenu"
      ? tiers[(idx - 1 + tiers.length) % tiers.length]
      : tiers[(idx + 1) % tiers.length];

    this.actor.update({ [`system.elementalProfile.${element}`]: next });
  }

  // --- Status Resistance Tier Cycling ---

  static async #onCycleStatusTier(event, target) {
    const statusKey = target.closest("[data-status]")?.dataset.status;
    if (!statusKey) return;
    const current = this.actor.system.statusResistances?.[statusKey] ?? "neutral";
    const cycle = ["neutral", "resist", "immune", "vulnerable"];
    const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
    await this.actor.update({ [`system.statusResistances.${statusKey}`]: next });
  }

  // --- Loot Table Actions ---

  async #onLootDrop(event) {
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    if (data.type !== "Item") return;

    // If the item already belongs to this actor, just add a loot entry for it
    if (data.itemId) {
      const existing = this.actor.items.get(data.itemId);
      if (existing) {
        const lootTable = foundry.utils.deepClone(this.actor.system.lootTable ?? []);
        // Don't duplicate if already in loot table
        if (lootTable.some(e => e.itemId === existing.id)) {
          ui.notifications.info(`${existing.name} is already in the loot table.`);
          return;
        }
        lootTable.push({ itemId: existing.id, chance: 50, stolen: false });
        await this.actor.update({ "system.lootTable": lootTable });
        return;
      }
    }

    // External item (compendium, sidebar, other actor) — create embedded copy
    if (data.uuid) {
      const resolved = await fromUuid(data.uuid);
      if (!resolved) return;
      const itemData = resolved.toObject();
      const [created] = await this.actor.createEmbeddedDocuments("Item", [itemData], { _lootOnly: true });
      if (!created) return;
      const lootTable = foundry.utils.deepClone(this.actor.system.lootTable ?? []);
      lootTable.push({ itemId: created.id, chance: 50, stolen: false });
      lootTable.sort((a, b) => a.chance - b.chance);
      await this.actor.update({ "system.lootTable": lootTable });
    }
  }

  static async #onAddLootEntry(event, target) {
    // Create a blank item on the actor and add it to the loot table
    const [created] = await this.actor.createEmbeddedDocuments("Item", [{
      name: "New Loot", type: "weapon", img: "icons/svg/item-bag.svg"
    }]);
    if (!created) return;
    const lootTable = foundry.utils.deepClone(this.actor.system.lootTable ?? []);
    lootTable.push({ itemId: created.id, chance: 50, stolen: false });
    lootTable.sort((a, b) => a.chance - b.chance);
    await this.actor.update({ "system.lootTable": lootTable });
    // Open the item sheet so user can configure it
    created.sheet.render(true);
  }

  static async #onRemoveLootEntry(event, target) {
    const entry = target.closest("[data-index]");
    const index = Number(entry?.dataset.index);
    if (Number.isNaN(index)) return;
    const lootTable = foundry.utils.deepClone(this.actor.system.lootTable ?? []);
    const removed = lootTable.splice(index, 1)[0];
    await this.actor.update({ "system.lootTable": lootTable });
    // Also delete the embedded item
    if (removed?.itemId) {
      const item = this.actor.items.get(removed.itemId);
      if (item) await item.delete();
    }
  }

  static async #onSortLootTable(event, target) {
    const lootTable = foundry.utils.deepClone(this.actor.system.lootTable ?? []);
    if (lootTable.length < 2) return;
    lootTable.sort((a, b) => a.chance - b.chance);
    await this.actor.update({ "system.lootTable": lootTable });
  }

  /**
   * Post an item's full card to the Foundry chat log.
   */
  static async #onPostItemToChat(event, target) {
    const el = target.closest("[data-item-id]");
    if (!el) return;
    const itemId = el.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    await postItemCard(item, this.actor);
  }

  /**
   * Open a dialog to select an owner (player character) for this companion.
   */
  static async #onSelectOwner(event, target) {
    const characters = game.actors.filter(a => a.type === "character");
    if (!characters.length) {
      ui.notifications.warn("No Adventurer actors found in the world.");
      return;
    }

    const options = characters.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
    const currentOwnerId = this.actor.system.ownerId ?? "";

    const content = `
      <form class="cu-owner-select-form">
        <div class="form-group">
          <label>Select Owner</label>
          <select name="ownerId">
            <option value="">— None —</option>
            ${options}
          </select>
        </div>
      </form>`;

    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Select Bonded Owner" },
      content,
      ok: {
        label: "Confirm",
        callback: (event, button) => {
          return button.form.elements.ownerId.value;
        }
      }
    });

    if (result !== undefined) {
      await this.actor.update({ "system.ownerId": result });
    }
  }

  /**
   * Clear the current owner from this companion.
   */
  static async #onClearOwner(event, target) {
    await this.actor.update({ "system.ownerId": "" });
  }

  // ═══════════════════════════════════════════════════════
  // SKILL LIBRARY & LOADOUT
  // ═══════════════════════════════════════════════════════

  /** Absorb a skill manacite — permanently learns the skill, or levels up a duplicate. */
  static async #onAbsorbSkill(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item || item.type !== "manacite" || item.system.manaciteType !== "skill") return;
    if (item.system.absorbed) return;

    // Check for duplicate: does the library already contain a skill with the same name?
    const existingSkill = this.actor.items.find(i =>
      i.type === "manacite" && i.system.manaciteType === "skill" && i.system.absorbed
      && i.id !== item.id && i.name.toLowerCase() === item.name.toLowerCase()
    );

    if (existingSkill) {
      ui.notifications.warn(`${existingSkill.name} is already in your skill library!`);
      return;
    }

    // First absorption: learn new skill
    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Absorb Manacite" },
      content: `<p>Absorb <strong>${item.name}</strong>?</p><p>This will permanently learn the skill and destroy the crystal.</p>`,
      yes: { label: "Absorb", icon: "fas fa-sun" },
      no: { label: "Cancel" }
    });
    if (!confirm) return;

    const library = [...(this.actor.system.skillLibrary ?? [])];
    if (!library.includes(item.id)) library.push(item.id);

    await item.update({ "system.absorbed": true });
    await this.actor.update({ "system.skillLibrary": library });

    await postAbsorptionCard(item, this.actor);
  }

  /** Add/remove a library skill to/from the active loadout. */
  static async #onEquipToLoadout(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const loadout = [...(this.actor.system.skillLoadout ?? [])];
    const sys = this.actor.system;

    if (loadout.includes(itemId)) {
      // Already in loadout — remove it (toggle off)
      await this.actor.update({ "system.skillLoadout": loadout.filter(id => id !== itemId) });
    } else {
      // Check slot capacity (free skills don't count)
      const isFree = sys._loadoutFreeSkillIds?.has(itemId);
      if (!isFree && sys._loadoutSlotsUsed >= sys.maxLoadoutSlots) {
        ui.notifications.warn(`Loadout full! (${sys._loadoutSlotsUsed}/${sys.maxLoadoutSlots} slots)`);
        return;
      }
      loadout.push(itemId);
      await this.actor.update({ "system.skillLoadout": loadout });
    }
  }

  /** Remove a skill from the active loadout. */
  static async #onRemoveFromLoadout(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    if (!itemId) return;
    const loadout = (this.actor.system.skillLoadout ?? []).filter(id => id !== itemId);
    await this.actor.update({ "system.skillLoadout": loadout });
  }

  /** Open the Manacite Manager dialog. */
  static #onOpenManaciteManager(event, target) {
    game.manashard.ManaciteManager.open(this.actor);
  }

  /** Open the Spatial Inventory dialog. */
  static #onOpenSpatialInventory(event, target) {
    game.manashard.SpatialInventory.open(this.actor);
  }

  /** Stow an item into the spatial inventory. */
  static async #onStowInSpatial(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    // Auto-unequip if equipped
    if (item.system.equipped) await item.update({ "system.equipped": false });
    await item.setFlag("manashard", "spatialStorage", true);
  }

  static async #onAdjustEiress(event, target) {
    const delta = parseInt(target.dataset.delta) || 0;
    const current = this.actor.system.eiress ?? 0;
    await this.actor.update({ "system.eiress": Math.max(0, current + delta) });
  }

  static async #onSetAccentPreset(event, target) {
    const preset = target.dataset.preset;
    if (preset) await this.actor.update({ "system.sheetAccentPreset": preset });
  }

  static async #onSetAccentCustom(event, target) {
    const color = target.value;
    if (color) await this.actor.update({ "system.sheetAccentPreset": "custom", "system.sheetAccentCustom": color });
  }

}

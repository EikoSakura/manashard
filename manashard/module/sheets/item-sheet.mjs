const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
import { RuleElementEditor } from "../apps/rule-element-editor.mjs";
import { ruleSummary } from "../helpers/rule-engine.mjs";


/**
 * Item sheet for all Manashard item types.
 * Three-tab layout: Description (read-only), Details (edit), Active Effects.
 */
export class ManashardItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  /** Track the currently active tab */
  _activeTab = "description";

  static PARTS = {
    header: { template: "systems/manashard/templates/item/parts/item-header.hbs" },
    tabs: { template: "systems/manashard/templates/item/parts/item-tabs.hbs" },
    description: { template: "systems/manashard/templates/item/parts/item-description.hbs" },
    details: { template: "systems/manashard/templates/item/parts/item-details.hbs" },
    rules: { template: "systems/manashard/templates/item/parts/item-rules.hbs" }
  };

  get title() {
    const typeLabel = game.i18n.localize(`TYPES.Item.${this.document.type}`);
    return `${typeLabel}: ${this.document.name}`;
  }

  static DEFAULT_OPTIONS = {
    classes: ["manashard", "item", "sheet"],
    position: { width: 520, height: 480 },
    window: {
      resizable: true
    },
    tag: "form",
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      switchTab: ManashardItemSheet.#onSwitchTab,
      editImage: ManashardItemSheet.#onEditImage,
      addRule: ManashardItemSheet.#onAddRule,
      editRule: ManashardItemSheet.#onEditRule,
      deleteRule: ManashardItemSheet.#onDeleteRule,
      removeTag: ManashardItemSheet.#onRemoveTag,
      useConsumable: ManashardItemSheet.#onUseConsumable,
      removePrerequisite: ManashardItemSheet.#onRemovePrerequisite,
    }
  };

  static async #onUseConsumable(event, target) {
    const item = this.document;
    if (item.type !== "consumable") return;
    const actor = item.actor;
    if (!actor) {
      ui.notifications.warn("This item must be owned by an actor to use.");
      return;
    }
    await actor.useConsumable(item.id);
  }

  static async #onEditImage(event, target) {
    const current = this.document.img;
    const fp = new FilePicker({
      type: "image",
      current,
      callback: async (path) => {
        await this.document.update({ img: path });
      }
    });
    fp.render(true);
  }

  static async #onAddRule(event, target) {
    const editor = new RuleElementEditor(this.document, -1);
    await editor.render();
  }

  static async #onEditRule(event, target) {
    const index = Number(target.dataset.ruleIndex);
    if (isNaN(index) || index < 0) return;
    const editor = new RuleElementEditor(this.document, index);
    await editor.render();
  }

  /**
   * Remove a tag from a comma-separated field (tags, sources, etc.).
   */
  static async #onRemoveTag(event, target) {
    const field = target.dataset.field;
    const value = target.dataset.value;
    if (!field || !value) return;
    const current = this.document.system[field] ?? "";
    const tags = current.split(",").map(s => s.trim()).filter(s => s.length > 0);
    const idx = tags.indexOf(value);
    if (idx === -1) return;
    tags.splice(idx, 1);
    await this.document.update({ [`system.${field}`]: tags.join(", ") });
  }

  /**
   * Handle change on tag select dropdowns to add a new tag.
   */
  #onTagSelectChange(event) {
    const select = event.currentTarget;
    const field = select.dataset.tagField;
    const value = select.value.trim().toLowerCase();
    if (!value || !field) return;

    const current = this.document.system[field] ?? "";
    const tags = current.split(",").map(s => s.trim()).filter(s => s.length > 0);

    // Reset select back to placeholder
    select.selectedIndex = 0;

    // Don't add duplicates
    if (tags.includes(value)) return;

    tags.push(value);
    this.document.update({ [`system.${field}`]: tags.join(", ") });
  }

  /**
   * Handle dropping a Job or Skill Manacite onto the prerequisites zone.
   */
  async #onPrerequisiteDrop(event) {
    let data;
    try {
      data = JSON.parse(event.dataTransfer?.getData("text/plain") ?? "{}");
    } catch {
      return;
    }
    if (data.type !== "Item") return;

    const item = await fromUuid(data.uuid);
    if (!item || item.type !== "manacite") {
      ui.notifications.warn("Only Manacite items can be dropped here.");
      return;
    }
    const mType = item.system.manaciteType;
    if (mType !== "job" && mType !== "skill") return;

    // Prevent duplicates
    const existing = this.document.system.prerequisites ?? [];
    if (existing.some(p => p.uuid === data.uuid)) {
      ui.notifications.warn("This prerequisite is already added.");
      return;
    }

    const entry = { uuid: data.uuid, type: mType, level: 1 };
    await this.document.update({ "system.prerequisites": [...existing, entry] });
  }

  /**
   * Remove a prerequisite entry by index.
   */
  static async #onRemovePrerequisite(event, target) {
    const index = Number(target.dataset.prereqIndex);
    if (isNaN(index) || index < 0) return;
    const prereqs = foundry.utils.deepClone(this.document.system.prerequisites ?? []);
    if (index >= prereqs.length) return;
    prereqs.splice(index, 1);
    await this.document.update({ "system.prerequisites": prereqs });
  }

  static async #onDeleteRule(event, target) {
    const index = Number(target.dataset.ruleIndex);
    if (isNaN(index) || index < 0) return;
    const rules = foundry.utils.deepClone(this.document.system.rules ?? []);
    if (index >= rules.length) return;

    const rule = rules[index];
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete Active Effect" },
      content: `<p>Delete effect: <strong>${rule.label || ruleSummary(rule)}</strong>?</p>`
    });
    if (!confirmed) return;

    rules.splice(index, 1);
    await this.document.update({ "system.rules": rules });
  }

  /** Build three-tab definitions */
  _getTabs() {
    const tabs = [
      { id: "description", label: "Description", icon: "fa-book-open" },
      { id: "details", label: "Details", icon: "fa-sliders" },
      { id: "rules", label: "Active Effects", icon: "fa-bolt" }
    ];
    for (const tab of tabs) {
      tab.active = tab.id === this._activeTab;
      tab.cssClass = tab.active ? "active" : "";
    }
    return tabs;
  }

  static async #onSwitchTab(event, target) {
    const tabId = target.dataset.tab;
    if (!tabId || tabId === this._activeTab) return;
    // Save any pending editor changes before switching tabs
    await this.submit();
    this._activeTab = tabId;
    // Force all parts to re-render so the ProseMirror guard doesn't
    // keep the old tab visible after switching.
    this._switchingTab = true;
    this.render();
  }

  /**
   * Prepare form data for submission.
   * Skip the default validate() call which fails on partial form data —
   * the document.update() call downstream handles its own validation.
   * @override
   */
  _prepareSubmitData(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    // Always preserve the document's name and img — don't let partial form
    // submissions or re-render timing clear them
    if (!data.name || data.name === "") data.name = this.document.name || "Unnamed Item";
    if (!data.img || data.img === "") data.img = this.document.img || "icons/svg/item-bag.svg";

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
      for (const el of this.element.querySelectorAll(".tab-content, .job-details-panel")) {
        const key = el.dataset.tab || el.className;
        if (el.scrollTop > 0) this._savedScrollPositions[key] = el.scrollTop;
      }
    }

    // When switching tabs we need all parts to re-render so the old tab
    // hides properly. Only protect the ProseMirror editor during in-place
    // re-renders (e.g. submitOnChange from other fields).
    if (this._switchingTab) {
      this._switchingTab = false;
    } else if (this.element) {
      const activePM = document.activeElement?.closest("prose-mirror");
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

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    const tabParts = ["description", "details", "rules"];
    if (tabParts.includes(partId)) {
      const isActive = partId === this._activeTab;
      context.tab = { active: isActive, cssClass: isActive ? "active" : "" };
    }
    return context;
  }

  /** Track whether we've done the initial resize */
  _jobResized = false;
  _skillResized = false;
  _speciesResized = false;
  _accessoryResized = false;
  _armorResized = false;
  _weaponResized = false;

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    if (this.document.type === "species") {
      this.element.classList.add("species-sheet");
      if (!this._speciesResized) {
        this._speciesResized = true;
        this.setPosition({ width: 560, height: 600 });
      }

    }

    if (this.document.type === "manacite" && this.document.system.manaciteType === "skill") {
      this.element.classList.add("skill-sheet", "manacite-skill-sheet");
      if (!this._skillResized) {
        this._skillResized = true;
        this.setPosition({ width: 480, height: 560 });
      }
    }

    if (this.document.type === "manacite" && this.document.system.manaciteType === "job") {
      this.element.classList.add("job-manacite-sheet");
      if (!this._jobResized) {
        this._jobResized = true;
        this.setPosition({ width: 480, height: 560 });
      }

      // Bind drag-and-drop for prerequisites zone
      const prereqZone = this.element.querySelector(".prereq-drop-zone");
      if (prereqZone) {
        prereqZone.addEventListener("dragover", (e) => {
          e.preventDefault();
          prereqZone.classList.add("drag-over");
        });
        prereqZone.addEventListener("dragleave", () => {
          prereqZone.classList.remove("drag-over");
        });
        prereqZone.addEventListener("drop", (e) => {
          prereqZone.classList.remove("drag-over");
          this.#onPrerequisiteDrop(e);
        });
      }
    }

    if (this.document.type === "accessory") {
      this.element.classList.add("accessory-sheet");
      if (!this._accessoryResized) {
        this._accessoryResized = true;
        this.setPosition({ width: 480, height: 520 });
      }
    }

    if (this.document.type === "armor") {
      this.element.classList.add("armor-sheet");
      if (!this._armorResized) {
        this._armorResized = true;
        this.setPosition({ width: 480, height: 520 });
      }
    }

    if (this.document.type === "weapon") {
      this.element.classList.add("weapon-sheet");
      if (!this._weaponResized) {
        this._weaponResized = true;
        this.setPosition({ width: 480, height: 520 });
      }
    }

    // Bind tag select change handlers
    for (const select of this.element.querySelectorAll(".job-tag-select, .job-tag-inline-select")) {
      select.addEventListener("change", this.#onTagSelectChange.bind(this));
    }

    // Restore scroll positions after re-render
    if (this._savedScrollPositions) {
      for (const el of this.element.querySelectorAll(".tab-content, .job-details-panel")) {
        const key = el.dataset.tab || el.className;
        if (this._savedScrollPositions[key]) el.scrollTop = this._savedScrollPositions[key];
      }
      this._savedScrollPositions = null;
    }

    if (this._focusedInput) {
      const el = this.element.querySelector(this._focusedInput.selector);
      if (el) {
        el.focus();
        if (typeof el.setSelectionRange === "function" && this._focusedInput.selStart != null) {
          el.setSelectionRange(this._focusedInput.selStart, this._focusedInput.selEnd);
        }
      }
      this._focusedInput = null;
    }
    // Bind focusin only once (avoid stacking on every render)
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
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;

    context.item = item;
    context.system = item.system;
    context.flags = item.flags;
    context.itemType = item.type;
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
      weaponCategories: localizeMap(CONFIG.MANASHARD.weaponCategories),
      damageTypes: localizeMap(CONFIG.MANASHARD.damageTypes),
      rangeTypes: localizeMap(CONFIG.MANASHARD.rangeTypes),
      skillRangeTypes: localizeMap(CONFIG.MANASHARD.skillRangeTypes),
      handedness: localizeMap(CONFIG.MANASHARD.handedness),
      elements: localizeMap(CONFIG.MANASHARD.elements),
      armorCategories: localizeMap(CONFIG.MANASHARD.armorCategories),
      consumableCategories: localizeMap(CONFIG.MANASHARD.consumableCategories),
      targetTypes: localizeMap(CONFIG.MANASHARD.targetTypes),
      aoeShapes: localizeMap(CONFIG.MANASHARD.aoeShapes),
      aoeTargetFilters: localizeMap(CONFIG.MANASHARD.aoeTargetFilters),
      passiveModes: localizeMap(CONFIG.MANASHARD.passiveModes),
      manaciteSubTypes: localizeMap(CONFIG.MANASHARD.manaciteSubTypes),
      retaliationModes: localizeMap(CONFIG.MANASHARD.retaliationModes),
    };
    context.editable = this.isEditable;
    context.itemTypeLabel = game.i18n.localize(`TYPES.Item.${item.type}`);

    // Tab state
    context.tabs = this._getTabs();
    context.activeTab = this._activeTab;

    // Rule elements with computed summaries and category metadata
    const ruleCategories = CONFIG.MANASHARD?.ruleCategories ?? {};
    context.rules = (item.system.rules ?? []).map((rule, index) => {
      const meta = ruleCategories[rule.key] ?? { category: "special", icon: "fa-question", badge: rule.key };
      return {
        ...rule,
        _index: index,
        _summary: ruleSummary(rule),
        _category: meta.category,
        _icon: meta.icon,
        _badgeLabel: meta.badge
      };
    });

    // Enrich HTML description
    context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      item.system.description ?? "",
      { secrets: this.document.isOwner, rollData: item.getRollData() }
    );

    // Type-specific enrichment and display data
    if (item.type === "manacite" && item.system.manaciteType === "job") {
      // Resolve prerequisite UUIDs into display objects
      const rawPrereqs = item.system.prerequisites ?? [];
      context.prerequisites = [];
      for (const prereq of rawPrereqs) {
        try {
          const resolved = await fromUuid(prereq.uuid);
          context.prerequisites.push({
            uuid: prereq.uuid,
            name: resolved?.name ?? "(missing)",
            img: resolved?.img ?? "icons/svg/mystery-man.svg",
            type: prereq.type,
            level: prereq.level ?? 1
          });
        } catch {
          context.prerequisites.push({
            uuid: prereq.uuid, name: "(broken link)", img: "icons/svg/mystery-man.svg",
            type: prereq.type, level: prereq.level ?? 1
          });
        }
      }
    }


    // ── Weapon tooltip context ──
    if (item.type === "weapon") {
      context.categoryLabel = L(CONFIG.MANASHARD.weaponCategories[item.system.category]) || item.system.category;
      context.damageTypeLabel = L(CONFIG.MANASHARD.damageTypes[item.system.damageType]) || item.system.damageType;
      context.elementLabel = L(CONFIG.MANASHARD.elements[item.system.element] ?? "");
      const rangeTypeKey = CONFIG.MANASHARD.rangeTypes[item.system.rangeType] ?? "";
      context.rangeTypeLabel = rangeTypeKey ? game.i18n.localize(rangeTypeKey) : (item.system.rangeType ?? "Melee");
      const handednessKey = CONFIG.MANASHARD.handedness[item.system.handedness] ?? "";
      context.handednessLabel = handednessKey ? game.i18n.localize(handednessKey) : (item.system.handedness ?? "1H");

      // Derive stat bonuses and passive effects from rule elements
      context.weaponStatBonuses = [];
      context.weaponEffects = [];
      for (const rule of (item.system.rules ?? [])) {
        if (rule.key === "Modifier" && !rule.condition && rule.mode !== "checkOnly") {
          const selectorLabels = CONFIG.MANASHARD.ruleSelectors ?? {};
          const locKey = selectorLabels[rule.selector];
          const label = locKey ? game.i18n.localize(locKey) : (rule.selector ?? "").toUpperCase();
          const pct = rule.mode === "percent" ? "%" : "";
          const val = rule.value ?? 0;
          context.weaponStatBonuses.push({
            label,
            value: val,
            display: (val >= 0 ? "+" : "") + val + pct,
            negative: val < 0
          });
        } else {
          const wMeta = (CONFIG.MANASHARD?.ruleCategories ?? {})[rule.key] ?? { icon: "fa-diamond" };
          context.weaponEffects.push({
            summary: ruleSummary(rule),
            icon: wMeta.icon
          });
        }
      }

      // Parse tags into array
      const tagStr = item.system.tags ?? "";
      context.weaponTags = tagStr.split(",").map(s => s.trim()).filter(s => s.length > 0);
    }
    if (item.type === "armor") {
      context.categoryLabel = L(CONFIG.MANASHARD.armorCategories[item.system.category]) || item.system.category;
    }
    if (item.type === "consumable") {
      context.categoryLabel = L(CONFIG.MANASHARD.consumableCategories[item.system.category]) || item.system.category;
      context.categoryColor = CONFIG.MANASHARD.consumableCategoryColors?.[item.system.category] ?? "#88aacc";
      context.targetTypeLabel = L(CONFIG.MANASHARD.targetTypes[item.system.targetType] ?? "") || item.system.targetType;

      // Parse rule elements into display-friendly effect objects
      context.consumableEffects = (item.system.rules ?? []).map(rule => {
        if (rule.key === "Modifier" || rule.type === "FlatModifier") {
          const sel = rule.selector ?? "";
          if (sel === "hp") {
            const val = Number(rule.value) || 0;
            return { icon: "fa-heart", value: `+${val}`, label: "HP RESTORE", color: "#22cc66", bgColor: "rgba(34,204,102,0.15)" };
          } else if (sel === "mp") {
            const val = Number(rule.value) || 0;
            return { icon: "fa-droplet", value: `+${val}`, label: "MP RESTORE", color: "#3388ee", bgColor: "rgba(51,136,238,0.15)" };
          } else {
            const val = Number(rule.value) || 0;
            const sign = val >= 0 ? "+" : "";
            return { icon: "fa-arrow-up", value: `${sign}${val}`, label: sel.toUpperCase(), color: "#00e4a0", bgColor: "rgba(0,228,160,0.15)" };
          }
        } else if ((rule.key === "Status" && rule.action === "remove") || rule.type === "StatusRemove") {
          const status = rule.status ?? "unknown";
          return { icon: "fa-eraser", value: "CLEANSE", label: status.toUpperCase(), color: "#44ccaa", bgColor: "rgba(68,204,170,0.15)" };
        } else if ((rule.key === "Status" && rule.action === "inflict") || rule.type === "StatusInflict") {
          const status = rule.status ?? "unknown";
          return { icon: "fa-skull-crossbones", value: "INFLICT", label: status.toUpperCase(), color: "#ee6644", bgColor: "rgba(238,102,68,0.15)" };
        }
        return null;
      }).filter(Boolean);
    }
    if (item.type === "manacite" && item.system.manaciteType === "skill") {
      context.skillTypeLabel = L(CONFIG.MANASHARD.manaciteSubTypes?.[item.system.skillType]) || item.system.skillType;
      context.elementLabel = L(CONFIG.MANASHARD.elements[item.system.element] ?? "");


      // Sub-type specific labels for description display
      const sType = item.system.skillType;
      if (sType === "passive") {
        context.passiveModeLabel = game.i18n.localize(CONFIG.MANASHARD.passiveModes[item.system.passiveMode] ?? "");
      }
      context.isSkillType = item.system.manaciteType === "skill";

      // Damage formula context
      context.isWeaponMode = item.system.baseRateMode === "weapon";
      const el = item.system.element || "";
      const dt = item.system.damageType || (el ? "magical" : "physical");
      const ss = item.system.scalingStat ?? "auto";
      if (ss === "auto") {
        context.scalingStatLabel = dt === "magical" ? "MAG" : "STR";
      } else if (ss === "none") {
        context.scalingStatLabel = null;
      } else {
        context.scalingStatLabel = ss.toUpperCase();
      }

      // Effective combat stats for description display
      context.effectiveMpCost = item.system.mpCost ?? 0;
      context.effectiveBaseRate = item.system.baseRate ?? 0;
      context.effectiveSkillHit = item.system.skillHit ?? 0;

      // Damage mode label for tooltip display
      const dmgMode = item.system.damageType || "";
      if (dmgMode === "physical") context.manaDmgModeLabel = "Physical";
      else if (dmgMode === "magical") context.manaDmgModeLabel = "Magic";
      else context.manaDmgModeLabel = "Auto";

      // Target label for tooltip display
      const tt = item.system.targetType ?? "single";
      const targetLabels = { single: "Single", aoe: "AOE", self: "Self" };
      context.manaTargetLabel = targetLabels[tt] ?? tt;

      // AOE details for tooltip
      if (tt === "aoe") {
        const shapeLabels = { circle: "Circle", line: "Line", cross: "Cross" };
        const filterLabels = { enemies: "Enemies", allies: "Allies", all: "All", allExcludeSelf: "All (Exc. Self)" };
        context.manaAoeLabel = `${shapeLabels[item.system.aoeShape] ?? "?"} ${item.system.aoeSize ?? 1} — ${filterLabels[item.system.aoeTargetFilter] ?? "Enemies"}`;
      }

      // Effects from rules for tooltip display
      context.manaEffects = [];
      const cats = CONFIG.MANASHARD?.ruleCategories ?? {};
      for (const rule of (item.system.rules ?? [])) {
        const meta = cats[rule.key] ?? { category: "special", icon: "fa-question", badge: rule.key };
        context.manaEffects.push({
          label: ruleSummary(rule),
          icon: meta.icon,
          category: meta.category
        });
      }
    }

    // ── Accessory tooltip context ──
    if (item.type === "accessory") {
      // Derive stat bonuses and passive effects from rule elements
      context.accessoryStatBonuses = [];
      context.accessoryEffects = [];
      for (const rule of (item.system.rules ?? [])) {
        if (rule.key === "Modifier" && !rule.condition && rule.mode !== "checkOnly") {
          const selectorLabels = CONFIG.MANASHARD.ruleSelectors ?? {};
          const locKey = selectorLabels[rule.selector];
          const label = locKey ? game.i18n.localize(locKey) : (rule.selector ?? "").toUpperCase();
          const pct = rule.mode === "percent" ? "%" : "";
          context.accessoryStatBonuses.push({
            label,
            value: rule.value ?? 0,
            display: (rule.value >= 0 ? "+" : "") + rule.value + pct
          });
        } else {
          const aMeta = (CONFIG.MANASHARD?.ruleCategories ?? {})[rule.key] ?? { icon: "fa-diamond" };
          context.accessoryEffects.push({
            summary: ruleSummary(rule),
            icon: aMeta.icon
          });
        }
      }

      // Parse tags into array
      const tagStr = item.system.tags ?? "";
      context.accessoryTags = tagStr.split(",").map(s => s.trim()).filter(s => s.length > 0);

    }

    // ── Armor tooltip context ──
    if (item.type === "armor") {
      // Derive stat bonuses and passive effects from rule elements
      context.armorStatBonuses = [];
      context.armorEffects = [];
      for (const rule of (item.system.rules ?? [])) {
        if (rule.key === "Modifier" && !rule.condition && rule.mode !== "checkOnly") {
          const selectorLabels = CONFIG.MANASHARD.ruleSelectors ?? {};
          const locKey = selectorLabels[rule.selector];
          const label = locKey ? game.i18n.localize(locKey) : (rule.selector ?? "").toUpperCase();
          const pct = rule.mode === "percent" ? "%" : "";
          const val = rule.value ?? 0;
          context.armorStatBonuses.push({
            label,
            value: val,
            display: (val >= 0 ? "+" : "") + val + pct,
            negative: val < 0
          });
        } else {
          const arMeta = (CONFIG.MANASHARD?.ruleCategories ?? {})[rule.key] ?? { icon: "fa-diamond" };
          context.armorEffects.push({
            summary: ruleSummary(rule),
            icon: arMeta.icon
          });
        }
      }

      // Parse tags into array
      const tagStr = item.system.tags ?? "";
      context.armorTags = tagStr.split(",").map(s => s.trim()).filter(s => s.length > 0);

    }

    // ── Material tooltip context ──
    if (item.type === "material") {
      // Parse sources and tags into arrays
      const srcStr = item.system.sources ?? "";
      context.materialSources = srcStr.split(",").map(s => s.trim()).filter(s => s.length > 0);

      const tagStr = item.system.tags ?? "";
      context.materialTags = tagStr.split(",").map(s => s.trim()).filter(s => s.length > 0);

      // Computed total value
      context.totalValue = (item.system.quantity ?? 0) * (item.system.price ?? 0);

    }

    return context;
  }
}

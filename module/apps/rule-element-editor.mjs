import { ruleSummary } from "../helpers/rule-engine.mjs";
import { migrateRule } from "../helpers/rule-migration.mjs";
import { renderTagInput, bindTagInput, readTagInput } from "./tag-input.mjs";

/**
 * Form-based dialog for adding or editing a rule element on an item.
 * Six rule types: Aura, CombatNote, Elemental, Grant, Modifier, Status.
 */
export class RuleElementEditor {

  /**
   * @param {Item} item - The item document to edit rules on
   * @param {number} ruleIndex - Index into system.rules (-1 for new rule)
   */
  constructor(item, ruleIndex = -1) {
    this.item = item;
    this.ruleIndex = ruleIndex;
    this.ruleData = ruleIndex >= 0
      ? migrateRule(foundry.utils.deepClone(item.system.rules[ruleIndex]))
      : { key: "Modifier", selector: "str", value: 0, mode: "flat", label: "" };
  }

  /**
   * Render the editor dialog.
   */
  async render() {
    const content = this._buildContent();
    const isNew = this.ruleIndex < 0;
    const title = isNew ? "Add Active Effect" : "Edit Active Effect";

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title, classes: ["manashard", "rule-editor-dialog"] },
      position: { width: 480, height: "auto" },
      content,
      buttons: [
        {
          action: "save",
          label: isNew ? "Add" : "Save",
          icon: "fas fa-check",
          default: true,
          callback: (event, btn, dialog) => this._collectFormData(dialog.element)
        },
        { action: "cancel", label: "Cancel" }
      ],
      render: (event, dialog) => this._onDialogRender(dialog.element)
    });

    if (result === "cancel" || !result) return;
    await this._saveRule(result);
  }

  /**
   * Build the dialog HTML content.
   */
  _buildContent() {
    const rule = this.ruleData;
    const config = CONFIG.MANASHARD;

    // Type selector
    const typeOptions = Object.entries(config.ruleElementTypes).map(([key, label]) => {
      const sel = key === rule.key ? "selected" : "";
      return `<option value="${key}" ${sel}>${game.i18n.localize(label)}</option>`;
    }).join("");

    // Label field
    const labelVal = rule.label ?? "";

    return `
      <div class="rule-editor-form">
        <div class="re-form-group">
          <label>Type</label>
          <select class="re-type-select" name="key">${typeOptions}</select>
        </div>
        <div class="re-form-group">
          <label>Label <span class="re-hint">(optional)</span></label>
          <input type="text" name="label" value="${labelVal}" placeholder="Auto-generated if empty" />
        </div>
        <div class="re-type-fields">
          ${this._buildTypeFields(rule.key, rule)}
        </div>
        <div class="re-preview">
          <span class="re-preview-label">Preview:</span>
          <span class="re-preview-text">${ruleSummary(rule)}</span>
        </div>
      </div>`;
  }

  /**
   * Build form fields specific to the selected rule type.
   */
  _buildTypeFields(type, rule = {}) {
    const config = CONFIG.MANASHARD;

    switch (type) {
      // ── Aura ─────────────────────────────────────────────────────
      case "Aura": {
        const effect = rule.effect ?? { key: "Modifier" };
        const effectTypeOptions = [...config.auraEffectTypes].sort().map(k => {
          const label = config.ruleElementTypes[k];
          const sel = k === effect.key ? "selected" : "";
          return `<option value="${k}" ${sel}>${game.i18n.localize(label)}</option>`;
        }).join("");

        const targetOptions = Object.entries(config.auraTargets).map(([k, l]) =>
          `<option value="${k}" ${(rule.target ?? "allies") === k ? "selected" : ""}>${game.i18n.localize(l)}</option>`
        ).join("");

        return `
          <div class="re-form-group">
            <label>${game.i18n.localize("MANASHARD.AuraRadius")}</label>
            <input type="number" name="radius" value="${rule.radius ?? 2}" min="1" />
          </div>
          <div class="re-form-group">
            <label>Target</label>
            <select name="target">${targetOptions}</select>
          </div>
          <div class="re-form-group">
            <label>${game.i18n.localize("MANASHARD.AuraEffect")}</label>
            <select class="re-aura-effect-type" name="effectKey">${effectTypeOptions}</select>
          </div>
          <div class="re-aura-effect-fields">
            ${this._buildTypeFields(effect.key, effect)}
          </div>`;
      }

      // ── CombatNote ───────────────────────────────────────────────
      case "CombatNote":
        return `
          <div class="re-form-group">
            <label>Note Text</label>
            <textarea name="text" rows="3" placeholder="e.g. When this unit deals damage in melee: Push foe 1 space back.">${rule.text ?? ""}</textarea>
          </div>
          <div class="re-form-group">
            <label>Condition <span class="re-hint">(blank = always)</span></label>
            ${this._conditionDropdown(rule.condition ?? "")}
          </div>`;

      // ── Elemental ────────────────────────────────────────────────
      case "Elemental":
        return `
          <div class="re-form-group">
            <label>Element</label>
            <select name="element">
              ${Object.entries(config.elements).filter(([k]) => k !== "null").map(([k, l]) =>
                `<option value="${k}" ${rule.element === k ? "selected" : ""}>${game.i18n.localize(l)}</option>`
              ).join("")}
            </select>
          </div>
          <div class="re-form-group">
            <label>Tier</label>
            <select name="tier">
              ${Object.entries(config.elementalTiers).map(([k, l]) =>
                `<option value="${k}" ${rule.tier === k ? "selected" : ""}>${game.i18n.localize(l)}</option>`
              ).join("")}
            </select>
          </div>
          <div class="re-form-group">
            <label>Damage Multiplier <span class="re-hint">(optional, for vulnerability — e.g. 2 = double damage)</span></label>
            <input type="number" name="multiplier" value="${rule.multiplier ?? ""}" min="0" step="0.5" placeholder="Leave empty for affinity only" />
          </div>`;

      // ── Grant ────────────────────────────────────────────────────
      case "Grant": {
        const subtype = rule.subtype ?? "element";
        const subtypeOptions = Object.entries(config.grantSubtypes).map(([k, l]) =>
          `<option value="${k}" ${subtype === k ? "selected" : ""}>${game.i18n.localize(l)}</option>`
        ).join("");

        return `
          <div class="re-form-group">
            <label>Grant Type</label>
            <select class="re-grant-subtype" name="subtype">${subtypeOptions}</select>
          </div>
          <div class="re-grant-subtype-fields">
            ${this._buildGrantSubtypeFields(subtype, rule)}
          </div>`;
      }

      // ── Modifier ─────────────────────────────────────────────────
      case "Modifier": {
        const mode = rule.mode ?? "flat";
        const modeOptions = Object.entries(config.modifierModes).map(([k, l]) =>
          `<option value="${k}" ${mode === k ? "selected" : ""}>${game.i18n.localize(l)}</option>`
        ).join("");

        // Show damageType sub-field when selector is damageTaken
        const showDamageType = rule.selector === "damageTaken";
        const damageTypeField = showDamageType ? `
          <div class="re-form-group re-damage-type-field">
            <label>Damage Type <span class="re-hint">(blank = all)</span></label>
            <select name="damageType">
              <option value="" ${!rule.damageType ? "selected" : ""}>None</option>
              ${Object.entries(config.damageTakenTypes).map(([k, l]) =>
                `<option value="${k}" ${rule.damageType === k ? "selected" : ""}>${game.i18n.localize(l)}</option>`
              ).join("")}
            </select>
          </div>` : "";

        return `
          <div class="re-form-group">
            <label>Stat</label>
            ${this._selectorDropdown(rule.selector ?? "str")}
          </div>
          <div class="re-form-group">
            <label>Value</label>
            <input type="number" name="value" value="${rule.value ?? 0}" step="any" />
          </div>
          <div class="re-form-group">
            <label>Mode</label>
            <select name="mode">${modeOptions}</select>
          </div>
          ${damageTypeField}
          <div class="re-form-group">
            <label>Condition <span class="re-hint">(blank = always)</span></label>
            ${this._conditionDropdown(rule.condition ?? "")}
          </div>
          <div class="re-form-group re-stacks-field" style="${rule.condition ? "" : "display:none;"}">
            <label>
              <input type="checkbox" name="stacks" ${rule.stacks ? "checked" : ""} />
              Per Stack <span class="re-hint">(multiply value by condition count)</span>
            </label>
          </div>
          <div class="re-form-group" style="flex-direction:column;align-items:flex-start;">
            <label>Target Types <span class="re-hint">(blank = any target)</span></label>
            ${renderTagInput({ name: "targetTypes", choices: this._creatureTypeChoices(), selected: rule.targetTypes ?? [], placeholder: "Add type..." })}
          </div>`;
      }

      // ── Status ───────────────────────────────────────────────────
      case "Status": {
        const action = rule.action ?? "inflict";
        const actionOptions = Object.entries(config.statusActions).map(([k, l]) =>
          `<option value="${k}" ${action === k ? "selected" : ""}>${game.i18n.localize(l)}</option>`
        ).join("");

        return `
          <div class="re-form-group">
            <label>Action</label>
            <select class="re-status-action" name="action">${actionOptions}</select>
          </div>
          <div class="re-status-action-fields">
            ${this._buildStatusActionFields(action, rule)}
          </div>`;
      }

      // ── Trigger ───────────────────────────────────────────────────
      case "Trigger": {
        const event = rule.event ?? "onDefeat";
        const eventOptions = Object.entries(config.triggerEvents).map(([k, l]) =>
          `<option value="${k}" ${event === k ? "selected" : ""}>${game.i18n.localize(l)}</option>`
        ).join("");

        const action = rule.action ?? "restoreHP";
        const actionOptions = Object.entries(config.triggerActions).map(([k, l]) =>
          `<option value="${k}" ${action === k ? "selected" : ""}>${game.i18n.localize(l)}</option>`
        ).join("");

        return `
          <div class="re-form-group">
            <label>Event</label>
            <select name="event">${eventOptions}</select>
          </div>
          <div class="re-form-group">
            <label>Action</label>
            <select name="action">${actionOptions}</select>
          </div>
          <div class="re-form-group">
            <label>Value</label>
            <input type="number" name="value" value="${rule.value ?? 0}" min="0" />
          </div>`;
      }

      // ── TargetRestriction ────────────────────────────────────────
      case "TargetRestriction": {
        const mode = rule.mode ?? "only";
        const modeOptions = Object.entries(config.targetRestrictionModes).map(([k, l]) =>
          `<option value="${k}" ${mode === k ? "selected" : ""}>${game.i18n.localize(l)}</option>`
        ).join("");

        const crChoices = {};
        for (const [k, l] of Object.entries(config.creatureTypes)) crChoices[k] = game.i18n.localize(l);

        return `
          <div class="re-form-group">
            <label>Mode</label>
            <select name="mode">${modeOptions}</select>
          </div>
          <div class="re-form-group" style="flex-direction:column;align-items:flex-start;">
            <label>Creature Types</label>
            ${renderTagInput({ name: "creatureTypes", choices: crChoices, selected: rule.creatureTypes ?? [], placeholder: "Add type..." })}
          </div>`;
      }

      default:
        return `<p class="re-hint">Unknown rule type.</p>`;
    }
  }

  /**
   * Build fields for a Grant subtype.
   */
  _buildGrantSubtypeFields(subtype, rule = {}) {
    const config = CONFIG.MANASHARD;

    switch (subtype) {
      case "armorProficiency": {
        const isChoice = !!rule.choiceMode;
        const choiceToggle = `
          <div class="re-form-group">
            <label>
              <input type="checkbox" name="choiceMode" ${isChoice ? "checked" : ""} />
              ${game.i18n.localize("MANASHARD.GrantChoiceMode")}
            </label>
          </div>`;

        if (isChoice) {
          return `${choiceToggle}
            <p class="re-hint"><em>Player will choose an armor category when this item is granted.</em></p>`;
        }

        const options = Object.entries(config.armorCategories)
          .map(([k, l]) => `<option value="${k}" ${rule.armorCategory === k ? "selected" : ""}>${game.i18n.localize(l)}</option>`)
          .join("");
        return `${choiceToggle}
          <div class="re-form-group">
            <label>${game.i18n.localize("MANASHARD.ArmorCategory")}</label>
            <select name="armorCategory">${options}</select>
          </div>`;
      }

      case "element":
        return `
          <div class="re-form-group">
            <label>Element</label>
            <select name="element">
              ${Object.entries(config.elements).filter(([k]) => k !== "null").map(([k, l]) =>
                `<option value="${k}" ${rule.element === k ? "selected" : ""}>${game.i18n.localize(l)}</option>`
              ).join("")}
            </select>
          </div>`;

      case "item": {
        // Normalize legacy boolean choiceMode
        const choiceMode = rule.choiceMode === true ? "filtered" : (rule.choiceMode || "off");
        const hasItem = !!(rule.uuid);
        const imgSrc = rule.grantImg || "icons/svg/item-bag.svg";

        const choiceModeSelect = `
          <div class="re-form-group">
            <label>${game.i18n.localize("MANASHARD.GrantChoiceMode")}</label>
            <select name="choiceMode">
              <option value="off" ${choiceMode === "off" ? "selected" : ""}>Off (Single Item)</option>
              <option value="filtered" ${choiceMode === "filtered" ? "selected" : ""}>Filtered (Compendium Search)</option>
              <option value="custom" ${choiceMode === "custom" ? "selected" : ""}>Custom List</option>
            </select>
          </div>`;

        if (choiceMode === "filtered") {
          const filters = rule.choiceFilters ?? {};
          const subTypeOptions = `<option value="" ${!filters.skillType ? "selected" : ""}>Any</option>` +
            Object.entries(CONFIG.MANASHARD?.manaciteSubTypes ?? {})
            .map(([k, v]) => `<option value="${k}" ${filters.skillType === k ? "selected" : ""}>${game.i18n.localize(v)}</option>`)
            .join("");

          return `
            ${choiceModeSelect}
            <input type="hidden" name="choiceItemType" value="${rule.choiceItemType ?? "manacite"}" />
            <div class="re-form-group">
              <label>${game.i18n.localize("MANASHARD.SkillType")}</label>
              <select name="choiceFilterSkillType">${subTypeOptions}</select>
            </div>
            <p class="re-hint"><em>Player will choose from matching items when this is granted.</em></p>`;
        }

        if (choiceMode === "custom") {
          const items = rule.choiceItems ?? [];
          const rows = items.map((ci, i) => this._buildCustomListRow(ci, i)).join("");

          return `
            ${choiceModeSelect}
            <input type="hidden" name="choiceItems" value='${JSON.stringify(items).replace(/'/g, "&#39;")}' />
            <div class="re-grant-custom-list" style="display:flex;flex-direction:column;gap:3px;margin-top:6px;max-height:200px;overflow-y:auto;">${rows}</div>
            <div class="re-grant-custom-drop" data-drop-target="grant-custom">
              <i class="fas fa-plus-circle re-grant-drop-icon"></i>
              <span class="re-grant-drop-text">Drag Items or Active Effects here to add</span>
            </div>
            <p class="re-hint"><em>Player will choose from this curated list when granted.</em></p>`;
        }

        return `
          ${choiceModeSelect}
          <input type="hidden" name="uuid" value="${rule.uuid ?? ""}" />
          <input type="hidden" name="grantType" value="${rule.grantType ?? "Item"}" />
          <input type="hidden" name="grantName" value="${rule.grantName ?? ""}" />
          <input type="hidden" name="grantImg" value="${rule.grantImg ?? ""}" />
          <div class="re-grant-drop-zone${hasItem ? " re-grant-filled" : ""}" data-drop-target="grant">
            ${hasItem ? `
              <img src="${imgSrc}" class="re-grant-img" alt="" />
              <div class="re-grant-info">
                <span class="re-grant-name">${rule.grantName || rule.uuid}</span>
                <span class="re-grant-type-badge">${rule.grantType ?? "Item"}</span>
              </div>
              <button type="button" class="re-grant-clear" title="Clear"><i class="fas fa-xmark"></i></button>
            ` : `
              <i class="fas fa-plus-circle re-grant-drop-icon"></i>
              <span class="re-grant-drop-text">Drag an Item or Active Effect here</span>
            `}
          </div>`;
      }

      case "movementMode":
        return `
          <div class="re-form-group">
            <label>Movement Mode</label>
            <select name="movementMode">
              ${Object.entries(config.movementModes).map(([k, l]) =>
                `<option value="${k}" ${rule.movementMode === k ? "selected" : ""}>${game.i18n.localize(l)}</option>`
              ).join("")}
            </select>
          </div>`;

      case "creatureType": {
        const ctChoices = {};
        for (const [k, l] of Object.entries(config.creatureTypes)) ctChoices[k] = game.i18n.localize(l);
        const ctSelected = Array.isArray(rule.creatureType) ? rule.creatureType : [rule.creatureType].filter(Boolean);
        return `
          <div class="re-form-group" style="flex-direction:column;align-items:flex-start;">
            <label>Creature Type</label>
            ${renderTagInput({ name: "creatureType", choices: ctChoices, selected: ctSelected, placeholder: "Add type..." })}
          </div>`;
      }

      case "weaponProficiency": {
        const isChoice = !!rule.choiceMode;
        const choiceToggle = `
          <div class="re-form-group">
            <label>
              <input type="checkbox" name="choiceMode" ${isChoice ? "checked" : ""} />
              ${game.i18n.localize("MANASHARD.GrantChoiceMode")}
            </label>
          </div>`;

        if (isChoice) {
          return `${choiceToggle}
            <p class="re-hint"><em>Player will choose a weapon category when this item is granted.</em></p>`;
        }

        const options = Object.entries(config.weaponCategories)
          .filter(([k]) => k !== "natural")
          .map(([k, l]) => `<option value="${k}" ${rule.weaponCategory === k ? "selected" : ""}>${game.i18n.localize(l)}</option>`)
          .join("");
        return `${choiceToggle}
          <div class="re-form-group">
            <label>${game.i18n.localize("MANASHARD.WeaponCategory")}</label>
            <select name="weaponCategory">${options}</select>
          </div>`;
      }

      case "trapSense":
        return `
          <p class="re-hint"><em>Grants Trap Sense: reveals traps and hidden doors within the user's Vision range as a dark silhouette.</em></p>`;

      case "spatialInventory":
        return `
          <p class="re-hint"><em>Grants Spatial Inventory: access a pocket dimension to store and retrieve items. Stored items are weightless.</em></p>`;

      case "dualWield":
        return `
          <p class="re-hint"><em>Grants Dual Wield: allows off-hand weapon strikes at full damage instead of half.</em></p>`;

      default:
        return `<p class="re-hint">Unknown grant subtype.</p>`;
    }
  }

  /**
   * Build fields for a Status action.
   */
  _buildStatusActionFields(action, rule = {}) {
    const config = CONFIG.MANASHARD;
    const statusDropdown = `
      <div class="re-form-group">
        <label>Status</label>
        <select name="status">
          ${Object.entries(config.statusEffects).map(([k, data]) =>
            `<option value="${k}" ${rule.status === k ? "selected" : ""}>${game.i18n.localize(data.label)}</option>`
          ).join("")}
        </select>
      </div>`;

    switch (action) {
      case "immune":
        return statusDropdown;

      case "inflict":
        return `
          ${statusDropdown}
          <div class="re-form-group">
            <label>Base Chance (%)</label>
            <input type="number" name="chance" value="${rule.chance ?? 30}" min="0" max="100" />
          </div>
          `;

      case "remove":
        return `<p class="re-hint"><em>When this skill is used on a target, opens a dialog to choose which status effect to remove.</em></p>`;

      default:
        return `<p class="re-hint">Unknown status action.</p>`;
    }
  }

  /**
   * Build a selector dropdown for stat targeting using grouped selectors.
   */
  _selectorDropdown(current) {
    const config = CONFIG.MANASHARD;
    const groups = config.ruleSelectorGroups ?? {};
    const labels = config.ruleSelectors ?? {};

    let html = `<select name="selector">`;
    for (const [, group] of Object.entries(groups)) {
      const groupLabel = game.i18n.localize(group.label);
      html += `<optgroup label="${groupLabel}">`;
      for (const sel of group.selectors) {
        const label = labels[sel] ? game.i18n.localize(labels[sel]) : sel.toUpperCase();
        html += `<option value="${sel}" ${current === sel ? "selected" : ""}>${label}</option>`;
      }
      html += `</optgroup>`;
    }
    html += `</select>`;
    return html;
  }

  /**
   * Get localized creature type choices map.
   */
  _creatureTypeChoices() {
    const choices = {};
    for (const [k, l] of Object.entries(CONFIG.MANASHARD.creatureTypes)) {
      choices[k] = game.i18n.localize(l);
    }
    return choices;
  }

  /**
   * Build a condition dropdown for optional conditional effects.
   */
  _conditionDropdown(current) {
    const config = CONFIG.MANASHARD;
    const knownKeys = new Set(Object.keys(config.ruleConditions));
    const isCustom = current && !knownKeys.has(current);
    const options = Object.entries(config.ruleConditions)
      .map(([k, l]) => ({ key: k, label: game.i18n.localize(l) }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(({ key, label }) =>
        `<option value="${key}" ${current === key ? "selected" : ""}>${label}</option>`
      ).join("");
    return `<select name="condition">
      <option value="" ${!current ? "selected" : ""}>Always</option>
      <option value="__custom__" ${isCustom ? "selected" : ""}>Custom...</option>
      ${options}
    </select>
    <input type="text" name="conditionCustom" class="re-condition-custom"
           placeholder="e.g. Chivalry, Bravery, etc."
           value="${isCustom ? current : ""}"
           style="${isCustom ? "" : "display:none;"}" />`;
  }

  /**
   * Hook into dialog render to add dynamic type switching and live preview.
   */
  _onDialogRender(element) {
    const typeSelect = element.querySelector(".re-type-select");
    const fieldsContainer = element.querySelector(".re-type-fields");
    const previewText = element.querySelector(".re-preview-text");

    if (!typeSelect || !fieldsContainer) return;

    // Type change → swap fields
    typeSelect.addEventListener("change", () => {
      const newType = typeSelect.value;
      fieldsContainer.innerHTML = this._buildTypeFields(newType, { key: newType });
      this._updatePreview(element, previewText);
      this._attachFieldListeners(element, previewText);
      this._bindGrantDropZone(element, previewText);
      this._bindCustomListDropZone(element, previewText);
      this._bindChoiceModeToggle(element, fieldsContainer, previewText);
      this._bindAuraEffectTypeToggle(element, previewText);
      this._bindGrantSubtypeToggle(element, previewText);
      this._bindStatusActionToggle(element, previewText);
      this._bindSelectorChange(element, previewText);
      this._bindTagInputs(element, previewText);
    });

    // Live preview updates on field changes
    this._attachFieldListeners(element, previewText);
    this._bindGrantDropZone(element, previewText);
    this._bindCustomListDropZone(element, previewText);
    this._bindChoiceModeToggle(element, fieldsContainer, previewText);
    this._bindAuraEffectTypeToggle(element, previewText);
    this._bindGrantSubtypeToggle(element, previewText);
    this._bindStatusActionToggle(element, previewText);
    this._bindSelectorChange(element, previewText);
    this._bindTagInputs(element, previewText);
  }

  /**
   * Bind all tag input widgets in the dialog for live preview updates.
   */
  _bindTagInputs(element, previewText) {
    const config = CONFIG.MANASHARD;
    const crChoices = {};
    for (const [k, l] of Object.entries(config.creatureTypes)) crChoices[k] = game.i18n.localize(l);

    // TargetRestriction creature types
    bindTagInput(element, "creatureTypes", crChoices, () => this._updatePreview(element, previewText));

    // Modifier targetTypes
    bindTagInput(element, "targetTypes", crChoices, () => this._updatePreview(element, previewText));

    // Grant creatureType
    bindTagInput(element, "creatureType", crChoices, () => this._updatePreview(element, previewText));
  }

  /**
   * Attach change/input listeners to all form fields for live preview.
   */
  _attachFieldListeners(element, previewText) {
    element.querySelectorAll(".re-type-fields input, .re-type-fields select, .re-type-fields textarea, .re-type-select, [name='label']").forEach(el => {
      el.addEventListener("input", () => this._updatePreview(element, previewText));
      el.addEventListener("change", () => this._updatePreview(element, previewText));
    });

    // Toggle custom condition text input visibility and stacks checkbox
    const condSelect = element.querySelector(".re-type-fields [name='condition']");
    const condCustom = element.querySelector(".re-type-fields [name='conditionCustom']");
    const stacksField = element.querySelector(".re-type-fields .re-stacks-field");
    if (condSelect && condCustom) {
      condSelect.addEventListener("change", () => {
        condCustom.style.display = condSelect.value === "__custom__" ? "" : "none";
        if (condSelect.value !== "__custom__") condCustom.value = "";
        if (stacksField) stacksField.style.display = condSelect.value ? "" : "none";
      });
    }
  }

  /**
   * Update the live preview from current form state.
   */
  _updatePreview(element, previewText) {
    if (!previewText) return;
    const data = this._collectFormData(element);
    if (data) previewText.textContent = ruleSummary(data);
  }

  /**
   * Collect all form field values into a rule data object.
   */
  _collectFormData(element) {
    const data = {};
    data.key = element.querySelector("[name='key']")?.value ?? "Modifier";
    data.label = element.querySelector("[name='label']")?.value?.trim() ?? "";

    // ── Aura: collect radius, target, and nested effect separately
    if (data.key === "Aura") {
      data.radius = Number(element.querySelector(".re-type-fields [name='radius']")?.value) || 2;
      data.target = element.querySelector(".re-type-fields [name='target']")?.value ?? "allies";
      const effectKey = element.querySelector(".re-type-fields [name='effectKey']")?.value ?? "Modifier";
      const effect = { key: effectKey };

      const nestedFields = ["selector", "value", "mode", "element", "tier", "status",
        "chance", "duration", "movementMode", "creatureType", "condition", "multiplier", "subtype", "action"];
      for (const field of nestedFields) {
        const el = element.querySelector(`.re-aura-effect-fields [name='${field}']`);
        if (!el) continue;
        let val = el.value;
        if (["value", "chance", "duration", "multiplier"].includes(field)) val = Number(val) || 0;
        effect[field] = val;
      }
      if (effect.condition === "__custom__") {
        const customVal = element.querySelector(".re-aura-effect-fields [name='conditionCustom']")?.value?.trim();
        effect.condition = customVal || "";
      }
      if (effect.condition === "") delete effect.condition;
      data.effect = effect;
      if (!data.label) data.label = ruleSummary(data);
      return data;
    }

    // ── Grant: collect subtype and subtype-specific fields
    if (data.key === "Grant") {
      data.subtype = element.querySelector(".re-type-fields [name='subtype']")?.value ?? "element";
      if (data.subtype === "creatureType") {
        data.creatureType = readTagInput(element, "creatureType");
      }
    }

    // ── Status: collect action
    if (data.key === "Status") {
      data.action = element.querySelector(".re-type-fields [name='action']")?.value ?? "inflict";
    }

    // ── Trigger: collect event, action, value
    if (data.key === "Trigger") {
      data.event = element.querySelector(".re-type-fields [name='event']")?.value ?? "onDefeat";
      data.action = element.querySelector(".re-type-fields [name='action']")?.value ?? "restoreHP";
      data.value = Number(element.querySelector(".re-type-fields [name='value']")?.value) || 0;
      if (!data.label) data.label = ruleSummary(data);
      return data;
    }

    // ── TargetRestriction: collect mode and creature types from tag input
    if (data.key === "TargetRestriction") {
      data.mode = element.querySelector(".re-type-fields [name='mode']")?.value ?? "only";
      data.creatureTypes = readTagInput(element, "creatureTypes");
      if (!data.label) data.label = ruleSummary(data);
      return data;
    }

    // Type-specific fields
    const fields = ["selector", "value", "mode", "damageType", "element",
      "tier", "status", "chance", "duration",
      "movementMode", "condition",
      "uuid", "grantType", "grantName", "grantImg", "text", "weaponCategory", "armorCategory",
      "multiplier"];
    for (const field of fields) {
      const el = element.querySelector(`.re-type-fields [name='${field}']`);
      if (!el) continue;
      let val = el.value;
      if (["value", "chance", "duration", "multiplier"].includes(field)) {
        val = Number(val) || 0;
      }
      data[field] = val;
    }

    // Strip zero scaling fields
    if (data.multiplier === 0) delete data.multiplier;

    // Resolve custom condition
    if (data.condition === "__custom__") {
      const customVal = element.querySelector(".re-type-fields [name='conditionCustom']")?.value?.trim();
      data.condition = customVal || "";
    }
    // Strip empty condition
    if (data.condition === "") delete data.condition;
    // Strip empty damageType
    if (data.damageType === "") delete data.damageType;

    // Collect target types and stacks from tag input (Modifier)
    if (data.key === "Modifier") {
      const targetTypes = readTagInput(element, "targetTypes");
      if (targetTypes.length) data.targetTypes = targetTypes;
      const stacksEl = element.querySelector(".re-type-fields [name='stacks']");
      if (stacksEl?.checked) data.stacks = true;
    }

    // Choice mode (Grant with item/weaponProficiency/armorProficiency subtypes)
    const choiceModeEl = element.querySelector(".re-type-fields [name='choiceMode']");
    if (choiceModeEl) {
      // Handle both the new <select> (for item subtype) and legacy <checkbox> (for proficiency subtypes)
      const isCheckbox = choiceModeEl.type === "checkbox";
      const choiceVal = isCheckbox ? (choiceModeEl.checked ? true : false) : choiceModeEl.value;

      if (data.subtype === "item") {
        if (choiceVal === "filtered") {
          data.choiceMode = "filtered";
          data.choiceItemType = element.querySelector(".re-type-fields [name='choiceItemType']")?.value ?? "manacite";
          data.choiceFilters = {};
          const typeEl = element.querySelector(".re-type-fields [name='choiceFilterSkillType']");
          if (typeEl?.value) data.choiceFilters.skillType = typeEl.value;
          delete data.uuid; delete data.grantType; delete data.grantName; delete data.grantImg;
          delete data.choiceItems;
        } else if (choiceVal === "custom") {
          data.choiceMode = "custom";
          const hiddenInput = element.querySelector(".re-type-fields [name='choiceItems']");
          data.choiceItems = JSON.parse(hiddenInput?.value || "[]");
          delete data.uuid; delete data.grantType; delete data.grantName; delete data.grantImg;
          delete data.choiceFilters; delete data.choiceItemType;
        } else {
          // "off"
          delete data.choiceMode;
          delete data.choiceFilters; delete data.choiceItemType; delete data.choiceItems;
        }
      } else if (isCheckbox && choiceModeEl.checked) {
        data.choiceMode = true;
        if (data.subtype === "weaponProficiency") delete data.weaponCategory;
        else if (data.subtype === "armorProficiency") delete data.armorCategory;
      }
    }

    // Strip legacy fields
    delete data.scope;

    // Auto-generate label if empty
    if (!data.label) {
      data.label = ruleSummary(data);
    }

    return data;
  }

  /**
   * Bind drag-and-drop and clear button on the Grant item drop zone.
   */
  _bindGrantDropZone(element, previewText) {
    const zone = element.querySelector(".re-grant-drop-zone");
    if (!zone) return;

    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", async (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");

      let data;
      try {
        data = JSON.parse(e.dataTransfer?.getData("text/plain") ?? "{}");
      } catch { return; }

      if (data.type !== "Item" && data.type !== "ActiveEffect") {
        ui.notifications.warn("Only Items or Active Effects can be granted.");
        return;
      }

      const doc = await fromUuid(data.uuid);
      if (!doc) {
        ui.notifications.warn("Could not resolve the dropped document.");
        return;
      }

      if (data.uuid === this.item.uuid) {
        ui.notifications.warn("An item cannot grant itself.");
        return;
      }

      const fields = element.querySelector(".re-type-fields");
      fields.querySelector("[name='uuid']").value = data.uuid;
      fields.querySelector("[name='grantType']").value = data.type;
      fields.querySelector("[name='grantName']").value = doc.name;
      fields.querySelector("[name='grantImg']").value = doc.img ?? "icons/svg/item-bag.svg";

      const ruleInfo = {
        grantImg: doc.img ?? "icons/svg/item-bag.svg",
        grantName: doc.name,
        grantType: data.type
      };
      zone.classList.add("re-grant-filled");
      zone.innerHTML = `
        <img src="${ruleInfo.grantImg}" class="re-grant-img" alt="" />
        <div class="re-grant-info">
          <span class="re-grant-name">${ruleInfo.grantName}</span>
          <span class="re-grant-type-badge">${ruleInfo.grantType}</span>
        </div>
        <button type="button" class="re-grant-clear" title="Clear"><i class="fas fa-xmark"></i></button>
      `;

      this._bindGrantClear(element, previewText);
      this._updatePreview(element, previewText);
    });

    this._bindGrantClear(element, previewText);
  }

  /**
   * Bind the clear button inside a filled grant drop zone.
   */
  _bindGrantClear(element, previewText) {
    const clearBtn = element.querySelector(".re-grant-clear");
    if (!clearBtn) return;
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const fields = element.querySelector(".re-type-fields");
      fields.querySelector("[name='uuid']").value = "";
      fields.querySelector("[name='grantType']").value = "Item";
      fields.querySelector("[name='grantName']").value = "";
      fields.querySelector("[name='grantImg']").value = "";

      const zone = element.querySelector(".re-grant-drop-zone");
      zone.classList.remove("re-grant-filled");
      zone.innerHTML = `
        <i class="fas fa-plus-circle re-grant-drop-icon"></i>
        <span class="re-grant-drop-text">Drag an Item or Active Effect here</span>
      `;
      this._updatePreview(element, previewText);
    });
  }

  /**
   * Build HTML for a single custom list row.
   */
  _buildCustomListRow(ci, idx) {
    const img = ci.img || "icons/svg/item-bag.svg";
    const name = ci.name || "Unknown";
    const type = ci.type ?? "Item";
    return `<div class="re-grant-custom-row" data-idx="${idx}" style="display:flex;align-items:center;gap:8px;padding:4px 8px;border:1px solid rgba(108,92,231,0.3);border-radius:4px;background:rgba(0,0,0,0.25);">
      <img src="${img}" width="28" height="28" style="width:28px;height:28px;min-width:28px;min-height:28px;max-width:28px;max-height:28px;object-fit:cover;border-radius:3px;border:1px solid rgba(255,255,255,0.1);" alt="" />
      <span style="flex:1;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>
      <span style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:rgba(255,255,255,0.45);background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;">${type}</span>
      <button type="button" class="re-grant-custom-remove" data-idx="${idx}" title="Remove" style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;padding:2px 4px;font-size:11px;"><i class="fas fa-xmark"></i></button>
    </div>`;
  }

  /**
   * Bind drag-and-drop and remove buttons on the Custom List drop zone.
   */
  _bindCustomListDropZone(element, previewText) {
    const zone = element.querySelector(".re-grant-custom-drop");
    if (!zone) return;

    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", async (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");

      let data;
      try {
        data = JSON.parse(e.dataTransfer?.getData("text/plain") ?? "{}");
      } catch { return; }

      if (data.type !== "Item" && data.type !== "ActiveEffect") {
        ui.notifications.warn("Only Items or Active Effects can be added.");
        return;
      }

      const doc = await fromUuid(data.uuid);
      if (!doc) {
        ui.notifications.warn("Could not resolve the dropped document.");
        return;
      }

      if (data.uuid === this.item.uuid) {
        ui.notifications.warn("An item cannot grant itself.");
        return;
      }

      // Read current list
      const hiddenInput = element.querySelector(".re-type-fields [name='choiceItems']");
      const items = JSON.parse(hiddenInput?.value || "[]");

      // Reject duplicates
      if (items.some(ci => ci.uuid === data.uuid)) {
        ui.notifications.warn(`${doc.name} is already in the list.`);
        return;
      }

      // Add to list
      items.push({ uuid: data.uuid, name: doc.name, img: doc.img ?? "icons/svg/item-bag.svg", type: data.type });
      hiddenInput.value = JSON.stringify(items);

      // Append row to list
      const list = element.querySelector(".re-grant-custom-list");
      const idx = items.length - 1;
      const temp = document.createElement("div");
      temp.innerHTML = this._buildCustomListRow(items[idx], idx);
      list.appendChild(temp.firstElementChild);

      this._bindCustomListRemoveButtons(element, previewText);
      this._updatePreview(element, previewText);
    });

    this._bindCustomListRemoveButtons(element, previewText);
  }

  /**
   * Bind remove buttons on custom list rows.
   */
  _bindCustomListRemoveButtons(element, previewText) {
    element.querySelectorAll(".re-grant-custom-remove").forEach(btn => {
      // Clone to remove previous listeners
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);

      newBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const idx = Number(newBtn.dataset.idx);
        const hiddenInput = element.querySelector(".re-type-fields [name='choiceItems']");
        const items = JSON.parse(hiddenInput?.value || "[]");
        items.splice(idx, 1);
        hiddenInput.value = JSON.stringify(items);

        // Re-render list rows using shared helper
        const list = element.querySelector(".re-grant-custom-list");
        list.innerHTML = items.map((ci, i) => this._buildCustomListRow(ci, i)).join("");

        this._bindCustomListRemoveButtons(element, previewText);
        this._updatePreview(element, previewText);
      });
    });
  }

  /**
   * Bind the Choice Mode control (select or checkbox) to live-swap between field sets.
   */
  _bindChoiceModeToggle(element, fieldsContainer, previewText) {
    const choiceModeEl = element.querySelector(".re-type-fields [name='choiceMode']");
    if (!choiceModeEl) return;

    choiceModeEl.addEventListener("change", () => {
      const currentData = this._collectFormData(element);
      // Re-render only the subtype fields
      const subtypeContainer = element.querySelector(".re-grant-subtype-fields");
      if (subtypeContainer) {
        subtypeContainer.innerHTML = this._buildGrantSubtypeFields(currentData.subtype ?? "item", currentData);
      } else {
        fieldsContainer.innerHTML = this._buildTypeFields(currentData.key, currentData);
      }
      this._attachFieldListeners(element, previewText);
      this._bindGrantDropZone(element, previewText);
      this._bindCustomListDropZone(element, previewText);
      this._bindChoiceModeToggle(element, fieldsContainer, previewText);
      this._updatePreview(element, previewText);
    });
  }

  /**
   * Bind the Aura effect type dropdown to swap nested effect fields.
   */
  _bindAuraEffectTypeToggle(element, previewText) {
    const effectTypeSelect = element.querySelector(".re-aura-effect-type");
    if (!effectTypeSelect) return;

    effectTypeSelect.addEventListener("change", () => {
      const newEffectType = effectTypeSelect.value;
      const effectFieldsContainer = element.querySelector(".re-aura-effect-fields");
      if (!effectFieldsContainer) return;
      effectFieldsContainer.innerHTML = this._buildTypeFields(newEffectType, { key: newEffectType });
      this._attachFieldListeners(element, previewText);
      this._updatePreview(element, previewText);
    });
  }

  /**
   * Bind the Grant subtype dropdown to swap subtype-specific fields.
   */
  _bindGrantSubtypeToggle(element, previewText) {
    const subtypeSelect = element.querySelector(".re-grant-subtype");
    if (!subtypeSelect) return;

    subtypeSelect.addEventListener("change", () => {
      const newSubtype = subtypeSelect.value;
      const container = element.querySelector(".re-grant-subtype-fields");
      if (!container) return;
      container.innerHTML = this._buildGrantSubtypeFields(newSubtype, { subtype: newSubtype });
      this._attachFieldListeners(element, previewText);
      this._bindGrantDropZone(element, previewText);
      this._bindChoiceModeToggle(element, element.querySelector(".re-type-fields"), previewText);
      this._bindTagInputs(element, previewText);
      this._updatePreview(element, previewText);
    });
  }

  /**
   * Bind the Status action dropdown to swap action-specific fields.
   */
  _bindStatusActionToggle(element, previewText) {
    const actionSelect = element.querySelector(".re-status-action");
    if (!actionSelect) return;

    actionSelect.addEventListener("change", () => {
      const newAction = actionSelect.value;
      const container = element.querySelector(".re-status-action-fields");
      if (!container) return;
      container.innerHTML = this._buildStatusActionFields(newAction, { action: newAction });
      this._attachFieldListeners(element, previewText);
      this._updatePreview(element, previewText);
    });
  }

  /**
   * Bind the selector dropdown to show/hide damageType field when damageTaken is selected.
   */
  _bindSelectorChange(element, previewText) {
    const selectorEl = element.querySelector(".re-type-fields [name='selector']");
    if (!selectorEl) return;

    const modeEl = element.querySelector(".re-type-fields [name='mode']");

    // Helper: lock mode to flat when a growth selector is chosen
    const syncGrowthModeLock = () => {
      if (!modeEl) return;
      if (selectorEl.value.startsWith("growth.")) {
        modeEl.value = "flat";
        modeEl.disabled = true;
      } else {
        modeEl.disabled = false;
      }
    };

    // Check initial state
    syncGrowthModeLock();

    selectorEl.addEventListener("change", () => {
      // Growth selector mode lock
      syncGrowthModeLock();

      // Damage type sub-field toggle
      const existing = element.querySelector(".re-damage-type-field");
      if (selectorEl.value === "damageTaken") {
        if (!existing) {
          const config = CONFIG.MANASHARD;
          const condGroup = element.querySelector(".re-type-fields [name='condition']")?.closest(".re-form-group");
          if (condGroup) {
            const div = document.createElement("div");
            div.innerHTML = `
              <div class="re-form-group re-damage-type-field">
                <label>Damage Type <span class="re-hint">(blank = all)</span></label>
                <select name="damageType">
                  <option value="" selected>None</option>
                  ${Object.entries(config.damageTakenTypes).map(([k, l]) =>
                    `<option value="${k}">${game.i18n.localize(l)}</option>`
                  ).join("")}
                </select>
              </div>`;
            condGroup.before(div.firstElementChild);
            this._attachFieldListeners(element, previewText);
          }
        }
      } else {
        if (existing) existing.remove();
      }
    });
  }

  /**
   * Save the rule back to the item's system.rules array.
   */
  async _saveRule(ruleData) {
    const rules = foundry.utils.deepClone(this.item.system.rules ?? []);
    if (this.ruleIndex >= 0) {
      rules[this.ruleIndex] = ruleData;
    } else {
      rules.push(ruleData);
    }

    await this.item.update({ "system.rules": rules });
  }
}

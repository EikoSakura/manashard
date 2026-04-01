import { GrantChoiceDialog } from "../apps/grant-choice-dialog.mjs";

/**
 * Extended Item document for the Manashard system.
 */
export class ManashardItem extends Item {

  /** @override */
  getRollData() {
    const data = { ...super.getRollData() };
    // If this item is owned, include the actor's roll data
    if (this.actor) {
      data.actor = this.actor.getRollData();
    }
    return data;
  }

  /**
   * When an owned item is created on an actor, automatically create any
   * granted items/effects defined in the item's GrantItem rules.
   * @override
   */
  async _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if (game.user.id !== userId) return;
    if (!this.actor) return;
    if (options._grantDepth >= 3) return; // Guard against recursive grants
    if (options._lootOnly) return; // Loot-table items should not fire grants

    // Foundry V13 strips ObjectField array contents during embedded document creation.
    // It can also reset other field values to their schema defaults.
    // Recover from the creation data or from the source world/compendium item.
    const recoveryUpdates = {};

    // ── Recover rules ──
    let itemRules = this.system.rules ?? [];
    if (!itemRules.length) {
      // Try creation data first
      if (data.system?.rules?.length) {
        itemRules = data.system.rules;
      }
      // Try world items by name + type match
      if (!itemRules.length) {
        const worldMatch = game.items.find(i => i.name === this.name && i.type === this.type);
        if (worldMatch?.system?.rules?.length) {
          itemRules = worldMatch.system.rules;
        }
      }
      // Try compendium packs
      if (!itemRules.length) {
        for (const pack of game.packs) {
          if (pack.metadata.type !== "Item") continue;
          const index = await pack.getIndex();
          const entry = index.find(e => e.name === this.name && e.type === this.type);
          if (entry) {
            const doc = await pack.getDocument(entry._id);
            if (doc?.system?.rules?.length) {
              itemRules = doc.system.rules;
              break;
            }
          }
        }
      }
      if (itemRules.length) {
        recoveryUpdates["system.rules"] = itemRules;
      }
    }

    // ── Recover damageType for manacite items ──
    // Foundry V13 may reset damageType to its schema default ("none") during
    // embedded document creation. Restore from creation data or source item.
    if (this.type === "manacite") {
      const createdDT = this.system.damageType;
      const sourceDT = data.system?.damageType;
      if (sourceDT && sourceDT !== createdDT) {
        recoveryUpdates["system.damageType"] = sourceDT;
      } else if (createdDT === "none") {
        // Creation data was also stripped — try world/compendium lookup
        const sourceItem = game.items.find(i => i.name === this.name && i.type === this.type);
        const srcDT = sourceItem?.system?.damageType;
        if (srcDT && srcDT !== "none") {
          recoveryUpdates["system.damageType"] = srcDT;
        }
      }
    }

    // Persist all recovered fields in a single update
    if (Object.keys(recoveryUpdates).length) {
      await this.update(recoveryUpdates);
    }

    // Direct grant rules on this item (Grant with item/proficiency subtypes)
    const grantRules = itemRules.filter(r =>
      (r.key === "Grant" && r.subtype === "item") ||
      (r.key === "Grant" && r.subtype === "weaponProficiency" && r.choiceMode) ||
      (r.key === "Grant" && r.subtype === "armorProficiency" && r.choiceMode) ||
      // Legacy support (pre-migration rules)
      r.key === "GrantItem" ||
      (r.key === "GrantWeaponProficiency" && r.choiceMode) ||
      (r.key === "GrantArmorProficiency" && r.choiceMode)
    );
    if (grantRules.length) {
      await this.#processGrants(grantRules, options._grantDepth ?? 0, options._skipChoiceGrants);
    }


  }

  /**
   * When an owned item is updated, re-process GrantItem rules so that
   * newly added grants are created (duplicate check prevents re-granting).
   * @override
   */
  async _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (game.user.id !== userId) return;
    if (!this.actor) return;

    // Re-process direct GrantItem rules if rules changed
    if (foundry.utils.hasProperty(changed, "system.rules")) {
      const grantRules = (this.system.rules ?? []).filter(r =>
        (r.key === "Grant" && r.subtype === "item") || r.key === "GrantItem"
      );
      if (grantRules.length) {
        await this.#processGrants(grantRules, 0);
      }
    }

  }

  /**
   * When an owned item is deleted, remove any items/effects it granted.
   * @override
   */
  async _onDelete(options, userId) {
    super._onDelete(options, userId);
    if (game.user.id !== userId) return;

    // Cache actor ref — may be null after deletion
    const actor = this.actor ?? this.parent;
    if (!actor?.items) return;

    // Clean stale ID from skill loadout
    const loadout = actor.system.skillLoadout;
    if (Array.isArray(loadout) && loadout.includes(this.id)) {
      await actor.update({ "system.skillLoadout": loadout.filter(id => id !== this.id) });
    }

    // Delete granted items one at a time, re-checking existence before each
    // to avoid "does not exist" errors from cascading deletes.
    const grantedIds = actor.items
      .filter(i => i.getFlag("manashard", "grantedBy") === this.id)
      .map(i => i.id);
    for (const id of grantedIds) {
      if (!actor.items.has(id)) continue;
      try {
        await actor.deleteEmbeddedDocuments("Item", [id]);
      } catch { /* already deleted by cascade */ }
    }
  }


  /**
   * Resolve and create all granted items/effects on the owning actor.
   * Supports both fixed UUID grants and choice-mode grants (where the
   * player selects from a filtered list of candidates).
   */
  async #processGrants(grantRules, depth = 0, skipChoiceGrants = false) {
    const itemsToCreate = [];
    const effectsToCreate = [];

    // Separate fixed grants from choice grants (choice grants need sequential dialogs)
    const fixedRules = grantRules.filter(r => !r.choiceMode);
    const choiceRules = skipChoiceGrants ? [] : grantRules.filter(r => r.choiceMode);

    // --- Fixed grants (existing behavior) ---
    for (const rule of fixedRules) {
      const source = await fromUuid(rule.uuid);
      if (!source) {
        console.warn(`Manashard | Grant source not found: ${rule.uuid}`);
        continue;
      }

      // Check for existing granted item to prevent duplicates
      const existing = this.actor.items.find(i =>
        i.getFlag("manashard", "grantedBy") === this.id &&
        i.getFlag("manashard", "grantSourceUuid") === rule.uuid
      );
      if (existing) continue;

      if (rule.grantType === "ActiveEffect") {
        const effectData = source.toObject();
        delete effectData._id;
        foundry.utils.setProperty(effectData, "flags.manashard.grantedBy", this.id);
        foundry.utils.setProperty(effectData, "flags.manashard.grantSourceUuid", rule.uuid);
        effectsToCreate.push(effectData);
      } else {
        const itemData = source.toObject();
        delete itemData._id;
        foundry.utils.setProperty(itemData, "flags.manashard.grantedBy", this.id);
        foundry.utils.setProperty(itemData, "flags.manashard.grantSourceUuid", rule.uuid);
        // Granted skill manacites are automatically absorbed and equipped
        if (itemData.type === "manacite" && itemData.system?.manaciteType === "skill") {
          itemData.system.absorbed = true;
          itemData.system.equipped = true;
        }
        itemsToCreate.push(itemData);
      }
    }

    // --- Choice grants (sequential dialogs) ---
    const itemChoiceRules = choiceRules.filter(r =>
      (r.key === "Grant" && r.subtype === "item") || r.key === "GrantItem"
    );
    const wpChoiceRules = choiceRules.filter(r =>
      (r.key === "Grant" && r.subtype === "weaponProficiency") || r.key === "GrantWeaponProficiency"
    );
    const apChoiceRules = choiceRules.filter(r =>
      (r.key === "Grant" && r.subtype === "armorProficiency") || r.key === "GrantArmorProficiency"
    );

    // GrantItem choices — open item selection dialog
    for (const rule of itemChoiceRules) {
      let choiceKey, chosenUuid;

      if (rule.choiceMode === "custom" && rule.choiceItems?.length) {
        // Custom list — curated UUIDs
        const uuids = rule.choiceItems.map(ci => ci.uuid).sort().join(",");
        choiceKey = `choice:custom:${uuids}`;
        const existing = this.actor.items.find(i =>
          i.getFlag("manashard", "grantedBy") === this.id &&
          i.getFlag("manashard", "grantChoiceKey") === choiceKey
        );
        if (existing) continue;

        const names = rule.choiceItems.map(ci => ci.name);
        chosenUuid = await GrantChoiceDialog.prompt({
          title: rule.label || `Choose: ${names.slice(0, 3).join(", ")}${names.length > 3 ? "..." : ""}`,
          choiceItems: rule.choiceItems
        });
      } else {
        // Filtered — search compendiums/world items
        choiceKey = `choice:${rule.choiceItemType ?? "manacite"}:${JSON.stringify(rule.choiceFilters ?? {})}`;
        const existing = this.actor.items.find(i =>
          i.getFlag("manashard", "grantedBy") === this.id &&
          i.getFlag("manashard", "grantChoiceKey") === choiceKey
        );
        if (existing) continue;

        const filters = rule.choiceFilters ?? {};
        const filterDesc = Object.values(filters).map(v =>
          v.charAt(0).toUpperCase() + v.slice(1)
        ).join(" ");
        chosenUuid = await GrantChoiceDialog.prompt({
          title: `Choose: ${filterDesc} Skill`,
          filters,
          itemType: rule.choiceItemType ?? "manacite"
        });
      }

      if (!chosenUuid) continue;

      const source = await fromUuid(chosenUuid);
      if (!source) {
        console.warn(`Manashard | Choice grant source not found: ${chosenUuid}`);
        continue;
      }

      const itemData = source.toObject();
      delete itemData._id;
      foundry.utils.setProperty(itemData, "flags.manashard.grantedBy", this.id);
      foundry.utils.setProperty(itemData, "flags.manashard.grantSourceUuid", chosenUuid);
      foundry.utils.setProperty(itemData, "flags.manashard.grantChoiceKey", choiceKey);
      // Granted skill manacites are automatically absorbed
      if (itemData.type === "manacite" && itemData.system?.manaciteType === "skill") {
        itemData.system.absorbed = true;
      }
      itemsToCreate.push(itemData);
    }

    // GrantWeaponProficiency choices — open weapon category selection dialog
    for (const rule of wpChoiceRules) {
      if (rule.weaponCategory) continue;

      const categories = Object.entries(CONFIG.MANASHARD.weaponCategories)
        .filter(([k]) => k !== "natural")
        .map(([k, locKey]) => ({ key: k, label: game.i18n.localize(locKey) }));
      if (!categories.length) continue;

      const wpOptions = categories.map(c =>
        `<option value="${c.key}">${c.label}</option>`
      ).join("");
      const wpContent = `
        <form>
          <div class="form-group">
            <label>Choose a weapon proficiency:</label>
            <select name="category">${wpOptions}</select>
          </div>
        </form>`;

      let selectedCategory;
      try {
        selectedCategory = await foundry.applications.api.DialogV2.prompt({
          window: { title: "Choose Weapon Proficiency" },
          content: wpContent,
          ok: {
            label: "Confirm",
            icon: "fas fa-check",
            callback: (event, button, dialog) => button.form.elements.category.value
          }
        });
      } catch {
        continue; // Dialog cancelled
      }

      if (!selectedCategory) continue;

      // Re-fetch the item from the actor to ensure a valid reference
      const freshItem = this.actor.items.get(this.id);
      if (!freshItem) continue;

      const rules = foundry.utils.deepClone(freshItem.system.rules ?? []);
      const ruleIdx = rules.findIndex(r =>
        ((r.key === "Grant" && r.subtype === "weaponProficiency") || r.key === "GrantWeaponProficiency") &&
        r.choiceMode && !r.weaponCategory
      );
      if (ruleIdx >= 0) {
        rules[ruleIdx].weaponCategory = selectedCategory;
      } else {
        rules.push({ key: "Grant", subtype: "weaponProficiency", weaponCategory: selectedCategory });
      }
      await freshItem.update({ "system.rules": rules });
      ui.notifications.info(`Granted weapon proficiency: ${categories.find(c => c.key === selectedCategory)?.label ?? selectedCategory}`);
    }

    // GrantArmorProficiency choices — open armor category selection dialog
    for (const rule of apChoiceRules) {
      if (rule.armorCategory) continue;

      const armorCategories = Object.entries(CONFIG.MANASHARD.armorCategories)
        .map(([k, locKey]) => ({ key: k, label: game.i18n.localize(locKey) }));
      if (!armorCategories.length) continue;

      const apOptions = armorCategories.map(c =>
        `<option value="${c.key}">${c.label}</option>`
      ).join("");
      const apContent = `
        <form>
          <div class="form-group">
            <label>Choose an armor proficiency:</label>
            <select name="category">${apOptions}</select>
          </div>
        </form>`;

      let selectedArmorCat;
      try {
        selectedArmorCat = await foundry.applications.api.DialogV2.prompt({
          window: { title: "Choose Armor Proficiency" },
          content: apContent,
          ok: {
            label: "Confirm",
            icon: "fas fa-check",
            callback: (event, button, dialog) => button.form.elements.category.value
          }
        });
      } catch {
        continue; // Dialog cancelled
      }

      if (!selectedArmorCat) continue;

      const freshArmorItem = this.actor.items.get(this.id);
      if (!freshArmorItem) continue;

      const armorRules = foundry.utils.deepClone(freshArmorItem.system.rules ?? []);
      const armorRuleIdx = armorRules.findIndex(r =>
        ((r.key === "Grant" && r.subtype === "armorProficiency") || r.key === "GrantArmorProficiency") &&
        r.choiceMode && !r.armorCategory
      );
      if (armorRuleIdx >= 0) {
        armorRules[armorRuleIdx].armorCategory = selectedArmorCat;
      } else {
        armorRules.push({ key: "Grant", subtype: "armorProficiency", armorCategory: selectedArmorCat });
      }
      await freshArmorItem.update({ "system.rules": armorRules });
      ui.notifications.info(`Granted armor proficiency: ${armorCategories.find(c => c.key === selectedArmorCat)?.label ?? selectedArmorCat}`);
    }

    if (itemsToCreate.length) {
      await this.actor.createEmbeddedDocuments("Item", itemsToCreate, {
        _grantDepth: depth + 1
      });
    }

    if (effectsToCreate.length) {
      await this.actor.createEmbeddedDocuments("ActiveEffect", effectsToCreate, {
        _grantDepth: depth + 1
      });
    }

    if (itemsToCreate.length || effectsToCreate.length) {
      const total = itemsToCreate.length + effectsToCreate.length;
      ui.notifications.info(`${this.name} granted ${total} item(s).`);
    }
  }
}

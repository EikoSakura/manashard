/**
 * Dialog for choosing an item from a filtered list of candidates.
 * Used by GrantItem rules with choiceMode enabled.
 */
export class GrantChoiceDialog {

  /**
   * Show a choice dialog and return the selected item's UUID, or null if cancelled.
   * @param {object} options
   * @param {string} options.title       Dialog window title
   * @param {object} options.filters     Key-value filters (e.g., { category: "monster", rarity: "common" })
   * @param {string} options.itemType    Item type to search for (e.g., "manacite")
   * @param {Array}  options.choiceItems Curated list of items to choose from (bypasses filter search)
   * @returns {Promise<string|null>}     UUID of the chosen item, or null
   */
  static async prompt({ title = "Choose a Skill", filters = {}, itemType = "manacite", choiceItems } = {}) {
    let candidates;
    if (choiceItems?.length) {
      // Resolve curated items directly by UUID
      candidates = [];
      for (const ci of choiceItems) {
        const doc = await fromUuid(ci.uuid);
        if (doc) {
          candidates.push({ uuid: ci.uuid, name: doc.name, img: doc.img || ci.img || "icons/svg/item-bag.svg" });
        } else {
          console.warn(`Manashard | GrantChoice could not resolve custom list item: ${ci.uuid} (${ci.name})`);
        }
      }
    } else {
      candidates = await this.#findCandidates(itemType, filters);
    }

    if (!candidates.length) {
      ui.notifications.warn("No matching items found for this grant choice.");
      return null;
    }

    // Sort alphabetically
    candidates.sort((a, b) => a.name.localeCompare(b.name));

    // Build the list HTML
    const rows = candidates.map((c, i) => `
      <div class="grant-choice-row" data-uuid="${c.uuid}" data-index="${i}">
        <img src="${c.img}" class="grant-choice-img" width="32" height="32" alt="" />
        <span class="grant-choice-name">${c.name}</span>
        <button type="button" class="grant-choice-info" data-uuid="${c.uuid}" title="View Details">
          <i class="fas fa-circle-info"></i>
        </button>
      </div>
    `).join("");

    const content = `
      <div class="grant-choice-container">
        <p class="grant-choice-prompt">Select one of the following:</p>
        <div class="grant-choice-list">${rows}</div>
      </div>`;

    let selectedUuid = null;

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title },
      content,
      buttons: [
        {
          action: "confirm",
          label: "Confirm",
          icon: "fas fa-check",
          default: true,
          callback: () => selectedUuid
        },
        { action: "cancel", label: "Cancel" }
      ],
      render: (event, dialog) => {
        const el = dialog.element;
        const confirmBtn = el.querySelector('button[data-action="confirm"]');
        if (confirmBtn) confirmBtn.disabled = true;

        // Row selection
        el.querySelectorAll(".grant-choice-row").forEach(row => {
          row.addEventListener("click", (e) => {
            // Don't select if clicking the info button
            if (e.target.closest(".grant-choice-info")) return;
            el.querySelectorAll(".grant-choice-row").forEach(r => r.classList.remove("selected"));
            row.classList.add("selected");
            selectedUuid = row.dataset.uuid;
            if (confirmBtn) confirmBtn.disabled = false;
          });

          // Double-click to confirm immediately
          row.addEventListener("dblclick", (e) => {
            if (e.target.closest(".grant-choice-info")) return;
            selectedUuid = row.dataset.uuid;
            confirmBtn?.click();
          });
        });

        // Info button — open the item sheet
        el.querySelectorAll(".grant-choice-info").forEach(btn => {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const uuid = btn.dataset.uuid;
            try {
              const item = await fromUuid(uuid);
              item?.sheet?.render(true);
            } catch {
              ui.notifications.warn("Could not open item sheet.");
            }
          });
        });
      }
    });

    if (result === "cancel" || result === null) return null;
    return selectedUuid;
  }

  /**
   * Search compendium packs and world items for matching candidates.
   */
  static async #findCandidates(itemType, filters) {
    const candidates = [];
    const filterEntries = Object.entries(filters);
    const seen = new Set(); // Deduplicate by name

    console.log("Manashard | GrantChoice searching for:", { itemType, filters, filterEntries });

    /**
     * Check whether a single item matches all filter criteria.
     */
    function matches(item) {
      if (item.type !== itemType) {
        return false;
      }
      for (const [key, value] of filterEntries) {
        if (item.system?.[key] !== value) {
          console.log(`Manashard | GrantChoice filter mismatch on "${item.name}": system.${key} = "${item.system?.[key]}" !== "${value}"`);
          return false;
        }
      }
      return true;
    }

    // Search compendium packs (load full documents to access system fields)
    for (const pack of game.packs) {
      if (pack.metadata.type !== "Item") continue;
      const docs = await pack.getDocuments();
      console.log(`Manashard | GrantChoice pack "${pack.metadata.label}": ${docs.length} docs`);
      for (const doc of docs) {
        if (doc.type === itemType) {
          console.log(`Manashard | GrantChoice pack doc "${doc.name}": type="${doc.type}", skillType="${doc.system?.skillType}", rank="${doc.system?.rank}"`);
        }
        if (!matches(doc)) continue;
        if (seen.has(doc.name)) continue;
        seen.add(doc.name);
        candidates.push({
          uuid: doc.uuid,
          name: doc.name,
          img: doc.img || "icons/svg/item-bag.svg"
        });
      }
    }

    // Search world items
    console.log(`Manashard | GrantChoice world items: ${game.items.size} total, looking for type="${itemType}"`);
    for (const item of game.items) {
      console.log(`Manashard | GrantChoice world item "${item.name}": type="${item.type}", skillType="${item.system?.skillType}", rank="${item.system?.rank}"`);
      if (!matches(item)) continue;
      if (seen.has(item.name)) continue;
      seen.add(item.name);
      candidates.push({
        uuid: item.uuid,
        name: item.name,
        img: item.img || "icons/svg/item-bag.svg"
      });
    }

    return candidates;
  }
}

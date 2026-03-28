const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * Party Sheet — manages party roster, downtime actions, and shared party stash.
 * Styled as a guild roster / Log Horizon party menu.
 * Opened via scene controls, keybinding (P), or `game.manashard.PartySheet`.
 * Party membership and stash stored in world settings.
 */
export class PartySheet extends HandlebarsApplicationMixin(ApplicationV2) {

  static PARTS = {
    sheet: { template: "systems/manashard/templates/apps/party-sheet.hbs" }
  };

  static DEFAULT_OPTIONS = {
    id: "party-sheet",
    classes: ["manashard", "party-sheet"],
    position: { width: 760, height: 680 },
    window: {
      title: "Party",
      resizable: true,
      icon: "fas fa-users"
    },
    tag: "div",
    dragDrop: [
      { dragSelector: ".stash-item-row[draggable]", dropSelector: ".party-stash-section" }
    ],
    actions: {
      switchTab: PartySheet.#onSwitchTab,
      editPartyName: PartySheet.#onEditPartyName,
      addMember: PartySheet.#onAddMember,
      removeMember: PartySheet.#onRemoveMember,
      openSheet: PartySheet.#onOpenSheet,
      teachSkill: PartySheet.#onTeachSkill,
      clearTaughtSkills: PartySheet.#onClearTaughtSkills,
      deleteStashItem: PartySheet.#onDeleteStashItem,
      addEiress: PartySheet.#onAddEiress,
      subtractEiress: PartySheet.#onSubtractEiress
    }
  };

  /** Track the currently active tab */
  _activeTab = "roster";

  /** @override — drag-over feedback + make stash items draggable */
  _onRender(context, options) {
    super._onRender(context, options);
    const stashSection = this.element.querySelector(".party-stash-section");
    if (!stashSection) return;

    // Drop zone highlight
    stashSection.addEventListener("dragover", (e) => {
      e.preventDefault();
      stashSection.classList.add("drag-over");
    });
    stashSection.addEventListener("dragleave", (e) => {
      if (!stashSection.contains(e.relatedTarget)) {
        stashSection.classList.remove("drag-over");
      }
    });
    stashSection.addEventListener("drop", () => {
      stashSection.classList.remove("drag-over");
    });
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Party name
    context.partyName = game.settings.get("manashard", "partyName");

    // Tab state
    context.activeTab = this._activeTab;
    context.rosterTabClass = this._activeTab === "roster" ? "active" : "";
    context.stashTabClass = this._activeTab === "stash" ? "active" : "";

    const memberIds = game.settings.get("manashard", "partyMembers");
    const ranks = CONFIG.MANASHARD.ranks;

    // Resolve party members from stored IDs
    context.members = [];
    let totalLevel = 0;
    for (const id of memberIds) {
      const actor = game.actors.get(id);
      if (!actor || actor.type !== "character") continue;
      const sys = actor.system;
      const equippedJob = actor.items.find(i => i.type === "manacite" && i.system.manaciteType === "job" && i.system.equipped);
      const equippedSpecies = actor.items.find(i => i.type === "species");
      const rankKey = sys.rank ?? "f";
      const rankData = ranks?.[rankKey];
      const rankLabel = rankData ? game.i18n.localize(rankData.label) : rankKey.toUpperCase();
      const level = sys.level ?? 1;
      totalLevel += level;

      const mov = sys.mov ?? 6;
      const dmg = sys.damage ?? 0;
      const acc = sys.accuracy ?? 0;
      const peva = sys.peva ?? 0;
      const meva = sys.meva ?? 0;

      context.members.push({
        id: actor.id,
        name: actor.name,
        img: actor.img,
        portraitOffsetX: sys.portraitOffsetX ?? 50,
        portraitOffsetY: sys.portraitOffsetY ?? 0,
        portraitMirrored: sys.portraitMirrored ?? false,
        level,
        rank: rankLabel,
        rankKey,
        hp: sys.stats?.hp ?? { value: 0, max: 0 },
        mp: sys.stats?.mp ?? { value: 0, max: 0 },
        hpPct: sys.stats?.hp?.max ? Math.round((sys.stats.hp.value / sys.stats.hp.max) * 100) : 0,
        mpPct: sys.stats?.mp?.max ? Math.round((sys.stats.mp.value / sys.stats.mp.max) * 100) : 0,
        jobName: equippedJob?.name ?? "No Job",
        jobImg: equippedJob?.img ?? null,
        speciesName: equippedSpecies?.name ?? null,
        mov, dmg, acc, peva, meva,
        taughtSkill: actor.items.find(i => i.getFlag("manashard", "taughtSkill"))?.name ?? null
      });
    }

    context.memberCount = context.members.length;
    context.avgLevel = context.members.length ? Math.round(totalLevel / context.members.length) : 0;
    context.isGM = game.user.isGM;
    context.hasTaughtSkills = context.members.some(m => m.taughtSkill);

    // Party Stash
    const stashData = game.settings.get("manashard", "partyStash");
    context.stashItems = stashData.map((item, index) => ({
      index,
      name: item.name,
      img: item.img ?? "icons/svg/item-bag.svg",
      type: item.type,
      typeLabel: game.i18n.localize(`TYPES.Item.${item.type}`) || item.type,
      quantity: item.system?.quantity ?? 1,
      weight: item.system?.weight ?? 0,
      depositedBy: item.flags?.manashard?.depositedBy ?? "Unknown"
    }));
    context.stashCount = context.stashItems.length;

    // Party Eiress
    context.partyEiress = game.settings.get("manashard", "partyEiress");

    return context;
  }

  // ═══════════════════════════════════════════════════════════
  // DRAG & DROP
  // ═══════════════════════════════════════════════════════════

  /** @override — dragging a stash item out (to give to a character) */
  _onDragStart(event) {
    const row = event.currentTarget;
    const index = Number(row.dataset.stashIndex);
    const stash = game.settings.get("manashard", "partyStash");
    if (index < 0 || index >= stash.length) return;

    const itemData = stash[index];
    event.dataTransfer.setData("text/plain", JSON.stringify({
      type: "Item",
      data: itemData,
      fromPartyStash: true,
      stashIndex: index
    }));
  }

  /** @override — handle items dropped onto the stash */
  async _onDrop(event) {
    event.preventDefault();
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch { return; }

    if (data.type !== "Item") return;

    // If this is a stash item being re-dropped on the stash, ignore
    if (data.fromPartyStash) return;

    // Resolve the item from UUID (works for owned items and compendium items)
    const resolved = await fromUuid(data.uuid);
    if (!resolved) return;

    const itemData = resolved.toObject();
    const sourceActor = resolved.parent;

    // Tag who deposited it
    delete itemData._id;
    foundry.utils.setProperty(itemData, "flags.manashard.depositedBy", sourceActor?.name ?? "External");
    foundry.utils.setProperty(itemData, "flags.manashard.depositedById", sourceActor?.id ?? null);

    // Add to stash
    const stash = [...game.settings.get("manashard", "partyStash"), itemData];
    await game.settings.set("manashard", "partyStash", stash);

    // Remove from source actor if it's an owned item (not compendium)
    if (sourceActor && resolved.isEmbedded) {
      await sourceActor.deleteEmbeddedDocuments("Item", [resolved.id]);
    }

    ui.notifications.info(`${itemData.name} added to party stash.`);

    // Auto-switch to stash tab if not already there
    this._activeTab = "stash";
    this.render();
  }

  // ═══════════════════════════════════════════════════════════
  // TAB SWITCHING
  // ═══════════════════════════════════════════════════════════

  static #onSwitchTab(event, target) {
    const tabId = target.dataset.tab;
    if (!tabId || tabId === this._activeTab) return;
    this._activeTab = tabId;
    this.render();
  }

  // ═══════════════════════════════════════════════════════════
  // PARTY NAME
  // ═══════════════════════════════════════════════════════════

  static async #onEditPartyName(event, target) {
    if (!game.user.isGM) return;
    const current = game.settings.get("manashard", "partyName");
    let newName;
    try {
      newName = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Rename Party", classes: ["manashard"] },
        content: `
          <form>
            <div class="form-group">
              <label>Party Name:</label>
              <input type="text" name="partyName" value="${current}" autofocus />
            </div>
          </form>`,
        ok: {
          label: "Save",
          icon: "fas fa-check",
          callback: (event, button, dialog) => button.form.elements.partyName.value.trim()
        }
      });
    } catch { return; }
    if (!newName) return;
    await game.settings.set("manashard", "partyName", newName);
    this.render();
  }

  // ═══════════════════════════════════════════════════════════
  // PARTY MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  static async #onAddMember(event, target) {
    const currentIds = game.settings.get("manashard", "partyMembers");
    const candidates = game.actors.filter(a =>
      a.type === "character" && !currentIds.includes(a.id)
    );

    if (!candidates.length) {
      ui.notifications.info("No available characters to add.");
      return;
    }

    const options = candidates.map(a =>
      `<option value="${a.id}">${a.name}</option>`
    ).join("");

    const content = `
      <form>
        <div class="form-group">
          <label>Select Character:</label>
          <select name="actorId">${options}</select>
        </div>
      </form>`;

    let selectedId;
    try {
      selectedId = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Add Party Member", classes: ["manashard"] },
        content,
        ok: {
          label: "Add",
          icon: "fas fa-user-plus",
          callback: (event, button, dialog) => button.form.elements.actorId.value
        }
      });
    } catch { return; }

    if (!selectedId) return;
    const updated = [...currentIds, selectedId];
    await game.settings.set("manashard", "partyMembers", updated);
    this.render();
  }

  static async #onRemoveMember(event, target) {
    const actorId = target.dataset.actorId;
    if (!actorId) return;
    const currentIds = game.settings.get("manashard", "partyMembers");
    const updated = currentIds.filter(id => id !== actorId);
    await game.settings.set("manashard", "partyMembers", updated);
    this.render();
  }

  static async #onOpenSheet(event, target) {
    const actorId = target.closest("[data-actor-id]")?.dataset.actorId;
    if (!actorId) return;
    const actor = game.actors.get(actorId);
    actor?.sheet?.render(true);
  }

  // ═══════════════════════════════════════════════════════════
  // TEACHING SYSTEM
  // ═══════════════════════════════════════════════════════════

  static async #onTeachSkill(event, target) {
    const memberIds = game.settings.get("manashard", "partyMembers");
    const members = memberIds.map(id => game.actors.get(id)).filter(a => a?.type === "character");

    if (members.length < 2) {
      ui.notifications.warn("Need at least 2 party members to teach a skill.");
      return;
    }

    const teacherOptions = members.map(a =>
      `<option value="${a.id}">${a.name}</option>`
    ).join("");

    let teacherId;
    try {
      teacherId = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Teach Skill \u2014 Select Teacher", classes: ["manashard"] },
        content: `
          <form>
            <div class="form-group">
              <label>Who is teaching?</label>
              <select name="teacherId">${teacherOptions}</select>
            </div>
          </form>`,
        ok: {
          label: "Next",
          icon: "fas fa-arrow-right",
          callback: (event, button, dialog) => button.form.elements.teacherId.value
        }
      });
    } catch { return; }

    const teacher = game.actors.get(teacherId);
    if (!teacher) return;

    const teachableSkills = teacher.items.filter(i =>
      i.type === "manacite" && i.system.manaciteType === "skill" && !i.getFlag("manashard", "taughtSkill")
    );

    if (!teachableSkills.length) {
      ui.notifications.warn(`${teacher.name} has no skills to teach.`);
      return;
    }

    const skillOptions = teachableSkills.map(s => {
      const type = s.system.skillType ?? "magic";
      return `<option value="${s.id}">${s.name} (${type})</option>`;
    }).join("");

    let skillId;
    try {
      skillId = await foundry.applications.api.DialogV2.prompt({
        window: { title: `Teach Skill \u2014 ${teacher.name}'s Skills`, classes: ["manashard"] },
        content: `
          <form>
            <div class="form-group">
              <label>Which skill to teach?</label>
              <select name="skillId">${skillOptions}</select>
            </div>
          </form>`,
        ok: {
          label: "Next",
          icon: "fas fa-arrow-right",
          callback: (event, button, dialog) => button.form.elements.skillId.value
        }
      });
    } catch { return; }

    const skill = teacher.items.get(skillId);
    if (!skill) return;

    const students = members.filter(a => a.id !== teacherId);
    const studentOptions = students.map(a => {
      const hasTaught = a.items.find(i => i.getFlag("manashard", "taughtSkill"));
      const suffix = hasTaught ? ` (already learning: ${hasTaught.name})` : "";
      return `<option value="${a.id}">${a.name}${suffix}</option>`;
    }).join("");

    let studentId;
    try {
      studentId = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Teach Skill \u2014 Select Student", classes: ["manashard"] },
        content: `
          <form>
            <div class="form-group">
              <label>Who is learning?</label>
              <select name="studentId">${studentOptions}</select>
            </div>
          </form>`,
        ok: {
          label: "Teach",
          icon: "fas fa-chalkboard-teacher",
          callback: (event, button, dialog) => button.form.elements.studentId.value
        }
      });
    } catch { return; }

    const student = game.actors.get(studentId);
    if (!student) return;

    const existingTaught = student.items.filter(i => i.getFlag("manashard", "taughtSkill"));
    if (existingTaught.length >= 1) {
      ui.notifications.warn(`${student.name} already has a taught skill (${existingTaught[0].name}). Remove it first.`);
      return;
    }

    const skillData = skill.toObject();
    delete skillData._id;
    foundry.utils.setProperty(skillData, "flags.manashard.taughtSkill", true);
    foundry.utils.setProperty(skillData, "flags.manashard.taughtBy", teacher.id);
    foundry.utils.setProperty(skillData, "flags.manashard.taughtByName", teacher.name);
    await student.createEmbeddedDocuments("Item", [skillData]);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: teacher }),
      content: `<div class="manashard teaching-chat">
        <div class="acc-header">
          <div class="acc-portrait-frame">
            <div class="acc-portrait-diamond">
              <img src="${teacher.img}" class="acc-portrait" />
            </div>
          </div>
          <div class="acc-header-text">
            <span class="acc-actor-name">${teacher.name}</span>
            <span class="acc-action">teaches a skill</span>
          </div>
          <span class="acc-target-badge" style="background: var(--manashard-accent, #7c5cbf);"><i class="fas fa-chalkboard-teacher"></i></span>
        </div>
        <div class="teaching-body">
          <span class="teaching-skill-name"><i class="fas fa-gem"></i> ${skill.name}</span>
          <span class="teaching-arrow"><i class="fas fa-arrow-right"></i></span>
          <span class="teaching-student"><img src="${student.img}" width="24" height="24" /> ${student.name}</span>
        </div>
      </div>`
    });

    ui.notifications.info(`${teacher.name} taught ${skill.name} to ${student.name}!`);
    this.render();
  }

  static async #onClearTaughtSkills(event, target) {
    const memberIds = game.settings.get("manashard", "partyMembers");
    let cleared = 0;

    for (const id of memberIds) {
      const actor = game.actors.get(id);
      if (!actor) continue;
      const taughtItems = actor.items.filter(i => i.getFlag("manashard", "taughtSkill"));
      if (taughtItems.length) {
        await actor.deleteEmbeddedDocuments("Item", taughtItems.map(i => i.id));
        cleared += taughtItems.length;
      }
    }

    if (cleared > 0) {
      ui.notifications.info(`Cleared ${cleared} taught skill(s) from the party.`);
    } else {
      ui.notifications.info("No taught skills to clear.");
    }
    this.render();
  }

  // ═══════════════════════════════════════════════════════════
  // PARTY STASH — GM delete only (items managed via drag & drop)
  // ═══════════════════════════════════════════════════════════

  static async #onDeleteStashItem(event, target) {
    if (!game.user.isGM) return;
    const index = Number(target.dataset.stashIndex);
    const stash = game.settings.get("manashard", "partyStash");
    if (index < 0 || index >= stash.length) return;

    const itemName = stash[index].name;
    const updated = [...stash];
    updated.splice(index, 1);
    await game.settings.set("manashard", "partyStash", updated);

    ui.notifications.info(`Removed ${itemName} from the party stash.`);
    this.render();
  }

  // ═══════════════════════════════════════════════════════════
  // PARTY EIRESS — + and - open dialogs for amount input
  // ═══════════════════════════════════════════════════════════

  static async #onAddEiress(event, target) {
    let amount;
    try {
      amount = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Add Eiress", classes: ["manashard"] },
        content: `
          <form>
            <div class="form-group">
              <label>Amount to add:</label>
              <input type="number" name="amount" value="0" min="0" step="1" autofocus />
            </div>
          </form>`,
        ok: {
          label: "Add",
          icon: "fas fa-plus",
          callback: (event, button, dialog) => Number(button.form.elements.amount.value)
        }
      });
    } catch { return; }
    if (!amount || amount <= 0) return;
    const current = game.settings.get("manashard", "partyEiress");
    await game.settings.set("manashard", "partyEiress", current + amount);
    this.render();
  }

  static async #onSubtractEiress(event, target) {
    const current = game.settings.get("manashard", "partyEiress");
    let amount;
    try {
      amount = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Subtract Eiress", classes: ["manashard"] },
        content: `
          <form>
            <div class="form-group">
              <label>Amount to subtract:</label>
              <input type="number" name="amount" value="0" min="0" max="${current}" step="1" autofocus />
            </div>
          </form>`,
        ok: {
          label: "Subtract",
          icon: "fas fa-minus",
          callback: (event, button, dialog) => Number(button.form.elements.amount.value)
        }
      });
    } catch { return; }
    if (!amount || amount <= 0) return;
    await game.settings.set("manashard", "partyEiress", Math.max(0, current - amount));
    this.render();
  }
}

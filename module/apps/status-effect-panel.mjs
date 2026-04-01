/**
 * Status Effect Panel
 *
 * Displays a vertical stack of buff and debuff icons on the right side of the
 * screen (next to the sidebar) for the currently selected/hovered token.
 *
 * - Buffs: ActiveEffects with flags.manashard.buffDebuff = true (green border)
 * - Debuffs: system.statusEffects entries (red border)
 *
 * Each icon shows artwork, duration counter, and tooltip with details.
 * Right-click (token owner) removes the effect.
 */
export class StatusEffectPanel {
  /** @type {HTMLElement|null} */
  #element = null;

  /** @type {Token|null} */
  #token = null;

  /** @type {string} */
  #templatePath = "systems/manashard/templates/apps/status-effect-panel.hbs";

  /** @type {number} Render generation counter. */
  #renderGen = 0;

  /**
   * Show the status panel for a token.
   * @param {Token} token
   */
  show(token) {
    if (!token?.actor) {
      this.hide();
      return;
    }
    this.#token = token;
    this.#render();
  }

  /** Hide the panel and clear the tracked token. */
  hide() {
    this.#token = null;
    this.#hideElement();
  }

  /** Hide just the DOM element (keep token tracked for future refreshes). */
  #hideElement() {
    this.#renderGen++;
    if (this.#element) {
      this.#element.remove();
      this.#element = null;
    }
  }

  /** Refresh if the given actor matches the tracked token. */
  refresh(actor) {
    if (!this.#token) return;
    if (this.#token.actor?.id === actor?.id) {
      this.#render();
    }
  }

  /** Refresh if the given token doc matches. */
  refreshToken(tokenDoc) {
    if (!this.#token) return;
    if (this.#token.document?.id === tokenDoc?.id) {
      this.#render();
    }
  }

  /** @returns {Token|null} */
  get token() {
    return this.#token;
  }

  // ─── Private ────────────────────────────────────────────

  async #render() {
    const data = this.#prepareData();
    if (!data || (!data.hasBuffs && !data.hasDebuffs)) {
      // No effects to show — hide element but keep token tracked
      this.#hideElement();
      return;
    }

    const gen = ++this.#renderGen;
    const html = await foundry.applications.handlebars.renderTemplate(this.#templatePath, data);
    if (this.#renderGen !== gen) return;

    if (!this.#element) {
      this.#element = document.createElement("div");
      this.#element.id = "manashard-status-panel";
      document.body.appendChild(this.#element);
    }

    this.#element.innerHTML = html;
    this.#updatePosition();
    this.#bindContextMenu();
  }

  /** Update the panel's right offset based on the sidebar width. */
  #updatePosition() {
    if (!this.#element) return;
    const sidebar = document.getElementById("sidebar");
    if (sidebar) {
      const sidebarWidth = sidebar.offsetWidth;
      this.#element.style.right = `${sidebarWidth + 8}px`;
    }
  }

  /** Bind right-click context menu on icons for GM removal. */
  #bindContextMenu() {
    if (!this.#element) return;
    this.#element.querySelectorAll(".sep-icon").forEach(icon => {
      icon.addEventListener("contextmenu", async (e) => {
        e.preventDefault();
        const actor = this.#token?.actor;
        if (!actor) return;
        if (!actor.isOwner) return;

        const effectId = icon.dataset.effectId;
        const statusKey = icon.dataset.statusKey;

        if (effectId) {
          // Remove buff/debuff ActiveEffect
          await actor.deleteEmbeddedDocuments("ActiveEffect", [effectId]);
        } else if (statusKey) {
          // Remove status effect (debuff)
          await actor.removeStatus(statusKey);
        }
      });
    });
  }

  #prepareData() {
    const actor = this.#token?.actor;
    if (!actor) return null;

    const buffs = this.#collectBuffs(actor);
    const debuffs = this.#collectDebuffs(actor);

    if (!buffs.length && !debuffs.length) return null;

    return {
      buffs,
      debuffs,
      hasBuffs: buffs.length > 0,
      hasDebuffs: debuffs.length > 0
    };
  }

  /**
   * Collect buff/debuff ActiveEffects and aura AEs.
   * Shows the source skill's name, icon, and description.
   */
  #collectBuffs(actor) {
    const buffs = [];
    for (const effect of actor.effects) {
      if (effect.disabled) continue;
      // Only show buff/debuff AEs created by skills with buffDuration
      if (!effect.getFlag("manashard", "buffDebuff")) continue;

      const name = effect.name;
      const img = effect.img ?? "icons/svg/aura.svg";
      const duration = effect.getFlag("manashard", "duration");
      const hasDuration = duration !== undefined && duration !== null;
      const rules = effect.getFlag("manashard", "rules") ?? [];
      const description = effect.getFlag("manashard", "description") ?? "";

      // Build modifier summary
      const modLines = rules
        .filter(r => r.key === "Modifier")
        .map(r => {
          const sign = r.value >= 0 ? "+" : "";
          const suffix = r.mode === "percent" ? "%" : "";
          const label = r.selector?.toUpperCase() ?? "";
          return `${sign}${r.value}${suffix} ${label}`;
        });
      const modSummary = modLines.length ? modLines.join(", ") : "";

      // Build tooltip: skill name, duration, description, then modifier effects
      const durationText = hasDuration ? `${duration} turn${duration !== 1 ? "s" : ""} remaining` : "";
      // Strip HTML tags from description for clean tooltip
      const cleanDesc = description.replace(/<[^>]*>/g, "").trim();

      let tooltipParts = [`<strong>${name}</strong>`];
      if (durationText) tooltipParts.push(durationText);
      if (cleanDesc) tooltipParts.push(cleanDesc);
      if (modSummary) tooltipParts.push(`<em>${modSummary}</em>`);
      const tooltipHtml = tooltipParts.join("<br>");

      buffs.push({
        effectId: effect.id,
        name,
        img,
        turns: hasDuration ? duration : null,
        showInfinity: !hasDuration,
        tooltipHtml
      });
    }
    return buffs;
  }

  /**
   * Collect debuff status effects (from system.statusEffects).
   */
  #collectDebuffs(actor) {
    const activeStatuses = [...(actor.system.statusEffects ?? [])];
    if (!activeStatuses.length) return [];

    const durations = actor.getFlag("manashard", "statusDurations") ?? {};
    const iconPaths = CONFIG.MANASHARD?.statusIconPaths ?? {};
    const statusConfig = CONFIG.MANASHARD?.statusEffects ?? {};

    const debuffs = [];
    for (const key of activeStatuses) {
      const cfg = statusConfig[key];
      if (!cfg) continue;

      const name = game.i18n.localize(cfg.label);
      const description = cfg.description ? game.i18n.localize(cfg.description) : "";
      const img = iconPaths[key] ?? "icons/svg/aura.svg";
      const turns = durations[key];
      const hasDuration = turns !== undefined && turns !== null;

      const durationText = hasDuration ? ` &mdash; ${turns} turn${turns !== 1 ? "s" : ""} remaining` : " &mdash; Permanent";
      const tooltipHtml = `<strong>${name}</strong>${durationText}<br>${description}`;

      debuffs.push({
        key,
        name,
        description,
        img,
        turns: hasDuration ? turns : null,
        showInfinity: !hasDuration,
        tooltipHtml
      });
    }
    return debuffs;
  }
}

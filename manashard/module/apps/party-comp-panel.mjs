/**
 * Floating Party Composition Panel — MMO raid-frame style.
 * Shows all friendly combatants' HP, MP, and status effects.
 * Singleton — one panel, auto-shows during combat, draggable.
 */
export class PartyCompositionPanel {
  /** @type {HTMLElement|null} */
  #element = null;

  /** @type {boolean} */
  #visible = false;

  /** @type {boolean} */
  #collapsed = false;

  /** @type {number} Render generation counter to discard stale async renders. */
  #renderGen = 0;

  /** @type {{x: number, y: number}|null} Saved position for dragging. */
  #position = null;

  /** @type {string} */
  #templatePath = "systems/manashard/templates/apps/party-comp-panel.hbs";

  constructor() {
    // Load saved position from client settings
    try {
      const saved = game.settings.get("manashard", "partyCompPosition");
      if (saved) this.#position = saved;
    } catch {
      // Setting not registered yet, will use default
    }
  }

  /** Show the panel. */
  show() {
    this.#visible = true;
    this.#render();
  }

  /** Hide and remove the panel. */
  hide() {
    this.#visible = false;
    this.#renderGen++;
    if (this.#element) {
      this.#element.remove();
      this.#element = null;
    }
  }

  /** Toggle visibility. */
  toggle() {
    if (this.#visible) this.hide();
    else this.show();
  }

  /** @returns {boolean} Whether the panel is currently visible. */
  get visible() {
    return this.#visible;
  }

  /** Refresh the panel data (e.g., after HP changes). */
  refresh() {
    if (!this.#visible) return;
    this.#render();
  }

  // ─── Private ────────────────────────────────────────────

  async #render() {
    const data = this.#prepareData() ?? { members: [], round: 0, collapsed: this.#collapsed, empty: true };

    const gen = ++this.#renderGen;
    const html = await foundry.applications.handlebars.renderTemplate(this.#templatePath, data);

    if (this.#renderGen !== gen) return;

    if (!this.#element) {
      this.#element = document.createElement("div");
      this.#element.id = "manashard-party-comp";
      this.#element.classList.add("party-comp-panel");
      document.body.appendChild(this.#element);
      this.#setupDragging();
    }

    this.#element.innerHTML = html;
    this.#applyPosition();
    this.#bindEvents();
  }

  #prepareData() {
    const combat = game.combat;
    if (!combat?.started) return null;

    const currentId = combat.combatant?.id;
    const statusIcons = CONFIG.MANASHARD?.statusIcons ?? {};
    const statusEffectLabels = CONFIG.MANASHARD?.statusEffects ?? {};

    // Get friendly combatants (disposition >= 1 = friendly)
    const members = Array.from(combat.combatants)
      .filter(c => {
        const disp = c.token?.disposition ?? 0;
        return disp >= 1;
      })
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
      .map(c => {
        const actor = c.actor;
        const hp = actor?.system?.stats?.hp ?? { value: 0, max: 0 };
        const mp = actor?.system?.stats?.mp ?? { value: 0, max: 0 };
        const hpPercent = hp.max > 0 ? Math.round(hp.value / hp.max * 100) : 100;
        const mpPercent = mp.max > 0 ? Math.round(mp.value / mp.max * 100) : 100;

        // Gather status effects
        const statuses = [];
        const actorStatuses = actor?.system?.statusEffects;
        if (actorStatuses) {
          for (const key of actorStatuses) {
            const icon = statusIcons[key] ?? "fas fa-question";
            const label = statusEffectLabels[key] ?? key;
            statuses.push({ key, icon, label: typeof label === "string" ? label : key });
          }
        }

        // Check if charging
        const charging = c.getFlag("manashard", "charging");

        const hpBarrier = hp.barrier ?? 0;
        const clampedHpPct = Math.min(100, Math.max(0, hpPercent));
        return {
          id: c.id,
          name: c.name,
          img: c.token?.texture?.src ?? actor?.img ?? "icons/svg/mystery-man.svg",
          hpValue: hp.value,
          hpMax: hp.max,
          hpPercent: clampedHpPct,
          hpBarrier: hpBarrier,
          hpBarrierPercent: (hpBarrier > 0 && hp.max > 0) ? Math.min(clampedHpPct, Math.round(hpBarrier / hp.max * 100)) : 0,
          hpBarrierRight: 100 - clampedHpPct,
          mpValue: mp.value,
          mpMax: mp.max,
          mpPercent: Math.min(100, Math.max(0, mpPercent)),
          hpCritical: hpPercent <= 25,
          isActive: c.id === currentId,
          isDefeated: c.isDefeated,
          statuses,
          hasStatuses: statuses.length > 0,
          isCharging: !!charging,
          chargingSkillName: charging?.skillName ?? ""
        };
      });

    if (members.length === 0) return null;

    return {
      members,
      round: combat.round ?? 0,
      collapsed: this.#collapsed
    };
  }

  #bindEvents() {
    if (!this.#element) return;

    // Toggle collapse
    const collapseBtn = this.#element.querySelector("[data-action='pcp-collapse']");
    collapseBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.#collapsed = !this.#collapsed;
      this.#render();
    });

    // Close button
    const closeBtn = this.#element.querySelector("[data-action='pcp-close']");
    closeBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hide();
    });

    // Click member to pan to token
    this.#element.querySelectorAll(".pcp-member").forEach(el => {
      el.addEventListener("click", () => {
        const combatantId = el.dataset.combatantId;
        if (!combatantId) return;
        const combat = game.combat;
        const combatant = combat?.combatants?.get(combatantId);
        const token = combatant?.token?.object;
        if (token) {
          canvas.animatePan({ x: token.center.x, y: token.center.y });
        }
      });
    });
  }

  #applyPosition() {
    if (!this.#element) return;
    if (this.#position) {
      this.#element.style.left = `${this.#position.x}px`;
      this.#element.style.top = `${this.#position.y}px`;
      this.#element.style.right = "auto";
    } else {
      // Default position: top-right area
      this.#element.style.right = "320px";
      this.#element.style.top = "80px";
      this.#element.style.left = "auto";
    }
  }

  #setupDragging() {
    if (!this.#element) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let origX = 0, origY = 0;

    this.#element.addEventListener("mousedown", (e) => {
      // Only drag from the header
      if (!e.target.closest(".pcp-header")) return;
      if (e.target.closest("[data-action]")) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.#element.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      this.#element.style.left = `${origX + dx}px`;
      this.#element.style.top = `${origY + dy}px`;
      this.#element.style.right = "auto";
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      // Save position
      const rect = this.#element.getBoundingClientRect();
      this.#position = { x: Math.round(rect.left), y: Math.round(rect.top) };
      try {
        game.settings.set("manashard", "partyCompPosition", this.#position);
      } catch {
        // Setting may not exist
      }
    });
  }
}

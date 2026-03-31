import { renderIconHtml } from "../helpers/config.mjs";

/**
 * Floating Party HUD — Granblue Fantasy-style persistent party tracker.
 * Two modes: Full (portrait + name + level + job + HP/MP + statuses)
 *            Compact (small portrait + HP/MP bars + status dots)
 * Singleton — draggable, minimizable, always-available floating overlay.
 */
export class PartyHUD {
  /** @type {HTMLElement|null} */
  #element = null;

  /** @type {boolean} */
  #visible = false;

  /** @type {boolean} */
  #minimized = false;

  /** @type {"full"|"compact"} */
  #mode = "full";

  /** @type {number} Render generation counter to discard stale async renders. */
  #renderGen = 0;

  /** @type {{x: number, y: number}|null} */
  #position = null;

  /** @type {string} */
  #templatePath = "systems/manashard/templates/apps/party-hud.hbs";

  constructor() {
    try {
      const saved = game.settings.get("manashard", "partyHudState");
      if (saved) {
        if (saved.position) this.#position = saved.position;
        if (saved.mode) this.#mode = saved.mode;
        if (saved.minimized) this.#minimized = saved.minimized;
      }
    } catch {
      // Setting not registered yet
    }
  }

  show() {
    this.#visible = true;
    this.#render();
  }

  hide() {
    this.#visible = false;
    this.#renderGen++;
    if (this.#element) {
      this.#element.remove();
      this.#element = null;
    }
  }

  toggle() {
    if (this.#visible) this.hide();
    else this.show();
  }

  get visible() { return this.#visible; }

  refresh() {
    if (!this.#visible) return;
    this.#render();
  }

  setMode(mode) {
    if (mode !== "full" && mode !== "compact") return;
    this.#mode = mode;
    this.#saveState();
    this.refresh();
  }

  // ─── Private ────────────────────────────────────────────

  async #render() {
    const data = this.#prepareData();
    const gen = ++this.#renderGen;
    const html = await foundry.applications.handlebars.renderTemplate(this.#templatePath, data);
    if (this.#renderGen !== gen) return;

    if (!this.#element) {
      this.#element = document.createElement("div");
      this.#element.id = "manashard-party-hud";
      this.#element.classList.add("party-hud");
      document.body.appendChild(this.#element);
      this.#setupDragging();
    }

    this.#element.innerHTML = html;
    this.#applyPosition();
    this.#bindEvents();
  }

  #prepareData() {
    const combat = game.combat;
    const inCombat = !!combat?.started;
    const statusIcons = CONFIG.MANASHARD?.statusIcons ?? {};
    const statusEffectLabels = CONFIG.MANASHARD?.statusEffects ?? {};

    let members;

    if (inCombat) {
      const currentId = combat.combatant?.id;
      members = Array.from(combat.combatants)
        .filter(c => (c.token?.disposition ?? 0) >= 1)
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
        .map(c => this.#buildMember(c.actor, {
          id: c.id,
          name: c.name,
          img: c.token?.texture?.src,
          isActive: c.id === currentId,
          isDefeated: c.isDefeated,
          charging: c.getFlag("manashard", "charging"),
          statusIcons,
          statusEffectLabels
        }));
    } else {
      const memberIds = game.settings.get("manashard", "partyMembers") ?? [];
      members = memberIds
        .map(id => game.actors.get(id))
        .filter(a => a)
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
        .map(a => this.#buildMember(a, {
          id: a.id,
          name: a.name,
          img: null,
          isActive: false,
          isDefeated: false,
          charging: null,
          statusIcons,
          statusEffectLabels
        }));
    }

    return {
      members,
      round: combat?.round ?? 0,
      minimized: this.#minimized,
      mode: this.#mode,
      isFull: this.#mode === "full",
      isCompact: this.#mode === "compact",
      empty: members.length === 0,
      inCombat
    };
  }

  #buildMember(actor, { id, name, img, isActive, isDefeated, charging, statusIcons, statusEffectLabels }) {
    const hp = actor?.system?.stats?.hp ?? { value: 0, max: 0 };
    const mp = actor?.system?.stats?.mp ?? { value: 0, max: 0 };
    const level = actor?.system?.level ?? 1;
    const hpPercent = hp.max > 0 ? Math.round(hp.value / hp.max * 100) : 100;
    const mpPercent = mp.max > 0 ? Math.round(mp.value / mp.max * 100) : 100;

    // Get equipped job name
    const equippedJob = actor?.items?.find(i => i.type === "manacite" && i.system?.manaciteType === "job" && i.system?.equipped);
    const jobName = equippedJob?.name ?? "";

    // Status effects
    const statuses = [];
    const actorStatuses = actor?.system?.statusEffects;
    if (actorStatuses) {
      for (const key of actorStatuses) {
        const icon = statusIcons[key] ?? "fas fa-question";
        const label = statusEffectLabels[key] ?? key;
        const iconHtml = renderIconHtml(icon, "phud-status-icon", typeof label === "string" ? label : key);
        statuses.push({ key, iconHtml, label: typeof label === "string" ? label : key });
      }
    }

    const clampedHpPct = Math.min(100, Math.max(0, hpPercent));
    const clampedMpPct = Math.min(100, Math.max(0, mpPercent));

    // Barrier HP
    const hpBarrier = hp.barrier ?? 0;

    return {
      id,
      name,
      img: img ?? actor?.img ?? "icons/svg/mystery-man.svg",
      level,
      jobName,
      hpValue: hp.value,
      hpMax: hp.max,
      hpPercent: clampedHpPct,
      hpBarrier,
      hpBarrierPercent: (hpBarrier > 0 && hp.max > 0) ? Math.min(clampedHpPct, Math.round(hpBarrier / hp.max * 100)) : 0,
      hpBarrierRight: 100 - clampedHpPct,
      mpValue: mp.value,
      mpMax: mp.max,
      mpPercent: clampedMpPct,
      hpCritical: hpPercent <= 25,
      isActive,
      isDefeated,
      statuses,
      hasStatuses: statuses.length > 0,
      isCharging: !!charging,
      chargingSkillName: charging?.skillName ?? ""
    };
  }

  #bindEvents() {
    if (!this.#element) return;

    // Minimize toggle
    this.#element.querySelector("[data-action='phud-minimize']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.#minimized = !this.#minimized;
      this.#saveState();
      this.refresh();
    });

    // Close
    this.#element.querySelector("[data-action='phud-close']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hide();
    });

    // Mode toggle
    this.#element.querySelector("[data-action='phud-mode']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setMode(this.#mode === "full" ? "compact" : "full");
    });

    // Click member to select token
    this.#element.querySelectorAll("[data-member-id]").forEach(el => {
      el.addEventListener("click", () => {
        const actorId = el.dataset.memberId;
        const token = canvas.tokens?.placeables?.find(t => {
          return t.actor?.id === actorId || t.document?.actorId === actorId;
        });
        if (token) {
          token.control({ releaseOthers: true });
          canvas.animatePan({ x: token.center.x, y: token.center.y });
        }
      });
    });
  }

  #setupDragging() {
    if (!this.#element) return;
    let dragging = false;
    let startX, startY, origX, origY;

    const header = () => this.#element?.querySelector(".phud-header");

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.#element.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      this.#element.style.left = `${origX + dx}px`;
      this.#element.style.top = `${origY + dy}px`;
      this.#element.style.right = "auto";
      this.#element.style.bottom = "auto";
    };

    const onMouseUp = () => {
      if (!dragging) return;
      dragging = false;
      const rect = this.#element.getBoundingClientRect();
      this.#position = { x: rect.left, y: rect.top };
      this.#saveState();
    };

    this.#element.addEventListener("mousedown", (e) => {
      if (e.target.closest(".phud-header")) onMouseDown(e);
    });
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  #applyPosition() {
    if (!this.#element) return;
    if (this.#position) {
      this.#element.style.left = `${this.#position.x}px`;
      this.#element.style.top = `${this.#position.y}px`;
      this.#element.style.right = "auto";
    } else {
      this.#element.style.right = "320px";
      this.#element.style.top = "60px";
    }
  }

  #saveState() {
    try {
      game.settings.set("manashard", "partyHudState", {
        position: this.#position,
        mode: this.#mode,
        minimized: this.#minimized
      });
    } catch {
      // Setting not available
    }
  }
}

/**
 * Custom Side-Based Turn Tracker for the Manashard system.
 * Extends the V13 CombatTracker (ApplicationV2-based sidebar tab).
 *
 * Displays side-based turn order (players vs enemies), hero card,
 * acted/pending status, and combat objectives.
 */
export class CTBTracker extends foundry.applications.sidebar.tabs.CombatTracker {

  /**
   * Track which sections are collapsed (persists across re-renders).
   * @type {Set<string>}
   */
  _collapsedSections = new Set();

  /**
   * Override PARTS to replace only the tracker template with our custom one.
   * @override
   */
  static PARTS = {
    header: {
      template: "systems/manashard/templates/combat/ctb-empty.hbs"
    },
    tracker: {
      template: "systems/manashard/templates/combat/ctb-tracker.hbs",
      scrollable: [".ctb-combatant-list"]
    },
    footer: {
      template: "systems/manashard/templates/combat/ctb-empty.hbs"
    }
  };

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["manashard-ctb-tracker"],
    actions: {
      beginCombat: CTBTracker.#onBeginCombat,
      endCombat: CTBTracker.#onEndCombat,
      createCombat: CTBTracker.#onCreateCombat,
      removeCombatant: CTBTracker.#onRemoveCombatant,
      completeObjective: CTBTracker.#onCompleteObjective,
      toggleSection: CTBTracker.#onToggleSection,
      toggleAmbush: CTBTracker.#onToggleAmbush,
      endTurn: CTBTracker.#onEndTurn,
      selectCombatant: CTBTracker.#onSelectCombatant,
      raiseHand: CTBTracker.#onRaiseHand
    }
  };

  /**
   * Override part context preparation to inject our custom tracker data.
   * @override
   */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId === "tracker") {
      await this._prepareTrackerContext(context, options);
    }
    return context;
  }

  /**
   * Prepare custom side-based tracker context data.
   */
  async _prepareTrackerContext(context, options) {
    const combat = this.viewed;

    context.hasCombat = !!combat;
    context.combatStarted = combat?.started ?? false;
    context.round = combat?.round ?? 0;
    context.canAct = false;
    context.isGM = game.user.isGM;

    // Collapsible section state
    context.playersCollapsed = this._collapsedSections.has("players");
    context.enemiesCollapsed = this._collapsedSections.has("enemies");

    if (combat?.started) {
      // Get turn info
      const turnInfo = combat.getTurnInfo?.() ?? {};
      context.currentSide = turnInfo.currentSide ?? "players";
      context.turnLabel = turnInfo.currentSide === "players" ? "Player Turn" : "Enemy Turn";
      context.playerRemaining = turnInfo.playerRemaining ?? 0;
      context.enemyRemaining = turnInfo.enemyRemaining ?? 0;
      context.awaitingSelection = turnInfo.awaitingSelection ?? false;

      // Get side groups
      const groups = combat.getSideGroups?.() ?? { players: [], enemies: [] };
      context.players = groups.players;
      context.enemies = groups.enemies;

      // Selection mode: determine if user can select
      if (context.awaitingSelection) {
        // GM can always select; players can select on player turn if they own a selectable combatant
        const activeSideEntries = context.currentSide === "players" ? groups.players : groups.enemies;
        const canSelect = game.user.isGM || activeSideEntries.some(e => {
          if (!e.isSelectable) return false;
          const c = combat.combatants.get(e.id);
          return c?.isOwner;
        });
        context.canSelect = canSelect;
      }

      // Active combatant (only when not awaiting selection)
      const currentCombatant = !context.awaitingSelection ? combat.combatant : null;
      if (currentCombatant) {
        context.canAct = game.user.isGM || currentCombatant.isOwner;
        context.canEndTurn = game.user.isGM || currentCombatant.isOwner;
        context.currentCombatantName = currentCombatant.name;

        // Hero card data for active combatant
        const hp = currentCombatant.actor?.system?.stats?.hp;
        const mp = currentCombatant.actor?.system?.stats?.mp;
        const hpBarrier = hp?.barrier ?? 0;
        const hpPct = (hp?.max > 0) ? Math.round(hp.value / hp.max * 100) : 100;
        // HP bar color: green→yellow→red gradient based on percentage
        const hpFrac = hpPct / 100;
        const hpR = hpFrac > 0.5 ? Math.round((1 - hpFrac) * 2 * 255) : 255;
        const hpG = hpFrac > 0.5 ? 255 : Math.round(hpFrac * 2 * 255);
        const hpRD = Math.round(hpR * 0.75);
        const hpGD = Math.round(hpG * 0.75);
        context.heroCard = {
          name: currentCombatant.name,
          img: currentCombatant.token?.texture?.src ?? currentCombatant.actor?.img ?? "icons/svg/mystery-man.svg",
          hpValue: hp?.value ?? 0,
          hpMax: hp?.max ?? 0,
          hpPercent: hpPct,
          hpColor: `linear-gradient(90deg, rgb(${hpRD},${hpGD},0), rgb(${hpR},${hpG},0))`,
          hpBarrier: hpBarrier,
          hpBarrierPercent: (hpBarrier > 0 && hp?.max > 0) ? Math.min(hpPct, Math.round(hpBarrier / hp.max * 100)) : 0,
          hpBarrierRight: 100 - hpPct,
          mpValue: mp?.value ?? 0,
          mpMax: mp?.max ?? 0,
          mpPercent: (mp?.max > 0) ? Math.round(mp.value / mp.max * 100) : 100,
          mov: currentCombatant.actor?.system?.mov ?? 0,
          role: currentCombatant.actor?.system?.role ?? null,
          actionsPerTurn: currentCombatant.actor?.system?.actionsPerTurn ?? 1,
          actionsRemaining: (() => {
            const at = combat.getFlag("manashard", "actionsTaken") ?? {};
            const max = currentCombatant.actor?.system?.actionsPerTurn ?? 1;
            return Math.max(0, max - (at[currentCombatant.id] ?? 0));
          })()
        };

        // Check if current combatant is charging
        const charging = currentCombatant.getFlag("manashard", "charging");
        context.isCharging = !!charging;
        context.chargingSkillName = charging?.skillName ?? "";
      }

      // Objective progress (during combat)
      context.objective = combat.getObjectiveProgress?.() ?? null;
      const obj = combat.getObjective?.() ?? { type: "rout" };
      context.objectiveType = obj.type;
      context.objectiveIcon = CONFIG.MANASHARD?.objectiveIcons?.[obj.type] ?? "fas fa-skull-crossbones";

    } else if (combat) {
      // Pre-combat: show combatant list with MOV values
      context.combatants = Array.from(combat.combatants).map(c => ({
        id: c.id,
        name: c.name,
        img: c.token?.texture?.src ?? c.actor?.img ?? "icons/svg/mystery-man.svg",
        mov: c.actor?.system?.mov ?? 0,
        disposition: (c.token?.disposition ?? 0) >= 1 ? "friendly" : "hostile"
      }));

      // Ambush flag
      context.ambush = combat.getFlag("manashard", "ambush") ?? false;

      // Objective configuration (pre-combat)
      const rawObjectiveTypes = CONFIG.MANASHARD?.objectiveTypes ?? {};
      context.objectiveTypes = Object.fromEntries(
        Object.entries(rawObjectiveTypes).map(([k, v]) => [k, game.i18n.localize(v)])
      );
      context.objectiveIcons = CONFIG.MANASHARD?.objectiveIcons ?? {};
      const currentObj = combat.getObjective?.() ?? { type: "rout", turnCount: 5, bossCombatantId: null, escortCombatantId: null };
      context.currentObjective = currentObj;

      // Computed flags for which parameter fields to show
      const turnsTypes = ["survive", "defendPoint", "protectCivilians", "slayBeforeTime", "repel"];
      const bossTypes = ["defeatBoss", "captureAlive", "slayBeforeTime"];
      context.objectiveNeedsTurns = turnsTypes.includes(currentObj.type);
      context.objectiveNeedsBoss = bossTypes.includes(currentObj.type);

      // Hostile combatants for boss/target selection
      context.hostileCombatants = Array.from(combat.combatants)
        .filter(c => (c.token?.disposition ?? 0) <= -1)
        .map(c => ({
          id: c.id,
          name: c.name,
          isBoss: c.actor?.system?.isBoss ?? false,
          selected: c.id === currentObj.bossCombatantId
        }));

      // Friendly combatants for escort VIP selection
      context.friendlyCombatants = Array.from(combat.combatants)
        .filter(c => (c.token?.disposition ?? 0) >= 1)
        .map(c => ({
          id: c.id,
          name: c.name,
          selected: c.id === currentObj.escortCombatantId
        }));
    }
  }

  /**
   * Attach change listeners and click handlers after render.
   * @override
   */
  _onRender(context, options) {
    const html = this.element;
    if (!html) return;

    // Objective config selects/inputs (pre-combat)
    html.querySelector("[data-change='setObjective']")?.addEventListener("change", (e) => {
      CTBTracker.#onSetObjective.call(this, e, e.currentTarget);
    });
    html.querySelector("[data-change='setObjectiveTurns']")?.addEventListener("change", (e) => {
      CTBTracker.#onSetObjectiveTurns.call(this, e, e.currentTarget);
    });
    html.querySelector("[data-change='setObjectiveBoss']")?.addEventListener("change", (e) => {
      CTBTracker.#onSetObjectiveBoss.call(this, e, e.currentTarget);
    });
    html.querySelector("[data-change='setObjectiveEscort']")?.addEventListener("change", (e) => {
      CTBTracker.#onSetObjectiveEscort.call(this, e, e.currentTarget);
    });

    // Clickable combatant entries (pan to token)
    html.querySelectorAll(".ctb-combatant-entry").forEach(el => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-action]")) return;
        CTBTracker.#onClickCombatant.call(this, e, el);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // COMBAT ACTIONS
  // ═══════════════════════════════════════════════════════════════

  static async #onBeginCombat(event, target) {
    const combat = this.viewed;
    if (combat) await combat.startCombat();
  }

  static async #onEndCombat(event, target) {
    const combat = this.viewed;
    if (combat) await combat.endCombat();
  }

  static async #onCreateCombat(event, target) {
    await Combat.create({ scene: canvas.scene?.id });
  }

  static async #onRemoveCombatant(event, target) {
    const combat = this.viewed;
    if (!combat) return;
    const combatantId = target.dataset.combatantId;
    const combatant = combat.combatants.get(combatantId);
    if (combatant) await combatant.delete();
  }

  static #onClickCombatant(event, target) {
    const combatantId = target.dataset.combatantId;
    if (!combatantId) return;
    const combat = this.viewed;
    const combatant = combat?.combatants?.get(combatantId);
    const token = combatant?.token?.object;
    if (token) {
      canvas.animatePan({ x: token.center.x, y: token.center.y });
    }
  }

  static async #onToggleAmbush(event, target) {
    const combat = this.viewed;
    if (!combat || combat.started) return;
    const current = combat.getFlag("manashard", "ambush") ?? false;
    await combat.setFlag("manashard", "ambush", !current);
  }

  static async #onEndTurn(event, target) {
    const combat = this.viewed;
    if (combat?.started) await combat.requestEndTurn();
  }

  static async #onSelectCombatant(event, target) {
    const combat = this.viewed;
    if (!combat?.started || !game.user.isGM) return;
    const combatantId = target.dataset.combatantId;
    if (combatantId) await combat.selectCombatant(combatantId);
  }

  static async #onRaiseHand(event, target) {
    const combat = this.viewed;
    if (!combat?.started) return;
    const combatantId = target.dataset.combatantId;
    if (combatantId) await combat.requestRaiseHand(combatantId);
  }

  // ═══════════════════════════════════════════════════════════════
  // OBJECTIVE ACTIONS
  // ═══════════════════════════════════════════════════════════════

  static async #onSetObjective(event, target) {
    const combat = this.viewed;
    if (!combat) return;
    const type = target.value;
    const currentObj = combat.getObjective();
    await combat.setObjective(type, {
      turnCount: currentObj.turnCount,
      bossCombatantId: currentObj.bossCombatantId,
      escortCombatantId: currentObj.escortCombatantId
    });
  }

  static async #onSetObjectiveTurns(event, target) {
    const combat = this.viewed;
    if (!combat) return;
    const turnCount = parseInt(target.value) || 5;
    const currentObj = combat.getObjective();
    await combat.setObjective(currentObj.type, {
      turnCount: Math.max(1, Math.min(99, turnCount)),
      bossCombatantId: currentObj.bossCombatantId,
      escortCombatantId: currentObj.escortCombatantId
    });
  }

  static async #onSetObjectiveBoss(event, target) {
    const combat = this.viewed;
    if (!combat) return;
    const bossCombatantId = target.value;
    const currentObj = combat.getObjective();
    await combat.setObjective(currentObj.type, {
      turnCount: currentObj.turnCount,
      bossCombatantId,
      escortCombatantId: currentObj.escortCombatantId
    });
  }

  static async #onSetObjectiveEscort(event, target) {
    const combat = this.viewed;
    if (!combat) return;
    const escortCombatantId = target.value;
    const currentObj = combat.getObjective();
    await combat.setObjective(currentObj.type, {
      turnCount: currentObj.turnCount,
      bossCombatantId: currentObj.bossCombatantId,
      escortCombatantId
    });
  }

  static async #onCompleteObjective(event, target) {
    const combat = this.viewed;
    if (combat) await combat.completeObjectiveManually();
  }

  static async #onToggleSection(event, target) {
    const section = target.dataset.section;
    if (!section) return;
    if (this._collapsedSections.has(section)) {
      this._collapsedSections.delete(section);
    } else {
      this._collapsedSections.add(section);
    }
    this.render();
  }
}

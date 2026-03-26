/**
 * Custom Combat document for Manashard's side-based turn system.
 *
 * Turn order: one entire side acts, then the other side acts.
 * Players act first by default (Ambush flag flips this).
 * Within a side, the GM/player CHOOSES which combatant acts next (pool-based).
 *
 * AGI is used for evasion and accuracy but does not drive turn order.
 *
 * Full-chant spells: declared this turn, resolve at start of caster's next turn.
 */
import { showOutcomeSplash } from "../helpers/outcome-splash.mjs";

export class ManashardCombat extends Combat {

  /**
   * Sort combatants by disposition (players first), then name.
   */
  _sortCombatants(a, b) {
    const dispA = a.token?.disposition ?? 0;
    const dispB = b.token?.disposition ?? 0;
    if (dispA !== dispB) return dispB - dispA; // friendly first
    return (a.name ?? "").localeCompare(b.name ?? "");
  }

  /**
   * Override rollInitiative — side-based turns don't need initiative.
   * Sets initiative to 0 to satisfy Foundry internals.
   */
  async rollInitiative(ids, options = {}) {
    const updates = ids
      .map(id => this.combatants.get(id))
      .filter(c => c)
      .map(c => ({ _id: c.id, initiative: 0 }));

    if (updates.length) {
      await this.updateEmbeddedDocuments("Combatant", updates);
    }
    return this;
  }

  /**
   * Mark all combatants as ready.
   */
  async rollAll(options = {}) {
    const ids = Array.from(this.combatants)
      .filter(c => c.initiative === null)
      .map(c => c.id);
    if (ids.length) await this.rollInitiative(ids, options);
    return this;
  }

  /**
   * Mark NPC combatants as ready.
   */
  async rollNPC(options = {}) {
    const ids = Array.from(this.combatants)
      .filter(c => c.initiative === null && !c.isOwner)
      .map(c => c.id);
    if (ids.length) await this.rollInitiative(ids, options);
    return this;
  }

  /**
   * Override startCombat — enter selection mode for the first side.
   */
  async startCombat() {
    await this.rollAll();

    // Default objective to rout if none set
    if (!this.getFlag("manashard", "objective")) {
      await this.setFlag("manashard", "objective", { type: "rout", turnCount: 5, bossCombatantId: null, completed: false });
    }

    // Determine first side
    const ambush = this.getFlag("manashard", "ambush") ?? false;
    const firstSide = ambush ? "enemies" : "players";

    // Initialize pool-based turn tracking
    await this.setFlag("manashard", "currentSide", firstSide);
    await this.setFlag("manashard", "actedThisRound", []);
    await this.setFlag("manashard", "actionsTaken", {});
    await this.setFlag("manashard", "awaitingSelection", true);

    await this.update({ round: 1, turn: 0 });

    return this;
  }

  /**
   * Override nextTurn to use side-based advancement.
   */
  async nextTurn() {
    return this.endTurn();
  }

  // ═══════════════════════════════════════════════════════════════
  // SIDE-BASED TURN SYSTEM (POOL-BASED SELECTION)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get the disposition side for a combatant.
   * @param {Combatant} combatant
   * @returns {"players"|"enemies"}
   */
  _getCombatantSide(combatant) {
    return (combatant?.token?.disposition ?? 0) >= 1 ? "players" : "enemies";
  }

  /**
   * Get un-acted, non-defeated combatants for a given side.
   * @param {"players"|"enemies"} side
   * @returns {Combatant[]}
   */
  _getAvailablePool(side) {
    const acted = new Set(this.getFlag("manashard", "actedThisRound") ?? []);
    return Array.from(this.combatants).filter(c => {
      if (c.isDefeated) return false;
      if (acted.has(c.id)) return false;
      return this._getCombatantSide(c) === side;
    });
  }

  /**
   * Select a combatant to act next. Validates they are on the current side
   * and haven't acted yet. Triggers start-of-turn effects and charge resolution.
   * @param {string} combatantId
   */
  async selectCombatant(combatantId) {
    const combatant = this.combatants.get(combatantId);
    if (!combatant || combatant.isDefeated) return;

    const currentSide = this.getFlag("manashard", "currentSide") ?? "players";
    const combatantSide = this._getCombatantSide(combatant);
    if (combatantSide !== currentSide) return;

    const acted = this.getFlag("manashard", "actedThisRound") ?? [];
    if (acted.includes(combatantId)) return;

    // Set this combatant as active
    await this.setFlag("manashard", "awaitingSelection", false);
    const turnIdx = this.turns.findIndex(c => c.id === combatantId);
    await this.update({ turn: Math.max(0, turnIdx) });

    // Only process start-of-turn effects on the FIRST action of a multi-action turn
    const actionsTaken = this.getFlag("manashard", "actionsTaken") ?? {};
    const takenSoFar = actionsTaken[combatantId] ?? 0;
    if (takenSoFar === 0) {
      if (combatant.actor?.processStartOfTurn) {
        await combatant.actor.processStartOfTurn();
      }
      // Check for charged spells resolving (first action only)
      await this._checkChargeResolutions(combatant);
    }
  }

  /**
   * End the current combatant's turn. Marks them as acted,
   * then either awaits next selection, switches sides, or advances round.
   */
  async endTurn() {
    const combatant = this.combatant;
    if (!combatant) return this;

    // Track multi-action turns (bosses/legendaries get multiple actions per round)
    const maxActions = combatant.actor?.system?.actionsPerTurn ?? 1;
    const actionsTaken = { ...(this.getFlag("manashard", "actionsTaken") ?? {}) };
    const newCount = (actionsTaken[combatant.id] ?? 0) + 1;
    actionsTaken[combatant.id] = newCount;
    await this.setFlag("manashard", "actionsTaken", actionsTaken);

    const isLastAction = newCount >= maxActions;

    // Only process end-of-turn effects on the LAST action
    if (isLastAction) {
      if (combatant.actor?.processEndOfTurn) {
        await combatant.actor.processEndOfTurn();
      }
    }

    // Only mark as fully acted when all actions are spent
    const acted = [...(this.getFlag("manashard", "actedThisRound") ?? [])];
    if (isLastAction && !acted.includes(combatant.id)) {
      acted.push(combatant.id);
    }
    await this.setFlag("manashard", "actedThisRound", acted);

    const currentSide = this.getFlag("manashard", "currentSide") ?? "players";

    // Check if the current side has anyone left to act
    const remaining = this._getAvailablePool(currentSide);

    if (remaining.length > 0) {
      // More combatants on this side — await selection
      await this.setFlag("manashard", "awaitingSelection", true);
      await this.checkObjectiveCompletion();
    } else {
      // Current side is done — switch to other side or advance round
      const otherSide = currentSide === "players" ? "enemies" : "players";
      const otherPool = this._getAvailablePool(otherSide);

      if (otherPool.length > 0) {
        // Other side still has combatants — switch to them
        await this.setFlag("manashard", "currentSide", otherSide);
        await this.setFlag("manashard", "awaitingSelection", true);
        await this.checkObjectiveCompletion();
      } else {
        // Both sides done — advance round
        await this._advanceRound();
      }
    }

    return this;
  }

  /**
   * Advance to the next round. Reset acted pool and enter selection.
   */
  async _advanceRound() {
    const newRound = this.round + 1;
    const ambush = this.getFlag("manashard", "ambush") ?? false;
    const firstSide = ambush ? "enemies" : "players";

    await this.setFlag("manashard", "currentSide", firstSide);
    await this.setFlag("manashard", "actedThisRound", []);
    await this.setFlag("manashard", "actionsTaken", {});
    await this.setFlag("manashard", "awaitingSelection", true);

    await this.update({ round: newRound, turn: 0 });

    // Check objective completion
    await this.checkObjectiveCompletion();
  }

  /**
   * Get the current turn info for display.
   */
  getTurnInfo() {
    const currentSide = this.getFlag("manashard", "currentSide") ?? "players";
    const acted = new Set(this.getFlag("manashard", "actedThisRound") ?? []);
    const awaiting = this.getFlag("manashard", "awaitingSelection") ?? false;

    // Count remaining actions per side (un-acted, non-defeated)
    let playerRemaining = 0;
    let enemyRemaining = 0;
    for (const c of this.combatants) {
      if (c.isDefeated || acted.has(c.id)) continue;
      const side = this._getCombatantSide(c);
      if (side === "players") playerRemaining++;
      else enemyRemaining++;
    }

    return {
      currentSide,
      awaitingSelection: awaiting,
      playerRemaining,
      enemyRemaining,
      ambush: this.getFlag("manashard", "ambush") ?? false
    };
  }

  /**
   * Get combatants grouped by side with acted/pending/selectable status.
   * @returns {{ players: object[], enemies: object[] }}
   */
  getSideGroups() {
    const acted = new Set(this.getFlag("manashard", "actedThisRound") ?? []);
    const actionsTaken = this.getFlag("manashard", "actionsTaken") ?? {};
    const currentSide = this.getFlag("manashard", "currentSide") ?? "players";
    const awaiting = this.getFlag("manashard", "awaitingSelection") ?? false;

    const players = [];
    const enemies = [];

    for (const c of this.combatants) {
      const side = this._getCombatantSide(c);
      const hp = c.actor?.system?.stats?.hp;
      const mp = c.actor?.system?.stats?.mp;
      const agi = c.actor?.system?.stats?.agi?.value ?? 0;
      const hasActed = acted.has(c.id);
      const isSelectable = awaiting && side === currentSide && !hasActed && !c.isDefeated;

      // Role and action data
      const isThreat = c.actor?.type === "threat";
      const role = isThreat ? (c.actor?.system?.role ?? "standard") : null;
      const maxActions = c.actor?.system?.actionsPerTurn ?? 1;
      const takenCount = actionsTaken[c.id] ?? 0;

      const entry = {
        id: c.id,
        name: c.name,
        img: c.token?.texture?.src ?? c.actor?.img ?? "icons/svg/mystery-man.svg",
        agi,
        isDefeated: c.isDefeated,
        isCurrent: c.id === this.combatant?.id,
        hasActed,
        isSelectable,
        isCharging: !!c.getFlag("manashard", "charging"),
        chargingSkillName: c.getFlag("manashard", "charging")?.skillName ?? "",
        hpPercent: (hp?.max > 0) ? Math.round(hp.value / hp.max * 100) : 100,
        hpCritical: hp?.max > 0 && (hp.value / hp.max) <= 0.25,
        hpValue: hp?.value ?? 0,
        hpMax: hp?.max ?? 0,
        hpBarrier: hp?.barrier ?? 0,
        hpBarrierPercent: ((hp?.barrier ?? 0) > 0 && hp?.max > 0) ? Math.min(Math.round(hp.value / hp.max * 100), Math.round(hp.barrier / hp.max * 100)) : 0,
        hpBarrierRight: 100 - ((hp?.max > 0) ? Math.round(hp.value / hp.max * 100) : 100),
        mpPercent: (mp?.max > 0) ? Math.round(mp.value / mp.max * 100) : 100,
        mpLow: mp?.max > 0 && (mp.value / mp.max) <= 0.20,
        mpValue: mp?.value ?? 0,
        mpMax: mp?.max ?? 0,
        statusIcons: this._getStatusIcons(c),
        // Enemy role data
        role,
        roleBadge: role ? (game.i18n.localize(CONFIG.MANASHARD?.enemyRoles?.[role] ?? "") || null) : null,
        roleIcon: CONFIG.MANASHARD?.enemyRoleIcons?.[role] ?? "",
        actionsPerTurn: maxActions,
        actionsRemaining: Math.max(0, maxActions - takenCount)
      };

      if (side === "players") players.push(entry);
      else enemies.push(entry);
    }

    return { players, enemies };
  }

  // ═══════════════════════════════════════════════════════════════
  // FULL-CHANT CHARGING (DECLARE & RESOLVE NEXT TURN)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Begin charging a Full-chant spell. The spell will resolve at the start
   * of the caster's next turn.
   * @param {string} combatantId
   * @param {object} options
   * @param {string} options.skillItemId - The manacite item ID on the actor
   * @param {string} options.skillName - Display name of the skill
   * @param {string} options.chantMode - Chant mode key (e.g. "full")
   * @param {string|null} options.targetTokenId - Token ID of the target
   * @param {number} options.mpCost - MP already deducted
   */
  async beginCharging(combatantId, { skillItemId, skillName, chantMode, targetTokenId, mpCost }) {
    const combatant = this.combatants.get(combatantId);
    if (!combatant?.actor) return;

    await combatant.setFlag("manashard", "charging", {
      skillItemId,
      skillName,
      chantMode,
      targetTokenId: targetTokenId ?? null,
      mpCost: mpCost ?? 0
    });

    const actor = combatant.actor;
    const actorImg = actor.img ?? "icons/svg/mystery-man.svg";

    // Gather skill & target info for a richer chat card
    const skillItem = actor.items.get(skillItemId);
    const skillData = skillItem?.system;
    const element = skillData?.element || "";
    const isHealing = skillData?.isHealing ?? false;
    const targetToken = targetTokenId ? canvas.tokens?.get(targetTokenId) : null;
    const targetName = targetToken?.name ?? "";

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/manashard/templates/chat/charge-message.hbs",
      { actorName: actor.name, actorImg, skillName, phase: "begin",
        mpCost: mpCost ?? 0, element, isHealing, targetName }
    );
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content
    });

    // End the caster's turn
    await this.endTurn();
  }

  /**
   * Check if the given combatant has a charged spell ready to resolve.
   * Called at the start of each combatant's turn.
   * @param {Combatant} combatant
   */
  async _checkChargeResolutions(combatant) {
    if (!combatant) return;
    const charging = combatant.getFlag("manashard", "charging");
    if (!charging) return;

    await this._resolveCharge(combatant, charging);
    await combatant.unsetFlag("manashard", "charging");
  }

  /**
   * Resolve a fully-charged ability by re-fetching the skill and target fresh.
   */
  async _resolveCharge(combatant, chargeData) {
    const actor = combatant.actor;
    if (!actor) return;

    const actorImg = actor.img ?? "icons/svg/mystery-man.svg";

    // Gather skill & target info for the resolve card
    const resolveSkillItem = actor.items.get(chargeData.skillItemId);
    const resolveSkillData = resolveSkillItem?.system;
    const resolveElement = resolveSkillData?.element || "";
    const resolveIsHealing = resolveSkillData?.isHealing ?? false;
    const resolveTarget = chargeData.targetTokenId ? canvas.tokens?.get(chargeData.targetTokenId) : null;
    const resolveTargetName = resolveTarget?.name ?? "";

    // Post the resolve announcement
    const announceContent = await foundry.applications.handlebars.renderTemplate(
      "systems/manashard/templates/chat/charge-message.hbs",
      { actorName: actor.name, actorImg, skillName: chargeData.skillName, phase: "resolve",
        mpCost: 0, element: resolveElement, isHealing: resolveIsHealing, targetName: resolveTargetName }
    );
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: announceContent
    });

    // Re-fetch the skill item from the actor (ensures DataModel getters work)
    const skillItem = actor.items.get(chargeData.skillItemId);
    if (!skillItem || skillItem.type !== "manacite") {
      console.warn("Manashard | Charged skill no longer found on actor:", chargeData.skillItemId);
      return;
    }
    const skill = skillItem.system;

    // Re-resolve the target token and defender actor
    let defenderActor = null;
    let targetTokenId = chargeData.targetTokenId;
    if (targetTokenId) {
      const targetToken = canvas.tokens?.get(targetTokenId);
      defenderActor = targetToken?.actor ?? null;
      if (!targetToken) {
        // Target token gone — still try to resolve (will show "Target" name)
        targetTokenId = null;
      }
    }

    // Build fresh attack params from live data
    const defSys = defenderActor?.system;
    const isHealing = skill.isHealing ?? false;
    const damageType = skill.damageType || (skill.element ? "magical" : "physical");
    const isMagical = damageType === "magical";
    const targetIsUndead = defSys?.creatureType?.includes?.("undead") ?? false;
    const healMode = isHealing && !targetIsUndead;

    try {
      await actor.rollSkillAttack({
        skill,
        skillName: chargeData.skillName,
        chantMode: chargeData.chantMode ?? "full",
        defenderActor,
        defenderEvasion: defSys ? (isMagical ? (defSys.meva ?? 0) : (defSys.peva ?? 0)) : 0,
        defenderDef: isMagical ? 0 : (defSys?.pdef ?? 0),
        defenderSpi: isMagical ? (defSys?.mdef ?? 0) : 0,
        defenderCritAvoid: 0,
        defenderBlockChance: healMode ? 0 : (defSys?.blockChance ?? 0),
        targetTokenId,
        mpCost: chargeData.mpCost ?? 0,
        itemId: chargeData.skillItemId ?? null
      });
    } catch (err) {
      console.error("Manashard | Failed to resolve charged ability:", err);
    }
  }

  /**
   * Cancel a combatant's charge (e.g., death or displacement).
   */
  async cancelCharge(combatantId) {
    const combatant = this.combatants.get(combatantId);
    if (!combatant) return;

    const charging = combatant.getFlag("manashard", "charging");
    if (!charging) return;

    await combatant.unsetFlag("manashard", "charging");

    const actor = combatant.actor;
    const actorImg = actor?.img ?? "icons/svg/mystery-man.svg";
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/manashard/templates/chat/charge-message.hbs",
      { actorName: actor?.name ?? combatant.name, actorImg, skillName: charging.skillName, phase: "cancel",
        mpCost: 0, element: "", isHealing: false, targetName: "" }
    );
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // COMBAT OBJECTIVES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Set the combat objective for this encounter.
   * @param {string} type - Key from CONFIG.MANASHARD.objectiveTypes
   * @param {object} params - Additional parameters (turnCount, bossCombatantId)
   */
  async setObjective(type, params = {}) {
    await this.setFlag("manashard", "objective", {
      type,
      turnCount: params.turnCount ?? 5,
      bossCombatantId: params.bossCombatantId ?? null,
      escortCombatantId: params.escortCombatantId ?? null,
      completed: false,
      failed: false
    });
  }

  /**
   * Get the current objective, defaulting to rout.
   */
  getObjective() {
    return this.getFlag("manashard", "objective") ?? { type: "rout", turnCount: 5, bossCombatantId: null, escortCombatantId: null, completed: false, failed: false };
  }

  /**
   * Compute objective progress for display.
   * @returns {{ label: string, description: string, current: number|null, target: number|null, isComplete: boolean, showManualComplete: boolean }}
   */
  getObjectiveProgress() {
    const obj = this.getObjective();
    const types = CONFIG.MANASHARD?.objectiveTypes ?? {};
    const label = game.i18n.localize(types[obj.type] ?? "MANASHARD.Objectives.Rout");

    switch (obj.type) {
      case "rout": {
        const hostiles = Array.from(this.combatants).filter(c => (c.token?.disposition ?? 0) <= -1);
        const defeated = hostiles.filter(c => c.isDefeated).length;
        const total = hostiles.length;
        return {
          label,
          description: game.i18n.localize("MANASHARD.Objectives.RoutDesc"),
          current: defeated,
          target: total,
          isComplete: total > 0 && defeated >= total,
          showManualComplete: false
        };
      }
      case "defeatBoss": {
        const bossCombatant = obj.bossCombatantId ? this.combatants.get(obj.bossCombatantId) : null;
        const bossName = bossCombatant?.name ?? "???";
        return {
          label,
          description: game.i18n.localize("MANASHARD.Objectives.DefeatBossDesc").replace("{name}", bossName),
          current: bossCombatant?.isDefeated ? 1 : 0,
          target: 1,
          isComplete: !!bossCombatant?.isDefeated,
          showManualComplete: false
        };
      }
      case "survive": {
        const target = obj.turnCount ?? 5;
        return {
          label,
          description: game.i18n.localize("MANASHARD.Objectives.SurviveDesc").replace("{n}", target),
          current: this.round,
          target,
          isComplete: this.round >= target,
          showManualComplete: false
        };
      }
      case "escape": {
        return {
          label,
          description: game.i18n.localize("MANASHARD.Objectives.EscapeDesc"),
          current: null,
          target: null,
          isComplete: !!obj.completed,
          showManualComplete: game.user.isGM && !obj.completed
        };
      }
      case "defendPoint": {
        const target = obj.turnCount ?? 5;
        return {
          label,
          description: game.i18n.localize("MANASHARD.Objectives.DefendPointDesc").replace("{n}", target),
          current: this.round,
          target,
          isComplete: this.round >= target || !!obj.completed,
          showManualComplete: game.user.isGM && !obj.completed && this.round < target
        };
      }

      // ─── Social / RP ───

      case "escort": {
        const vip = obj.escortCombatantId ? this.combatants.get(obj.escortCombatantId) : null;
        const vipName = vip?.name ?? "???";
        const vipDefeated = !!vip?.isDefeated;
        const hostiles = Array.from(this.combatants).filter(c => (c.token?.disposition ?? 0) <= -1);
        const allHostilesDown = hostiles.length > 0 && hostiles.every(c => c.isDefeated);
        return {
          label,
          description: game.i18n.localize("MANASHARD.Objectives.EscortDesc").replace("{name}", vipName),
          current: null,
          target: null,
          isComplete: !vipDefeated && (allHostilesDown || !!obj.completed),
          isFailed: vipDefeated,
          showManualComplete: game.user.isGM && !obj.completed && !vipDefeated && !allHostilesDown
        };
      }
      case "negotiate": {
        return {
          label,
          description: game.i18n.localize("MANASHARD.Objectives.NegotiateDesc"),
          current: null,
          target: null,
          isComplete: !!obj.completed,
          showManualComplete: game.user.isGM && !obj.completed
        };
      }
      case "protectCivilians": {
        const target = obj.turnCount ?? 5;
        const neutrals = Array.from(this.combatants).filter(c => {
          const disp = c.token?.disposition ?? 0;
          return disp === 0; // neutral disposition
        });
        const anyNeutralDown = neutrals.some(c => c.isDefeated);
        return {
          label,
          description: game.i18n.localize("MANASHARD.Objectives.ProtectCiviliansDesc").replace("{n}", target),
          current: this.round,
          target,
          isComplete: !anyNeutralDown && this.round >= target,
          isFailed: anyNeutralDown,
          showManualComplete: false
        };
      }

      // ─── Monster Hunter ───

      case "captureAlive": {
        const prey = obj.bossCombatantId ? this.combatants.get(obj.bossCombatantId) : null;
        const preyName = prey?.name ?? "???";
        const preyHp = prey?.actor?.system?.stats?.hp;
        const hpPercent = (preyHp?.max > 0) ? Math.round(preyHp.value / preyHp.max * 100) : 100;
        const capturable = hpPercent <= 25 && hpPercent > 0;
        const preyDead = !!prey?.isDefeated;
        return {
          label,
          description: game.i18n.localize("MANASHARD.Objectives.CaptureAliveDesc").replace("{name}", preyName),
          current: capturable ? 1 : 0,
          target: 1,
          isComplete: capturable && !!obj.completed,
          isFailed: preyDead,
          capturable,
          showManualComplete: game.user.isGM && capturable && !obj.completed && !preyDead
        };
      }
      case "slayBeforeTime": {
        const target = obj.turnCount ?? 5;
        const mark = obj.bossCombatantId ? this.combatants.get(obj.bossCombatantId) : null;
        const markName = mark?.name ?? "???";
        const markDead = !!mark?.isDefeated;
        const timedOut = this.round > target && !markDead;
        return {
          label,
          description: game.i18n.localize("MANASHARD.Objectives.SlayBeforeTimeDesc").replace("{name}", markName).replace("{n}", target),
          current: this.round,
          target,
          isComplete: markDead && this.round <= target,
          isFailed: timedOut,
          showManualComplete: false
        };
      }
      case "repel": {
        const target = obj.turnCount ?? 5;
        return {
          label,
          description: game.i18n.localize("MANASHARD.Objectives.RepelDesc").replace("{n}", target),
          current: this.round,
          target,
          isComplete: this.round >= target,
          showManualComplete: false
        };
      }

      default:
        return { label: "???", description: "", current: null, target: null, isComplete: false, showManualComplete: false };
    }
  }

  /**
   * Check if the objective has been completed or failed, and announce the result.
   */
  async checkObjectiveCompletion() {
    const obj = this.getObjective();
    if (obj.completed || obj.failed) return;

    const progress = this.getObjectiveProgress();
    const icon = CONFIG.MANASHARD?.objectiveIcons?.[obj.type] ?? "fas fa-trophy";
    const hasProgress = progress.current != null && progress.target != null;

    // Check for failure first
    if (progress.isFailed) {
      await this.setFlag("manashard", "objective", foundry.utils.mergeObject(obj, { failed: true }));

      const content = await foundry.applications.handlebars.renderTemplate(
        "systems/manashard/templates/chat/objective-result.hbs",
        {
          outcome: "defeat", objectiveIcon: icon,
          objectiveLabel: progress.label, objectiveDesc: progress.description,
          hasProgress, progressCurrent: progress.current, progressTarget: progress.target,
          progressPct: hasProgress ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : 0
        }
      );
      await ChatMessage.create({ content });
      await showOutcomeSplash("defeat", { objectiveLabel: progress.label, objectiveIcon: icon });
      return;
    }

    if (!progress.isComplete) return;

    // Mark as completed
    await this.setFlag("manashard", "objective", foundry.utils.mergeObject(obj, { completed: true }));

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/manashard/templates/chat/objective-result.hbs",
      {
        outcome: "victory", objectiveIcon: icon,
        objectiveLabel: progress.label, objectiveDesc: progress.description,
        hasProgress, progressCurrent: progress.current, progressTarget: progress.target,
        progressPct: hasProgress ? 100 : 0
      }
    );
    await ChatMessage.create({ content });
    await showOutcomeSplash("victory", { objectiveLabel: progress.label, objectiveIcon: icon });
  }

  /**
   * Manually complete the objective (for Escape/DefendPoint).
   */
  async completeObjectiveManually() {
    const obj = this.getObjective();
    if (obj.completed) return;
    await this.setFlag("manashard", "objective", foundry.utils.mergeObject(obj, { completed: true }));
    await this.checkObjectiveCompletion();
  }

  // ═══════════════════════════════════════════════════════════════
  // STATUS ICON HELPERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get status effect icons for a combatant.
   * @param {Combatant} combatant
   * @returns {Array<{key: string, icon: string, label: string}>}
   */
  _getStatusIcons(combatant) {
    const effects = combatant.actor?.system?.statusEffects;
    if (!effects || effects.size === 0) return [];

    const iconMap = CONFIG.MANASHARD?.statusIcons ?? {};
    const statusConfig = CONFIG.MANASHARD?.statusEffects ?? {};
    const icons = [];

    for (const key of effects) {
      const icon = iconMap[key];
      if (!icon) continue;
      icons.push({
        key,
        icon,
        label: game.i18n.localize(statusConfig[key]?.label ?? key)
      });
    }

    return icons;
  }
}

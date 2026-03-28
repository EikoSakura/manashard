import { resolveAttack, executeCombatRolls, getElementalTierLabel, evaluateCombatNotes, gridDistance, validateAttackRange, applyBuffEffect, checkTargetRestrictions } from "../helpers/combat.mjs";
import { scheduleSyncStatusEffects } from "../helpers/status-effects.mjs";
import { MANASHARD } from "../helpers/config.mjs";
import { syncTrapSenseDetection } from "../helpers/trap-sense.mjs";
import { syncSenseDetection } from "../helpers/sense.mjs";
import { showVsSplash } from "../helpers/vs-splash.mjs";
import { resolveStatCheck, postStatCheckCard } from "../helpers/stat-check.mjs";

/**
 * Extended Actor document for the Manashard system.
 * Handles D100 roll-under skill checks, combat rolls, and roll data preparation.
 */
export class ManashardActor extends Actor {

  /** Whether this actor is an NPC-type (any non-character unit). */
  get isNpcType() {
    return MANASHARD.NPC_TYPES.has(this.type);
  }

  /** @override */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    // Default token dispositions per type
    const dispositions = {
      character: 1,      // Friendly
      threat: -1,        // Hostile
      trap: -1           // Hostile
    };
    const disposition = dispositions[this.type] ?? 0;

    if (this.type === "character") {
      this.updateSource({
        "prototypeToken.actorLink": true,
        "prototypeToken.disposition": disposition,
        "prototypeToken.displayBars": 50
      });
    } else if (this.type === "trap") {
      // Traps: hidden by default, no vision, no bars
      this.updateSource({
        "prototypeToken.disposition": disposition,
        "prototypeToken.hidden": true,
        "prototypeToken.sight.enabled": false,
        "prototypeToken.displayBars": 0,
        "prototypeToken.displayName": 0,
        "prototypeToken.lockRotation": true
      });
      return; // Skip the vision setup below
    } else {
      this.updateSource({
        "prototypeToken.actorLink": false,
        "prototypeToken.disposition": disposition,
        "prototypeToken.displayBars": 50
      });
    }

    // Enable vision on prototype token with base range, lock rotation.
    // sight.range is in distance units; Foundry adds token-edge padding internally.
    const initSize = this.system?.size ?? 1;
    const baseVision = this.isNpcType && initSize >= 4 ? 7 : 6;
    this.updateSource({
      "prototypeToken.sight.enabled": true,
      "prototypeToken.sight.range": baseVision,
      "prototypeToken.lockRotation": true
    });
  }

  /** @override */
  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);
    // Store old rank points before update for rank-up detection
    if (this.type === "character" && changed.system?.rankPoints !== undefined) {
      options._oldRankPoints = this.system.rankPoints;
    }
    // Store old HP for boss phase alert detection
    if (this.type === "threat" && changed.system?.stats?.hp?.value !== undefined) {
      options._oldHp = this.system.stats.hp.value;
    }
  }

  /** @override */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    // Check for rank-up after RP changes (Feature 6)
    if (this.type === "character" && changed.system?.rankPoints !== undefined && game.user.id === userId) {
      this.#checkRankUp(options._oldRankPoints ?? 0, changed.system.rankPoints);
    }
    // Auto-resize NPC tokens when size changes
    if (this.isNpcType && changed.system?.size !== undefined && game.user.id === userId) {
      this.#syncTokenSize(changed.system.size);
    }

    // Sync vision stat to token sight range when actor data changes
    if (changed.system && game.user.id === userId) {
      const newVision = this.system.vision;
      if (newVision !== undefined) {
        this.#syncTokenVision(newVision);
        // Vision change also affects Trap Sense and Sense range
        this.#syncTrapSenseIfChanged();
        this.#syncSenseIfChanged();
      }
    }

    // Sync status effects → display-only ActiveEffects for token icons
    if (changed.system?.statusEffects !== undefined || changed.flags?.manashard?.statusDurations !== undefined) {
      scheduleSyncStatusEffects(this);
    }

    // Boss HP phase alerts — fire once per threshold crossing
    if (this.type === "threat" && this.system.isBoss && changed.system?.stats?.hp?.value !== undefined && game.user.id === userId) {
      this.#checkBossPhaseAlert(options._oldHp ?? this.system.stats.hp.max, changed.system.stats.hp.value);
    }
  }

  /**
   * When items are created on this actor, check if a species was added
   * and sync token size accordingly.
   * @override
   */
  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if (game.user.id !== userId) return;

    // Sync vision and trap sense when effects change (auras, etc.)
    if (collection === "effects") {
      this.#syncVisionIfChanged();
      this.#syncTrapSenseIfChanged();
      this.#syncSenseIfChanged();
      return;
    }

    if (collection !== "items") return;
    if (this.type === "character") {
      const species = documents.find(d => d.type === "species");
      if (species) this.#syncTokenSize(species.system.size ?? 1);
    }
    // Items with rules can affect vision, trap sense, and sense
    this.#syncVisionIfChanged();
    this.#syncTrapSenseIfChanged();
    this.#syncSenseIfChanged();
  }

  /**
   * When items are updated on this actor, check if a species size changed.
   * @override
   */
  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if (game.user.id !== userId) return;

    // Sync vision and trap sense when effects are updated
    if (collection === "effects") {
      this.#syncVisionIfChanged();
      this.#syncTrapSenseIfChanged();
      this.#syncSenseIfChanged();
      return;
    }

    if (collection !== "items") return;
    if (this.type === "character") {
      for (let i = 0; i < documents.length; i++) {
        if (documents[i].type === "species" && changes[i]?.system?.size !== undefined) {
          this.#syncTokenSize(changes[i].system.size);
          break;
        }
      }
    }
    // Item updates can affect vision, trap sense, and sense
    this.#syncVisionIfChanged();
    this.#syncTrapSenseIfChanged();
    this.#syncSenseIfChanged();
  }

  /**
   * Check if new RP crosses a rank threshold and notify.
   * @param {number} oldRP - Previous rank points
   * @param {number} newRP - New rank points
   */
  #checkRankUp(oldRP, newRP) {
    if (newRP <= oldRP) return;
    const rankOrder = ["f", "e", "d", "c", "b", "a", "s"];
    const ranks = CONFIG.MANASHARD.ranks;

    for (const rankKey of rankOrder) {
      const threshold = ranks[rankKey].rpThreshold;
      if (oldRP < threshold && newRP >= threshold) {
        const rankLabel = game.i18n.localize(ranks[rankKey].label);
        ui.notifications.info(`${this.name} has qualified for Rank ${rankLabel}!`);
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this }),
          content: `<div class="manashard rank-up-chat">
            <strong>${this.name}</strong> has earned enough RP to qualify for <strong>Rank ${rankLabel}</strong>!
            <br><span class="rp-detail">RP: ${newRP} / ${threshold} required</span>
          </div>`
        });
      }
    }
  }

  /**
   * Check if a boss/legendary threat crossed an HP phase threshold (75%, 50%, 25%).
   * Posts a dramatic chat alert the first time each threshold is crossed.
   * @param {number} oldHp - HP value before the change
   * @param {number} newHp - HP value after the change
   */
  #checkBossPhaseAlert(oldHp, newHp) {
    if (newHp >= oldHp) return; // Only alert on damage, not healing
    const maxHp = this.system.stats.hp.max;
    if (maxHp <= 0) return;

    const fired = new Set(this.getFlag("manashard", "phaseAlerts") ?? []);
    const thresholds = [
      { pct: 75, key: "MANASHARD.BossAlert75" },
      { pct: 50, key: "MANASHARD.BossAlert50" },
      { pct: 25, key: "MANASHARD.BossAlert25" }
    ];

    const oldPct = (oldHp / maxHp) * 100;
    const newPct = (newHp / maxHp) * 100;
    const newAlerts = [];

    for (const { pct, key } of thresholds) {
      if (fired.has(pct)) continue;
      if (oldPct > pct && newPct <= pct) {
        newAlerts.push(pct);
        const msg = game.i18n.format(key, { name: this.name });
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this }),
          content: `<div class="manashard boss-alert-chat"><strong>${msg}</strong></div>`
        });
      }
    }

    if (newAlerts.length) {
      this.setFlag("manashard", "phaseAlerts", [...fired, ...newAlerts]);
    }
  }

  /**
   * When items are deleted from this actor, clean up any items/effects
   * that were granted by the deleted items.
   * @override
   */
  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    if (game.user.id !== userId) return;

    // Sync vision and trap sense when effects are removed (auras, etc.)
    if (collection === "effects") {
      this.#syncVisionIfChanged();
      this.#syncTrapSenseIfChanged();
      this.#syncSenseIfChanged();
      return;
    }

    if (collection !== "items") return;

    // Collect IDs of items that were granted by any of the deleted items
    const grantedItemIds = [];
    const grantedEffectIds = [];

    for (const deletedItem of documents) {
      const hasGrants = (deletedItem.system?.rules ?? []).some(r =>
        (r.key === "Grant" && r.subtype === "item") || r.key === "GrantItem"
      );
      if (!hasGrants) continue;

      // Find owned items granted by this deleted item
      for (const item of this.items) {
        if (item.getFlag("manashard", "grantedBy") === deletedItem.id) {
          grantedItemIds.push(item.id);
        }
      }

      // Find owned effects granted by this deleted item
      for (const effect of this.effects) {
        if (effect.getFlag("manashard", "grantedBy") === deletedItem.id) {
          grantedEffectIds.push(effect.id);
        }
      }
    }

    // Delete granted items and effects (async, fire-and-forget)
    if (grantedItemIds.length) {
      // Filter to only IDs that actually exist on this actor
      const validIds = grantedItemIds.filter(id => this.items.has(id));
      if (validIds.length) {
        this.deleteEmbeddedDocuments("Item", validIds).catch(e =>
          console.warn(`Manashard | Failed to cascade-delete granted items from ${this.name}:`, e)
        );
      }
    }
    if (grantedEffectIds.length) {
      this.deleteEmbeddedDocuments("ActiveEffect", grantedEffectIds).catch(e =>
        console.warn(`Manashard | Failed to cascade-delete granted effects from ${this.name}:`, e)
      );
    }

    // Reset token size to 1 when a species is removed from a character
    if (this.type === "character") {
      const deletedSpecies = documents.some(d => d.type === "species");
      if (deletedSpecies) this.#syncTokenSize(1);
    }

    // Item removal can affect vision, trap sense, and sense
    this.#syncVisionIfChanged();
    this.#syncTrapSenseIfChanged();
    this.#syncSenseIfChanged();
  }

  /**
   * Sync prototype token and all placed tokens to match the given size.
   * @param {number} size - Tile size (1–5)
   */
  async #syncTokenSize(size) {
    size = Math.max(1, Math.min(5, size));

    // Update prototype token
    await this.update({
      "prototypeToken.width": size,
      "prototypeToken.height": size
    });

    // Update all placed tokens on active scenes
    for (const scene of game.scenes) {
      const tokens = scene.tokens.filter(t => t.actorId === this.id);
      for (const token of tokens) {
        if (token.width !== size || token.height !== size) {
          await token.update({ width: size, height: size });
        }
      }
    }
  }

  /**
   * Sync prototype token and all placed tokens to match the given vision range.
   * Sets sight.enabled and sight.range so Foundry's built-in vision system
   * enforces the Vision stat on the canvas.
   *
   * Foundry's sight.range is in the scene's distance units, and getLightRadius /
   * sightRange already adds token external-radius padding (measuring from the
   * outer edge, not center), so no manual size offset is needed.
   *
   * @param {number} visionRange - Vision range in tiles
   */
  async #syncTokenVision(visionRange) {
    visionRange = Math.max(0, visionRange);

    // Prototype token uses the system default (grid.distance = 1 tile).
    await this.update({
      "prototypeToken.sight.enabled": true,
      "prototypeToken.sight.range": visionRange
    });

    // Placed tokens: convert tiles → scene distance units so vision
    // covers the correct number of grid squares on any scene.
    for (const scene of game.scenes) {
      const tokens = scene.tokens.filter(t => t.actorId === this.id);
      if (!tokens.length) continue;
      const gridDist = scene.grid?.distance ?? 1;
      const sceneSightRange = visionRange * gridDist;
      for (const token of tokens) {
        if (token.sight.range !== sceneSightRange) {
          await token.update({ "sight.enabled": true, "sight.range": sceneSightRange });
        }
      }
    }
  }

  /**
   * Check if the current vision value differs from the prototype token sight range,
   * and sync if needed. Called after item/effect changes that may affect derived vision.
   */
  #syncVisionIfChanged() {
    const vision = this.system.vision;
    if (vision === undefined) return;
    const currentRange = this.prototypeToken?.sight?.range;
    if (currentRange !== vision) {
      this.#syncTokenVision(vision);
    }
  }

  /**
   * Check if the Trap Sense detection mode needs updating based on current rule engine
   * results and active effects. Called after item/effect changes.
   */
  #syncTrapSenseIfChanged() {
    // Traps themselves don't need trap sense
    if (this.type === "trap") return;
    syncTrapSenseDetection(this);
  }

  /**
   * Check if the Sense detection mode needs updating based on current rule engine
   * results and active effects. Called after item/effect changes.
   */
  #syncSenseIfChanged() {
    if (this.type === "trap") return;
    syncSenseDetection(this);
  }


  /** @override */
  getRollData() {
    const data = { ...super.getRollData() };
    const system = this.system;

    // Flatten stats for roll formulas: @stats.str.value, @stats.agi.value, etc.
    if (system.stats) {
      data.stats = {};
      for (const [key, stat] of Object.entries(system.stats)) {
        data.stats[key] = { ...stat };
      }
    }

    // Derived combat stats
    data.damage = system.damage ?? 0;
    data.accuracy = system.accuracy ?? 0;
    data.critical = system.critical ?? 0;
    data.peva = system.peva ?? 0;
    data.meva = system.meva ?? 0;
    data.critAvoid = system.critAvoid ?? 0;
    data.mov = system.mov ?? 6;
    data.mpRegen = system.mpRegen ?? 0;
    data.carryingCapacity = system.carryingCapacity ?? 0;

    return data;
  }

  /**
   * Roll a stat check using the styled chat card system.
   * Formula: stat × 2 + checkBonus + difficulty modifier, d100 roll-under.
   * @param {string} statKey - Stat key (e.g., "str", "agi")
   * @param {string} [difficultyKey="normal"] - Key into CONFIG.MANASHARD.difficultyTiers
   * @param {string} [context=""] - Optional description of what's being attempted
   * @param {number} [conditionalBonus=0] - Sum of player-toggled conditional check bonuses
   * @returns {Promise<object>} Resolution result with roll, threshold, success, etc.
   */
  async rollStatCheck(statKey, difficultyKey = "normal", context = "", conditionalBonus = 0) {
    const result = await resolveStatCheck(this, statKey, difficultyKey, conditionalBonus);
    await postStatCheckCard(this, result, { context });
    return result;
  }

  /**
   * @deprecated Use rollStatCheck() instead. Kept for backward compatibility.
   * Roll a non-combat skill check using two stats and a difficulty modifier.
   * Now internally delegates to the single-stat rollStatCheck using stat1Key.
   */
  async rollSkillCheck(stat1Key, stat2Key, modifier = 0, label = "") {
    let difficultyKey = "normal";
    if (modifier >= 10) difficultyKey = "easy";
    else if (modifier <= -25) difficultyKey = "extreme";
    else if (modifier <= -15) difficultyKey = "veryHard";
    else if (modifier <= -5) difficultyKey = "hard";
    return this.rollStatCheck(stat1Key, difficultyKey, label);
  }

  /**
   * Roll a weapon attack using the full combat resolution pipeline.
   * Integrates elemental damage, damage bonuses, block, status infliction, and rich chat cards.
   * @param {object} options
   * @param {Actor|null} options.defenderActor - Defender actor document
   * @param {number} options.defenderEvasion - Defender's evasion
   * @param {number} options.defenderDef - Defender's physical armor DEF
   * @param {number} options.defenderSpi - Defender's magical armor SPI
   * @param {number} options.defenderCritAvoid - Defender's crit avoid
   * @param {number} options.defenderBlockChance - Defender's shield block chance
   * @param {string|null} options.targetTokenId - Token ID for Apply Damage button
   */
  async rollAttack({
    defenderActor = null,
    defenderEvasion = 0, defenderDef = 0, defenderSpi = 0,
    defenderCritAvoid = 0, defenderBlockChance = 0,
    targetTokenId = null,
    weaponOverride = null,
    damageMultiplier = 1.0,
    isOffhand = false
  } = {}) {
    const system = this.system;
    const weapon = weaponOverride
      ?? this.items.find(i => i.type === "weapon" && i.system.equipped && i.system.equipSlot !== "offhand");
    const damageType = weapon?.system?.damageType ?? "physical";
    const element = weapon?.system?.element || "";
    const weaponName = weapon?.name ?? "Unarmed";

    // ── Range validation ──
    const rangeType = weapon?.system?.rangeType ?? "melee";
    const minRange = weapon?.system?.minRange ?? 1;
    const maxRange = rangeType === "melee" ? (this.system.reach ?? 1) : (weapon?.system?.maxRange ?? 1);
    const throwRange = this.system.throwRange ?? 0;
    const canThrow = rangeType === "melee" && throwRange > 0;
    const attackerToken = this.token?.object ?? canvas.tokens?.placeables.find(t => t.actor?.id === this.id);
    let attackDistance = Infinity;
    if (targetTokenId) {
      const targetToken = canvas.tokens?.get(targetTokenId);
      if (targetToken && attackerToken) {
        attackDistance = gridDistance(attackerToken, targetToken);
        const rangeCheck = validateAttackRange({ distance: attackDistance, minRange, maxRange, rangeType });
        if (!rangeCheck.valid && canThrow) {
          const throwCheck = validateAttackRange({ distance: attackDistance, minRange: 2, maxRange: throwRange, rangeType: "thrown" });
          if (throwCheck.valid) rangeCheck.valid = true;
        }
        if (!rangeCheck.valid) {
          ui.notifications.warn(rangeCheck.reason);
          return null;
        }
      }
    }

    // Pick the correct defense: physical uses pdef, magical uses mdef
    const defValue = damageType === "magical" ? defenderSpi : defenderDef;

    // Determine if this actor is the current combatant (initiating their turn)
    const isInitiator = game.combat?.combatant?.actorId === this.id;

    // Compute combat stats: for weapon overrides (natural weapons), recalculate from the weapon's own stats
    let baseDamage, accuracy, critical;
    if (weaponOverride) {
      const stats = system.stats;
      const wpnMight = weapon?.system?.might ?? 0;
      const wpnCrit = weapon?.system?.crit ?? 0;
      // Swords (Versatile): physical damage uses max(STR, AGI)
      const wpnCat = weapon?.system?.category;
      const physStat = (damageType !== "magical" && wpnCat === "swords")
        ? Math.max(stats?.str?.value ?? 0, stats?.agi?.value ?? 0)
        : (stats?.str?.value ?? 0);
      const scalingStat = damageType === "magical" ? (stats?.mag?.value ?? 0) : physStat;
      baseDamage = (scalingStat * 2) + wpnMight;
      accuracy = 80 + (stats?.agi?.value ?? 0) * 2;
      critical = (stats?.luk?.value ?? 0) * 2 + wpnCrit;
    } else {
      baseDamage = system.damage ?? 0;
      accuracy = system.accuracy ?? 0;
      critical = system.critical ?? 0;
    }

    // Resolve attack values
    const result = resolveAttack({
      attackerSystem: system,
      defenderActor,
      element,
      damageType,
      baseDamage,
      accuracy,
      critical,
      defenderEvasion,
      defenderDef: defValue,
      defenderCritAvoid,
      defenderBlockChance,
      damageMultiplier,
      isInitiator,
      weaponItemId: weapon?.id ?? null,
      weaponCategory: weapon?.system?.category ?? null,
      attackerActorId: this.id,
      attackerTokenId: attackerToken?.id ?? null,
      targetTokenId
    });

    // Execute d100 rolls (pass weapon ID so only weapon-sourced inflictions apply)
    await executeCombatRolls(result, system, defenderActor, weapon?.id ?? null);

    // Evaluate combat notes (only shown on hit)
    const noteContext = {
      system, defenderActor, element: result.element, damageType, isInitiator,
      weaponMinRange: weapon?.system?.minRange ?? 1,
      weaponMaxRange: weapon?.system?.maxRange ?? 1,
      weaponRangeType: rangeType,
      attackDistance,
      weaponItemId: weapon?.id ?? null,
      weaponCategory: weapon?.system?.category ?? null
    };
    const combatNotes = result.hit
      ? evaluateCombatNotes(system._ruleCache?.combatNotes ?? [], noteContext)
      : [];

    // Build template data for the chat card
    const elementTierLabel = getElementalTierLabel(result.elementTier);
    const successfulStatuses = result.statusResults.filter(s => s.success);

    // Build damage formula breakdown for collapsible section
    const weaponMight = weapon?.system?.might ?? 0;
    const scalingStat = damageType === "magical" ? "MAG" : "STR";
    const scalingStatVal = damageType === "magical"
      ? (system.stats?.mag?.value ?? 0)
      : (system.stats?.str?.value ?? 0);
    const formulaSteps = [
      { label: `${weaponName} Damage`, value: weaponMight },
      { label: scalingStat, value: scalingStatVal }
    ];

    const templateData = {
      actorName: this.name,
      actorImg: this.img,
      isSkill: false,
      isOffhand,
      weaponName,
      damageType,
      element: result.element,
      hitRoll: result.hitRoll,
      hitChance: result.hitChance,
      hit: result.hit,
      critRoll: result.critRoll,
      critChance: result.critChance,
      critHit: result.critHit,
      blockRoll: result.blockRoll,
      blockChance: result.blockChance,
      blocked: result.blocked,
      finalDamage: result.finalDamage,
      baseDamage: result.baseDamage,
      defReduction: result.defReduction,
      rawDamage: result.rawDamage,
      damageBonusTotal: result.damageBonusTotal,
      elementTier: result.elementTier,
      elementTierLabel,
      isHealing: result.isHealing,
      impairApplied: result.impairApplied || false,
      exposeApplied: result.exposeApplied || false,
      damageMultiplier: result.damageMultiplier !== 1.0 ? result.damageMultiplier : null,
      mpCost: 0,
      statusResults: result.statusResults,
      combatNotes,
      attackerTokenId: attackerToken?.id ?? "",
      targetTokenId,
      targetName: defenderActor?.name ?? "Target",
      defenderImg: defenderActor?.img ?? "icons/svg/mystery-man.svg",
      formulaSteps,
      elementMultiplier: result.elementMultiplier !== 1.0 ? result.elementMultiplier : null,
      statusDataJson: successfulStatuses.length
        ? JSON.stringify(successfulStatuses.map(s => ({ status: s.status, duration: s.duration })))
          .replace(/"/g, "&quot;")
        : "",
      isHostile: !!defenderActor && !defenderActor.hasPlayerOwner
    };

    // VS splash animation (only for single-target attacks with a defender)
    if (defenderActor && game.settings.get("manashard", "showVsSplash")) {
      await showVsSplash({
        attackerName: this.name,
        attackerImg: this.img,
        defenderName: defenderActor.name,
        defenderImg: defenderActor.img ?? "icons/svg/mystery-man.svg",
        actionLabel: isOffhand ? `off-hand strike with ${weaponName}` : `attacks with ${weaponName}`,
        element: result.element,
        isHostile: !defenderActor.hasPlayerOwner,
        hit: result.hit,
        critHit: result.critHit,
        blocked: result.blocked,
        finalDamage: result.finalDamage,
        isHealing: result.isHealing,
        defenderHpBefore: defenderActor.system.stats.hp.value,
        defenderHpMax: defenderActor.system.stats.hp.max,
        defenderBarrier: defenderActor.system.stats.hp.barrier ?? 0,
        statusResults: result.statusResults
      });
    }

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/manashard/templates/chat/attack-result.hbs",
      templateData
    );

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content,
      rolls: result._rolls
    });

    return result;
  }

  /**
   * Roll a skill-based attack using the full combat resolution pipeline.
   * @param {object} options
   * @param {object} options.skill - Skill data (from manacite skill or job active skill)
   * @param {string} options.skillName - Display name of the skill
   * @param {string} options.chantMode - "swift", "normal", or "full"
   * @param {Actor|null} options.defenderActor - Defender actor document
   * @param {number} options.defenderEvasion - Defender's evasion
   * @param {number} options.defenderDef - Defender's physical armor DEF
   * @param {number} options.defenderSpi - Defender's magical armor SPI
   * @param {number} options.defenderCritAvoid - Defender's crit avoid
   * @param {number} options.defenderBlockChance - Defender's shield block chance
   * @param {string|null} options.targetTokenId - Token ID for Apply Damage button
   */
  async rollSkillAttack({
    skill, skillName = "Skill",
    chantMode = "normal",
    defenderActor = null,
    defenderEvasion = 0, defenderDef = 0, defenderSpi = 0,
    defenderCritAvoid = 0, defenderBlockChance = 0,
    targetTokenId = null,
    mpCost = 0,
    itemId = null
  } = {}) {
    const system = this.system;
    const chant = CONFIG.MANASHARD.chantModes[chantMode];
    const chantModifier = chant?.effectModifier ?? 1.0;
    const chantLabel = chant ? game.i18n.localize(chant.label) : "";

    // ── Target restriction check ──
    if (defenderActor) {
      const restriction = checkTargetRestrictions(system, defenderActor, itemId);
      if (!restriction.allowed) {
        const msg = game.i18n.format("MANASHARD.TargetRestriction.NoEffect", { type: restriction.blockedType });
        ui.notifications.warn(msg);
        return null;
      }
    }

    // Determine element and damage type from skill
    const element = skill.element || "";
    const damageType = skill.damageType || "none";

    // ── Range validation ──
    // Weapon-mode skills use the equipped weapon's range; fixed-mode skills use the skill's own minRange/maxRange
    const isWeaponMode = skill.baseRateMode === "weapon";
    const equippedWeapon = this.items.find(i => i.type === "weapon" && i.system.equipped && i.system.equipSlot !== "offhand");

    let skillRangeType, skillMinRange, skillMaxRange;
    const skipRangeCheck = skill.rangeType === "none" || skill.rangeType === "self";
    if (isWeaponMode || skill.rangeType === "weapon") {
      skillRangeType = equippedWeapon?.system?.rangeType ?? "melee";
      skillMinRange = equippedWeapon?.system?.minRange ?? 1;
      skillMaxRange = skillRangeType === "melee" ? (this.system.reach ?? 1) : (equippedWeapon?.system?.maxRange ?? 1);
    } else if (skill.rangeType === "melee") {
      skillRangeType = "melee";
      skillMinRange = 1;
      skillMaxRange = this.system.reach ?? 1;
    } else if (skipRangeCheck) {
      skillRangeType = skill.rangeType;
      skillMinRange = 0;
      skillMaxRange = 0;
    } else {
      skillRangeType = "ranged";
      skillMinRange = skill.minRange ?? 1;
      skillMaxRange = skill.maxRange ?? 1;
    }

    let skillAttackDistance = Infinity;
    const attackerToken = this.token?.object ?? canvas.tokens?.placeables.find(t => t.actor?.id === this.id);
    if (targetTokenId && !skipRangeCheck) {
      const targetToken = canvas.tokens?.get(targetTokenId);
      if (targetToken && attackerToken) {
        skillAttackDistance = gridDistance(attackerToken, targetToken);
        const rangeCheck = validateAttackRange({ distance: skillAttackDistance, minRange: skillMinRange, maxRange: skillMaxRange, rangeType: skillRangeType });
        if (!rangeCheck.valid) {
          ui.notifications.warn(rangeCheck.reason);
          return null;
        }
      }
    }

    // Compute base damage: baseRate + stat scaling (+ weapon might in "weapon" mode)
    let effectiveBaseRate = skill.baseRate ?? 0;
    if (isWeaponMode) {
      effectiveBaseRate += equippedWeapon?.system?.might ?? 0;
    }
    // Resolve scaling stat: "auto" derives from damageType, or use explicit override
    // Flat retaliatory skills use only baseRate — no stat scaling
    const ssKey = skill.scalingStat ?? "auto";
    const retMode = skill.retaliationMode ?? "flat";
    const skipScaling = (skill.isRetaliatory ?? skill.damageType === "retaliatory") && retMode === "flat";
    let scalingStat = 0;
    if (skipScaling) {
      scalingStat = 0;
    } else if (ssKey === "auto") {
      scalingStat = (damageType === "magical" || damageType === "healing" || damageType === "barrier" || damageType === "retaliatory")
        ? (system.stats?.mag?.value ?? 0)
        : (system.stats?.str?.value ?? 0);
    } else if (ssKey !== "none") {
      scalingStat = system.stats?.[ssKey]?.value ?? 0;
    }
    const baseDamage = effectiveBaseRate + scalingStat;

    // Pick correct defense
    let defValue = damageType === "magical" ? defenderSpi : defenderDef;

    // None damage type: force 0 damage; auto-hit only if skill has no hit mechanics
    const isNoneDamage = damageType === "none";
    const noneHasHitMechanics = isNoneDamage && (skill.baseRateMode === "weapon" || (skill.baseRateMode === "fixed" && (skill.skillHit ?? 0) > 0));
    const noneAutoHit = isNoneDamage && !noneHasHitMechanics;

    // Healing / Barrier / Retaliatory: skip defense (unless target is Undead for healing)
    const isHealing = skill.isHealing ?? false;
    const isBarrier = skill.isBarrier ?? false;
    const isRetaliatory = skill.isRetaliatory ?? false;

    // ── Retaliatory early-return: apply buff only, no damage roll ──
    if (isRetaliatory) {
      // Compute retaliation value based on mode
      const retMode2 = skill.retaliationMode ?? "flat";
      let retaliationValue = 0;
      if (retMode2 === "flat") {
        retaliationValue = baseDamage; // baseRate (+ weapon might if weapon mode), no stat scaling for flat
      } else if (retMode2 === "percent") {
        retaliationValue = skill.baseRate ?? 0; // Store percentage value
      } else if (retMode2 === "stat") {
        retaliationValue = baseDamage; // stat-scaled, but trigger re-reads from caster
      }

      // Apply buff to target
      const buffDuration = skill.buffDuration ?? 0;
      if (buffDuration > 0) {
        const skillItem = this.items.get(itemId);
        const skillSys = skillItem?.system ?? skill;
        const buffRules = (skillSys.rules ?? []).filter(r => r.key === "Modifier" || r.key === "Status");
        const desc = skillSys.description ?? "";
        const retaliationFlags = {
          retaliatory: true,
          retaliationMode: retMode2,
          retaliationValue,
          retaliationStat: skill.scalingStat ?? "auto",
          retaliationCasterId: this.id
        };
        const buffRadius = Number(skillSys.aoeSize) || 0;
        const buffFilter = skillSys.aoeTargetFilter || "allies";

        if (buffRadius > 0 && canvas?.tokens) {
          const casterToken = this.token?.object ?? canvas.tokens.placeables.find(t => t.actor?.id === this.id);
          if (casterToken) {
            for (const t of canvas.tokens.placeables) {
              if (!t.actor || t.actor.id === this.id) continue;
              const dist = gridDistance(casterToken, t);
              if (dist > buffRadius) continue;
              const sameTeam = casterToken.document.disposition === t.document.disposition;
              if (buffFilter === "allies" && !sameTeam) continue;
              if (buffFilter === "enemies" && sameTeam) continue;
              await applyBuffEffect(t.actor, skillName, skillItem?.img, buffDuration, buffRules, desc, retaliationFlags);
            }
            if (buffFilter === "allies" || buffFilter === "all") {
              await applyBuffEffect(this, skillName, skillItem?.img, buffDuration, buffRules, desc, retaliationFlags);
            }
          }
        } else {
          const targetActor = (skill.targetType === "self" || skill.isHealing) ? this : (defenderActor ?? this);
          if (targetActor) {
            await applyBuffEffect(targetActor, skillName, skillItem?.img, buffDuration, buffRules, desc, retaliationFlags);
          }
        }
      }

      // Resolve stat label for display
      const retStatLabel = (skill.scalingStat ?? "auto") === "auto" ? "MAG" : (skill.scalingStat ?? "mag").toUpperCase();
      const buffTarget = (skill.targetType === "self") ? this : (defenderActor ?? this);
      const skillItemForCard = this.items.get(itemId);

      // Render buff-applied chat card
      const content = await foundry.applications.handlebars.renderTemplate(
        "systems/manashard/templates/chat/retaliate-buff-card.hbs",
        {
          actorName: this.name,
          actorImg: this.img,
          skillName,
          skillImg: skillItemForCard?.img ?? "icons/svg/aura.svg",
          mpCost,
          targetName: buffTarget?.name ?? this.name,
          element: skill.element || "",
          retaliationMode: skill.retaliationMode ?? "flat",
          retaliationValue,
          retaliationStatLabel: retStatLabel,
          buffDuration: skill.buffDuration ?? 0
        }
      );
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content
      });

      return null;
    }

    const defSys = defenderActor?.system;
    const targetIsUndead = defSys?.creatureType?.includes?.("undead") ?? false;
    if ((isHealing && !targetIsUndead) || isBarrier || isNoneDamage) {
      defValue = 0;
    }

    // Determine if this actor is the current combatant (initiating their turn)
    const isInitiator = game.combat?.combatant?.actorId === this.id;

    // Compute accuracy: use skillHit for fixed-mode skills that define their own hit rate
    // Fixed-mode skills use their scaling stat for accuracy instead of AGI
    let accuracy = system.accuracy ?? 0;
    const skillHit = skill.skillHit ?? 0;
    if (skill.baseRateMode === "fixed" && skillHit > 0) {
      const accStat = ssKey === "none" ? 0 : scalingStat;
      accuracy = (accStat * 2) + skillHit;
    }

    // None damage type: force 0 baseDamage so no HP change occurs
    const effectiveBaseDamage = isNoneDamage ? 0 : baseDamage;

    // Resolve attack values
    const result = resolveAttack({
      attackerSystem: system,
      defenderActor,
      element,
      damageType,
      baseDamage: effectiveBaseDamage,
      accuracy,
      critical: system.critical ?? 0,
      defenderEvasion: (isHealing && !targetIsUndead) || isBarrier || noneAutoHit ? 0 : defenderEvasion,
      defenderDef: defValue,
      defenderCritAvoid: (isHealing && !targetIsUndead) || isBarrier || noneAutoHit ? 0 : defenderCritAvoid,
      defenderBlockChance: isHealing || isBarrier || isNoneDamage ? 0 : defenderBlockChance,
      chantModifier,
      isInitiator,
      isHealing,
      weaponItemId: itemId,
      weaponCategory: equippedWeapon?.system?.category ?? null,
      attackerActorId: this.id,
      attackerTokenId: attackerToken?.id ?? null,
      targetTokenId
    });

    // Healing / Barrier / None (without hit mechanics) is auto-hit
    if ((isHealing && !targetIsUndead) || isBarrier || noneAutoHit) {
      result.hitChance = 100;
      result.blockChance = 0;
    }

    // Execute d100 rolls (pass skill item ID so only its inflictions apply)
    await executeCombatRolls(result, system, defenderActor, itemId);

    // Force healing mode if skill is marked as healing (unless target is Undead)
    if (isHealing && !targetIsUndead) result.isHealing = true;
    // Mark barrier mode on result
    if (isBarrier) result.isBarrier = true;

    // Apply buff/debuff ActiveEffect directly (no Apply Damage click needed)
    // Buffs always apply when skill is used (regardless of hit roll)
    const buffDuration = skill.buffDuration ?? 0;
    if (buffDuration > 0) {
      const skillItem = this.items.get(itemId);
      const skillSys = skillItem?.system ?? skill;
      const buffRules = (skillSys.rules ?? []).filter(r => r.key === "Modifier" || r.key === "Status");

      if (buffRules.length) {
        const desc = skillSys.description ?? "";
        const buffRadius = Number(skillSys.aoeSize) || 0;
        const buffFilter = skillSys.aoeTargetFilter || "allies";

        if (buffRadius > 0 && canvas?.tokens) {
          // AoE buff: apply to all matching tokens within radius of caster
          const casterToken = this.token?.object ?? canvas.tokens.placeables.find(t => t.actor?.id === this.id);
          if (casterToken) {
            for (const t of canvas.tokens.placeables) {
              if (!t.actor || t.actor.id === this.id) continue;
              const dist = gridDistance(casterToken, t);
              if (dist > buffRadius) continue;
              // Filter by disposition
              const sameTeam = casterToken.document.disposition === t.document.disposition;
              if (buffFilter === "allies" && !sameTeam) continue;
              if (buffFilter === "enemies" && sameTeam) continue;
              await applyBuffEffect(t.actor, skillName, skillItem?.img, buffDuration, buffRules, desc);
            }
            // Also apply to self if allies filter
            if (buffFilter === "allies" || buffFilter === "all") {
              await applyBuffEffect(this, skillName, skillItem?.img, buffDuration, buffRules, desc);
            }
          }
        } else {
          // Single target buff: apply to the target (healing default to self if no explicit target)
          const targetActor = (skill.targetType === "self" || skill.isHealing) ? this : (defenderActor ?? this);
          if (targetActor) {
            await applyBuffEffect(targetActor, skillName, skillItem?.img, buffDuration, buffRules, desc);
          }
        }
      }
    }

    // Evaluate combat notes (only shown on hit)
    // Weapon-mode skills use the equipped weapon's range; fixed-mode skills default to melee
    const skillNoteContext = {
      system, defenderActor, element: result.element, damageType, isInitiator,
      weaponMinRange: skillMinRange,
      weaponMaxRange: skillMaxRange,
      weaponRangeType: skillRangeType,
      attackDistance: skillAttackDistance,
      weaponItemId: itemId,
      weaponCategory: equippedWeapon?.system?.category ?? null
    };
    const combatNotes = result.hit
      ? evaluateCombatNotes(system._ruleCache?.combatNotes ?? [], skillNoteContext)
      : [];

    // Build template data
    const elementTierLabel = getElementalTierLabel(result.elementTier);
    const successfulStatuses = result.statusResults.filter(s => s.success);

    // Build damage formula breakdown for collapsible section
    const scalingLabel = ssKey === "auto"
      ? ((damageType === "magical" || damageType === "healing" || damageType === "barrier" || damageType === "retaliatory") ? "MAG" : "STR")
      : ssKey.toUpperCase();
    const formulaSteps = [];
    if (skill.baseRateMode === "weapon") {
      const weapon = this.items.find(i => i.type === "weapon" && i.system.equipped && i.system.equipSlot !== "offhand");
      formulaSteps.push({ label: `${weapon?.name ?? "Unarmed"} Damage`, value: weapon?.system?.might ?? 0 });
      if (ssKey !== "none") formulaSteps.push({ label: scalingLabel, value: scalingStat });
      if ((skill.baseRate ?? 0) > 0) {
        formulaSteps.push({ label: "Bonus Damage", value: skill.baseRate ?? 0 });
      }
    } else {
      formulaSteps.push({ label: "Base Damage", value: skill.baseRate ?? 0 });
      if (ssKey !== "none") formulaSteps.push({ label: scalingLabel, value: scalingStat });
    }
    const skillTargetType = skill.targetType || "single";

    const templateData = {
      actorName: this.name,
      actorImg: this.img,
      isSkill: true,
      skillName,
      targetType: skillTargetType,
      damageType,
      element: result.element,
      hitRoll: result.hitRoll,
      hitChance: result.hitChance,
      hit: result.hit,
      critRoll: result.critRoll,
      critChance: result.critChance,
      critHit: result.critHit,
      blockRoll: result.blockRoll,
      blockChance: result.blockChance,
      blocked: result.blocked,
      finalDamage: result.finalDamage,
      baseDamage: result.baseDamage,
      defReduction: result.defReduction,
      rawDamage: result.rawDamage,
      damageBonusTotal: result.damageBonusTotal,
      elementTier: result.elementTier,
      elementTierLabel,
      isHealing: result.isHealing,
      isBarrier: result.isBarrier || false,
      isRetaliatory: result.isRetaliatory || false,
      impairApplied: result.impairApplied || false,
      exposeApplied: result.exposeApplied || false,
      mpCost,
      chantLabel: chantMode !== "normal" ? chantLabel : "",
      chantModifier: chantMode !== "normal" ? chantModifier : null,
      statusResults: result.statusResults,
      combatNotes,
      attackerTokenId: attackerToken?.id ?? "",
      targetTokenId,
      targetName: defenderActor?.name ?? "Target",
      defenderImg: defenderActor?.img ?? "icons/svg/mystery-man.svg",
      formulaSteps,
      elementMultiplier: result.elementMultiplier !== 1.0 ? result.elementMultiplier : null,
      statusDataJson: successfulStatuses.length
        ? JSON.stringify(successfulStatuses.map(s => ({ status: s.status, duration: s.duration })))
          .replace(/"/g, "&quot;")
        : "",
      isHostile: !!defenderActor && !defenderActor.hasPlayerOwner
    };

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/manashard/templates/chat/attack-result.hbs",
      templateData
    );

    // Show VS splash overlay before posting chat card
    if (defenderActor && game.settings.get("manashard", "showVsSplash")) {
      await showVsSplash({
        attackerName: this.name,
        attackerImg: this.img,
        defenderName: defenderActor.name,
        defenderImg: defenderActor.img ?? "icons/svg/mystery-man.svg",
        actionLabel: `casts ${skillName}`,
        element: result.element,
        isHostile: !defenderActor.hasPlayerOwner,
        hit: result.hit,
        critHit: result.critHit,
        blocked: result.blocked,
        finalDamage: result.finalDamage,
        isHealing: result.isHealing,
        isBarrier: result.isBarrier || false,
        isRetaliatory: result.isRetaliatory || false,
        defenderHpBefore: defenderActor.system.stats.hp.value,
        defenderHpMax: defenderActor.system.stats.hp.max,
        defenderBarrier: defenderActor.system.stats.hp.barrier ?? 0,
        statusResults: result.statusResults
      });
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content,
      rolls: result._rolls
    });

    return result;
  }

  /**
   * Roll an AOE skill attack against multiple targets.
   * Computes base damage/accuracy once, then resolves per-target defense individually.
   * Posts a single multi-target chat card.
   * @param {object} options
   * @param {object} options.skill - The skill system data
   * @param {string} options.skillName - Display name of the skill
   * @param {string} options.chantMode - Chant mode key
   * @param {Array<{token: Token, actor: Actor}>} options.targets - AOE targets
   * @param {number} options.mpCost - MP already deducted
   * @param {string} options.aoeShape - "circle" | "line" | "cross"
   * @param {number} options.aoeSize - Shape size parameter
   */
  async rollAoeSkillAttack({
    skill, skillName = "Skill",
    chantMode = "normal",
    targets = [],
    mpCost = 0,
    aoeShape = "circle",
    aoeSize = 1,
    itemId = null
  } = {}) {
    const system = this.system;
    const chant = CONFIG.MANASHARD.chantModes[chantMode];
    const chantModifier = chant?.effectModifier ?? 1.0;
    const chantLabel = chant ? game.i18n.localize(chant.label) : "";

    // Determine element and damage type from skill
    const element = skill.element || "";
    const damageType = skill.damageType || "none";

    // Compute base damage ONCE (shared across all targets)
    const isWeaponMode = skill.baseRateMode === "weapon";
    const equippedWeapon = this.items.find(i => i.type === "weapon" && i.system.equipped && i.system.equipSlot !== "offhand");
    let effectiveBaseRate = skill.baseRate ?? 0;
    if (isWeaponMode) {
      effectiveBaseRate += equippedWeapon?.system?.might ?? 0;
    }

    // Resolve scaling stat
    const ssKey = skill.scalingStat ?? "auto";
    let scalingStat = 0;
    if (ssKey === "auto") {
      scalingStat = (damageType === "magical" || damageType === "healing" || damageType === "barrier")
        ? (system.stats?.mag?.value ?? 0)
        : (system.stats?.str?.value ?? 0);
    } else if (ssKey !== "none") {
      scalingStat = system.stats?.[ssKey]?.value ?? 0;
    }
    const baseDamage = effectiveBaseRate + scalingStat;

    // Compute accuracy ONCE
    // Fixed-mode skills use their scaling stat for accuracy instead of AGI
    let accuracy = system.accuracy ?? 0;
    const skillHitVal = skill.skillHit ?? 0;
    if (skill.baseRateMode === "fixed" && skillHitVal > 0) {
      const accStat = ssKey === "none" ? 0 : scalingStat;
      accuracy = (accStat * 2) + skillHitVal;
    }

    const isHealing = skill.isHealing ?? false;
    const isBarrier = skill.isBarrier ?? false;
    const isRetaliatory = skill.isRetaliatory ?? false;
    const isNoneDamage = damageType === "none";
    const noneHasHitMechanics = isNoneDamage && (skill.baseRateMode === "weapon" || (skill.baseRateMode === "fixed" && (skill.skillHit ?? 0) > 0));
    const noneAutoHit = isNoneDamage && !noneHasHitMechanics;
    const isInitiator = game.combat?.combatant?.actorId === this.id;

    // ── Retaliatory AoE early-return: apply buff to all targets, no damage rolls ──
    if (isRetaliatory) {
      const retMode2 = skill.retaliationMode ?? "flat";
      let retaliationValue = 0;
      if (retMode2 === "flat") {
        retaliationValue = baseDamage;
      } else if (retMode2 === "percent") {
        retaliationValue = skill.baseRate ?? 0;
      } else if (retMode2 === "stat") {
        retaliationValue = baseDamage;
      }

      const buffDuration = skill.buffDuration ?? 0;
      if (buffDuration > 0) {
        const skillItem = this.items.get(itemId);
        const skillSys = skillItem?.system ?? skill;
        const buffRules = (skillSys.rules ?? []).filter(r => r.key === "Modifier" || r.key === "Status");
        const desc = skillSys.description ?? "";
        const retaliationFlags = {
          retaliatory: true,
          retaliationMode: retMode2,
          retaliationValue,
          retaliationStat: skill.scalingStat ?? "auto",
          retaliationCasterId: this.id
        };

        for (const { token, actor: defenderActor } of targets) {
          if (!defenderActor) continue;
          await applyBuffEffect(defenderActor, skillName, skillItem?.img, buffDuration, buffRules, desc, retaliationFlags);
        }
      }

      const retStatLabel = (skill.scalingStat ?? "auto") === "auto" ? "MAG" : (skill.scalingStat ?? "mag").toUpperCase();
      const targetNames = targets.map(t => t.actor?.name).filter(Boolean).join(", ");
      const skillItemForCard = this.items.get(itemId);

      const content = await foundry.applications.handlebars.renderTemplate(
        "systems/manashard/templates/chat/retaliate-buff-card.hbs",
        {
          actorName: this.name,
          actorImg: this.img,
          skillName,
          skillImg: skillItemForCard?.img ?? "icons/svg/aura.svg",
          mpCost,
          targetName: targetNames || this.name,
          element: skill.element || "",
          retaliationMode: retMode2,
          retaliationValue,
          retaliationStatLabel: retStatLabel,
          buffDuration: skill.buffDuration ?? 0
        }
      );
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content
      });

      return [];
    }

    // Build formula steps (shared display)
    const scalingLabel = ssKey === "auto"
      ? ((damageType === "magical" || damageType === "healing" || damageType === "barrier") ? "MAG" : "STR")
      : ssKey.toUpperCase();
    const formulaSteps = [];
    if (isWeaponMode) {
      formulaSteps.push({ label: `${equippedWeapon?.name ?? "Unarmed"} Damage`, value: equippedWeapon?.system?.might ?? 0 });
      if (ssKey !== "none") formulaSteps.push({ label: scalingLabel, value: scalingStat });
      if ((skill.baseRate ?? 0) > 0) formulaSteps.push({ label: "Bonus Damage", value: skill.baseRate ?? 0 });
    } else {
      formulaSteps.push({ label: "Base Damage", value: skill.baseRate ?? 0 });
      if (ssKey !== "none") formulaSteps.push({ label: scalingLabel, value: scalingStat });
    }
    // Resolve per-target
    const targetResults = [];
    const allRolls = [];

    for (const { token, actor: defenderActor } of targets) {
      // ── Target restriction check (per target) ──
      if (defenderActor) {
        const restriction = checkTargetRestrictions(system, defenderActor, itemId);
        if (!restriction.allowed) continue; // Silently skip restricted targets in AoE
      }

      const defSys = defenderActor?.system;
      const defenderEvasion = defSys ? (damageType === "magical" ? defSys.meva : defSys.peva) : 0;
      const defenderDef = defSys?.pdef ?? 0;
      const defenderSpi = defSys?.mdef ?? 0;
      let defValue = damageType === "magical" ? defenderSpi : defenderDef;

      // Healing / None: skip defense unless target is Undead
      const targetIsUndead = defSys?.creatureType?.includes?.("undead") ?? false;
      if ((isHealing && !targetIsUndead) || isBarrier || isNoneDamage) defValue = 0;

      const result = resolveAttack({
        attackerSystem: system,
        defenderActor,
        element,
        damageType,
        baseDamage: isNoneDamage ? 0 : baseDamage,
        accuracy,
        critical: system.critical ?? 0,
        defenderEvasion: (isHealing && !targetIsUndead) || isBarrier || noneAutoHit ? 0 : defenderEvasion,
        defenderDef: defValue,
        defenderCritAvoid: 0,
        defenderBlockChance: 0,
        chantModifier,
        isInitiator,
        isHealing,
        weaponItemId: itemId,
        weaponCategory: equippedWeapon?.system?.category ?? null,
        attackerActorId: this.id,
        attackerTokenId: this.token?.object?.id ?? null,
        targetTokenId: token?.id ?? null
      });

      // Healing / Barrier / None (without hit mechanics) auto-hit
      if ((isHealing && !targetIsUndead) || isBarrier || noneAutoHit) {
        result.hitChance = 100;
        result.blockChance = 0;
      }

      // Execute d100 rolls (pass skill item ID so only its inflictions apply)
      await executeCombatRolls(result, system, defenderActor, itemId);

      if (isHealing && !targetIsUndead) result.isHealing = true;
      if (isBarrier) result.isBarrier = true;

      // Apply buff/debuff ActiveEffect directly per target
      const aoeBuffDuration = skill.buffDuration ?? 0;
      if (aoeBuffDuration > 0 && defenderActor) {
        const skillItem = this.items.get(itemId);
        const buffRules = (skillItem?.system?.rules ?? []).filter(r => r.key === "Modifier" || r.key === "Status");
        if (buffRules.length) {
          const desc = skillItem?.system?.description ?? "";
          await applyBuffEffect(defenderActor, skillName, skillItem?.img, aoeBuffDuration, buffRules, desc);
        }
      }

      // Collect rolls for the ChatMessage
      if (result._rolls) allRolls.push(...result._rolls);

      const successfulStatuses = result.statusResults.filter(s => s.success);
      const elementTierLabel = getElementalTierLabel(result.elementTier);

      targetResults.push({
        targetName: defenderActor?.name ?? "Target",
        targetImg: defenderActor?.img ?? "icons/svg/mystery-man.svg",
        targetTokenId: token?.id ?? null,
        hit: result.hit,
        hitRoll: result.hitRoll,
        hitChance: result.hitChance,
        critRoll: result.critRoll,
        critChance: result.critChance,
        critHit: result.critHit,
        blockRoll: result.blockRoll,
        blockChance: result.blockChance,
        blocked: result.blocked,
        finalDamage: result.finalDamage,
        baseDamage: result.baseDamage,
        defReduction: result.defReduction,
        rawDamage: result.rawDamage,
        damageBonusTotal: result.damageBonusTotal,
        elementTier: result.elementTier,
        elementTierLabel,
        elementMultiplier: result.elementMultiplier !== 1.0 ? result.elementMultiplier : null,
        isHealing: result.isHealing,
        isBarrier: result.isBarrier || false,
        impairApplied: result.impairApplied || false,
        exposeApplied: result.exposeApplied || false,
        statusResults: result.statusResults,
        statusDataJson: successfulStatuses.length
          ? JSON.stringify(successfulStatuses.map(s => ({ status: s.status, duration: s.duration }))).replace(/"/g, "&quot;")
          : ""
      });
    }

    // Summary stats
    const hitCount = targetResults.filter(r => r.hit).length;
    const totalCount = targetResults.length;

    // Attacker token ID for retaliation
    const aoeAttackerToken = this.token?.object ?? canvas.tokens?.placeables.find(t => t.actor?.id === this.id);
    const aoeAttackerTokenId = aoeAttackerToken?.id ?? "";

    // Shape labels
    const shapeLabels = { circle: "Circle", line: "Line", cross: "Cross" };

    const templateData = {
      actorName: this.name,
      actorImg: this.img,
      skillName,
      damageType,
      element,
      mpCost,
      chantLabel: chantMode !== "normal" ? chantLabel : "",
      chantModifier: chantMode !== "normal" ? chantModifier : null,
      isHealing,
      aoeShape: shapeLabels[aoeShape] ?? aoeShape,
      aoeSize,
      hitCount,
      totalCount,
      attackerTokenId: aoeAttackerTokenId,
      targets: targetResults,
      formulaSteps
    };

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/manashard/templates/chat/aoe-attack-result.hbs",
      templateData
    );

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content,
      rolls: allRolls
    });

    return targetResults;
  }

  /**
   * Process start-of-turn effects: status DoTs/heals, MP regen,
   * and status duration decrement. All status processing fires at turn start.
   * Called by ManashardCombat when this actor's turn begins.
   *
   * Turn-start automation order:
   * 1. Burn damage (2 HP)
   * 2. Stun: skip turn (post chat, signal advance)
   * 3. Beguile: forced ally-attack
   * 4. Base MP Regen (from equipment/stats — derived stat, not a status)
   * 5. Duration decrement + removal of expired statuses
   */
  async processStartOfTurn() {
    const system = this.system;
    const statuses = new Set(system.statusEffects ?? []);
    const hp = system.stats.hp;
    const effects = [];

    // --- Stun: skip entire turn ---
    if (statuses.has("stun")) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="manashard turn-effects-card">
          <div class="acc-header">
            <div class="acc-portrait-frame">
              <div class="acc-portrait-diamond">
                <img src="${this.img}" class="acc-portrait" />
              </div>
            </div>
            <div class="acc-header-text">
              <span class="acc-actor-name">${this.name}</span>
              <span class="acc-action">is stunned!</span>
            </div>
          </div>
          <div class="turn-effects-body">
            <div class="turn-effect-line turn-effect-damage">
              <i class="fas fa-star"></i>
              <span class="turn-effect-label">Stun</span>
              <span class="turn-effect-value">Turn skipped</span>
            </div>
          </div>
        </div>`
      });

      // Duration decrements happen at end of turn (handled by combat.endTurn)
      return { stunned: true };
    }

    // --- Blight: 2 HP DoT (barrier absorbs first) ---
    if (statuses.has("blight")) {
      const currentHp = this.system.stats.hp.value;
      const currentBarrier = this.system.stats.hp.barrier ?? 0;
      const blightDmg = Math.min(2, currentHp + currentBarrier);
      if (blightDmg > 0) {
        const barrierAbsorbed = Math.min(currentBarrier, blightDmg);
        const hpDmg = blightDmg - barrierAbsorbed;
        const updateData = {};
        if (barrierAbsorbed > 0) updateData["system.stats.hp.barrier"] = currentBarrier - barrierAbsorbed;
        if (hpDmg > 0) updateData["system.stats.hp.value"] = currentHp - hpDmg;
        if (Object.keys(updateData).length) await this.update(updateData);
        effects.push({ type: "damage", label: "Blight", value: blightDmg, icon: "fas fa-biohazard", stat: "HP" });
      }
    }

    // --- Beguile: forced basic attack on nearest ally ---
    if (statuses.has("beguile")) {
      effects.push({ type: "damage", label: "Beguile", value: 0, icon: "fas fa-heart-crack", stat: "Forced ally attack" });
      // Note: actual auto-attack targeting is handled by the combat tracker UI;
      // this just posts the notification. The beguiled actor must attack their
      // nearest ally with a basic weapon attack (no skills).
    }

    // Base MP Regen (from equipment/stats — derived stat, not a status)
    {
      const currentMp = this.system.stats.mp.value;
      const mpMax = this.system.stats.mp.max;
      const regen = system.mpRegen ?? 0;
      if (regen > 0 && currentMp < mpMax) {
        const actual = Math.min(regen, mpMax - currentMp);
        await this.update({ "system.stats.mp.value": currentMp + actual });
        effects.push({ type: "heal", label: "MP Regen", value: actual, icon: "fas fa-sparkles", stat: "MP" });
      }
    }

    // Post a combined chat card for all turn-start effects
    if (effects.length > 0) {
      const lines = effects.map(e => {
        const sign = e.type === "damage" ? "-" : "+";
        const cls = e.type === "damage" ? "turn-effect-damage" : "turn-effect-heal";
        return `<div class="turn-effect-line ${cls}">
          <i class="${e.icon}"></i>
          <span class="turn-effect-label">${e.label}</span>
          <span class="turn-effect-value">${sign}${e.value} ${e.stat}</span>
        </div>`;
      }).join("");

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="manashard turn-effects-card">
          <div class="acc-header">
            <div class="acc-portrait-frame">
              <div class="acc-portrait-diamond">
                <img src="${this.img}" class="acc-portrait" />
              </div>
            </div>
            <div class="acc-header-text">
              <span class="acc-actor-name">${this.name}</span>
              <span class="acc-action">turn start</span>
            </div>
          </div>
          <div class="turn-effects-body">${lines}</div>
        </div>`
      });
    }

    // Duration decrements happen at end of turn (handled by combat.endTurn)
  }

  /**
   * Process end-of-turn effects: decrement status and buff durations,
   * remove expired effects. Called by ManashardCombat.endTurn().
   *
   * By decrementing at end-of-turn rather than start-of-turn, buffs and
   * debuffs are active for the unit's full turn before wearing off.
   */
  async processEndOfTurn() {
    // Decrement status durations and remove expired effects
    const removed = await this.decrementStatusDurations();
    if (removed.length > 0) {
      const statuses = removed.map(key => {
        const cfg = CONFIG.MANASHARD.statusEffects?.[key];
        const label = cfg ? (game.i18n?.localize(cfg.label) ?? key) : key;
        const icon = CONFIG.MANASHARD.statusIcons?.[key] ?? "fas fa-circle-xmark";
        return { icon, label, tag: "EXPIRED" };
      });
      const content = await foundry.applications.handlebars.renderTemplate(
        "systems/manashard/templates/chat/status-removal.hbs",
        { actorName: this.name, actorImg: this.img ?? "icons/svg/mystery-man.svg", source: "expired", statuses }
      );
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content });
    }

    // Decrement buff/debuff ActiveEffect durations
    await this.decrementBuffDurations();
  }

  /**
   * Decrement all active status effect durations by 1.
   * Removes statuses that reach 0. Called at end of turn.
   */
  async decrementStatusDurations() {
    const current = new Set(this.system.statusEffects ?? []);
    const durations = foundry.utils.deepClone(this.getFlag("manashard", "statusDurations") ?? {});
    const removed = [];

    for (const [key, turns] of Object.entries(durations)) {
      // Clean up stale entries for statuses already removed (e.g. via Purify)
      if (!current.has(key)) {
        delete durations[key];
        continue;
      }
      durations[key] = turns - 1;
      if (durations[key] <= 0) {
        current.delete(key);
        delete durations[key];
        removed.push(key);
      }
    }

    if (removed.length > 0) {
      await this.update({ "system.statusEffects": [...current] });
    }
    await this.setFlag("manashard", "statusDurations", durations);
    return removed;
  }

  /**
   * Decrement all buff/debuff ActiveEffect durations by 1.
   * Removes effects that reach 0. Called at turn start after status decrements.
   */
  async decrementBuffDurations() {
    const buffEffects = this.effects.filter(e =>
      e.getFlag("manashard", "buffDebuff") && !e.disabled
    );
    const toDelete = [];
    const removed = [];

    for (const effect of buffEffects) {
      let dur = effect.getFlag("manashard", "duration");
      if (dur === undefined || dur === null) continue;
      dur -= 1;
      if (dur <= 0) {
        toDelete.push(effect.id);
        removed.push(effect.name);
      } else {
        await effect.setFlag("manashard", "duration", dur);
      }
    }

    if (toDelete.length) {
      await this.deleteEmbeddedDocuments("ActiveEffect", toDelete);
    }
    return removed;
  }

  /**
   * Override Foundry's toggleStatusEffect so that token HUD clicks route through
   * system.statusEffects (our source of truth) instead of creating AEs directly.
   * @param {string} statusId - Status effect key
   * @param {object} [options]
   * @param {boolean} [options.active] - Force active/inactive state
   * @param {boolean} [options.overlay] - Foundry overlay flag (passed to super)
   * @param {number} [options.duration] - Override duration (e.g., from level-scaled infliction)
   * @override
   */
  async toggleStatusEffect(statusId, { active, overlay, duration } = {}) {
    const cfg = CONFIG.MANASHARD?.statusEffects?.[statusId];
    if (!cfg) return super.toggleStatusEffect(statusId, { active, overlay });

    const current = new Set(this.system.statusEffects ?? []);
    const durations = foundry.utils.deepClone(this.getFlag("manashard", "statusDurations") ?? {});
    const shouldBeActive = active ?? !current.has(statusId);

    if (shouldBeActive && !current.has(statusId)) {
      current.add(statusId);
      durations[statusId] = duration ?? cfg.duration ?? 3;
    } else if (!shouldBeActive && current.has(statusId)) {
      current.delete(statusId);
      delete durations[statusId];
    } else {
      return; // No change needed
    }

    await this.update({ "system.statusEffects": [...current] });
    await this.setFlag("manashard", "statusDurations", durations);
  }

  /**
   * Remove a specific status effect from this actor.
   * @param {string} statusKey - The status key to remove (e.g., "poison", "burn")
   * @returns {boolean} Whether the status was actually removed
   */
  async removeStatus(statusKey) {
    const current = new Set(this.system.statusEffects ?? []);
    if (!current.has(statusKey)) return false;

    current.delete(statusKey);
    const durations = foundry.utils.deepClone(this.getFlag("manashard", "statusDurations") ?? {});
    delete durations[statusKey];

    await this.update({ "system.statusEffects": [...current] });
    await this.setFlag("manashard", "statusDurations", durations);
    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  // CONSUMABLE USAGE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Use a consumable item from this actor's inventory, posting a chat card.
   * The chat card includes an Apply button that heals HP/MP based on the
   * item's restoreType and restoreAmount fields.
   * @param {string} itemId - The consumable item's ID on this actor
   * @param {string|null} targetTokenId - Target token ID (null = self)
   */
  async useConsumable(itemId, targetTokenId = null) {
    const item = this.items.get(itemId);
    if (!item || item.type !== "consumable") {
      ui.notifications.warn("Invalid consumable item.");
      return;
    }

    if (item.system.quantity <= 0) {
      ui.notifications.warn(`${item.name}: No remaining uses.`);
      return;
    }

    // Resolve target
    const selfToken = this.token?.object ?? canvas.tokens?.placeables.find(t => t.actor?.id === this.id);
    const targetType = item.system.targetType ?? "self";
    let targetToken = null;
    let targetName = this.name;

    if (targetType === "self") {
      targetToken = selfToken;
      targetName = this.name;
    } else if (targetTokenId) {
      targetToken = canvas.tokens?.get(targetTokenId);
      targetName = targetToken?.actor?.name ?? "Unknown";
    } else {
      const targets = game.user.targets;
      if (targets.size === 1) {
        targetToken = targets.first();
        targetName = targetToken?.actor?.name ?? "Unknown";
      } else if (targets.size === 0 && targetType === "single") {
        targetToken = selfToken;
        targetName = this.name;
      } else {
        ui.notifications.warn("Select a single target to use this item on.");
        return;
      }
    }

    const restoreType = item.system.restoreType ?? "hp";
    const restoreAmount = Number(item.system.restoreAmount) || 0;
    const categoryLabel = game.i18n.localize(CONFIG.MANASHARD.consumableCategories[item.system.category] ?? "") || item.system.category;

    const templateData = {
      actorName: this.name,
      actorImg: this.img ?? "icons/svg/mystery-man.svg",
      itemName: item.name,
      itemImg: item.img,
      itemId: item.id,
      categoryLabel,
      targetName: targetType !== "self" ? targetName : null,
      targetTokenId: targetToken?.id ?? null,
      userActorId: this.id,
      restoreType,
      restoreAmount,
      remaining: item.system.consumedOnUse ? Math.max(0, item.system.quantity - 1) : item.system.quantity,
      consumed: item.system.consumedOnUse ? "true" : "false",
      applied: false
    };

    const content = await renderTemplate(
      "systems/manashard/templates/chat/consumable-use.hbs",
      templateData
    );

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content
    });
  }
}

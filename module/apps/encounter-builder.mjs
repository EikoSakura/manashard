const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
import { calculateCombatEXP } from "../helpers/combat.mjs";

/**
 * Encounter Builder — a GM tool for creating threat actors and planning tactical missions.
 * Two tabs: Threat Builder (enemy creation) and Mission Planner (encounter composition).
 */
export class EncounterBuilder extends HandlebarsApplicationMixin(ApplicationV2) {

  /* ─── Tab Definitions ─────────────────────────────────────── */

  static TABS = [
    { id: "threat",    label: "MANASHARD.EncBuilder.TabThreat",    icon: "fa-dragon" },
    { id: "encounter", label: "MANASHARD.EncBuilder.TabMission",   icon: "fa-swords" }
  ];

  /* ─── ApplicationV2 Options ───────────────────────────────── */

  static PARTS = {
    shell: { template: "systems/manashard/templates/apps/encounter-builder.hbs" }
  };

  static DEFAULT_OPTIONS = {
    id: "encounter-builder",
    classes: ["manashard", "encounter-builder"],
    position: { width: 960, height: 760 },
    window: {
      title: "MANASHARD.EncBuilder.Title",
      resizable: true,
      icon: "fas fa-helmet-battle"
    },
    tag: "div",
    actions: {
      // Tab
      switchTab:          EncounterBuilder.#onSwitchTab,

      // Threat Builder
      editImage:          EncounterBuilder.#onEditImage,
      applySuggestion:    EncounterBuilder.#onApplySuggestion,
      cycleElementTier:   EncounterBuilder.#onCycleElementTier,
      cycleStatusTier:    EncounterBuilder.#onCycleStatusTier,
      toggleMovement:     EncounterBuilder.#onToggleMovement,
      addCreatureType:    EncounterBuilder.#onAddCreatureType,
      removeCreatureType: EncounterBuilder.#onRemoveCreatureType,
      addLootRow:         EncounterBuilder.#onAddLootRow,
      removeLootRow:      EncounterBuilder.#onRemoveLootRow,
      removeEquipment:    EncounterBuilder.#onRemoveEquipment,
      removeSkill:        EncounterBuilder.#onRemoveSkill,
      saveThreat:         EncounterBuilder.#onSaveThreat,
      loadThreat:         EncounterBuilder.#onLoadThreat,
      clearThreat:        EncounterBuilder.#onClearThreat,

      // Mission Planner
      removeEnemy:         EncounterBuilder.#onRemoveEnemy,
      adjustEnemyCount:    EncounterBuilder.#onAdjustEnemyCount,
      applyTemplate:       EncounterBuilder.#onApplyTemplate,
      deployToScene:       EncounterBuilder.#onDeployToScene,
      saveEncounter:       EncounterBuilder.#onSaveEncounter,
      loadEncounter:       EncounterBuilder.#onLoadEncounter,
      refreshParty:        EncounterBuilder.#onRefreshParty,
      clearEncounter:      EncounterBuilder.#onClearEncounter,
      addZone:             EncounterBuilder.#onAddZone,
      removeZone:          EncounterBuilder.#onRemoveZone,
      addWave:             EncounterBuilder.#onAddWave,
      removeWave:          EncounterBuilder.#onRemoveWave,
      removeWaveEnemy:     EncounterBuilder.#onRemoveWaveEnemy,
      adjustWaveEnemyCount: EncounterBuilder.#onAdjustWaveEnemyCount,
      toggleAmbush:        EncounterBuilder.#onToggleAmbush
    },
    dragDrop: []
  };

  /* ─── Private State ───────────────────────────────────────── */

  #activeTab = "threat";

  #threatState = null;
  #encounterState = null;

  /* ─── Singleton ───────────────────────────────────────────── */



  static open() {
    const existing = foundry.applications.instances.get("encounter-builder");
    if (existing) {
      existing.close();
      return;
    }
    new EncounterBuilder().render(true);
  }

  /* ─── Constructor ─────────────────────────────────────────── */

  constructor(options = {}) {
    super(options);
    this.#threatState = this.#createDefaultThreatState();
    this.#encounterState = this.#createDefaultEncounterState();
  }

  /* ─── Lifecycle ───────────────────────────────────────────── */

  _onClose() {
    super._onClose?.();
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Wire text/number inputs for threat builder
    if (this.#activeTab === "threat") {
      this.#wireThreatInputs();
    } else {
      this.#wireEncounterInputs();
    }

    // Wire drag-and-drop manually on each drop zone
    this.#wireDropZone(".eb-equipment-zone", (data) => this.#handleEquipmentDrop(data));
    this.#wireDropZone(".eb-skills-zone", (data) => this.#handleSkillDrop(data));
    this.#wireDropZone(".eb-loot-zone", (data) => this.#handleLootDrop(data));

    // Per-zone drop zones in mission planner
    this.element?.querySelectorAll(".eb-zone-drop")?.forEach(zone => {
      const zoneIdx = parseInt(zone.dataset.zoneIndex);
      this.#wireDropZone(zone, (data) => this.#handleZoneDrop(data, zoneIdx));
    });

    // Per-wave drop zones in mission planner
    this.element?.querySelectorAll(".eb-wave-drop")?.forEach(zone => {
      const waveIdx = parseInt(zone.dataset.waveIndex);
      this.#wireDropZone(zone, (data) => this.#handleWaveDrop(data, waveIdx));
    });
  }

  /* ─── Drop Zone Wiring ────────────────────────────────────── */

  /**
   * Bind dragover/dragleave/drop to a zone element. Parses drop data and calls handler.
   */
  #wireDropZone(selectorOrElement, handler) {
    const zone = typeof selectorOrElement === "string"
      ? this.element?.querySelector(selectorOrElement)
      : selectorOrElement;
    if (!zone) return;

    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      zone.classList.add("drop-target-highlight");
    });

    zone.addEventListener("dragleave", (e) => {
      // Only remove highlight when actually leaving the zone, not entering a child
      if (!zone.contains(e.relatedTarget)) {
        zone.classList.remove("drop-target-highlight");
      }
    });

    zone.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove("drop-target-highlight");

      let data;
      try {
        data = JSON.parse(e.dataTransfer.getData("text/plain"));
      } catch {
        return;
      }
      await handler(data);
    });
  }

  async #handleEquipmentDrop(data) {
    if (data.type !== "Item") return;
    const item = await fromUuid(data.uuid);
    if (!item || !["weapon", "armor", "accessory"].includes(item.type)) {
      ui.notifications.warn("Only weapons, armor, and accessories can be added as equipment.");
      return;
    }
    // Avoid duplicates
    if (this.#threatState.equipment.some(e => e.uuid === data.uuid)) {
      ui.notifications.info(`${item.name} is already equipped.`);
      return;
    }
    this.#threatState.equipment.push({
      uuid: data.uuid, name: item.name, img: item.img,
      type: item.type, system: item.system.toObject ? item.system.toObject() : { ...item.system }
    });
    this.#renderPreservingScroll();
  }

  async #handleSkillDrop(data) {
    if (data.type !== "Item") return;
    const item = await fromUuid(data.uuid);
    if (!item || item.type !== "manacite") {
      ui.notifications.warn(game.i18n.localize("MANASHARD.EncBuilder.WarnOnlyManacite"));
      return;
    }

    // Job Manacite → extract granted skills from its Grant rules
    if (item.system.manaciteType === "job") {
      const grantRules = (item.system.rules ?? []).filter(r =>
        (r.key === "Grant" && r.subtype === "item") || r.key === "GrantItem"
      );
      let added = 0;
      for (const rule of grantRules) {
        // For choice grants, resolve all options; for fixed grants, use the single UUID
        const uuids = rule.choiceMode && rule.choices?.length
          ? rule.choices.map(c => c.uuid).filter(Boolean)
          : [rule.uuid];
        for (const uuid of uuids) {
          if (!uuid) continue;
          const skill = await fromUuid(uuid);
          if (!skill || skill.type !== "manacite" || skill.system.manaciteType !== "skill") continue;
          if (this.#threatState.skills.some(s => s.uuid === uuid)) continue;
          this.#threatState.skills.push({
            uuid, name: skill.name, img: skill.img,
            system: skill.system.toObject ? skill.system.toObject() : { ...skill.system }
          });
          added++;
        }
      }
      if (added > 0) {
        ui.notifications.info(game.i18n.format("MANASHARD.EncBuilder.JobSkillsAdded", { count: added, job: item.name }));
        this.#renderPreservingScroll();
      } else {
        ui.notifications.warn(game.i18n.format("MANASHARD.EncBuilder.JobNoSkills", { job: item.name }));
      }
      return;
    }

    // Skill Manacite → add directly
    if (item.system.manaciteType !== "skill") {
      ui.notifications.warn(game.i18n.localize("MANASHARD.EncBuilder.WarnOnlyManacite"));
      return;
    }
    if (this.#threatState.skills.some(e => e.uuid === data.uuid)) {
      ui.notifications.info(`${item.name} is already added.`);
      return;
    }
    this.#threatState.skills.push({
      uuid: data.uuid, name: item.name, img: item.img,
      system: item.system.toObject ? item.system.toObject() : { ...item.system }
    });
    this.#renderPreservingScroll();
  }

  async #handleLootDrop(data) {
    if (data.type !== "Item") return;
    const item = await fromUuid(data.uuid);
    if (!item) return;
    if (this.#threatState.lootTable.some(l => l.uuid === data.uuid)) {
      ui.notifications.info(`${item.name} is already in the loot table.`);
      return;
    }
    this.#threatState.lootTable.push({
      uuid: data.uuid, itemName: item.name, img: item.img,
      itemId: "", chance: 50, stolen: false
    });
    this.#renderPreservingScroll();
  }

  async #handleZoneDrop(data, zoneIndex) {
    if (data.type !== "Actor") return;
    const actor = await fromUuid(data.uuid);
    if (!actor || actor.type !== "threat") {
      ui.notifications.warn("Only Threat actors can be added.");
      return;
    }
    const zone = this.#encounterState.zones[zoneIndex];
    if (!zone) return;
    const existing = zone.enemies.find(e => e.uuid === data.uuid);
    if (existing) {
      existing.count++;
    } else {
      const sys = actor.system;
      zone.enemies.push({
        uuid: data.uuid, actorId: actor.id, name: actor.name, img: actor.img,
        level: sys.level, rank: sys.rank, role: sys.role, count: 1,
        threatLevel: this.#calculateThreatLevel(sys.level, sys.rank, sys.role)
      });
    }
    this.#renderPreservingScroll();
  }

  async #handleWaveDrop(data, waveIndex) {
    if (data.type !== "Actor") return;
    const actor = await fromUuid(data.uuid);
    if (!actor || actor.type !== "threat") {
      ui.notifications.warn("Only Threat actors can be added.");
      return;
    }
    const wave = this.#encounterState.waves[waveIndex];
    if (!wave) return;
    const existing = wave.enemies.find(e => e.uuid === data.uuid);
    if (existing) {
      existing.count++;
    } else {
      const sys = actor.system;
      wave.enemies.push({
        uuid: data.uuid, actorId: actor.id, name: actor.name, img: actor.img,
        level: sys.level, rank: sys.rank, role: sys.role, count: 1,
        threatLevel: this.#calculateThreatLevel(sys.level, sys.rank, sys.role)
      });
    }
    this.#renderPreservingScroll();
  }

  /* ─── Scroll-Preserving Render ────────────────────────────── */

  async #renderPreservingScroll() {
    const scrollable = this.element?.querySelector(".eb-content");
    const scrollTop = scrollable?.scrollTop ?? 0;
    await this.render(true);
    const newScrollable = this.element?.querySelector(".eb-content");
    if (newScrollable) newScrollable.scrollTop = scrollTop;
  }

  /* ─── Context Preparation ─────────────────────────────────── */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const cfg = CONFIG.MANASHARD;

    // Tabs
    context.tabs = EncounterBuilder.TABS.map(t => ({
      ...t,
      label: game.i18n.localize(t.label),
      active: t.id === this.#activeTab
    }));
    context.activeTab = this.#activeTab;

    if (this.#activeTab === "threat") {
      this.#prepareThreatContext(context, cfg);
    } else {
      this.#prepareEncounterContext(context, cfg);
    }

    return context;
  }

  /* ─── Threat Builder Context ──────────────────────────────── */

  #prepareThreatContext(context, cfg) {
    const s = this.#threatState;
    const caps = cfg.rankStatCaps[s.rank] ?? cfg.rankStatCaps.f;

    context.threat = {
      ...s,
      isEditing: !!s.existingActorId
    };

    // Rank options
    context.rankOptions = Object.entries(cfg.ranks).map(([key, val]) => ({
      key, label: game.i18n.localize(val.label), selected: key === s.rank
    }));

    // Role options
    context.roleOptions = Object.entries(cfg.enemyRoles).map(([key, val]) => ({
      key, label: game.i18n.localize(val), selected: key === s.role
    }));

    // Archetype options
    context.archetypeOptions = Object.entries(cfg.threatArchetypes).map(([key, val]) => ({
      key, label: game.i18n.localize(val.label), selected: key === s.archetype
    }));

    // Stats with caps
    const statKeys = ["str", "agi", "mag", "end", "spi", "luk", "int", "chm"];
    context.statGrid = statKeys.map(key => ({
      key,
      label: game.i18n.localize(cfg.statAbbreviations[key]),
      value: s.stats[key],
      cap: caps[key],
      percent: Math.min(100, Math.round((s.stats[key] / caps[key]) * 100)),
      overCap: s.stats[key] > caps[key]
    }));

    // HP/MP with caps
    context.hpStat = { value: s.stats.hp, cap: caps.hp, percent: Math.min(100, Math.round((s.stats.hp / caps.hp) * 100)), overCap: s.stats.hp > caps.hp };
    context.mpStat = { value: s.stats.mp, cap: caps.mp, percent: Math.min(100, Math.round((s.stats.mp / caps.mp) * 100)), overCap: s.stats.mp > caps.mp };

    // Elemental profile grid
    const elementOrder = ["fire", "ice", "water", "lightning", "wind", "earth", "light", "dark"];
    const tierCycle = ["weak", "neutral", "resist", "immune", "absorb"];
    context.elementGrid = elementOrder.map(el => ({
      key: el,
      label: game.i18n.localize(cfg.elements[el]),
      tier: s.elementalProfile[el],
      tierLabel: game.i18n.localize(cfg.elementalTiers[s.elementalProfile[el]])
    }));
    context.tierCycle = tierCycle;

    // Status resistance grid
    const conditionOrder = ["beguile", "blight", "expose", "immobilize", "impair", "silence", "stun", "taunt"];
    const statusTierCycle = ["vulnerable", "neutral", "resist", "immune"];
    context.statusGrid = conditionOrder.map(cond => ({
      key: cond,
      label: game.i18n.localize(cfg.statusEffects[cond].label),
      tier: s.statusResistances[cond],
      icon: cfg.statusIcons[cond]
    }));
    context.statusTierCycle = statusTierCycle;

    // Movement modes
    context.movementModes = Object.entries(cfg.movementModes).map(([key, val]) => ({
      key, label: game.i18n.localize(val), active: s.movementModes.includes(key)
    }));

    // Creature type tags
    context.creatureTypes = s.creatureType;
    context.creatureTypeSuggestions = Object.keys(cfg.creatureTypes);

    // Equipment and skills
    context.equipment = s.equipment;
    context.skills = s.skills;

    // Loot table
    context.lootTable = s.lootTable;

    // Derived preview
    context.preview = this.#computeDerivedPreview();
  }

  /* ─── Encounter Composer Context ──────────────────────────── */

  #prepareEncounterContext(context, cfg) {
    const enc = this.#encounterState;

    // Auto-detect party
    if (!enc.party.length) this.#detectParty();

    const avgLevel = enc.partyLevelOverride ?? (
      enc.party.length ? Math.round(enc.party.reduce((sum, p) => sum + p.level, 0) / enc.party.length) : 1
    );
    const partySize = enc.party.length || 1;
    const partyBudget = partySize * avgLevel * 2;

    context.party = enc.party;
    context.partySize = partySize;
    context.avgLevel = avgLevel;
    context.partyBudget = partyBudget;
    context.partyLevelOverride = enc.partyLevelOverride ?? "";

    // Scene selection
    context.scenes = game.scenes.map(s => ({ id: s.id, name: s.name, selected: s.id === enc.sceneId }));
    context.sceneId = enc.sceneId;

    // Objective
    context.objectiveOptions = Object.entries(cfg.objectiveTypes).map(([key, label]) => ({
      key,
      label: game.i18n.localize(label),
      icon: cfg.objectiveIcons[key] ?? "fas fa-crosshairs",
      selected: key === enc.objective
    }));
    context.objective = enc.objective;
    context.objectiveLabel = game.i18n.localize(cfg.objectiveTypes[enc.objective] ?? "");
    context.objectiveIcon = cfg.objectiveIcons[enc.objective] ?? "fas fa-crosshairs";
    const objMod = cfg.objectiveDifficultyModifiers[enc.objective] ?? 1.0;
    context.objectiveModifier = objMod;
    context.objectiveModifierDisplay = `×${objMod.toFixed(1)}`;
    context.ambush = enc.ambush;

    // Zones with enriched enemy data
    const enrichEnemy = (e) => ({
      ...e,
      rankLabel: game.i18n.localize(cfg.ranks[e.rank]?.label ?? ""),
      roleLabel: game.i18n.localize(cfg.enemyRoles[e.role] ?? ""),
      roleIcon: cfg.enemyRoleIcons[e.role] ?? "fas fa-shield-halved",
      totalTL: e.threatLevel * e.count
    });

    context.zones = enc.zones.map((z, zi) => {
      const enemies = z.enemies.map(enrichEnemy);
      const zoneTL = enemies.reduce((sum, e) => sum + e.totalTL, 0);
      return { ...z, index: zi, enemies, zoneTL };
    });

    // Waves with enriched enemy data
    context.waves = enc.waves.map((w, wi) => {
      const enemies = w.enemies.map(enrichEnemy);
      const waveTL = enemies.reduce((sum, e) => sum + e.totalTL, 0);
      return { ...w, index: wi, enemies, waveTL };
    });

    // Wave trigger type options
    context.waveTriggerTypes = Object.entries(cfg.waveTriggerTypes).map(([key, label]) => ({
      key, label: game.i18n.localize(label)
    }));

    // Totals
    const startingTL = context.zones.reduce((sum, z) => sum + z.zoneTL, 0);
    const reinforcementTL = context.waves.reduce((sum, w) => sum + w.waveTL, 0);
    const totalTL = startingTL + reinforcementTL;
    context.startingTL = startingTL;
    context.reinforcementTL = reinforcementTL;
    context.totalTL = totalTL;

    // Difficulty calculation — apply objective modifier
    const rawRatio = partyBudget > 0 ? totalTL / partyBudget : 0;
    const adjustedRatio = rawRatio * objMod;
    let difficulty = cfg.encounterDifficultyTiers[cfg.encounterDifficultyTiers.length - 1];
    for (const tier of cfg.encounterDifficultyTiers) {
      if (adjustedRatio <= tier.max) { difficulty = tier; break; }
    }
    context.difficulty = {
      key: difficulty.key,
      label: game.i18n.localize(difficulty.label),
      color: difficulty.color,
      ratio: adjustedRatio,
      ratioDisplay: adjustedRatio.toFixed(1),
      rawRatio: rawRatio.toFixed(1),
      percent: Math.min(100, Math.round(adjustedRatio * 40))
    };

    // EXP preview — all enemies across all zones and waves
    const allEnemies = [
      ...enc.zones.flatMap(z => z.enemies),
      ...enc.waves.flatMap(w => w.enemies)
    ];
    context.expPreview = allEnemies.map(e => ({
      name: e.name,
      count: e.count,
      killEXP: calculateCombatEXP(avgLevel, e.level, e.role, true),
      combatEXP: calculateCombatEXP(avgLevel, e.level, e.role, false)
    }));

    const totalKillEXP = context.expPreview.reduce((sum, e) => sum + (e.killEXP * e.count), 0);
    const totalCombatEXP = context.expPreview.reduce((sum, e) => sum + (e.combatEXP * e.count), 0);
    context.totalKillEXP = totalKillEXP;
    context.totalCombatEXP = totalCombatEXP;

    // Quick templates
    context.templates = Object.entries(cfg.encounterTemplates).map(([key, val]) => ({
      key, label: game.i18n.localize(val.label)
    }));
  }

  /* ─── Stat Suggestion Algorithm ───────────────────────────── */

  #suggestStats(rank, role, archetype) {
    const caps = CONFIG.MANASHARD.rankStatCaps[rank];
    const arch = CONFIG.MANASHARD.threatArchetypes[archetype];
    if (!caps || !arch) return null;

    const PRIMARY = 0.825;
    const SECONDARY = 0.575;
    const DUMP = 0.325;

    const primarySet = new Set(arch.primary);
    const secondarySet = new Set(arch.secondary);
    const coreStats = ["str", "agi", "mag", "end", "spi", "luk"];

    const stats = {};
    for (const stat of coreStats) {
      let ratio;
      if (archetype === "balanced" || archetype === "custom") {
        ratio = 0.6;
      } else if (primarySet.has(stat)) {
        ratio = PRIMARY;
      } else if (secondarySet.has(stat)) {
        ratio = SECONDARY;
      } else {
        ratio = DUMP;
      }
      stats[stat] = Math.max(1, Math.round(caps[stat] * ratio));
    }

    // Role stat modifier — Minions are fodder, Standards are baseline
    const roleMod = CONFIG.MANASHARD.roleStatMod[role] ?? 1.0;
    for (const stat of coreStats) {
      stats[stat] = Math.max(1, Math.round(stats[stat] * roleMod));
    }

    // INT and CHM default to 0 unless in archetype sets
    stats.int = secondarySet.has("int") ? Math.max(1, Math.round(caps.int * SECONDARY * roleMod)) : 0;
    stats.chm = secondarySet.has("chm") ? Math.max(1, Math.round(caps.chm * SECONDARY * roleMod)) : 0;

    // HP from rank cap × archetype modifier × role HP modifier
    const roleHpMod = CONFIG.MANASHARD.roleHpMod[role] ?? 1.0;
    stats.hp = Math.max(1, Math.round(caps.hp * arch.hpMod * roleHpMod));

    // MP from rank cap × archetype modifier × role MP modifier
    const roleMpMod = CONFIG.MANASHARD.roleMpMod[role] ?? 1.0;
    stats.mp = Math.max(0, Math.round(caps.mp * arch.mpMod * roleMpMod));

    return stats;
  }

  /* ─── Derived Stat Preview ────────────────────────────────── */

  #computeDerivedPreview() {
    const s = this.#threatState;
    const stats = s.stats;

    const weapon = s.equipment.find(e => e.type === "weapon");
    const armor = s.equipment.find(e => e.type === "armor");
    const offhand = s.equipment.filter(e => e.type === "weapon")[1] ?? null;

    const weaponMight = weapon?.system?.might ?? 0;
    const weaponCrit = weapon?.system?.crit ?? 0;
    const weaponDamageType = weapon?.system?.damageType ?? "physical";

    // Swords (Versatile): physical damage uses max(STR, AGI)
    const wpnCat = weapon?.system?.category;
    const physScaling = (wpnCat === "swords") ? Math.max(stats.str, stats.agi) : stats.str;
    const damage = (weaponDamageType === "magical" ? stats.mag * 2 : physScaling * 2) + weaponMight;
    const accuracy = 80 + (stats.agi * 2);
    const critical = (stats.luk * 2) + weaponCrit;
    const peva = stats.agi;
    const meva = stats.spi;
    const critAvoid = stats.luk * 2;
    const pdef = (armor?.system?.pdef ?? 0) + stats.end;
    const mdef = (armor?.system?.mdef ?? 0) + stats.spi;
    const mpRegen = Math.floor(stats.spi / 4);

    let blockChance = 0;
    const blockSource = offhand?.system?.block ? offhand.system : weapon?.system;
    if (blockSource?.block) {
      blockChance = blockSource.block + Math.floor(stats.end / 2);
    }

    const reach = Math.max(s.size, weapon?.system?.maxRange ?? 1);
    const vision = s.size >= 4 ? 7 : 6;
    const actionsPerTurn = CONFIG.MANASHARD.enemyRoleActions[s.role] ?? 1;
    const threatLevel = this.#calculateThreatLevel(s.level, s.rank, s.role);

    return {
      damage, accuracy, critical, peva, meva, critAvoid,
      pdef, mdef, mpRegen, blockChance, reach, vision,
      actionsPerTurn, threatLevel
    };
  }

  /* ─── Threat Level Calculation ────────────────────────────── */

  #calculateThreatLevel(level, rank, role) {
    const rankBonus = CONFIG.MANASHARD.tlRankBonus[rank] ?? 0;
    const roleBonus = CONFIG.MANASHARD.tlRoleBonus[role] ?? 0;
    return (level * 2) + rankBonus + roleBonus;
  }

  /* ─── Party Detection ─────────────────────────────────────── */

  #detectParty() {
    const memberIds = game.settings.get("manashard", "partyMembers") ?? [];
    const party = [];
    for (const id of memberIds) {
      const actor = game.actors.get(id);
      if (actor?.type === "character") {
        party.push({ actorId: actor.id, name: actor.name, level: actor.system.level, img: actor.img });
      }
    }
    // Fallback: if no party setting, use all character actors
    if (!party.length) {
      for (const actor of game.actors) {
        if (actor.type === "character" && actor.hasPlayerOwner) {
          party.push({ actorId: actor.id, name: actor.name, level: actor.system.level, img: actor.img });
        }
      }
    }
    this.#encounterState.party = party;
  }

  /* ─── Default State Factories ─────────────────────────────── */

  #createDefaultThreatState() {
    return {
      existingActorId: null,
      name: "New Threat",
      img: "icons/svg/mystery-man.svg",
      level: 1,
      size: 1,
      rank: "f",
      role: "standard",
      archetype: "balanced",
      stats: { hp: 15, mp: 4, str: 3, agi: 3, mag: 1, end: 2, spi: 1, luk: 1, int: 0, chm: 0 },
      mov: 6,
      movementModes: ["walk"],
      creatureType: ["humanoid"],
      elementalProfile: { fire: "neutral", ice: "neutral", water: "neutral", lightning: "neutral", wind: "neutral", earth: "neutral", light: "neutral", dark: "neutral" },
      statusResistances: { beguile: "neutral", blight: "neutral", expose: "neutral", immobilize: "neutral", impair: "neutral", silence: "neutral", stun: "neutral", taunt: "neutral" },
      equipment: [],
      skills: [],
      lootTable: [],
      crystallizeInstantly: false
    };
  }

  #createDefaultEncounterState() {
    return {
      party: [],
      partyLevelOverride: null,
      sceneId: null,
      objective: "rout",
      ambush: false,
      zones: [
        { id: foundry.utils.randomID(), label: "Main Area", enemies: [] }
      ],
      waves: []
    };
  }

  /* ─── Input Wiring (called from _onRender) ────────────────── */

  #wireThreatInputs() {
    const el = this.element;
    if (!el) return;

    // Name
    el.querySelector('input[name="threat-name"]')?.addEventListener("change", (e) => {
      this.#threatState.name = e.target.value;
    });

    // Level — update state + refresh preview in-place
    el.querySelector('input[name="threat-level"]')?.addEventListener("change", (e) => {
      this.#threatState.level = Math.max(1, parseInt(e.target.value) || 1);
      this.#refreshPreview();
    });

    // Size
    el.querySelector('select[name="threat-size"]')?.addEventListener("change", (e) => {
      this.#threatState.size = parseInt(e.target.value) || 1;
      this.#refreshPreview();
    });

    // Rank — need full re-render to update cap bars
    el.querySelector('select[name="threat-rank"]')?.addEventListener("change", (e) => {
      this.#threatState.rank = e.target.value;
      this.#renderPreservingScroll();
    });

    // Role
    el.querySelector('select[name="threat-role"]')?.addEventListener("change", (e) => {
      this.#threatState.role = e.target.value;
      this.#refreshPreview();
    });

    // Archetype
    el.querySelector('select[name="threat-archetype"]')?.addEventListener("change", (e) => {
      this.#threatState.archetype = e.target.value;
    });

    // MOV
    el.querySelector('input[name="threat-mov"]')?.addEventListener("change", (e) => {
      this.#threatState.mov = Math.max(0, parseInt(e.target.value) || 0);
    });

    // Stats — update state + refresh preview in-place (no full re-render)
    el.querySelectorAll('input[data-stat]').forEach(input => {
      input.addEventListener("change", (e) => {
        const key = e.target.dataset.stat;
        this.#threatState.stats[key] = Math.max(0, parseInt(e.target.value) || 0);
        this.#refreshStatCell(e.target, key);
        this.#refreshPreview();
      });
    });

    // Crystallize
    el.querySelector('input[name="threat-crystallize"]')?.addEventListener("change", (e) => {
      this.#threatState.crystallizeInstantly = e.target.checked;
    });

    // Creature type input
    el.querySelector('input[name="creature-type-input"]')?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const val = e.target.value.trim().toLowerCase();
        if (val && !this.#threatState.creatureType.includes(val)) {
          this.#threatState.creatureType.push(val);
          this.#renderPreservingScroll();
        }
      }
    });

    // Loot table inputs
    el.querySelectorAll('.eb-loot-row').forEach((row, idx) => {
      row.querySelector('input[name="loot-name"]')?.addEventListener("change", (e) => {
        if (this.#threatState.lootTable[idx]) this.#threatState.lootTable[idx].itemName = e.target.value;
      });
      row.querySelector('input[name="loot-chance"]')?.addEventListener("change", (e) => {
        if (this.#threatState.lootTable[idx]) this.#threatState.lootTable[idx].chance = Math.max(1, Math.min(100, parseInt(e.target.value) || 50));
      });
      row.querySelector('input[name="loot-stolen"]')?.addEventListener("change", (e) => {
        if (this.#threatState.lootTable[idx]) this.#threatState.lootTable[idx].stolen = e.target.checked;
      });
    });
  }

  #wireEncounterInputs() {
    const el = this.element;
    if (!el) return;

    el.querySelector('input[name="party-level-override"]')?.addEventListener("change", (e) => {
      const val = parseInt(e.target.value);
      this.#encounterState.partyLevelOverride = val > 0 ? val : null;
      this.#renderPreservingScroll();
    });

    el.querySelector('select[name="mission-scene"]')?.addEventListener("change", (e) => {
      this.#encounterState.sceneId = e.target.value || null;
    });

    el.querySelector('select[name="mission-objective"]')?.addEventListener("change", (e) => {
      this.#encounterState.objective = e.target.value;
      this.#renderPreservingScroll(); // Need re-render for objective modifier display
    });

    // Zone label inputs
    el.querySelectorAll('input[data-zone-label]').forEach(input => {
      input.addEventListener("change", (e) => {
        const idx = parseInt(e.target.dataset.zoneLabel);
        if (this.#encounterState.zones[idx]) {
          this.#encounterState.zones[idx].label = e.target.value;
        }
      });
    });

    // Wave label, trigger type, and trigger value inputs
    el.querySelectorAll('.eb-wave-section').forEach(section => {
      const idx = parseInt(section.dataset.waveIndex);
      if (isNaN(idx)) return;
      const wave = this.#encounterState.waves[idx];
      if (!wave) return;

      section.querySelector('input[name="wave-label"]')?.addEventListener("change", (e) => {
        wave.label = e.target.value;
      });
      section.querySelector('input[name="wave-zone"]')?.addEventListener("change", (e) => {
        wave.zone = e.target.value;
      });
      section.querySelector('select[name="wave-trigger-type"]')?.addEventListener("change", (e) => {
        wave.trigger.type = e.target.value;
        this.#renderPreservingScroll();
      });
      section.querySelector('input[name="wave-trigger-value"]')?.addEventListener("change", (e) => {
        wave.trigger.value = Math.max(1, parseInt(e.target.value) || 1);
      });
    });
  }

  /* ─── In-Place DOM Updates (no re-render) ─────────────────── */

  /**
   * Update the preview panel in-place without re-rendering the whole app.
   */
  #refreshPreview() {
    const preview = this.#computeDerivedPreview();
    const el = this.element;
    if (!el) return;

    const map = {
      threatLevel: preview.threatLevel,
      actionsPerTurn: preview.actionsPerTurn,
      damage: preview.damage,
      accuracy: preview.accuracy,
      critical: preview.critical,
      peva: preview.peva,
      meva: preview.meva,
      critAvoid: preview.critAvoid,
      pdef: preview.pdef,
      mdef: preview.mdef,
      blockChance: preview.blockChance,
      mpRegen: preview.mpRegen,
      reach: preview.reach,
      vision: preview.vision
    };

    for (const [key, value] of Object.entries(map)) {
      const span = el.querySelector(`.eb-preview-value[data-preview="${key}"]`);
      if (span) span.textContent = value;
    }
  }

  /**
   * Update a single stat cell's cap bar in-place.
   */
  #refreshStatCell(input, statKey) {
    const caps = CONFIG.MANASHARD.rankStatCaps[this.#threatState.rank];
    if (!caps) return;
    const cell = input.closest('.eb-stat-cell, .eb-resource-cell');
    if (!cell) return;
    const cap = caps[statKey];
    const value = this.#threatState.stats[statKey];
    const percent = Math.min(100, Math.round((value / cap) * 100));
    const overCap = value > cap;

    const fill = cell.querySelector('.eb-cap-fill');
    if (fill) {
      fill.style.width = `${percent}%`;
      fill.classList.toggle('over-cap', overCap);
    }
    cell.classList?.toggle('over-cap', overCap);
  }

  /* ═══════════════════════════════════════════════════════════
   * ACTION HANDLERS
   * ═══════════════════════════════════════════════════════════ */

  static #onSwitchTab(event, target) {
    const tab = target.dataset.tab;
    if (tab) {
      this.#activeTab = tab;
      this.#renderPreservingScroll();
    }
  }

  /* ─── Threat Builder Actions ──────────────────────────────── */

  static #onEditImage() {
    const current = this.#threatState.img;
    const fp = new FilePicker({
      type: "image",
      current,
      callback: (path) => {
        this.#threatState.img = path;
        const img = this.element?.querySelector(".eb-portrait");
        if (img) img.src = path;
      }
    });
    fp.render(true);
  }

  static #onApplySuggestion() {
    const s = this.#threatState;
    const suggested = this.#suggestStats(s.rank, s.role, s.archetype);
    if (suggested) {
      Object.assign(s.stats, suggested);
      this.#renderPreservingScroll();
    }
  }

  static #onCycleElementTier(event, target) {
    const el = target.dataset.element;
    const tiers = ["weak", "neutral", "resist", "immune", "absorb"];
    const current = this.#threatState.elementalProfile[el] ?? "neutral";
    const nextIdx = (tiers.indexOf(current) + 1) % tiers.length;
    const next = tiers[nextIdx];
    this.#threatState.elementalProfile[el] = next;
    // Update button in-place
    for (const t of tiers) target.classList.remove(`tier-${t}`);
    target.classList.add(`tier-${next}`);
    const tierLabel = game.i18n.localize(CONFIG.MANASHARD.elementalTiers[next]);
    target.title = `${game.i18n.localize(CONFIG.MANASHARD.elements[el])}: ${tierLabel}`;
    const valSpan = target.querySelector('.eb-tier-value');
    if (valSpan) valSpan.textContent = next.substring(0, 3).toUpperCase();
  }

  static #onCycleStatusTier(event, target) {
    const cond = target.dataset.condition;
    const tiers = ["vulnerable", "neutral", "resist", "immune"];
    const nextIdx = (tiers.indexOf(this.#threatState.statusResistances[cond] ?? "neutral") + 1) % tiers.length;
    const next = tiers[nextIdx];
    this.#threatState.statusResistances[cond] = next;
    // Update button in-place
    for (const t of tiers) target.classList.remove(`tier-${t}`);
    target.classList.add(`tier-${next}`);
    target.title = `${game.i18n.localize(CONFIG.MANASHARD.statusEffects[cond].label)}: ${next}`;
    const valSpan = target.querySelector('.eb-tier-value');
    if (valSpan) valSpan.textContent = next.substring(0, 3).toUpperCase();
  }

  static #onToggleMovement(event, target) {
    const mode = target.dataset.mode;
    const modes = this.#threatState.movementModes;
    const idx = modes.indexOf(mode);
    if (idx >= 0) modes.splice(idx, 1);
    else modes.push(mode);
  }

  static #onAddCreatureType(event, target) {
    const input = this.element.querySelector('input[name="creature-type-input"]');
    const val = input?.value?.trim().toLowerCase();
    if (val && !this.#threatState.creatureType.includes(val)) {
      this.#threatState.creatureType.push(val);
      this.#renderPreservingScroll();
    }
  }

  static #onRemoveCreatureType(event, target) {
    const type = target.dataset.type;
    this.#threatState.creatureType = this.#threatState.creatureType.filter(t => t !== type);
    this.#renderPreservingScroll();
  }

  static #onAddLootRow() {
    this.#threatState.lootTable.push({ itemId: "", itemName: "", chance: 50, stolen: false });
    this.#renderPreservingScroll();
  }

  static #onRemoveLootRow(event, target) {
    const idx = parseInt(target.dataset.index);
    if (!isNaN(idx)) {
      this.#threatState.lootTable.splice(idx, 1);
      this.#renderPreservingScroll();
    }
  }

  static #onRemoveEquipment(event, target) {
    const idx = parseInt(target.dataset.index);
    if (!isNaN(idx)) {
      this.#threatState.equipment.splice(idx, 1);
      this.#renderPreservingScroll();
    }
  }

  static #onRemoveSkill(event, target) {
    const idx = parseInt(target.dataset.index);
    if (!isNaN(idx)) {
      this.#threatState.skills.splice(idx, 1);
      this.#renderPreservingScroll();
    }
  }

  static async #onSaveThreat() {
    const s = this.#threatState;

    const actorData = {
      name: s.name,
      img: s.img,
      type: "threat",
      system: {
        level: s.level,
        size: s.size,
        rank: s.rank,
        role: s.role,
        actionsPerTurn: CONFIG.MANASHARD.enemyRoleActions[s.role] ?? 1,
        crystallizeInstantly: s.crystallizeInstantly,
        mov: s.mov,
        movementModes: s.movementModes,
        creatureType: s.creatureType,
        elementalProfile: { ...s.elementalProfile },
        statusResistances: { ...s.statusResistances },
        lootTable: [],  // Populated after loot items are embedded below
        stats: {
          hp: { value: s.stats.hp, max: s.stats.hp, barrier: 0 },
          mp: { value: s.stats.mp, max: s.stats.mp },
          str: { value: s.stats.str },
          agi: { value: s.stats.agi },
          mag: { value: s.stats.mag },
          end: { value: s.stats.end },
          spi: { value: s.stats.spi },
          luk: { value: s.stats.luk },
          int: { value: s.stats.int },
          chm: { value: s.stats.chm }
        }
      }
    };

    let actor;
    if (s.existingActorId) {
      actor = game.actors.get(s.existingActorId);
      if (actor) {
        await actor.update(actorData);
        // Delete all embedded items — the builder will recreate equipment, skills, and loot
        const allItemIds = actor.items.map(i => i.id);
        if (allItemIds.length) {
          await actor.deleteEmbeddedDocuments("Item", allItemIds);
        }
      }
    }
    if (!actor) {
      actor = await Actor.create(actorData);
      this.#threatState.existingActorId = actor.id;
    }

    // Add equipment and skills as embedded items using stored data
    const itemCreates = [];
    for (const eq of s.equipment) {
      const obj = { name: eq.name, img: eq.img, type: eq.type, system: { ...eq.system, equipped: true } };
      itemCreates.push(obj);
    }
    for (const sk of s.skills) {
      const obj = { name: sk.name, img: sk.img, type: "manacite", system: { ...sk.system } };
      itemCreates.push(obj);
    }
    if (itemCreates.length) {
      await actor.createEmbeddedDocuments("Item", itemCreates);
    }

    // Create loot embedded items from UUIDs and build loot table with their IDs
    const lootTable = [];
    for (const lootEntry of s.lootTable) {
      if (lootEntry.uuid) {
        // Resolve source item and create an embedded copy for loot
        const source = await fromUuid(lootEntry.uuid);
        if (source) {
          const itemData = source.toObject();
          delete itemData._id;
          const [created] = await actor.createEmbeddedDocuments("Item", [itemData], { _lootOnly: true });
          if (created) {
            lootTable.push({ itemId: created.id, chance: lootEntry.chance, stolen: lootEntry.stolen });
            continue;
          }
        }
      }
      // Fallback: keep the entry as-is (manual entries without UUID)
      lootTable.push({ itemId: lootEntry.itemId || "", chance: lootEntry.chance, stolen: lootEntry.stolen });
    }
    if (lootTable.length) {
      await actor.update({ "system.lootTable": lootTable });
    }

    ui.notifications.info(game.i18n.format("MANASHARD.EncBuilder.ThreatSaved", { name: actor.name }));
    this.#renderPreservingScroll();
  }

  static async #onLoadThreat() {
    // Show a dialog to pick an existing Threat actor
    const threats = game.actors.filter(a => a.type === "threat");
    if (!threats.length) {
      ui.notifications.warn("No threat actors found.");
      return;
    }

    const options = threats.map(a => `<option value="${a.id}">${a.name} (Lv${a.system.level} ${a.system.rank.toUpperCase()} ${a.system.role})</option>`).join("");
    const content = `<form><div class="form-group"><label>Select Threat</label><select name="actorId">${options}</select></div></form>`;

    const actorId = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("MANASHARD.EncBuilder.LoadThreat") },
      content,
      ok: {
        label: "Load",
        callback: (event, btn) => btn.form.elements.actorId.value
      }
    });

    if (!actorId) return;
    const actor = game.actors.get(actorId);
    if (!actor) return;

    const sys = actor.system;
    this.#threatState = {
      existingActorId: actor.id,
      name: actor.name,
      img: actor.img,
      level: sys.level,
      size: sys.size,
      rank: sys.rank,
      role: sys.role,
      archetype: "custom",
      stats: {
        hp: sys.stats.hp.max,
        mp: sys.stats.mp.max,
        str: sys.stats.str.value,
        agi: sys.stats.agi.value,
        mag: sys.stats.mag.value,
        end: sys.stats.end.value,
        spi: sys.stats.spi.value,
        luk: sys.stats.luk.value,
        int: sys.stats.int.value,
        chm: sys.stats.chm.value
      },
      mov: sys.mov,
      movementModes: [...sys.movementModes],
      creatureType: [...sys.creatureType],
      elementalProfile: { ...sys.elementalProfile },
      statusResistances: { ...sys.statusResistances },
      equipment: [],
      skills: [],
      lootTable: [],  // Populated below after resolving embedded items
      crystallizeInstantly: sys.crystallizeInstantly
    };

    // Build a set of loot item IDs for filtering
    const lootItemIds = new Set(sys.lootTable.map(l => l.itemId).filter(Boolean));

    // Load embedded items as equipment/skills (skip loot-only items)
    for (const item of actor.items) {
      if (lootItemIds.has(item.id)) continue;  // Loot items handled separately
      const entry = { uuid: item.uuid, name: item.name, img: item.img, type: item.type, system: item.system.toObject ? item.system.toObject() : { ...item.system } };
      if (["weapon", "armor", "accessory"].includes(item.type)) {
        this.#threatState.equipment.push(entry);
      } else if (item.type === "manacite") {
        this.#threatState.skills.push(entry);
      }
    }

    // Resolve loot entries with enriched data (name, img) from embedded items
    for (const lootEntry of sys.lootTable) {
      const item = lootEntry.itemId ? actor.items.get(lootEntry.itemId) : null;
      this.#threatState.lootTable.push({
        itemId: lootEntry.itemId || "",
        uuid: item?.uuid ?? "",
        itemName: item?.name ?? "",
        img: item?.img ?? "",
        chance: lootEntry.chance,
        stolen: lootEntry.stolen
      });
    }

    this.#renderPreservingScroll();
  }

  static #onClearThreat() {
    this.#threatState = this.#createDefaultThreatState();
    this.#renderPreservingScroll();
  }

  /* ─── Encounter Composer Actions ──────────────────────────── */

  static #onRemoveEnemy(event, target) {
    const zoneIdx = parseInt(target.dataset.zone);
    const enemyIdx = parseInt(target.dataset.index);
    if (isNaN(zoneIdx) || isNaN(enemyIdx)) return;
    const zone = this.#encounterState.zones[zoneIdx];
    if (!zone) return;
    zone.enemies.splice(enemyIdx, 1);
    this.#renderPreservingScroll();
  }

  static #onAdjustEnemyCount(event, target) {
    const zoneIdx = parseInt(target.dataset.zone);
    const enemyIdx = parseInt(target.dataset.index);
    const delta = parseInt(target.dataset.delta);
    if (isNaN(zoneIdx) || isNaN(enemyIdx) || isNaN(delta)) return;
    const zone = this.#encounterState.zones[zoneIdx];
    if (!zone) return;
    const enemy = zone.enemies[enemyIdx];
    if (!enemy) return;
    enemy.count = Math.max(1, enemy.count + delta);
    this.#renderPreservingScroll();
  }

  static #onApplyTemplate(event, target) {
    const key = target.dataset.template;
    const template = CONFIG.MANASHARD.encounterTemplates[key];
    if (!template) return;

    // Apply template to the first zone (or create one)
    if (!this.#encounterState.zones.length) {
      this.#encounterState.zones.push({ id: foundry.utils.randomID(), label: "Main Area", enemies: [] });
    }
    const zone = this.#encounterState.zones[0];
    zone.enemies = [];
    for (const slot of template.slots) {
      zone.enemies.push({
        uuid: null, actorId: null,
        name: `[${game.i18n.localize(CONFIG.MANASHARD.enemyRoles[slot.role])}]`,
        img: "icons/svg/mystery-man.svg",
        level: 1, rank: "f", role: slot.role, count: slot.count,
        threatLevel: this.#calculateThreatLevel(1, "f", slot.role),
        placeholder: true
      });
    }
    this.#renderPreservingScroll();
  }

  static async #onDeployToScene() {
    const enc = this.#encounterState;
    const scene = enc.sceneId ? game.scenes.get(enc.sceneId) : canvas.scene;
    if (!scene) return ui.notifications.warn(game.i18n.localize("MANASHARD.EncBuilder.NoScene"));

    const tokenData = [];
    // Deploy starting enemies from all zones
    for (const zone of enc.zones) {
      for (const entry of zone.enemies) {
        if (!entry.uuid || entry.placeholder) continue;
        const actor = await fromUuid(entry.uuid);
        if (!actor) continue;

        const protoToken = await actor.getTokenDocument();
        const proto = protoToken.toObject();

        for (let i = 0; i < entry.count; i++) {
          tokenData.push(foundry.utils.mergeObject(foundry.utils.deepClone(proto), {
            x: 200 + (i * (canvas.grid?.size ?? 100)),
            y: 200 + (tokenData.length * (canvas.grid?.size ?? 100)),
            actorLink: false
          }));
        }
      }
    }

    if (!tokenData.length) return ui.notifications.warn(game.i18n.localize("MANASHARD.EncBuilder.NoEnemies"));
    await scene.createEmbeddedDocuments("Token", tokenData);

    // Store reinforcement wave data on the scene as a flag for later spawning
    if (enc.waves.length) {
      await scene.setFlag("manashard", "reinforcementWaves", enc.waves.map(w => ({
        id: w.id, label: w.label, zone: w.zone,
        trigger: { ...w.trigger },
        enemies: w.enemies.map(e => ({ uuid: e.uuid, actorId: e.actorId, name: e.name, count: e.count }))
      })));
    }

    ui.notifications.info(game.i18n.format("MANASHARD.EncBuilder.Deployed", { count: tokenData.length }));
  }

  static async #onSaveEncounter() {
    const enc = this.#encounterState;
    const content = {
      party: enc.party.map(p => ({ actorId: p.actorId, name: p.name, level: p.level })),
      sceneId: enc.sceneId,
      objective: enc.objective,
      ambush: enc.ambush,
      zones: enc.zones.map(z => ({
        id: z.id, label: z.label,
        enemies: z.enemies.map(e => ({ uuid: e.uuid, name: e.name, level: e.level, rank: e.rank, role: e.role, count: e.count }))
      })),
      waves: enc.waves.map(w => ({
        id: w.id, label: w.label, zone: w.zone,
        trigger: { ...w.trigger },
        enemies: w.enemies.map(e => ({ uuid: e.uuid, name: e.name, level: e.level, rank: e.rank, role: e.role, count: e.count }))
      })),
      savedAt: Date.now()
    };

    const name = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("MANASHARD.EncBuilder.SaveMission") },
      content: '<form><div class="form-group"><label>Mission Name</label><input type="text" name="name" value="Mission" /></div></form>',
      ok: {
        label: "Save",
        callback: (event, btn) => btn.form.elements.name.value
      }
    });

    if (!name) return;
    const journal = await JournalEntry.create({
      name,
      flags: { manashard: { encounterData: content } }
    });
    ui.notifications.info(game.i18n.format("MANASHARD.EncBuilder.MissionSaved", { name: journal.name }));
  }

  static async #onLoadEncounter() {
    const journals = game.journal.filter(j => j.getFlag("manashard", "encounterData"));
    if (!journals.length) {
      ui.notifications.warn("No saved missions found.");
      return;
    }

    const options = journals.map(j => `<option value="${j.id}">${j.name}</option>`).join("");
    const content = `<form><div class="form-group"><label>Select Mission</label><select name="journalId">${options}</select></div></form>`;

    const journalId = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("MANASHARD.EncBuilder.LoadMission") },
      content,
      ok: {
        label: "Load",
        callback: (event, btn) => btn.form.elements.journalId.value
      }
    });

    if (!journalId) return;
    const journal = game.journal.get(journalId);
    const data = journal?.getFlag("manashard", "encounterData");
    if (!data) return;

    // Rebuild encounter state from saved data
    this.#encounterState.sceneId = data.sceneId ?? null;
    this.#encounterState.objective = data.objective ?? "rout";
    this.#encounterState.ambush = data.ambush ?? false;

    // Rebuild zones
    this.#encounterState.zones = [];
    const savedZones = data.zones ?? [];
    // Legacy support: if no zones but has flat enemies array, put them in one zone
    if (!savedZones.length && data.enemies?.length) {
      savedZones.push({ id: foundry.utils.randomID(), label: "Main Area", enemies: data.enemies });
    }
    for (const z of savedZones) {
      const enemies = [];
      for (const entry of z.enemies) {
        if (entry.uuid) {
          const actor = await fromUuid(entry.uuid);
          if (actor) {
            enemies.push({
              uuid: entry.uuid, actorId: actor.id, name: actor.name, img: actor.img,
              level: actor.system.level, rank: actor.system.rank, role: actor.system.role,
              count: entry.count,
              threatLevel: this.#calculateThreatLevel(actor.system.level, actor.system.rank, actor.system.role)
            });
          }
        }
      }
      this.#encounterState.zones.push({ id: z.id ?? foundry.utils.randomID(), label: z.label ?? "Zone", enemies });
    }

    // Rebuild waves
    this.#encounterState.waves = [];
    for (const w of (data.waves ?? [])) {
      const enemies = [];
      for (const entry of w.enemies) {
        if (entry.uuid) {
          const actor = await fromUuid(entry.uuid);
          if (actor) {
            enemies.push({
              uuid: entry.uuid, actorId: actor.id, name: actor.name, img: actor.img,
              level: actor.system.level, rank: actor.system.rank, role: actor.system.role,
              count: entry.count,
              threatLevel: this.#calculateThreatLevel(actor.system.level, actor.system.rank, actor.system.role)
            });
          }
        }
      }
      this.#encounterState.waves.push({
        id: w.id ?? foundry.utils.randomID(), label: w.label ?? "Wave",
        zone: w.zone ?? "", trigger: { ...w.trigger }, enemies
      });
    }

    this.#renderPreservingScroll();
  }

  static #onRefreshParty() {
    this.#encounterState.party = [];
    this.#detectParty();
    this.#renderPreservingScroll();
  }

  static #onClearEncounter() {
    this.#encounterState = this.#createDefaultEncounterState();
    this.#detectParty();
    this.#renderPreservingScroll();
  }

  /* ─── Zone Actions ─────────────────────────────────────────── */

  static #onAddZone() {
    this.#encounterState.zones.push({
      id: foundry.utils.randomID(), label: "New Zone", enemies: []
    });
    this.#renderPreservingScroll();
  }

  static #onRemoveZone(event, target) {
    const idx = parseInt(target.dataset.index);
    if (isNaN(idx)) return;
    if (this.#encounterState.zones.length <= 1) {
      ui.notifications.warn("Must have at least one zone.");
      return;
    }
    this.#encounterState.zones.splice(idx, 1);
    this.#renderPreservingScroll();
  }

  /* ─── Wave Actions ─────────────────────────────────────────── */

  static #onAddWave() {
    this.#encounterState.waves.push({
      id: foundry.utils.randomID(),
      label: `Wave ${this.#encounterState.waves.length + 1}`,
      zone: "",
      trigger: { type: "turn", value: 3 },
      enemies: []
    });
    this.#renderPreservingScroll();
  }

  static #onRemoveWave(event, target) {
    const idx = parseInt(target.dataset.index);
    if (!isNaN(idx)) {
      this.#encounterState.waves.splice(idx, 1);
      this.#renderPreservingScroll();
    }
  }

  static #onRemoveWaveEnemy(event, target) {
    const waveIdx = parseInt(target.dataset.wave);
    const enemyIdx = parseInt(target.dataset.index);
    if (isNaN(waveIdx) || isNaN(enemyIdx)) return;
    const wave = this.#encounterState.waves[waveIdx];
    if (!wave) return;
    wave.enemies.splice(enemyIdx, 1);
    this.#renderPreservingScroll();
  }

  static #onAdjustWaveEnemyCount(event, target) {
    const waveIdx = parseInt(target.dataset.wave);
    const enemyIdx = parseInt(target.dataset.index);
    const delta = parseInt(target.dataset.delta);
    if (isNaN(waveIdx) || isNaN(enemyIdx) || isNaN(delta)) return;
    const wave = this.#encounterState.waves[waveIdx];
    if (!wave) return;
    const enemy = wave.enemies[enemyIdx];
    if (!enemy) return;
    enemy.count = Math.max(1, enemy.count + delta);
    this.#renderPreservingScroll();
  }

  static #onToggleAmbush() {
    this.#encounterState.ambush = !this.#encounterState.ambush;
    const btn = this.element?.querySelector('[data-action="toggleAmbush"]');
    if (btn) btn.classList.toggle("active", this.#encounterState.ambush);
  }
}

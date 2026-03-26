// Manashard - A Tactical RPG System for Foundry VTT V13
// Inspired by Fire Emblem and anime/JRPG job systems

// Import configuration
import { MANASHARD } from "./module/helpers/config.mjs";

// Import data models
import { CharacterData } from "./module/data-models/actor-character.mjs";
import { NpcData } from "./module/data-models/actor-npc.mjs";
import { TrapData } from "./module/data-models/actor-trap.mjs";
import { AccessoryData } from "./module/data-models/item-accessory.mjs";
import { ArmorData } from "./module/data-models/item-armor.mjs";
import { ConsumableData } from "./module/data-models/item-consumable.mjs";
import { ItemData } from "./module/data-models/item-item.mjs";
import { ManaciteData } from "./module/data-models/item-manacite.mjs";
import { MaterialData } from "./module/data-models/item-material.mjs";
import { SpeciesData } from "./module/data-models/item-species.mjs";
import { WeaponData } from "./module/data-models/item-weapon.mjs";

// Import document classes
import { ManashardActor } from "./module/documents/actor.mjs";
import { ManashardItem } from "./module/documents/item.mjs";
import { ManashardCombat } from "./module/documents/combat.mjs";

// Import custom UI
import { CTBTracker } from "./module/apps/ctb-tracker.mjs";
import { CharacterCreationWizard } from "./module/apps/character-creation-wizard.mjs";
import { TokenInfoPanel } from "./module/apps/token-info-panel.mjs";
import { StatusEffectPanel } from "./module/apps/status-effect-panel.mjs";
import { TokenInfoConfig } from "./module/apps/token-info-config.mjs";
import { CreationConfig } from "./module/apps/creation-config.mjs";
import { PartySheet } from "./module/apps/party-sheet.mjs";
import { PartyCompositionPanel } from "./module/apps/party-comp-panel.mjs";
import { CompendiumBrowser } from "./module/apps/compendium-browser.mjs";
import { ManaciteManager } from "./module/apps/manacite-manager.mjs";
import { SpatialInventory } from "./module/apps/spatial-inventory.mjs";
import { EncounterBuilder } from "./module/apps/encounter-builder.mjs";

// Import sheets
import { ManashardActorSheet } from "./module/sheets/actor-sheet.mjs";
import { ManashardItemSheet } from "./module/sheets/item-sheet.mjs";

// Import helpers
import { ruleSummary } from "./module/helpers/rule-engine.mjs";
import { applyDamageFromChat, applyStealFromChat, applyPillageFromChat, applyConsumableFromChat, applyBuffEffect } from "./module/helpers/combat.mjs";
import { applyItemCardEffect } from "./module/helpers/item-cards.mjs";
import { scheduleAuraRefresh, cleanupAuras } from "./module/helpers/aura-engine.mjs";
import { showMovementRange, clearMovementRange, isWithinMovementRange } from "./module/helpers/movement-highlight.mjs";
import { showThreatRange, clearThreatRange } from "./module/helpers/threat-range-highlight.mjs";
import { syncAllTokenStatuses } from "./module/helpers/status-effects.mjs";
import { drawStatusEffectRing, preloadStatusTextures } from "./module/helpers/token-effects.mjs";
import { registerStatCheckSocket } from "./module/helpers/stat-check.mjs";
import { DetectionModeTrapSense, syncTrapSenseDetection } from "./module/helpers/trap-sense.mjs";
import { DetectionModeSense, syncSenseDetection } from "./module/helpers/sense.mjs";

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

Hooks.once("init", () => {
  console.log("Manashard | Initializing the Manashard System");

  // Store config on the global CONFIG object
  CONFIG.MANASHARD = MANASHARD;

  // Make wizard, token info panel, party sheet, and party comp panel available globally
  game.manashard = {
    CharacterCreationWizard,
    CompendiumBrowser,
    ManaciteManager,
    SpatialInventory,
    EncounterBuilder,
    PartySheet,
    tokenInfoPanel: new TokenInfoPanel(),
    statusEffectPanel: new StatusEffectPanel(),
    partyCompPanel: null  // Initialized on "ready" after settings are registered
  };

  // Register party members setting
  game.settings.register("manashard", "partyMembers", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  // Party name (editable group name)
  game.settings.register("manashard", "partyName", {
    scope: "world",
    config: false,
    type: String,
    default: "Adventurer's Guild"
  });

  // Party stash (shared inventory stored as serialised item data)
  game.settings.register("manashard", "partyStash", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  // Party Eiress (shared currency fund)
  game.settings.register("manashard", "partyEiress", {
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  // Keybinding: toggle Party Sheet with P
  game.keybindings.register("manashard", "openPartySheet", {
    name: "MANASHARD.Keybindings.OpenPartySheet",
    hint: "MANASHARD.Keybindings.OpenPartySheetHint",
    editable: [{ key: "KeyP" }],
    onDown: () => {
      const existing = Object.values(foundry.applications.instances).find(
        app => app.constructor === PartySheet
      );
      if (existing) existing.close();
      else new PartySheet().render(true);
      return true;
    }
  });

  // Migration version tracker (hidden, world-scoped)
  game.settings.register("manashard", "migrationVersion", {
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  // Register custom Document classes
  CONFIG.Actor.documentClass = ManashardActor;
  CONFIG.Item.documentClass = ManashardItem;
  CONFIG.Combat.documentClass = ManashardCombat;

  // Replace default combat tracker with CTB tracker
  CONFIG.ui.combat = CTBTracker;

  // Register DataModels for Actor sub-types
  CONFIG.Actor.dataModels = {
    character: CharacterData,
    threat: NpcData,
    trap: TrapData
  };

  // Register DataModels for Item sub-types
  CONFIG.Item.dataModels = {
    accessory: AccessoryData,
    armor: ArmorData,
    consumable: ConsumableData,
    item: ItemData,
    manacite: ManaciteData,
    material: MaterialData,
    species: SpeciesData,
    weapon: WeaponData
  };

  // Register Actor sheets
  foundry.documents.collections.Actors.registerSheet("manashard", ManashardActorSheet, {
    types: ["character"],
    makeDefault: true,
    label: "MANASHARD.SheetLabels.Character"
  });

  foundry.documents.collections.Actors.registerSheet("manashard", ManashardActorSheet, {
    types: ["threat"],
    makeDefault: true,
    label: "MANASHARD.SheetLabels.Threat"
  });

  foundry.documents.collections.Actors.registerSheet("manashard", ManashardActorSheet, {
    types: ["trap"],
    makeDefault: true,
    label: "MANASHARD.SheetLabels.Trap"
  });

  // Register Item sheets
  foundry.documents.collections.Items.registerSheet("manashard", ManashardItemSheet, {
    makeDefault: true,
    label: "MANASHARD.SheetLabels.Item"
  });

  // Replace Foundry's default status effects with Manashard's custom statuses
  CONFIG.statusEffects = Object.entries(MANASHARD.statusEffects).map(([id, cfg]) => ({
    id,
    name: cfg.label,
    img: MANASHARD.statusIconPaths[id]
  }));
  // Clear Foundry's special status mappings that don't apply to this system
  CONFIG.specialStatusEffects.DEFEATED = "";
  CONFIG.specialStatusEffects.INVISIBLE = "";
  CONFIG.specialStatusEffects.BLIND = "";

  // Configure trackable token attributes
  const npcTrackable = {
    bar: ["stats.hp", "stats.mp"],
    value: ["level"]
  };
  CONFIG.Actor.trackableAttributes = {
    character: {
      bar: ["stats.hp", "stats.mp"],
      value: ["level"]
    },
    threat: npcTrackable,
    trap: {
      bar: [],
      value: ["level"]
    }
  };

  // Register Party Composition Panel position setting (client-scoped)
  game.settings.register("manashard", "partyCompPosition", {
    scope: "client",
    config: false,
    type: Object,
    default: null
  });

  // VS Splash animation toggle (per-client)
  game.settings.register("manashard", "showVsSplash", {
    name: "MANASHARD.Settings.ShowVsSplash",
    hint: "MANASHARD.Settings.ShowVsSplashHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  // Register Token Info Panel settings
  _registerTokenInfoSettings();

  // Register Character Creation Config settings
  _registerCreationSettings();

  // Register Handlebars helpers
  _registerHandlebarsHelpers();

  // Preload Handlebars templates
  _preloadHandlebarsTemplates();

  // Preload extra templates
  foundry.applications.handlebars.loadTemplates([
    "systems/manashard/templates/apps/token-info-panel.hbs",
    "systems/manashard/templates/apps/party-sheet.hbs",
    "systems/manashard/templates/apps/party-comp-panel.hbs",
    "systems/manashard/templates/apps/status-effect-panel.hbs",
    "systems/manashard/templates/apps/compendium-browser.hbs",
    "systems/manashard/templates/apps/encounter-builder.hbs",
    "systems/manashard/templates/apps/encounter-builder-threat.hbs",
    "systems/manashard/templates/apps/encounter-builder-encounter.hbs"
  ]);

  // Register Trap Sense custom detection mode
  // DETECTION_TYPES: SIGHT=0, SOUND=1, MOVE=2, OTHER=3
  CONFIG.Canvas.detectionModes.trapSense = new DetectionModeTrapSense({
    id: "trapSense",
    label: "MANASHARD.DetectionModes.TrapSense",
    type: foundry.canvas.perception.DetectionMode.DETECTION_TYPES?.OTHER ?? 3,
    walls: false,
    angle: false,
    tokenConfig: false
  });

  // Register Sense custom detection mode (hidden hostile creatures)
  CONFIG.Canvas.detectionModes.sense = new DetectionModeSense({
    id: "sense",
    label: "MANASHARD.DetectionModes.Sense",
    type: foundry.canvas.perception.DetectionMode.DETECTION_TYPES?.OTHER ?? 3,
    walls: false,
    angle: false,
    tokenConfig: false
  });

  // Override Token.isVisible to allow Trap Sense to reveal hidden trap tokens.
  // Foundry's default isVisible returns false for hidden tokens before detection
  // modes are checked, so we intercept hidden traps and run only the trapSense
  // detection mode for them.
  const _origTokenIsVisible = Object.getOwnPropertyDescriptor(
    foundry.canvas.placeables.Token.prototype, "isVisible"
  )?.get;

  if (_origTokenIsVisible) {
    Object.defineProperty(foundry.canvas.placeables.Token.prototype, "isVisible", {
      get() {
        const isHiddenTrap = this.document.hidden && this.actor?.type === "trap";
        const isGM = game.user.isGM;

        // For hidden trap tokens: run trap sense detection instead of the normal
        // hidden-block. Activates for players always, and for GMs when the
        // Trap Sense Preview toggle is on (for testing without a player login).
        if (isHiddenTrap && (!isGM || _trapSensePreview)) {
          this.detectionFilter = null;

          const trapSenseMode = CONFIG.Canvas.detectionModes.trapSense;
          if (!trapSenseMode) return isGM ? _origTokenIsVisible.call(this) : false;

          // Check if the trap is armed (detection mode also checks, but skip early)
          if (this.actor?.system?.armed === false) {
            return isGM ? _origTokenIsVisible.call(this) : false;
          }

          let detected = false;

          // Primary path: use Foundry's vision sources when token vision is active
          if (canvas.visibility?.tokenVision) {
            const {width, height} = this.document.getSize();
            const tolerance = Math.min(width, height) / 4;
            const config = canvas.visibility._createVisibilityTestConfig(
              this.center, { tolerance, object: this }
            );

            for (const visionSource of canvas.effects.visionSources) {
              if (!visionSource.active) continue;
              const token = visionSource.object.document;
              const mode = token.detectionModes.find(m => m.id === "trapSense");
              if (!mode) continue;
              const result = trapSenseMode.testVisibility(visionSource, mode, config);
              if (result) { detected = true; break; }
            }
          }

          // Fallback path (GM preview with GM Vision on / no token vision):
          // Directly check distance from tokens that have trap sense
          if (!detected && isGM && _trapSensePreview) {
            const gs = canvas.grid.size;
            for (const other of canvas.tokens.placeables) {
              if (other.actor?.type === "trap") continue;
              const mode = other.document.detectionModes.find(m => m.id === "trapSense");
              if (!mode || !mode.enabled) continue;
              const range = mode.range ?? 0;
              const dx = other.center.x - this.center.x;
              const dy = other.center.y - this.center.y;
              const distTiles = Math.sqrt(dx * dx + dy * dy) / gs;
              if (distTiles <= range) { detected = true; break; }
            }
          }

          if (detected) {
            this.detectionFilter = trapSenseMode.constructor.getDetectionFilter();
            return true;
          }
          // GM still sees undetected traps faintly via default rendering
          if (isGM) return _origTokenIsVisible.call(this);
          return false;
        }

        // For hidden hostile creature tokens: run Sense detection.
        // Same pattern as Trap Sense but targets non-trap hostile tokens.
        const isHiddenThreat = this.document.hidden && this.actor?.type !== "trap"
          && this.document.disposition === -1;

        if (isHiddenThreat && (!isGM || _sensePreview)) {
          this.detectionFilter = null;

          const senseMode = CONFIG.Canvas.detectionModes.sense;
          if (!senseMode) return isGM ? _origTokenIsVisible.call(this) : false;

          let detected = false;

          // Primary path: use Foundry's vision sources when token vision is active
          if (canvas.visibility?.tokenVision) {
            const {width, height} = this.document.getSize();
            const tolerance = Math.min(width, height) / 4;
            const config = canvas.visibility._createVisibilityTestConfig(
              this.center, { tolerance, object: this }
            );

            for (const visionSource of canvas.effects.visionSources) {
              if (!visionSource.active) continue;
              const token = visionSource.object.document;
              const mode = token.detectionModes.find(m => m.id === "sense");
              if (!mode) continue;
              const result = senseMode.testVisibility(visionSource, mode, config);
              if (result) { detected = true; break; }
            }
          }

          // Fallback path (GM preview with GM Vision on / no token vision):
          // Directly check distance from tokens that have Sense
          if (!detected && isGM && _sensePreview) {
            const gs = canvas.grid.size;
            for (const other of canvas.tokens.placeables) {
              if (other.document.hidden) continue;
              const mode = other.document.detectionModes.find(m => m.id === "sense");
              if (!mode || !mode.enabled) continue;
              const range = mode.range ?? 0;
              const dx = other.center.x - this.center.x;
              const dy = other.center.y - this.center.y;
              const distTiles = Math.sqrt(dx * dx + dy * dy) / gs;
              if (distTiles <= range) { detected = true; break; }
            }
          }

          if (detected) {
            this.detectionFilter = senseMode.constructor.getDetectionFilter();
            return true;
          }
          if (isGM) return _origTokenIsVisible.call(this);
          return false;
        }

        // Default Foundry behavior for all other tokens
        return _origTokenIsVisible.call(this);
      },
      configurable: true
    });
  }

  // Override elevation to use whole-tile steps and display in tiles
  CONFIG.Canvas.elevationSnappingPrecision = 1;

  // Override Token tooltip to show elevation in tiles (not feet)
  foundry.canvas.placeables.Token.prototype._getTooltipText = function () {
    const elevation = this.document.elevation;
    if (elevation === 0 || elevation == null) return "";
    const sign = elevation > 0 ? "+" : "";
    return `${sign}${elevation} tiles`;
  };

  // Patch DocumentDirectory._onClickEntry to guard against null documents
  // Foundry core does not null-check getDocument() before accessing .sheet,
  // which crashes when a compendium entry cannot be loaded.
  const _origOnClickEntry = foundry.applications.sidebar.DocumentDirectory.prototype._onClickEntry;
  foundry.applications.sidebar.DocumentDirectory.prototype._onClickEntry = async function(event, target, options = {}) {
    const { _skipDeprecation = false } = options;
    if (!_skipDeprecation && (foundry.utils.getDefiningClass(this, "_onClickEntryName") !== foundry.applications.sidebar.DocumentDirectory)) {
      return _origOnClickEntry.call(this, event, target, options);
    }
    event.preventDefault();
    const el = target.closest("[data-entry-id]");
    if (!el) return;
    const { entryId } = el.dataset;
    const document = this.collection.get(entryId) ?? await this.collection.getDocument(entryId);
    if (!document) {
      ui.notifications.warn(`Could not load document "${entryId}" from this collection.`);
      return;
    }
    document.sheet.render(true);
  };

  // ── Custom inline formula enricher: [[expression]] ──
  // Evaluates simple math expressions in item descriptions.
  // Supports rollData variables like SL (Skill Level).
  // Example: "Increase Accuracy by [[2 * SL]]" → "Increase Accuracy by 2" at SL 1.
  CONFIG.TextEditor.enrichers.push({
    pattern: /\[\[([^\]]+)\]\]/g,
    enricher: (match, options) => {
      const formula = match[1].trim();
      const rollData = options.rollData ?? {};

      // Substitute rollData variables into the formula
      let expr = formula.replace(/\b([A-Za-z_]\w*)\b/g, (tok) => {
        if (tok in rollData) {
          const val = rollData[tok];
          return typeof val === "number" ? String(val) : tok;
        }
        return tok;
      });

      // Evaluate the math expression safely
      let result;
      try {
        // Replace shorthand math functions with Math.* equivalents
        const mathExpr = expr
          .replace(/\bmax\b/g, "Math.max")
          .replace(/\bmin\b/g, "Math.min")
          .replace(/\bfloor\b/g, "Math.floor")
          .replace(/\bceil\b/g, "Math.ceil")
          .replace(/\bround\b/g, "Math.round")
          .replace(/\babs\b/g, "Math.abs");
        // Verify only safe tokens: digits, operators, parens, commas, Math.*
        const safe = mathExpr.replace(/Math\.(max|min|floor|ceil|round|abs)/g, "0");
        if (/^[\d\s+\-*/().,]+$/.test(safe)) {
          result = Function(`"use strict"; return (${mathExpr});`)();
        } else {
          console.warn("Manashard enricher: blocked expression", formula, "→", expr, "→ safe:", safe);
          result = formula;
        }
      } catch {
        result = formula;
      }

      const span = document.createElement("span");
      span.classList.add("inline-formula");
      span.dataset.formula = formula;
      span.textContent = String(result);
      return span;
    }
  });
});

/* -------------------------------------------- */
/*  Setup Hook                                  */
/* -------------------------------------------- */

Hooks.once("setup", () => {
  // Restrict which actor types non-GM players can create.
  // Players may only create Adventurer (character).
  if (!game.user.isGM) {
    const allowed = new Set(["character"]);
    const types = game.documentTypes.Actor;
    if (Array.isArray(types)) {
      for (let i = types.length - 1; i >= 0; i--) {
        if (!allowed.has(types[i]) && types[i] !== "base") types.splice(i, 1);
      }
    }
  }
});

// Safety net: block non-GM players from creating restricted actor types
Hooks.on("preCreateActor", (actor, data, options, userId) => {
  if (game.user.isGM) return;
  const allowed = new Set(["character"]);
  if (!allowed.has(actor.type)) {
    ui.notifications.warn("You do not have permission to create that actor type.");
    return false;
  }
});

/* Party Sheet sidebar button and Compendium Browse All button removed —
   both are now accessible from the Manashard scene control group. */

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once("ready", async () => {
  console.log("Manashard | System Ready");

  // Initialize Party Composition Panel singleton
  game.manashard.partyCompPanel = new PartyCompositionPanel();

  // If combat is already active (e.g., page refresh mid-combat), show the panel
  if (game.combat?.started) {
    game.manashard.partyCompPanel.show();
  }

  // --- One-time legacy data cleanup (GM only) ---
  if (game.user.isGM) {
    const migrationVersion = 6;
    const lastMigration = game.settings.get("manashard", "migrationVersion") ?? 0;
    if (lastMigration < 1) {
      await _cleanupLegacyDocuments();
    }
    if (lastMigration < 2) {
      await _migrateSkillLoadouts();
    }
    if (lastMigration < 3) {
      await _migrateHostileToThreat();
    }
    if (lastMigration < 4) {
      await _migrateVisionSizeOffset();
    }
    if (lastMigration < 5) {
      await _migrateVisionDistanceUnits();
    }
    if (lastMigration < 6) {
      await _migrateSceneGridToTiles();
    }
    if (lastMigration < migrationVersion) {
      await game.settings.set("manashard", "migrationVersion", migrationVersion);
    }
  }
});

/* -------------------------------------------- */
/*  Chat Message Hooks                          */
/* -------------------------------------------- */

/**
 * Handle "Apply Effect to Targets" button on skill-info chat cards.
 * Applies a buff/debuff ActiveEffect to all currently targeted/selected tokens.
 */
async function _handleApplyBuff(btn) {
  const buffJson = btn.dataset.buff;
  if (!buffJson) return;

  let buff;
  try {
    buff = JSON.parse(buffJson);
  } catch (e) {
    console.warn("Manashard | Failed to parse buff data", e);
    return;
  }

  // Collect target tokens (prefer targets, fall back to controlled)
  const targets = game.user.targets.size > 0
    ? [...game.user.targets]
    : canvas.tokens?.controlled ?? [];

  if (!targets.length) {
    ui.notifications.warn("Select or target tokens to apply the effect to.");
    return;
  }

  for (const token of targets) {
    if (!token.actor) continue;
    await applyBuffEffect(token.actor, buff.name, buff.img, buff.duration, buff.rules ?? [], buff.description ?? "");
  }

  btn.disabled = true;
  btn.classList.add("applied");
  btn.innerHTML = `<i class="fas fa-check"></i> Applied to ${targets.length} target${targets.length !== 1 ? "s" : ""}`;
}

// Use document-level event delegation for Apply Damage button handling.
// This reliably works regardless of Foundry V13's chat DOM structure.
Hooks.once("ready", () => {
  // Register stat check socket listener for contested checks
  registerStatCheckSocket();

  document.addEventListener("click", (event) => {
    const btn = event.target.closest(".acc-apply-damage");
    if (btn) {
      event.preventDefault();
      event.stopPropagation();
      applyDamageFromChat(event, btn);
    }
    const stealBtn = event.target.closest(".steal-apply-btn");
    if (stealBtn) {
      event.preventDefault();
      event.stopPropagation();
      applyStealFromChat(event, stealBtn);
    }
    const pillageBtn = event.target.closest(".pillage-apply-btn");
    if (pillageBtn) {
      event.preventDefault();
      event.stopPropagation();
      applyPillageFromChat(event, pillageBtn);
    }
    const conBtn = event.target.closest(".con-apply-btn");
    if (conBtn) {
      event.preventDefault();
      event.stopPropagation();
      applyConsumableFromChat(event, conBtn);
    }
    const itemApplyBtn = event.target.closest(".item-card-apply");
    if (itemApplyBtn) {
      event.preventDefault();
      event.stopPropagation();
      applyItemCardEffect(event, itemApplyBtn);
    }
    const buffBtn = event.target.closest(".scc-apply-buff");
    if (buffBtn) {
      event.preventDefault();
      event.stopPropagation();
      _handleApplyBuff(buffBtn);
    }
  });

  // Right-click context menu: toggle formula panel on attack & stat check cards
  // Use capture phase so this fires before Foundry's native context menu handler
  document.addEventListener("contextmenu", (event) => {
    const card = event.target.closest(".attack-chat-card") || event.target.closest(".aoe-chat-card") || event.target.closest(".stat-check-card");
    if (!card) return;
    // Don't intercept if clicking inside the formula panel itself
    if (event.target.closest(".acc-formula-context") || event.target.closest(".sc-formula-context")) return;
    const formula = card.querySelector(".acc-formula-context") || card.querySelector(".sc-formula-context");
    if (!formula) return;
    event.preventDefault();
    event.stopPropagation();
    // Close all other open panels first
    document.querySelectorAll(".acc-formula-context.visible, .sc-formula-context.visible").forEach(el => {
      if (el !== formula) el.classList.remove("visible");
    });
    formula.classList.toggle("visible");
  }, { capture: true });

  // Close formula panel on click outside or Escape
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".acc-formula-context") && !event.target.closest(".sc-formula-context") && !event.target.closest(".acc-apply-damage")) {
      document.querySelectorAll(".acc-formula-context.visible, .sc-formula-context.visible").forEach(el => el.classList.remove("visible"));
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      document.querySelectorAll(".acc-formula-context.visible, .sc-formula-context.visible").forEach(el => el.classList.remove("visible"));
    }
  });
});

/* -------------------------------------------- */
/*  Combat Tracker Auto Pop-Out                 */
/* -------------------------------------------- */

// Auto pop-out the CTB tracker when a combat encounter is created
Hooks.on("createCombat", () => {
  const tracker = ui.combat;
  if (tracker && !tracker._popout) {
    // Small delay to ensure the sidebar has rendered the new combat first
    setTimeout(() => {
      try {
        tracker.renderPopout?.();
      } catch (e) {
        // Fallback: try the V13 createPopout method
        try {
          tracker.createPopout?.();
        } catch (e2) {
          console.warn("Manashard | Could not auto pop-out combat tracker:", e2);
        }
      }
    }, 100);
  }
});

/* -------------------------------------------- */
/*  Party Composition Panel Hooks               */
/* -------------------------------------------- */

// Show/refresh panel when combat state changes (start, turn advance, etc.)
Hooks.on("updateCombat", (combat, changes) => {
  const panel = game.manashard?.partyCompPanel;
  if (!panel) return;
  if (combat?.started) {
    if (!panel.visible) panel.show();
    else panel.refresh();
  }
});

// Hide panel when combat ends
Hooks.on("deleteCombat", () => {
  game.manashard?.partyCompPanel?.hide();
});

// Refresh panel when actor HP/MP changes
Hooks.on("updateActor", () => {
  game.manashard?.partyCompPanel?.refresh();
});

// Refresh panel when combatant state changes (defeated, turn advancement, etc.)
Hooks.on("updateCombatant", () => {
  game.manashard?.partyCompPanel?.refresh();
});

/* -------------------------------------------- */
/*  Combat Objective Hooks                      */
/* -------------------------------------------- */

// Check objective completion when a combatant is defeated
Hooks.on("updateCombatant", (combatant, changes) => {
  if ("defeated" in changes && combatant.combat?.started) {
    combatant.combat.checkObjectiveCompletion();
  }
});

/* -------------------------------------------- */
/*  Aura Engine Hooks                           */
/* -------------------------------------------- */

// Token movement, creation, or deletion — refresh auras on the scene
Hooks.on("updateToken", (token, changes) => {
  if ("x" in changes || "y" in changes) scheduleAuraRefresh(token.parent);
});
Hooks.on("createToken", (token) => scheduleAuraRefresh(token.parent));
Hooks.on("deleteToken", (token) => {
  scheduleAuraRefresh(token.parent);

});

// Item changes on an actor could add/remove aura rules
Hooks.on("updateItem", () => {
  if (canvas?.scene) scheduleAuraRefresh(canvas.scene);
});
Hooks.on("createItem", () => {
  if (canvas?.scene) scheduleAuraRefresh(canvas.scene);
});
Hooks.on("deleteItem", () => {
  if (canvas?.scene) scheduleAuraRefresh(canvas.scene);
});

// Scene change — clean up stale aura effects
Hooks.on("canvasReady", () => {
  if (canvas?.scene) scheduleAuraRefresh(canvas.scene);
});

/* -------------------------------------------- */
/*  Auto-Name Tokens (A, B, C …)                */
/* -------------------------------------------- */

/**
 * When dropping a token onto the canvas, append a letter suffix to
 * distinguish duplicates.  E.g. "Goblin Shaman A", "Goblin Shaman B", etc.
 * Only applies to non-linked (unlinked) tokens so PCs keep their names.
 */
Hooks.on("preCreateToken", (tokenDoc, data, options, userId) => {
  const scene = tokenDoc.parent;
  if (!scene) return;

  // For linked tokens (PCs), sync sight to the actor's computed vision
  // converted to scene distance units.
  if (tokenDoc.actorLink) {
    const actor = tokenDoc.actor;
    const vision = actor?.system?.vision;
    if (Number.isFinite(vision)) {
      const gridDist = scene.grid?.distance ?? 1;
      const sightRange = Math.max(0, vision) * gridDist;
      tokenDoc.updateSource({ "sight.enabled": true, "sight.range": sightRange });
    }
    return;
  }

  const baseName = tokenDoc.name;

  // Strip an existing trailing letter suffix so re-drops don't stack
  const stripped = baseName.replace(/\s+[A-Z]$/, "");

  // Collect letters already in use on the scene for this base name
  const usedLetters = new Set();
  for (const t of scene.tokens) {
    const match = t.name.match(/^(.+)\s+([A-Z])$/);
    if (match && match[1] === stripped) usedLetters.add(match[2]);
  }

  // Find the first available letter (A, B, C, …)
  let letter = "A";
  for (let i = 0; i < 26; i++) {
    const candidate = String.fromCharCode(65 + i);
    if (!usedLetters.has(candidate)) { letter = candidate; break; }
  }
  // Sync sight range to the actor's computed vision so newly placed tokens
  // always reflect the current stat value (not a stale prototype default).
  // Convert tiles → scene distance units.
  const actor = tokenDoc.actor;
  const vision = actor?.system?.vision;
  if (Number.isFinite(vision)) {
    const gridDist = scene.grid?.distance ?? 1;
    const sightRange = Math.max(0, vision) * gridDist;
    tokenDoc.updateSource({
      name: `${stripped} ${letter}`,
      displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
      "sight.enabled": true,
      "sight.range": sightRange
    });
  } else {
    tokenDoc.updateSource({ name: `${stripped} ${letter}`, displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS });
  }
});

/* -------------------------------------------- */
/*  Movement Range Highlight Hooks              */
/* -------------------------------------------- */

/** Check if the current scene has a visible grid. */
function _sceneHasGrid() {
  return (canvas.scene?.grid?.type ?? 0) !== 0;
}

Hooks.on("controlToken", (token, controlled) => {
  if (controlled) {
    // During combat: GM can click any token to inspect; turn-lock handles the rest
    // Outside combat on grid maps: clicking a token shows its movement range
    if (_sceneHasGrid()) {
      if (game.combat?.started) {
        if (game.user.isGM) showMovementRange(token);
      } else {
        showMovementRange(token);
      }
    }
    if (_threatRangeActive) showThreatRange(token);
  } else {
    if (!game.combat?.started) clearMovementRange();
    // GM: fall back to all-hostile overview; Player: clear
    if (_threatRangeActive) _refreshThreatRangeForControlled();
  }
});

// Restrict movement to within the highlighted range
Hooks.on("preMoveToken", (tokenDoc, movement) => {
  const waypoints = movement?.waypoints;
  if (!waypoints?.length) return;
  const dest = waypoints[waypoints.length - 1];
  if (!isWithinMovementRange(tokenDoc, dest.x, dest.y)) {
    ui.notifications.warn("That square is outside your movement range!");
    return false;
  }
});

// After a move completes, clear movement range (one move per turn) and refresh other overlays
Hooks.on("moveToken", (tokenDoc) => {
  const token = tokenDoc.object;
  if (token?.controlled) {
    // Clear movement highlight — movement is spent for this turn
    if (game.combat?.started) clearMovementRange();
  }
  // Refresh threat range when any token moves (enemy repositioning changes threat)
  if (_threatRangeActive) _refreshThreatRangeForControlled();
});

// When a wall/door changes, refresh movement range
Hooks.on("updateWall", () => {
  if (!_sceneHasGrid()) return;
  if (game.combat?.started) {
    const token = game.combat.combatant?.token?.object;
    if (token) showMovementRange(token);
  } else {
    const controlled = canvas.tokens?.controlled?.[0];
    if (controlled) showMovementRange(controlled);
  }
});

// Show movement range when combat starts or turn changes; clear on combat end
Hooks.on("updateCombat", (combat, changes) => {
  if (!combat?.started) return;
  if ("started" in changes || "turn" in changes || "round" in changes) {
    const token = combat.combatant?.token?.object;
    if (token) {
      setTimeout(() => showMovementRange(token), 50);
    }
  }
});

// Clear all overlays when combat ends
Hooks.on("deleteCombat", () => {
  clearMovementRange();
  _threatRangeActive = false;
  clearThreatRange();
});

// Clear movement + refresh threat when a token is deleted
Hooks.on("deleteToken", () => {
  clearMovementRange();
  if (_threatRangeActive) _refreshThreatRangeForControlled();
});

/* -------------------------------------------- */
/*  Enemy Threat Range Overlay                  */
/* -------------------------------------------- */

let _threatRangeActive = false;

/** Refresh threat overlay for the currently controlled token, or all hostiles for GM. */
function _refreshThreatRangeForControlled() {
  const controlled = canvas?.tokens?.controlled?.[0];
  if (controlled) {
    showThreatRange(controlled);
  } else if (game.user.isGM) {
    showThreatRange(null);
  } else {
    clearThreatRange();
  }
}

// Refresh threat overlay when tokens are created
Hooks.on("createToken", () => {
  if (_threatRangeActive) _refreshThreatRangeForControlled();
});

// Add threat range toggle to Token Controls toolbar
let _gmVisionActive = false;
let _gmVisionOriginal = null;
let _trapSensePreview = false;
let _sensePreview = false;

function _applyGmVision(active) {
  if (!canvas.ready) return;
  const scene = canvas.scene;

  if (active) {
    // Store original scene settings
    _gmVisionOriginal = {
      tokenVision: scene.tokenVision,
      "environment.globalLight.enabled": scene.environment.globalLight.enabled
    };
    // Override in memory only (not saved to DB) — GM client only
    scene.updateSource({tokenVision: false, "environment.globalLight.enabled": true});
  } else {
    // Restore original settings
    if (_gmVisionOriginal) {
      scene.updateSource(_gmVisionOriginal);
      _gmVisionOriginal = null;
    }
  }
  // Refresh the canvas perception so changes take effect
  canvas.perception.update({initializeVision: true, initializeLighting: true});
}

Hooks.on("getSceneControlButtons", (controls) => {
  const isGM = game.user.isGM;

  controls.manashard = {
    name: "manashard",
    title: "MANASHARD.Controls.ManashardTools",
    icon: "fa-solid fa-gem",
    order: 100,
    tools: {
      partySheet: {
        name: "partySheet",
        title: "MANASHARD.Controls.PartySheet",
        icon: "fa-solid fa-users",
        button: true,
        onChange: () => new PartySheet().render(true)
      },
      compendiumBrowser: {
        name: "compendiumBrowser",
        title: "MANASHARD.Controls.CompendiumBrowser",
        icon: "fa-solid fa-book-open",
        button: true,
        onChange: () => CompendiumBrowser.open()
      },
      encounterBuilder: {
        name: "encounterBuilder",
        title: "MANASHARD.EncBuilder.Title",
        icon: "fa-solid fa-helmet-battle",
        button: true,
        visible: isGM,
        onChange: () => EncounterBuilder.open()
      },
      gmVision: {
        name: "gmVision",
        title: "MANASHARD.Controls.GmVision",
        icon: "fa-solid fa-eye",
        toggle: true,
        visible: isGM,
        active: _gmVisionActive,
        onChange: (event, active) => {
          _gmVisionActive = active;
          _applyGmVision(active);
        }
      },
      trapSensePreview: {
        name: "trapSensePreview",
        title: "MANASHARD.Controls.TrapSensePreview",
        icon: "fa-solid fa-triangle-exclamation",
        toggle: true,
        visible: isGM,
        active: _trapSensePreview,
        onChange: (event, active) => {
          _trapSensePreview = active;
          canvas.perception.update({refreshVision: true});
        }
      },
      sensePreview: {
        name: "sensePreview",
        title: "MANASHARD.Controls.SensePreview",
        icon: "fa-solid fa-eye-low-vision",
        toggle: true,
        visible: isGM,
        active: _sensePreview,
        onChange: (event, active) => {
          _sensePreview = active;
          canvas.perception.update({refreshVision: true});
        }
      },
      threatRange: {
        name: "threatRange",
        title: "MANASHARD.Controls.ThreatRange",
        icon: "fa-solid fa-crosshairs",
        toggle: true,
        active: _threatRangeActive,
        onChange: (event, active) => {
          _threatRangeActive = active;
          if (active) {
            _refreshThreatRangeForControlled();
          } else {
            clearThreatRange();
          }
        }
      },
      partyComp: {
        name: "partyComp",
        title: "MANASHARD.Controls.PartyComp",
        icon: "fa-solid fa-heart-pulse",
        button: true,
        onClick: () => {
          const panel = game.manashard?.partyCompPanel;
          if (!panel) return;
          if (panel.visible) panel.hide();
          else panel.show();
        }
      }
    }
  };
});

/* -------------------------------------------- */
/*  Token Info Panel Hooks                      */
/* -------------------------------------------- */

// Show/hide token info panel on hover
Hooks.on("hoverToken", (token, hovered) => {
  const panel = game.manashard?.tokenInfoPanel;
  if (!game.settings.get("manashard", "tokenInfoShow")) return;

  if (hovered) {
    panel?.show(token);
  } else {
    panel?.hide();
  }
});

// Show/hide status effect sidebar panel on token select (persists while selected)
Hooks.on("controlToken", (token, controlled) => {
  const sepPanel = game.manashard?.statusEffectPanel;
  if (controlled) {
    sepPanel?.show(token);
  } else {
    sepPanel?.hide();
  }
});

// Refresh panels when actor data changes
Hooks.on("updateActor", (actor) => {
  game.manashard?.tokenInfoPanel?.refresh(actor);
  game.manashard?.statusEffectPanel?.refresh(actor);
});

// Refresh panels when token data changes (name, bars, etc.)
Hooks.on("updateToken", (tokenDoc) => {
  game.manashard?.tokenInfoPanel?.refreshToken(tokenDoc);
  game.manashard?.statusEffectPanel?.refreshToken(tokenDoc);
});

// Refresh status panel when ActiveEffects change (buff/debuff AEs)
Hooks.on("createActiveEffect", (effect) => {
  if (effect.parent) game.manashard?.statusEffectPanel?.refresh(effect.parent);
});
Hooks.on("deleteActiveEffect", (effect) => {
  if (effect.parent) game.manashard?.statusEffectPanel?.refresh(effect.parent);
});
Hooks.on("updateActiveEffect", (effect) => {
  if (effect.parent) game.manashard?.statusEffectPanel?.refresh(effect.parent);
});

// Reposition panel on canvas pan/zoom
Hooks.on("canvasPan", () => {
  game.manashard?.tokenInfoPanel?.reposition();
});

// Reposition status panel when sidebar collapses/expands
Hooks.on("collapseSidebar", () => {
  setTimeout(() => {
    const sepPanel = game.manashard?.statusEffectPanel;
    if (sepPanel?.token) sepPanel.show(sepPanel.token);
  }, 250);
});

// Hide panels on scene change
Hooks.on("canvasReady", () => {
  game.manashard?.tokenInfoPanel?.hide();
  game.manashard?.statusEffectPanel?.hide();

  // Re-apply GM Vision state after scene/canvas changes
  if (_gmVisionActive && game.user.isGM) {
    _applyGmVision(true);
  }
});

// Hide panels if tracked token is deleted
Hooks.on("deleteToken", (tokenDoc) => {
  const panel = game.manashard?.tokenInfoPanel;
  if (panel?.token?.document?.id === tokenDoc?.id) {
    panel.hide();
  }
  const sepPanel = game.manashard?.statusEffectPanel;
  if (sepPanel?.token?.document?.id === tokenDoc?.id) {
    sepPanel.hide();
  }
});

/* -------------------------------------------- */
/*  Token Status Effect Icon Hooks              */
/* -------------------------------------------- */

// Draw status effect icons in a circle ring around tokens
Hooks.on("refreshToken", (token) => {
  drawStatusEffectRing(token);
});

// Force token icon refresh when actor statuses or durations change
Hooks.on("updateActor", (actor, changes) => {
  if (changes.system?.statusEffects !== undefined || changes.flags?.manashard?.statusDurations !== undefined) {
    for (const token of actor.getActiveTokens(true)) {
      token.renderFlags.set({ refreshEffects: true });
    }
  }
});

// Initial sync pass: preload status textures, then ensure display AEs exist
Hooks.on("canvasReady", async () => {
  await preloadStatusTextures();
  setTimeout(() => syncAllTokenStatuses(), 300);

  // Ensure Trap Sense and Sense detection modes are synced for all player-owned
  // actors on scene load (covers cases where the rule engine ran in a previous
  // session but placed tokens weren't updated).
  for (const token of canvas.tokens?.placeables ?? []) {
    const actor = token.actor;
    if (!actor || actor.type === "trap") continue;
    if (actor.system._hasTrapSense !== undefined) {
      syncTrapSenseDetection(actor);
    }
    if (actor.system._hasSense !== undefined) {
      syncSenseDetection(actor);
    }
  }

  // Ensure placed token sight.range matches the actor's vision stat converted
  // to this scene's distance units (sight.range is in distance units, not tiles).
  const gridDist = canvas.scene?.grid?.distance ?? 1;
  for (const token of canvas.tokens?.placeables ?? []) {
    const actor = token.actor;
    if (!actor || actor.type === "trap") continue;
    const vision = actor.system.vision;
    if (vision === undefined) continue;
    const expectedRange = vision * gridDist;
    if (token.document.sight.range !== expectedRange) {
      await token.document.update({ "sight.enabled": true, "sight.range": expectedRange });
    }
  }
});

/* -------------------------------------------- */
/*  Token Info Panel Settings                   */
/* -------------------------------------------- */

function _registerTokenInfoSettings() {
  game.settings.register("manashard", "tokenInfoShow", {
    name: "MANASHARD.Settings.TokenInfoShow",
    hint: "MANASHARD.Settings.TokenInfoShowHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.registerMenu("manashard", "tokenInfoConfig", {
    name: "MANASHARD.Settings.TokenInfoConfigLabel",
    label: "MANASHARD.Settings.TokenInfoConfigLabel",
    hint: "MANASHARD.Settings.TokenInfoConfigHint",
    icon: "fa-solid fa-cogs",
    type: TokenInfoConfig,
    restricted: true
  });

  game.settings.register("manashard", "tokenInfoShowName", {
    name: "MANASHARD.Settings.TokenInfoShowName",
    hint: "MANASHARD.Settings.TokenInfoShowNameHint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("manashard", "tokenInfoShowHP", {
    name: "MANASHARD.Settings.TokenInfoShowHP",
    hint: "MANASHARD.Settings.TokenInfoShowHPHint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("manashard", "tokenInfoShowMP", {
    name: "MANASHARD.Settings.TokenInfoShowMP",
    hint: "MANASHARD.Settings.TokenInfoShowMPHint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("manashard", "tokenInfoShowType", {
    name: "MANASHARD.Settings.TokenInfoShowType",
    hint: "MANASHARD.Settings.TokenInfoShowTypeHint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });
}

/* -------------------------------------------- */
/*  Character Creation Config Settings          */
/* -------------------------------------------- */

function _registerCreationSettings() {
  game.settings.registerMenu("manashard", "creationConfig", {
    name: "MANASHARD.Settings.CreationConfigLabel",
    label: "MANASHARD.Settings.CreationConfigLabel",
    hint: "MANASHARD.Settings.CreationConfigHint",
    icon: "fa-solid fa-hat-wizard",
    type: CreationConfig,
    restricted: true
  });

  game.settings.register("manashard", "creationStatPool", {
    name: "MANASHARD.Settings.CreationStatPool",
    scope: "world",
    config: false,
    type: Number,
    default: 18
  });

  game.settings.register("manashard", "creationGrowthPool", {
    name: "MANASHARD.Settings.CreationGrowthPool",
    scope: "world",
    config: false,
    type: Number,
    default: 280
  });

  game.settings.register("manashard", "creationGrowthBaseline", {
    name: "MANASHARD.Settings.CreationGrowthBaseline",
    scope: "world",
    config: false,
    type: Number,
    default: 5
  });

  game.settings.register("manashard", "creationStartingEiress", {
    name: "MANASHARD.Settings.CreationStartingEiress",
    scope: "world",
    config: false,
    type: Number,
    default: 500
  });

  game.settings.register("manashard", "creationMaxEquipRank", {
    name: "MANASHARD.Settings.CreationMaxEquipRank",
    scope: "world",
    config: false,
    type: String,
    default: "f"
  });

  game.settings.register("manashard", "creationExcludedSpecies", {
    name: "MANASHARD.Settings.CreationExcludedSpecies",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register("manashard", "creationExcludedJobs", {
    name: "MANASHARD.Settings.CreationExcludedJobs",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
}

/* -------------------------------------------- */
/*  Handlebars Helpers                          */
/* -------------------------------------------- */

function _registerHandlebarsHelpers() {
  // Equality check
  Handlebars.registerHelper("eq", (a, b) => a === b);
  Handlebars.registerHelper("ne", (a, b) => a !== b);

  // Greater than
  Handlebars.registerHelper("gt", (a, b) => a > b);

  // Greater than or equal
  Handlebars.registerHelper("gte", (a, b) => a >= b);

  // Less than or equal
  Handlebars.registerHelper("lte", (a, b) => a <= b);

  // Min/Max helpers
  Handlebars.registerHelper("min", (a, b) => Math.min(a, b));
  Handlebars.registerHelper("max", (a, b) => Math.max(a, b));
  Handlebars.registerHelper("includes", (arr, val) => Array.isArray(arr) && arr.includes(val));

  // Math helper for bar width calculations
  Handlebars.registerHelper("math", function (...args) {
    // Remove the Handlebars options object from the end
    args.pop();
    if (args.length < 3) return 0;
    let result = Number(args[0]);
    for (let i = 1; i < args.length; i += 2) {
      const op = args[i];
      const val = Number(args[i + 1]);
      switch (op) {
        case "+": result += val; break;
        case "-": result -= val; break;
        case "*": result *= val; break;
        case "/": result = val !== 0 ? result / val : 0; break;
      }
    }
    return Math.min(Math.max(result, 0), 100);
  });

  // Concat helper
  Handlebars.registerHelper("concat", function (...args) {
    args.pop(); // Remove Handlebars options
    return args.join("");
  });

  // Lowercase helper for rule type CSS classes
  Handlebars.registerHelper("lowercase", (str) => {
    return typeof str === "string" ? str.toLowerCase() : "";
  });

  Handlebars.registerHelper("upper", (str) => {
    return typeof str === "string" ? str.toUpperCase() : "";
  });

  // Substring helper for truncated labels
  Handlebars.registerHelper("substring", (str, start, end) => {
    return typeof str === "string" ? str.substring(start, end) : "";
  });

  // Array literal helper
  Handlebars.registerHelper("array", function (...args) {
    args.pop(); // Remove Handlebars options
    return args;
  });

  // Rule summary helper — generates human-readable description of a rule element
  Handlebars.registerHelper("ruleSummary", (rule) => {
    return ruleSummary(rule);
  });

}

/* -------------------------------------------- */
/*  Preload Templates                           */
/* -------------------------------------------- */

function _preloadHandlebarsTemplates() {
  return foundry.applications.handlebars.loadTemplates([
    "systems/manashard/templates/actor/parts/actor-header.hbs",
    "systems/manashard/templates/actor/parts/actor-tabs.hbs",
    "systems/manashard/templates/actor/parts/actor-stats.hbs",
    "systems/manashard/templates/actor/parts/actor-equipment.hbs",
    "systems/manashard/templates/actor/parts/actor-combat.hbs",
    "systems/manashard/templates/actor/parts/actor-biography.hbs",
    "systems/manashard/templates/item/parts/item-header.hbs",
    "systems/manashard/templates/item/parts/item-tabs.hbs",
    "systems/manashard/templates/item/parts/item-description.hbs",
    "systems/manashard/templates/item/parts/item-details.hbs",
    "systems/manashard/templates/item/parts/item-rules.hbs",
    "systems/manashard/templates/dialog/combat-forecast.hbs",
    "systems/manashard/templates/dialog/stat-check-forecast.hbs",
    "systems/manashard/templates/chat/attack-result.hbs",
    "systems/manashard/templates/chat/stat-check.hbs",
    "systems/manashard/templates/chat/skill-info.hbs",
    "systems/manashard/templates/chat/item-card.hbs",
    "systems/manashard/templates/combat/ctb-tracker.hbs",
    "systems/manashard/templates/apps/wizard/wizard-shell.hbs",
    "systems/manashard/templates/apps/wizard/step-name.hbs",
    "systems/manashard/templates/apps/wizard/step-species.hbs",
    "systems/manashard/templates/apps/wizard/step-job.hbs",
    "systems/manashard/templates/apps/wizard/step-stats.hbs",
    "systems/manashard/templates/apps/wizard/step-growth.hbs",
    "systems/manashard/templates/apps/wizard/step-equipment.hbs",
    "systems/manashard/templates/apps/wizard/step-biography.hbs",
    "systems/manashard/templates/apps/wizard/step-summary.hbs"
  ]);
}

/* -------------------------------------------- */
/*  Legacy Data Cleanup                         */
/* -------------------------------------------- */

/**
 * Delete world-level actors and items whose type no longer exists in the system.
 * Runs once per migration version bump, GM only.
 */
async function _cleanupLegacyDocuments() {
  const invalidActorIds = game.actors.invalidDocumentIds;

  // Clean up invalid actors (e.g. old "npc" type)
  if (invalidActorIds.size > 0) {
    const names = [];
    for (const id of invalidActorIds) {
      const raw = game.actors.getInvalid(id);
      names.push(raw?.name ?? id);
    }
    console.log(`Manashard | Removing ${invalidActorIds.size} invalid actor(s):`, names);
    for (const id of invalidActorIds) {
      try {
        await Actor.deleteDocuments([id]);
      } catch (e) {
        console.warn(`Manashard | Failed to delete invalid actor ${id}:`, e);
      }
    }
  }

  // Clean up invalid embedded items on valid actors (e.g. old "jobManacite" type)
  for (const actor of game.actors) {
    const invalidItemIds = actor.items.invalidDocumentIds;
    if (invalidItemIds.size > 0) {
      const names = [];
      for (const id of invalidItemIds) {
        const raw = actor.items.getInvalid(id);
        names.push(raw?.name ?? id);
      }
      console.log(`Manashard | Removing ${invalidItemIds.size} invalid item(s) from ${actor.name}:`, names);
      try {
        await actor.deleteEmbeddedDocuments("Item", Array.from(invalidItemIds));
      } catch (e) {
        console.warn(`Manashard | Failed to delete invalid items from ${actor.name}:`, e);
      }
    }
  }

  ui.notifications.info("Manashard | Legacy data cleanup complete.");
}

/**
 * Migration v2: Convert legacy "equipped" skill manacites to the new library/loadout system.
 * Characters with equipped skill manacites but empty skillLibrary get auto-migrated.
 */
async function _migrateSkillLoadouts() {
  let migrated = 0;
  for (const actor of game.actors) {
    if (actor.type !== "character") continue;
    const library = actor.system.skillLibrary ?? [];
    if (library.length > 0) continue; // Already migrated

    const equippedSkills = actor.items.filter(
      i => i.type === "manacite" && i.system.manaciteType === "skill" && i.system.equipped
    );
    if (equippedSkills.length === 0) continue;

    // Mark all equipped skills as absorbed
    const itemUpdates = equippedSkills.map(i => ({ _id: i.id, "system.absorbed": true }));
    await actor.updateEmbeddedDocuments("Item", itemUpdates);

    // Populate library and loadout
    const ids = equippedSkills.map(i => i.id);
    await actor.update({
      "system.skillLibrary": ids,
      "system.skillLoadout": ids
    });

    migrated++;
    console.log(`Manashard | Migrated ${equippedSkills.length} skill(s) to library/loadout for ${actor.name}`);
  }
  if (migrated > 0) {
    ui.notifications.info(`Manashard | Migrated ${migrated} character(s) to Manacite v3 loadout system.`);
  }
}

async function _migrateHostileToThreat() {
  let migrated = 0;
  // Migrate world actors
  for (const actor of game.actors) {
    if (actor.type === "hostileUnit") {
      await actor.update({ type: "threat" });
      migrated++;
    }
  }
  // Migrate unlinked tokens on all scenes
  for (const scene of game.scenes) {
    const tokenUpdates = [];
    for (const token of scene.tokens) {
      if (!token.actorLink && token.actor?.type === "hostileUnit") {
        tokenUpdates.push({ _id: token.id, "delta.type": "threat" });
      }
    }
    if (tokenUpdates.length) {
      await scene.updateEmbeddedDocuments("Token", tokenUpdates);
      migrated += tokenUpdates.length;
    }
  }
  // Migrate compendium packs
  for (const pack of game.packs.filter(p => p.metadata.type === "Actor" && p.metadata.packageType === "system")) {
    const wasLocked = pack.locked;
    if (wasLocked) await pack.configure({ locked: false });
    const docs = await pack.getDocuments();
    for (const doc of docs) {
      if (doc.type === "hostileUnit") {
        await doc.update({ type: "threat" });
        migrated++;
      }
    }
    if (wasLocked) await pack.configure({ locked: true });
  }
  if (migrated > 0) {
    ui.notifications.info(`Manashard | Migrated ${migrated} actor(s) from Hostile Unit to Threat type.`);
  }
}

/**
 * Migration 4: Re-sync token sight.range to account for token size.
 * sight.range now includes a (size - 1) offset so vision measures from token edge.
 */
async function _migrateVisionSizeOffset() {
  let migrated = 0;
  for (const actor of game.actors) {
    if (actor.type === "trap") continue;
    const vision = actor.system.vision;
    if (vision === undefined) continue;
    const size = actor.system.size ?? 1;
    const expectedRange = vision + (size - 1);
    const currentRange = actor.prototypeToken?.sight?.range;
    if (currentRange !== expectedRange) {
      await actor.update({
        "prototypeToken.sight.enabled": true,
        "prototypeToken.sight.range": expectedRange
      });
      // Update placed tokens on all scenes
      for (const scene of game.scenes) {
        const tokens = scene.tokens.filter(t => t.actorId === actor.id);
        for (const token of tokens) {
          if (token.sight.range !== expectedRange) {
            await token.update({ "sight.enabled": true, "sight.range": expectedRange });
          }
        }
      }
      migrated++;
    }
  }
  if (migrated > 0) {
    ui.notifications.info(`Manashard | Updated vision range for ${migrated} actor(s) to account for token size.`);
  }
}

/**
 * Migration 5: Fix vision sight.range to use correct distance units.
 * Removes the old (size - 1) offset from prototype tokens (Foundry adds token
 * edge padding internally), and ensures placed tokens use the scene's distance
 * units so sight.range = vision * grid.distance.
 */
async function _migrateVisionDistanceUnits() {
  let migrated = 0;
  for (const actor of game.actors) {
    if (actor.type === "trap") continue;
    const vision = actor.system.vision;
    if (vision === undefined) continue;
    const currentRange = actor.prototypeToken?.sight?.range;
    if (currentRange !== vision) {
      await actor.update({
        "prototypeToken.sight.enabled": true,
        "prototypeToken.sight.range": vision
      });
      migrated++;
    }
    // Fix placed tokens on all scenes: convert tiles to scene distance units
    for (const scene of game.scenes) {
      const gridDist = scene.grid?.distance ?? 1;
      const expectedRange = vision * gridDist;
      const tokens = scene.tokens.filter(t => t.actorId === actor.id);
      for (const token of tokens) {
        if (token.sight.range !== expectedRange) {
          await token.update({ "sight.enabled": true, "sight.range": expectedRange });
          migrated++;
        }
      }
    }
  }
  if (migrated > 0) {
    ui.notifications.info(`Manashard | Fixed vision range for ${migrated} actor/token(s) to use correct distance units.`);
  }
}

/**
 * Migration 6 — Normalise all scenes to grid.distance = 1, grid.units = "tiles".
 * Scenes created before the system set these defaults may still use 5 ft.
 * Also rescales sight.range on every placed token so the visible radius
 * stays the same number of grid squares after the distance change.
 */
async function _migrateSceneGridToTiles() {
  let migrated = 0;
  for (const scene of game.scenes) {
    const oldDist = scene.grid?.distance ?? 1;
    const oldUnits = scene.grid?.units ?? "";
    if (oldDist === 1 && oldUnits === "tiles") continue;

    // Rescale token sight ranges: oldRange was in old distance units,
    // convert back to tiles then store as-is (new grid.distance = 1).
    const tokenUpdates = [];
    for (const token of scene.tokens) {
      const oldRange = token.sight?.range;
      if (!Number.isFinite(oldRange) || oldRange === 0) continue;
      const rangeInTiles = oldRange / oldDist;
      if (oldRange !== rangeInTiles) {
        tokenUpdates.push({ _id: token.id, "sight.range": rangeInTiles });
      }
    }
    if (tokenUpdates.length) {
      await scene.updateEmbeddedDocuments("Token", tokenUpdates);
    }

    await scene.update({ "grid.distance": 1, "grid.units": "tiles" });
    migrated++;
  }
  if (migrated > 0) {
    ui.notifications.info(`Manashard | Converted ${migrated} scene(s) to grid distance 1 tile.`);
  }
}

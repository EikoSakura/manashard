export const MANASHARD = {};

/**
 * All NPC-type actor subtypes. Use this set for type checks instead of
 * comparing against individual type strings.
 */
MANASHARD.NPC_TYPES = new Set(["threat", "trap"]);

/**
 * Core stats used by all actors.
 * HP and MP are resource pools; the rest are growth-rate stats.
 */
MANASHARD.stats = {
  hp: "MANASHARD.Stats.HP",
  mp: "MANASHARD.Stats.MP",
  str: "MANASHARD.Stats.STR",
  agi: "MANASHARD.Stats.AGI",
  mag: "MANASHARD.Stats.MAG",
  end: "MANASHARD.Stats.END",
  spi: "MANASHARD.Stats.SPI",
  luk: "MANASHARD.Stats.LUK",
  int: "MANASHARD.Stats.INT",
  chm: "MANASHARD.Stats.CHM"
};

/**
 * Stat abbreviations for display.
 */
MANASHARD.statAbbreviations = {
  hp: "MANASHARD.StatsAbbr.HP",
  mp: "MANASHARD.StatsAbbr.MP",
  str: "MANASHARD.StatsAbbr.STR",
  agi: "MANASHARD.StatsAbbr.AGI",
  mag: "MANASHARD.StatsAbbr.MAG",
  end: "MANASHARD.StatsAbbr.END",
  spi: "MANASHARD.StatsAbbr.SPI",
  luk: "MANASHARD.StatsAbbr.LUK",
  int: "MANASHARD.StatsAbbr.INT",
  chm: "MANASHARD.StatsAbbr.CHM"
};

/**
 * Adventurer Ranks with RP thresholds and growth bonuses.
 * Skill slots are now determined by equipment manacite slots + job bonus, not rank.
 */
MANASHARD.ranks = {
  f: { label: "MANASHARD.Ranks.F", rpThreshold: 0, trialGate: false, growthBonus: 0, hpBase: 0, mpBase: 0 },
  e: { label: "MANASHARD.Ranks.E", rpThreshold: 30, trialGate: false, growthBonus: 10, hpBase: 2, mpBase: 1 },
  d: { label: "MANASHARD.Ranks.D", rpThreshold: 80, trialGate: false, growthBonus: 15, hpBase: 5, mpBase: 2 },
  c: { label: "MANASHARD.Ranks.C", rpThreshold: 160, trialGate: true, growthBonus: 20, hpBase: 10, mpBase: 5 },
  b: { label: "MANASHARD.Ranks.B", rpThreshold: 280, trialGate: true, growthBonus: 20, hpBase: 16, mpBase: 8 },
  a: { label: "MANASHARD.Ranks.A", rpThreshold: 440, trialGate: false, growthBonus: 25, hpBase: 24, mpBase: 12 },
  s: { label: "MANASHARD.Ranks.S", rpThreshold: 640, trialGate: true, growthBonus: 25, hpBase: 35, mpBase: 17 }
};

/**
 * Rank-based stat caps — hard ceiling for each stat per rank.
 * Stats cannot grow above these values regardless of growth rates or modifiers.
 */
MANASHARD.rankStatCaps = {
  f: { hp: 30, mp: 20, str: 8, agi: 8, mag: 8, end: 8, spi: 8, luk: 8, int: 8, chm: 8 },
  e: { hp: 40, mp: 28, str: 12, agi: 12, mag: 12, end: 12, spi: 12, luk: 12, int: 12, chm: 12 },
  d: { hp: 52, mp: 36, str: 16, agi: 16, mag: 16, end: 16, spi: 16, luk: 16, int: 16, chm: 16 },
  c: { hp: 68, mp: 46, str: 21, agi: 21, mag: 21, end: 21, spi: 21, luk: 21, int: 21, chm: 21 },
  b: { hp: 88, mp: 58, str: 27, agi: 27, mag: 27, end: 27, spi: 27, luk: 27, int: 27, chm: 27 },
  a: { hp: 115, mp: 75, str: 33, agi: 33, mag: 33, end: 33, spi: 33, luk: 33, int: 33, chm: 33 },
  s: { hp: 150, mp: 100, str: 40, agi: 40, mag: 40, end: 40, spi: 40, luk: 40, int: 40, chm: 40 }
};

/**
 * Elements in the Manacite system.
 */
MANASHARD.elements = {
  dark: "MANASHARD.Elements.Dark",
  earth: "MANASHARD.Elements.Earth",
  fire: "MANASHARD.Elements.Fire",
  ice: "MANASHARD.Elements.Ice",
  light: "MANASHARD.Elements.Light",
  lightning: "MANASHARD.Elements.Lightning",
  null: "MANASHARD.Elements.Null",
  water: "MANASHARD.Elements.Water",
  wind: "MANASHARD.Elements.Wind"
};

/**
 * Elemental interaction tiers.
 */
MANASHARD.elementalTiers = {
  weak: "MANASHARD.ElementalTiers.Weak",
  neutral: "MANASHARD.ElementalTiers.Neutral",
  resist: "MANASHARD.ElementalTiers.Resist",
  immune: "MANASHARD.ElementalTiers.Immune",
  absorb: "MANASHARD.ElementalTiers.Absorb"
};

/**
 * Elemental tier damage multipliers.
 * Applied after defense subtraction during combat resolution.
 */
MANASHARD.elementalMultipliers = {
  weak: 1.5,
  neutral: 1.0,
  resist: 0.5,
  immune: 0,
  absorb: -1
};


/**
 * Weapon categories.
 */
MANASHARD.weaponCategories = {
  axes: "MANASHARD.WeaponCategories.Axes",
  bows: "MANASHARD.WeaponCategories.Bows",
  chains: "MANASHARD.WeaponCategories.Chains",
  daggers: "MANASHARD.WeaponCategories.Daggers",
  firearms: "MANASHARD.WeaponCategories.Firearms",
  fist: "MANASHARD.WeaponCategories.Fist",
  grimoires: "MANASHARD.WeaponCategories.Grimoires",
  natural: "MANASHARD.WeaponCategories.Natural",
  polearms: "MANASHARD.WeaponCategories.Polearms",
  shields: "MANASHARD.WeaponCategories.Shields",
  staves: "MANASHARD.WeaponCategories.Staves",
  swords: "MANASHARD.WeaponCategories.Swords"
};

/**
 * Armor categories.
 */
MANASHARD.armorCategories = {
  cloth: "MANASHARD.ArmorCategories.Cloth",
  light: "MANASHARD.ArmorCategories.Light",
  heavy: "MANASHARD.ArmorCategories.Heavy"
};

/**
 * Damage types.
 */
MANASHARD.damageTypes = {
  none: "MANASHARD.DamageTypes.None",
  physical: "MANASHARD.DamageTypes.Physical",
  magical: "MANASHARD.DamageTypes.Magical",
  elemental: "MANASHARD.DamageTypes.Elemental",
  healing: "MANASHARD.DamageTypes.Healing",
  barrier: "MANASHARD.DamageTypes.Barrier",
  retaliatory: "MANASHARD.DamageTypes.Retaliatory"
};

/**
 * Retaliation modes for retaliatory damage type.
 */
MANASHARD.retaliationModes = {
  flat: "MANASHARD.RetaliationModes.Flat",
  percent: "MANASHARD.RetaliationModes.Percent",
  stat: "MANASHARD.RetaliationModes.Stat"
};

/**
 * Weapon category badge colors for tooltip display.
 */
MANASHARD.weaponCategoryColors = {
  swords: "#ee5544",
  daggers: "#cc4466",
  axes: "#ee8844",
  polearms: "#4488ee",
  chains: "#7766bb",
  fist: "#dd6633",
  bows: "#66bb66",
  firearms: "#88aacc",
  grimoires: "#9966cc",
  staves: "#ddaa22",
  shields: "#6699aa",
  natural: "#889966"
};

/**
 * Damage type badge colors for tooltip display.
 */
MANASHARD.damageTypeColors = {
  physical: "#cc9977",
  magical: "#8866cc",
  elemental: "#44bbaa",
  healing: "#44cc88",
  barrier: "#c8dcff"
};

/**
 * Weapon handedness options.
 */
MANASHARD.handedness = {
  "1h": "MANASHARD.Handedness1H",
  "2h": "MANASHARD.Handedness2H"
};

/**
 * Weapon range type options.
 */
MANASHARD.rangeTypes = {
  melee: "MANASHARD.RangeTypes.Melee",
  ranged: "MANASHARD.RangeTypes.Ranged",
  thrown: "MANASHARD.RangeTypes.Thrown"
};

/**
 * Skill range type options (no thrown — weapon-only).
 */
MANASHARD.skillRangeTypes = {
  none: "MANASHARD.RangeTypes.None",
  self: "MANASHARD.RangeTypes.Self",
  melee: "MANASHARD.RangeTypes.Melee",
  ranged: "MANASHARD.RangeTypes.Ranged",
  weapon: "MANASHARD.RangeTypes.Weapon"
};

/**
 * Manacite types — Job or Skill.
 */
MANASHARD.manaciteTypes = {
  job: "MANASHARD.ManaciteTypes.Job",
  skill: "MANASHARD.ManaciteTypes.Skill"
};

/**
 * Manacite sub-types — the 3 categories of Skill Manacite.
 * Magic (green)    — Spells with MP cost, Chant modes, elements.
 * Art (gold)       — Physical/hybrid combat techniques with MP cost.
 * Passive (purple) — Always-on effects while Manacite is equipped.
 */
MANASHARD.manaciteSubTypes = {
  art: "MANASHARD.ManaciteSubTypes.Art",
  magic: "MANASHARD.ManaciteSubTypes.Magic",
  passive: "MANASHARD.ManaciteSubTypes.Passive"
};

/**
 * Manacite sub-type color map for UI display.
 */
MANASHARD.manaciteSubTypeColors = {
  magic: "#4ecdc4",
  art: "#f9ca24",
  passive: "#9b59b6"
};

/**
 * Manacite sub-type icons for UI display.
 */
MANASHARD.manaciteSubTypeIcons = {
  magic: "fas fa-hat-wizard",
  art: "fas fa-swords",
  passive: "fas fa-shield-halved"
};

/**
 * Passive modes for Passive Manacite.
 */
MANASHARD.passiveModes = {
  always: "MANASHARD.PassiveModes.Always",
  conditional: "MANASHARD.PassiveModes.Conditional"
};

/**
 * Skill target types.
 */
MANASHARD.targetTypes = {
  aoe: "MANASHARD.TargetTypes.AoE",
  self: "MANASHARD.TargetTypes.Self",
  single: "MANASHARD.TargetTypes.Single"
};

/**
 * AOE shape types for skills with targetType "aoe".
 */
MANASHARD.aoeShapes = {
  circle: "MANASHARD.AoeShapes.Circle",
  line: "MANASHARD.AoeShapes.Line",
  cross: "MANASHARD.AoeShapes.Cross"
};

/**
 * AOE target filters — who gets hit in the area.
 */
MANASHARD.aoeTargetFilters = {
  enemies: "MANASHARD.AoeFilters.Enemies",
  allies: "MANASHARD.AoeFilters.Allies",
  all: "MANASHARD.AoeFilters.All",
  allExcludeSelf: "MANASHARD.AoeFilters.AllExcludeSelf"
};

/**
 * Skill damage modes.
 * "fixed" = skill has its own flat damage.
 * "weapon" = skill uses equipped weapon's damage as base, baseRate becomes bonus damage.
 */
MANASHARD.baseRateModes = {
  fixed: "MANASHARD.BaseRateModes.Fixed",
  weapon: "MANASHARD.BaseRateModes.Weapon"
};

/**
 * Creature types for NPC classification.
 * Used by targetIs<Type> rule conditions for bonuses against specific creature types.
 */
MANASHARD.creatureTypes = {
  aquatic: "MANASHARD.CreatureTypes.Aquatic",
  beast: "MANASHARD.CreatureTypes.Beast",
  construct: "MANASHARD.CreatureTypes.Construct",
  demon: "MANASHARD.CreatureTypes.Demon",
  dragon: "MANASHARD.CreatureTypes.Dragon",
  plant: "MANASHARD.CreatureTypes.Plant",
  spirit: "MANASHARD.CreatureTypes.Spirit",
  undead: "MANASHARD.CreatureTypes.Undead"
};

/**
 * Enemy roles — determines combat behavior and action economy.
 */
MANASHARD.enemyRoles = {
  minion: "MANASHARD.EnemyRoles.Minion",
  standard: "MANASHARD.EnemyRoles.Standard",
  elite: "MANASHARD.EnemyRoles.Elite",
  boss: "MANASHARD.EnemyRoles.Boss",
  legendary: "MANASHARD.EnemyRoles.Legendary"
};

/**
 * Icons for enemy roles (Font Awesome).
 */
MANASHARD.enemyRoleIcons = {
  minion: "fas fa-chess-pawn",
  standard: "fas fa-shield-halved",
  elite: "fas fa-chess-knight",
  boss: "fas fa-crown",
  legendary: "fas fa-dragon"
};

/**
 * Default actions per turn by role.
 * Bosses get 2 selections per round, Legendaries get 3.
 */
MANASHARD.enemyRoleActions = {
  minion: 1,
  standard: 1,
  elite: 1,
  boss: 2,
  legendary: 3
};

/**
 * Role-based stat modifier applied to suggested combat stats.
 * HP is the primary role differentiator; stats ensure all roles
 * can meaningfully participate (critical for subtractive DEF at low ranks).
 *
 * Minion (0.50): Fodder — 1 PC handles 3. Low stats but can still scratch.
 * Standard (0.70): Core creature — fair 1v1 fight with a PC.
 * Elite (0.85): Group anchor — requires 2 PCs or smart play.
 * Boss (1.0): At rank cap — combined with extra actions, genuinely dangerous.
 * Legendary (1.10): Exceeds cap — isekai "one rank above" feel.
 */
MANASHARD.roleStatMod = {
  minion: 0.50,
  standard: 0.70,
  elite: 0.85,
  boss: 1.0,
  legendary: 1.10
};

/**
 * Role-based MP modifier applied to suggested MP.
 * Bosses/Legendaries have deeper MP pools for sustained magical threat.
 */
MANASHARD.roleMpMod = {
  minion: 0.30,
  standard: 1.0,
  elite: 1.2,
  boss: 1.8,
  legendary: 2.5
};

/**
 * EXP table — keyed by (PC level - enemy level), clamped to [-6, 6].
 * kill: EXP for dealing the killing blow.
 * combat: EXP for participating in combat without killing.
 */
MANASHARD.expTable = {
  "-6": { kill: 50, combat: 15 },
  "-5": { kill: 50, combat: 15 },
  "-4": { kill: 40, combat: 12 },
  "-3": { kill: 40, combat: 12 },
  "-2": { kill: 35, combat: 10 },
  "-1": { kill: 35, combat: 10 },
  "0":  { kill: 30, combat: 10 },
  "1":  { kill: 20, combat: 6 },
  "2":  { kill: 20, combat: 6 },
  "3":  { kill: 10, combat: 3 },
  "4":  { kill: 10, combat: 3 },
  "5":  { kill: 5, combat: 1 },
  "6":  { kill: 5, combat: 1 }
};

/**
 * EXP multipliers by enemy role. Applied to kill EXP only.
 */
MANASHARD.expRoleMultipliers = {
  minion: 0.5,
  standard: 1.0,
  elite: 1.5,
  boss: 2.0,
  legendary: 3.0
};

/**
 * Movement modes available to actors.
 */
MANASHARD.movementModes = {
  burrow: "MANASHARD.MovementModes.Burrow",
  climb: "MANASHARD.MovementModes.Climb",
  fly: "MANASHARD.MovementModes.Fly",
  passThrough: "MANASHARD.MovementModes.PassThrough",
  swim: "MANASHARD.MovementModes.Swim",
  teleport: "MANASHARD.MovementModes.Teleport",
  walk: "MANASHARD.MovementModes.Walk"
};

/**
 * Chant modes for magical skills.
 * effectModifier: damage/healing multiplier.
 * mpMultiplier: multiplier for the skill's base MP cost.
 * chargesTurn: if true, the spell is declared this turn and resolves at the start of the caster's next turn.
 */
MANASHARD.chantModes = {
  swift: { label: "MANASHARD.ChantModes.Swift", effectModifier: 0.75, mpMultiplier: 0.5, chargesTurn: false },
  normal: { label: "MANASHARD.ChantModes.Normal", effectModifier: 1.0, mpMultiplier: 1.0, chargesTurn: false },
  full: { label: "MANASHARD.ChantModes.Full", effectModifier: 1.5, mpMultiplier: 2.0, chargesTurn: true }
};

/**
 * Casting modifiers — optional trade-offs a caster can activate at cast time.
 * Each modifier is granted by a CastingModifier rule on a passive skill.
 * fromChant: the chant mode that must be selected for this modifier to be available.
 * mpMultiplier: multiply the spell's MP cost by this factor (stacks with chant mpMultiplier).
 */
MANASHARD.castingModifiers = {
  quicken: {
    label: "MANASHARD.CastingModifiers.Quicken",
    description: "MANASHARD.CastingModifiers.QuickenDesc",
    fromChant: "normal",
    mpMultiplier: 2
  }
};

/**
 * Status effects — 8 universal, element-agnostic conditions.
 * Elements no longer define status identity. A condition is inflicted by a skill;
 * the skill has an element, the condition does not.
 */
MANASHARD.statusEffects = {
  beguile:    { label: "MANASHARD.StatusEffects.Beguile",    description: "MANASHARD.StatusEffects.BeguileDesc",    duration: 1, category: "debuff" },
  blight:     { label: "MANASHARD.StatusEffects.Blight",     description: "MANASHARD.StatusEffects.BlightDesc",     duration: 3, category: "debuff" },
  expose:     { label: "MANASHARD.StatusEffects.Expose",     description: "MANASHARD.StatusEffects.ExposeDesc",     duration: 2, category: "debuff" },
  immobilize: { label: "MANASHARD.StatusEffects.Immobilize", description: "MANASHARD.StatusEffects.ImmobilizeDesc", duration: 2, category: "debuff" },
  impair:     { label: "MANASHARD.StatusEffects.Impair",     description: "MANASHARD.StatusEffects.ImpairDesc",     duration: 2, category: "debuff" },
  silence:    { label: "MANASHARD.StatusEffects.Silence",    description: "MANASHARD.StatusEffects.SilenceDesc",    duration: 2, category: "debuff" },
  stun:       { label: "MANASHARD.StatusEffects.Stun",       description: "MANASHARD.StatusEffects.StunDesc",       duration: 1, category: "debuff" },
  taunt:      { label: "MANASHARD.StatusEffects.Taunt",      description: "MANASHARD.StatusEffects.TauntDesc",      duration: 2, category: "debuff" },
};


/**
 * Combat objective types for mission-based encounters (Fire Emblem-style).
 */
MANASHARD.objectiveTypes = {
  rout: "MANASHARD.Objectives.Rout",
  defeatBoss: "MANASHARD.Objectives.DefeatBoss",
  survive: "MANASHARD.Objectives.Survive",
  escape: "MANASHARD.Objectives.Escape",
  defendPoint: "MANASHARD.Objectives.DefendPoint",
  escort: "MANASHARD.Objectives.Escort",
  negotiate: "MANASHARD.Objectives.Negotiate",
  protectCivilians: "MANASHARD.Objectives.ProtectCivilians",
  captureAlive: "MANASHARD.Objectives.CaptureAlive",
  slayBeforeTime: "MANASHARD.Objectives.SlayBeforeTime",
  repel: "MANASHARD.Objectives.Repel"
};

/**
 * Font Awesome icons for each objective type.
 */
MANASHARD.objectiveIcons = {
  rout: "fas fa-skull-crossbones",
  defeatBoss: "fas fa-crown",
  survive: "fas fa-hourglass-end",
  escape: "fas fa-door-open",
  defendPoint: "fas fa-shield-alt",
  escort: "fas fa-user-shield",
  negotiate: "fas fa-handshake",
  protectCivilians: "fas fa-people-arrows",
  captureAlive: "fas fa-hand-holding-heart",
  slayBeforeTime: "fas fa-stopwatch",
  repel: "fas fa-dragon"
};

/**
 * Font Awesome icons for status effects.
 */
MANASHARD.statusIcons = {
  beguile:    "fas fa-heart-crack",
  blight:     "fas fa-biohazard",
  expose:     "fas fa-shield-virus",
  immobilize: "fas fa-anchor",
  impair:     "fas fa-eye-slash",
  silence:    "fas fa-comment-slash",
  stun:       "fas fa-star",
  taunt:      "fas fa-bullseye"
};

/**
 * SVG icon paths for status effects displayed on tokens.
 */
MANASHARD.statusIconPaths = {
  beguile:    "systems/manashard/assets/icons/status/beguile.svg",
  blight:     "systems/manashard/assets/icons/status/blight.svg",
  expose:     "systems/manashard/assets/icons/status/expose.svg",
  immobilize: "systems/manashard/assets/icons/status/immobilize.svg",
  impair:     "systems/manashard/assets/icons/status/impair.svg",
  silence:    "systems/manashard/assets/icons/status/silence.svg",
  stun:       "systems/manashard/assets/icons/status/stun.svg",
  taunt:      "systems/manashard/assets/icons/status/taunt.svg"
};

/**
 * Consumable item categories.
 */
MANASHARD.consumableCategories = {
  potion: "MANASHARD.ConsumableCategories.Potion",
  scroll: "MANASHARD.ConsumableCategories.Scroll",
  food: "MANASHARD.ConsumableCategories.Food",
  bomb: "MANASHARD.ConsumableCategories.Bomb",
  utility: "MANASHARD.ConsumableCategories.Utility"
};

/**
 * Consumable category accent colors for UI display.
 */
MANASHARD.consumableCategoryColors = {
  potion: "#44cc88",
  scroll: "#8888dd",
  food: "#ddaa66",
  bomb: "#ee6644",
  utility: "#88aacc"
};

/**
 * Difficulty tiers for stat checks.
 * Modifier is added to the threshold (stat × 2 + modifier).
 */
MANASHARD.difficultyTiers = {
  easy:     { label: "Easy",      modifier: 10 },
  normal:   { label: "Normal",    modifier: 0 },
  hard:     { label: "Hard",      modifier: -10 },
  veryHard: { label: "Very Hard", modifier: -20 },
  extreme:  { label: "Extreme",   modifier: -30 }
};

/**
 * Accent colors for each check-eligible stat.
 */
MANASHARD.statColors = {
  str: "#e06040",
  agi: "#44cc77",
  mag: "#aa66ee",
  end: "#7799bb",
  spi: "#44cccc",
  luk: "#ddaa22",
  int: "#4488ee",
  chm: "#ee6699"
};

/**
 * The 8 stats eligible for stat checks (excludes hp/mp).
 */
MANASHARD.checkStats = ["str", "agi", "mag", "end", "spi", "luk", "int", "chm"];

/**
 * Growth rate baseline per stat at character creation (every stat starts here).
 * 10 stats × 5% = 50% base. Free pool of 280 brings total to 330%.
 */
MANASHARD.growthRateBaseline = 5;

/**
 * Free growth rate points to distribute at character creation (on top of baseline).
 */
MANASHARD.growthRatePool = 280;

/**
 * Growth rate caps during character creation (lower than the system-wide cap).
 * HP/MP cap at 80%, all others at 60%.
 */
MANASHARD.creationGrowthCaps = {
  hp: 80, mp: 80,
  str: 60, agi: 60, mag: 60, end: 60,
  spi: 60, luk: 60, int: 60, chm: 60
};

/**
 * Free stat points to distribute at character creation (on top of minimums).
 */
MANASHARD.statPointPool = 20;

/**
 * Minimum stat values at character creation.
 * Minimums sum to 28, leaving 20 free points from the pool.
 */
MANASHARD.statMinimums = {
  hp: 10, mp: 10, str: 1, agi: 1, mag: 1, end: 1,
  spi: 1, luk: 1, int: 1, chm: 1
};

/**
 * Starting eiress for character creation equipment shop.
 */
MANASHARD.startingEiress = 500;

/**
 * Sell-back rate when selling items to vendors (50% = half price).
 */
MANASHARD.sellBackRate = 0.5;

/**
 * Eiress drop role multipliers — applied to NPC eiressDrop on defeat.
 */
MANASHARD.eiressRoleMultipliers = {
  minion: 0.5,
  standard: 1.0,
  elite: 1.5,
  boss: 3.0,
  legendary: 5.0
};

/**
 * Growth rate cap per stat (base + mastery bonuses).
 */
MANASHARD.growthRateCap = 200;

/**
 * Level cap.
 */
MANASHARD.levelCap = 40;

/**
 * EXP per level (flat).
 */
MANASHARD.expPerLevel = 100;

// ═══════════════════════════════════════════════════════════════
// RULE ELEMENT SYSTEM (Active Effects)
// ═══════════════════════════════════════════════════════════════

/**
 * Rule element types and their display labels.
 */
MANASHARD.ruleElementTypes = {
  Aura: "MANASHARD.RuleTypes.Aura",
  CombatNote: "MANASHARD.RuleTypes.CombatNote",
  Elemental: "MANASHARD.RuleTypes.Elemental",
  Grant: "MANASHARD.RuleTypes.Grant",
  Modifier: "MANASHARD.RuleTypes.Modifier",
  Status: "MANASHARD.RuleTypes.Status",
  TargetRestriction: "MANASHARD.RuleTypes.TargetRestriction",
  Trigger: "MANASHARD.RuleTypes.Trigger"
};

/**
 * Trigger event types — what fires the trigger.
 */
MANASHARD.triggerEvents = {
  onDefeat: "MANASHARD.TriggerEvents.OnDefeat"
};

/**
 * Trigger action types — what happens when the trigger fires.
 */
MANASHARD.triggerActions = {
  restoreHP: "MANASHARD.TriggerActions.RestoreHP",
  restoreMP: "MANASHARD.TriggerActions.RestoreMP"
};

/**
 * Target restriction modes — whitelist vs blacklist.
 */
MANASHARD.targetRestrictionModes = {
  only: "MANASHARD.TargetRestrictionModes.Only",
  except: "MANASHARD.TargetRestrictionModes.Except"
};

/**
 * Aura target types — who the aura affects.
 */
MANASHARD.auraTargets = {
  allies: "MANASHARD.AuraTargets.Allies",
  enemies: "MANASHARD.AuraTargets.Enemies"
};

/**
 * Rule element types allowed as nested aura effects.
 */
MANASHARD.auraEffectTypes = new Set([
  "Elemental", "Grant", "Modifier", "Status"
]);

/**
 * Rule category metadata for UI display: icon and short badge label.
 */
MANASHARD.ruleCategories = {
  Aura:       { icon: "fa-circle-radiation",  badge: "Aura" },
  CombatNote: { icon: "fa-comment",           badge: "Note" },
  Elemental:  { icon: "fa-yin-yang",          badge: "Elemental" },
  Grant:      { icon: "fa-gift",              badge: "Grant" },
  Modifier:   { icon: "fa-chart-line",        badge: "Modifier" },
  Status:     { icon: "fa-biohazard",         badge: "Status" }
};

/**
 * Flat lookup of all valid selectors for label resolution.
 */
MANASHARD.ruleSelectors = {
  accuracy: "MANASHARD.RuleSelectors.accuracy",
  all: "MANASHARD.RuleSelectors.all",
  agi: "MANASHARD.StatsAbbr.AGI",
  blockChance: "MANASHARD.RuleSelectors.blockChance",
  carryingCapacity: "MANASHARD.RuleSelectors.carryingCapacity",
  chm: "MANASHARD.StatsAbbr.CHM",
  critAvoid: "MANASHARD.RuleSelectors.critAvoid",
  critical: "MANASHARD.RuleSelectors.critical",
  damage: "MANASHARD.RuleSelectors.damage",
  damageTaken: "MANASHARD.RuleSelectors.damageTaken",
  end: "MANASHARD.StatsAbbr.END",
  "growth.agi": "MANASHARD.RuleSelectors.growthAgi",
  "growth.chm": "MANASHARD.RuleSelectors.growthChm",
  "growth.end": "MANASHARD.RuleSelectors.growthEnd",
  "growth.hp": "MANASHARD.RuleSelectors.growthHp",
  "growth.int": "MANASHARD.RuleSelectors.growthInt",
  "growth.luk": "MANASHARD.RuleSelectors.growthLuk",
  "growth.mag": "MANASHARD.RuleSelectors.growthMag",
  "growth.mp": "MANASHARD.RuleSelectors.growthMp",
  "growth.spi": "MANASHARD.RuleSelectors.growthSpi",
  "growth.str": "MANASHARD.RuleSelectors.growthStr",
  "hp.barrier": "MANASHARD.RuleSelectors.hpBarrier",
  "hp.max": "MANASHARD.RuleSelectors.hpMax",
  int: "MANASHARD.StatsAbbr.INT",
  luk: "MANASHARD.StatsAbbr.LUK",
  mag: "MANASHARD.StatsAbbr.MAG",
  mdef: "MANASHARD.RuleSelectors.mdef",
  meva: "MANASHARD.RuleSelectors.meva",
  mov: "MANASHARD.RuleSelectors.mov",
  "mp.max": "MANASHARD.RuleSelectors.mpMax",
  mpCost: "MANASHARD.RuleSelectors.mpCost",
  mpRegen: "MANASHARD.RuleSelectors.mpRegen",
  pdef: "MANASHARD.RuleSelectors.pdef",
  peva: "MANASHARD.RuleSelectors.peva",
  piercing: "MANASHARD.RuleSelectors.piercing",
  reach: "MANASHARD.RuleSelectors.reach",
  spi: "MANASHARD.StatsAbbr.SPI",
  throwRange: "MANASHARD.RuleSelectors.throwRange",
  str: "MANASHARD.StatsAbbr.STR",
  vision: "MANASHARD.RuleSelectors.vision"
};

/**
 * Grouped selectors for the Modifier type dropdown (alphabetized within each group).
 */
MANASHARD.ruleSelectorGroups = {
  attributes: {
    label: "MANASHARD.RuleSelectorGroups.Attributes",
    selectors: ["all", "agi", "chm", "end", "int", "luk", "mag", "spi", "str"]
  },
  defense: {
    label: "MANASHARD.RuleSelectorGroups.Defense",
    selectors: ["blockChance", "critAvoid", "damageTaken", "mdef", "meva", "pdef", "peva"]
  },
  growthRates: {
    label: "MANASHARD.RuleSelectorGroups.GrowthRates",
    selectors: ["growth.agi", "growth.chm", "growth.end", "growth.hp", "growth.int", "growth.luk", "growth.mag", "growth.mp", "growth.spi", "growth.str"]
  },
  movement: {
    label: "MANASHARD.RuleSelectorGroups.Movement",
    selectors: ["carryingCapacity", "mov", "reach", "throwRange", "vision"]
  },
  offense: {
    label: "MANASHARD.RuleSelectorGroups.Offense",
    selectors: ["accuracy", "critical", "damage", "piercing"]
  },
  resources: {
    label: "MANASHARD.RuleSelectorGroups.Resources",
    selectors: ["hp.barrier", "hp.max", "mp.max", "mpCost", "mpRegen"]
  }
};

/**
 * Valid conditions for conditional rule elements (Modifier with condition).
 */
MANASHARD.ruleConditions = {
  allyWithinReachOfTarget: "MANASHARD.RuleConditions.allyWithinReachOfTarget",
  attackingWithDark: "MANASHARD.RuleConditions.attackDark",
  attackingWithEarth: "MANASHARD.RuleConditions.attackEarth",
  attackingWithFire: "MANASHARD.RuleConditions.attackFire",
  attackingWithIce: "MANASHARD.RuleConditions.attackIce",
  attackingWithLight: "MANASHARD.RuleConditions.attackLight",
  attackingWithLightning: "MANASHARD.RuleConditions.attackLightning",
  attackingWithWater: "MANASHARD.RuleConditions.attackWater",
  attackingWithWind: "MANASHARD.RuleConditions.attackWind",
  defending: "MANASHARD.RuleConditions.defending",
  hpBelow25: "MANASHARD.RuleConditions.hpBelow25",
  hpBelow50: "MANASHARD.RuleConditions.hpBelow50",
  hpFull: "MANASHARD.RuleConditions.hpFull",
  initiating: "MANASHARD.RuleConditions.initiating",
  mpBelow50: "MANASHARD.RuleConditions.mpBelow50",
  receivingHealing: "MANASHARD.RuleConditions.receivingHealing",
  self: "MANASHARD.RuleConditions.self",
  skillIsHealing: "MANASHARD.RuleConditions.skillIsHealing",
  targetIsBoss: "MANASHARD.RuleConditions.targetIsBoss",
  weaponIsMagical: "MANASHARD.RuleConditions.weaponIsMagical",
  attackIsMelee: "MANASHARD.RuleConditions.attackIsMelee",
  weaponIsPhysical: "MANASHARD.RuleConditions.weaponIsPhysical",
  attackIsRanged: "MANASHARD.RuleConditions.attackIsRanged",
  attackIsThrown: "MANASHARD.RuleConditions.attackIsThrown",
  wieldingAxes: "MANASHARD.RuleConditions.wieldingAxes",
  wieldingBows: "MANASHARD.RuleConditions.wieldingBows",
  wieldingChains: "MANASHARD.RuleConditions.wieldingChains",
  wieldingDaggers: "MANASHARD.RuleConditions.wieldingDaggers",
  wieldingFirearms: "MANASHARD.RuleConditions.wieldingFirearms",
  wieldingFist: "MANASHARD.RuleConditions.wieldingFist",
  wieldingGrimoires: "MANASHARD.RuleConditions.wieldingGrimoires",
  wieldingPolearms: "MANASHARD.RuleConditions.wieldingPolearms",
  wieldingShields: "MANASHARD.RuleConditions.wieldingShields",
  wieldingStaves: "MANASHARD.RuleConditions.wieldingStaves",
  wieldingSwords: "MANASHARD.RuleConditions.wieldingSwords"
};

/**
 * Modifier mode options.
 */
MANASHARD.modifierModes = {
  checkOnly: "MANASHARD.ModifierModes.CheckOnly",
  flat: "MANASHARD.ModifierModes.Flat",
  override: "MANASHARD.ModifierModes.Override",
  percent: "MANASHARD.ModifierModes.Percent"
};

/**
 * Grant subtypes.
 */
MANASHARD.grantSubtypes = {
  armorProficiency: "MANASHARD.GrantSubtypes.ArmorProficiency",
  element: "MANASHARD.GrantSubtypes.Element",
  item: "MANASHARD.GrantSubtypes.Item",
  creatureType: "MANASHARD.GrantSubtypes.CreatureType",
  movementMode: "MANASHARD.GrantSubtypes.MovementMode",
  weaponProficiency: "MANASHARD.GrantSubtypes.WeaponProficiency",
  trapSense: "MANASHARD.GrantSubtypes.TrapSense",
  sense: "MANASHARD.GrantSubtypes.Sense",
  spatialInventory: "MANASHARD.GrantSubtypes.SpatialInventory"
};

/**
 * Status effect actions.
 */
MANASHARD.statusActions = {
  immune: "MANASHARD.StatusActions.Immune",
  inflict: "MANASHARD.StatusActions.Inflict",
  remove: "MANASHARD.StatusActions.Remove"
};

/**
 * Damage type filter for damage taken modifiers.
 */
MANASHARD.damageTakenTypes = {
  all: "MANASHARD.DamageTypes.All",
  magical: "MANASHARD.DamageTypes.Magical",
  physical: "MANASHARD.DamageTypes.Physical"
};

/**
 * Movement modifier modes (for MOV stat modifiers).
 */
MANASHARD.movementModifierModes = {
  flat: "MANASHARD.Modes.Flat",
  override: "MANASHARD.Modes.Override"
};

/**
 * Value modifier modes.
 */
MANASHARD.valueModes = {
  flat: "MANASHARD.Modes.Flat",
  percent: "MANASHARD.Modes.Percent"
};

/**
 * Weapon category identity rules.
 * Auto-injected when a weapon of this category is equipped in mainhand.
 * These give each weapon type a unique passive identity.
 */
MANASHARD.weaponCategoryDefaults = {
  swords:    { rangeType: "melee",  minRange: 1, maxRange: 1 },
  daggers:   { rangeType: "melee",  minRange: 1, maxRange: 1 },
  axes:      { rangeType: "melee",  minRange: 1, maxRange: 1 },
  polearms:  { rangeType: "melee",  minRange: 1, maxRange: 2 },
  chains:    { rangeType: "melee",  minRange: 1, maxRange: 2 },
  fist:      { rangeType: "melee",  minRange: 1, maxRange: 1 },
  bows:      { rangeType: "ranged", minRange: 2, maxRange: 8 },
  firearms:  { rangeType: "ranged", minRange: 2, maxRange: 5 },
  grimoires: { rangeType: "ranged", minRange: 1, maxRange: 4 },
  staves:    { rangeType: "melee",  minRange: 1, maxRange: 1 },
  shields:   { rangeType: "melee",  minRange: 1, maxRange: 1 },
  natural:   { rangeType: "melee",  minRange: 1, maxRange: 1 },
};

MANASHARD.weaponCategoryRules = {
  swords:    [{ key: "Grant", grant: "versatile", label: "Versatile" }],
  daggers:   [{ key: "Modifier", selector: "peva", value: 5, mode: "flat", label: "Swift" }],
  axes:      [{ key: "Grant", grant: "brutalCrit", label: "Brutal" }],
  polearms:  [], // Reach is already inherent via weapon maxRange
  chains:    [{ key: "Status", status: "immobilize", action: "inflict", chance: 20, label: "Binding" }],
  fist:      [{ key: "Modifier", selector: "mpCost", value: -1, mode: "flat", label: "Flow" }],
  bows:      [{ key: "Grant", grant: "precision", label: "Precision" }],
  firearms:  [{ key: "Grant", grant: "percentPiercing", percentPiercing: 30, label: "Penetrating" }],
  grimoires: [], // Element affinity is already inherent via weapon element field
  staves:    [{ key: "Modifier", selector: "damage", value: 2, mode: "flat", condition: "weaponIsMagical", label: "Arcane Conduit" }],
  shields:   [], // Block chance is already inherent via weapon block field
  natural:   [], // Species scaling is already inherent via natural weapon path
};

/**
 * Weapon keyword properties.
 * Recognized tags on weapons that inject mechanical rules when equipped.
 * Added via the weapon's tags field (comma-separated).
 */
MANASHARD.weaponKeywords = {
  parrying:  { label: "Parrying",   description: "Grants block chance without a shield",
               rules: [{ key: "Modifier", selector: "blockChance", value: 10, mode: "flat", label: "Parrying" }] },
  lifedrain: { label: "Life Drain", description: "Recover 1 HP on defeating an enemy",
               rules: [{ key: "Trigger", event: "onDefeat", action: "restoreHP", value: 1, label: "Life Drain" }] },
  heavy:     { label: "Heavy",      description: "+2 damage, -1 MOV",
               rules: [{ key: "Modifier", selector: "damage", value: 2, mode: "flat", label: "Heavy" },
                        { key: "Modifier", selector: "mov", value: -1, mode: "flat", label: "Heavy" }] },
  light:     { label: "Light",      description: "+1 MOV, -1 damage",
               rules: [{ key: "Modifier", selector: "mov", value: 1, mode: "flat", label: "Light" },
                        { key: "Modifier", selector: "damage", value: -1, mode: "flat", label: "Light" }] },
  keen:      { label: "Keen",        description: "+5 critical chance",
               rules: [{ key: "Modifier", selector: "critical", value: 5, mode: "flat", label: "Keen" }] },
  reliable:  { label: "Reliable",   description: "Attacks always deal at least 1 damage",
               rules: [{ key: "Grant", grant: "reliableDamage", label: "Reliable" }] },
};

/**
 * Status effect mechanical rules.
 * Injected as rule elements when a status effect is active on an actor.
 */
MANASHARD.statusEffectRules = {
  // Beguile: forced ally-attack at turn start (handled in processStartOfTurn)
  beguile: [],
  // Blight: 2 HP DoT at turn start (handled in processStartOfTurn)
  blight: [],
  // Expose: EVA, P.DEF, M.DEF halved at combat resolution (handled in combat.mjs)
  expose: [],
  // Immobilize: MOV = 0
  immobilize: [
    { key: "Modifier", selector: "mov", value: 0, mode: "override", label: "Immobilize" }
  ],
  // Impair: ACC and CRIT halved at combat resolution (handled in combat.mjs)
  impair: [],
  // Silence: Cannot use Magic Skills (handled by combat/skill UI logic)
  silence: [],
  // Stun: skip entire turn (handled in processStartOfTurn)
  stun: [],
  // Taunt: Must target the taunter if in range (handled by targeting logic)
  taunt: []
};

// ═══════════════════════════════════════════════════════════════
// ENCOUNTER BUILDER
// ═══════════════════════════════════════════════════════════════

/**
 * Stat archetype templates for the Encounter Builder's threat builder.
 * primary/secondary arrays determine which stats get high/medium allocation.
 * hpMod/mpMod scale the rank cap for HP/MP.
 */
MANASHARD.threatArchetypes = {
  brute:      { label: "MANASHARD.EncBuilder.ArchBrute",      primary: ["str", "end"],  secondary: ["agi", "luk"],  hpMod: 1.1, mpMod: 0.7 },
  skirmisher: { label: "MANASHARD.EncBuilder.ArchSkirmisher", primary: ["agi", "luk"],  secondary: ["str", "spi"],  hpMod: 0.9, mpMod: 0.9 },
  caster:     { label: "MANASHARD.EncBuilder.ArchCaster",     primary: ["mag", "spi"],  secondary: ["int", "end"],  hpMod: 0.8, mpMod: 1.3 },
  tank:       { label: "MANASHARD.EncBuilder.ArchTank",       primary: ["end", "spi"],  secondary: ["str", "agi"],  hpMod: 1.3, mpMod: 0.8 },
  artillery:  { label: "MANASHARD.EncBuilder.ArchArtillery",  primary: ["mag", "int"],  secondary: ["agi", "luk"],  hpMod: 0.7, mpMod: 1.2 },
  balanced:   { label: "MANASHARD.EncBuilder.ArchBalanced",   primary: [],              secondary: [],              hpMod: 1.0, mpMod: 1.0 },
  custom:     { label: "MANASHARD.EncBuilder.ArchCustom",     primary: [],              secondary: [],              hpMod: 1.0, mpMod: 1.0 }
};

/**
 * Threat Level rank bonuses — flat additive to TL formula.
 */
MANASHARD.tlRankBonus = {
  f: 0, e: 2, d: 5, c: 10, b: 16, a: 24, s: 35
};

/**
 * Threat Level role bonuses — flat additive to TL formula.
 */
MANASHARD.tlRoleBonus = {
  minion: -8, standard: 0, elite: 8, boss: 25, legendary: 50
};

/**
 * Encounter difficulty tiers. ratio = totalTL / partyBudget.
 */
MANASHARD.encounterDifficultyTiers = [
  { key: "trivial",  label: "MANASHARD.EncBuilder.DiffTrivial",  max: 0.5,      color: "#7a9a8e" },
  { key: "easy",     label: "MANASHARD.EncBuilder.DiffEasy",     max: 0.8,      color: "#22cc66" },
  { key: "moderate", label: "MANASHARD.EncBuilder.DiffModerate", max: 1.2,      color: "#f1c40f" },
  { key: "hard",     label: "MANASHARD.EncBuilder.DiffHard",     max: 1.8,      color: "#ee8844" },
  { key: "deadly",   label: "MANASHARD.EncBuilder.DiffDeadly",   max: 2.5,      color: "#ee5544" },
  { key: "extreme",  label: "MANASHARD.EncBuilder.DiffExtreme",  max: Infinity, color: "#cc2244" }
];

/**
 * Encounter quick templates for the encounter composer.
 */
MANASHARD.encounterTemplates = {
  bossMinions:     { label: "MANASHARD.EncBuilder.TplBossMinions",     slots: [{ role: "boss", count: 1 }, { role: "minion", count: 6 }] },
  eliteSquad:      { label: "MANASHARD.EncBuilder.TplEliteSquad",      slots: [{ role: "elite", count: 1 }, { role: "standard", count: 3 }] },
  horde:           { label: "MANASHARD.EncBuilder.TplHorde",           slots: [{ role: "minion", count: 12 }] },
  ambush:          { label: "MANASHARD.EncBuilder.TplAmbush",          slots: [{ role: "standard", count: 2 }, { role: "elite", count: 1 }, { role: "minion", count: 3 }] },
  legendaryBattle: { label: "MANASHARD.EncBuilder.TplLegendaryBattle", slots: [{ role: "legendary", count: 1 }, { role: "elite", count: 1 }, { role: "minion", count: 4 }] }
};

/**
 * Skill guidelines per enemy role — recommended skill counts and design notes.
 * Displayed in the Threat Builder to help GMs build appropriately complex threats.
 */
MANASHARD.roleSkillGuidelines = {
  minion:    { active: { min: 0, max: 1 }, passive: { min: 0, max: 0 }, notes: "MANASHARD.EncBuilder.SkillNoteMinion" },
  standard:  { active: { min: 1, max: 2 }, passive: { min: 0, max: 1 }, notes: "MANASHARD.EncBuilder.SkillNoteStandard" },
  elite:     { active: { min: 2, max: 3 }, passive: { min: 1, max: 1 }, notes: "MANASHARD.EncBuilder.SkillNoteElite" },
  boss:      { active: { min: 3, max: 5 }, passive: { min: 1, max: 2 }, notes: "MANASHARD.EncBuilder.SkillNoteBoss" },
  legendary: { active: { min: 5, max: 7 }, passive: { min: 2, max: 3 }, notes: "MANASHARD.EncBuilder.SkillNoteLegendary" }
};

/**
 * Suggested skill baseRate values per rank — weak/standard/strong tiers.
 * Helps GMs build skills with appropriate damage output for their rank.
 * Calculated to produce meaningful damage against same-rank PC defenses.
 */
MANASHARD.skillBaseRateByRank = {
  f: { weak: 2, standard: 4, strong: 6 },
  e: { weak: 3, standard: 6, strong: 9 },
  d: { weak: 5, standard: 8, strong: 12 },
  c: { weak: 7, standard: 11, strong: 16 },
  b: { weak: 9, standard: 14, strong: 20 },
  a: { weak: 12, standard: 18, strong: 25 },
  s: { weak: 15, standard: 22, strong: 30 }
};

/**
 * Role-based HP modifier applied to suggested HP in the Threat Builder.
 * HP is the primary lever for role differentiation:
 * Minions die in 1-2 hits, Bosses require sustained party focus.
 */
MANASHARD.roleHpMod = {
  minion: 0.30,
  standard: 1.0,
  elite: 1.5,
  boss: 2.5,
  legendary: 4.0
};

/**
 * Objective difficulty modifiers — multiplied against final TL ratio.
 */
MANASHARD.objectiveDifficultyModifiers = {
  rout:              1.0,
  defeatBoss:        0.8,
  survive:           1.3,
  escape:            0.9,
  defendPoint:       1.2,
  escort:            1.2,
  negotiate:         0.7,
  protectCivilians:  1.3,
  captureAlive:      1.1,
  slayBeforeTime:    1.2,
  repel:             1.1,
  seize:             0.9
};

/**
 * Reinforcement wave trigger types.
 */
MANASHARD.waveTriggerTypes = {
  turn:     "MANASHARD.EncBuilder.TriggerTurn",
  bossHp:   "MANASHARD.EncBuilder.TriggerBossHP",
  manual:   "MANASHARD.EncBuilder.TriggerManual"
};

/**
 * Trap trigger types.
 */
MANASHARD.triggerTypes = {
  proximity: "MANASHARD.TriggerTypes.Proximity",
  pressure: "MANASHARD.TriggerTypes.Pressure",
  tripwire: "MANASHARD.TriggerTypes.Tripwire",
  magic: "MANASHARD.TriggerTypes.Magic",
  manual: "MANASHARD.TriggerTypes.Manual"
};

/**
 * Stats available for disarm checks.
 */
MANASHARD.disarmStats = {
  str: "MANASHARD.Stats.STR",
  agi: "MANASHARD.Stats.AGI",
  mag: "MANASHARD.Stats.MAG",
  end: "MANASHARD.Stats.END",
  spi: "MANASHARD.Stats.SPI",
  int: "MANASHARD.Stats.INT",
  chm: "MANASHARD.Stats.CHM",
  luk: "MANASHARD.Stats.LUK"
};

/**
 * Damage types available for traps.
 */
MANASHARD.trapDamageTypes = {
  physical: "MANASHARD.DamageTypes.Physical",
  magical: "MANASHARD.DamageTypes.Magical",
  elemental: "MANASHARD.DamageTypes.Elemental"
};


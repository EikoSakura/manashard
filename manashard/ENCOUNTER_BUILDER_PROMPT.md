# Encounter Builder & Threat Builder — Implementation Prompt

Copy everything below this line into a new Claude Code chat.

---

## Task

Build an **Encounter Builder** application for the Manashard TTRPG system (Foundry VTT v13). This is a GM tool that does two things:

1. **Build Threats (enemies)** — Create and configure enemy actors with stats, equipment, skills, loot, and role assignments
2. **Build Encounters** — Compose groups of enemies into balanced encounters with difficulty estimation

Read all the memory files in the `.claude/projects/` memory directory first, especially `enemy_system_design.md`, `stat_system.md`, `combat_turn_system.md`, and `roadmap.md`. Then explore the codebase thoroughly before planning.

---

## System Context

Manashard is an isekai game-world TTRPG built Foundry-first with Fire Emblem-style side-based combat. Key facts:

### Actor Types
- **Character** (player) — Has growth rates, skill library/loadout, leveling
- **Threat** (enemy/NPC) — Fixed stats set by GM, no growth rates, has loot table
- **Trap** — Environmental hazard

### Enemy Role System (already implemented)
Threats have a `role` field: **Minion** (1 action), **Standard** (1 action), **Elite** (1 action), **Boss** (2 actions/round), **Legendary** (3 actions/round). Role is descriptive — GM sets all stats manually. `isBoss` is derived from role.

### Stat System
8 attributes: STR, AGI, MAG, END, SPI, INT, CHM, LUK. Derived stats (Damage, Accuracy, Critical, P.EVA, M.EVA, P.DEF, M.DEF, Block, etc.) computed from attributes + equipped items.

### Rank System (F through S)
Each rank has stat caps:
- F: all stats max 8, HP max 30
- E: all stats max 12, HP max 40
- D: all stats max 16, HP max 52
- C: all stats max 21, HP max 68
- B: all stats max 27, HP max 88
- A: all stats max 33, HP max 115
- S: all stats max 40, HP max 150

### EXP Table (already implemented in config)
Level-differential table with role multipliers. `calculateCombatEXP(pcLevel, enemyLevel, enemyRole, isKill)` exists in `module/helpers/combat.mjs`.

### Creature Types
Freeform array on threats (e.g., "spider", "goblin", "undead"). Config has preset suggestions: aquatic, beast, construct, demon, dragon, plant, spirit, undead.

### Elements
8 elements (fire, ice, water, lightning, wind, earth, light, dark) + null. Each threat has an elemental profile with tiers: weak (1.5x), neutral (1x), resist (0.5x), immune (0x), absorb (-1x).

### Status Resistances
8 conditions: Beguile, Blight, Expose, Immobilize, Impair, Silence, Stun, Taunt. Per-condition resistance: vulnerable, neutral, resist, immune.

### Combat
Side-based turns (no initiative). All of one side acts, then the other. Bosses get 2+ actions per round. D100 roll-under for hits. Chant system for magic (Swift/Normal/Full).

---

## Encounter Builder Design Requirements

### Part 1: Threat Builder (Enemy Creation Tool)

A streamlined interface for GMs to create enemy actors quickly. Should be faster than manually filling out the Threat actor sheet.

**Features:**
- **Quick Stat Entry** — Set rank, level, and role. Provide stat suggestions based on rank (e.g., a D-rank Standard melee fighter gets STR 12, AGI 10, END 10, etc.)
- **Stat Templates** — Preset stat distributions by archetype:
  - Brute (high STR/END, low AGI/MAG)
  - Skirmisher (high AGI/LUK, low END)
  - Caster (high MAG/SPI, low STR/END)
  - Tank (high END/SPI, low AGI)
  - Balanced (even spread)
  - Custom (manual entry)
- **Equipment Assignment** — Drag weapons/armor from compendium or quick-select from category dropdowns
- **Skill Assignment** — Browse and assign Skill Manacite (magic/art/passive) from compendium
- **Elemental Profile** — Quick toggle grid for element affinities
- **Status Resistances** — Quick toggle grid
- **Loot Table** — Add items with drop chances
- **Creature Types** — Tag input (reuse existing tag-input component)
- **Movement Modes** — Checkboxes for walk/fly/swim/climb/burrow/teleport
- **Preview Panel** — Show derived combat stats (damage, accuracy, defenses) live as you edit
- **Save** — Creates a Threat actor in the world (or updates an existing one)

**Stat Suggestion Algorithm:**
Given rank + archetype, generate suggested base stats within rank caps:
- Primary stats: 75-90% of rank cap
- Secondary stats: 50-65% of rank cap
- Dump stats: 25-40% of rank cap
- HP: Scale with rank cap, modified by archetype (Brutes get more, Casters get less)
- MP: Scale inversely (Casters get more)

### Part 2: Encounter Composer

Assemble groups of threats into encounters and estimate difficulty.

**Features:**
- **Party Configuration** — Auto-detect PCs from the world, show their levels. Allow manual party size/level override for planning.
- **Enemy Roster** — Drag threats from compendium or world actors. Each entry shows: name, level, rank, role, Threat Level.
- **Threat Level Formula:**
  ```
  TL = (Level × 2) + Rank Bonus + Role Bonus
  Rank Bonus: F=0, E=2, D=5, C=10, B=16, A=24, S=35
  Role Bonus: Minion=-5, Standard=0, Elite=+10, Boss=+30, Legendary=+60
  ```
- **Difficulty Estimation** — Compare total enemy TL against party budget:
  ```
  Party Budget = Party Size × Average Party Level × 2
  Difficulty Tiers (budget ratio):
    Trivial:  < 0.5x budget
    Easy:     0.5x - 0.8x
    Moderate: 0.8x - 1.2x
    Hard:     1.2x - 1.8x
    Deadly:   1.8x - 2.5x
    Extreme:  > 2.5x
  ```
- **Difficulty Meter** — Visual bar showing current encounter TL vs budget, color-coded
- **Quick Templates** — One-click encounter shapes:
  - "Boss + Minions": 1 Boss + 4-6 Minions (auto-scales to party level)
  - "Elite Squad": 2-3 Elites
  - "Horde": 8-12 Minions
  - "Ambush": 4-6 Standards
- **EXP Preview** — Show estimated EXP each PC would earn (kill + combat EXP using the existing `calculateCombatEXP` function)
- **Deploy to Scene** — Place the encounter's enemies onto the current Foundry scene as tokens
- **Save Encounter** — Save the encounter composition as a Journal Entry or flag for reuse

---

## Architecture Requirements

### Foundry VTT v13 Patterns
- Extend `HandlebarsApplicationMixin(ApplicationV2)` from `foundry.applications.api`
- Use static `PARTS`, `DEFAULT_OPTIONS`, and action handlers pattern
- Reference existing apps for patterns: `compendium-browser.mjs`, `party-sheet.mjs`, `character-creation-wizard.mjs`
- Use Handlebars templates in `templates/apps/`
- Add CSS to a new stylesheet (e.g., `styles/encounter-builder.css`) and register it in `system.json`

### Data Flow
- Threat Builder creates/updates `Actor` documents of type "threat"
- Encounter Composer reads from world actors and compendium packs
- Use `Actor.create()` for new threats, `actor.update()` for existing
- Use `TokenDocument.create()` for scene deployment
- Store encounter compositions in `JournalEntry` pages or world-level flags

### UI/UX
- Single window with tabs: "Build Threat" | "Build Encounter"
- Dark theme matching existing Manashard aesthetic (use CSS variables from manashard.css)
- Responsive layout that works in the Foundry sidebar or as a popout window
- Drag-and-drop support for adding items/actors from compendiums

### Files to Create
- `module/apps/encounter-builder.mjs` — Main application class
- `templates/apps/encounter-builder.hbs` — Main template
- `templates/apps/encounter-builder-threat.hbs` — Threat builder tab
- `templates/apps/encounter-builder-encounter.hbs` — Encounter composer tab
- `styles/encounter-builder.css` — Styles

### Files to Modify
- `system.json` — Register new stylesheet
- `manashard.mjs` — Register the application, add menu button or keybind
- `module/helpers/config.mjs` — Add encounter difficulty tiers, stat templates, threat level bonuses
- `lang/en.json` — Add localization keys

### Key Files to Read First
- `module/data-models/actor-npc.mjs` — Threat data model (understand all fields)
- `module/helpers/config.mjs` — All config constants
- `module/helpers/combat.mjs` — `calculateCombatEXP()` function
- `module/apps/compendium-browser.mjs` — Best example of a complex ApplicationV2 app with search/filter
- `module/apps/character-creation-wizard.mjs` — Multi-step form pattern
- `module/apps/ctb-tracker.mjs` — Real-time updating UI pattern
- `module/sheets/actor-sheet.mjs` — How threat context data is built (roleOptions, rankOptions, etc.)
- `templates/actor/parts/actor-sidebar.hbs` — Threat sidebar template (role select, stat layout)
- `styles/manashard.css` — CSS variables and existing component patterns

---

## Design Notes

- **No Manacite Shards** — There is no universal currency drop. Loot is GM-configured per enemy.
- **No AI behavior tags** — GM handles enemy tactics manually.
- **Stat templates are suggestions, not enforced** — GM can always override any value.
- **Role doesn't affect stats** — It only affects action count and isBoss flag. The GM sets stats.
- **Creature types are freeform** — Not limited to the 8 presets in config.
- **Side-based combat** — No initiative to worry about. Encounter difficulty is about total threat, not turn order.
- **This is an isekai game-world TTRPG** — Think monster ecology, dungeon floors, adventurer guild quests. Enemies should feel like they belong in an anime game-world.

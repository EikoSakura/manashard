# Phase 3 — Skill Point System

## Overview
Introduce a Skill Point (SP) system that allows characters to level up absorbed skills. Skills have a max level of 10 and each skill defines its own per-level bonus table (what improves at each level). SP can be earned three ways: automatically on level-up, from combat XP, and via GM manual awards. Absorbing a duplicate manacite of an already-known skill auto-levels that skill by +1 (no SP cost).

## Design Specification

### Skill Levels
- Every absorbed skill starts at **Level 1**
- Max skill level: **10**
- Each skill defines a **per-level bonus table** (`levelBonuses`) — an array of objects describing what changes at each level (2–10)
- Supported bonus types per level:
  - `baseRate`: flat bonus added to the skill's base damage/healing
  - `mpCost`: reduction to MP cost (negative values = cheaper)
  - `skillHit`: bonus to the skill's hit rate
  - `range`: bonus to max range
  - `aoeSize`: bonus to AOE size
- SP cost to level up: **current level** (i.e., Lv1→2 costs 1 SP, Lv2→3 costs 2 SP, etc. Total 1+2+...+9 = 45 SP for max)
- Passive skills can also be leveled — their bonuses are defined in rules/description text, but `levelBonuses` can still track mechanical changes if any

### Skill Points — Sources
1. **Level-up**: Characters gain **3 SP** per level-up (configurable in CONFIG)
2. **Combat XP**: SP accumulates from combat encounters — **1 SP per encounter** (configurable in CONFIG). Awarded via the same flow that grants EXP
3. **GM manual award**: SP is a trackable resource on the character sheet. GM can edit it directly like eiress

### Duplicate Manacite Absorption
When a character absorbs a skill manacite and **already has that skill in their skillLibrary**:
- Instead of showing "already absorbed" error, show a confirmation: "You already know [Skill Name]. Absorb this crystal to strengthen it? (Level X → X+1)"
- If confirmed: increment that skill's level by 1, destroy/consume the manacite item
- If skill is already max level (10): show warning "This skill is already at maximum level" and block absorption
- Matching is done by **item name** (case-insensitive) since absorbed skills and new manacite are separate item instances

---

## Implementation Tasks

### Task 1 — Data Model Changes

**item-manacite.mjs** — Add per-level bonus table to skill manacite schema:
```
levelBonuses: ArrayField of SchemaField({
  level: NumberField (integer, 2–10),
  baseRate: NumberField (integer, default 0),
  mpCost: NumberField (integer, default 0),     // negative = reduction
  skillHit: NumberField (integer, default 0),
  range: NumberField (integer, default 0),
  aoeSize: NumberField (integer, default 0)
})
```
Only relevant for skill-type manacite (not jobs).

**actor-character.mjs** — Add SP tracking and per-skill levels:
```
sp: NumberField (integer, min 0, initial 0)
skillLevels: ObjectField (initial {})
// skillLevels maps skill item ID → current level integer
// e.g., { "abc123": 3, "def456": 1 }
```

**config.mjs** — Add SP configuration:
```
MANASHARD.skillPoints = {
  perLevel: 3,        // SP gained per character level-up
  perEncounter: 1,    // SP gained per combat encounter
  maxSkillLevel: 10,
  levelUpCost: (currentLevel) => currentLevel  // SP cost formula
};
```

### Task 2 — Derived Stat Integration

**actor-character.mjs `prepareDerivedData()`** — When computing skill data for display/combat, apply level bonuses:
- For each skill in the loadout, look up its level from `skillLevels`
- Sum all `levelBonuses` entries where `bonus.level <= skillLevel`
- Store cumulative bonuses as derived data on the skill (e.g., `skill.derivedBaseRate = skill.baseRate + totalBaseRateBonus`)
- The combat damage calculation in **actor.mjs** (`computeSkillDamage` / `computeSkillDamagePreview`) should use the level-adjusted values

**Important**: The existing combat formulas in `actor.mjs` use `skill.baseRate`, `skill.mpCost`, etc. directly. The cleanest approach is to compute effective values during `prepareDerivedData()` and store them so combat code reads the already-adjusted values. Be careful not to permanently mutate the item's source data — only set derived/computed fields.

### Task 3 — Absorb Duplicate Logic

**actor-sheet.mjs `onAbsorbSkill()`** — Modify the existing absorption handler:
- After getting the skill item, check if a skill with the same name (case-insensitive) already exists in `skillLibrary`
- If NO match: existing flow (absorb normally, skill starts at Level 1, set `skillLevels[id] = 1`)
- If YES match:
  - Look up current level of the matched skill
  - If level >= 10: show warning dialog, abort
  - Otherwise: show confirmation dialog with level-up preview
  - On confirm: increment `skillLevels[matchedSkillId]` by 1, delete the consumed manacite item from inventory
  - Post chat message: "[Character] strengthened [Skill Name]! (Lv X → Lv X+1)"

### Task 4 — SP Spending UI (Character Sheet)

**actor-skills.hbs** — Add SP spending interface to the Skills tab:
- Show current SP total in the tab header area (e.g., "SP: 12")
- In the **Skill Library** section, each skill row should show:
  - Current level badge (e.g., "Lv 3")
  - A "Level Up" button (disabled if not enough SP or already max level)
  - Tooltip showing: cost, and what the next level grants (from `levelBonuses`)
- The **Skill Loadout** section should also show skill levels on each equipped skill

**actor-sheet.mjs** — Add SP spending handler:
- `onLevelUpSkill(event)`: reads skill ID from data attribute, validates SP >= cost, deducts SP, increments `skillLevels[id]`, posts chat message
- Confirm dialog: "Spend X SP to level up [Skill Name] to Lv Y?"
- Show what bonuses the next level grants in the confirmation

### Task 5 — SP Award Integration

**actor-sheet.mjs or actor-character.mjs** — SP from level-up:
- In the existing level-up flow, after incrementing level, also add `CONFIG.MANASHARD.skillPoints.perLevel` to `system.sp`
- Post in the level-up chat message: "+3 SP"

**SP from combat encounters**:
- Search for where combat EXP is awarded (likely in a combat helper or GM tool)
- Add SP award alongside EXP: `+CONFIG.MANASHARD.skillPoints.perEncounter SP`
- If no automated EXP flow exists yet, skip this — GM manual award covers it

**GM manual edit**:
- SP should be editable directly on the character sheet sidebar (like eiress). Add an SP field near the eiress/exp display

### Task 6 — Manacite Item Sheet (Author UI)

**item-details.hbs** or the relevant manacite editing template — Add a level bonus editor:
- Only show for skill-type manacite (not jobs)
- Section header: "Level Bonuses"
- Table with columns: Level | Base Rate | MP Cost | Hit | Range | AOE Size
- Rows for levels 2–10 (level 1 is the base values)
- Each cell is an editable number input (default 0)
- Only show relevant columns based on skill type:
  - Magic/Art: show all columns
  - Passive: show a note that passive improvements are described in the description text (but still allow mechanical fields if desired)

### Task 7 — Skill Loadout Display Updates

**actor-skills.hbs** — Update skill display to show effective (level-adjusted) values:
- In the loadout tooltip/details, show effective baseRate, mpCost, etc. with level bonuses applied
- Format: "Base Rate: 8 (+3 from Lv4)" or similar
- The combat forecast should automatically pick up adjusted values if Task 2 is done correctly

### Task 8 — Chat Card Updates

**templates/chat/** — Update skill usage chat cards:
- Show skill level next to skill name in combat chat cards (e.g., "Fire Bolt Lv 5")
- The damage formula breakdown should reflect level-adjusted values

### Task 9 — NPC Skill Levels

**actor-hostile.mjs / actor-allied.mjs / actor-companion.mjs** — NPC actor types:
- Add `skillLevels: ObjectField` to NPC data models (same structure as character)
- NPCs don't need SP tracking (GM sets their skill levels directly)
- Add skill level editing to NPC sheets — simple number input per skill
- `prepareDerivedData()` should apply level bonuses the same way as characters

---

## Key Files to Modify
- `module/data-models/item-manacite.mjs` — levelBonuses schema
- `module/data-models/actor-character.mjs` — sp, skillLevels fields + derived data
- `module/data-models/actor-hostile.mjs` — skillLevels field
- `module/data-models/actor-allied.mjs` — skillLevels field
- `module/data-models/actor-companion.mjs` — skillLevels field
- `module/helpers/config.mjs` — SP constants
- `module/sheets/actor-sheet.mjs` — absorb duplicate logic, SP spending handler, SP award on level-up
- `module/documents/actor.mjs` — combat formulas use level-adjusted values
- `templates/actor/parts/actor-skills.hbs` — SP display, level badges, level-up buttons
- `templates/actor/parts/actor-sidebar.hbs` — SP field (editable like eiress)
- `templates/item/parts/item-details.hbs` — level bonus editor table
- `templates/chat/` — skill level in chat cards

## Order of Operations
1. Data models first (Task 1) — schema changes
2. Config constants (Task 1) — SP settings
3. Derived data integration (Task 2) — level bonuses affect combat values
4. Absorb duplicate logic (Task 3) — duplicate manacite → level up
5. Item sheet author UI (Task 6) — level bonus editing
6. Character sheet SP UI (Task 4) — spending interface
7. SP award flows (Task 5) — earning SP
8. Display updates (Tasks 7, 8) — loadout + chat cards
9. NPC support (Task 9) — skill levels on NPCs

## What NOT to Change
- Do not modify the growth rate system — that stays as-is for now
- Do not change how initial absorption works (first-time absorb flow is unchanged, just adds skillLevels[id] = 1)
- Do not change loadout slot limits or skill library mechanics
- Do not add new skill types or modify existing skill classification

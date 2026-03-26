# Status Effect Rework: 8 Universal Conditions

## Overview

Replace the current 15 status effects (8 elemental + 3 universal + 4 buffs) with **8 mechanically distinct, element-agnostic conditions**. Elements no longer define status identity — a Fire skill and a Poison skill can both inflict Blight. The element determines resistance checks and damage typing, not which condition exists.

**Remove entirely from the status system:** Guard, Ward, Regen, MP Regen. These become skill/rule-engine effects only (FlatModifier to DEF, heal-over-time, etc.), not toggleable sheet statuses.

---

## The 8 Conditions

| Condition | Key | Duration | Mechanic | Likely Sources |
|-----------|-----|----------|----------|----------------|
| **Blight** | `blight` | 3 turns | DoT: lose 2 HP at turn start | Fire, Dark, Poison skills |
| **Stun** | `stun` | 1 turn | Hard CC: skip entire turn | Ice, Lightning skills |
| **Immobilize** | `immobilize` | 2 turns | Soft CC: MOV = 0, can still act | Earth, Ice skills |
| **Impair** | `impair` | 2 turns | Offensive debuff: ACC and CRIT halved | Light, Wind skills |
| **Expose** | `expose` | 2 turns | Defensive debuff: EVA and DEF halved | Lightning, Water skills |
| **Silence** | `silence` | 2 turns | Can't cast magic-type skills | Dark, Wind skills |
| **Taunt** | `taunt` | 2 turns | Must target the taunter | Any (skill-based) |
| **Beguile** | `beguile` | 1 turn | Charm/dominate: forced to attack nearest ally on their turn | Dark, Light skills |

### Mechanic Details

- **Blight:** Flat 2 HP damage at turn start (same as old Burn/Poison). Simple, universal DoT.
- **Stun:** Lose your entire turn. Most powerful CC — shortest duration (1 turn). The target's turn is skipped during processStartOfTurn.
- **Immobilize:** MOV set to 0 for duration. Can still attack, cast, use items — just can't move. Enforced in movement validation.
- **Impair:** ACC halved, CRIT halved (applied as a temporary modifier during combat resolution). Reduces offensive effectiveness.
- **Expose:** EVA halved, P.DEF and M.DEF halved (applied as a temporary modifier during combat resolution). Makes the target fragile.
- **Silence:** Cannot use skills with `skillType: "magic"`. Arts and items still work. Same mechanic as old Silence.
- **Taunt:** Must direct single-target attacks/skills at the taunter. AoE still works normally. Same mechanic as old Taunt.
- **Beguile:** On their turn, the beguiled unit attacks their nearest ally with a basic weapon attack (no skills). If no allies are in range, they skip their turn. The caster doesn't control them — the automation picks the nearest ally target.

---

## Files to Modify

| File | Change |
|------|--------|
| `module/helpers/config.mjs` | Replace `statusEffects` (8 entries, no `element` field), update `statusIcons`, update `statusIconPaths` |
| `lang/en.json` | Replace all `MANASHARD.StatusEffects.*` i18n keys with the 8 new conditions |
| `module/data-models/actor-character.mjs` | Update `statusResistances` SchemaField: 8 keys instead of 15 |
| `module/data-models/actor-npc.mjs` | Update `statusResistances` SchemaField: 8 keys instead of 15 |
| `module/documents/actor.mjs` | Rewrite `processStartOfTurn()` for new conditions (Blight DoT, Stun skip, Beguile ally-attack). Remove old Burn/Poison/Hex/Regen/MPRegen logic |
| `module/helpers/combat.mjs` | Remove Guard/Ward damage reduction. Remove Frozen shatter, Burn bonus, Soak amplify. Add Impair/Expose modifier application during combat resolution. Update `isSilenced()` (key stays "silence"). Remove `getMPCostMultiplier()` hex check. Update `isCounterDisabled()` to check "stun" instead of "shock" |
| `module/helpers/terrain-engine.mjs` | Remove `POSITIVE_STATUSES` set (guard, ward, regen, mpRegen no longer statuses) or update to empty/remove the concept |
| `module/sheets/actor-sheet.mjs` | `statusResistanceEntries` context now maps 8 conditions. `statusEffectEntries` maps 8 conditions. Remove element-based icon coloring from status badges (conditions are element-agnostic) |
| `templates/actor/parts/actor-stats.hbs` | Status badge bar now shows 8 conditions (no element classes on badges) |
| `templates/actor/parts/actor-sidebar.hbs` | Status Resistances panel: 8 rows instead of 15, no element-based icon coloring |
| `templates/chat/attack-result.hbs` | Remove guard/ward/burn/frozen-specific result display. Add generic "status inflicted" display |
| `templates/chat/aoe-attack-result.hbs` | Same as attack-result |
| `styles/manashard.css` | Remove old ct-status-* colors for deleted statuses. Add new ct-status-* for 8 conditions. Remove element-colored status badge styles. Update status panel colors |
| `module/apps/status-effect-panel.mjs` | References CONFIG.MANASHARD.statusEffects — no structural change needed, just picks up new config |
| `module/helpers/forecast.mjs` | Update any status effect references in forecast calculations |

## Files NOT to Modify

- `module/helpers/rule-engine.mjs` — `mpRegen` is a **derived stat**, not a status effect. The base MP Regen from SPI/4 stays. Only the *status* called "mpRegen" is removed.
- `module/helpers/status-effects.mjs` — This is just the AE sync layer. It reads CONFIG generically. No status-specific logic.
- Item sheets, species sheets, skill sheets
- The `statusEffects` SetField on actors (still a Set of string keys — just different keys now)

---

## Order of Operations

1. **Config** — Replace `statusEffects`, `statusIcons`, `statusIconPaths` with 8 new conditions
2. **i18n** — Replace localization keys in `en.json`
3. **Data models** — Update `statusResistances` SchemaField on character and NPC (8 keys)
4. **Actor document** — Rewrite `processStartOfTurn()` for new condition mechanics
5. **Combat helpers** — Remove old status interactions (Guard/Ward/Frozen shatter/Burn bonus). Add Impair/Expose modifier logic. Update silence/counter checks
6. **Terrain engine** — Remove or update POSITIVE_STATUSES
7. **Sheet JS** — Context prep now handles 8 conditions, no element field on status entries
8. **Templates** — Update status badge bars and sidebar resistance panel for 8 conditions
9. **Chat templates** — Update attack result cards for new status display
10. **CSS** — Update status-specific color classes

---

## Critical Rules

1. **Conditions are element-agnostic.** No `element` field on the status config entries. A condition is inflicted by a skill; the skill has an element, the condition does not.
2. **Status resistance tiers still apply.** The 4-tier cycle (vulnerable/neutral/resist/immune) on the sidebar panel works the same way, just for 8 conditions instead of 15.
3. **The `statusEffects` SetField stays.** It's still a Set of active condition keys on the actor. Only the valid keys change (from 15 old keys to 8 new keys).
4. **Base MP Regen (SPI/4) is NOT touched.** That's a derived stat, not a status. It stays in the data model and `processStartOfTurn`.
5. **Guard/Ward/Regen/MP Regen are gone from statuses entirely.** If a skill needs to grant temporary DEF bonus or heal-over-time, it does so via the rule engine (FlatModifier, ResourceModifier), not by toggling a status.
6. **Beguile auto-attack uses basic weapon attack only.** No skills, no items. The automation picks the nearest ally, rolls a normal attack against them. If no ally in weapon range, the turn is skipped.
7. **Stun skips the entire turn.** The `processStartOfTurn` should post a "X is stunned!" chat message and signal the combat tracker to advance.
8. **Impair and Expose are applied during combat resolution**, not as persistent stat modifiers. They halve the relevant stats only when calculating hit/damage/evasion. The actor's sheet stats remain unchanged — the condition is checked at resolution time.
9. **Old status keys on existing actors will be orphaned.** Any actor with `burn`, `frozen`, etc. in their `statusEffects` Set will have stale keys. Add a migration in the data model's `migrateData()` to clear unrecognized status keys, or map old → new where sensible (e.g., burn → blight, frozen → stun).
10. **Icon assets** — Reuse existing SVGs where they fit (e.g., `burn.svg` → `blight.svg` rename, `silence.svg` stays). Create or source new icons for Beguile. Missing icons can use placeholder FA icons initially.

---

## Config Shape

```javascript
MANASHARD.statusEffects = {
  blight:     { label: "MANASHARD.StatusEffects.Blight",     description: "MANASHARD.StatusEffects.BlightDesc",     duration: 3, category: "debuff" },
  stun:       { label: "MANASHARD.StatusEffects.Stun",       description: "MANASHARD.StatusEffects.StunDesc",       duration: 1, category: "debuff" },
  immobilize: { label: "MANASHARD.StatusEffects.Immobilize", description: "MANASHARD.StatusEffects.ImmobilizeDesc", duration: 2, category: "debuff" },
  impair:     { label: "MANASHARD.StatusEffects.Impair",     description: "MANASHARD.StatusEffects.ImpairDesc",     duration: 2, category: "debuff" },
  expose:     { label: "MANASHARD.StatusEffects.Expose",     description: "MANASHARD.StatusEffects.ExposeDesc",     duration: 2, category: "debuff" },
  silence:    { label: "MANASHARD.StatusEffects.Silence",    description: "MANASHARD.StatusEffects.SilenceDesc",    duration: 2, category: "debuff" },
  taunt:      { label: "MANASHARD.StatusEffects.Taunt",      description: "MANASHARD.StatusEffects.TauntDesc",      duration: 2, category: "debuff" },
  beguile:    { label: "MANASHARD.StatusEffects.Beguile",    description: "MANASHARD.StatusEffects.BeguileDesc",    duration: 1, category: "debuff" },
};
```

Note: No `element` field. All 8 are `category: "debuff"`. Buffs are handled by the rule engine, not the status system.

---

## statusResistances SchemaField Shape

```javascript
statusResistances: new SchemaField({
  blight:     new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  stun:       new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  immobilize: new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  impair:     new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  expose:     new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  silence:    new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  taunt:      new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  beguile:    new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
}),
```

---

## Migration (migrateData)

In both `actor-character.mjs` and `actor-npc.mjs` `migrateData()`:

```javascript
// Migrate old status effect keys → new conditions
if (source.statusEffects) {
  const oldToNew = { burn: "blight", poison: "blight", hex: "blight", frozen: "stun", shock: "stun", root: "immobilize", blind: "impair", windshear: "impair", soak: "expose" };
  // silence and taunt keep their keys
  const migrated = new Set();
  for (const key of (source.statusEffects ?? [])) {
    const mapped = oldToNew[key] ?? key;
    if (["blight","stun","immobilize","impair","expose","silence","taunt","beguile"].includes(mapped)) {
      migrated.add(mapped);
    }
  }
  source.statusEffects = [...migrated];
}

// Clear old statusResistances keys
if (source.statusResistances) {
  const validKeys = new Set(["blight","stun","immobilize","impair","expose","silence","taunt","beguile"]);
  for (const key of Object.keys(source.statusResistances)) {
    if (!validKeys.has(key)) delete source.statusResistances[key];
  }
}
```

---

## Sidebar Status Resistance Panel (Updated)

The panel in `actor-sidebar.hbs` stays structurally identical — 2-column grid with clickable tier cycling. But now it shows 8 conditions instead of 15:

```
┌─────────────────────────────┐
│  STATUS RESISTANCES         │
│  Beguile  Neutral │ Blght N │
│  Expose   Neutral │ Immob N │
│  Impair   Neutral │ Silnc N │
│  Stun     Neutral │ Taunt N │
└─────────────────────────────┘
```

Since conditions are element-agnostic, all icons use the neutral gray style (`.element-neutral`). No element-colored icons on status resistances.

---

## CSS Color Scheme for Conditions

Each condition gets a distinct color for CTB tracker badges, status panels, and chat cards:

```css
/* Condition colors */
--manashard-blight: #8b5cf6;     /* Purple — corruption/decay */
--manashard-stun: #fbbf24;       /* Amber — stars/daze */
--manashard-immobilize: #92400e; /* Brown — earth/roots */
--manashard-impair: #6b7280;     /* Gray — dulled senses */
--manashard-expose: #ef4444;     /* Red — vulnerability */
--manashard-silence: #3b82f6;    /* Blue — suppression */
--manashard-taunt: #f97316;      /* Orange — aggro */
--manashard-beguile: #ec4899;    /* Pink — charm */
```

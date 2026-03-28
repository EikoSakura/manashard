# Adventurer Sheet: Status Resistances & Combat Tab Merge

## Overview

Three changes to the Adventurer (character) sheet:

1. **Status Effect Resistances in the sidebar** — A new panel below Elements showing all 15 status effects alphabetically with a clickable resistance tier (vulnerable / neutral / resist / immune). Same visual pattern as the elemental profile.
2. **Remove Active Effects from the Stats tab** — Delete the collapsible "Active Effects" rules list from the character's Stats tab. It's noise during playtesting.
3. **Merge the Stats and Combat tabs into one "Combat" tab** — Right now, derived stats (DMG, ACC, EVA…) live on the Stats tab and combat actions (weapon attack, skills, consumables) live on a separate Combat tab. Merge everything into a single **Combat** tab so the player sees their full combat picture at a glance. Remove the old Stats tab for characters.

**New character tab order: Combat | Equipment | Skills | Bio**

This is a **character sheet only** pass. Do not touch HostileUnit sheets or NPC code.

---

## 1. Status Effect Resistances in Sidebar

### What

A new `adv-panel` in the character sidebar, placed after the Elements panel. It shows all 15 status effects in an alphabetized 2-column compact grid. Each row is clickable to cycle through resistance tiers, exactly like elements.

### Why

Characters need a way to track which status effects they're strong or weak against. Species traits, equipment passives, and job bonuses can all grant status resistances. Right now there's nowhere on the sheet to see or set this.

### Layout

```
┌─────────────────────────────┐
│  STATUS RESISTANCES         │
│  Blind    Neutral │ Burn  N │
│  Frozen   Neutral │ Guard N │
│  Hex      Neutral │ MP Rg N │
│  Poison   Neutral │ Regen N │
│  Root     Neutral │ Shock N │
│  Silence  Neutral │ Soak  N │
│  Taunt    Neutral │ Ward  N │
│  Windsh.  Neutral │         │
└─────────────────────────────┘
```

### Resistance Tiers (4-tier cycle)

| Tier | Color | Meaning |
|------|-------|---------|
| `vulnerable` | Red (`--manashard-fire`) | Double duration / guaranteed application |
| `neutral` | Muted (`--manashard-text-muted`) | Default, normal rules apply |
| `resist` | Cyan (`--manashard-ice`) | 50% chance to resist |
| `immune` | Gold (`--manashard-gold`) | Fully immune |

Click cycles: neutral → resist → immune → vulnerable → neutral

### Alphabetized Order

Sort all 15 by their displayed label:
Blind, Burn, Frozen, Guard, Hex, MP Regen, Poison, Regen, Root, Shock, Silence, Soak, Taunt, Ward, Windshear

### Visual Style

Reuse the same pattern as the existing `.adv-el-row` / `.adv-element-grid`:
- 2-column grid of compact rows
- Each row: small colored icon + status name + tier label
- Elemental statuses use their element's icon color (burn=fire, frozen=ice, etc.)
- Non-elemental statuses (poison, silence, taunt, guard, ward, regen, mpRegen) use a neutral gray icon

### Data Model

**Files:** `module/data-models/actor-character.mjs` AND `module/data-models/actor-npc.mjs`

Add a `statusResistances` SchemaField after the existing `statusEffects` field. One StringField per status effect, choices `["vulnerable", "neutral", "resist", "immune"]`, initial `"neutral"`.

```javascript
statusResistances: new SchemaField({
  blind:     new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  burn:      new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  frozen:    new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  guard:     new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  hex:       new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  mpRegen:   new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  poison:    new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  regen:     new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  root:      new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  shock:     new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  silence:   new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  soak:      new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  taunt:     new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  ward:      new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
  windshear: new StringField({ required: true, initial: "neutral", choices: ["vulnerable", "neutral", "resist", "immune"] }),
}),
```

Add to both character AND NPC data models — enemies need status resistances too.

> **Note:** This is separate from the existing `statusEffects: new SetField(new StringField())` which tracks *currently active* statuses. The new field tracks *innate resistance tiers*. Both coexist.

### Context Preparation

**File:** `module/sheets/actor-sheet.mjs` in `_prepareContext()`

Build a `statusResistanceEntries` array from config + data model, sorted alphabetically by localized label:

```javascript
const statusResistances = this.actor.system.statusResistances ?? {};
context.statusResistanceEntries = Object.entries(CONFIG.MANASHARD.statusEffects)
  .map(([key, cfg]) => ({
    key,
    label: game.i18n.localize(cfg.label),
    element: cfg.element,
    tier: statusResistances[key] ?? "neutral",
    tierLabel: (statusResistances[key] ?? "neutral").charAt(0).toUpperCase()
             + (statusResistances[key] ?? "neutral").slice(1),
  }))
  .sort((a, b) => a.label.localeCompare(b.label));
```

### Action Handler

**File:** `module/sheets/actor-sheet.mjs`

New handler `cycleStatusTier`, registered in the `actions` map:

```javascript
static async #onCycleStatusTier(event, target) {
  const statusKey = target.closest("[data-status]")?.dataset.status;
  if (!statusKey) return;
  const current = this.actor.system.statusResistances?.[statusKey] ?? "neutral";
  const cycle = ["neutral", "resist", "immune", "vulnerable"];
  const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
  await this.actor.update({ [`system.statusResistances.${statusKey}`]: next });
}
```

### Template

**File:** `templates/actor/parts/actor-sidebar.hbs` — inside the `{{#if isCharacter}}` block, after the Elements panel, add:

```handlebars
{{!-- ═══ STATUS RESISTANCES ═══ --}}
{{#if statusResistanceEntries}}
<div class="adv-panel">
  <div class="adv-section-title">Status Resistances</div>
  <div class="adv-element-grid">
    {{#each statusResistanceEntries}}
    <div class="adv-el-row" data-status="{{key}}" data-action="cycleStatusTier">
      <span class="adv-el-icon {{#if element}}element-{{element}}{{else}}element-neutral{{/if}}"></span>
      <span class="adv-el-name">{{label}}</span>
      <span class="adv-sr-val tier-{{tier}}">{{tierLabel}}</span>
      <input type="hidden" name="system.statusResistances.{{key}}" value="{{tier}}" />
    </div>
    {{/each}}
  </div>
</div>
{{/if}}
```

### CSS

**File:** `styles/manashard.css`

```css
/* Status resistance tier colors */
.adv-sr-val { font-size: 10px; font-weight: 600; text-align: right; }
.adv-sr-val.tier-vulnerable { color: var(--manashard-fire); }
.adv-sr-val.tier-neutral    { color: var(--manashard-text-muted); }
.adv-sr-val.tier-resist     { color: var(--manashard-ice); }
.adv-sr-val.tier-immune     { color: var(--manashard-gold); }

/* Neutral element icon for non-elemental statuses */
.adv-el-icon.element-neutral { background: rgba(160, 160, 160, 0.2); }
```

---

## 2. Remove Active Effects from Stats Tab

### What

Delete the entire collapsible "Active Effects" section from the character block in `actor-stats.hbs`.

### Why

The Active Effects section lists raw rule engine entries (stat modifiers, status immunities, etc.) from equipped items. This is implementation detail that clutters the combat view during playtesting. Players don't need to see "+2 FlatModifier from Iron Sword" — they see the result in the derived stats.

### Template Change

**File:** `templates/actor/parts/actor-stats.hbs`

Remove this block from inside the `{{#if isCharacter}}` section:

```handlebars
{{!-- DELETE THIS ENTIRE BLOCK --}}
<details class="adv-collapsible">
  <summary><i class="fas fa-bolt"></i> Active Effects</summary>
  <div class="lh-rules-list">
    {{#if allRules.length}}
    {{#each allRules}}
    <div class="lh-rule-entry">...</div>
    {{/each}}
    {{else}}
    <p class="lh-rules-empty">No active effects on any owned items.</p>
    {{/if}}
  </div>
</details>
```

Do NOT remove the Active Effects section from NPC stat blocks — only from the character block.

---

## 3. Merge Stats + Combat → Single "Combat" Tab

### What

Combine the derived stats (currently on the Stats tab) and the combat actions (currently on the Combat tab) into one tab called **Combat**. Remove the old separate Combat tab for characters.

### Why

During combat, the player currently has to flip between two tabs:
- **Stats tab** to see their DMG, ACC, EVA, and toggle status effects
- **Combat tab** to actually attack, cast skills, or use items

This is awkward. A single Combat tab puts everything the player needs during their turn in one scrollable view: "here are your numbers, here are your actions."

### New Tab Order

**Before:** Stats | Equipment | Skills | Combat | Bio (5 tabs)
**After:** **Combat** | Equipment | Skills | Bio (4 tabs)

The tab `id` stays `"stats"` internally (to avoid breaking template data-tab bindings), but the **label** changes from "Status" to "Combat" and the **icon** changes to `fa-swords`.

### New Combat Tab Content (character only)

In order:
1. **Combat Profile** — derived stats grid (DMG, ACC, CRIT, EVA, C.AVO, BLK, P.DEF, M.DEF, MOV, VIS, MP RGN, CARRY)
2. **Status Effects** — toggle badge bar (Burn, Frozen, etc.)
3. **Weapon Attack** — equipped weapon tile with attack button (moved from old combat tab)
4. **Natural Weapons** — natural weapon tiles with attack buttons (moved from old combat tab)
5. **Skills** — job innate skill + loadout combat skills with cast/activate buttons (moved from old combat tab)
6. **Passives** — collapsed reference list (moved from old combat tab)
7. **Consumables** — consumable tiles with use buttons (moved from old combat tab)
8. **Wait / Defend** — end-turn button (moved from old combat tab)

### Template Changes

**`actor-stats.hbs`** — In the `{{#if isCharacter}}` block:
- Keep: Combat Profile (derived stats) and Status Effects (badge bar)
- Remove: Active Effects (already handled in section 2 above)
- **Append** all combat action sections after the status badges. Copy the content from the character-relevant sections of `actor-combat.hbs` (weapon attack, natural weapons, skills, passives, consumables, wait/defend). Use the `adv-tile-grid` pattern already in place.

**`actor-combat.hbs`** — Wrap the entire body in `{{#unless isCharacter}}...{{/unless}}` so characters render nothing on this tab (it won't even be in their tab bar, but this prevents any rendering if reached). NPC combat tab content stays exactly as-is.

### Tab Config Change

**`actor-sheet.mjs` `_getTabs()`** — For characters, the tab list becomes:

```javascript
const tabs = [
  { id: "stats", label: "Combat", icon: "fa-swords" },
  { id: "equipment", label: "Equipment", icon: "fa-shield-halved" },
  { id: "skills", label: "Skills", icon: "fa-sparkles" },
  { id: "biography", label: "Bio", icon: "fa-book-open" },
];
```

For HostileUnit, tabs stay as they currently are (Stats, Skills, Combat, Loot, Bio — separate Combat tab).

---

## Files to Modify

| File | Change |
|------|--------|
| `module/data-models/actor-character.mjs` | Add `statusResistances` SchemaField |
| `module/data-models/actor-npc.mjs` | Add `statusResistances` SchemaField |
| `module/sheets/actor-sheet.mjs` | Context prep for `statusResistanceEntries`, new `cycleStatusTier` handler, tab config (rename Stats→Combat for characters, remove Combat tab for characters) |
| `templates/actor/parts/actor-sidebar.hbs` | Add Status Resistances panel after Elements (character block only) |
| `templates/actor/parts/actor-stats.hbs` | Remove Active Effects, append combat action sections (character block only) |
| `templates/actor/parts/actor-combat.hbs` | Wrap body in `{{#unless isCharacter}}` |
| `styles/manashard.css` | Status resistance tier colors, neutral icon style |

## Files NOT to Modify

- NPC sidebar/header/template blocks (HostileUnit keeps its own Stats + Combat tabs)
- `actor-equipment.hbs`, `actor-skills.hbs`, `actor-biography.hbs`
- Item sheets, chat cards, combat helpers
- The existing `statusEffects` Set field (active statuses are separate from resistances)
- Any `data-action` handler logic — all existing handlers stay wired the same way

---

## Order of Operations

1. **Data model** — Add `statusResistances` to character and NPC data models
2. **Context prep** — Build `statusResistanceEntries` in `_prepareContext()`
3. **Action handler** — Add `cycleStatusTier` handler and register it
4. **Sidebar template** — Add Status Resistances panel after Elements
5. **CSS** — Add tier colors and neutral icon style
6. **Stats tab template** — Remove Active Effects from character block
7. **Stats tab template** — Append combat sections (weapon, skills, consumables, wait/defend) to character block
8. **Combat tab template** — Wrap body in `{{#unless isCharacter}}`
9. **Tab config** — Change character tabs to: Combat (id=stats) | Equipment | Skills | Bio

---

## Critical Rules

1. **Every form input must keep its exact `name` attribute** — existing combat inputs don't change. New inputs use `name="system.statusResistances.{{key}}"`
2. **Every `data-action` must wire to a registered handler** — all existing actions stay. New `cycleStatusTier` must be registered in the actions map.
3. **Do not duplicate combat template code** — move it from `actor-combat.hbs` into `actor-stats.hbs` for characters. The combat template guards its content with `{{#unless isCharacter}}`.
4. **The tab `id` stays `"stats"`** — only the displayed label changes to "Combat". This avoids breaking `data-tab="stats"` bindings in the template and scroll position tracking.
5. **NPC combat tab must still work** — HostileUnit keeps its separate Combat tab (id=combat) with all sections intact.
6. **Alphabetize status effects by displayed label** — not by config key.
7. **`statusEffects` ≠ `statusResistances`** — the Set tracks *currently active* statuses. The SchemaField tracks *innate resistance tiers*. Both fields coexist on the data model.

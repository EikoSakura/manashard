# Adventurer Sheet Redesign

## Overview

Redesign the player character sheet (actor type `character`) with two goals:
1. **Rename** "Player Unit" → "Adventurer" everywhere
2. **Visual overhaul** — sleeker, more readable layout inspired by the RPG status screens from *Reincarnated as a Sword* (isekai game-world UI aesthetic: dark panels, clean stat rows, glowing accents, compact info density)

This is a **character sheet only** pass. Do not touch hostile, allied, companion, or merchant sheets (their sidebars, headers, layout classes, or templates). NPC sheets will be addressed in a future phase.

---

## Design Direction

### Reference: *Reincarnated as a Sword* Status Screens
The anime/LN shows RPG status windows as translucent dark panels with:
- Clean horizontal stat rows (label left, value right)
- Compact, high-density information with good visual hierarchy
- Subtle glowing borders/accents (cyan/teal highlights)
- Skills/abilities shown as compact grid tiles that expand on interaction
- Minimal chrome — no heavy ornamental borders, just clean edges and spacing
- Semi-transparent dark backgrounds with light text

### Core Layout Principles
1. **Readability first** — larger font for key values, clear label/value separation, generous line-height
2. **Collapsible grids** — anything granted to the character (skills, equipment, items, passives, species traits) renders as a **compact grid of image + name tiles** that **uncollapse/expand** on click to reveal full details
3. **Flat panel aesthetic** — replace the current ornamental `.ms-panel` + `.ms-pcb` corner accents with cleaner flat panels (subtle border, slight glow, no pseudo-element corners)
4. **Information hierarchy** — most important info (HP/MP, level, equipped job) always visible; secondary info (growth rates, modifiers) revealed on hover or toggle

---

## Scope — What to Change

### 1. Rename: "Player Unit" → "Adventurer"

**actor-sheet.mjs:**
- `get title()` type label map: change `character: "Player Unit"` → `character: "Adventurer"`
- Any comments referencing "player unit" → "adventurer"

**system.json:**
- If the actor type label is defined there, update it too

**Templates:**
- Search all `.hbs` files for any visible text saying "Player Unit" and replace with "Adventurer"
- The sidebar placeholder text `placeholder="Character Name"` can stay as-is (it's a field prompt, not a type label)

### 2. Sidebar Redesign (`actor-sidebar.hbs` — character section only)

The character sidebar (`{{#if isCharacter}}` block) needs a visual overhaul. Keep the same data and form bindings but change the layout:

**Current structure** (`.lh-sidebar` with `.ms-panel` blocks):
- Portrait panel (diamond frame, class diamond, name, species, level/rank)
- Resource bars panel (HP/MP bars with ticks, EXP/RP/Eiress/SP row)
- Core stats panel (8-stat grid with growth toggle)
- Elements panel (elemental profile grid)

**New structure** (`.adv-sidebar` — new prefix `adv-` for adventurer):

```
┌─────────────────────────────┐
│  [Portrait]  Name           │
│  Species • Lv 5 • Rank D   │
├─────────────────────────────┤
│  HP ████████████░░░  24/30  │
│  MP ██████░░░░░░░░░  8/20   │
├─────────────────────────────┤
│  EXP 45/100  RP 30  Eiress 500│
│  SP 12                      │
├─────────────────────────────┤
│  STR  8    AGI  6           │
│  MAG 12    END  5           │
│  SPI  7    LUK  4           │
│  INT  3    CHM  2           │
│  [Growth toggle] [Level Up] │
├─────────────────────────────┤
│  Elements (compact row)     │
│  🔥 Neutral  ❄ Weak  etc   │
└─────────────────────────────┘
```

Key changes:
- **No diamond portrait frame** — use a simple rounded-rect or circle portrait (smaller, ~80px) next to the name on the same row
- **No `.ms-panel` / `.ms-pcb` corner accents** on character panels — use flat dark panels with a subtle 1px border and optional glow
- **Stats as a 2-column grid** — label+value pairs, not the current single-row-per-stat with separate growth input. Growth rates shown inline on toggle (e.g., "STR 8 (45%)")
- **Bars simplified** — remove the 10-tick decorative marks, use a clean single-fill bar
- **EXP/RP/Eiress/SP** as a compact 2×2 or 4-across row with smaller inputs
- **Elements** as a single compact row or 2-column mini-grid (icon + tier text only, no full row per element)

**Important:** Only modify the `{{#if isCharacter}}` block in `actor-sidebar.hbs`. Do NOT touch the `{{#if isHostileUnit}}`, `{{#if isCompanionUnit}}`, or `{{#if isAlliedUnit}}` blocks.

### 3. Tab Content Redesign — Collapsible Grid Pattern

The core visual change: **every list of granted/owned items becomes a collapsible tile grid.**

#### The Collapsible Grid Pattern

Every collection of items (skills, equipment, inventory, passives, etc.) should use this pattern:

```html
<div class="adv-tile-grid">
  {{#each items}}
  <details class="adv-tile" data-item-id="{{this.id}}">
    <summary class="adv-tile-summary">
      <img src="{{this.img}}" class="adv-tile-img" />
      <span class="adv-tile-name">{{this.name}}</span>
      <!-- Optional: 1-2 key badges (type, element, level) -->
    </summary>
    <div class="adv-tile-details">
      <!-- Expanded content: stats, description, action buttons -->
    </div>
  </details>
  {{/each}}
</div>
```

CSS should make `<summary>` render as a compact tile (image + name side-by-side, ~40px tall) and `<details>[open]` expand to show the full content below the tile.

#### Apply this pattern to:

**Skills Tab (`actor-skills.hbs` — character section):**
- **Equipped Job** — keep as a single prominent display (not a grid tile, it's unique)
- **Innate Skills** — tile grid (img + name, expand → description + stats)
- **Skill Loadout** — tile grid (img + name + level badge, expand → full stats + description + Cast/Remove buttons)
- **Skill Library** — tile grid (img + name + level badge, expand → type + Level Up button + Equip toggle)
- **Manacite Crystals** — tile grid (img + name, expand → Absorb/Equip/Edit/Delete actions)

**Equipment Tab (`actor-equipment.hbs`):**
- **Paperdoll slots** — keep the paperdoll layout but simplify the slot cards. Each slot should be a tile (img + name) that expands to show stats
- **Inventory** — tile grid (img + name + quantity, expand → stats + equip/edit/delete buttons)
- **Natural Weapons** — tile grid

**Combat Tab (`actor-combat.hbs`):**
- **Weapon Attack** — single tile (expand → attack button + forecast)
- **Combat Skills** — tile grid (img + name + MP cost, expand → full stats + Cast/Activate button)
- **Consumables** — tile grid (img + name + qty, expand → Use button + effect text)
- **Passives** — tile grid (img + name, expand → description)

**Status Tab (`actor-stats.hbs`):**
- **Combat Profile** (derived stats) — keep as a stat grid, not tiles. But simplify the layout — clean rows instead of the current ornamental grid
- **Status Effects** — keep as badge row (already compact)
- **Active Effects/Rules** — tile grid or collapsible list

**Bio Tab (`actor-biography.hbs`):**
- Keep the detail grid and prose editor as-is (no tile pattern needed here)

### 4. CSS Overhaul

**New class prefix:** `adv-` (adventurer) for all new character-specific classes.

**Remove/Replace for character only:**
- `.lh-*` classes → `adv-*` equivalents
- `.ms-panel` + `.ms-pcb` on character panels → `adv-panel` (flat dark panel, 1px border, subtle glow)
- Diamond portrait frame → simple portrait

**Keep unchanged:**
- All `.hu-*`, `.cu-*`, `.au-*` classes (NPC sheets)
- All `.ms-panel` usage in NPC sidebars (they still use the current style)
- Chat card styles
- Item sheet styles
- Any shared utility classes

**New CSS patterns needed:**

```css
/* Adventurer panel — flat dark, subtle border, optional glow */
.adv-panel {
  background: rgba(15, 20, 30, 0.85);
  border: 1px solid rgba(68, 204, 255, 0.15);
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 6px;
}

/* Collapsible tile grid */
.adv-tile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 4px;
}
.adv-tile summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  cursor: pointer;
  border-radius: 3px;
  background: rgba(255,255,255,0.03);
}
.adv-tile summary:hover {
  background: rgba(68, 204, 255, 0.08);
}
.adv-tile[open] {
  grid-column: 1 / -1; /* Expanded tile spans full width */
}
.adv-tile-img {
  width: 32px; height: 32px;
  border-radius: 3px;
  object-fit: cover;
}
.adv-tile-details {
  padding: 6px 8px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
```

### 5. Actor Sheet JS Changes (`actor-sheet.mjs`)

- Rename type label in `get title()`
- Update `_onRender()` to apply `.adv-layout` class instead of `.lh-layout` for characters
- Update scroll position selectors if sidebar class changes
- Keep all action handlers, data preparation, and drag-drop logic identical
- Update any `querySelector` calls that reference `.lh-sidebar` for characters → `.adv-sidebar`

---

## What NOT to Change

- **NPC sheets** — do not modify hostile, allied, companion, or merchant sheet templates, CSS, or JS logic
- **Data models** — no schema changes
- **Item sheets** — no changes to item-sheet.mjs or item templates
- **Chat cards** — no changes to chat templates or chat CSS
- **Combat logic** — no changes to actor.mjs combat functions
- **Config** — no changes to config.mjs
- **Action handler behavior** — all handlers keep their current logic, just wire them to new template elements
- **Context preparation** — `_prepareContext()` stays the same (the data is fine, only presentation changes)

---

## File List

Files to modify:
- `module/sheets/actor-sheet.mjs` — title label rename, layout class, scroll selectors
- `templates/actor/parts/actor-sidebar.hbs` — character `{{#if isCharacter}}` block redesign
- `templates/actor/parts/actor-stats.hbs` — character combat profile simplification
- `templates/actor/parts/actor-equipment.hbs` — collapsible tile pattern for equipment/inventory
- `templates/actor/parts/actor-skills.hbs` — collapsible tile pattern for skills (character `{{#if isCharacter}}` block only)
- `templates/actor/parts/actor-combat.hbs` — collapsible tile pattern for combat items
- `styles/manashard.css` — new `adv-*` classes, character-only CSS overhaul
- `system.json` — actor type label if defined there

Files to NOT modify:
- `templates/actor/parts/actor-header.hbs` — character header is already hidden
- `templates/actor/parts/actor-tabs.hbs` — tab structure stays the same
- `templates/actor/parts/actor-biography.hbs` — bio layout is fine
- `templates/actor/parts/actor-loot.hbs` — hostile only, not character
- Any NPC-specific code or templates
- Any `module/data-models/*.mjs` files
- Any `module/documents/*.mjs` files
- Any `module/helpers/*.mjs` files
- Any `templates/item/**` or `templates/chat/**` files

---

## Order of Operations

1. **Rename pass** — Change "Player Unit" → "Adventurer" in JS, templates, system.json
2. **CSS foundation** — Create `.adv-panel`, `.adv-tile-grid`, `.adv-tile`, `.adv-sidebar` base classes
3. **Sidebar redesign** — Rewrite the character `{{#if isCharacter}}` block in `actor-sidebar.hbs`
4. **Stats tab** — Simplify combat profile layout in `actor-stats.hbs`
5. **Skills tab** — Apply collapsible tile grid to `actor-skills.hbs` character section
6. **Equipment tab** — Apply collapsible tile grid to inventory in `actor-equipment.hbs`
7. **Combat tab** — Apply collapsible tile grid to combat items in `actor-combat.hbs`
8. **Polish** — Hover effects, transitions, responsive sizing, final CSS cleanup

---

## Critical Rules

1. **Every form input must keep its exact `name` attribute** — do not change any `name="system.stats.str.value"` or similar bindings. The data model is not changing.
2. **Every `data-action` attribute must stay wired to the same handler** — the action names (absorbSkill, equipToLoadout, levelUp, etc.) must not change.
3. **Every `data-item-id` attribute must be preserved** — item identification for actions depends on these.
4. **The `{{#if isCharacter}}` / `{{else}}` conditional structure must be preserved** in templates that serve multiple actor types (sidebar, skills, stats). Only modify code inside the character branch.
5. **Do not remove any functionality** — all current features must remain accessible, just presented differently.
6. **Test with both empty and populated character sheets** — empty states (no job, no skills, empty inventory) must still render cleanly.

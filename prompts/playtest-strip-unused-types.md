# Strip Unused Types for Initiative Playtest

## Goal

Remove everything related to **AlliedUnit**, **CompanionUnit**, **MerchantUnit** actor types and the **Material** item type. These are not needed for the initiative/combat playtest and add dead weight to the codebase.

**Keep:** Character (Adventurer) and HostileUnit — these are the only two actor types needed for combat playtesting.

---

## What to Remove

### Actor Types to Remove
- `alliedUnit`
- `companionUnit`
- `merchantUnit`

### Item Type to Remove
- `material`

---

## File-by-File Changes

### 1. `system.json`

**Remove from `documentTypes.Actor`:**
- `"alliedUnit"` entry (line ~30)
- `"companionUnit"` entry (line ~33)
- `"merchantUnit"` entry (line ~39)

**Remove from `documentTypes.Item`:**
- `"material"` entry (line ~59)

**Remove from `packs`:**
- The `"materials"` compendium pack entry (path `packs/materials`)

Keep `"monsters"` pack — it contains hostileUnit actors we still need.

### 2. `manashard.mjs`

**Remove data model registrations (~lines 98-105):**
- `CONFIG.Actor.dataModels.alliedUnit = NpcData;` — REMOVE
- `CONFIG.Actor.dataModels.companionUnit = NpcData;` — REMOVE
- `CONFIG.Actor.dataModels.merchantUnit = MerchantData;` — REMOVE
- `CONFIG.Item.dataModels.material = MaterialData;` — REMOVE

Keep: `CONFIG.Actor.dataModels.hostileUnit = NpcData;`

**Remove the MerchantData import** at the top of the file.
**Remove the MaterialData import** at the top of the file.

**Remove sheet registrations (~lines 126-148):**
- The `Actors.registerSheet()` call for `alliedUnit` — REMOVE
- The `Actors.registerSheet()` call for `companionUnit` — REMOVE
- The `Actors.registerSheet()` call for `merchantUnit` — REMOVE

Keep: HostileUnit sheet registration.

**Remove token attribute configuration (~lines 181-184):**
- `alliedUnit: npcTrackable` — REMOVE
- `companionUnit: npcTrackable` — REMOVE
- `merchantUnit: npcTrackable` — REMOVE

Keep: `hostileUnit: npcTrackable`

**Update the actor type restriction (~line 251):**
- Current: `const allowed = new Set(["character", "companionUnit"]);`
- Change to: `const allowed = new Set(["character"]);`
- Update comment accordingly

### 3. `module/helpers/config.mjs`

**Update `NPC_TYPES` (~line 7):**
- Current: `new Set(["alliedUnit", "companionUnit", "hostileUnit", "merchantUnit"])`
- Change to: `new Set(["hostileUnit"])`

### 4. `module/documents/actor.mjs`

**Simplify `_preCreate` default token settings (~lines 23-46):**
- Remove the `alliedUnit`, `companionUnit`, `merchantUnit` cases from the disposition switch
- Remove the `companionUnit` actorLink special case
- Keep: character and hostileUnit logic

### 5. `module/sheets/actor-sheet.mjs`

**`get title()` (~lines 88-94):**
- Remove `alliedUnit`, `companionUnit`, `merchantUnit` from the typeLabels map
- Keep: `character: "Adventurer"` and `hostileUnit: "Hostile Unit"`

**`_getTabs()` (~lines 101-103):**
- Remove any tab-building logic branches for isCompanion, isAllied
- Keep: character and hostileUnit tab logic

**Context preparation (~lines 169-171):**
- Remove: `isCompanionUnit`, `isAlliedUnit` context flags
- Keep: `isHostileUnit`

**`_onRender()` layout classes (~lines 680-686):**
- Remove: `cu-layout`, `au-layout` class additions
- Keep: `adv-layout` (character) and `hu-layout` (hostileUnit)

**Scroll position selectors:**
- Remove `.cu-sidebar`, `.au-sidebar` from querySelectorAll strings
- Keep: `.adv-sidebar`, `.hu-sidebar`

**`#onSelectOwner` handler (~line 2912):**
- Remove this entire static method (only used by CompanionUnit)

**`#onClearOwner` handler:**
- Remove this entire static method (only used by CompanionUnit)

**Remove `selectOwner` and `clearOwner` from the `actions` map.**

**Passive abilities section (~lines 608-609):**
- Remove companionUnit/alliedUnit from any type checks for passives
- Keep: character and hostileUnit

### 6. `templates/actor/parts/actor-header.hbs`

**Remove entire blocks:**
- `{{#if isHostileUnit}}` block — KEEP this one
- `{{#if isCompanionUnit}}` block — REMOVE (cu-header-bar, companion badge, bond indicator)
- `{{#if isAlliedUnit}}` block — REMOVE (au-header-bar, allied badge)

### 7. `templates/actor/parts/actor-sidebar.hbs`

**Remove entire blocks:**
- `{{#if isCompanionUnit}}` block (lines ~286-446) — REMOVE (cu-sidebar, bond panel, companion stats)
- `{{#if isAlliedUnit}}` block (lines ~451-595) — REMOVE (au-sidebar, allied stats)

**Keep:**
- `{{#if isCharacter}}` block (adv-sidebar)
- `{{#if isHostileUnit}}` block (hu-sidebar)

### 8. `templates/actor/parts/actor-stats.hbs`

**Remove entire blocks:**
- `{{else if isCompanionUnit}}` block (lines ~235-348) — REMOVE
- `{{else if isAlliedUnit}}` block (lines ~350-463) — REMOVE

**Keep:**
- `{{#if isCharacter}}` block
- `{{#if isHostileUnit}}` block (rename from `{{else}}` if needed after removing the other branches)
- The final `{{else}}` catch-all block for "Other NPC" generic layout

### 9. `templates/actor/parts/item-details.hbs`

**Remove:**
- The `{{#if (eq itemType "material")}}` block (~line 634 through ~691) — material-specific fields (sources, tags)

### 10. `module/sheets/merchant-sheet.mjs`

**DELETE this entire file.** The merchant sheet is no longer needed.

### 11. Merchant Templates — DELETE all of these:
- `templates/actor/parts/merchant-header.hbs`
- `templates/actor/parts/merchant-sidebar.hbs`
- `templates/actor/parts/merchant-shop.hbs`
- `templates/actor/parts/merchant-notes.hbs`
- `templates/actor/parts/merchant-tabs.hbs`

### 12. `module/data-models/actor-merchant.mjs`

**DELETE this entire file.** MerchantData model is no longer needed.

### 13. `module/data-models/item-material.mjs`

**DELETE this entire file.** MaterialData model is no longer needed.

### 14. `module/sheets/item-sheet.mjs`

**Remove material-specific context preparation (~lines 799-806):**
- Remove the block that parses material sources and tags

### 15. `lang/en.json`

**Remove localization entries:**
- `"TYPES.Actor.alliedUnit"` line
- `"TYPES.Actor.companionUnit"` line
- `"TYPES.Actor.merchantUnit"` line
- `"TYPES.Item.material"` line
- `"MANASHARD.SheetLabels.AlliedUnit"` line
- `"MANASHARD.SheetLabels.CompanionUnit"` line
- `"MANASHARD.SheetLabels.MerchantUnit"` line
- `"MANASHARD.ItemTypes.material"` line

### 16. `styles/manashard.css`

**Remove entire CSS sections:**
- **CompanionUnit (cu-layout)** — ~lines 17964-18733 (all `.cu-*` rules, `--cu-*` variables)
- **AlliedUnit (au-layout)** — ~lines 18734-19407 (all `.au-*` rules, `--au-*` variables)
- **MerchantUnit (mu-layout)** — ~lines 19418-19800+ (all `.mu-*` rules, `--mu-*` variables)

**Keep:** HostileUnit CSS (hu-layout) and Adventurer CSS (adv-layout) sections.

### 17. `module/helpers/token-info-panel.mjs`

**Update NPC_TYPES check (~line 97):**
- This uses `CONFIG.MANASHARD.NPC_TYPES` which was already updated in config.mjs, so it should work automatically. Verify no hardcoded type lists exist.

### 18. Compendium Packs — DELETE directory:
- `packs/materials/` — delete the entire folder

---

## Order of Operations

1. **Data models** — Delete `actor-merchant.mjs` and `item-material.mjs`
2. **Sheets** — Delete `merchant-sheet.mjs`
3. **Templates** — Delete all `merchant-*.hbs` files, strip allied/companion/material blocks from shared templates
4. **Registration** — Update `manashard.mjs` (imports, model registration, sheet registration, token config)
5. **Config** — Update `config.mjs` NPC_TYPES set
6. **Actor document** — Simplify `actor.mjs` _preCreate
7. **Actor sheet** — Strip allied/companion/merchant from `actor-sheet.mjs`
8. **Item sheet** — Strip material context from `item-sheet.mjs`
9. **Localization** — Clean `en.json`
10. **CSS** — Remove cu-layout, au-layout, mu-layout sections
11. **system.json** — Remove type definitions and packs
12. **Packs** — Delete `packs/materials/` directory

---

## Critical Rules

1. **Do NOT touch HostileUnit** — enemies are essential for combat playtesting
2. **Do NOT touch Character (Adventurer)** — player characters are essential
3. **Do NOT remove shared code** — some CSS classes (`.lh-bar-*`, `.lh-stat-*`) are shared between HostileUnit and the old character sheet. Only remove code scoped exclusively to removed types (`.cu-*`, `.au-*`, `.mu-*`)
4. **Do NOT break the NPC data model** — `actor-npc.mjs` (NpcData) is shared by HostileUnit. Keep it. Just stop registering it for alliedUnit/companionUnit.
5. **Clean up conditional chains** — when removing `{{else if isCompanionUnit}}` or `{{else if isAlliedUnit}}` from templates, make sure the remaining if/else chain still works correctly
6. **Verify after removal** — the system should load with only Character and HostileUnit available in the actor creation menu, and Material should not appear in item creation

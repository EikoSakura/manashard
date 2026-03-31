# Manashard System — Current State

**Last updated:** 2026-03-31 (post-audit cleanup)
**System version:** 0.1.1
**Foundry VTT compatibility:** v13

---

## File Listing

### Core
| File | Purpose |
|------|---------|
| `manashard.mjs` | Entry point — registers data models, sheets, helpers, hooks, settings |
| `system.json` | System metadata, compendium packs, document types |
| `lang/en.json` | English localization (692 keys) |

### Data Models (`module/data-models/`)
| File | Purpose |
|------|---------|
| `actor-character.mjs` | Adventurer: stats + growths, rank, skill library/loadout, status resistances |
| `actor-npc.mjs` | Threat (NPC): stats (no growths), role, loot table, actions per turn |
| `actor-trap.mjs` | Trap: trigger, disarm, damage, status infliction, AOE |
| `item-weapon.mjs` | Weapons: 12 categories, might/crit, range, element, block |
| `item-armor.mjs` | Armor: cloth/light/heavy, PDEF/MDEF |
| `item-accessory.mjs` | Accessories: price, weight, equipped, rules |
| `item-manacite.mjs` | Manacite: unified job/skill model — growth rates, skill mechanics, prerequisites |
| `item-consumable.mjs` | Consumables: potion/scroll/food/bomb, restore, AOE |
| `item-species.mjs` | Species: size, rules (traits) |
| `item-material.mjs` | Materials: crafting ingredients with stacking |
| `item-item.mjs` | Generic items: loot, quest items |

### Document Classes (`module/documents/`)
| File | Purpose |
|------|---------|
| `actor.mjs` | ManashardActor — combat rolls, stat checks, vision sync, rank-up |
| `item.mjs` | ManashardItem — grant processing, cost tracking |
| `combat.mjs` | ManashardCombat — side-based turns, objectives, retaliation |

### Sheet Classes (`module/sheets/`)
| File | Purpose |
|------|---------|
| `actor-sheet.mjs` | Unified sheet for character, threat, and trap actors |
| `item-sheet.mjs` | Unified sheet for all 8 item types |

### Applications (`module/apps/`)
| File | Purpose |
|------|---------|
| `character-creation-wizard.mjs` | Multi-step character creation (9 steps) |
| `compendium-browser.mjs` | Filterable content browser for all compendiums |
| `creation-config.mjs` | GM config for species/job availability in creation |
| `ctb-tracker.mjs` | Side-based combat turn tracker (replaces default) |
| `encounter-builder.mjs` | GM tool: threat builder + encounter composer |
| `grant-choice-dialog.mjs` | Choice dialog for GrantItem rule resolution |
| `manacite-manager.mjs` | Per-actor skill library + absorption manager |
| `party-hud.mjs` | Floating party tracker (full/compact modes) |
| `party-sheet.mjs` | Guild roster + shared stash |
| `portrait-adjuster.mjs` | Diamond-frame portrait repositioning |
| `rule-element-editor.mjs` | Form dialog for editing rule elements |
| `spatial-inventory.mjs` | Pocket-dimension storage per actor |
| `status-effect-panel.mjs` | Floating buff/debuff panel with durations |
| `tag-input.mjs` | Reusable tag chip input component |
| `token-info-config.mjs` | Settings for token info panel visibility |
| `token-info-panel.mjs` | Floating info panel above selected token |

### Helpers/Engines (`module/helpers/`)
| File | Purpose |
|------|---------|
| `config.mjs` | MANASHARD config object + `renderIconHtml()` |
| `combat.mjs` | Combat resolution: damage, steal, loot, buff apply |
| `forecast.mjs` | Combat forecast calculation engine |
| `forecast-dialog.mjs` | Forecast dialog with live-updating values |
| `item-cards.mjs` | Chat card posting for items, skills, absorption, level-up |
| `rule-engine.mjs` | Core rule processor: modifiers, conditions, combat notes |
| `rule-migration.mjs` | Migrate old 20-type rules to new 6-type format |
| `aoe-engine.mjs` | AOE targeting: circle/line/cross, highlight rendering |
| `aura-engine.mjs` | Persistent aura effect reconciliation |
| `stat-check.mjs` | D100 roll-under stat checks and contested checks |
| `status-effects.mjs` | Status condition sync (status set → active effects) |
| `token-effects.mjs` | Status ring rendering + texture preloading |
| `sense.mjs` | DetectionModeSense — hostile creature sensing |
| `trap-sense.mjs` | DetectionModeTrapSense — trap detection |
| `outcome-splash.mjs` | Victory/defeat splash overlay |
| `vs-splash.mjs` | Fire Emblem-style VS splash with combat resolution |

### Styles (`styles/`)
| File | Purpose |
|------|---------|
| `manashard.css` | Main stylesheet (~19K lines) — layout, utilities, actor/item sheets, combat tracker |
| `crystal-sheet.css` | Actor/item sheet component styles |
| `chat-cards.css` | Chat message card styles |
| `wizard.css` | Character creation wizard styles |
| `compendium-browser.css` | Compendium browser styles |
| `manacite-manager.css` | Manacite manager styles |
| `encounter-builder.css` | Encounter builder styles |
| `party-sheet.css` | Party sheet styles |
| `party-hud.css` | Party HUD styles |
| `spatial-inventory.css` | Spatial inventory styles |

### Templates (`templates/`)

**Actor parts:** `actor-header.hbs`, `actor-tabs.hbs`, `actor-sidebar.hbs`, `actor-stats.hbs`, `actor-equipment.hbs`, `actor-combat.hbs`, `actor-skills.hbs`, `actor-biography.hbs`, `actor-loot.hbs`, `actor-trap.hbs`

**Item parts:** `item-header.hbs`, `item-tabs.hbs`, `item-description.hbs`, `item-details.hbs`, `item-rules.hbs`

**Chat cards (17):** attack-result, aoe-attack-result, stat-check, skill-info, item-card, consumable-use, absorption-card, levelup-card, steal-result, pillage-result, loot-result, status-removal, retaliation-card, retaliate-buff-card, charge-message, trigger-card, objective-result

**Combat:** ctb-tracker.hbs, ctb-empty.hbs

**Dialogs:** combat-forecast.hbs, stat-check-forecast.hbs

**Apps:** compendium-browser, creation-config (+ jobs + species), encounter-builder (+ threat + encounter), manacite-manager, party-hud, party-sheet, portrait-adjuster, spatial-inventory, status-effect-panel, token-info-panel, token-info-config

**Wizard (10 steps):** wizard-shell, step-name, step-species, step-job, step-skills, step-stats, step-growth, step-equipment, step-biography, step-summary

### Assets
- `assets/icons/gi-sprites.svg` — Game icon sprite sheet
- `assets/icons/status/*.svg` — 8 status effect icons (beguile, blight, expose, immobilize, impair, silence, stun, taunt)

### Documentation
- `prompts/skill-design-prompt.md` — Skill creation design guidelines
- `research-anime-fighter-skills.md` — Fighter archetype research
- `research-anime-mage-thief-priest-skills.md` — Mage/Thief/Priest archetype research

---

## Data Model Summary

### Actor Types

**Character (Adventurer)**
- 8 core stats with growth rates: STR, AGI, MAG, END, SPI, LUK, INT, CHM
- HP/MP with barrier support
- Rank system: F through S (controls stat caps, loadout slots)
- Skill library (absorbed) + skill loadout (equipped)
- Status resistances: 8 conditions x 4 tiers (vulnerable/neutral/resist/immune)
- Elemental profile: 8 elements x 5 tiers (weak/neutral/resist/immune/absorb)
- Equipment: mainhand, offhand, armor, 2 accessories
- Weight/encumbrance tracking

**Threat (NPC)**
- Same 8 stats (no growth rates)
- Role system: minion/standard/elite/boss/legendary
- Actions per turn (1-5)
- Loot table with per-item drop chance and stolen flag
- Size 1-5, creature types, movement modes

**Trap**
- Trigger type, disarm stat, difficulty penalty
- Damage + element + status infliction
- AOE size, repeating flag

### Item Types
- **Weapon** — 12 categories, might/crit/range/element/block
- **Armor** — cloth/light/heavy, PDEF/MDEF
- **Accessory** — generic slot with rules
- **Manacite (Job)** — growth rate bonuses, prerequisites
- **Manacite (Skill)** — magic/art/passive, MP cost, range, element, scaling, damage type, AOE, buffs
- **Consumable** — potion/scroll/food/bomb, restore HP/MP, AOE support
- **Species** — size, trait rules
- **Material** — crafting ingredients with stacking
- **Item** — generic loot/quest items

---

## Tab Structure

### Character Sheet
| Tab | ID | Template |
|-----|----|----------|
| Combat | `stats` | `actor-stats.hbs` |
| Equipment | `equipment` | `actor-equipment.hbs` |
| Skills | `skills` | `actor-skills.hbs` |
| Bio | `biography` | `actor-biography.hbs` |

Sidebar: `actor-sidebar.hbs` (portrait, level, HP/MP bars, stat grid, status resistances, elemental profile)

### Threat Sheet
| Tab | ID | Template |
|-----|----|----------|
| Combat | `stats` | `actor-stats.hbs` |
| Loadout | `skills` | `actor-skills.hbs` |
| Combat | `combat` | `actor-combat.hbs` |
| Loot | `loot` | `actor-loot.hbs` |
| Bio | `biography` | `actor-biography.hbs` |

### Trap Sheet
| Tab | ID | Template |
|-----|----|----------|
| Trap | `trap` | `actor-trap.hbs` |
| Bio | `biography` | `actor-biography.hbs` |

### Item Sheet (all types)
| Tab | ID | Template |
|-----|----|----------|
| Description | `description` | `item-description.hbs` |
| Details | `details` | `item-details.hbs` |
| Active Effects | `rules` | `item-rules.hbs` |

---

## Registered Handlebars Helpers

| Helper | Purpose |
|--------|---------|
| `eq` | Equality check (a === b) |
| `ne` | Not equal (a !== b) |
| `gt` | Greater than |
| `gte` | Greater than or equal |
| `lte` | Less than or equal |
| `min` | Minimum of two numbers |
| `max` | Maximum of two numbers |
| `includes` | Array inclusion check |
| `math` | Multi-operator arithmetic (+, -, *, /) with 0-100 clamping |
| `concat` | String concatenation |
| `lowercase` | String to lowercase |
| `upper` | String to uppercase |
| `substring` | Extract substring (str, start, end) |
| `array` | Create array from arguments |
| `ruleSummary` | Human-readable rule element description |
| `manashardIcon` | Render SVG sprite or Font Awesome icon |

---

## Known Issues / TODOs

No `TODO`, `FIXME`, `HACK`, or `XXX` comments exist in the current codebase.

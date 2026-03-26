Read prompts/adventurer-sheet-status-combat-rework.md first — it contains the full spec, file list, order of operations, and critical rules.
Then read every file listed in its "Files to Modify" table before writing any code. You need to understand the current template structure, action wiring, and form bindings before changing anything.

Key points:
* Add a Status Resistances panel to the character sidebar below Elements — 15 status effects alphabetized in a 2-column grid with clickable 4-tier cycle (vulnerable/neutral/resist/immune), matching the elemental profile pattern
* New `statusResistances` SchemaField on both character and NPC data models
* Remove the "Active Effects" collapsible from the character Stats tab
* Merge all combat actions (weapon attack, skills, consumables, wait/defend) from the Combat tab INTO the Stats tab for characters — derived stats + actions in one view
* Rename the merged tab: label "Combat", icon `fa-swords`, but keep internal id `"stats"` to avoid breaking bindings
* New character tab order: **Combat | Equipment | Skills | Bio** (4 tabs, down from 5)
* Wrap `actor-combat.hbs` body in `{{#unless isCharacter}}` so NPCs keep their separate Combat tab
* Do not break any form bindings, action handlers, or NPC sheet code
Follow the order of operations in the spec. Work through each step sequentially.

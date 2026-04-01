# Death / Crystallization Automation Plan

## Context
Currently when a character hits 0 HP in combat, they get a `defeated` flag (skull icon) but no crystallize status is applied. PCs can't be un-defeated if revived. Enemies look the same dead or alive on the canvas — no visual feedback. The `crystallizeInstantly` NPC flag exists in the data model but has no implementation.

## Approach — Single helper in `module/helpers/combat.mjs`

Add a `setDefeated(token, defeated)` helper function and call it from existing defeat/revival code paths. All changes are in one file.

### `setDefeated(token, defeated)` helper
Handles all defeat/revival logic in one place:
1. **Update combatant defeated flag** — `combatant.update({ defeated })`
2. **Toggle crystallize status** — add/remove `"crystallize"` from `actor.system.statusEffects`
3. **Hide/show hostile tokens** — on defeat, hide enemy tokens (with 1.5s delay for visual feedback, or instantly if `crystallizeInstantly` is true). On revival, unhide.

### Call sites (3 total)

1. **Normal defeat** (~line 717-722): Replace inline `combatant.update({ defeated: true })` with `await setDefeated(token, true)`

2. **Retaliatory defeat** (~line 796-800): Replace inline `atkCombatant.update({ defeated: true })` with `await setDefeated(attackerToken, true)`

3. **Revival on heal** (new, after line 713): Detect `isHealing && oldHp <= 0 && newHp > 0`, then call `await setDefeated(token, false)`

### Files Modified
- `module/helpers/combat.mjs` — add helper + 3 call sites

### Not Changed
- Status effect config, icons, data models — already correct
- CTB tracker / Party HUD — already react to Foundry's defeated flag
- `crystallizeInstantly` on NPC data model — already exists, just needs to be read

## Verification
1. Kill an enemy in combat — should get crystallize icon, then token hides after 1.5s
2. Kill an enemy with `crystallizeInstantly` checked — token hides immediately
3. Kill a PC — gets crystallize icon + defeated skull in tracker
4. Heal a dead PC above 0 HP — defeated flag clears, crystallize removed, can act again
5. Kill via retaliatory damage — same defeat behavior as normal kill

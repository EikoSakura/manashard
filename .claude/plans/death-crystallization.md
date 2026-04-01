# Death / Crystallization Automation Plan

## Summary
Automate crystallize status application on defeat, auto-hide enemy tokens, support instant crystallize (remove token), and auto-revive PCs when healed above 0 HP.

## Changes

### 1. Auto-apply Crystallize Status on Defeat (`module/helpers/combat.mjs`)
**Where**: After `combatant.update({ defeated: true })` at lines ~720 and ~799

Add crystallize status to the defeated actor's `system.statusEffects`. This makes the crystallize icon appear on tokens and is the source of truth for "this actor is dead."

```js
// After marking defeated:
const current = new Set(actor.system.statusEffects ?? []);
if (!current.has("crystallize")) {
  current.add("crystallize");
  await actor.update({ "system.statusEffects": [...current] });
}
```

### 2. Hide Enemy Tokens on Defeat (`module/helpers/combat.mjs`)
**Where**: Same defeat block, after applying crystallize

For NPC/threat tokens (hostile disposition), hide the token from the canvas after a short delay (let the crystallize icon flash briefly):

```js
if (token.document.disposition <= -1) {
  const crystallizeInstantly = token.actor.system.crystallizeInstantly;
  if (crystallizeInstantly) {
    // Immediate removal — no delay
    await token.document.update({ hidden: true });
  } else {
    // Brief delay so players see the crystallize icon, then hide
    setTimeout(async () => {
      await token.document.update({ hidden: true });
    }, 1500);
  }
}
```

### 3. Auto-Revive PCs on Heal Above 0 HP (`module/helpers/combat.mjs`)
**Where**: After HP update at line ~713, in the healing path

When a healing skill brings HP from 0 to above 0, automatically:
- Remove the `defeated` flag from the combatant
- Remove the `crystallize` status effect

```js
const wasRevived = isHealing && oldHp <= 0 && newHp > 0;
if (wasRevived && game.combat?.started) {
  const combatant = game.combat.combatants.find(c => c.tokenId === tokenId);
  if (combatant?.isDefeated) {
    await combatant.update({ defeated: false });
  }
  // Remove crystallize status
  const current = new Set(token.actor.system.statusEffects ?? []);
  if (current.has("crystallize")) {
    current.delete("crystallize");
    await token.actor.update({ "system.statusEffects": [...current] });
  }
}
```

### 4. Extract Shared Helper Function
Since defeat and revival logic both manipulate crystallize status and defeated flags, extract a helper to keep it DRY:

```js
async function setDefeated(token, defeated) {
  const actor = token.actor;
  if (!actor || !game.combat?.started) return;

  const combatant = game.combat.combatants.find(c => c.tokenId === token.id);
  if (!combatant || combatant.isDefeated === defeated) return;

  // Update defeated flag
  await combatant.update({ defeated });

  // Update crystallize status
  const current = new Set(actor.system.statusEffects ?? []);
  if (defeated) {
    current.add("crystallize");
  } else {
    current.delete("crystallize");
  }
  await actor.update({ "system.statusEffects": [...current] });

  // Hide/unhide hostile tokens
  if (defeated && token.document.disposition <= -1) {
    if (actor.system.crystallizeInstantly) {
      await token.document.update({ hidden: true });
    } else {
      setTimeout(() => token.document.update({ hidden: true }), 1500);
    }
  } else if (!defeated && token.document.hidden) {
    await token.document.update({ hidden: false });
  }
}
```

## Files Modified
- `module/helpers/combat.mjs` — Main changes: helper function + defeat/revive calls

## Not Changed
- Status effect config, icons, data models — all already correct
- CTB tracker / Party HUD — already handle defeated state via Foundry's native flag
- `crystallizeInstantly` field on NPC data model — already exists, just needs to be read

## Edge Cases Handled
- Retaliatory kill: uses same `setDefeated()` helper
- Healing a dead PC: auto-revives and unhides token (if it was hidden for some reason)
- Multiple status updates coalesced by existing 50ms debounce in status-effects.mjs

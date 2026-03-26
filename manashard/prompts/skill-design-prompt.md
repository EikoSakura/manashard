# Manashard Skill Design Prompt

We are designing skills for a Foundry VTT TTRPG system called Manashard. Read the memory files and codebase to understand how the system works before proposing anything.

## Skill Design Rules

- Skills are Manacite items with three types: **Art** (physical/hybrid), **Magic** (spell), or **Passive** (always-on or conditional).
- Skills are **universal** — any character can obtain them. They are affiliated with a Job (free for that Job), but not locked to it.
- Our system has **no cooldowns, no capacity cost, no dex% activations, no skill levels**. Skills cost MP and are used on your turn.
- **Not every skill needs to be a stat boost or combat damage.** Prioritize utility, class identity, and flavor. Skills like Locksmith, Steal, Warp, Commune, Pillage, and Spatial Inventory are the standard we're aiming for.
- Each Job's skills should define **what that Job IS** — not what it does in a spreadsheet. A Thief takes things and gets into places. A Mage bends the rules of the world. A Priest keeps people alive and cleanses corruption. A Shaman speaks to spirits and curses enemies. A Raider hits fast in packs. An Armiger masters equipment beyond physical limits.
- Jobs can have **more or less than 3 skills** depending on their complexity. A special or rare Job might have more.
- **Don't repeat patterns across Jobs.** Each Job's skill set should feel structurally different, not like a reskin of another Job's template.
- When proposing skills, **pitch the concept and identity first** — get approval before writing out the full stat blocks.

## Effect Wording Style

Effect text must be **short, direct, and mechanical**. No flavor prose. State what the skill does in game terms. Reference these examples from Fire Emblem Online for tone and brevity:

| Name | Effect |
|------|--------|
| Accurate | +5 Hit |
| Adrenaline | Unit gains +2 MOV when at 40% or less HP. |
| Armsthrift | Attacking twice or more during combat only consumes 1 weapon use. LUK% chance to not consume any weapon uses at all. |
| Bargain | Unit receives a 25% discount in shops. |
| Celerity | +1 MOV |
| Climber | Unit can cross Mountain/Peak and Cliff tiles. |
| Despoil | LUK% chance of obtaining a Bullion after defeating an enemy. |
| Cleave | When this unit deals damage in melee: Deals a third of damage dealt to a random enemy adjacent to target. |
| Charm | Increases the Accuracy and Dodge of allies in a 3-space radius by 10. |
| Daunt | Reduces the Accuracy and Critical of enemies in a 3-space radius by 10. |
| Endure | Unit restores HP equal to STR at the start of their turn. |

**Key takeaways from these examples:**
- Lead with the mechanical effect, not flavor
- Use specific numbers and stat names
- Conditions are stated plainly ("when at 40% or less HP", "when initiating combat")
- No unnecessary words — "Open any lock." not "The user channels their expertise to manipulate the locking mechanism."

## System Reference

- **Stats:** STR, AGI, MAG, END, SPI, INT, CHM, LUK
- **Derived Stats:** P.EVA, M.EVA, Accuracy, Crit, MOV, Vision, HP, MP
- **Status Effects:** Blight, Stun, Immobilize, Impair, Silence, Taunt, Expose, Beguile
- **Special Qualities:** Armored, Climb, Flying, Mounted, etc.
- **Elements:** Fire, Ice, Water, Lightning, Wind, Earth, Light, Dark, None
- **Damage Types:** Physical, Magical, Elemental, Healing
- **Skill subtypes:** Magic (cast with MP, supports chant modes), Art (physical/hybrid with MP), Passive (always or conditional)
- **Range types:** Self, Melee, Ranged, Weapon, None
- **Target types:** Single, AoE (circle/line/cross), Self

## Skills Already Designed

| Job | Skill | Type | Effect |
|-----|-------|------|--------|
| Knight | Rallying Cry | — | *(existing, pre-designed)* |
| Knight | Shield Block Mastery | — | *(existing, pre-designed)* |
| Knight | Protect (Cover) | — | *(existing, pre-designed)* |
| Thief | Steal | Art | Attempt to take an item from a target. Success based on LUK. |
| Thief | Locksmith | Art | Open any lock. |
| Thief | Detect Trap | Passive | Reveals traps and hidden doors within Vision range. |
| Mage | Arcane Bolt | Magic | Deal magical damage to a single target. |
| Mage | Barrier | Magic | Grant an ally temporary HP equal to user's MAG for 2 turns. |
| Mage | Warp | Magic | Teleport a willing unit to an unoccupied tile within range. |
| Priest | Heal | Magic | Restore HP to a single ally. |
| Priest | Purify | Magic | Remove one status effect from an ally. |
| Priest | Turn Undead | Magic | Deal light damage to undead and demonic enemies in an area. |
| Shaman | Hex | Magic | Curse an enemy, applying Blight. |
| Shaman | Spirit Ward | Magic | Ward an ally for 2 turns. Attackers take damage when hitting the warded unit. |
| Shaman | Commune | Passive | Sense spirits, curses, and hidden enemies within Vision range. |
| Raider | Rush | Art | Charge and strike. Bonus damage based on distance moved. |
| Raider | Pack Tactics | Passive | Deal bonus damage when an ally is adjacent to the same target. |
| Raider | Pillage | Passive | Automatically loot one random item when downing an enemy. |
| Armiger | Requip | Art | Swap any equipped weapon, armor, or accessory as a free action. |
| Armiger | Spatial Inventory | Passive | Store and retrieve items from a pocket dimension. |
| Armiger | Telekinesis | Passive | Equipped melee weapons can attack at range. |

## Anime Inspiration Sources

Reincarnated as a Sword, Reincarnated as a Slime, Shangri-La Frontier, SAO, DanMachi, Goblin Slayer, Overlord, Log Horizon, KonoSuba. Use these for flavor and creative direction, not mechanical copy.

## Process

**Do one Job or skill group at a time. Pitch concepts first, then detail after approval.**

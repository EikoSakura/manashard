/**
 * Item Chat Card helpers — build template data, post to chat, handle apply buttons.
 */

import { getTokensInAoe, filterAoeTargets, showAoeHighlight } from "./aoe-engine.mjs";
import { gridDistance, validateAttackRange } from "./combat.mjs";

// ═══════════════════════════════════════════════════════════════
// ELEMENT / DAMAGE-TYPE BADGE CONFIG
// ═══════════════════════════════════════════════════════════════

const BADGE_COLORS = {
  physical: { bg: "rgba(221,136,68,0.1)", border: "rgba(221,136,68,0.3)", text: "#dd8844" },
  magical:  { bg: "rgba(170,102,238,0.1)", border: "rgba(170,102,238,0.3)", text: "#aa66ee" },
  fire:     { bg: "rgba(255,102,68,0.1)",  border: "rgba(255,102,68,0.3)",  text: "#ff6644" },
  ice:      { bg: "rgba(68,204,255,0.1)",  border: "rgba(68,204,255,0.3)",  text: "#44ccff" },
  water:    { bg: "rgba(68,136,255,0.1)",  border: "rgba(68,136,255,0.3)",  text: "#4488ff" },
  lightning:{ bg: "rgba(255,204,34,0.1)",  border: "rgba(255,204,34,0.3)",  text: "#ffcc22" },
  wind:     { bg: "rgba(102,221,170,0.1)", border: "rgba(102,221,170,0.3)", text: "#66ddaa" },
  earth:    { bg: "rgba(136,170,68,0.1)",  border: "rgba(136,170,68,0.3)",  text: "#88aa44" },
  light:    { bg: "rgba(255,232,119,0.1)", border: "rgba(255,232,119,0.3)", text: "#ffe877" },
  dark:     { bg: "rgba(170,102,238,0.1)", border: "rgba(170,102,238,0.3)", text: "#aa66ee" },
  healing:  { bg: "rgba(68,204,102,0.1)",  border: "rgba(68,204,102,0.3)",  text: "#44cc66" },
  barrier:  { bg: "rgba(200,220,255,0.1)", border: "rgba(200,220,255,0.3)", text: "#c8dcff" },
  neutral:  { bg: "rgba(136,153,170,0.08)",border: "rgba(136,153,170,0.2)", text: "#8899aa" },
  null:     { bg: "rgba(136,153,170,0.08)",border: "rgba(136,153,170,0.2)", text: "#8899aa" }
};

function makeBadge(key, label) {
  const c = BADGE_COLORS[key] ?? BADGE_COLORS.neutral;
  return { key, label: label ?? key.toUpperCase(), bg: c.bg, border: c.border, text: c.text };
}

// ═══════════════════════════════════════════════════════════════
// BUILD TEMPLATE DATA
// ═══════════════════════════════════════════════════════════════

/**
 * Build the Handlebars context for an item chat card.
 * @param {Item} item - The Foundry item document
 * @param {Actor} actor - The owning actor
 * @returns {object} Template data
 */
export function buildItemCardData(item, actor) {
  const s = item.system;

  const base = {
    itemName: item.name,
    itemImg: item.img,
    itemType: item.type,
    actorName: actor.name,
    actorId: actor.id,
    itemId: item.id,
    description: _stripHtml(s.description ?? ""),
    stats: [],
    badges: [],
    effectLine: null,
    iconFrameClass: "",
    typeBadges: [],
    hasApply: false,
    applyLabel: "",
    applyIcon: "",
    applyData: {}
  };

  switch (item.type) {
    case "weapon":   return _buildWeapon(base, s);
    case "armor":    return _buildArmor(base, s);
    case "accessory":return _buildAccessory(base, s);
    case "consumable":return _buildConsumable(base, s, actor, item);
    case "manacite": return _buildManacite(base, s, actor, item);
    case "material": return _buildMaterial(base, s);
    default:         return _buildGeneric(base, s);
  }
}

function _stripHtml(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

function _formatPrice(val) {
  if (!val) return "0g";
  return val.toLocaleString() + "g";
}

// ── WEAPON ──
function _buildWeapon(d, s) {
  d.typeBadges.push("WEAPON");
  const catLabel = CONFIG.MANASHARD.weaponCategories?.[s.category];
  if (catLabel) d.typeBadges.push(game.i18n.localize(catLabel).toUpperCase());

  d.stats = [
    { label: "MIGHT", value: s.might },
    { label: "HIT",   value: s.hit },
    { label: "CRIT",  value: s.crit },
    { label: "WEIGHT",value: s.weight },
    { label: s.rangeType === "melee" ? "REACH" : "RANGE", value: s.minRange === s.maxRange ? `${s.minRange}` : `${s.minRange}\u2013${s.maxRange}` },
    { label: "VALUE", value: _formatPrice(s.price) }
  ];

  if (s.block > 0) d.stats.push({ label: "BLOCK", value: s.block });

  d.badges.push(makeBadge(s.damageType || "physical"));
  if (s.element && s.element !== "null") {
    d.badges.push(makeBadge(s.element));
  } else {
    d.badges.push(makeBadge("neutral", "NEUTRAL"));
  }

  return d;
}

// ── ARMOR ──
function _buildArmor(d, s) {
  d.typeBadges.push("ARMOR");
  const catLabel = CONFIG.MANASHARD.armorCategories?.[s.category];
  if (catLabel) d.typeBadges.push(game.i18n.localize(catLabel).toUpperCase());

  d.stats = [
    { label: "PDEF",  value: s.pdef },
    { label: "MDEF",  value: s.mdef },
    { label: "WEIGHT",value: s.weight },
    { label: "VALUE", value: _formatPrice(s.price) }
  ];

  return d;
}

// ── ACCESSORY ──
function _buildAccessory(d, s) {
  d.typeBadges.push("ACCESSORY");

  d.stats = [
    { label: "VALUE", value: _formatPrice(s.price) },
    { label: "WEIGHT",value: s.weight }
  ];

  // Show stat bonuses from rules
  const rules = s.rules ?? [];
  for (const rule of rules) {
    if ((rule.type === "Modifier" || rule.type === "FlatModifier") && rule.selector && rule.value) {
      const sign = rule.value >= 0 ? "+" : "";
      d.stats.push({ label: rule.selector.toUpperCase(), value: `${sign}${rule.value}` });
    }
  }

  // Show passive effect if any
  const passiveRules = rules.filter(r => r.type !== "Modifier" && r.type !== "FlatModifier");
  if (passiveRules.length || s.description) {
    // Description doubles as effect for accessories
  }

  return d;
}

// ── CONSUMABLE ──
function _buildConsumable(d, s, actor, item) {
  d.typeBadges.push("CONSUMABLE");
  d.iconFrameClass = "rounded";

  d.stats = [
    { label: "QTY",  value: s.quantity },
    { label: "VALUE",value: _formatPrice(s.price) }
  ];

  const restoreType = (s.restoreType ?? "hp").toUpperCase();
  const restoreAmount = Number(s.restoreAmount) || 0;
  if (restoreAmount > 0) {
    d.stats.push({ label: `+${restoreType}`, value: restoreAmount });
    d.badges.push(makeBadge("healing", `${restoreType} RESTORE`));
  }
  if (s.category === "bomb") d.badges.push(makeBadge("fire", "BOMB"));

  // Apply button — use consumable
  d.hasApply = true;
  d.applyLabel = "Use";
  d.applyIcon = "fa-flask";
  d.applyType = "consumable";

  d.applyData = {
    actorId: actor.id,
    itemId: item.id,
    targetType: s.targetType ?? "self",
    consumed: s.consumedOnUse ? "true" : "false",
    restoreType: s.restoreType ?? "hp",
    restoreAmount: String(restoreAmount)
  };

  return d;
}

// ── MANACITE ──
function _buildManacite(d, s, actor, item) {
  d.typeBadges.push("MANACITE");
  d.iconFrameClass = "diamond";

  if (s.manaciteType === "job") {
    d.typeBadges.push("JOB");
    d.stats = [];
    return d;
  }

  // Skill manacite
  const skillTypeLabel = (s.skillType ?? "magic").toUpperCase();
  d.typeBadges.push(skillTypeLabel);

  if (s.skillType === "passive") {
    // Passive — show stat bonuses from rules
    d.stats = [];
    const rules = s.rules ?? [];
    for (const rule of rules) {
      if ((rule.type === "Modifier" || rule.type === "FlatModifier") && rule.selector && rule.value) {
        const sign = rule.value >= 0 ? "+" : "";
        d.stats.push({ label: rule.selector.toUpperCase(), value: `${sign}${rule.value}` });
      }
    }
    if (s.description) {
      d.effectLine = { icon: "\u25C6", text: _stripHtml(s.description) };
    }
    return d;
  }

  // Magic or Art — active skill with combat stats
  d.stats = [];
  if (s.mpCost > 0) d.stats.push({ label: "MP COST", value: s.mpCost });
  if (s.baseRate > 0) d.stats.push({ label: "POWER", value: s.baseRate });
  if (s.skillHit > 0) d.stats.push({ label: "HIT", value: s.skillHit });
  if (s.rangeType === "melee" || s.rangeType === "weapon") {
    d.stats.push({ label: "REACH", value: "Weapon" });
  } else if (s.rangeDisplay) {
    d.stats.push({ label: "RANGE", value: s.rangeDisplay });
  }

  // Badges
  if (s.damageType) d.badges.push(makeBadge(s.damageType));
  if (s.element && s.element !== "null") d.badges.push(makeBadge(s.element));
  if (s.isHealing) d.badges.push(makeBadge("healing", "HEALING"));

  // Effect line
  const effectPrefix = s.isHealing ? "On Use:" : "On Use:";
  const effectDesc = _stripHtml(s.description ?? "");
  if (effectDesc) {
    const icon = s.element === "lightning" ? "\u26A1" :
                 s.element === "fire" ? "\uD83D\uDD25" :
                 s.element === "ice" ? "\u2744\uFE0F" :
                 s.isHealing ? "\u2764\uFE0F" : "\u2726";
    d.effectLine = { icon, text: `<strong>${effectPrefix}</strong> ${effectDesc}` };
  }

  // Cast button — triggers rollSkillAttack
  d.hasApply = true;
  d.applyLabel = "Cast";
  d.applyIcon = "fa-bolt";
  d.applyType = "manacite-skill";
  d.applyData = {
    actorId: actor.id,
    itemId: item.id
  };

  return d;
}

// ── MATERIAL ──
function _buildMaterial(d, s) {
  d.typeBadges.push("MATERIAL");

  d.stats = [
    { label: "QTY",  value: s.quantity },
    { label: "VALUE",value: _formatPrice(s.price) }
  ];
  return d;
}

// ── GENERIC (species, item, etc.) ──
function _buildGeneric(d, s) {
  d.typeBadges.push(d.itemType.toUpperCase());
  return d;
}

// ═══════════════════════════════════════════════════════════════
// POST ITEM CARD TO CHAT
// ═══════════════════════════════════════════════════════════════

/**
 * Post an item's info card to chat.
 * @param {Item} item - The item document
 * @param {Actor} actor - The owning actor
 */
export async function postItemCard(item, actor) {
  const data = buildItemCardData(item, actor);
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/manashard/templates/chat/item-card.hbs",
    data
  );
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  });
}

// ═══════════════════════════════════════════════════════════════
// POST ABSORPTION CARD TO CHAT
// ═══════════════════════════════════════════════════════════════

/**
 * Post a styled absorption card to chat when a manacite is absorbed.
 * @param {Item} item - The manacite item
 * @param {Actor} actor - The absorbing actor
 */
export async function postAbsorptionCard(item, actor) {
  const s = item.system;
  const typeBadges = ["MANACITE"];
  const skillTypeLabel = (s.skillType ?? "magic").toUpperCase();
  typeBadges.push(skillTypeLabel);

  // Build stats from the manacite data
  const stats = [];
  if (s.skillType === "passive") {
    const rules = s.rules ?? [];
    for (const rule of rules) {
      if ((rule.type === "Modifier" || rule.type === "FlatModifier") && rule.selector && rule.value) {
        const sign = rule.value >= 0 ? "+" : "";
        stats.push({ label: rule.selector.toUpperCase(), value: `${sign}${rule.value}` });
      }
    }
  } else {
    if (s.mpCost > 0) stats.push({ label: "MP COST", value: s.mpCost });
    if (s.baseRate > 0) stats.push({ label: "POWER", value: s.baseRate });
    if (s.rangeType === "melee" || s.rangeType === "weapon") {
      stats.push({ label: "REACH", value: "Weapon" });
    } else if (s.rangeDisplay) {
      stats.push({ label: "RANGE", value: s.rangeDisplay });
    }
  }

  const data = {
    actorName: actor.name,
    actorImg: actor.img,
    itemName: item.name,
    itemImg: item.img,
    typeBadges,
    stats
  };

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/manashard/templates/chat/absorption-card.hbs",
    data
  );
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  });
}

// ═══════════════════════════════════════════════════════════════
// APPLY ITEM CARD EFFECT (Chat Button Handler)
// ═══════════════════════════════════════════════════════════════

/**
 * Handle the Apply/Use/Cast button click on an item chat card.
 * @param {Event} event
 * @param {HTMLElement} btn
 */
export async function applyItemCardEffect(event, btn) {
  event.preventDefault();

  const applyType = btn.dataset.applyType;
  const actorId = btn.dataset.actorId;
  const itemId = btn.dataset.itemId;

  const actor = game.actors.get(actorId);
  if (!actor) {
    ui.notifications.warn("Actor not found.");
    return;
  }

  if (!actor.isOwner && !game.user.isGM) {
    ui.notifications.warn("You don't have permission to use this item.");
    return;
  }

  if (applyType === "consumable") {
    await _applyConsumable(btn, actor, itemId);
  } else if (applyType === "manacite-skill") {
    await _applyCastSkill(btn, actor, itemId);
  }
}

// ── Consumable apply ──
async function _applyConsumable(btn, actor, itemId) {
  const item = actor.items.get(itemId);
  if (!item) {
    ui.notifications.warn("Item no longer exists.");
    return;
  }

  if (item.system.quantity <= 0) {
    ui.notifications.warn(`${item.name}: No remaining uses.`);
    return;
  }

  const targetType = btn.dataset.targetType ?? "self";
  const consumed = btn.dataset.consumed === "true";
  const restoreType = btn.dataset.restoreType ?? "hp";
  const restoreAmount = Number(btn.dataset.restoreAmount) || 0;

  // Resolve target
  let targetToken = null;
  const selfToken = canvas.tokens?.placeables.find(t => t.actor?.id === actor.id);

  if (targetType === "self") {
    targetToken = selfToken;
  } else {
    const targets = game.user.targets;
    if (targets.size === 1) {
      targetToken = targets.first();
    } else if (targets.size === 0) {
      targetToken = selfToken;
    } else {
      ui.notifications.warn("Select a single target to use this item on.");
      return;
    }
  }

  if (!targetToken?.actor) {
    ui.notifications.warn("No valid target found. Place a token on the canvas.");
    return;
  }

  const targetActor = targetToken.actor;
  let summary = `Applied to ${targetActor.name}`;

  // Apply HP or MP restoration
  if (restoreAmount > 0) {
    if (restoreType === "hp") {
      const hp = targetActor.system.stats.hp;
      const oldVal = hp.value;
      const newVal = Math.min(hp.max, oldVal + restoreAmount);
      await targetActor.update({ "system.stats.hp.value": newVal });
      summary = `HP: ${oldVal} → ${newVal}`;
    } else if (restoreType === "mp") {
      const mp = targetActor.system.stats.mp;
      const oldVal = mp.value;
      const newVal = Math.min(mp.max, oldVal + restoreAmount);
      await targetActor.update({ "system.stats.mp.value": newVal });
      summary = `MP: ${oldVal} → ${newVal}`;
    }
  }

  // Decrement quantity
  if (consumed) {
    const newQty = Math.max(0, item.system.quantity - 1);
    if (newQty <= 0) {
      await item.delete();
    } else {
      await item.update({ "system.quantity": newQty });
    }
  }

  // Visual feedback
  btn.disabled = true;
  btn.classList.add("applied");
  btn.innerHTML = `<i class="fas fa-check"></i> ${summary}`;
}

// ── Manacite skill cast ──
async function _applyCastSkill(btn, actor, itemId) {
  const item = actor.items.get(itemId);
  if (!item || item.type !== "manacite") {
    ui.notifications.warn("Skill manacite not found.");
    return;
  }

  const skill = item.system;
  const mpCost = skill.mpCost ?? 0;

  // Check MP
  const mp = actor.system.stats.mp;
  if (mp.value < mpCost) {
    ui.notifications.warn(`Not enough MP. Need ${mpCost}, have ${mp.value}.`);
    return;
  }

  // ── AOE BRANCH ──
  if (skill.targetType === "aoe") {
    const targets = game.user.targets;
    if (targets.size !== 1) {
      ui.notifications.warn("Select one target as the AOE center.");
      return;
    }

    const centerToken = targets.first();
    const casterToken = canvas.tokens?.placeables.find(t => t.actor?.id === actor.id);
    if (!casterToken) {
      ui.notifications.warn("Caster token not found on canvas.");
      return;
    }

    // ── Range check: caster → AOE center ──
    // None/Self skills skip range validation entirely
    const skipAoeRange = skill.rangeType === "none" || skill.rangeType === "self";
    const dist = skipAoeRange ? 0 : gridDistance(casterToken, centerToken);
    let rngType, minRng, maxRng;
    if (skipAoeRange) {
      rngType = skill.rangeType;
      minRng = 0;
      maxRng = 0;
    } else if (skill.rangeType === "melee" || skill.rangeType === "weapon") {
      const wpn = actor.items.find(i => i.type === "weapon" && i.system.equipped && i.system.equipSlot !== "offhand");
      const actorReach = actor.system.reach ?? 1;
      if (skill.rangeType === "weapon") {
        rngType = wpn?.system?.rangeType ?? "melee";
        minRng = wpn?.system?.minRange ?? 1;
        maxRng = rngType === "melee" ? actorReach : (wpn?.system?.maxRange ?? 1);
      } else {
        rngType = "melee";
        minRng = 1;
        maxRng = actorReach;
      }
    } else {
      rngType = "ranged";
      minRng = skill.minRange ?? 1;
      maxRng = skill.maxRange ?? 1;
    }
    const rangeCheck = skipAoeRange ? { valid: true } : validateAttackRange({ distance: dist, minRange: minRng, maxRange: maxRng, rangeType: rngType });
    if (!rangeCheck.valid) {
      ui.notifications.warn(rangeCheck.reason);
      return;
    }

    const aoeShape = skill.aoeShape || "circle";
    const aoeSize = skill.aoeSize || 1;
    const aoeFilter = skill.aoeTargetFilter || "enemies";

    // Find all tokens in the AOE area
    const tokensInArea = getTokensInAoe(centerToken, aoeShape, aoeSize, casterToken);
    const filteredTokens = filterAoeTargets(tokensInArea, casterToken, aoeFilter);

    if (!filteredTokens.length) {
      ui.notifications.warn("No valid targets in AOE area.");
      return;
    }

    // Show visual highlight
    showAoeHighlight(centerToken, aoeShape, aoeSize, casterToken, skill.element);

    // Deduct MP (JP-scaled)
    await actor.update({ "system.stats.mp.value": mp.value - mpCost });

    // Resolve AOE attack against all targets
    await actor.rollAoeSkillAttack({
      skill,
      skillName: item.name,
      chantMode: "normal",
      targets: filteredTokens.map(t => ({ token: t, actor: t.actor })),
      mpCost: mpCost,
      aoeShape,
      aoeSize,
      itemId: item.id
    });

    // Visual feedback
    btn.disabled = true;
    btn.classList.add("applied");
    btn.innerHTML = `<i class="fas fa-check"></i> Cast ${item.name} (${filteredTokens.length} targets)`;
    return;
  }

  // ── SINGLE / SELF BRANCH (existing logic) ──
  const targets = game.user.targets;
  let defenderActor = null;
  let defenderToken = null;
  let targetTokenId = null;

  if (skill.targetType === "self" || skill.isHealing) {
    defenderToken = canvas.tokens?.placeables.find(t => t.actor?.id === actor.id);
    defenderActor = actor;
    targetTokenId = defenderToken?.id ?? null;
  } else if (targets.size === 1) {
    defenderToken = targets.first();
    defenderActor = defenderToken?.actor ?? null;
    targetTokenId = defenderToken?.id ?? null;
  } else if (targets.size === 0) {
    ui.notifications.warn("Select a target to cast on.");
    return;
  } else {
    ui.notifications.warn("Select a single target to cast on.");
    return;
  }

  // Deduct MP (JP-scaled)
  await actor.update({ "system.stats.mp.value": mp.value - mpCost });

  // Delegate to the actor's rollSkillAttack
  const defSys = defenderActor?.system;
  await actor.rollSkillAttack({
    skill,
    skillName: item.name,
    chantMode: "normal",
    defenderActor,
    defenderEvasion: defSys ? (defSys.stats.agi.value * 2.5) : 0,
    defenderDef: defSys?.pdef ?? 0,
    defenderSpi: defSys?.mdef ?? 0,
    defenderCritAvoid: 0,
    defenderBlockChance: 0,
    targetTokenId,
    mpCost: mpCost,
    itemId: item.id
  });

  // Visual feedback
  btn.disabled = true;
  btn.classList.add("applied");
  btn.innerHTML = `<i class="fas fa-check"></i> Cast ${item.name}`;
}

/**
 * Stat Check subsystem for the Manashard system.
 * Handles solo and contested stat checks with styled chat cards,
 * forecast dialogs, and cross-client socket communication.
 */

// ═══════════════════════════════════════════════════════════════
// THRESHOLD COMPUTATION
// ═══════════════════════════════════════════════════════════════

/**
 * Compute the threshold for a stat check.
 * Formula: stat × 2 + checkBonus + difficultyModifier, clamped 1–99.
 * @param {Actor} actor
 * @param {string} statKey - One of the 8 check stats
 * @param {string} difficultyKey - Key into CONFIG.MANASHARD.difficultyTiers
 * @returns {{ baseStat: number, checkBonus: number, difficultyMod: number, difficultyLabel: string, threshold: number }}
 */
export function computeStatCheckThreshold(actor, statKey, difficultyKey, conditionalBonus = 0) {
  const baseStat = actor.system.stats[statKey]?.value ?? 0;
  const checkBonus = actor.system._checkBonuses?.[statKey] ?? 0;
  const tier = CONFIG.MANASHARD.difficultyTiers[difficultyKey] ?? CONFIG.MANASHARD.difficultyTiers.normal;
  const difficultyMod = tier.modifier;
  const difficultyLabel = tier.label;
  const raw = (baseStat * 2) + checkBonus + conditionalBonus + difficultyMod;
  const threshold = Math.max(1, Math.min(99, raw));
  return { baseStat, checkBonus, conditionalBonus, difficultyMod, difficultyLabel, threshold };
}

// ═══════════════════════════════════════════════════════════════
// RESOLUTION
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve a stat check: compute threshold and roll d100.
 * @param {Actor} actor
 * @param {string} statKey
 * @param {string} difficultyKey
 * @returns {Promise<object>} Result with roll, threshold, success, etc.
 */
export async function resolveStatCheck(actor, statKey, difficultyKey, conditionalBonus = 0) {
  const { baseStat, checkBonus, conditionalBonus: condBonus, difficultyMod, difficultyLabel, threshold } =
    computeStatCheckThreshold(actor, statKey, difficultyKey, conditionalBonus);
  const roll = await new Roll("1d100").evaluate();
  const rollTotal = roll.total;
  const success = rollTotal <= threshold;
  return {
    roll, rollTotal, threshold,
    baseStat, checkBonus, conditionalBonus: condBonus, difficultyMod, difficultyLabel,
    success, statKey, difficultyKey
  };
}

/**
 * Determine the winner of a contested check.
 * Both succeed → higher roll wins (tie = initiator).
 * One succeeds → they win.
 * Neither → initiator fails, no winner.
 * @param {object} initiatorResult - From resolveStatCheck
 * @param {object} opponentResult - From resolveStatCheck
 * @returns {{ winnerId: 0|1|null, reason: string }}
 */
export function resolveContestedCheck(initiatorResult, opponentResult) {
  const iSuccess = initiatorResult.success;
  const oSuccess = opponentResult.success;

  if (iSuccess && !oSuccess) return { winnerId: 0, reason: "Only initiator succeeded" };
  if (!iSuccess && oSuccess) return { winnerId: 1, reason: "Only opponent succeeded" };

  // Both succeeded or both failed — lowest roll wins (roll-under: lower is better).
  // Tie goes to initiator.
  if (initiatorResult.rollTotal <= opponentResult.rollTotal) {
    const context = iSuccess ? "Both succeeded" : "Both failed";
    return { winnerId: 0, reason: `${context} — initiator rolled lower` };
  }
  const context = iSuccess ? "Both succeeded" : "Both failed";
  return { winnerId: 1, reason: `${context} — opponent rolled lower` };
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATE DATA
// ═══════════════════════════════════════════════════════════════

/**
 * Build template data for the stat-check.hbs chat card.
 * @param {Actor} actor - The initiating actor
 * @param {object} result - From resolveStatCheck
 * @param {object} [options={}]
 * @param {string} [options.context] - GM-set description
 * @param {boolean} [options.contested] - Whether this is contested
 * @param {Actor} [options.targetActor] - Opponent actor (contested only)
 * @param {object} [options.opponentResult] - Opponent's resolveStatCheck result
 * @param {number|null} [options.winnerId] - 0 = initiator, 1 = opponent, null = draw
 * @param {string} [options.reason] - Contest outcome reason
 * @returns {object}
 */
export function buildStatCheckTemplateData(actor, result, options = {}) {
  const statLabel = _statLabel(result.statKey);
  const statColor = CONFIG.MANASHARD.statColors[result.statKey] ?? "#8899aa";

  const data = {
    actorName: actor.name,
    actorImg: actor.img,
    statKey: result.statKey,
    statLabel,
    statColor,
    context: options.context || "",
    rollTotal: result.rollTotal,
    threshold: result.threshold,
    success: result.success,
    baseStat: result.baseStat,
    checkBonus: result.checkBonus,
    conditionalBonus: result.conditionalBonus ?? 0,
    activeCondLabels: options.activeCondLabels ?? [],
    difficultyMod: result.difficultyMod,
    difficultyLabel: result.difficultyLabel,
    contested: !!options.contested
  };

  if (options.contested && options.targetActor && options.opponentResult) {
    const oResult = options.opponentResult;
    const oStatLabel = _statLabel(oResult.statKey);
    const oStatColor = CONFIG.MANASHARD.statColors[oResult.statKey] ?? "#8899aa";
    Object.assign(data, {
      opponentName: options.targetActor.name,
      opponentImg: options.targetActor.img,
      opponentStatKey: oResult.statKey,
      opponentStatLabel: oStatLabel,
      opponentStatColor: oStatColor,
      opponentRollTotal: oResult.rollTotal,
      opponentThreshold: oResult.threshold,
      opponentSuccess: oResult.success,
      opponentBaseStat: oResult.baseStat,
      opponentCheckBonus: oResult.checkBonus,
      opponentDifficultyMod: oResult.difficultyMod,
      opponentDifficultyLabel: oResult.difficultyLabel,
      winnerId: options.winnerId,
      winnerName: options.winnerId === 0 ? actor.name
                : options.winnerId === 1 ? options.targetActor.name
                : null,
      contestReason: options.reason ?? ""
    });
  }

  return data;
}

function _statLabel(statKey) {
  return game.i18n.localize(CONFIG.MANASHARD.statAbbreviations[statKey]) || statKey.toUpperCase();
}

// ═══════════════════════════════════════════════════════════════
// CHAT CARD POSTING
// ═══════════════════════════════════════════════════════════════

/**
 * Post a stat check chat card.
 * @param {Actor} actor - The initiating actor
 * @param {object} result - From resolveStatCheck
 * @param {object} [options={}] - Same as buildStatCheckTemplateData options
 */
export async function postStatCheckCard(actor, result, options = {}) {
  const templateData = buildStatCheckTemplateData(actor, result, options);
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/manashard/templates/chat/stat-check.hbs",
    templateData
  );

  // Collect rolls for Foundry's roll display
  const rolls = [result.roll];
  if (options.opponentResult?.roll) rolls.push(options.opponentResult.roll);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls
  });
}

// ═══════════════════════════════════════════════════════════════
// FORECAST DIALOG
// ═══════════════════════════════════════════════════════════════

/**
 * Show the stat check forecast dialog.
 * @param {Actor} actor
 * @param {object} [options={}]
 * @param {string} [options.defaultStat] - Pre-selected stat key
 * @param {Actor|null} [options.targetActor] - Target actor for contested display
 * @returns {Promise<{ statKey: string, difficultyKey: string, context: string }|null>}
 */
export async function showStatCheckForecastDialog(actor, options = {}) {
  const { defaultStat = "str", targetActor = null } = options;

  // Build stat options
  const stats = CONFIG.MANASHARD.checkStats.map(key => ({
    key,
    label: _statLabel(key),
    value: actor.system.stats[key]?.value ?? 0,
    selected: key === defaultStat
  }));

  // Build difficulty options
  const difficulties = Object.entries(CONFIG.MANASHARD.difficultyTiers).map(([key, tier]) => ({
    key,
    label: tier.label,
    modifier: tier.modifier,
    modLabel: tier.modifier >= 0 ? `+${tier.modifier}` : `${tier.modifier}`,
    selected: key === "normal"
  }));

  // Build conditional check bonuses from rule cache
  const conditionalCheckBonuses = (actor.system._ruleCache?.conditionalCheckBonuses ?? []).map(rule => {
    const condConfig = CONFIG.MANASHARD.ruleConditions?.[rule.condition];
    const conditionLabel = condConfig ? game.i18n.localize(condConfig) : rule.condition;
    const sourceName = rule._source?.itemName ?? "Unknown";
    const signedValue = rule.value >= 0 ? `+${rule.value}` : `${rule.value}`;
    return {
      selector: rule.selector,
      value: rule.value,
      signedValue,
      sourceName,
      conditionLabel
    };
  });

  // Compute default threshold
  const { threshold: defaultThreshold } = computeStatCheckThreshold(actor, defaultStat, "normal");

  const ctx = {
    actorName: actor.name,
    actorImg: actor.img,
    stats,
    difficulties,
    conditionalCheckBonuses,
    defaultThreshold,
    contested: !!targetActor,
    targetName: targetActor?.name ?? ""
  };

  const templatePath = "systems/manashard/templates/dialog/stat-check-forecast.hbs";
  const content = await foundry.applications.handlebars.renderTemplate(templatePath, ctx);

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: targetActor ? `Stat Check vs ${targetActor.name}` : "Stat Check" },
    position: { width: 420 },
    content,
    buttons: [
      {
        action: "confirm",
        label: "Roll",
        icon: "fas fa-dice-d20",
        default: true,
        callback: (event, btn, dialog) => {
          const el = dialog.element;
          const statKey = el.querySelector(".scf-stat-select")?.value || defaultStat;
          const difficultyKey = el.querySelector(".scf-difficulty-select")?.value || "normal";
          const context = el.querySelector(".scf-context-input")?.value?.trim() || "";

          // Sum active conditional bonuses
          let conditionalBonus = 0;
          const activeCondLabels = [];
          el.querySelectorAll(".scf-conditional-cb:checked").forEach(cb => {
            conditionalBonus += Number(cb.dataset.value) || 0;
            activeCondLabels.push(cb.dataset.label);
          });

          return { statKey, difficultyKey, context, conditionalBonus, activeCondLabels };
        }
      },
      { action: "cancel", label: "Cancel" }
    ],
    render: (event, dialog) => {
      const el = dialog.element;
      const statSelect = el.querySelector(".scf-stat-select");
      const diffSelect = el.querySelector(".scf-difficulty-select");
      const previewVal = el.querySelector(".scf-preview-value");
      const previewFormula = el.querySelector(".scf-preview-formula");

      /** Compute the sum of all checked conditional bonuses. */
      const getConditionalBonus = () => {
        let sum = 0;
        el.querySelectorAll(".scf-conditional-cb:checked").forEach(cb => {
          sum += Number(cb.dataset.value) || 0;
        });
        return sum;
      };

      /** Show/hide conditional rows based on selected stat. */
      const updateConditionalVisibility = (statKey) => {
        el.querySelectorAll(".scf-conditional-row").forEach(row => {
          const selector = row.dataset.selector;
          const visible = selector === statKey || selector === "all";
          row.classList.toggle("scf-conditional-hidden", !visible);
          // Uncheck hidden toggles so they don't affect the total
          if (!visible) {
            const cb = row.querySelector(".scf-conditional-cb");
            if (cb) cb.checked = false;
          }
        });
      };

      const updatePreview = () => {
        const sKey = statSelect.value;
        const dKey = diffSelect.value;
        const condBonus = getConditionalBonus();
        const { baseStat, checkBonus, difficultyMod, threshold } =
          computeStatCheckThreshold(actor, sKey, dKey, condBonus);
        previewVal.textContent = threshold;
        const parts = [`${baseStat} \u00d7 2`];
        if (checkBonus !== 0) parts.push(`${checkBonus >= 0 ? "+" : ""}${checkBonus} bonus`);
        if (condBonus !== 0) parts.push(`${condBonus >= 0 ? "+" : ""}${condBonus} conditional`);
        if (difficultyMod !== 0) parts.push(`${difficultyMod >= 0 ? "+" : ""}${difficultyMod} difficulty`);
        previewFormula.textContent = parts.join(" ");
      };

      statSelect?.addEventListener("change", () => {
        updateConditionalVisibility(statSelect.value);
        updatePreview();
      });
      diffSelect?.addEventListener("change", updatePreview);
      el.querySelectorAll(".scf-conditional-cb").forEach(cb => {
        cb.addEventListener("change", updatePreview);
      });

      // Initial visibility filter
      updateConditionalVisibility(defaultStat);
    }
  });

  return result === "cancel" ? null : result;
}

// ═══════════════════════════════════════════════════════════════
// CONTESTED CHECK — OPPONENT STAT PICK DIALOG
// ═══════════════════════════════════════════════════════════════

/**
 * Show a dialog for the opponent to pick their stat in a contested check.
 * Displayed on the target player's client via socket.
 * @param {object} data
 * @param {string} data.initiatorName
 * @param {string} data.initiatorStatLabel
 * @param {string} data.context
 * @param {string} data.targetActorId
 * @returns {Promise<string|null>} Selected stat key or null if declined
 */
export async function showContestedStatPickDialog(data) {
  const targetActor = game.actors.get(data.targetActorId);
  if (!targetActor) return null;

  const stats = CONFIG.MANASHARD.checkStats.map(key => ({
    key,
    label: _statLabel(key),
    value: targetActor.system.stats[key]?.value ?? 0
  }));

  let html = `<div class="manashard stat-check-contest-pick">`;
  html += `<p><strong>${data.initiatorName}</strong> is contesting a <strong>${data.initiatorStatLabel}</strong> check against <strong>${targetActor.name}</strong>.</p>`;
  if (data.context) html += `<p class="scf-contest-context"><em>${data.context}</em></p>`;
  html += `<div class="scf-field"><label>Choose your stat:</label>`;
  html += `<select class="scf-contest-stat-select">`;
  for (const s of stats) {
    html += `<option value="${s.key}">${s.label} (${s.value})</option>`;
  }
  html += `</select></div></div>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `Contested Check — ${targetActor.name}` },
    content: html,
    buttons: [
      {
        action: "confirm",
        label: "Roll",
        icon: "fas fa-dice-d20",
        default: true,
        callback: (event, btn, dialog) => {
          return dialog.element.querySelector(".scf-contest-stat-select")?.value || "str";
        }
      },
      { action: "decline", label: "Decline" }
    ]
  });

  return result === "decline" ? null : result;
}

// ═══════════════════════════════════════════════════════════════
// SOCKET COMMUNICATION
// ═══════════════════════════════════════════════════════════════

/** Pending contested check promises keyed by requestId. */
const _pendingContests = new Map();

/**
 * Request a contested stat pick from a remote player via socket.
 * @param {string} targetUserId - The Foundry user ID who should respond
 * @param {object} data - { initiatorName, initiatorStatLabel, targetActorId, difficultyKey, context }
 * @returns {Promise<string|null>} The chosen stat key, or null if declined/timed out
 */
export function requestContestedStatPick(targetUserId, data) {
  const requestId = foundry.utils.randomID();

  return new Promise((resolve) => {
    // 60-second timeout
    const timeout = setTimeout(() => {
      _pendingContests.delete(requestId);
      ui.notifications.warn("Contested check timed out — opponent did not respond.");
      resolve(null);
    }, 60000);

    _pendingContests.set(requestId, { resolve, timeout });

    game.socket.emit("system.manashard", {
      type: "statCheckContest",
      requestId,
      targetUserId,
      ...data
    });
  });
}

/**
 * Register the socket listener for stat check contested messages.
 * Call once from the ready hook in manashard.mjs.
 */
export function registerStatCheckSocket() {
  game.socket.on("system.manashard", async (msg) => {
    if (msg.type === "statCheckContest") {
      // Only the targeted user should handle this
      if (msg.targetUserId !== game.user.id) return;

      const statKey = await showContestedStatPickDialog(msg);

      game.socket.emit("system.manashard", {
        type: "statCheckContestResponse",
        requestId: msg.requestId,
        statKey
      });
    }

    if (msg.type === "statCheckContestResponse") {
      const pending = _pendingContests.get(msg.requestId);
      if (!pending) return;
      clearTimeout(pending.timeout);
      _pendingContests.delete(msg.requestId);
      pending.resolve(msg.statKey ?? null);
    }
  });
}

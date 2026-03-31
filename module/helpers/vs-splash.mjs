import { renderIconHtml } from "./config.mjs";

/**
 * VS Canvas Overlay Splash — Fire Emblem-style battle cut-in with
 * combat resolution animation. Shows attacker and defender portraits
 * sliding in, then plays out the hit/miss/crit/block result with
 * HP bar drain and damage numbers before fading out.
 */

// Phase timings (ms)
const T_STRIKE   = 800;   // Attack flash + lunge
const T_RESOLVE  = 1200;  // Damage number / MISS appears, HP drains
const T_STATUS   = 2000;  // Status icons appear
const T_FADE     = 2800;  // Begin fade out
const T_REMOVE   = 3300;  // Remove overlay, resolve promise

/**
 * Status effect icon map for the splash overlay.
 */
const STATUS_ICONS = {
  blight:     "fas fa-biohazard",
  stun:       "fas fa-star",
  immobilize: "fas fa-anchor",
  impair:     "fas fa-eye-slash",
  expose:     "fas fa-shield-virus",
  silence:    "fas fa-comment-slash",
  taunt:      "fas fa-bullseye",
  beguile:    "fas fa-heart-crack"
};

/**
 * Show an enhanced VS splash overlay with combat resolution.
 * @param {object} opts
 * @param {string} opts.attackerName
 * @param {string} opts.attackerImg
 * @param {string} opts.defenderName
 * @param {string} opts.defenderImg
 * @param {string} [opts.actionLabel]
 * @param {string} [opts.element]
 * @param {boolean} [opts.isHostile]
 * @param {boolean} [opts.hit]
 * @param {boolean} [opts.critHit]
 * @param {boolean} [opts.blocked]
 * @param {number}  [opts.finalDamage]
 * @param {boolean} [opts.isHealing]
 * @param {number}  [opts.defenderHpBefore]
 * @param {number}  [opts.defenderHpMax]
 * @param {number}  [opts.defenderBarrier]
 * @param {Array}   [opts.statusResults]
 * @returns {Promise<void>}
 */
export function showVsSplash({
  attackerName, attackerImg,
  defenderName, defenderImg,
  actionLabel = "",
  element = "",
  isHostile = false,
  hit = true,
  critHit = false,
  blocked = false,
  finalDamage = 0,
  isHealing = false,
  isBarrier = false,
  isRetaliatory = false,
  defenderHpBefore = 0,
  defenderHpMax = 1,
  defenderBarrier = 0,
  statusResults = []
} = {}) {
  return new Promise(resolve => {
    const accentColor = isHostile ? "#e04040" : _getElementAccent(element);

    // Calculate HP percentages
    const hpBeforePct = defenderHpMax > 0
      ? Math.max(0, Math.min(100, (defenderHpBefore / defenderHpMax) * 100))
      : 100;

    // Barrier percentage (overlays on top of HP fill, right-aligned)
    const barrierBeforePct = (defenderBarrier > 0 && defenderHpMax > 0)
      ? Math.min(hpBeforePct, Math.max(0, (defenderBarrier / defenderHpMax) * 100))
      : 0;
    const barrierBeforeRight = 100 - hpBeforePct;

    let hpAfterPct;
    let barrierAfterPct;
    let barrierAfterRight;
    if (isRetaliatory) {
      // Retaliatory buff: no HP change — buff was applied separately
      hpAfterPct = hpBeforePct;
      barrierAfterPct = barrierBeforePct;
      barrierAfterRight = barrierBeforeRight;
    } else if (isBarrier) {
      // Barrier skill: HP unchanged, barrier grows
      hpAfterPct = hpBeforePct;
      const newBarrier = defenderBarrier + finalDamage;
      barrierAfterPct = defenderHpMax > 0
        ? Math.min(hpAfterPct, Math.max(0, (newBarrier / defenderHpMax) * 100))
        : 0;
      barrierAfterRight = 100 - hpAfterPct;
    } else if (isHealing) {
      hpAfterPct = defenderHpMax > 0
        ? Math.min(100, ((defenderHpBefore + finalDamage) / defenderHpMax) * 100)
        : 100;
      barrierAfterPct = (defenderBarrier > 0 && defenderHpMax > 0)
        ? Math.min(hpAfterPct, Math.max(0, (defenderBarrier / defenderHpMax) * 100))
        : 0;
      barrierAfterRight = 100 - hpAfterPct;
    } else {
      // Barrier absorbs first
      const barrierAbsorbed = Math.min(defenderBarrier, finalDamage);
      const hpDamage = finalDamage - barrierAbsorbed;
      const newBarrier = defenderBarrier - barrierAbsorbed;
      const newHp = Math.max(0, defenderHpBefore - hpDamage);
      hpAfterPct = defenderHpMax > 0
        ? Math.max(0, (newHp / defenderHpMax) * 100)
        : 100;
      barrierAfterPct = (newBarrier > 0 && defenderHpMax > 0)
        ? Math.min(hpAfterPct, Math.max(0, (newBarrier / defenderHpMax) * 100))
        : 0;
      barrierAfterRight = 100 - hpAfterPct;
    }

    // Build status icons HTML for successful inflictions
    const successStatuses = statusResults.filter(s => s.success);
    const statusIconsHtml = successStatuses.map(s => {
      const iconClass = STATUS_ICONS[s.status] || "fas fa-circle-exclamation";
      return `<div class="vs-splash-status-icon" title="${s.statusLabel}">${renderIconHtml(iconClass)}</div>`;
    }).join("");

    // Build outcome badge
    let outcomeBadgeHtml = "";
    if (!hit) {
      outcomeBadgeHtml = `<div class="vs-splash-miss">MISS</div>`;
    } else {
      if (critHit) {
        outcomeBadgeHtml += `<div class="vs-splash-crit-badge">CRITICAL</div>`;
      }
      if (blocked) {
        outcomeBadgeHtml += `<div class="vs-splash-block-badge"><i class="fas fa-shield"></i> BLOCKED</div>`;
      }
    }

    // Damage display (only on hit)
    const damageHtml = hit
      ? `<div class="vs-splash-damage ${isHealing ? "vs-splash-heal" : ""} ${isBarrier ? "vs-splash-barrier" : ""}" style="color: ${isBarrier ? "#c8dcff" : isHealing ? "#2ecc71" : accentColor};">${(isHealing || isBarrier) ? "+" : ""}${finalDamage}</div>`
      : "";

    const overlay = document.createElement("div");
    overlay.classList.add("vs-splash");
    if (critHit && hit) overlay.classList.add("vs-splash-will-crit");

    overlay.innerHTML = `
      <div class="vs-splash-bg"></div>
      <div class="vs-splash-flash"></div>
      <div class="vs-splash-content">
        <div class="vs-splash-side vs-splash-attacker">
          <div class="vs-splash-portrait-frame" style="border-color: ${accentColor}; box-shadow: 0 0 12px ${accentColor}40;">
            <img src="${attackerImg}" class="vs-splash-portrait" />
          </div>
          <div class="vs-splash-name">${attackerName}</div>
          ${actionLabel ? `<div class="vs-splash-action">${actionLabel}</div>` : ""}
        </div>
        <div class="vs-splash-center">
          <div class="vs-splash-vs" style="color: ${accentColor}; text-shadow: 0 0 20px ${accentColor}60;">VS</div>
        </div>
        <div class="vs-splash-side vs-splash-defender">
          <div class="vs-splash-portrait-frame">
            <img src="${defenderImg}" class="vs-splash-portrait" />
          </div>
          <div class="vs-splash-name">${defenderName}</div>
          <div class="vs-splash-hp-track">
            <div class="vs-splash-hp-fill ${isHealing ? "vs-splash-hp-healing" : ""}" style="width: ${hpBeforePct}%;"></div>
            ${barrierBeforePct > 0 ? `<div class="vs-splash-barrier-fill" style="right: ${barrierBeforeRight}%; width: ${barrierBeforePct}%;"></div>` : ""}
          </div>
          <div class="vs-splash-result-zone">
            ${damageHtml}
            ${outcomeBadgeHtml}
          </div>
          ${statusIconsHtml ? `<div class="vs-splash-status-icons">${statusIconsHtml}</div>` : ""}
        </div>
      </div>
      <div class="vs-splash-line" style="background: linear-gradient(90deg, transparent, ${accentColor}, transparent);"></div>
    `;

    document.body.appendChild(overlay);

    // Track scheduled timeouts so click-to-skip can cancel them
    const timers = [];

    // Click-to-skip: immediately resolve all phases and fade out
    function skipAnimation() {
      timers.forEach(t => clearTimeout(t));
      overlay.classList.add("vs-splash-active", "vs-splash-strike", "vs-splash-resolve");
      if (successStatuses.length > 0) overlay.classList.add("vs-splash-show-status");
      // Apply final HP/barrier values
      if (hit) {
        const hpFill = overlay.querySelector(".vs-splash-hp-fill");
        if (hpFill) hpFill.style.width = `${hpAfterPct}%`;
        const barrierFill = overlay.querySelector(".vs-splash-barrier-fill");
        if (barrierFill) {
          barrierFill.style.right = `${barrierAfterRight}%`;
          barrierFill.style.width = `${barrierAfterPct}%`;
        }
      }
      overlay.classList.add("vs-splash-fade");
      setTimeout(() => {
        overlay.remove();
        resolve();
      }, 500);
    }

    overlay.addEventListener("click", skipAnimation, { once: true });

    // Phase 1: Slide-in (reflow then activate)
    void overlay.offsetHeight;
    overlay.classList.add("vs-splash-active");

    // Phase 3: Strike — attack flash + lunge
    timers.push(setTimeout(() => {
      overlay.classList.add("vs-splash-strike");
    }, T_STRIKE));

    // Phase 4: Resolve — damage/miss + HP drain
    timers.push(setTimeout(() => {
      overlay.classList.add("vs-splash-resolve");
      // Animate HP bar and barrier to new values
      if (hit) {
        const hpFill = overlay.querySelector(".vs-splash-hp-fill");
        if (hpFill) hpFill.style.width = `${hpAfterPct}%`;
        const barrierFill = overlay.querySelector(".vs-splash-barrier-fill");
        if (barrierFill) {
          barrierFill.style.right = `${barrierAfterRight}%`;
          barrierFill.style.width = `${barrierAfterPct}%`;
        }
      }
    }, T_RESOLVE));

    // Phase 5: Status icons
    if (successStatuses.length > 0) {
      timers.push(setTimeout(() => {
        overlay.classList.add("vs-splash-show-status");
      }, T_STATUS));
    }

    // Phase 7: Fade out
    timers.push(setTimeout(() => {
      overlay.classList.add("vs-splash-fade");
    }, T_FADE));

    // Cleanup
    timers.push(setTimeout(() => {
      overlay.removeEventListener("click", skipAnimation);
      overlay.remove();
      resolve();
    }, T_REMOVE));
  });
}

/**
 * Get accent color for an element.
 */
function _getElementAccent(element) {
  const map = {
    fire: "#ff6644",
    ice: "#44ccff",
    water: "#4488ff",
    lightning: "#ffcc22",
    wind: "#66ddaa",
    earth: "#88aa44",
    light: "#ffe877",
    dark: "#aa66ee"
  };
  return map[element] || "#00e4a0";
}

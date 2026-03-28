/**
 * Victory / Defeat full-screen splash overlay — Fire Emblem-style.
 * Slides a dramatic banner across the screen, holds briefly, then fades out.
 */

// Phase timings (ms)
const T_ACTIVE  = 100;   // Trigger slide-in
const T_HOLD    = 2200;  // Begin fade-out
const T_REMOVE  = 3000;  // Cleanup

/**
 * Show victory or defeat splash overlay.
 * @param {"victory"|"defeat"} outcome
 * @param {object} [opts]
 * @param {string} [opts.objectiveLabel] - e.g. "Rout", "Defeat Boss"
 * @param {string} [opts.objectiveIcon]  - FA icon class
 * @returns {Promise<void>} resolves after animation completes
 */
export function showOutcomeSplash(outcome = "victory", { objectiveLabel = "", objectiveIcon = "" } = {}) {
  return new Promise(resolve => {
    const isVictory = outcome === "victory";

    const overlay = document.createElement("div");
    overlay.classList.add("outcome-splash", `outcome-splash--${outcome}`);

    overlay.innerHTML = `
      <div class="outcome-splash-bg"></div>
      <div class="outcome-splash-stripe"></div>
      <div class="outcome-splash-content">
        <div class="outcome-splash-icon">
          <i class="${isVictory ? "fas fa-crown" : "fas fa-skull"}"></i>
        </div>
        <div class="outcome-splash-label">${isVictory ? "Victory" : "Defeat"}</div>
        ${objectiveLabel ? `
        <div class="outcome-splash-objective">
          ${objectiveIcon ? `<i class="${objectiveIcon}"></i>` : ""}
          <span>${objectiveLabel}</span>
        </div>` : ""}
      </div>
      <div class="outcome-splash-stripe outcome-splash-stripe--bottom"></div>
    `;

    document.body.appendChild(overlay);

    // Reflow then activate
    void overlay.offsetHeight;
    setTimeout(() => overlay.classList.add("outcome-splash--active"), T_ACTIVE);

    // Fade out
    setTimeout(() => overlay.classList.add("outcome-splash--fade"), T_HOLD);

    // Cleanup
    setTimeout(() => {
      overlay.remove();
      resolve();
    }, T_REMOVE);
  });
}

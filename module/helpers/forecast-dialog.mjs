/**
 * Shared combat forecast dialog launcher for the Manashard system.
 * Renders the combat-forecast.hbs template inside a DialogV2 with
 * live-updating forecast values, chant mode switching, projected HP bars,
 * and casting modifier toggles.
 */

import { recalculateForecast } from "./forecast.mjs";

// ═══════════════════════════════════════════════════════════════
// DIALOG LAUNCHER
// ═══════════════════════════════════════════════════════════════

/**
 * Show the combat forecast dialog and return the user's input.
 * @param {object} ctx - Context from buildForecastContext()
 * @param {object} [options={}]
 * @param {string} [options.title] - Dialog window title override
 * @returns {Promise<object|null>} User selections or null if cancelled
 *   { eva, def, critEvo, chantMode, castingModActive }
 */
export async function showForecastDialog(ctx, options = {}) {
  // Render the Handlebars template
  const templatePath = "systems/manashard/templates/dialog/combat-forecast.hbs";
  const content = await foundry.applications.handlebars.renderTemplate(templatePath, ctx);

  // Track mutable state
  let selectedChant = ctx.chantMode;
  const raw = ctx._raw;

  // Determine dialog title
  const title = options.title ?? _getDialogTitle(ctx);

  // Determine action button label
  let actionLabel;
  if (ctx.retaliationMode) actionLabel = "Retaliate";
  else if (ctx.barrierMode) actionLabel = "Barrier";
  else if (ctx.healMode) actionLabel = "Heal";
  else if (ctx.isSpell) actionLabel = "Cast";
  else actionLabel = "Attack";

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title },
    content,
    buttons: [
      {
        action: "confirm",
        label: actionLabel,
        icon: "fas fa-dice-d20",
        default: true,
        callback: (event, btn, dialog) => {
          const el = dialog.element;
          const castingModActive = !!el.querySelector(".cf-casting-mod-cb")?.checked;
          if (ctx.healMode) {
            return { eva: 0, def: 0, critEvo: 0, chantMode: selectedChant, castingModActive };
          }
          const eva = Number(el.querySelector(".cf-eva")?.value) || 0;
          const def = Number(el.querySelector(".cf-def")?.value) || 0;
          const critEvo = Number(el.querySelector(".cf-critavoid")?.value) || 0;
          const offhand = !!el.querySelector(".cf-offhand-cb")?.checked;
          return { eva, def, critEvo, chantMode: selectedChant, castingModActive, offhand };
        }
      },
      { action: "cancel", label: "Cancel" }
    ],
    render: (event, dialog) => {
      const el = dialog.element;

      // ── References to updateable elements ──
      const hitEl = el.querySelector(".cf-hit-val");
      const critEl = el.querySelector(".cf-crit-val");
      const dmgEl = el.querySelector(".cf-dmg-val");
      const dmgLabelEl = el.querySelector(".cf-skill-dmg-val");
      const projBarEl = el.querySelector(".cf-hp-bar-projected-dmg, .cf-hp-bar-projected-heal");
      const currentBarEl = el.querySelector(".cf-hp-bar-current");
      const castingModRow = el.querySelector(".cf-casting-mod-row");
      const castingModCb = el.querySelector(".cf-casting-mod-cb");
      const castingModLabel = el.querySelector(".cf-casting-mod-label");
      const castingModCost = el.querySelector(".cf-casting-mod-cost");
      const mpValEl = el.querySelector(".cf-mp-val");
      const atkProjBar = el.querySelector(".cf-hp-counter-projected");

      // Disable confirm button when out of range or out of MP
      const confirmBtn = el.querySelector('[data-action="confirm"]');
      const mpBanner = el.querySelector(".cf-out-of-mp");
      const forecastRows = el.querySelector(".cf-forecast-rows");

      const setDisabled = (disabled) => {
        if (!confirmBtn) return;
        confirmBtn.disabled = disabled;
        confirmBtn.style.opacity = disabled ? "0.4" : "";
        confirmBtn.style.cursor = disabled ? "not-allowed" : "";
      };

      if (ctx.outOfRange || ctx.outOfMp) setDisabled(true);

      // ── Live update function ──
      const updateForecast = () => {
        const overrides = {};

        if (!ctx.healMode) {
          overrides.eva = Number(el.querySelector(".cf-eva")?.value) || 0;
          overrides.def = Number(el.querySelector(".cf-def")?.value) || 0;
          overrides.critEvo = Number(el.querySelector(".cf-critavoid")?.value) || 0;
        }
        overrides.chantKey = selectedChant;

        const calc = recalculateForecast(raw, overrides);

        // Update forecast values
        if (hitEl) hitEl.textContent = calc.hit;
        if (critEl) critEl.textContent = calc.crit;
        if (dmgEl) dmgEl.textContent = calc.damage;

        // Update projected HP bar
        if (currentBarEl) {
          currentBarEl.style.width = `${calc.projectedDefHpPct}%`;
        }

        // Update MP cost display for chant multiplier
        if (mpValEl && calc.chantMpCost !== undefined) {
          mpValEl.textContent = calc.chantMpCost;
        }

        // Update casting modifier visibility + MP cost
        if (raw.isSpell && raw.findCastingMod) {
          const activeMod = raw.findCastingMod(selectedChant);
          if (castingModRow) {
            if (activeMod) {
              castingModRow.style.display = "flex";
              if (castingModLabel) castingModLabel.textContent = game.i18n.localize(activeMod.def.label);
              if (castingModCost) castingModCost.textContent = `(${activeMod.def.mpMultiplier}x MP)`;
            } else {
              castingModRow.style.display = "none";
              if (castingModCb) castingModCb.checked = false;
            }
          }
        }

        // Update MP cost display
        if (mpValEl && raw.isSpell) {
          const modActive = castingModCb?.checked && raw.findCastingMod?.(selectedChant);
          const displayMp = modActive ? raw.mpCost * modActive.def.mpMultiplier : raw.mpCost;
          mpValEl.textContent = displayMp;
          mpValEl.classList.toggle("cf-mp-modified", !!modActive);
        }

        // Update out-of-MP state (chant mode changes MP cost)
        if (!ctx.outOfRange) {
          if (mpBanner) {
            mpBanner.style.display = calc.outOfMp ? "" : "none";
            const mpSmall = mpBanner.querySelector("small");
            if (mpSmall) mpSmall.textContent = calc.mpWarning;
          }
          if (forecastRows) forecastRows.classList.toggle("cf-forecast-disabled", calc.outOfMp);
          setDisabled(calc.outOfMp);
        }
      };

      // ── Wire up input listeners ──
      el.querySelectorAll(".cf-defender-inputs input").forEach(inp => {
        inp.addEventListener("input", updateForecast);
      });

      // ── Wire up chant mode buttons ──
      el.querySelectorAll(".cf-chant-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          selectedChant = btn.dataset.chant;
          // Update active state
          el.querySelectorAll(".cf-chant-btn").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          updateForecast();
        });
      });

      // ── Wire up casting modifier checkbox ──
      if (castingModCb) {
        castingModCb.addEventListener("change", updateForecast);
      }

      // Focus first input
      el.querySelector(".cf-eva")?.focus();
    }
  });

  if (result === "cancel" || !result || result === null) return null;
  return result;
}

// ═══════════════════════════════════════════════════════════════
// PRIVATE HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Generate dialog title from context.
 */
function _getDialogTitle(ctx) {
  if (ctx.retaliationMode) return `Retaliation Forecast — ${ctx.attacker.weaponName}`;
  if (ctx.barrierMode) return `Barrier Forecast — ${ctx.attacker.weaponName}`;
  if (ctx.healMode) return `Heal Forecast — ${ctx.attacker.weaponName}`;
  if (ctx.isSpell) return `Spell Forecast — ${ctx.attacker.weaponName}`;
  if (ctx.isNatural) return `Attack Forecast — ${ctx.attacker.weaponName}`;
  return "Combat Forecast";
}

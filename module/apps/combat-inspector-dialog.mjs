/**
 * Combat Inspector Dialog — opens from right-click → Inspect on attack chat cards.
 * Shows a full breakdown of every stat contributor (skills, weapons, armor, status effects, rules)
 * affecting Accuracy, Evasion, Damage, P.DEF, M.DEF, Critical, etc.
 */

// ═══════════════════════════════════════════════════════════════
// SECTION BUILDERS
// ═══════════════════════════════════════════════════════════════

/**
 * Build the sections array from debug data for the template.
 */
function buildSections(debug) {
  const sections = [];
  const atk = debug.attacker;
  const def = debug.defender;
  const res = debug.resolution;

  // ── ACCURACY ──
  {
    const rows = [];
    if (atk.accuracyFormula) {
      rows.push({ label: "Base Formula", value: atk.accuracyFormula, cls: "formula" });
    }
    rows.push({ label: "Base Accuracy", value: atk.baseAccuracy, cls: "base" });
    for (const m of atk.accuracyModifiers ?? []) {
      rows.push({ label: m.source, value: _signed(m.value), cls: "modifier", icon: m.icon ?? "fas fa-gem" });
    }
    for (const c of atk.accuracyConditionals ?? []) {
      rows.push({ label: c.source, value: _signed(c.value), cls: "modifier", icon: c.icon ?? "fas fa-bolt" });
    }
    if (atk.chantAccuracyBonus) {
      rows.push({ label: `Chant Bonus (${atk.chantLabel ?? "Full Cast"})`, value: _signed(atk.chantAccuracyBonus), cls: "modifier", icon: "fas fa-magic" });
    }
    if (atk.impairApplied) {
      rows.push({ label: "Impair (halved)", value: "×0.5", cls: "status", icon: "fas fa-eye-slash" });
    }
    rows.push({ label: "Final Accuracy", value: atk.finalAccuracy, cls: "total" });
    sections.push({ id: "accuracy", label: "Accuracy", icon: "fas fa-crosshairs", side: "attacker", rows });
  }

  // ── EVASION ──
  if (def) {
    const rows = [];
    if (def.evasionFormula) {
      rows.push({ label: "Base Formula", value: def.evasionFormula, cls: "formula" });
    }
    rows.push({ label: `Base ${res.damageType === "magical" ? "M.EVA" : "P.EVA"}`, value: def.baseEvasion, cls: "base" });
    for (const m of def.evasionModifiers ?? []) {
      rows.push({ label: m.source, value: _signed(m.value), cls: "modifier", icon: m.icon ?? "fas fa-gem" });
    }
    for (const c of def.evasionConditionals ?? []) {
      rows.push({ label: c.source, value: _signed(c.value), cls: "modifier", icon: c.icon ?? "fas fa-bolt" });
    }
    if (res.exposeApplied) {
      rows.push({ label: "Expose (halved)", value: "×0.5", cls: "status", icon: "fas fa-shield-virus" });
    }
    rows.push({ label: "Final Evasion", value: def.finalEvasion, cls: "total" });
    sections.push({ id: "evasion", label: "Evasion", icon: "fas fa-wind", side: "defender", rows });
  }

  // ── HIT RESOLUTION ──
  {
    const rows = [];
    rows.push({ label: "Accuracy", value: atk.finalAccuracy, cls: "base" });
    if (def) rows.push({ label: "− Evasion", value: def.finalEvasion, cls: "base" });
    rows.push({ label: "Hit Chance (clamped 5–99)", value: res.hitChance, cls: "total" });
    if (res.hitRoll !== null && res.hitRoll !== undefined) {
      rows.push({ label: "Roll", value: res.hitRoll, cls: res.hit ? "roll-hit" : "roll-miss" });
      rows.push({ label: "Result", value: res.hit ? "HIT" : "MISS", cls: res.hit ? "result-hit" : "result-miss" });
    }
    sections.push({ id: "hit", label: "Hit Resolution", icon: "fas fa-dice-d20", side: "resolution", rows });
  }

  // ── DAMAGE ──
  {
    const rows = [];
    for (const step of atk.formulaSteps ?? []) {
      rows.push({ label: step.label, value: step.value, cls: "base" });
    }
    for (const m of atk.damageModifiers ?? []) {
      rows.push({ label: m.source, value: _signed(m.value), cls: "modifier", icon: m.icon ?? "fas fa-gem" });
    }
    for (const c of atk.damageConditionals ?? []) {
      rows.push({ label: c.source, value: _signed(c.value), cls: "modifier", icon: c.icon ?? "fas fa-bolt" });
    }
    rows.push({ label: "Total Base Damage", value: res.baseDamage, cls: "total" });
    sections.push({ id: "damage", label: "Damage", icon: "fas fa-burst", side: "attacker", rows });
  }

  // ── P.DEF / M.DEF ──
  if (def) {
    const defLabel = res.damageType === "magical" ? "M.DEF" : "P.DEF";
    const rows = [];
    if (def.defFormula) {
      rows.push({ label: "Base Formula", value: def.defFormula, cls: "formula" });
    }
    rows.push({ label: `Base ${defLabel}`, value: def.baseDef, cls: "base" });
    for (const m of def.defModifiers ?? []) {
      rows.push({ label: m.source, value: _signed(m.value), cls: "modifier", icon: m.icon ?? "fas fa-gem" });
    }
    for (const c of def.defConditionals ?? []) {
      rows.push({ label: c.source, value: _signed(c.value), cls: "modifier", icon: c.icon ?? "fas fa-bolt" });
    }
    if (res.piercingAmount > 0) {
      rows.push({ label: "Piercing (flat)", value: `−${res.piercingAmount}`, cls: "status", icon: "fas fa-arrow-right" });
    }
    if (res.percentPiercing > 0) {
      rows.push({ label: "Piercing (percent)", value: `−${res.percentPiercing}%`, cls: "status", icon: "fas fa-arrow-right" });
    }
    if (res.exposeApplied) {
      rows.push({ label: "Expose (halved)", value: "×0.5", cls: "status", icon: "fas fa-shield-virus" });
    }
    rows.push({ label: `Final ${defLabel}`, value: res.defReduction, cls: "total" });
    sections.push({ id: "defense", label: defLabel, icon: "fas fa-shield-halved", side: "defender", rows });
  }

  // ── DAMAGE RESOLUTION ──
  if (res.hit) {
    const rows = [];
    rows.push({ label: "Base Damage", value: res.baseDamage, cls: "base" });
    rows.push({ label: `− ${res.damageType === "magical" ? "M.DEF" : "P.DEF"}`, value: res.defReduction, cls: "base" });
    rows.push({ label: "Raw Damage", value: res.rawDamage, cls: "total" });
    if (res.elementMultiplier && res.elementMultiplier !== 1.0) {
      rows.push({ label: `Elemental (${res.elementTierLabel ?? res.elementTier})`, value: `×${res.elementMultiplier}`, cls: "modifier", icon: "fas fa-fire" });
    }
    if (res.chantModifier && res.chantModifier !== 1.0) {
      rows.push({ label: `${res.chantLabel ?? "Chant"}`, value: `×${res.chantModifier}`, cls: "modifier", icon: "fas fa-magic" });
    }
    if (res.damageMultiplier && res.damageMultiplier !== 1.0) {
      rows.push({ label: "Off-Hand", value: `×${res.damageMultiplier}`, cls: "modifier", icon: "fas fa-hand" });
    }
    if (res.critHit) {
      rows.push({ label: "Critical Hit", value: res.brutalCrit ? "×2.5" : "×2", cls: "crit", icon: "fas fa-star" });
    }
    if (res.blocked) {
      rows.push({ label: "Blocked", value: "×0.5", cls: "modifier", icon: "fas fa-shield" });
    }
    rows.push({ label: "Final Damage", value: res.finalDamage, cls: "grand-total" });
    sections.push({ id: "resolution", label: "Damage Resolution", icon: "fas fa-calculator", side: "resolution", rows });
  }

  // ── CRITICAL ──
  {
    const rows = [];
    if (atk.critFormula) {
      rows.push({ label: "Base Formula", value: atk.critFormula, cls: "formula" });
    }
    rows.push({ label: "Base Critical", value: atk.baseCritical, cls: "base" });
    for (const m of atk.critModifiers ?? []) {
      rows.push({ label: m.source, value: _signed(m.value), cls: "modifier", icon: m.icon ?? "fas fa-gem" });
    }
    for (const c of atk.critConditionals ?? []) {
      rows.push({ label: c.source, value: _signed(c.value), cls: "modifier", icon: c.icon ?? "fas fa-bolt" });
    }
    if (atk.impairApplied) {
      rows.push({ label: "Impair (halved)", value: "×0.5", cls: "status", icon: "fas fa-eye-slash" });
    }
    rows.push({ label: "Final Critical", value: atk.finalCritical, cls: "total" });
    if (def) {
      rows.push({ label: "Crit Avoidance", value: def.critAvoid ?? 0, cls: "base" });
      rows.push({ label: "Crit Chance", value: res.critChance, cls: "total" });
    }
    if (res.critRoll !== null && res.critRoll !== undefined) {
      rows.push({ label: "Roll", value: res.critRoll, cls: res.critHit ? "roll-hit" : "roll-miss" });
    }
    sections.push({ id: "critical", label: "Critical", icon: "fas fa-star", side: "attacker", rows });
  }

  // ── BLOCK ──
  if (def && (res.blockChance > 0 || def.blockModifiers?.length)) {
    const rows = [];
    rows.push({ label: "Base Block Chance", value: def.baseBlockChance ?? 0, cls: "base" });
    for (const m of def.blockModifiers ?? []) {
      rows.push({ label: m.source, value: _signed(m.value), cls: "modifier", icon: m.icon ?? "fas fa-gem" });
    }
    rows.push({ label: "Final Block Chance", value: res.blockChance, cls: "total" });
    if (res.blockRoll !== null && res.blockRoll !== undefined) {
      rows.push({ label: "Roll", value: res.blockRoll, cls: res.blocked ? "roll-hit" : "roll-miss" });
    }
    sections.push({ id: "block", label: "Block", icon: "fas fa-shield", side: "defender", rows });
  }

  // ── ELEMENTAL ──
  if (res.element) {
    const rows = [];
    rows.push({ label: "Attack Element", value: res.element.toUpperCase(), cls: "base" });
    if (atk.grantedElement) {
      rows.push({ label: "Granted by", value: atk.grantedElement, cls: "modifier", icon: "fas fa-fire" });
    }
    if (def) {
      rows.push({ label: "Defender Affinity", value: res.elementTierLabel ?? "Neutral", cls: "base" });
      rows.push({ label: "Multiplier", value: `×${res.elementMultiplier ?? 1.0}`, cls: "total" });
      for (const aff of def.elementalAffinities ?? []) {
        rows.push({ label: `${aff.element} → ${aff.tier}`, value: `(${aff.source})`, cls: "modifier", icon: "fas fa-gem" });
      }
    }
    sections.push({ id: "elemental", label: "Elemental", icon: "fas fa-fire", side: "resolution", rows });
  }

  // ── STATUS EFFECTS (active on combatants) ──
  {
    const rows = [];
    if (atk.statuses?.length) {
      for (const s of atk.statuses) {
        rows.push({ label: `Attacker: ${s}`, value: "Active", cls: "status", icon: "fas fa-skull-crossbones" });
      }
    }
    if (def?.statuses?.length) {
      for (const s of def.statuses) {
        rows.push({ label: `Defender: ${s}`, value: "Active", cls: "status", icon: "fas fa-skull-crossbones" });
      }
    }
    if (rows.length) {
      sections.push({ id: "statuses", label: "Status Effects", icon: "fas fa-skull-crossbones", side: "resolution", rows });
    }
  }

  return sections;
}

function _signed(n) {
  if (typeof n !== "number") return n;
  return n >= 0 ? `+${n}` : `${n}`;
}

// ═══════════════════════════════════════════════════════════════
// DIALOG LAUNCHER
// ═══════════════════════════════════════════════════════════════

/**
 * Open the combat inspector dialog from serialized debug data.
 * @param {object} debug - The debug data object from the chat card's data-debug attribute
 */
export async function showCombatInspector(debug) {
  if (!debug) {
    ui.notifications.warn("No debug data available for this attack.");
    return;
  }

  const sections = buildSections(debug);

  // Build filter tabs from sections
  const filters = [
    { id: "all", label: "All" },
    ...sections.map(s => ({ id: s.id, label: s.label }))
  ];

  const title = `${debug.attacker?.name ?? "Attacker"} → ${debug.defender?.name ?? "Target"}`;

  // Render template
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/manashard/templates/dialog/combat-inspector.hbs",
    { sections, filters, debug }
  );

  await foundry.applications.api.DialogV2.wait({
    window: { title: `Combat Inspector — ${title}`, resizable: true },
    content,
    buttons: [
      { action: "close", label: "Close", default: true }
    ],
    render: (event, dialog) => {
      const el = dialog.element;

      // ── Filter tabs ──
      el.querySelectorAll(".ci-filter-tab").forEach(tab => {
        tab.addEventListener("click", (e) => {
          e.preventDefault();
          const filter = tab.dataset.filter;
          el.querySelectorAll(".ci-filter-tab").forEach(t => t.classList.remove("active"));
          tab.classList.add("active");

          el.querySelectorAll(".ci-section").forEach(sec => {
            if (filter === "all" || sec.dataset.section === filter) {
              sec.style.display = "";
            } else {
              sec.style.display = "none";
            }
          });
        });
      });

      // ── Search ──
      const searchInput = el.querySelector(".ci-search");
      if (searchInput) {
        searchInput.addEventListener("input", () => {
          const query = searchInput.value.toLowerCase().trim();
          el.querySelectorAll(".ci-row").forEach(row => {
            if (!query) {
              row.style.display = "";
              row.classList.remove("ci-search-highlight");
              return;
            }
            const text = row.textContent.toLowerCase();
            if (text.includes(query)) {
              row.style.display = "";
              row.classList.add("ci-search-highlight");
            } else {
              row.style.display = "none";
              row.classList.remove("ci-search-highlight");
            }
          });

          // Show sections that have visible rows
          el.querySelectorAll(".ci-section").forEach(sec => {
            const visibleRows = sec.querySelectorAll(".ci-row:not([style*='display: none'])");
            if (query && visibleRows.length === 0) {
              sec.style.display = "none";
            } else {
              const activeFilter = el.querySelector(".ci-filter-tab.active")?.dataset.filter ?? "all";
              if (activeFilter === "all" || sec.dataset.section === activeFilter) {
                sec.style.display = "";
              }
            }
          });
        });
      }
    },
    position: { width: 520, height: 600 }
  });
}

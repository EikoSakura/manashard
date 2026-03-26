/**
 * Floating token info panel.
 * Renders as an HTML overlay anchored above the selected token on the canvas.
 * Singleton — one panel visible at a time.
 */
export class TokenInfoPanel {
  /** @type {HTMLElement|null} */
  #element = null;

  /** @type {Token|null} */
  #token = null;

  /** @type {string} */
  #templatePath = "systems/manashard/templates/apps/token-info-panel.hbs";

  /** @type {number} Render generation counter to discard stale async renders. */
  #renderGen = 0;

  /**
   * Show the info panel for the given token.
   * @param {Token} token - The Foundry Token placeable object
   */
  show(token) {
    if (!token?.actor) return;
    this.#token = token;
    this.#render(token);
  }

  /** Hide and remove the panel. */
  hide() {
    this.#token = null;
    this.#renderGen++;
    if (this.#element) {
      this.#element.remove();
      this.#element = null;
    }
  }

  /** Refresh the panel if the given actor matches the currently displayed token. */
  refresh(actor) {
    if (!this.#token || !this.#element) return;
    if (this.#token.actor?.id === actor?.id) {
      this.#render(this.#token);
    }
  }

  /** Refresh if the given token document matches. */
  refreshToken(tokenDoc) {
    if (!this.#token || !this.#element) return;
    if (this.#token.document?.id === tokenDoc?.id) {
      this.#render(this.#token);
    }
  }

  /** Reposition the panel to track the token after canvas pan/zoom. */
  reposition() {
    if (!this.#token || !this.#element) return;
    const pos = this.#getScreenPosition(this.#token);
    if (!pos) return;
    this.#element.style.left = `${pos.x}px`;
    this.#element.style.top = `${pos.y}px`;
  }

  /** @returns {Token|null} The currently tracked token. */
  get token() {
    return this.#token;
  }

  // ─── Private ────────────────────────────────────────────

  async #render(token) {
    const data = this.#prepareData(token);
    if (!data) return;

    const gen = ++this.#renderGen;
    const html = await foundry.applications.handlebars.renderTemplate(this.#templatePath, data);

    // If hide() was called or a newer render started while we awaited, discard
    if (this.#renderGen !== gen) return;

    if (!this.#element) {
      this.#element = document.createElement("div");
      this.#element.id = "manashard-token-info";
      document.body.appendChild(this.#element);
    }

    this.#element.innerHTML = html;
    this.reposition();
  }

  #prepareData(token) {
    const actor = token.actor;
    if (!actor) return null;

    const isGM = game.user.isGM;
    const sys = actor.system;
    const isNPC = CONFIG.MANASHARD.NPC_TYPES.has(actor.type);

    // Setting checks — GM always sees everything
    const showName = isGM || game.settings.get("manashard", "tokenInfoShowName");
    const showHP = isGM || game.settings.get("manashard", "tokenInfoShowHP");
    const showMP = isGM || game.settings.get("manashard", "tokenInfoShowMP");
    const showType = isGM || game.settings.get("manashard", "tokenInfoShowType");

    // Also respect token-level bar visibility for non-GMs
    const tokenDoc = token.document;
    const bar1Display = tokenDoc?.getBarAttribute?.("bar1")?.attribute;
    const bar2Display = tokenDoc?.getBarAttribute?.("bar2")?.attribute;
    const hpBarVisible = isGM || (showHP && this.#isBarVisible(tokenDoc, 1));
    const mpBarVisible = isGM || (showMP && this.#isBarVisible(tokenDoc, 2));

    // HP data
    const hp = sys.stats?.hp ?? { value: 0, max: 0 };
    const hpPercent = hp.max > 0 ? Math.round((hp.value / hp.max) * 100) : 0;
    const barrier = hp.barrier ?? 0;
    const barrierPctRaw = (barrier > 0 && hp.max > 0) ? Math.round((barrier / hp.max) * 100) : 0;
    const barrierPercent = Math.min(hpPercent, barrierPctRaw);
    const barrierRight = 100 - hpPercent;

    // MP data
    const mp = sys.stats?.mp ?? { value: 0, max: 0 };
    const mpPercent = mp.max > 0 ? Math.round((mp.value / mp.max) * 100) : 0;

    // Type tag
    let typeTag = "";
    if (isNPC) {
      const creatureTypeKey = CONFIG.MANASHARD.creatureTypes?.[sys.creatureType];
      typeTag = creatureTypeKey ? game.i18n.localize(creatureTypeKey) : sys.creatureType;
      if (sys.isBoss) typeTag += " / Boss";
    } else {
      // Character — show adventurer rank
      const rankKey = CONFIG.MANASHARD.ranks?.[sys.rank]?.label;
      typeTag = "Rank " + (rankKey ? game.i18n.localize(rankKey) : sys.rank?.toUpperCase());
    }

    return {
      name: token.name,
      level: sys.level ?? 1,
      showName,
      showHP: hpBarVisible,
      showMP: mpBarVisible,
      showType,
      hp, hpPercent, barrier, barrierPercent, barrierRight,
      mp, mpPercent,
      typeTag,
      isNPC,
      isBoss: isNPC && sys.isBoss
    };
  }

  /** Check whether a bar is visible to the current user per token display settings. */
  #isBarVisible(tokenDoc, barIndex) {
    if (!tokenDoc) return true;
    const displayMode = tokenDoc[`bar${barIndex}`]?.attribute ? tokenDoc.displayBars : null;
    // CONST.TOKEN_DISPLAY_MODES: NONE=0, CONTROL=10, HOVER=20, OWNER_HOVER=30, OWNER=40, ALWAYS=50
    if (displayMode === undefined || displayMode === null) return true;
    const modes = CONST.TOKEN_DISPLAY_MODES;
    if (displayMode >= modes.ALWAYS) return true;
    if (displayMode >= modes.OWNER && tokenDoc.isOwner) return true;
    if (displayMode >= modes.OWNER_HOVER && tokenDoc.isOwner) return true;
    if (displayMode >= modes.HOVER) return true;
    if (displayMode >= modes.CONTROL && tokenDoc.isOwner) return true;
    if (displayMode <= modes.NONE) return false;
    return true;
  }

  /** Get the screen-space position above the token center. */
  #getScreenPosition(token) {
    if (!canvas?.stage) return null;

    // Token center in canvas coords
    const { x, y, width, height } = token.document;
    const gridSize = canvas.grid?.size ?? 100;
    const centerX = x + (width * gridSize) / 2;
    const topY = y;

    // Transform to screen coords
    const t = canvas.stage.worldTransform;
    const screenX = (centerX * t.a) + t.tx;
    const screenY = (topY * t.d) + t.ty;

    return { x: Math.round(screenX), y: Math.round(screenY) };
  }
}

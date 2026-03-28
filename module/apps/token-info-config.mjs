const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * Configuration dialog for Token Info Panel visibility settings.
 * Opened via the "Configure Token Info" button in system settings.
 */
export class TokenInfoConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  static PARTS = {
    form: { template: "systems/manashard/templates/apps/token-info-config.hbs" }
  };

  static DEFAULT_OPTIONS = {
    id: "token-info-config",
    classes: ["manashard", "token-info-config"],
    position: { width: 480, height: "auto" },
    window: {
      title: "MANASHARD.Settings.TokenInfoConfig",
      resizable: false
    },
    tag: "form",
    form: {
      closeOnSubmit: true,
      handler: TokenInfoConfig.#onSubmit
    }
  };

  /** @override */
  async _prepareContext() {
    const settings = [
      { key: "tokenInfoShowName", name: "MANASHARD.Settings.TokenInfoShowName", hint: "MANASHARD.Settings.TokenInfoShowNameHint" },
      { key: "tokenInfoShowHP", name: "MANASHARD.Settings.TokenInfoShowHP", hint: "MANASHARD.Settings.TokenInfoShowHPHint" },
      { key: "tokenInfoShowMP", name: "MANASHARD.Settings.TokenInfoShowMP", hint: "MANASHARD.Settings.TokenInfoShowMPHint" },
      { key: "tokenInfoShowType", name: "MANASHARD.Settings.TokenInfoShowType", hint: "MANASHARD.Settings.TokenInfoShowTypeHint" }
    ];

    return {
      settings: settings.map(s => ({
        ...s,
        name: game.i18n.localize(s.name),
        hint: game.i18n.localize(s.hint),
        value: game.settings.get("manashard", s.key)
      }))
    };
  }

  /**
   * Handle form submission — save all settings.
   * @param {Event} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   */
  static async #onSubmit(event, form, formData) {
    const data = formData.object;
    for (const key of ["tokenInfoShowName", "tokenInfoShowHP", "tokenInfoShowMP", "tokenInfoShowType"]) {
      await game.settings.set("manashard", key, data[key] ?? false);
    }
  }
}

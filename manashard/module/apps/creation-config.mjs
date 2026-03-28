const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/** Rank order for comparisons and dropdowns. */
const RANK_ORDER = ["f", "e", "d", "c", "b", "a", "s"];

/**
 * Parse a comma-separated UUID string into a Set.
 * @param {string} str
 * @returns {Set<string>}
 */
function parseExclusionList(str) {
  if (!str) return new Set();
  return new Set(str.split(",").map(s => s.trim()).filter(Boolean));
}

/* ========================================================================== */
/*  Main Creation Config                                                      */
/* ========================================================================== */

/**
 * Configuration dialog for Character Creation rules.
 * Opened via the "Character Creation Config" button in system settings.
 * GM-only — controls stat pools, growth rates, equipment, and links to
 * species/job availability sub-menus.
 */
export class CreationConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  static PARTS = {
    form: { template: "systems/manashard/templates/apps/creation-config.hbs" }
  };

  static DEFAULT_OPTIONS = {
    id: "creation-config",
    classes: ["manashard", "creation-config"],
    position: { width: 480, height: 520 },
    window: {
      title: "MANASHARD.Settings.CreationConfig",
      resizable: true
    },
    tag: "form",
    form: {
      closeOnSubmit: true,
      handler: CreationConfig.#onSubmit
    },
    actions: {
      openSpecies: CreationConfig.#onOpenSpecies,
      openJobs: CreationConfig.#onOpenJobs
    }
  };

  /** @override */
  async _prepareContext() {
    const currentMaxRank = game.settings.get("manashard", "creationMaxEquipRank");
    const ranks = RANK_ORDER.map(r => ({
      key: r,
      label: r.toUpperCase(),
      selected: r === currentMaxRank
    }));

    // Count excluded for badge display
    const excludedSpeciesCount = parseExclusionList(game.settings.get("manashard", "creationExcludedSpecies")).size;
    const excludedJobsCount = parseExclusionList(game.settings.get("manashard", "creationExcludedJobs")).size;

    return {
      statPool: game.settings.get("manashard", "creationStatPool"),
      growthPool: game.settings.get("manashard", "creationGrowthPool"),
      growthBaseline: game.settings.get("manashard", "creationGrowthBaseline"),
      startingEiress: game.settings.get("manashard", "creationStartingEiress"),
      ranks,
      excludedSpeciesCount,
      excludedJobsCount
    };
  }

  static async #onSubmit(event, form, formData) {
    const data = formData.object;
    await game.settings.set("manashard", "creationStatPool", Number(data.statPool) || 20);
    await game.settings.set("manashard", "creationGrowthPool", Number(data.growthPool) || 280);
    await game.settings.set("manashard", "creationGrowthBaseline", Number(data.growthBaseline) || 5);
    await game.settings.set("manashard", "creationStartingEiress", Number(data.startingEiress) || 500);
    await game.settings.set("manashard", "creationMaxEquipRank", data.maxEquipRank || "f");
  }

  static async #onOpenSpecies() {
    new CreationSpeciesConfig().render(true);
  }

  static async #onOpenJobs() {
    new CreationJobsConfig().render(true);
  }
}

/* ========================================================================== */
/*  Species Availability Sub-Menu                                             */
/* ========================================================================== */

/**
 * Sub-dialog for managing which species are available during character creation.
 * Displays all species from the compendium as a checklist — unchecked = excluded.
 */
export class CreationSpeciesConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  static PARTS = {
    form: { template: "systems/manashard/templates/apps/creation-species-config.hbs" }
  };

  static DEFAULT_OPTIONS = {
    id: "creation-species-config",
    classes: ["manashard", "creation-config", "creation-availability-config"],
    position: { width: 440, height: 480 },
    window: {
      title: "MANASHARD.Settings.CreationSpeciesTitle",
      resizable: true
    },
    tag: "form",
    form: {
      closeOnSubmit: true,
      handler: CreationSpeciesConfig.#onSubmit
    }
  };

  /** @override */
  async _prepareContext() {
    const pack = game.packs.get("manashard.species");
    const docs = pack ? await pack.getDocuments() : [];
    const excluded = parseExclusionList(game.settings.get("manashard", "creationExcludedSpecies"));

    const species = docs.map(s => ({
      uuid: s.uuid,
      name: s.name,
      img: s.img,
      allowed: !excluded.has(s.uuid)
    })).sort((a, b) => a.name.localeCompare(b.name));

    return { species, hasSpecies: species.length > 0 };
  }

  static async #onSubmit(event, form, formData) {
    const data = formData.object;
    const excludedSpecies = [];
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith("species-") && !value) {
        excludedSpecies.push(key.replace("species-", ""));
      }
    }
    await game.settings.set("manashard", "creationExcludedSpecies", excludedSpecies.join(","));
  }
}

/* ========================================================================== */
/*  Jobs Availability Sub-Menu                                                */
/* ========================================================================== */

/**
 * Sub-dialog for managing which jobs are available during character creation.
 * Displays all job manacite from the compendium as a checklist — unchecked = excluded.
 */
export class CreationJobsConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  static PARTS = {
    form: { template: "systems/manashard/templates/apps/creation-jobs-config.hbs" }
  };

  static DEFAULT_OPTIONS = {
    id: "creation-jobs-config",
    classes: ["manashard", "creation-config", "creation-availability-config"],
    position: { width: 440, height: 480 },
    window: {
      title: "MANASHARD.Settings.CreationJobsTitle",
      resizable: true
    },
    tag: "form",
    form: {
      closeOnSubmit: true,
      handler: CreationJobsConfig.#onSubmit
    }
  };

  /** @override */
  async _prepareContext() {
    const pack = game.packs.get("manashard.manacite");
    const allDocs = pack ? await pack.getDocuments() : [];
    const docs = allDocs.filter(d => d.type === "manacite" && d.system.manaciteType === "job");
    const excluded = parseExclusionList(game.settings.get("manashard", "creationExcludedJobs"));

    const jobs = docs.map(j => ({
      uuid: j.uuid,
      name: j.name,
      img: j.img,
      allowed: !excluded.has(j.uuid)
    })).sort((a, b) => a.name.localeCompare(b.name));

    return { jobs, hasJobs: jobs.length > 0 };
  }

  static async #onSubmit(event, form, formData) {
    const data = formData.object;
    const excludedJobs = [];
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith("job-") && !value) {
        excludedJobs.push(key.replace("job-", ""));
      }
    }
    await game.settings.set("manashard", "creationExcludedJobs", excludedJobs.join(","));
  }
}

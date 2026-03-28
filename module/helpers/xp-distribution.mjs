/**
 * XP Distribution System for Manashard.
 * Distributes XP to the equipped Job Manacite after combat,
 * handles job mastery and innate skill liberation.
 */

/**
 * Distribute XP to the equipped job on an actor.
 * @param {Actor} actor - The actor receiving XP
 * @param {number} baseXP - Base XP earned from combat
 * @returns {object} Summary of XP gains and job mastery
 */
export async function distributeXP(actor, baseXP) {
  if (!actor || baseXP <= 0) return { jobMastery: null };

  const results = { jobMastery: null };

  // Find equipped job
  let equippedJob = null;
  for (const item of actor.items) {
    if (item.type === "manacite" && item.system.manaciteType === "job" && item.system.equipped) {
      equippedJob = item;
      break;
    }
  }

  // Distribute XP to equipped job (for job mastery)
  if (equippedJob && !equippedJob.system.mastered) {
    const newJobXP = equippedJob.system.currentMasteryXP + baseXP;
    const jobUpdate = {
      _id: equippedJob.id,
      "system.currentMasteryXP": newJobXP
    };

    if (newJobXP >= equippedJob.system.masteryThreshold) {
      jobUpdate["system.mastered"] = true;
      results.jobMastery = { name: equippedJob.name, img: equippedJob.img, id: equippedJob.id };
    }

    await actor.updateEmbeddedDocuments("Item", [jobUpdate]);
  }

  // Handle job mastery (liberate innate skills, add to masteredJobs)
  if (results.jobMastery) {
    await handleJobMastery(actor, results.jobMastery.id);
  }

  return results;
}

/**
 * Handle job mastery — mark mastered, add to masteredJobs list,
 * create standalone copies of innate skills.
 * @param {Actor} actor
 * @param {string} jobId - The mastered job item ID
 */
export async function handleJobMastery(actor, jobId) {
  const job = actor.items.get(jobId);
  if (!job || job.type !== "manacite" || job.system.manaciteType !== "job") return;

  // Add to masteredJobs list (using item UUID)
  const masteredJobs = [...(actor.system.masteredJobs ?? [])];
  if (!masteredJobs.includes(job.uuid)) {
    masteredJobs.push(job.uuid);
    await actor.update({ "system.masteredJobs": masteredJobs });
  }

  // Liberate innate skills — create standalone copies
  const skillCreations = [];
  for (const uuidField of ["innateActiveUuid", "innatePassiveUuid"]) {
    const uuid = job.system[uuidField];
    if (!uuid) continue;

    try {
      const skillItem = await fromUuid(uuid);
      if (!skillItem || skillItem.type !== "manacite" || skillItem.system.manaciteType !== "skill") continue;

      // Check if actor already owns a copy from this source
      const alreadyOwned = actor.items.find(i =>
        i.type === "manacite" && i.system.manaciteType === "skill" && i.name === skillItem.name
      );
      if (alreadyOwned) continue;

      skillCreations.push({
        name: skillItem.name,
        type: "manacite",
        img: skillItem.img,
        system: foundry.utils.deepClone(skillItem.system)
      });
    } catch { /* broken link */ }
  }

  if (skillCreations.length) {
    await actor.createEmbeddedDocuments("Item", skillCreations);
  }

  // Chat notification
  const liberatedNames = skillCreations.map(s => s.name).join(", ");
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="manashard"><strong>${actor.name}</strong> has mastered <strong>${job.name}</strong>!${liberatedNames ? ` Liberated skills: ${liberatedNames}.` : ""} Permanent growth bonuses applied.</div>`
  });
}

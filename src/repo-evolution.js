const db = require('./db');
const config = require('./config');
const { discoverTrendingRepos } = require('./ossinsight');
const { searchTrendingRepos } = require('./github-search');

async function evolveRepoList() {
  console.log('[evolution] Starting repo evolution...');

  // --- Phase 1: Count active repos ---
  const counts = await db.getRepoCounts();
  const manualCount = counts.manual;
  const discoveredBefore = counts.discovered;
  const targetDiscovered = Math.max(0, config.EVO_MAX_TOTAL_REPOS - manualCount);

  console.log(`[evolution] manual=${manualCount} discovered=${discoveredBefore} target_discovered=${targetDiscovered}`);

  let removedCount = 0;
  let addedCount = 0;

  // --- Phase 2: Manual repos fill all slots ---
  if (targetDiscovered === 0) {
    if (discoveredBefore > 0) {
      console.log('[evolution] Manual repos fill all slots. Marking all discovered as inactive.');
      // Mark discovered repos inactive rather than deleting — they stay as annotations
      const discovered = await db.getRepos('discovered');
      const ids = discovered.map(r => r.id);
      await db.markReposInactive(ids);
      removedCount = ids.length;
    }
    console.log(`[evolution] Complete: -${removedCount} deactivated, +0 added`);
    return { removed: removedCount, added: 0 };
  }

  // --- Phase 3: Find and remove inactive repos ---
  const inactiveRepos = await db.getInactiveRepos(config.EVO_INACTIVE_WEEKS);

  const manualInactive = inactiveRepos.filter(r => r.source === 'manual');
  const discoveredInactive = inactiveRepos.filter(r => r.source === 'discovered');

  // Manual inactive repos: mark as inactive (注释保留)
  if (manualInactive.length > 0) {
    const ids = manualInactive.map(r => r.id);
    await db.markReposInactive(ids);
    for (const r of manualInactive) {
      console.log(`[evolution] Deactivating manual: ${r.owner}/${r.repo} (last active: ${r.last_active_at || 'never'})`);
    }
  }

  // Discovered inactive repos: delete entirely
  if (discoveredInactive.length > 0) {
    for (const r of discoveredInactive) {
      console.log(`[evolution] Removing inactive: ${r.owner}/${r.repo} (last active: ${r.last_active_at || 'never'})`);
      await db.deleteRepo(r.id);
    }
  }

  // Also clean up any previously marked inactive discovered repos
  const deletedCount = await db.deleteInactiveDiscovered();
  if (deletedCount > 0) {
    console.log(`[evolution] Deleted ${deletedCount} previously inactive discovered repos`);
  }

  removedCount = manualInactive.length + discoveredInactive.length;

  // --- Phase 4: Calculate available slots ---
  const countsAfter = await db.getRepoCounts();
  const slotsAvailable = targetDiscovered - countsAfter.discovered;

  if (slotsAvailable <= 0) {
    console.log(`[evolution] No slots available (discovered=${countsAfter.discovered}, target=${targetDiscovered})`);
    return { removed: removedCount, added: 0 };
  }

  // --- Phase 5: Discover new repos ---
  let candidates = await discoverTrendingRepos();

  // Fallback: if OSS Insight returns insufficient, try GitHub Search
  if (!candidates || candidates.length < slotsAvailable) {
    console.log('[evolution] OSS Insight insufficient, trying GitHub Search...');
    const ghResults = await searchTrendingRepos();
    const seen = new Set((candidates || []).map(r => `${r.owner}/${r.repo}`));
    for (const r of ghResults) {
      const key = `${r.owner}/${r.repo}`;
      if (!seen.has(key)) { seen.add(key); candidates.push(r); }
    }
  }

  // --- Phase 6: Deduplicate against existing repos ---
  const allRepos = await db.getAllRepos();
  const existingNames = new Set(allRepos.map(r => `${r.owner}/${r.repo}`));

  const toAdd = candidates
    .filter(r => !existingNames.has(`${r.owner}/${r.repo}`))
    .slice(0, slotsAvailable);

  // --- Phase 7: Add new repos ---
  for (const r of toAdd) {
    console.log(`[evolution] Adding: ${r.owner}/${r.repo} (${r.stars} stars)`);
    await db.addRepo(r.owner, r.repo, 'main', 'discovered', r.description, r.language, r.stars);
  }
  addedCount = toAdd.length;

  console.log(`[evolution] Complete: +${addedCount} added, -${removedCount} removed`);
  return { removed: removedCount, added: addedCount };
}

module.exports = { evolveRepoList };

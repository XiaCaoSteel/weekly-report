function aggregateSkills(skills, weekStartMs, weekEndMs) {
  const newSkills = [];
  const updatedSkills = [];

  // Tag frequency
  const tagFreq = new Map();
  // Collect changelog keywords (simple extraction)
  const allSummaries = [];

  for (const s of skills) {
    const created = s.createdAt || 0;
    const updated = s.updatedAt || created;
    const isNew = created >= weekStartMs && created < weekEndMs;

    const entry = {
      slug: s.slug,
      name: s.displayName || s.slug,
      summary: s.summary || '',
      downloads: s.stats?.downloads || 0,
      stars: s.stats?.stars || 0,
      installs: s.stats?.installsCurrent || 0,
      versions: s.stats?.versions || 1,
      owner: s.ownerHandle || '',
      createdAt: created ? new Date(created).toISOString() : null,
      updatedAt: updated ? new Date(updated).toISOString() : null,
    };

    if (isNew) {
      newSkills.push(entry);
    } else {
      updatedSkills.push(entry);
    }

    allSummaries.push(s.summary || '');

    // Extract rough tags from summary words
    const words = (s.summary || '').toLowerCase().split(/\W+/).filter(w => w.length > 3);
    for (const w of words) {
      tagFreq.set(w, (tagFreq.get(w) || 0) + 1);
    }
  }

  // Trending: by downloads + stars
  const trending = [...skills]
    .sort((a, b) => {
      const scoreA = (a.stats?.stars || 0) * 5 + (a.stats?.downloads || 0);
      const scoreB = (b.stats?.stars || 0) * 5 + (b.stats?.downloads || 0);
      return scoreB - scoreA;
    })
    .slice(0, 20)
    .map(s => ({
      slug: s.slug,
      name: s.displayName || s.slug,
      summary: s.summary || '',
      stars: s.stats?.stars || 0,
      downloads: s.stats?.downloads || 0,
    }));

  // Top tags (filter common words)
  const stopWords = new Set(['that', 'this', 'with', 'from', 'your', 'them', 'they', 'have', 'what', 'when', 'where', 'which', 'about', 'into', 'more', 'some', 'its', 'can', 'use', 'the']);
  const topTags = [...tagFreq.entries()]
    .filter(([w]) => !stopWords.has(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([tag, count]) => ({ tag, count }));

  const overview = {
    totalCollected: skills.length,
    newCount: newSkills.length,
    updatedCount: updatedSkills.length,
    topTags: topTags.slice(0, 10).map(t => t.tag),
    weekStart: new Date(weekStartMs).toISOString().slice(0, 10),
    weekEnd: new Date(weekEndMs).toISOString().slice(0, 10),
  };

  return {
    week: `${overview.weekStart} ~ ${overview.weekEnd}`,
    overview,
    newSkills,
    updatedSkills,
    trending,
    topTags,
  };
}

module.exports = { aggregateSkills };

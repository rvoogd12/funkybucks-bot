export function assignCompetitionRanks(entries, scoreFn) {
  if (entries.length === 0) return [];

  let rank = 0;
  let prevScore = null;

  return entries.map((entry, index) => {
    const score = scoreFn(entry);
    if (index === 0 || score !== prevScore) {
      rank = index + 1;
      prevScore = score;
    }
    return { ...entry, rank, sortScore: score };
  });
}

export function rankBadgeColor(rank) {
  if (rank === 1) return '#FFD700';
  if (rank === 2) return '#C0C0C0';
  if (rank === 3) return '#CD7F32';
  return '#4169E1';
}

export function rankBadgeColorGarden(rank) {
  if (rank === 1) return '#c9a227';
  if (rank === 2) return '#8fad7f';
  if (rank === 3) return '#a67c52';
  return '#4a7c59';
}

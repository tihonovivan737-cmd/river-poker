function five(cards: string[]) {
  const ranks = cards
    .map((c) => "23456789TJQKA".indexOf(c[0]) + 2)
    .sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.keys()].sort(
    (a, b) => counts.get(b)! - counts.get(a)! || b - a,
  );
  let straight = 0;
  if (groups.length === 5) {
    if (ranks[0] - ranks[4] === 4) straight = ranks[0];
    else if (ranks.join(",") === "14,5,4,3,2") straight = 5;
  }
  const first = counts.get(groups[0]),
    second = counts.get(groups[1]);
  const category =
    straight && flush
      ? 8
      : first === 4
        ? 7
        : first === 3 && second === 2
          ? 6
          : flush
            ? 5
            : straight
              ? 4
              : first === 3
                ? 3
                : first === 2 && second === 2
                  ? 2
                  : first === 2
                    ? 1
                    : 0;
  const kickers = straight ? [straight] : groups;
  let score = category;
  for (let i = 0; i < 5; i++) score = score * 15 + (kickers[i] ?? 0);
  return score;
}
export function rank(cards: string[]) {
  let best = 0;
  for (let i = 0; i < 7; i++)
    for (let j = i + 1; j < 7; j++)
      best = Math.max(best, five(cards.filter((_, k) => k !== i && k !== j)));
  return best;
}

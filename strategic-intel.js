// Simple Strategic Intelligence module for Catan Portal
export class StrategicIntel {
  constructor(resourceTracker) {
    this.rt = resourceTracker;
    // Define common builds and their costs
    this.BUILDS = [
      { key: "road", cost: { lumber: 1, brick: 1 }, vp: 0 },
      {
        key: "settlement",
        cost: { lumber: 1, brick: 1, wool: 1, grain: 1 },
        vp: 1,
      },
      { key: "city", cost: { grain: 2, ore: 3 }, vp: 1 },
      { key: "devcard", cost: { wool: 1, grain: 1, ore: 1 }, vp: 0 },
    ];
    // Tunable heuristic: expected average resources gained per full round/turn
    // (used to estimate turns-to-afford). This is a coarse heuristic since
    // we don't have board/tile info here; it can be tuned by the user.
    this.avgResourcesPerTurn = 0.65;
  }

  // Compute missing resources for a given player toward a particular build
  missingForBuild(playerResources, cost) {
    const missing = {};
    let totalMissing = 0;
    for (const [res, amt] of Object.entries(cost)) {
      const have = playerResources[res] || 0;
      const miss = Math.max(0, amt - have);
      missing[res] = miss;
      totalMissing += miss;
    }
    return { missing, totalMissing };
  }

  // Get recommendation for a specific player
  getRecommendationForPlayer(player) {
    const playerResources = this.rt.getPlayerResources()[player] || {};
    // If player data missing, return null
    if (!playerResources) return null;

    // Evaluate all builds and pick the one with smallest totalMissing
    let best = null;
    for (const build of this.BUILDS) {
      const { missing, totalMissing } = this.missingForBuild(playerResources, build.cost);
      const canAfford = totalMissing === 0;
      const score = 1 / (1 + totalMissing); // higher score for closer builds
      if (!best || score > best.score) {
        best = { build: build.key, cost: build.cost, missing, totalMissing, canAfford, score };
      }
    }

    // Create simple textual recommendation
    let text = "";
    if (best.canAfford) {
      text = `You can build a ${best.build} now.`;
    } else {
      // Recommend the resource with largest missing quantity
      const sorted = Object.entries(best.missing).sort((a, b) => b[1] - a[1]);
      const primary = sorted.find((s) => s[1] > 0);
      if (primary) text = `Collect ${primary[0]} (need ${primary[1]} more) to get a ${best.build}.`;
      else text = `Work towards a ${best.build}.`;
    }

    // Basic win-probability-like heuristic (not a true probability)
    const progress = Math.round(best.score * 100);

    return {
      player,
      recommendation: text,
      targetBuild: best.build,
      missing: best.missing,
      progress,
    };
  }

  // Get recommendations for all players (or a specific list)
  getRecommendations(players) {
    const result = {};
    for (const p of players) {
      result[p] = this.getRecommendationForPlayer(p);
    }
    return result;
  }
}

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
    if (!playerResources) return null;

    // Evaluate all builds and compute a richer set of metrics per build
    const scored = this.BUILDS.map((build) => {
      const { missing, totalMissing } = this.missingForBuild(playerResources, build.cost);
      const canAfford = totalMissing === 0;
      // progress: fraction of resources owned for this build (0-1)
      const totalCost = Object.values(build.cost).reduce((a,b)=>a+b,0);
      const owned = totalCost - totalMissing;
      const progressFraction = totalCost === 0 ? 1 : owned / totalCost;
      // Estimate expected turns to afford based on a simple average gain
      const expectedTurnsToAfford = this.avgResourcesPerTurn > 0 ? (totalMissing / this.avgResourcesPerTurn) : Infinity;
      // Scoring: prefer higher progress, then VP, then fewer expected turns.
      // Tunable weights: progress (0.6), VP (0.25), speed (0.15). Lower expected
      // turns increases score.
      const score = (progressFraction * 0.6) + ((build.vp || 0) * 0.25) + (1 / (1 + expectedTurnsToAfford) * 0.15) - (totalMissing * 0.01);
      return {
        key: build.key,
        cost: build.cost,
        missing,
        totalMissing,
        canAfford,
        progressFraction,
        score,
        vp: build.vp || 0,
        expectedTurnsToAfford: Number.isFinite(expectedTurnsToAfford) ? Math.round(expectedTurnsToAfford*10)/10 : null,
      };
    }).sort((a,b)=>b.score - a.score);

    const best = scored[0];
    if (!best) return null;

    // Build textual recommendation with more info
    let text = "";
    if (best.canAfford) {
      text = `Can build ${best.key} now.`;
    } else {
      // show up to two most-missing resources
      const sorted = Object.entries(best.missing).filter(([k,v])=>v>0).sort((a,b)=>b[1]-a[1]);
      if (sorted.length === 0) text = `Work towards a ${best.key}.`;
      else {
        const primary = sorted[0];
        const secondary = sorted[1];
        text = `Need ${primary[1]} ${primary[0]}` + (secondary ? ` and ${secondary[1]} ${secondary[0]}` : ``) + ` for ${best.key}.`;
      }
    }

    return {
      player,
      recommendation: text,
      targetBuild: best.key,
      missing: best.missing,
      progress: Math.round(best.progressFraction * 100),
      affordable: best.canAfford,
      vp: best.vp,
      expectedTurns: best.expectedTurnsToAfford,
      allBuilds: scored,
    };
  }

  // Get a short recommendation for a single player (alias)
  getTopRecommendation(player) {
    return this.getRecommendationForPlayer(player);
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

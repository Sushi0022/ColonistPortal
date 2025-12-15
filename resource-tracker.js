// Resource tracking functionality for Catan Card Tracker
export class ResourceTracker {
  constructor() {
    // Resource types and their display symbols
    this.RESOURCE_TYPES = [
      { key: "lumber", symbol: "🪵" },
      { key: "brick", symbol: "🧱" },
      { key: "wool", symbol: "🐑" },
      { key: "grain", symbol: "🌾" },
      { key: "ore", symbol: "⛏️" },
    ];

    // In-memory player resource map
    this.playerResources = {};

    // Track players who already received starting resources to avoid double-counting
    this.startingResourcesApplied = new Set();

    // Event log for UI display
    this.eventLogs = [];

    // Current player username (for resolving "You" references)
    this.currentPlayerUsername = null;

    // Their constants for parsing
    this.initialPlacementDoneMessage = "Giving out starting resources";
    this.placeInitialSettlementSnippet = "placed a";
    this.startingResourcesSnippet = "received starting resources:";
    this.receivedResourcesSnippet = "got:";
    this.builtSnippet = "built a";
    this.boughtSnippet = " bought ";
    this.tradeBankGaveSnippet = "gave bank:";
    this.tradeBankTookSnippet = "and took";
    this.stoleAllOfSnippet = "stole ";
    this.discardedSnippet = "discarded";
    this.tradedWithSnippet = " with: ";
    this.tradedSnippet = " traded: ";
    this.tradeGiveForSnippet = "for:";
    this.stoleFromYouSnippet = "You stole:";
    this.youStoleSnippet = "from you";
    this.stoleFromSnippet = " stole:  from ";
    this.robberSnippet = " moved robber to";
    this.yearOfPleantlySnippet = "took from bank";

    // Resource mapping
    this.wood = "lumber";
    this.stone = "ore";
    this.wheat = "grain";
    this.brick = "brick";
    this.sheep = "wool";
    this.robber = "robber";
    this.resourceTypes = [
      this.wood,
      this.brick,
      this.sheep,
      this.wheat,
      this.stone,
    ];

    // Players
    this.players = [];
    this.player_colors = {};

    // Message offset
    this.MSG_OFFSET = 0;

    // Theft tracking (their logic)
    this.zeros = [0, 0, 0, 0, 0];
    this.zero_deltas = [this.zeros, this.zeros, this.zeros, this.zeros];
    this.potential_state_deltas = [];

    // Pending username
    this.pendingUsername = null;
  }

  // Utility: get resource key from alt text
  getResourceKeyFromAlt(alt) {
    const found = this.RESOURCE_TYPES.find(
      (r) => r.key.toLowerCase() === alt.toLowerCase()
    );
    return found ? found.key : null;
  }

  // Deep copy 2D array (their utility)
  deep_copy_2d_array(array) {
    return array.map((sub_array) => Array.from(sub_array));
  }

  // Add array of arrays (their utility)
  add_array_of_arrays(array0, array1) {
    return array0.map((row, outer_index) =>
      row.map(
        (element, inner_index) => array1[outer_index][inner_index] + element
      )
    );
  }

  // Check if any negative values in array
  areAnyNegative(arrayOfArrays) {
    for (let row of arrayOfArrays) {
      for (let element of row) {
        if (element < 0) {
          return true;
        }
      }
    }
    return false;
  }

  // Check if all values are zero
  areAllZero(arrayOfArrays) {
    for (let row of arrayOfArrays) {
      for (let element of row) {
        if (element !== 0) {
          return false;
        }
      }
    }
    return true;
  }

  // Should keep potential state delta
  shouldKeep(potential_resources, delta) {
    if (this.areAnyNegative(potential_resources) || this.areAllZero(delta)) {
      return false;
    }
    return true;
  }

  // Convert player resources to array
  playerResourcesToArray(playerResourcesDict) {
    var result = [];
    for (const resource of this.resourceTypes) {
      result.push(playerResourcesDict[resource]);
    }
    return result;
  }

  // Convert resources dict to array
  resourcesToArray(resourcesDict) {
    var result = [];
    for (const player of this.players) {
      result.push(this.playerResourcesToArray(resourcesDict[player]));
    }
    return result;
  }

  // Convert resources array to dict
  resourcesToDict(resourcesArray) {
    var result = {};
    for (const [playerIndex, playerResources] of resourcesArray.entries()) {
      var playerResourceDict = {};
      for (const [resourceIndex, resourceAmount] of playerResources.entries()) {
        playerResourceDict[this.resourceTypes[resourceIndex]] = resourceAmount;
      }
      result[this.players[playerIndex]] = playerResourceDict;
    }
    return result;
  }

  // Steal all of a resource from all players
  stealAllOfResource(receivingPlayer, resource) {
    for (var plyr of this.players) {
      if (plyr !== receivingPlayer) {
        this.playerResources[receivingPlayer][resource] +=
          this.playerResources[plyr][resource];
        this.playerResources[plyr][resource] = 0;
      }
    }
  }

  // Transfer resource between players
  transferResource(srcPlayer, destPlayer, resource, quantity = 1) {
    // Defensive: log the intended transfer for debugging
    try {
      this.addEventLog(`[DEBUG] transferResource called: ${srcPlayer} -> ${destPlayer}, resource='${resource}', qty=${quantity}`);
      if (srcPlayer === destPlayer) {
        this.addEventLog(`[DEBUG] transferResource: src and dest are the same ('${srcPlayer}'), skipping transfer`);
        return;
      }
    } catch (e) {}
    // Defensive initialization
    if (!this.playerResources[srcPlayer]) {
      this.playerResources[srcPlayer] = {};
      for (const r of this.resourceTypes) this.playerResources[srcPlayer][r] = 0;
    }
    if (!this.playerResources[destPlayer]) {
      this.playerResources[destPlayer] = {};
      for (const r of this.resourceTypes) this.playerResources[destPlayer][r] = 0;
    }
    if (this.playerResources[srcPlayer][resource] === undefined || isNaN(this.playerResources[srcPlayer][resource])) this.playerResources[srcPlayer][resource] = 0;
    if (this.playerResources[destPlayer][resource] === undefined || isNaN(this.playerResources[destPlayer][resource])) this.playerResources[destPlayer][resource] = 0;

    // Log balances before applying
    try {
      const beforeSrc = this.playerResources[srcPlayer][resource];
      const beforeDest = this.playerResources[destPlayer][resource];
      this.addEventLog(`[DEBUG] transferResource before: ${srcPlayer}.${resource}=${beforeSrc}, ${destPlayer}.${resource}=${beforeDest}`);
    } catch (e) {}

    this.playerResources[srcPlayer][resource] -= quantity;
    this.playerResources[destPlayer][resource] += quantity;

    // Log balances after applying
    try {
      const afterSrc = this.playerResources[srcPlayer][resource];
      const afterDest = this.playerResources[destPlayer][resource];
      this.addEventLog(`[DEBUG] transferResource after: ${srcPlayer}.${resource}=${afterSrc}, ${destPlayer}.${resource}=${afterDest}`);
    } catch (e) {}
  }

  // Check if it's a monopoly card
  isMonopoly(text) {
    const arr = text.replace(":", "").split(" ");
    if (arr[1] === "stole" && !isNaN(parseInt(arr[2]))) {
      return true;
    }
    return false;
  }

  // Check if it's a known steal (robust to colon or space)
  isKnownSteal(textContent) {
    // Match 'You stole', 'You stole:', 'stole from you', etc.
    const lower = textContent.toLowerCase();
    return (
      lower.includes("you stole") ||
      lower.includes("stole from you") ||
      lower.includes("you stole:") ||
      lower.includes("you stole ")
    );
  }

  // Check if it's a known steal with resource info (their logic)
  isKnownStealWithResource(textContent) {
    // Only consider it a known steal if we can see the resource being stolen
    const lower = textContent.toLowerCase();
    const hasResourceInfo =
      textContent.includes(":") ||
      Array.from(textContent.matchAll(/stole\s+([^:]+)/g)).length > 0;
    return (
      (lower.includes("you stole") || lower.includes("stole from you")) &&
      hasResourceInfo
    );
  }

  // Review thefts (their logic)
  reviewThefts() {
    const resourcesArray = this.resourcesToArray(this.playerResources);
    const before_len = this.potential_state_deltas.length;

    this.potential_state_deltas_temp = this.potential_state_deltas.filter(
      (delta) =>
        this.shouldKeep(this.add_array_of_arrays(resourcesArray, delta), delta)
    );

    if (this.potential_state_deltas_temp.length === 0) {
      if (this.areAnyNegative(resourcesArray)) {
        console.error(
          "Couldn't resolve thefts correctly. There almost certainly is a bug parsing messages"
        );
        this.addEventLog(
          "[DEBUG] Couldn't resolve thefts - potential parsing bug"
        );
      }
    }
    this.potential_state_deltas = this.potential_state_deltas_temp;

    if (this.potential_state_deltas.length === 1) {
      const actual_resources_delta = this.potential_state_deltas[0];
      const actual_resources = this.add_array_of_arrays(
        actual_resources_delta,
        resourcesArray
      );
      if (this.areAnyNegative(actual_resources)) {
        throw Error("Couldn't resolve thefts correctly");
      }
      this.playerResources = this.resourcesToDict(actual_resources);
      this.potential_state_deltas = [];
      this.addEventLog("[DEBUG] Resolved ambiguous theft - applied delta");
    }

    // Debug logging
    if (this.potential_state_deltas.length > 0) {
      this.addEventLog(
        `[DEBUG] ${this.potential_state_deltas.length} potential theft deltas remaining`
      );
    }
  }

  // Parse "got" message (improved for text and images)
  parseGotMessage(pElement) {
    var textContent = pElement.textContent;
    // Accept both with and without colon for compatibility
    if (!textContent.includes("got")) {
      return;
    }
    // If message also contains 'gave' it's a trade message; skip here
    // to avoid double-counting — trades are handled in parseTradedMessage
    try {
      if (/\bgave\b/i.test(textContent) && /\bgot\b/i.test(textContent)) {
        this.addEventLog(`[DEBUG] parseGotMessage: message contains both 'gave' and 'got' — skipping (handled by trade parser)`);
        return;
      }
    } catch (e) {}
    // Heuristic: if this entry is a split-trade 'got' (e.g. "Pump8174 got" with only images)
    // and the previous sibling contains 'gave', then skip here to avoid double-applying
    // the resource (parseTradedMessage will handle the transfer using both nodes).
    try {
      const onlyPlayerGotPattern = /^\s*[A-Za-z0-9_\-]+\s+got\s*$/i;
      const imgs = Array.from(pElement.getElementsByTagName("img"));
      const prev = pElement.previousElementSibling;
      if (onlyPlayerGotPattern.test(textContent) && imgs.length > 0 && prev && /\bgave\b/i.test(prev.textContent || "")) {
        this.addEventLog(`[DEBUG] parseGotMessage: Detected split-trade 'got' for '${textContent.split(/\s+/)[0]}', skipping local 'got' handling`);
        return;
      }
    } catch (e) {}
    var player = textContent.split(" ")[0];
    if (!this.playerResources[player]) {
      console.log("Failed to parse player...", player, this.playerResources);
      return;
    }
    // Try to increment resources from images
    var images = Array.from(pElement.getElementsByTagName("img"));
    let foundAny = false;
    for (var img of images) {
      if (img.src.includes("card_wool")) {
        this.playerResources[player][this.sheep] += 1;
        foundAny = true;
      } else if (img.src.includes("card_lumber")) {
        this.playerResources[player][this.wood] += 1;
        foundAny = true;
      } else if (img.src.includes("card_brick")) {
        this.playerResources[player][this.brick] += 1;
        foundAny = true;
      } else if (img.src.includes("card_ore")) {
        this.playerResources[player][this.stone] += 1;
        foundAny = true;
      } else if (img.src.includes("card_grain")) {
        this.playerResources[player][this.wheat] += 1;
        foundAny = true;
      }
    }
    // If no images, parse resource from text
    if (!foundAny) {
      const words = textContent.split(" ").slice(2); // after "player got"
      for (const word of words) {
        if (word === "brick") this.playerResources[player][this.brick] += 1;
        else if (word === "ore") this.playerResources[player][this.stone] += 1;
        else if (word === "grain" || word === "wheat")
          this.playerResources[player][this.wheat] += 1;
        else if (word === "wool" || word === "sheep")
          this.playerResources[player][this.sheep] += 1;
        else if (word === "lumber" || word === "wood")
          this.playerResources[player][this.wood] += 1;
      }
    }
    this.addEventLog(
      `${player} got ${
        textContent.split(" ").slice(2).join(" ") || "resources"
      }`
    );
  }

  // Parse "built" message
  parseBuiltMessage(pElement) {
    var textContent = pElement.textContent;
    if (!textContent.includes(this.builtSnippet)) {
      return;
    }
    var images = Array.from(pElement.getElementsByTagName("img"));
    var player = textContent.split(" ")[0];
    if (!this.playerResources[player]) {
      console.log("Failed to parse player...", player, this.playerResources);
      return;
    }

    // Ensure player's resource keys exist and are numbers
    for (const r of this.resourceTypes) {
      if (this.playerResources[player][r] === undefined || isNaN(this.playerResources[player][r])) {
        this.playerResources[player][r] = 0;
      }
    }

    // Determine building type (road/settlement/city) and resource icons present
    let buildType = null;
    const resourceIcons = [];
    for (const img of images) {
      const src = (img.src || "").toLowerCase();
      const alt = (img.alt || "").toLowerCase();
      if (src.includes("road") || alt.includes("road")) buildType = "road";
      if (src.includes("settlement") || alt.includes("settlement")) buildType = "settlement";
      if (src.includes("city") || alt.includes("city")) buildType = "city";
      // resource card icons may include 'card_' in filename or alt text
      if (src.includes("card_") || alt.includes("wool") || alt.includes("lumber") || alt.includes("brick") || alt.includes("ore") || alt.includes("grain") || alt.includes("wheat") || alt.includes("sheep")) {
        resourceIcons.push(img);
      }
    }

    // If resource icons are present in the message, use them to deduct exact resources
    if (resourceIcons.length > 0) {
      for (const img of resourceIcons) {
        const src = (img.src || "").toLowerCase();
        const alt = (img.alt || "").toLowerCase();
        if (src.includes("card_wool") || alt.includes("wool") || alt.includes("sheep")) this.playerResources[player][this.sheep] -= 1;
        else if (src.includes("card_lumber") || alt.includes("lumber") || alt.includes("wood")) this.playerResources[player][this.wood] -= 1;
        else if (src.includes("card_brick") || alt.includes("brick")) this.playerResources[player][this.brick] -= 1;
        else if (src.includes("card_ore") || alt.includes("ore") || alt.includes("stone")) this.playerResources[player][this.stone] -= 1;
        else if (src.includes("card_grain") || alt.includes("grain") || alt.includes("wheat")) this.playerResources[player][this.wheat] -= 1;
      }
      this.addEventLog(`${player} built a ${buildType || "building"} (parsed from resource icons)`);
    } else {
      // Fallback: use fixed costs for common builds
      if (buildType === "road") {
        this.playerResources[player][this.wood] -= 1;
        this.playerResources[player][this.brick] -= 1;
        this.addEventLog(`${player} built a road`);
      } else if (buildType === "settlement") {
        this.playerResources[player][this.wood] -= 1;
        this.playerResources[player][this.brick] -= 1;
        this.playerResources[player][this.sheep] -= 1;
        this.playerResources[player][this.wheat] -= 1;
        this.addEventLog(`${player} built a settlement`);
      } else if (buildType === "city") {
        this.playerResources[player][this.stone] -= 3;
        this.playerResources[player][this.wheat] -= 2;
        this.addEventLog(`${player} built a city`);
      } else {
        // If build type couldn't be determined, log for debugging
        this.addEventLog(`${player} built something (unknown type)`);
      }
    }

    // Defensive: ensure values are numeric and avoid NaN
    for (const r of this.resourceTypes) {
      if (isNaN(this.playerResources[player][r])) this.playerResources[player][r] = 0;
    }
  }

  // Parse "bought" message
  parseBoughtMessage(pElement) {
    var textContent = pElement.textContent;
    if (!textContent.includes(this.boughtSnippet)) {
      return;
    }
    var images = Array.from(pElement.getElementsByTagName("img"));
    var player = textContent.split(" ")[0];
    if (!this.playerResources[player]) {
      console.log("Failed to parse player...", player, this.playerResources);
      return;
    }
    for (var img of images) {
      if (img.src.includes("card_devcardback")) {
        this.playerResources[player][this.sheep] -= 1;
        this.playerResources[player][this.wheat] -= 1;
        this.playerResources[player][this.stone] -= 1;
        this.addEventLog(`${player} bought a development card`);
      }
    }
  }

  // Parse Year of Plenty message (robust image-based parsing)
  parseYearOfPleantyMessage(pElement) {
    var textContent = pElement.textContent;
    if (!textContent.includes(this.yearOfPleantlySnippet)) {
      return;
    }
    var player = textContent.split(" ")[0];
    if (!this.playerResources[player]) {
      console.log("Failed to parse player...", player, this.playerResources);
      return;
    }
    // Robust image-based parsing
    var images = Array.from(pElement.getElementsByTagName("img"));
    let foundAny = false;
    for (var img of images) {
      if (img.alt === "wool" || img.alt === "sheep") {
        this.playerResources[player][this.sheep] += 1;
        foundAny = true;
      } else if (img.alt === "lumber" || img.alt === "wood") {
        this.playerResources[player][this.wood] += 1;
        foundAny = true;
      } else if (img.alt === "brick") {
        this.playerResources[player][this.brick] += 1;
        foundAny = true;
      } else if (img.alt === "ore") {
        this.playerResources[player][this.stone] += 1;
        foundAny = true;
      } else if (img.alt === "grain" || img.alt === "wheat") {
        this.playerResources[player][this.wheat] += 1;
        foundAny = true;
      }
    }
    // Fallback: parse from text
    if (!foundAny) {
      const words = textContent.split(" ").slice(3); // after 'player took from bank'
      for (const word of words) {
        if (word === "brick") this.playerResources[player][this.brick] += 1;
        else if (word === "ore") this.playerResources[player][this.stone] += 1;
        else if (word === "grain" || word === "wheat")
          this.playerResources[player][this.wheat] += 1;
        else if (word === "wool" || word === "sheep")
          this.playerResources[player][this.sheep] += 1;
        else if (word === "lumber" || word === "wood")
          this.playerResources[player][this.wood] += 1;
      }
    }
    this.addEventLog(`${player} used Year of Plenty`);
  }

  // Parse trade bank message (robust image-based parsing)
  parseTradeBankMessage(pElement) {
    var textContent = pElement.textContent;
    if (
      !textContent.includes("gave bank") ||
      !textContent.includes("and took")
    ) {
      return;
    }
    var player = textContent.split(" ")[0];
    // Defensive: ensure player exists
    if (!this.playerResources[player]) {
      this.playerResources[player] = {};
      for (const r of this.resourceTypes) this.playerResources[player][r] = 0;
      if (!this.players.includes(player)) this.players.push(player);
      this.addEventLog(`[DEBUG] Created player entry for '${player}' in parseTradeBankMessage`);
    }

    // Use innerHTML to get the HTML structure
    var innerHTML = pElement.innerHTML || "";
    // Debug: log the raw innerHTML for bank trades
    try { this.addEventLog(`[DEBUG] parseTradeBankMessage raw innerHTML: ${innerHTML.replace(/\s+/g,' ').trim()}`); } catch(e){}
    var gaveBankHTML = "";
    var andTookHTML = "";
    try {
      gaveBankHTML = innerHTML.split(/gave bank/i)[1].split(/and took/i)[0];
      andTookHTML = innerHTML.split(/and took/i)[1];
    } catch (e) {
      // fallback to textContent splits
      try {
        gaveBankHTML = textContent.split(/gave bank/i)[1].split(/and took/i)[0];
        andTookHTML = textContent.split(/and took/i)[1];
      } catch (e) {
        gaveBankHTML = ""; andTookHTML = "";
      }
    }

    // Helper to extract resource keys from HTML fragment (img alts or plain text)
    function extractResourceKeys(html) {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;
      const results = [];
      // First, collect from images (preferred)
      const imgs = Array.from(tempDiv.querySelectorAll("img"));
      for (const img of imgs) {
        const alt = (img.alt || "").toLowerCase();
        if (alt.includes("brick")) results.push("brick");
        else if (alt.includes("ore") || alt.includes("stone")) results.push("ore");
        else if (alt.includes("grain") || alt.includes("wheat")) results.push("grain");
        else if (alt.includes("wool") || alt.includes("sheep")) results.push("wool");
        else if (alt.includes("lumber") || alt.includes("wood")) results.push("lumber");
      }

      // If no images, or there is plain text (e.g., copied chat), parse words
      if (results.length === 0) {
        const text = tempDiv.textContent || "";
        // split on non-letter characters and keep words
        const words = text.split(/[^A-Za-z]+/).map((w) => w.toLowerCase()).filter(Boolean);
        for (const w of words) {
          if (w === "brick") results.push("brick");
          else if (w === "ore" || w === "stone") results.push("ore");
          else if (w === "grain" || w === "wheat") results.push("grain");
          else if (w === "wool" || w === "sheep") results.push("wool");
          else if (w === "lumber" || w === "wood") results.push("lumber");
        }
      }
      return results;
    }

    const gaveKeys = extractResourceKeys(gaveBankHTML);
    const tookKeys = extractResourceKeys(andTookHTML);

    // Debug: show parsed keys
    try { this.addEventLog(`[DEBUG] parseTradeBankMessage parsed gaveKeys=[${gaveKeys.join(',')}], tookKeys=[${tookKeys.join(',')}]`); } catch(e){}

    // Debug: balances before
    try { this.addEventLog(`[DEBUG] parseTradeBankMessage before: ${player}=${JSON.stringify(this.playerResources[player])}`); } catch(e){}

    // Update resources (handle multiple same resources)
    for (const key of gaveKeys) {
      if (key === "brick") this.playerResources[player][this.brick] -= 1;
      else if (key === "ore") this.playerResources[player][this.stone] -= 1;
      else if (key === "grain") this.playerResources[player][this.wheat] -= 1;
      else if (key === "wool") this.playerResources[player][this.sheep] -= 1;
      else if (key === "lumber") this.playerResources[player][this.wood] -= 1;
      else this.addEventLog(`[DEBUG] parseTradeBankMessage: unknown gave key='${key}'`);
    }
    for (const key of tookKeys) {
      if (key === "brick") this.playerResources[player][this.brick] += 1;
      else if (key === "ore") this.playerResources[player][this.stone] += 1;
      else if (key === "grain") this.playerResources[player][this.wheat] += 1;
      else if (key === "wool") this.playerResources[player][this.sheep] += 1;
      else if (key === "lumber") this.playerResources[player][this.wood] += 1;
      else this.addEventLog(`[DEBUG] parseTradeBankMessage: unknown took key='${key}'`);
    }

    // Clamp and log after
    this.clampResources();
    try { this.addEventLog(`[DEBUG] parseTradeBankMessage after: ${player}=${JSON.stringify(this.playerResources[player])}`); } catch(e){}

    // Log the event using parsed keys
    const gaveStr = gaveKeys.length ? gaveKeys.join(" ") : "(none)";
    const tookStr = tookKeys.length ? tookKeys.join(" ") : "(none)";
    this.addEventLog(`${player} traded with bank: gave ${gaveStr}, took ${tookStr}`);
  }

  // Parse monopoly card (robust image-based parsing)
  parseStoleAllOfMessage(pElement) {
    var textContent = pElement.textContent;
    if (!this.isMonopoly(textContent)) {
      return;
    }
    var player = textContent.split(" ")[0];
    if (!this.playerResources[player]) {
      console.log("Failed to parse player...", player, this.playerResources);
      return;
    }
    // Robust image-based parsing
    var images = Array.from(pElement.getElementsByTagName("img"));
    let foundAny = false;
    for (var img of images) {
      if (img.alt === "wool" || img.alt === "sheep") {
        this.stealAllOfResource(player, this.sheep);
        foundAny = true;
      } else if (img.alt === "lumber" || img.alt === "wood") {
        this.stealAllOfResource(player, this.wood);
        foundAny = true;
      } else if (img.alt === "brick") {
        this.stealAllOfResource(player, this.brick);
        foundAny = true;
      } else if (img.alt === "ore") {
        this.stealAllOfResource(player, this.stone);
        foundAny = true;
      } else if (img.alt === "grain" || img.alt === "wheat") {
        this.stealAllOfResource(player, this.wheat);
        foundAny = true;
      }
    }
    // Fallback: parse from text
    if (!foundAny) {
      const words = textContent.split(" ").slice(3); // after 'player stole N:'
      for (const word of words) {
        if (word === "brick") this.stealAllOfResource(player, this.brick);
        else if (word === "ore") this.stealAllOfResource(player, this.stone);
        else if (word === "grain" || word === "wheat")
          this.stealAllOfResource(player, this.wheat);
        else if (word === "wool" || word === "sheep")
          this.stealAllOfResource(player, this.sheep);
        else if (word === "lumber" || word === "wood")
          this.stealAllOfResource(player, this.wood);
      }
    }
    this.addEventLog(`${player} used Monopoly card`);
  }

  // Parse discarded message
  parseDiscardedMessage(pElement) {
    var textContent = pElement.textContent;
    if (!textContent.includes(this.discardedSnippet)) {
      return;
    }
    var player = textContent
      .replace(this.receivedResourcesSnippet, "")
      .split(" ")[0];
    if (!this.playerResources[player]) {
      console.log("Failed to parse player...", player, this.playerResources);
      return;
    }
    var images = Array.from(pElement.getElementsByTagName("img"));
    for (var img of images) {
      if (img.src.includes("card_wool")) {
        this.playerResources[player][this.sheep] -= 1;
      } else if (img.src.includes("card_lumber")) {
        this.playerResources[player][this.wood] -= 1;
      } else if (img.src.includes("card_brick")) {
        this.playerResources[player][this.brick] -= 1;
      } else if (img.src.includes("card_ore")) {
        this.playerResources[player][this.stone] -= 1;
      } else if (img.src.includes("card_grain")) {
        this.playerResources[player][this.wheat] -= 1;
      }
    }
    this.addEventLog(`${player} discarded resources`);
  }

  // Parse traded message
  parseTradedMessage(pElement, prevElement) {
    var textContent = pElement.textContent || "";
    var innerHTML = pElement.innerHTML || "";

    // Very verbose debug: log entry at start
    try {
      this.addEventLog(`[DEBUG] parseTradedMessage START: text='${(textContent||"").replace(/\s+/g,' ').trim()}', html='${(innerHTML||"").replace(/\s+/g,' ').trim()}'`);
    } catch (e) {}

    // Helper to map a resource keyword to internal key
    const mapResourceWord = (word) => {
      if (!word) return null;
      const w = word.toLowerCase();
      if (w.includes("brick")) return this.brick;
      if (w.includes("ore") || w.includes("stone")) return this.stone;
      if (w.includes("grain") || w.includes("wheat")) return this.wheat;
      if (w.includes("wool") || w.includes("sheep")) return this.sheep;
      if (w.includes("lumber") || w.includes("wood")) return this.wood;
      return null;
    };

    // Helper: extract resource keys from an HTML fragment (imgs) or a text fragment
    const extractResourcesFromHtml = (htmlFragment) => {
      const temp = document.createElement("div");
      temp.innerHTML = htmlFragment;
      const imgs = Array.from(temp.querySelectorAll("img"));
      const results = [];
      for (const img of imgs) {
        const src = (img.src || "").toLowerCase();
        const alt = (img.alt || "").toLowerCase();
        if (src.includes("card_wool") || alt.includes("wool") || alt.includes("sheep")) results.push(this.sheep);
        else if (src.includes("card_lumber") || alt.includes("lumber") || alt.includes("wood")) results.push(this.wood);
        else if (src.includes("card_brick") || alt.includes("brick")) results.push(this.brick);
        else if (src.includes("card_ore") || alt.includes("ore") || alt.includes("stone")) results.push(this.stone);
        else if (src.includes("card_grain") || alt.includes("grain") || alt.includes("wheat")) results.push(this.wheat);
      }
      // If no imgs found, try to parse words
      if (results.length === 0) {
        const words = htmlFragment.replace(/<[^>]*>/g, " ").split(/\s+/).map(s=>s.replace(/[^a-zA-Z]/g,'')).filter(Boolean);
        for (const w of words) {
          const m = mapResourceWord(w);
          if (m) results.push(m);
        }
      }
      return results;
    };

    // Identify trading and agreeing players using multiple patterns
    const tradingPlayer = (textContent.split(/\s+/)[0] || "").trim();
    let agreeingPlayer = null;
    const fromMatch = textContent.match(/from\s+([A-Za-z0-9_\-]+)/i);
    if (fromMatch) agreeingPlayer = fromMatch[1];
    else {
      const withMatch = textContent.match(/with[:]?\s*([A-Za-z0-9_\-]+)/i);
      if (withMatch) agreeingPlayer = withMatch[1];
    }

    // Pattern 1: "X gave ... and got ... from Y"
    const gaveGotMatch = textContent.match(/gave\s+(.+?)\s+and\s+got\s+(.+?)(?:\s+from\s+([A-Za-z0-9_\-]+))?$/i);
    // If text contains both 'gave' and 'got' but the regex didn't match (often
    // because the resources are images and text groups are empty), perform a
    // DOM-based split parse on this single element to extract gave/got images.
    if (!gaveGotMatch && /\bgave\b/i.test(textContent) && /\band\s+got\b/i.test(textContent)) {
      try {
        const temp = document.createElement('div');
        temp.innerHTML = innerHTML;
        const nameSpans = Array.from(temp.querySelectorAll('span[style*="font-weight:600"]'));
        const tradingName = nameSpans.length ? nameSpans[0].textContent.trim() : (textContent.split(/\s+/)[0] || '');
        const agreeingName = nameSpans.length > 1 ? nameSpans[nameSpans.length - 1].textContent.trim() : null;
        const container = nameSpans.length ? nameSpans[0].parentElement : temp;
        const nodes = Array.from(container.childNodes || []);
        let startIndex = 0;
        if (nameSpans.length) startIndex = nodes.indexOf(nameSpans[0]) + 1;
        let inGotSection = false;
        const domGave = [];
        const domGot = [];
        for (let i = startIndex; i < nodes.length; i++) {
          const node = nodes[i];
          if (!node) continue;
          if (node.nodeType === Node.TEXT_NODE) {
            const txt = (node.textContent || '').toLowerCase();
            if (/and\s+got/.test(txt)) { inGotSection = true; continue; }
            if (/\bfrom\b/.test(txt)) break;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node;
            const imgs = el.tagName && el.tagName.toLowerCase() === 'img' ? [el] : Array.from(el.querySelectorAll('img') || []);
            for (const img of imgs) {
              const src = (img.getAttribute('src') || '').toLowerCase();
              const alt = (img.getAttribute('alt') || '').toLowerCase();
              let mapped = null;
              if (src.includes('card_wool') || alt.includes('wool') || alt.includes('sheep')) mapped = this.sheep;
              else if (src.includes('card_lumber') || alt.includes('lumber') || alt.includes('wood')) mapped = this.wood;
              else if (src.includes('card_brick') || alt.includes('brick')) mapped = this.brick;
              else if (src.includes('card_ore') || alt.includes('ore') || alt.includes('stone')) mapped = this.stone;
              else if (src.includes('card_grain') || alt.includes('grain') || alt.includes('wheat')) mapped = this.wheat;
              if (mapped) {
                if (inGotSection) domGot.push(mapped); else domGave.push(mapped);
              }
            }
          }
        }
        if (domGave.length + domGot.length > 0) {
          // Ensure players exist
          const ensure = (n) => { if (!n) return; if (!this.playerResources[n]) { this.playerResources[n] = {}; for (const r of this.resourceTypes) this.playerResources[n][r]=0; if (!this.players.includes(n)) this.players.push(n); } };
          ensure(tradingName); ensure(agreeingName);
          this.addEventLog(`[DEBUG] DOM single-entry trade parse: trading='${tradingName}', agreeing='${agreeingName}', gave=[${domGave.join(',')}], got=[${domGot.join(',')}]`);
          // Apply transfers: domGave from trading->agreeing, domGot from agreeing->trading
          for (const res of domGave) this.transferResource(tradingName, agreeingName, res);
          for (const res of domGot) this.transferResource(agreeingName, tradingName, res);
          this.clampResources();
          this.addEventLog(`${tradingName} traded with ${agreeingName}`);
          return;
        }
      } catch (e) {}
    }
    if (gaveGotMatch) {
      // Prefer the regex-captured fragments (plain text) which are more reliable
      // than attempting to split innerHTML (which can be structured unexpectedly).
      const gaveFragText = (gaveGotMatch[1] || "").trim();
      const gotFragText = (gaveGotMatch[2] || "").trim();
      // Also capture the HTML fragments as a fallback; combine both so
      // extractResourcesFromHtml can read images or plain text reliably.
      const gaveFragHtml = innerHTML.toLowerCase().includes("gave") ? innerHTML.split(/gave/i)[1].split(/and\s+got/i)[0] : "";
      const gotFragHtml = innerHTML.toLowerCase().includes("and got") ? innerHTML.split(/and\s+got/i)[1] : "";

      // Debug: log raw structures to help diagnose parsing failures
      try {
        this.addEventLog(`[DEBUG] Trade raw innerHTML: ${innerHTML.replace(/\s+/g,' ').trim()}`);
        this.addEventLog(`[DEBUG] gaveGotMatch groups: gave='${gaveFragText}', got='${gotFragText}', from='${gaveGotMatch[3] || ""}'`);
        this.addEventLog(`[DEBUG] gaveFragHtml: ${gaveFragHtml.replace(/\s+/g,' ').trim()}`);
        this.addEventLog(`[DEBUG] gotFragHtml: ${gotFragHtml.replace(/\s+/g,' ').trim()}`);
      } catch (e) {}

      const gaveResources = extractResourcesFromHtml(gaveFragText + " " + gaveFragHtml);
      const gotResources = extractResourcesFromHtml(gotFragText + " " + gotFragHtml);
      // If extraction failed (often because the message uses only images and
      // textContent between 'gave' and 'and got' is empty), do a DOM-based
      // fallback: walk the message part nodes and classify imgs seen before
      // the "and got" marker as 'gave' and those after as 'got'. This is
      // robust to obfuscated/changed classnames and captures alt/src info.
      if ((gaveResources.length === 0 && gotResources.length === 0) || (gaveResources.length + gotResources.length === 0)) {
        try {
          const temp = document.createElement("div");
          temp.innerHTML = innerHTML;
          // Find the name span and use its parent as the message container
          const nameSpan = temp.querySelector('span[style*="font-weight:600"]') || temp.querySelector('span');
          const container = nameSpan ? nameSpan.parentElement : temp;
          const fallbackGave = [];
          const fallbackGot = [];
          let inGotSection = false;
          // Iterate over child nodes after the nameSpan
          const nodes = Array.from(container.childNodes || []);
          // Find index of nameSpan to start after it
          let startIndex = 0;
          if (nameSpan) startIndex = nodes.indexOf(nameSpan) + 1;
          for (let i = startIndex; i < nodes.length; i++) {
            const node = nodes[i];
            if (!node) continue;
            // If this is a text node, check for the marker 'and got' or 'from'
            if (node.nodeType === Node.TEXT_NODE) {
              const txt = (node.textContent || "").toLowerCase();
              if (/and\s+got/.test(txt)) {
                inGotSection = true;
                continue;
              }
              if (/\bfrom\b/.test(txt)) {
                // stop collecting 'got' after seeing 'from'
                break;
              }
              // otherwise continue scanning
            }
            // If it's an element node and an IMG, classify by alt/src
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node;
              if (el.tagName && el.tagName.toLowerCase() === "img") {
                const src = (el.getAttribute("src") || "").toLowerCase();
                const alt = (el.getAttribute("alt") || "").toLowerCase();
                let mapped = null;
                if (src.includes("card_wool") || alt.includes("wool") || alt.includes("sheep")) mapped = this.sheep;
                else if (src.includes("card_lumber") || alt.includes("lumber") || alt.includes("wood")) mapped = this.wood;
                else if (src.includes("card_brick") || alt.includes("brick")) mapped = this.brick;
                else if (src.includes("card_ore") || alt.includes("ore") || alt.includes("stone")) mapped = this.stone;
                else if (src.includes("card_grain") || alt.includes("grain") || alt.includes("wheat")) mapped = this.wheat;
                if (mapped) {
                  if (inGotSection) fallbackGot.push(mapped);
                  else fallbackGave.push(mapped);
                }
              } else {
                // If element contains images (e.g., wrapped in spans), inspect them
                const imgs = Array.from(el.querySelectorAll && el.querySelectorAll("img") || []);
                for (const img of imgs) {
                  const src = (img.getAttribute("src") || "").toLowerCase();
                  const alt = (img.getAttribute("alt") || "").toLowerCase();
                  let mapped = null;
                  if (src.includes("card_wool") || alt.includes("wool") || alt.includes("sheep")) mapped = this.sheep;
                  else if (src.includes("card_lumber") || alt.includes("lumber") || alt.includes("wood")) mapped = this.wood;
                  else if (src.includes("card_brick") || alt.includes("brick")) mapped = this.brick;
                  else if (src.includes("card_ore") || alt.includes("ore") || alt.includes("stone")) mapped = this.stone;
                  else if (src.includes("card_grain") || alt.includes("grain") || alt.includes("wheat")) mapped = this.wheat;
                  if (mapped) {
                    if (inGotSection) fallbackGot.push(mapped);
                    else fallbackGave.push(mapped);
                  }
                }
              }
            }
          }
          // If we found fallback resources, overwrite the parsed arrays
          if (fallbackGave.length + fallbackGot.length > 0) {
            this.addEventLog(`[DEBUG] Fallback DOM trade parse: gave=[${fallbackGave.join(",")}], got=[${fallbackGot.join(",")}]`);
            // replace contents
            gaveResources.length = 0; gaveResources.push(...fallbackGave);
            gotResources.length = 0; gotResources.push(...fallbackGot);
          }
        } catch (e) {
          // ignore fallback errors
        }
      }
      // Defensive: ensure both players exist (create if missing)
      const ensurePlayer = (name) => {
        if (!name) return;
        if (!this.playerResources[name]) {
          this.playerResources[name] = {};
          for (const r of this.resourceTypes) this.playerResources[name][r] = 0;
          if (!this.players.includes(name)) this.players.push(name);
          this.addEventLog(`[DEBUG] Created player entry for '${name}' during trade parsing`);
        }
      };
      ensurePlayer(tradingPlayer);
      if (!agreeingPlayer && gaveGotMatch[3]) agreeingPlayer = gaveGotMatch[3];
      ensurePlayer(agreeingPlayer);
      // Additional debug: show resource arrays and validate keys
      try {
        const validate = (arr) => arr.map(x => `${x}(${typeof x})`);
        this.addEventLog(`[DEBUG] About to apply trade: trading='${tradingPlayer}', agreeing='${agreeingPlayer}', gaveResources=[${validate(gaveResources)}], gotResources=[${validate(gotResources)}]`);
        // show whether these keys exist on players before applying
        const existsInfo = (player, key) => (this.playerResources[player] && this.playerResources[player][key] !== undefined) ? 'exists' : 'MISSING';
        for (const k of gaveResources) this.addEventLog(`[DEBUG] will move '${k}' from ${tradingPlayer} (${existsInfo(tradingPlayer,k)}) to ${agreeingPlayer} (${existsInfo(agreeingPlayer,k)})`);
        for (const k of gotResources) this.addEventLog(`[DEBUG] will move '${k}' from ${agreeingPlayer} (${existsInfo(agreeingPlayer,k)}) to ${tradingPlayer} (${existsInfo(tradingPlayer,k)})`);
      } catch(e) {}
      // Debug: log what was parsed
      this.addEventLog(
        `[DEBUG] Trade parsed: ${tradingPlayer} -> ${agreeingPlayer}, gave=[${gaveResources.join(",")}], got=[${gotResources.join(",")}], rawText='${textContent.replace(/\s+/g,' ').trim()}'`
      );
      // Debug: show balances before
      try {
        const beforeA = Object.assign({}, this.playerResources[tradingPlayer]);
        const beforeB = Object.assign({}, this.playerResources[agreeingPlayer]);
        this.addEventLog(`[DEBUG] Balances before trade: ${tradingPlayer}=${JSON.stringify(beforeA)}, ${agreeingPlayer}=${JSON.stringify(beforeB)}`);
      } catch (e) {}

      // Apply transfers: gaveResources were transferred from tradingPlayer -> agreeingPlayer
      for (const res of gaveResources) {
        this.transferResource(tradingPlayer, agreeingPlayer, res);
      }
      // gotResources were transferred from agreeingPlayer -> tradingPlayer
      for (const res of gotResources) {
        this.transferResource(agreeingPlayer, tradingPlayer, res);
      }

      // Clamp and show balances after
      this.clampResources();
      try {
        const afterA = Object.assign({}, this.playerResources[tradingPlayer]);
        const afterB = Object.assign({}, this.playerResources[agreeingPlayer]);
        this.addEventLog(`[DEBUG] Balances after trade: ${tradingPlayer}=${JSON.stringify(afterA)}, ${agreeingPlayer}=${JSON.stringify(afterB)}`);
      } catch (e) {}

      this.addEventLog(`${tradingPlayer} traded with ${agreeingPlayer}`);
      return;
    }

    // Pattern 1b: Sometimes the chat splits messages. If the current entry only
    // contains 'got' (often image-only) and the previous entry contained
    // 'gave', parse the two together: prevEntry.gave -> currentEntry.got
    if (/\bgot\b/i.test(textContent) && prevElement) {
      try {
        const prevText = prevElement.textContent || "";
        if (/\bgave\b/i.test(prevText)) {
          // Resolve player names
          const prevNameSpan = prevElement.querySelector('span[style*="font-weight:600"]');
          const prevPlayerName = prevNameSpan ? prevNameSpan.textContent.trim() : (prevText.split(/\s+/)[0] || "");
          const currNameSpan = entry.querySelector('span[style*="font-weight:600"]');
          const currPlayerName = currNameSpan ? currNameSpan.textContent.trim() : tradingPlayer;

          const ensurePlayer = (name) => {
            if (!name) return;
            if (!this.playerResources[name]) {
              this.playerResources[name] = {};
              for (const r of this.resourceTypes) this.playerResources[name][r] = 0;
              if (!this.players.includes(name)) this.players.push(name);
              this.addEventLog(`[DEBUG] Created player entry for '${name}' during split-trade parsing`);
            }
          };
          ensurePlayer(prevPlayerName);
          ensurePlayer(currPlayerName);

          // Extract resources from prevElement (what was given) and from current entry (what was received)
          const prevHtml = prevElement.innerHTML || "";
          const currHtml = innerHTML || "";
          const gaveFromPrev = extractResourcesFromHtml(prevHtml);
          const gotFromCurr = extractResourcesFromHtml(currHtml);

          this.addEventLog(`[DEBUG] Split-trade parsed: prev='${prevPlayerName}' gave=[${gaveFromPrev.join(",")}], curr='${currPlayerName}' got=[${gotFromCurr.join(",")}], prevText='${prevText.replace(/\s+/g,' ').trim()}', currText='${textContent.replace(/\s+/g,' ').trim()}'`);

          // Apply transfers: resources identified in prevHtml were given by prevPlayer -> currPlayer
          for (const res of gaveFromPrev) {
            this.transferResource(prevPlayerName, currPlayerName, res);
          }
          // Additionally, resources identified in current entry (gotFromCurr) should also be transferred
          for (const res of gotFromCurr) {
            // If same as prevPlayerName (shouldn't be), skip; otherwise transfer from prev to curr
            this.transferResource(prevPlayerName, currPlayerName, res);
          }

          this.clampResources();
          this.addEventLog(`${prevPlayerName} traded with ${currPlayerName}`);
          return;
        }
      } catch (e) {
        // ignore and fall through to other parsing
      }
    }

    // Pattern 2: older style may use 'traded:' and 'with:' markers — keep existing parsing as fallback
    if (textContent.includes(this.tradedWithSnippet) || textContent.includes(this.tradedSnippet)) {
      var tradingPlayerOld = textContent.split(this.tradedSnippet)[0];
      var agreeingPlayerOld = textContent.split(this.tradedWithSnippet)[1];
      if (!this.playerResources[tradingPlayerOld] || !this.playerResources[agreeingPlayerOld]) return;
      var wantstogive = innerHTML
        .slice(0, innerHTML.indexOf(this.tradeGiveForSnippet))
        .split("<img");
      var givefor = innerHTML
        .slice(innerHTML.indexOf(this.tradeGiveForSnippet))
        .split("<img");
      for (var imgStr of wantstogive) {
        if (imgStr.includes("card_wool")) {
          this.transferResource(tradingPlayerOld, agreeingPlayerOld, this.sheep);
        } else if (imgStr.includes("card_lumber")) {
          this.transferResource(tradingPlayerOld, agreeingPlayerOld, this.wood);
        } else if (imgStr.includes("card_brick")) {
          this.transferResource(tradingPlayerOld, agreeingPlayerOld, this.brick);
        } else if (imgStr.includes("card_ore")) {
          this.transferResource(tradingPlayerOld, agreeingPlayerOld, this.stone);
        } else if (imgStr.includes("card_grain")) {
          this.transferResource(tradingPlayerOld, agreeingPlayerOld, this.wheat);
        }
      }
      for (var imgStr of givefor) {
        if (imgStr.includes("card_wool")) {
          this.transferResource(agreeingPlayerOld, tradingPlayerOld, this.sheep);
        } else if (imgStr.includes("card_lumber")) {
          this.transferResource(agreeingPlayerOld, tradingPlayerOld, this.wood);
        } else if (imgStr.includes("card_brick")) {
          this.transferResource(agreeingPlayerOld, tradingPlayerOld, this.brick);
        } else if (imgStr.includes("card_ore")) {
          this.transferResource(agreeingPlayerOld, tradingPlayerOld, this.stone);
        } else if (imgStr.includes("card_grain")) {
          this.transferResource(agreeingPlayerOld, tradingPlayerOld, this.wheat);
        }
      }
      this.addEventLog(`${tradingPlayerOld} traded with ${agreeingPlayerOld}`);
    }
  }

  // Helper to resolve 'You' or 'you' to the actual username
  resolvePlayerName(name) {
    if (typeof name !== "string") return name;
    if (name.trim().toLowerCase() === "you") {
      // First check if we have a stored current player username
      if (
        this.currentPlayerUsername &&
        this.playerResources[this.currentPlayerUsername]
      ) {
        this.addEventLog(
          `[DEBUG] Resolved 'You' to stored username '${this.currentPlayerUsername}'`
        );
        return this.currentPlayerUsername;
      }

      // Try to find the current player from the DOM first
      const currentPlayer = this.getCurrentPlayerFromDOM();
      if (currentPlayer) {
        this.currentPlayerUsername = currentPlayer; // Store it for future use
        this.addEventLog(
          `[DEBUG] Resolved 'You' to '${currentPlayer}' from DOM`
        );
        return currentPlayer;
      }

      // Fallback: try to find the player with the most resources (likely the user)
      const candidates = Object.keys(this.playerResources);
      if (candidates.length === 1) {
        this.currentPlayerUsername = candidates[0]; // Store it for future use
        this.addEventLog(
          `[DEBUG] Resolved 'You' to '${candidates[0]}' (only player)`
        );
        return candidates[0];
      }

      // Try to find the player whose name matches the browser's username (if available)
      // For now, just return the first player and log it
      const fallbackPlayer = candidates[0] || name;
      this.currentPlayerUsername = fallbackPlayer; // Store it for future use
      this.addEventLog(
        `[DEBUG] Resolved 'You' to '${fallbackPlayer}' (fallback)`
      );
      return fallbackPlayer;
    }
    return name;
  }

  // Set current player username manually (for debugging or UI input)
  setCurrentPlayerUsername(username) {
    this.pendingUsername = username; // Always remember the user's input
    if (this.playerResources[username]) {
      this.currentPlayerUsername = username;
      this.pendingUsername = null;
      this.addEventLog(`[DEBUG] Set current player to '${username}'`);
      return true;
    } else {
      this.addEventLog(
        `[DEBUG] Will set current player to '${username}' as soon as they appear in the game log`
      );
      return false;
    }
  }

  // Call this after any player is added to playerResources
  checkPendingUsernameActivation() {
    if (this.pendingUsername && this.playerResources[this.pendingUsername]) {
      this.currentPlayerUsername = this.pendingUsername;
      this.addEventLog(
        `[DEBUG] Activated pending username '${this.pendingUsername}' as current player`
      );
      this.pendingUsername = null;
    }
  }

  // Get current player from DOM (try to find the active player)
  getCurrentPlayerFromDOM() {
    try {
      // Look for the current player indicator in the game UI
      // This might be in different places depending on the game state

      // Method 1: Look for "Your turn" or similar indicators
      const turnIndicators = document.querySelectorAll("*");
      for (const element of turnIndicators) {
        if (element.textContent && element.textContent.includes("Your turn")) {
          // Try to find the player name nearby
          const parent =
            element.closest('[class*="player"]') || element.parentElement;
          if (parent) {
            const playerName = parent.textContent.match(/([A-Za-z0-9_]+)/);
            if (playerName && this.playerResources[playerName[1]]) {
              return playerName[1];
            }
          }
        }
      }

      // Method 2: Look for the player name in the header or profile area
      const profileElements = document.querySelectorAll(
        '[id*="profile"], [class*="profile"], [id*="username"], [class*="username"]'
      );
      for (const element of profileElements) {
        const text = element.textContent.trim();
        if (text && this.playerResources[text]) {
          return text;
        }
      }

      // Method 3: Look for the player name in the game header
      const headerElements = document.querySelectorAll("header *, .header *");
      for (const element of headerElements) {
        const text = element.textContent.trim();
        if (text && this.playerResources[text]) {
          return text;
        }
      }

      // Method 4: Analyze game logs to find "You" patterns
      return this.getCurrentPlayerFromLogs();
    } catch (error) {
      console.error(
        "[Catan Card Tracker] Error getting current player from DOM:",
        error
      );
      return null;
    }
  }

  // Analyze game logs to determine which player is "You"
  getCurrentPlayerFromLogs() {
    try {
      // Look for game log entries that contain "You" or "Your".
      // Use heuristics to find log-like elements (player-name spans or resource images).
      const potential = Array.from(document.querySelectorAll('div, li, span'));
      const logElements = potential.filter((el) => {
        try {
          if (el.querySelector && el.querySelector('span[style*="font-weight:600"]')) return true;
          const imgs = el.getElementsByTagName ? Array.from(el.getElementsByTagName('img')) : [];
          if (imgs.some((img) => /card_(wool|lumber|brick|ore|grain)/.test(img.src || img.alt || ''))) return true;
        } catch (e) {
          return false;
        }
        return false;
      });

      for (const logElement of logElements) {
        const text = logElement.textContent;

        // Look for patterns that indicate the current player
        if (
          text.includes("You rolled") ||
          text.includes("Your turn") ||
          text.includes("You built") ||
          text.includes("You bought") ||
          text.includes("You traded") ||
          text.includes("You stole")
        ) {
          // Find the player name in this log entry
          const nameSpan = logElement.querySelector(
            'span[style*="font-weight:600"]'
          );
          if (nameSpan) {
            const playerName = nameSpan.textContent.trim();
            if (playerName && this.playerResources[playerName]) {
              this.addEventLog(
                `[DEBUG] Found current player '${playerName}' from log analysis`
              );
              return playerName;
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error(
        "[Catan Card Tracker] Error analyzing logs for current player:",
        error
      );
      return null;
    }
  }

  // Parse stole from you message (improved logic with UI debug logging)
  parseStoleFromYouMessage(pElement, prevElement) {
    var textContent = pElement.textContent;
    if (!this.isKnownStealWithResource(textContent)) {
      return;
    }
    var splitText = textContent.split(" ");
    var stealingPlayer = splitText[0];
    var targetPlayer = splitText.slice(-1)[0];

    // Try to find explicit name spans inside the element (more reliable)
    try {
      const nameSpans = Array.from(pElement.querySelectorAll('span[style*="font-weight:600"]'));
      if (nameSpans.length >= 2) {
        stealingPlayer = nameSpans[0].textContent.trim();
        targetPlayer = nameSpans[nameSpans.length - 1].textContent.trim();
      } else if (nameSpans.length === 1) {
        // If only one span and text says 'You', resolve 'You' to current player
        const spanName = nameSpans[0].textContent.trim();
        if (splitText[0].toLowerCase() === 'you') {
          stealingPlayer = this.getCurrentPlayerFromDOM() || spanName;
        } else if (splitText[splitText.length - 1].toLowerCase() === 'you') {
          targetPlayer = this.getCurrentPlayerFromDOM() || spanName;
        } else {
          // otherwise use the span as stealingPlayer
          stealingPlayer = spanName;
        }
      } else if (prevElement) {
        // As a last resort, look at previous element for the mover's name
        const prevSpan = prevElement.querySelector && prevElement.querySelector('span[style*="font-weight:600"]');
        if (prevSpan && splitText[0].toLowerCase() === 'you') {
          stealingPlayer = this.getCurrentPlayerFromDOM() || prevSpan.textContent.trim();
        }
      }
    } catch (e) {
      // ignore
    }

    // Trim punctuation from extracted names
    stealingPlayer = (stealingPlayer || '').replace(/[^A-Za-z0-9_\-]/g, '');
    targetPlayer = (targetPlayer || '').replace(/[^A-Za-z0-9_\-]/g, '');

    stealingPlayer = this.resolvePlayerName(stealingPlayer);
    targetPlayer = this.resolvePlayerName(targetPlayer);

    // Debug: log player names and resource map
    this.addEventLog(
      `[DEBUG] parseStoleFromYouMessage called: stealingPlayer='${stealingPlayer}', targetPlayer='${targetPlayer}', playerResources keys=[${Object.keys(
        this.playerResources
      ).join(", ")}]`
    );

    // Ensure both players exist in resource map (create zero entries if necessary)
    const ensurePlayer = (name) => {
      if (!name) return;
      if (!this.playerResources[name]) {
        this.playerResources[name] = {};
        for (const r of this.resourceTypes) this.playerResources[name][r] = 0;
        if (!this.players.includes(name)) this.players.push(name);
      }
    };
    ensurePlayer(stealingPlayer);
    ensurePlayer(targetPlayer);

    // Only proceed if we can clearly identify the resource being stolen
    var images = Array.from(pElement.getElementsByTagName("img"));
    let foundAny = false;
    for (var img of images) {
      const alt = (img.alt || "").toLowerCase();
      if (alt.includes("wool") || alt.includes("sheep")) {
        this.transferResource(targetPlayer, stealingPlayer, this.sheep);
        foundAny = true;
      } else if (alt.includes("lumber") || alt.includes("wood")) {
        this.transferResource(targetPlayer, stealingPlayer, this.wood);
        foundAny = true;
      } else if (alt.includes("brick")) {
        this.transferResource(targetPlayer, stealingPlayer, this.brick);
        foundAny = true;
      } else if (alt.includes("ore") || alt.includes("stone")) {
        this.transferResource(targetPlayer, stealingPlayer, this.stone);
        foundAny = true;
      } else if (alt.includes("grain") || alt.includes("wheat")) {
        this.transferResource(targetPlayer, stealingPlayer, this.wheat);
        foundAny = true;
      }
    }

    // Try to parse resource from text if no images
    if (!foundAny) {
      for (const word of splitText) {
        const clean = (word || "").replace(/[^a-zA-Z]/g, "").toLowerCase();
        if (!clean) continue;
        if (clean === "brick") {
          this.transferResource(targetPlayer, stealingPlayer, this.brick);
          foundAny = true;
          break;
        } else if (clean === "ore" || clean === "stone") {
          this.transferResource(targetPlayer, stealingPlayer, this.stone);
          foundAny = true;
          break;
        } else if (clean === "grain" || clean === "wheat") {
          this.transferResource(targetPlayer, stealingPlayer, this.wheat);
          foundAny = true;
          break;
        } else if (clean === "wool" || clean === "sheep") {
          this.transferResource(targetPlayer, stealingPlayer, this.sheep);
          foundAny = true;
          break;
        } else if (clean === "lumber" || clean === "wood") {
          this.transferResource(targetPlayer, stealingPlayer, this.wood);
          foundAny = true;
          break;
        }
      }
    }

    // Log the event with resource if found
    if (foundAny) {
      this.addEventLog(
        `${stealingPlayer} stole from ${targetPlayer} (${
          splitText.slice(2, -2).join(" ") || "resource identified"
        })`
      );
    } else {
      // If we can't identify the resource, treat it as an unknown steal
      this.addEventLog(
        `[DEBUG] Known steal but no resource identified - treating as unknown`
      );
      return;
    }
  }

  // Parse stole unknown message (their logic - handles all ambiguous steals)
  parseStoleUnknownMessage(pElement, prevElement) {
    if (!prevElement) {
      return;
    }
    var messageT = pElement.textContent;

    // Check if it's any kind of steal message
    if (!messageT.includes("stole") || this.isMonopoly(messageT)) {
      return;
    }

    // If it's a known steal with resource info, skip it (handled by parseStoleFromYouMessage)
    if (this.isKnownStealWithResource(messageT)) {
      return;
    }

    // Extract player names from the steal message
    var involvedPlayers = messageT.split(" ");
    var stealingPlayer = involvedPlayers[0];
    var targetPlayer = involvedPlayers.slice(-1)[0];

    // Resolve "You"/"you" to actual usernames
    stealingPlayer = this.resolvePlayerName(stealingPlayer);
    targetPlayer = this.resolvePlayerName(targetPlayer);

    if (
      !this.playerResources[stealingPlayer] ||
      !this.playerResources[targetPlayer]
    ) {
      console.log(
        "Failed to parse players...",
        stealingPlayer,
        targetPlayer,
        this.playerResources
      );
      this.addEventLog(
        `[DEBUG] Failed to parse players for unknown steal: ${stealingPlayer}, ${targetPlayer}`
      );
      return;
    }

    // --- 1v1 direct resolution logic ---
    if (this.players.length === 2) {
      // Check for resource image in the log
      var images = Array.from(pElement.getElementsByTagName("img"));
      let foundAny = false;
      for (var img of images) {
        let resourceKey = null;
        if (img.alt === "wool" || img.alt === "sheep") resourceKey = this.sheep;
        else if (img.alt === "lumber" || img.alt === "wood")
          resourceKey = this.wood;
        else if (img.alt === "brick") resourceKey = this.brick;
        else if (img.alt === "ore") resourceKey = this.stone;
        else if (img.alt === "grain" || img.alt === "wheat")
          resourceKey = this.wheat;
        if (resourceKey) {
          this.transferResource(targetPlayer, stealingPlayer, resourceKey);
          foundAny = true;
          this.addEventLog(
            `[DEBUG] 1v1 direct steal: ${stealingPlayer} stole ${resourceKey} from ${targetPlayer}`
          );
        }
      }
      if (foundAny) {
        return; // Do not use delta system if resolved
      }
    }
    // --- end 1v1 direct resolution logic ---

    // Debug logging
    this.addEventLog(
      `[DEBUG] Processing unknown steal: ${stealingPlayer} stole from ${targetPlayer}`
    );

    var stealingPlayerIndex = this.players.indexOf(stealingPlayer);
    var targetPlayerIndex = this.players.indexOf(targetPlayer);

    // Generate potential deltas for all possible resources
    var potential_deltas = [];
    for (const index of this.resourceTypes.keys()) {
      var temp = this.deep_copy_2d_array(this.zero_deltas);
      temp[stealingPlayerIndex][index] = 1;
      temp[targetPlayerIndex][index] = -1;
      potential_deltas.push(temp);
    }

    // Accumulate with existing potential deltas
    this.potential_state_deltas = (
      this.potential_state_deltas.length === 0
        ? [this.deep_copy_2d_array(this.zero_deltas)]
        : this.potential_state_deltas
    ).flatMap((potential_accumulated_delta) =>
      potential_deltas.map((potential_delta) =>
        this.add_array_of_arrays(potential_delta, potential_accumulated_delta)
      )
    );

    this.addEventLog(
      `[DEBUG] Added potential deltas for unknown steal. Total deltas: ${this.potential_state_deltas.length}`
    );
  }

  // Get current player name (simplified)
  getCurrentPlayerName() {
    // Try to find current player from existing players
    return Object.keys(this.playerResources)[0] || "Unknown";
  }

  // Parse starting resources (restored old logic)
  parseStartingResources(pElement) {
    var textContent = pElement.textContent;
    if (!textContent.includes("received starting resources")) {
      return;
    }
    var player = textContent
      .replace("received starting resources", "")
      .trim()
      .split(" ")[0];
    // Avoid applying starting resources multiple times for the same player
    if (this.startingResourcesApplied.has(player)) {
      this.addEventLog(`[DEBUG] Skipping starting resources for '${player}' (already applied)`);
      return;
    }
    if (!this.playerResources[player]) {
      this.playerResources[player] = {
        [this.wood]: 0,
        [this.stone]: 0,
        [this.wheat]: 0,
        [this.brick]: 0,
        [this.sheep]: 0,
      };
    }
    // Try to increment resources from images (old logic)
    var images = Array.from(pElement.getElementsByTagName("img"));
    let foundAny = false;
    for (var img of images) {
      if (img.src.includes("card_wool")) {
        this.playerResources[player][this.sheep] += 1;
        foundAny = true;
      } else if (img.src.includes("card_lumber")) {
        this.playerResources[player][this.wood] += 1;
        foundAny = true;
      } else if (img.src.includes("card_brick")) {
        this.playerResources[player][this.brick] += 1;
        foundAny = true;
      } else if (img.src.includes("card_ore")) {
        this.playerResources[player][this.stone] += 1;
        foundAny = true;
      } else if (img.src.includes("card_grain")) {
        this.playerResources[player][this.wheat] += 1;
        foundAny = true;
      }
    }
    if (foundAny) {
      this.addEventLog(
        `${player} received starting resources (parsed from images)`
      );
      this.startingResourcesApplied.add(player);
    } else {
      this.addEventLog(
        `${player} received starting resources (details not available)`
      );
      this.startingResourcesApplied.add(player);
    }
  }

  // Parse a chat log entry (main entry point)
  parseLogEntry(entry) {
    try {
      // Player name
      const nameSpan = entry.querySelector('span[style*="font-weight:600"]');
      if (!nameSpan) return false;
      const playerName = nameSpan.textContent.trim();
      if (!playerName) return false;

      // Ensure player in map
      if (!this.playerResources[playerName]) {
        this.playerResources[playerName] = {
          [this.wood]: 0,
          [this.stone]: 0,
          [this.wheat]: 0,
          [this.brick]: 0,
          [this.sheep]: 0,
        };
        this.players.push(playerName);
        // Check if this matches a pending username
        this.checkPendingUsernameActivation();
      }

      // Parse using their logic
      this.parseStartingResources(entry);
      this.parseGotMessage(entry);
      this.parseBuiltMessage(entry);
      this.parseBoughtMessage(entry);
      this.parseTradeBankMessage(entry);
      this.parseYearOfPleantyMessage(entry);
      this.parseStoleAllOfMessage(entry);
      this.parseDiscardedMessage(entry);

      // Review thefts after each parse
      this.reviewThefts();

      // Prevent negative/NaN values after parsing
      this.clampResources();

      return true;
    } catch (error) {
      console.error("[Catan Card Tracker] Error parsing log entry:", error);
      return false;
    }
  }

  // Parse with previous element for trade/steal detection
  parseLogEntryWithPrev(entry, prevEntry) {
    try {
      // If there is a previous element, handle prev-based parsing first
      // (trades/steals) to avoid pre-adding resources from a 'got' entry
      // before trade transfers are applied.
      if (prevEntry) {
        // Lightweight debug: log raw text/html for entries that might be trades
        try {
          const txt = (entry.textContent || "").replace(/\s+/g, " ").trim();
          const html = (entry.innerHTML || "").replace(/\s+/g, " ").trim();
          if (/\bgave\b|\bgot\b|\btraded\b|\bwith\b/i.test(txt)) {
            this.addEventLog(`[DEBUG] parseLogEntryWithPrev (pre-parse): entryText='${txt}'`);
            this.addEventLog(`[DEBUG] parseLogEntryWithPrev (pre-parse): entryHTML='${html}'`);
          }
        } catch (e) {}

        this.parseTradedMessage(entry, prevEntry);
        this.parseStoleFromYouMessage(entry, prevEntry);
        this.parseStoleUnknownMessage(entry, prevEntry);
        this.reviewThefts();
        // Also clamp after prev-based parsing
        this.clampResources();
      }

      // Now do the regular parsing for the single entry. This order prevents
      // parseGotMessage from adding a resource that should instead be moved
      // by the trade parser.
      const result = this.parseLogEntry(entry);

      return result;
    } catch (error) {
      console.error(
        "[Catan Card Tracker] Error parsing log entry with prev:",
        error
      );
      return false;
    }
  }

  // Get current player resources
  getPlayerResources() {
    return this.playerResources;
  }

  // Reset all resources
  resetResources() {
    this.playerResources = {};
    this.eventLogs = [];
    this.players = [];
    this.player_colors = {};
    this.potential_state_deltas = [];
  }

  // Clamp resource values to avoid negatives/NaN after parsing
  clampResources() {
    for (const player of Object.keys(this.playerResources)) {
      for (const r of this.resourceTypes) {
        const val = this.playerResources[player][r];
        if (val === undefined || isNaN(val)) {
          this.playerResources[player][r] = 0;
        } else if (val < 0) {
          // Log debug about negative clamp
          this.addEventLog(`[DEBUG] Clamped negative resource for ${player}:${r} (${val} -> 0)`);
          this.playerResources[player][r] = 0;
        }
      }
    }
  }

  // Get resource types
  getResourceTypes() {
    return this.RESOURCE_TYPES;
  }

  // Add event to log
  addEventLog(message) {
    this.eventLogs.push({
      message,
      timestamp: new Date().toISOString(),
    });

    // Keep only last 100 events
    if (this.eventLogs.length > 100) {
      this.eventLogs = this.eventLogs.slice(-100);
    }
  }

  // Get event logs
  getEventLogs() {
    return this.eventLogs;
  }

  // Get potential theft deltas for debugging
  getPotentialTheftDeltas() {
    return this.potential_state_deltas;
  }

  // Get theft information for a specific player and resource
  getTheftForPlayerAndResource(player, resourceType) {
    const playerIndex = this.players.indexOf(player);
    const resourceIndex = this.resourceTypes.indexOf(resourceType);
    if (playerIndex === -1 || resourceIndex === -1) return [];

    const result = new Set();
    for (var potential_state_delta of this.potential_state_deltas) {
      var diff = potential_state_delta[playerIndex][resourceIndex];
      if (diff !== 0) {
        result.add(diff);
      }
    }
    return Array.from(result);
  }

  // Get theft information for a specific player
  getTheftForPlayer(player) {
    if (this.potential_state_deltas.length === 0) {
      return [[0], [0]];
    }
    const playerIndex = this.players.indexOf(player);
    if (playerIndex === -1) return [[0], [0]];

    const theftsBy = this.potential_state_deltas.map((potential_state_delta) =>
      potential_state_delta[playerIndex]
        .filter((x) => x > 0)
        .reduce((a, b) => a + b, 0)
    );
    const theftsFrom = this.potential_state_deltas.map(
      (potential_state_delta) =>
        potential_state_delta[playerIndex]
          .filter((x) => x < 0)
          .reduce((a, b) => a + b, 0)
    );

    return [Array.from(new Set(theftsBy)), Array.from(new Set(theftsFrom))];
  }
}

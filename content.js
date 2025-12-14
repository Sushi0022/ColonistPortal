// == Catan Card Tracker Overlay ==
import { ResourceTracker } from "./resource-tracker.js";
import { UIOverlay } from "./ui-overlay.js";
import { StrategicIntel } from "./strategic-intel.js";

(function () {
  // Initialize modules
  const resourceTracker = new ResourceTracker();
  const strategicIntel = new StrategicIntel(resourceTracker);
  const uiOverlay = new UIOverlay();

  // Make resourceTracker globally accessible for UI interactions
  window.resourceTracker = resourceTracker;

  // Force overlay to render immediately for debugging
  function forceOverlayRender() {
    const playerResources = resourceTracker.getPlayerResources();
    const resourceTypes = resourceTracker.getResourceTypes();
    const eventLogs = resourceTracker.getEventLogs();
    uiOverlay.renderOverlay(
      playerResources,
      resourceTypes,
      eventLogs,
      resourceTracker,
      strategicIntel
    );
    console.log("[Catan Card Tracker] Forced overlay render for debugging");
  }

  // Set up MutationObserver
  function setupObserver() {
    // Find chat log container using robust heuristics (look for container
    // that contains multiple entries with player-name spans or card images)
    function isChatEntryNode(node) {
      if (!node || node.nodeType !== 1) return false;
      // Player name span used by colonist.io logs
      if (node.querySelector && node.querySelector('span[style*="font-weight:600"]')) return true;
      // Resource card images
      const imgs = node.getElementsByTagName ? Array.from(node.getElementsByTagName('img')) : [];
      if (imgs.some((img) => /card_(wool|lumber|brick|ore|grain)/.test(img.src || img.alt || ''))) return true;
      return false;
    }

    // Heuristic: pick a div that has many chat-like children
    let chatLog = null;
    const candidateDivs = Array.from(document.querySelectorAll('div'));
    let best = { node: null, score: 0 };
    for (const d of candidateDivs) {
      let score = 0;
      for (const child of Array.from(d.children)) {
        if (isChatEntryNode(child)) score++;
      }
      if (score > best.score) {
        best = { node: d, score };
      }
    }
    if (best.score > 0) chatLog = best.node;
    if (!chatLog) {
      setTimeout(setupObserver, 1000); // Retry until found
      return;
    }

    console.log("[Catan Card Tracker] Chat log found, setting up observer");

    // Force overlay to render immediately
    forceOverlayRender();

    // Observe only new entries
    const observer = new MutationObserver((mutations) => {
      let resourcesUpdated = false;
      let newEntries = [];

      // Collect all new entries
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (isChatEntryNode(node)) newEntries.push(node);
        }
      }

      // Process entries with previous element context
      if (newEntries.length > 0) {
        // Build the list of all entries by filtering chatLog children
        const allEntries = Array.from(chatLog.children).filter(isChatEntryNode);

        for (let i = 0; i < newEntries.length; i++) {
          const entry = newEntries[i];
          const entryIndex = allEntries.indexOf(entry);
          const prevEntry = entryIndex > 0 ? allEntries[entryIndex - 1] : null;

          const updated = resourceTracker.parseLogEntryWithPrev(
            entry,
            prevEntry
          );
          if (updated) {
            resourcesUpdated = true;
          }
        }
      }

      // Only re-render if resources were actually updated
      if (resourcesUpdated) {
        const playerResources = resourceTracker.getPlayerResources();
        const resourceTypes = resourceTracker.getResourceTypes();
        const eventLogs = resourceTracker.getEventLogs();
        uiOverlay.renderOverlay(
          playerResources,
          resourceTypes,
          eventLogs,
          resourceTracker,
          strategicIntel
        );
      }
    });

    observer.observe(chatLog, { childList: true });

    // Parse existing entries (optional)
    const allEntries = Array.from(chatLog.children).filter(isChatEntryNode);

    for (let i = 0; i < allEntries.length; i++) {
      const entry = allEntries[i];
      const prevEntry = i > 0 ? allEntries[i - 1] : null;

      const updated = resourceTracker.parseLogEntryWithPrev(entry, prevEntry);
      if (updated) {
        const playerResources = resourceTracker.getPlayerResources();
        const resourceTypes = resourceTracker.getResourceTypes();
        const eventLogs = resourceTracker.getEventLogs();
        uiOverlay.renderOverlay(
          playerResources,
          resourceTypes,
          eventLogs,
          resourceTracker,
          strategicIntel
        );
      }
    }

    // Force another render after parsing existing entries
    forceOverlayRender();
  }

  // Initialize
  setupObserver();

  // Fallback: Force overlay render after 3 seconds regardless
  setTimeout(() => {
    forceOverlayRender();
  }, 3000);
})();

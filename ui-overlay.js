// UI Overlay functionality for Catan Card Tracker
export class UIOverlay {
  constructor() {
    this.overlayRoot = null;
    this.debugMode = true; // Default to showing debug logs
    this.storedUsername = null;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.position = { x: 12, y: 12 }; // Default position
    this.injectStyles();
    this.loadSettings();
  }

  // Helper to read and save capture endpoint settings
  async getCaptureSettings() {
    try {
      const r = await chrome.storage.local.get(["visionEndpoint", "visionAuthHeader"]);
      return { endpoint: r.visionEndpoint || "", authHeader: r.visionAuthHeader || "" };
    } catch (e) { return { endpoint: "", authHeader: "" }; }
  }

  async saveCaptureSettings(endpoint, authHeader) {
    try {
      await chrome.storage.local.set({ visionEndpoint: endpoint, visionAuthHeader: authHeader });
    } catch (e) {}
  }

  // Load settings from Chrome storage
  async loadSettings() {
    try {
      const result = await chrome.storage.local.get([
        "username",
        "debugMode",
        "overlayPosition",
      ]);
      this.storedUsername = result.username || null;
      this.debugMode = result.debugMode !== undefined ? result.debugMode : true;
      if (result.overlayPosition) {
        this.position = result.overlayPosition;
      }
    } catch (error) {
      console.log("[Catan Card Tracker] Error loading settings:", error);
    }
  }

  // Save settings to Chrome storage
  async saveSettings() {
    try {
      await chrome.storage.local.set({
        username: this.storedUsername,
        debugMode: this.debugMode,
        overlayPosition: this.position,
      });
    } catch (error) {
      console.log("[Catan Card Tracker] Error saving settings:", error);
    }
  }

  // Inject CSS styles inline to avoid CSP issues
  injectStyles() {
    if (document.getElementById("catan-card-tracker-styles")) return;

    const style = document.createElement("style");
    style.id = "catan-card-tracker-styles";
    style.textContent = `
      #catan-card-tracker-overlay {
        position: fixed;
        z-index: 99999;
        background: rgba(30, 30, 40, 0.95);
        border-radius: 10px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.25);
        padding: 10px 16px;
        min-width: 220px;
        font-family: 'Segoe UI', Arial, sans-serif;
        color: #fff;
        font-size: 15px;
        backdrop-filter: blur(5px);
        cursor: move;
        user-select: none;
        transition: box-shadow 0.2s;
      }
      #catan-card-tracker-overlay:hover {
        box-shadow: 0 4px 20px rgba(0,0,0,0.35);
      }
      #catan-card-tracker-overlay.dragging {
        box-shadow: 0 8px 25px rgba(0,0,0,0.4);
        opacity: 0.9;
      }
      .catan-ct-row {
        display: flex;
        align-items: center;
        margin-bottom: 6px;
        gap: 8px;
      }
      .catan-ct-row:last-child {
        margin-bottom: 0;
      }
      .catan-ct-player-name {
        font-weight: 600;
        margin-right: 8px;
        color: #fff;
        min-width: 60px;
      }
      .catan-ct-resource {
        display: inline-flex;
        align-items: center;
        background: rgba(255,255,255,0.08);
        border-radius: 5px;
        padding: 2px 6px 2px 2px;
        margin-right: 4px;
        font-size: 14px;
      }
      .catan-ct-resource-symbol {
        margin-right: 4px;
        width: 30px;
        height: 40px;
        vertical-align: middle;
        filter: brightness(1.1) contrast(1.1);
      }
      .catan-ct-resource-count {
        font-weight: 500;
        min-width: 12px;
        text-align: right;
      }
      .catan-ct-controls {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }
      .catan-ct-debug-toggle {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #ccc;
      }
      .catan-ct-toggle-switch {
        position: relative;
        width: 32px;
        height: 16px;
        background: #555;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.3s;
      }
      .catan-ct-toggle-switch.active {
        background: #ffd700;
      }
      .catan-ct-toggle-slider {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 12px;
        height: 12px;
        background: #fff;
        border-radius: 50%;
        transition: transform 0.3s;
      }
      .catan-ct-toggle-switch.active .catan-ct-toggle-slider {
        transform: translateX(16px);
      }
      .catan-ct-username-change {
        font-size: 11px;
        color: #888;
        cursor: pointer;
        text-decoration: underline;
        transition: color 0.2s;
      }
      .catan-ct-username-change:hover {
        color: #ffd700;
      }
      .catan-ct-username-display {
        font-size: 12px;
        color: #ffd700;
        font-style: italic;
      }
    `;
    document.head.appendChild(style);
  }

  // Setup drag functionality
  setupDrag() {
    if (!this.overlayRoot) return;

    const overlay = this.overlayRoot;

    // Mouse down event
    overlay.addEventListener("mousedown", (e) => {
      // Don't start drag if clicking on interactive elements
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "BUTTON" ||
        e.target.closest(".catan-ct-toggle-switch") ||
        e.target.closest(".catan-ct-username-change")
      ) {
        return;
      }

      this.isDragging = true;
      this.dragOffset.x = e.clientX - this.position.x;
      this.dragOffset.y = e.clientY - this.position.y;
      overlay.classList.add("dragging");
      e.preventDefault();
    });

    // Mouse move event
    document.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;

      const newX = e.clientX - this.dragOffset.x;
      const newY = e.clientY - this.dragOffset.y;

      // Keep overlay within viewport bounds
      const maxX = window.innerWidth - overlay.offsetWidth;
      const maxY = window.innerHeight - overlay.offsetHeight;

      this.position.x = Math.max(0, Math.min(newX, maxX));
      this.position.y = Math.max(0, Math.min(newY, maxY));

      overlay.style.left = this.position.x + "px";
      overlay.style.top = this.position.y + "px";
    });

    // Mouse up event
    document.addEventListener("mouseup", () => {
      if (this.isDragging) {
        this.isDragging = false;
        overlay.classList.remove("dragging");
        this.saveSettings();
      }
    });
  }

  // Render the overlay with current player resources
  renderOverlay(
    playerResources,
    resourceTypes,
    eventLogs = [],
    theftInfo = null
  , strategicIntel = null
  ) {
    if (!this.overlayRoot) {
      this.overlayRoot = document.createElement("div");
      this.overlayRoot.id = "catan-card-tracker-overlay";
      this.overlayRoot.style.left = this.position.x + "px";
      this.overlayRoot.style.top = this.position.y + "px";
      document.body.appendChild(this.overlayRoot);
      this.setupDrag();
    }

    this.overlayRoot.innerHTML = "";

    // Helpers for background messaging with consistent timeouts/retries
    const sendRequestBg = (url, options, opts = {}) => new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'send_request', url, options, timeoutMs: opts.timeoutMs || 15000, retries: opts.retries || 2 }, (resp) => {
          if (chrome.runtime.lastError) return resolve({ error: chrome.runtime.lastError.message });
          resolve(resp);
        });
      } catch (e) { resolve({ error: e && e.message ? e.message : String(e) }); }
    });

    const captureBg = (timeoutMs = 10000) => new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: 'capture_tab', timeoutMs }, (resp) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!resp) return reject(new Error('No response from background'));
          if (resp.error) return reject(new Error(resp.error));
          resolve(resp.dataUrl);
        });
      } catch (e) { reject(e); }
      // Note: background has its own timeout guard; this promise will reject if runtime.lastError occurs
    });

    // If no players, show username input section
    if (Object.keys(playerResources).length === 0) {
      const setupSection = document.createElement("div");
      setupSection.className = "catan-ct-setup-section";
      setupSection.style.textAlign = "center";
      setupSection.style.padding = "20px";

      const title = document.createElement("div");
      title.textContent = "Catan Portal";
      title.style.fontSize = "18px";
      title.style.fontWeight = "bold";
      title.style.color = "#ffd700";
      title.style.marginBottom = "15px";
      setupSection.appendChild(title);

      // Show stored username if available
      if (this.storedUsername) {
        const usernameDisplay = document.createElement("div");
        usernameDisplay.className = "catan-ct-username-display";
        usernameDisplay.textContent = `Starting portal with name: ${this.storedUsername}`;
        usernameDisplay.style.marginBottom = "15px";
        setupSection.appendChild(usernameDisplay);

        // Set the username in resource tracker
        window.resourceTracker.setCurrentPlayerUsername(this.storedUsername);

        // Add a small "change username" link
        const changeLink = document.createElement("div");
        changeLink.className = "catan-ct-username-change";
        changeLink.textContent = "Change username";
        changeLink.style.marginBottom = "15px";
        changeLink.addEventListener("click", () => {
          this.storedUsername = null;
          this.saveSettings();
          this.renderOverlay(
            playerResources,
            resourceTypes,
            eventLogs,
            theftInfo
              , strategicIntel
              );
        });
        setupSection.appendChild(changeLink);
      } else {
        const subtitle = document.createElement("div");
        subtitle.textContent = "Enter your username to enter the portal";
        subtitle.style.fontSize = "14px";
        subtitle.style.color = "#ccc";
        subtitle.style.marginBottom = "15px";
        setupSection.appendChild(subtitle);

        const inputContainer = document.createElement("div");
        inputContainer.style.display = "flex";
        inputContainer.style.gap = "8px";
        inputContainer.style.marginBottom = "10px";

        const usernameInput = document.createElement("input");
        usernameInput.type = "text";
        usernameInput.placeholder = "Your username";
        usernameInput.style.flex = "1";
        usernameInput.style.padding = "8px 12px";
        usernameInput.style.border = "1px solid #555";
        usernameInput.style.borderRadius = "5px";
        usernameInput.style.backgroundColor = "rgba(255,255,255,0.1)";
        usernameInput.style.color = "#fff";
        usernameInput.style.fontSize = "14px";
        usernameInput.style.outline = "none";

        // Add focus styles
        usernameInput.addEventListener("focus", () => {
          usernameInput.style.borderColor = "#ffd700";
        });

        usernameInput.addEventListener("blur", () => {
          usernameInput.style.borderColor = "#555";
        });

        // Handle Enter key
        usernameInput.addEventListener("keypress", (e) => {
          if (e.key === "Enter") {
            const username = usernameInput.value.trim();
            if (username) {
              this.storedUsername = username;
              this.saveSettings();
              window.resourceTracker.setCurrentPlayerUsername(username);
              usernameInput.value = "";
              // Force a re-render
              setTimeout(() => {
                const playerResources =
                  window.resourceTracker.getPlayerResources();
                const resourceTypes = window.resourceTracker.getResourceTypes();
                const eventLogs = window.resourceTracker.getEventLogs();
                this.renderOverlay(
                  playerResources,
                  resourceTypes,
                  eventLogs,
                    window.resourceTracker,
                    strategicIntel
                );
              }, 100);
            }
          }
        });

        const setButton = document.createElement("button");
        setButton.textContent = "Set";
        setButton.style.padding = "8px 16px";
        setButton.style.backgroundColor = "#ffd700";
        setButton.style.color = "#000";
        setButton.style.border = "none";
        setButton.style.borderRadius = "5px";
        setButton.style.fontSize = "14px";
        setButton.style.fontWeight = "bold";
        setButton.style.cursor = "pointer";

        // Add hover effect
        setButton.addEventListener("mouseenter", () => {
          setButton.style.backgroundColor = "#ffed4e";
        });

        setButton.addEventListener("mouseleave", () => {
          setButton.style.backgroundColor = "#ffd700";
        });

        setButton.addEventListener("click", () => {
          const username = usernameInput.value.trim();
          if (username) {
            this.storedUsername = username;
            this.saveSettings();
            window.resourceTracker.setCurrentPlayerUsername(username);
            usernameInput.value = "";
            // Force a re-render
            setTimeout(() => {
              const playerResources =
                window.resourceTracker.getPlayerResources();
              const resourceTypes = window.resourceTracker.getResourceTypes();
              const eventLogs = window.resourceTracker.getEventLogs();
              this.renderOverlay(
                playerResources,
                resourceTypes,
                eventLogs,
                 window.resourceTracker,
                 strategicIntel
              );
            }, 100);
          }
        });

        inputContainer.appendChild(usernameInput);
        inputContainer.appendChild(setButton);
        setupSection.appendChild(inputContainer);

        const infoText = document.createElement("div");
        infoText.textContent =
          "This step is essential to set the current player for tracking purposes";
        infoText.style.fontSize = "12px";
        infoText.style.color = "#888";
        infoText.style.fontStyle = "italic";
        setupSection.appendChild(infoText);
      }

      this.overlayRoot.appendChild(setupSection);
      return;
    }

    // Add controls section with debug toggle and username change
    const controlsSection = document.createElement("div");
    controlsSection.className = "catan-ct-controls";

    // Debug toggle
    const debugToggle = document.createElement("div");
    debugToggle.className = "catan-ct-debug-toggle";

    const toggleLabel = document.createElement("span");
    toggleLabel.textContent = "Debug";
    debugToggle.appendChild(toggleLabel);

    const toggleSwitch = document.createElement("div");
    toggleSwitch.className = `catan-ct-toggle-switch ${
      this.debugMode ? "active" : ""
    }`;
    toggleSwitch.addEventListener("click", () => {
      this.debugMode = !this.debugMode;
      this.saveSettings();
      this.renderOverlay(playerResources, resourceTypes, eventLogs, theftInfo, strategicIntel);
    });

    const toggleSlider = document.createElement("div");
    toggleSlider.className = "catan-ct-toggle-slider";
    toggleSwitch.appendChild(toggleSlider);
    debugToggle.appendChild(toggleSwitch);

    controlsSection.appendChild(debugToggle);

    // Username change option
    if (this.storedUsername) {
      const usernameChange = document.createElement("div");
      usernameChange.className = "catan-ct-username-change";
      usernameChange.textContent = "Change name";
      usernameChange.addEventListener("click", () => {
        this.storedUsername = null;
        this.saveSettings();
        this.renderOverlay(
          playerResources,
          resourceTypes,
          eventLogs,
          theftInfo,
          strategicIntel
        );
      });
      controlsSection.appendChild(usernameChange);
    }

    this.overlayRoot.appendChild(controlsSection);

    // Strategic recommendation (show for current player if available)
    try {
      const players = Object.keys(playerResources);
      const currentPlayer =
        (theftInfo && theftInfo.currentPlayerUsername) ||
        this.storedUsername ||
        players[0];
      if (strategicIntel && currentPlayer) {
        const rec = strategicIntel.getRecommendationForPlayer(currentPlayer);
        if (rec) {
          const recBox = document.createElement("div");
          recBox.style.margin = "8px 0";
          recBox.style.padding = "8px";
          recBox.style.background = "rgba(255,255,255,0.03)";
          recBox.style.borderRadius = "6px";
          recBox.style.fontSize = "13px";

          const recTitle = document.createElement("div");
          recTitle.textContent = `Recommendation for ${currentPlayer}`;
          recTitle.style.fontWeight = "700";
          recTitle.style.color = "#ffd700";
          recTitle.style.marginBottom = "6px";
          recBox.appendChild(recTitle);

          const recText = document.createElement("div");
          recText.textContent = rec.recommendation;
          recText.style.color = "#ddd";
          recBox.appendChild(recText);

          const progress = document.createElement("div");
          progress.textContent = `Progress: ${rec.progress}%`;
          progress.style.fontSize = "12px";
          progress.style.color = "#aaa";
          progress.style.marginTop = "6px";
          recBox.appendChild(progress);

          this.overlayRoot.appendChild(recBox);
        }
      }
    } catch (e) {
      // ignore recommendation errors
    }

    for (const [player, resources] of Object.entries(playerResources)) {
      const row = document.createElement("div");
      row.className = "catan-ct-row";

      // Player name
      const name = document.createElement("span");
      name.className = "catan-ct-player-name";
      name.textContent = player;
      row.appendChild(name);

      // Resource counts with SVG images
      for (const { key } of resourceTypes) {
        const count = resources[key] || 0;
        const resBox = document.createElement("span");
        resBox.className = "catan-ct-resource";

        // Create SVG image element
        const svgImg = document.createElement("img");
        svgImg.className = "catan-ct-resource-symbol";
        svgImg.src = chrome.runtime.getURL(`card_images/card_${key}.svg`);
        svgImg.alt = key;
        svgImg.width = 30;
        svgImg.height = 40;
        resBox.appendChild(svgImg);

        const num = document.createElement("span");
        num.className = "catan-ct-resource-count";
        num.textContent = count;
        resBox.appendChild(num);

        row.appendChild(resBox);
      }

      // Add theft indicators if theft info is available
      if (theftInfo && theftInfo.getTheftForPlayer) {
        const [theftsBy, theftsFrom] = theftInfo.getTheftForPlayer(player);

        // Show thefts by this player
        if (theftsBy.length > 0 && (theftsBy.length > 1 || theftsBy[0] !== 0)) {
          const theftByBox = document.createElement("span");
          theftByBox.className = "catan-ct-resource";
          theftByBox.style.background = "rgba(255, 100, 100, 0.2)";
          theftByBox.style.border = "1px solid rgba(255, 100, 100, 0.5)";

          const theftIcon = document.createElement("span");
          theftIcon.textContent = "🦹";
          theftIcon.style.fontSize = "12px";
          theftIcon.style.marginRight = "2px";
          theftByBox.appendChild(theftIcon);

          const theftNum = document.createElement("span");
          theftNum.className = "catan-ct-resource-count";
          theftNum.textContent =
            theftsBy.length === 1 ? theftsBy[0] : `(${theftsBy.join(",")})`;
          theftByBox.appendChild(theftNum);

          row.appendChild(theftByBox);
        }

        // Show thefts from this player
        if (
          theftsFrom.length > 0 &&
          (theftsFrom.length > 1 || theftsFrom[0] !== 0)
        ) {
          const theftFromBox = document.createElement("span");
          theftFromBox.className = "catan-ct-resource";
          theftFromBox.style.background = "rgba(100, 100, 255, 0.2)";
          theftFromBox.style.border = "1px solid rgba(100, 100, 255, 0.5)";

          const theftIcon = document.createElement("span");
          theftIcon.textContent = "💎";
          theftIcon.style.fontSize = "12px";
          theftIcon.style.marginRight = "2px";
          theftFromBox.appendChild(theftIcon);

          const theftNum = document.createElement("span");
          theftNum.className = "catan-ct-resource-count";
          theftNum.textContent =
            theftsFrom.length === 1
              ? theftsFrom[0]
              : `(${theftsFrom.join(",")})`;
          theftFromBox.appendChild(theftNum);

          row.appendChild(theftFromBox);
        }
      }

      this.overlayRoot.appendChild(row);
    }

    // Show potential theft deltas count if available
    if (theftInfo && theftInfo.getPotentialTheftDeltas) {
      const deltas = theftInfo.getPotentialTheftDeltas();
      if (deltas.length > 0) {
        const deltaInfo = document.createElement("div");
        deltaInfo.style.marginTop = "8px";
        deltaInfo.style.padding = "4px 0";
        deltaInfo.style.fontSize = "12px";
        deltaInfo.style.color = "#ffd700";
        deltaInfo.style.borderTop = "1px solid rgba(255,255,255,0.1)";
        deltaInfo.textContent = `🔄 ${deltas.length} potential theft deltas`;
        this.overlayRoot.appendChild(deltaInfo);
      }
    }

    // Render event log section if there are logs and debug mode is on
    if (eventLogs.length > 0 && this.debugMode) {
      const logSection = document.createElement("div");
      logSection.className = "catan-ct-log-section";
      logSection.style.marginTop = "14px";
      logSection.style.padding = "8px 0 0 0";
      logSection.style.borderTop = "1px solid rgba(255,255,255,0.15)";
      logSection.style.fontSize = "13px";
      logSection.style.maxHeight = "120px";
      logSection.style.overflowY = "auto";

      const logTitle = document.createElement("div");
      logTitle.textContent = "Recent Resource Events";
      logTitle.style.fontWeight = "bold";
      logTitle.style.color = "#ffd700";
      logTitle.style.marginBottom = "6px";
      logSection.appendChild(logTitle);

      // Show last 10 logs
      const recentLogs = eventLogs.slice(-10);
      recentLogs.forEach((log) => {
        const logEntry = document.createElement("div");
        logEntry.textContent = log.message;
        logEntry.style.marginBottom = "2px";
        logEntry.style.whiteSpace = "pre-line";
        logSection.appendChild(logEntry);
      });

      this.overlayRoot.appendChild(logSection);
    }
  }

  // Remove the overlay
  removeOverlay() {
    if (this.overlayRoot) {
      this.overlayRoot.remove();
      this.overlayRoot = null;
    }
  }
}

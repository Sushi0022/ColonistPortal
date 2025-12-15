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
        "intelMode",
      ]);
      this.storedUsername = result.username || null;
      this.debugMode = result.debugMode !== undefined ? result.debugMode : true;
      this.intelMode = result.intelMode !== undefined ? result.intelMode : true;
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
        intelMode: this.intelMode,
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

    // Intelligence toggle
    const intelToggle = document.createElement("div");
    intelToggle.className = "catan-ct-debug-toggle";
    const intelLabel = document.createElement("span");
    intelLabel.textContent = "Intel";
    intelToggle.appendChild(intelLabel);
    const intelSwitch = document.createElement("div");
    intelSwitch.className = `catan-ct-toggle-switch ${this.intelMode ? 'active' : ''}`;
    intelSwitch.addEventListener('click', () => {
      this.intelMode = !this.intelMode;
      this.saveSettings();
      this.renderOverlay(playerResources, resourceTypes, eventLogs, theftInfo, strategicIntel);
    });
    const intelSlider = document.createElement('div');
    intelSlider.className = 'catan-ct-toggle-slider';
    intelSwitch.appendChild(intelSlider);
    intelToggle.appendChild(intelSwitch);
    controlsSection.appendChild(intelToggle);

    // Capture & Analyze control
    const captureControl = document.createElement('div');
    captureControl.style.display = 'flex';
    captureControl.style.alignItems = 'center';
    captureControl.style.gap = '8px';

    const captureBtn = document.createElement('button');
    captureBtn.textContent = 'Capture & Analyze';
    captureBtn.style.padding = '6px 10px';
    captureBtn.style.background = '#4caf50';
    captureBtn.style.color = '#fff';
    captureBtn.style.border = 'none';
    captureBtn.style.borderRadius = '6px';
    captureBtn.style.cursor = 'pointer';
    captureBtn.title = 'Share a tab/window to capture a screenshot and send to your vision endpoint';

    const cfgLink = document.createElement('a');
    cfgLink.textContent = 'Endpoint';
    cfgLink.style.fontSize = '12px';
    cfgLink.style.color = '#ffd700';
    cfgLink.style.cursor = 'pointer';

    captureControl.appendChild(captureBtn);
    captureControl.appendChild(cfgLink);
    controlsSection.appendChild(captureControl);

    // Endpoint configuration panel (hidden by default)
    const cfgPanel = document.createElement('div');
    cfgPanel.style.display = 'none';
    cfgPanel.style.marginTop = '8px';
    cfgPanel.style.padding = '8px';
    cfgPanel.style.background = 'rgba(255,255,255,0.02)';
    cfgPanel.style.borderRadius = '6px';
    cfgPanel.style.flexDirection = 'column';

    const endpointInput = document.createElement('input');
    endpointInput.placeholder = 'https://your-server.example/vision';
    endpointInput.style.width = '100%';
    endpointInput.style.padding = '6px';
    endpointInput.style.marginBottom = '6px';
    endpointInput.style.borderRadius = '4px';
    endpointInput.style.border = '1px solid rgba(255,255,255,0.08)';
    endpointInput.style.background = 'rgba(0,0,0,0.25)';
    endpointInput.style.color = '#fff';

    const authInput = document.createElement('input');
    authInput.placeholder = 'Optional Authorization header value (e.g. Bearer XYZ)';
    authInput.style.width = '100%';
    authInput.style.padding = '6px';
    authInput.style.borderRadius = '4px';
    authInput.style.border = '1px solid rgba(255,255,255,0.08)';
    authInput.style.background = 'rgba(0,0,0,0.25)';
    authInput.style.color = '#fff';
    authInput.style.marginBottom = '6px';

    const saveCfg = document.createElement('button');
    saveCfg.textContent = 'Save';
    saveCfg.style.padding = '6px 10px';
    saveCfg.style.border = 'none';
    saveCfg.style.borderRadius = '6px';
    saveCfg.style.background = '#ffd700';
    saveCfg.style.cursor = 'pointer';

    cfgPanel.appendChild(endpointInput);
    cfgPanel.appendChild(authInput);
    cfgPanel.appendChild(saveCfg);
    controlsSection.appendChild(cfgPanel);

    cfgLink.addEventListener('click', async () => {
      // load stored settings
      const s = await this.getCaptureSettings();
      endpointInput.value = s.endpoint || '';
      authInput.value = s.authHeader || '';
      cfgPanel.style.display = cfgPanel.style.display === 'none' ? 'flex' : 'none';
    });

    saveCfg.addEventListener('click', async () => {
      await this.saveCaptureSettings(endpointInput.value.trim(), authInput.value.trim());
      cfgPanel.style.display = 'none';
    });

    captureBtn.addEventListener('click', async () => {
      // Fetch saved settings and perform capture
      const s = await this.getCaptureSettings();
      const endpoint = s.endpoint;
      const auth = s.authHeader;
      if (!endpoint) {
        alert('Please configure a vision endpoint first (click Endpoint).');
        return;
      }
      try {
        captureBtn.textContent = 'Capturing...';
        captureBtn.disabled = true;

        // Try background/native capture first
        let capturedDataUrl = null;
        try {
          capturedDataUrl = await captureBg(10000);
        } catch (bgErr) {
          // Background capture failed — fall back to in-page capture via map-analyzer
          try {
            const mod = await import('./map-analyzer.js');
            const headers = {};
            if (auth) headers['Authorization'] = auth;
            const resp = await mod.captureAndSendToEndpoint(endpoint, headers);
            captureBtn.textContent = 'Capture & Analyze';
            captureBtn.disabled = false;
            try {
              const msg = typeof resp === 'object' ? JSON.stringify(resp, null, 2) : String(resp);
              alert('Vision response:\n' + (msg.slice ? msg.slice(0,2000) : msg));
              if (window.resourceTracker && window.resourceTracker.addEventLog) {
                window.resourceTracker.addEventLog('[VISION] ' + (typeof resp === 'object' ? JSON.stringify(resp) : String(resp)));
              }
            } catch (e) { console.log('Vision resp', resp); }
            return;
          } catch (fallbackErr) {
            captureBtn.textContent = 'Capture & Analyze';
            captureBtn.disabled = false;
            alert('Capture failed: ' + (fallbackErr && fallbackErr.message ? fallbackErr.message : String(fallbackErr)));
            return;
          }
        }

        // If we have a data URL from background capture, ask background to POST it (avoids CORS)
        try {
          const headers = Object.assign({ 'Content-Type': 'application/json' }, (auth ? { 'Authorization': auth } : {}));
          const body = JSON.stringify({ image: capturedDataUrl });
          const resp = await sendRequestBg(endpoint, { method: 'POST', headers, body }, { timeoutMs: 20000, retries: 2 });
          captureBtn.textContent = 'Capture & Analyze';
          captureBtn.disabled = false;
          if (!resp) {
            alert('Failed to send captured image: no response from background proxy');
          } else if (resp.error) {
            alert('Failed to send captured image: ' + resp.error);
          } else {
            const display = resp.json || resp.text || { status: resp.status };
            alert('Vision response:\n' + (typeof display === 'object' ? JSON.stringify(display, null, 2).slice(0,2000) : String(display)));
            if (window.resourceTracker && window.resourceTracker.addEventLog) window.resourceTracker.addEventLog('[VISION] ' + (typeof display === 'object' ? JSON.stringify(display) : String(display)));
          }
        } catch (e) {
          captureBtn.textContent = 'Capture & Analyze';
          captureBtn.disabled = false;
          alert('Failed to send captured image: ' + (e && e.message ? e.message : String(e)));
        }
      } catch (error) {
        captureBtn.textContent = 'Capture & Analyze';
        captureBtn.disabled = false;
        alert('Capture failed: ' + (error && error.message ? error.message : String(error)));
      }
    });

    // Additional button: send directly to Google Vision (Gemini workflows)
    const googleBtn = document.createElement('button');
    googleBtn.textContent = 'Send to Google Vision';
    googleBtn.style.padding = '6px 10px';
    googleBtn.style.background = '#1a73e8';
    googleBtn.style.color = '#fff';
    googleBtn.style.border = 'none';
    googleBtn.style.borderRadius = '6px';
    googleBtn.style.cursor = 'pointer';
    captureControl.appendChild(googleBtn);

    // Gemini button (sends to configured endpoint expecting Gemini/Vertex proxy)
    const geminiBtn = document.createElement('button');
    geminiBtn.textContent = 'Send to Gemini';
    geminiBtn.style.padding = '6px 10px';
    geminiBtn.style.background = '#00b894';
    geminiBtn.style.color = '#fff';
    geminiBtn.style.border = 'none';
    geminiBtn.style.borderRadius = '6px';
    geminiBtn.style.cursor = 'pointer';
    captureControl.appendChild(geminiBtn);

    googleBtn.addEventListener('click', async () => {
      const s = await this.getCaptureSettings();
      // If auth input contains a raw API key, prefer that; otherwise prompt
      let apiKey = s.authHeader || '';
      if (!apiKey) apiKey = prompt('Enter Google Cloud Vision API key (will not be stored):');
      if (!apiKey) return alert('API key required');
      try {
        googleBtn.textContent = 'Capturing...';
        googleBtn.disabled = true;

        // Try native background capture first
        let dataUrl = null;
        try {
          dataUrl = await captureBg(10000);
        } catch (bgErr) {
          // fallback to in-page capture via map-analyzer helper
          try {
            const mod = await import('./map-analyzer.js');
            const resp = await mod.captureAndSendToGoogleVision(apiKey.replace(/^Bearer\s+/i, '').trim());
            googleBtn.textContent = 'Send to Google Vision';
            googleBtn.disabled = false;
            const msg = typeof resp === 'object' ? JSON.stringify(resp, null, 2) : String(resp);
            alert('Google Vision response:\n' + (msg.slice ? msg.slice(0,2000) : msg));
            if (window.resourceTracker && window.resourceTracker.addEventLog) window.resourceTracker.addEventLog('[GVISION] ' + (typeof resp === 'object' ? JSON.stringify(resp) : String(resp)));
            return;
          } catch (fallbackErr) {
            googleBtn.textContent = 'Send to Google Vision';
            googleBtn.disabled = false;
            alert('Google Vision capture failed: ' + (fallbackErr && fallbackErr.message ? fallbackErr.message : String(fallbackErr)));
            return;
          }
        }

        // Use the background-captured dataUrl and call Google Vision REST API
        try {
          const base64 = dataUrl.split(',')[1];
          const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey.replace(/^Bearer\s+/i, '').trim())}`;
          const body = {
            requests: [
              {
                image: { content: base64 },
                features: [
                  { type: 'TEXT_DETECTION', maxResults: 10 },
                  { type: 'LABEL_DETECTION', maxResults: 20 },
                  { type: 'OBJECT_LOCALIZATION', maxResults: 50 }
                ]
              }
            ]
          };
          const resp = await sendRequestBg(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, { timeoutMs: 20000, retries: 2 });
          googleBtn.textContent = 'Send to Google Vision';
          googleBtn.disabled = false;
          if (!resp) {
            alert('Google Vision capture failed: no response from background proxy');
          } else if (resp.error) {
            alert('Google Vision capture failed: ' + resp.error);
          } else {
            const msg = resp.json || resp.text || { status: resp.status };
            alert('Google Vision response:\n' + (typeof msg === 'object' ? JSON.stringify(msg, null, 2).slice(0,2000) : String(msg)));
            if (window.resourceTracker && window.resourceTracker.addEventLog) window.resourceTracker.addEventLog('[GVISION] ' + (typeof msg === 'object' ? JSON.stringify(msg) : String(msg)));
          }
        } catch (e) {
          googleBtn.textContent = 'Send to Google Vision';
          googleBtn.disabled = false;
          alert('Google Vision capture failed: ' + (e && e.message ? e.message : String(e)));
        }
      } catch (e) {
        googleBtn.textContent = 'Send to Google Vision';
        googleBtn.disabled = false;
        alert('Google Vision capture failed: ' + (e && e.message ? e.message : String(e)));
      }
    });

    geminiBtn.addEventListener('click', async () => {
      const s = await this.getCaptureSettings();
      const endpoint = s.endpoint;
      const auth = s.authHeader;
      if (!endpoint) return alert('Please configure a Gemini endpoint first (click Endpoint).');
      try {
        geminiBtn.textContent = 'Capturing...';
        geminiBtn.disabled = true;
        let dataUrl = null;
        try {
          dataUrl = await captureBg(10000);
        } catch (bgErr) {
          // fallback to in-page capture via map-analyzer
          try {
            const mod = await import('./map-analyzer.js');
            const headers = {};
            if (auth) headers['Authorization'] = auth;
            const resp = await mod.captureAndSendToGemini(endpoint, headers, 'gemini-1.5');
            geminiBtn.textContent = 'Send to Gemini';
            geminiBtn.disabled = false;
            const msg = typeof resp === 'object' ? JSON.stringify(resp, null, 2) : String(resp);
            alert('Gemini response:\n' + (msg.slice ? msg.slice(0,2000) : msg));
            if (window.resourceTracker && window.resourceTracker.addEventLog) window.resourceTracker.addEventLog('[GEMINI] ' + (typeof resp === 'object' ? JSON.stringify(resp) : String(resp)));
            return;
          } catch (fallbackErr) {
            geminiBtn.textContent = 'Send to Gemini';
            geminiBtn.disabled = false;
            alert('Gemini capture failed: ' + (fallbackErr && fallbackErr.message ? fallbackErr.message : String(fallbackErr)));
            return;
          }
        }

        // Send captured image to configured endpoint via background proxy
        try {
          const baseHeaders = Object.assign({ 'Content-Type': 'application/json' }, (auth ? { 'Authorization': auth } : {}));
          const base64 = dataUrl.split(',')[1];
          const body = JSON.stringify({ image: base64, model: 'gemini-1.5' });
          const resp = await sendRequestBg(endpoint, { method: 'POST', headers: baseHeaders, body }, { timeoutMs: 30000, retries: 2 });
          geminiBtn.textContent = 'Send to Gemini';
          geminiBtn.disabled = false;
          if (!resp) return alert('No response from background proxy');
          if (resp.error) return alert('Gemini request failed: ' + resp.error);
          const display = resp.json || resp.text || { status: resp.status };
          alert('Gemini response:\n' + (typeof display === 'object' ? JSON.stringify(display, null, 2).slice(0,2000) : String(display)));
          if (window.resourceTracker && window.resourceTracker.addEventLog) window.resourceTracker.addEventLog('[GEMINI] ' + (typeof display === 'object' ? JSON.stringify(display) : String(display)));
        } catch (e) {
          geminiBtn.textContent = 'Send to Gemini';
          geminiBtn.disabled = false;
          alert('Gemini request failed: ' + (e && e.message ? e.message : String(e)));
        }
      } catch (e) {
        geminiBtn.textContent = 'Send to Gemini';
        geminiBtn.disabled = false;
        alert('Gemini capture failed: ' + (e && e.message ? e.message : String(e)));
      }
    });

    // Native tab capture via background (more reliable on sites that block getDisplayMedia)
    const nativeBtn = document.createElement('button');
    nativeBtn.textContent = 'Capture Tab (native)';
    nativeBtn.style.padding = '6px 10px';
    nativeBtn.style.background = '#6a1b9a';
    nativeBtn.style.color = '#fff';
    nativeBtn.style.border = 'none';
    nativeBtn.style.borderRadius = '6px';
    nativeBtn.style.cursor = 'pointer';
    captureControl.appendChild(nativeBtn);

    // Debug ping button to verify background messaging and keep service worker alive
    const pingBtn = document.createElement('button');
    pingBtn.textContent = 'Ping BG';
    pingBtn.style.padding = '6px 10px';
    pingBtn.style.background = '#444';
    pingBtn.style.color = '#fff';
    pingBtn.style.border = 'none';
    pingBtn.style.borderRadius = '6px';
    pingBtn.style.cursor = 'pointer';
    pingBtn.title = 'Send a ping to the background service worker (debug)';
    captureControl.appendChild(pingBtn);

    pingBtn.addEventListener('click', async () => {
      pingBtn.textContent = 'Pinging...';
      pingBtn.disabled = true;
      try {
        const resp = await new Promise((resolve) => {
          try { chrome.runtime.sendMessage({ type: 'ping' }, (r) => { if (chrome.runtime.lastError) return resolve({ error: chrome.runtime.lastError.message }); resolve(r); }); }
          catch (e) { resolve({ error: e && e.message ? e.message : String(e) }); }
        });
        pingBtn.textContent = 'Ping BG';
        pingBtn.disabled = false;
        if (!resp) return alert('No response from background');
        if (resp.error) return alert('Ping failed: ' + resp.error);
        alert('Ping OK — ts: ' + (resp.ts || 'n/a'));
      } catch (e) {
        pingBtn.textContent = 'Ping BG';
        pingBtn.disabled = false;
        alert('Ping failed: ' + (e && e.message ? e.message : String(e)));
      }
    });

    nativeBtn.addEventListener('click', async () => {
      const s = await this.getCaptureSettings();
      const endpoint = s.endpoint;
      const auth = s.authHeader;
      if (!endpoint) {
        alert('Please configure a vision endpoint first (click Endpoint).');
        return;
      }
      try {
        nativeBtn.textContent = 'Capturing...';
        nativeBtn.disabled = true;
        // Ask background to capture the visible tab (with timeout)
        const bgCapturePromise = new Promise((resolve, reject) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error('Background capture timed out'));
          }, 10000);
          try {
            chrome.runtime.sendMessage({ type: 'capture_tab' }, (resp) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              if (!resp) return reject(new Error('No response from background'));
              if (resp.error) return reject(new Error(resp.error));
              resolve(resp.dataUrl);
            });
          } catch (e) { if (!settled) reject(e); }
        });

        try {
          const dataUrl = await bgCapturePromise;
          nativeBtn.textContent = 'Capture Tab (native)';
          nativeBtn.disabled = false;

            // Send captured image to configured endpoint via background to avoid CORS
            const headers = Object.assign({ 'Content-Type': 'application/json' }, (auth ? { 'Authorization': auth } : {}));
            const body = JSON.stringify({ image: dataUrl });
            const resp = await sendRequestBg(endpoint, { method: 'POST', headers, body }, { timeoutMs: 20000, retries: 2 });

            if (!resp) {
              alert('Failed to send captured image: no response from background proxy');
            } else if (resp.error) {
              alert('Failed to send captured image: ' + resp.error);
            } else {
              const display = resp.json || resp.text || { status: resp.status };
              alert('Vision response:\n' + (typeof display === 'object' ? JSON.stringify(display, null, 2).slice(0,2000) : String(display)));
              if (window.resourceTracker && window.resourceTracker.addEventLog) window.resourceTracker.addEventLog('[NATIVE_CAPTURE] ' + (typeof display === 'object' ? JSON.stringify(display) : String(display)));
            }
        } catch (e) {
          nativeBtn.textContent = 'Capture Tab (native)';
          nativeBtn.disabled = false;
          alert('Background capture failed: ' + (e && e.message ? e.message : String(e)));
        }
      } catch (e) {
        nativeBtn.textContent = 'Capture Tab (native)';
        nativeBtn.disabled = false;
        alert('Native capture failed: ' + (e && e.message ? e.message : String(e)));
      }
    });

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

      // Show a compact strategic recommendation under the player's row if intelMode is enabled
      try {
        if (strategicIntel && this.intelMode) {
          const rec = strategicIntel.getTopRecommendation(player);
          if (rec) {
            const recRow = document.createElement('div');
            recRow.style.fontSize = '12px';
            recRow.style.color = '#ccc';
            recRow.style.margin = '4px 0 8px 0';
            recRow.textContent = `Intel: ${rec.recommendation} (Progress: ${rec.progress}%)`;
            this.overlayRoot.appendChild(recRow);
          }
        }
      } catch (e) {}
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

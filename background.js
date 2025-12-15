// Background service worker to capture the visible tab and return data URL
// Utility helpers
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

// Use Promise.race for timeout but don't abort the underlying fetch to avoid
// "signal is aborted without reason" errors observed in some Chrome SW lifecycle cases.
async function fetchWithTimeout(resource, options = {}, timeout = 15000) {
  const fetchPromise = fetch(resource, options);
  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('fetch timeout')), timeout));
  return await Promise.race([fetchPromise, timeoutPromise]);
}

async function retryFetch(resource, options = {}, { retries = 2, timeout = 15000, backoff = 500 } = {}) {
  let attempt = 0;
  let lastErr = null;
  while (attempt <= retries) {
    try {
      if (attempt > 0) console.log('[background] retrying fetch', { resource, attempt });
      const resp = await fetchWithTimeout(resource, options, timeout);
      return resp;
    } catch (err) {
      lastErr = err;
      console.warn('[background] fetch attempt failed', { attempt, err: err && err.message ? err.message : String(err) });
      attempt += 1;
      if (attempt <= retries) await wait(backoff * attempt);
    }
  }
  throw lastErr;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (!message) return;
    console.log('[background] received message', message && message.type ? message.type : message);

    // Handle capture_tab: capture the visible tab and respond asynchronously with a timeout guard
    if (message.type === 'capture_tab') {
      let responded = false;
      const timeoutMs = (message && message.timeoutMs) || 8000;
      const done = (payload) => {
        if (responded) return;
        responded = true;
        try { sendResponse(payload); } catch (e) { console.error('[background] sendResponse failed', e); }
      };

      try {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            console.error('[background] captureVisibleTab error', chrome.runtime.lastError.message);
            done({ error: chrome.runtime.lastError.message });
          } else if (!dataUrl) {
            console.error('[background] captureVisibleTab returned no data');
            done({ error: 'No data returned from captureVisibleTab' });
          } else {
            done({ dataUrl });
          }
        });
      } catch (e) {
        console.error('[background] capture_tab exception', e);
        done({ error: e && e.message ? e.message : String(e) });
      }

      // Fallback timeout in case the callback never fires (service worker suspend etc.)
      setTimeout(() => {
        if (!responded) {
          console.error('[background] capture_tab timed out after', timeoutMs);
          done({ error: 'capture_tab timed out' });
        }
      }, timeoutMs + 200);

      return true; // keep channel open for async
    }

    // Handle send_request: perform network request from background to avoid page CORS
    if (message.type === 'send_request') {
      const { url, options, timeoutMs = 15000, retries = 2 } = message;
      (async () => {
        try {
          // Prepare a safe, truncated preview of the request body for debugging
          let bodyPreview = null;
          try {
            if (options && options.body != null) {
              if (typeof options.body === 'string') {
                bodyPreview = options.body.slice(0, 2000);
              } else if (options.body instanceof FormData) {
                // summarize FormData keys
                const keys = [];
                for (const k of options.body.keys()) { keys.push(k); }
                bodyPreview = `FormData keys: ${JSON.stringify(keys)}`;
              } else {
                try { bodyPreview = JSON.stringify(options.body).slice(0, 2000); } catch (e) { bodyPreview = String(options.body).slice(0, 2000); }
              }
            }
          } catch (e) {
            bodyPreview = '<<unable to stringify body>>';
          }

          // Also capture key headers for context
          const hdrPreview = options && options.headers ? (typeof options.headers === 'string' ? options.headers.slice(0, 500) : JSON.stringify(options.headers).slice(0, 500)) : null;

          console.log('[background] send_request', url, options && options.method, { timeoutMs, retries, bodyPreview, hdrPreview });

          const resp = await retryFetch(url, options, { retries, timeout: timeoutMs });
          const text = await resp.text();
          // Truncate long responses when logging to avoid huge console output
          const truncated = typeof text === 'string' ? (text.length > 2000 ? text.slice(0, 2000) + '...[truncated]' : text) : String(text);
          console.log('[background] send_request response', { status: resp.status, ok: resp.ok, text: truncated });
          let json = null;
          try { json = JSON.parse(text); } catch (e) { json = null; }
          sendResponse({ status: resp.status, ok: resp.ok, json: json, text: text });
        } catch (err) {
          console.error('[background] send_request error', err && err.message ? err.message : err);
          sendResponse({ error: err && err.message ? err.message : String(err) });
        }
      })();
      return true; // indicate async response
    }

    // Respond to simple ping checks from UI for debugging
    if (message.type === 'ping') {
      try {
        sendResponse({ ok: true, ts: Date.now() });
      } catch (e) {
        console.error('[background] ping sendResponse failed', e);
      }
      return false;
    }
  } catch (outer) {
    console.error('[background] onMessage outer error', outer);
  }
});

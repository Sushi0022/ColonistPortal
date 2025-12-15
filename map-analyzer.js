// Map Analyzer: capture screen and send image to a configured vision endpoint
export async function captureAndSendToEndpoint(endpointUrl, extraHeaders = {}) {
  if (!endpointUrl) throw new Error('No endpoint URL provided');
  // Helper to POST via background service worker (avoids CORS) if available
  const sendRequestViaBackground = async (url, options, { timeoutMs = 15000, retries = 2 } = {}) => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      return await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: 'send_request', url, options, timeoutMs, retries }, (resp) => {
            // Check for runtime.lastError which indicates messaging problems
            if (chrome.runtime.lastError) {
              return resolve({ error: chrome.runtime.lastError.message });
            }
            resolve(resp);
          });
        } catch (e) { resolve({ error: e && e.message ? e.message : String(e) }); }
      });
    }
    // Fallback to fetch
    try {
      const resp = await fetch(url, options);
      const text = await resp.text();
      let json = null;
      try { json = JSON.parse(text); } catch (e) { json = null; }
      return { status: resp.status, ok: resp.ok, json: json, text: text };
    } catch (e) {
      return { error: e && e.message ? e.message : String(e) };
    }
  };
  // Try to use background/native capture first to avoid triggering page getDisplayMedia logic
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      const dataUrl = await new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage({ type: 'capture_tab' }, (resp) => {
            if (!resp) return reject(new Error('No response from background'));
            if (resp.error) return reject(new Error(resp.error));
            return resolve(resp.dataUrl);
          });
        } catch (e) { reject(e); }
      }).catch(() => null);
      if (dataUrl) {
        // Format for Google Vision if endpoint matches the annotate path
        let reqBody;
        if (endpointUrl.includes('vision.googleapis.com/v1/images:annotate')) {
          const base64 = (dataUrl || '').split(',')[1] || dataUrl;
          reqBody = JSON.stringify({ requests: [{ image: { content: base64 }, features: [{ type: 'TEXT_DETECTION', maxResults: 10 }, { type: 'LABEL_DETECTION', maxResults: 20 }] }] });
        } else {
          reqBody = JSON.stringify({ image: dataUrl });
        }
        const resp = await sendRequestViaBackground(endpointUrl, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {}), body: reqBody }, { timeoutMs: 20000, retries: 2 });
        if (!resp) return { error: 'no response from background proxy' };
        if (resp.error) return { error: resp.error };
        return resp.json || resp.text || { status: resp.status };
      }
    }

  } catch (bgErr) {
    // If background capture fails, we'll fall back to in-page capture below
  }

  // Request screen capture from the user (prompts to share a tab/window)
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  } catch (err) {
    // If screen capture is blocked or site triggers errors, fall back to file upload
    try {
      const fileDataUrl = await new Promise((resolve, reject) => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.addEventListener('change', () => {
          const f = inp.files && inp.files[0];
          if (!f) { document.body.removeChild(inp); return reject(new Error('No file selected')); }
          const r = new FileReader();
          r.onload = () => { document.body.removeChild(inp); resolve(r.result); };
          r.onerror = (e) => { document.body.removeChild(inp); reject(e); };
          r.readAsDataURL(f);
        }, { once: true });
        inp.click();
      });
      // Send the selected image to endpoint; format for Vision annotate if applicable
      let reqBody;
      if (endpointUrl.includes('vision.googleapis.com/v1/images:annotate')) {
        const base64 = (fileDataUrl || '').split(',')[1] || fileDataUrl;
        reqBody = JSON.stringify({ requests: [{ image: { content: base64 }, features: [{ type: 'TEXT_DETECTION', maxResults: 10 }, { type: 'LABEL_DETECTION', maxResults: 20 }] }] });
      } else {
        reqBody = JSON.stringify({ image: fileDataUrl });
      }
      const resp = await sendRequestViaBackground(endpointUrl, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {}), body: reqBody });
      if (!resp) return { error: 'no response from background proxy' };
      if (resp.error) return { error: resp.error };
      return resp.json || resp.text || { status: resp.status };
    } catch (e) {
      throw new Error('Screen capture failed and file-upload fallback failed: ' + (e && e.message ? e.message : String(e)));
    }
  }
  try {
    const track = stream.getVideoTracks()[0];
    const imageCapture = new ImageCapture ? new ImageCapture(track) : null;

    // Create video element to grab a frame as fallback when ImageCapture not available
    let bitmap = null;
    if (imageCapture && imageCapture.grabFrame) {
      try { bitmap = await imageCapture.grabFrame(); } catch (e) { bitmap = null; }
    }

    if (!bitmap) {
      const video = document.createElement('video');
      video.srcObject = new MediaStream([track]);
      video.muted = true;
      await video.play().catch(()=>{});
      // wait a tick for first frame
      await new Promise((res) => setTimeout(res, 100));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      // Stop tracks
      try { track.stop(); } catch (e) {}
      try { video.pause(); video.srcObject = null; } catch (e) {}

      // Send to endpoint (format for Vision annotate if endpoint matches)
      let reqBody;
      if (endpointUrl.includes('vision.googleapis.com/v1/images:annotate')) {
        const base64 = (dataUrl || '').split(',')[1] || dataUrl;
        reqBody = JSON.stringify({ requests: [{ image: { content: base64 }, features: [{ type: 'TEXT_DETECTION', maxResults: 10 }, { type: 'LABEL_DETECTION', maxResults: 20 }] }] });
      } else {
        reqBody = JSON.stringify({ image: dataUrl });
      }
      const resp = await sendRequestViaBackground(endpointUrl, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {}), body: reqBody }, { timeoutMs: 20000, retries: 2 });
      if (!resp) return { error: 'no response from background proxy' };
      if (resp.error) return { error: resp.error };
      return resp.json || resp.text || { status: resp.status };
    } else {
      // If we have an ImageBitmap, draw to canvas
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      try { stream.getTracks().forEach(t => t.stop()); } catch(e){}
      const dataUrl = canvas.toDataURL('image/png');
      let reqBody;
      if (endpointUrl.includes('vision.googleapis.com/v1/images:annotate')) {
        const base64 = (dataUrl || '').split(',')[1] || dataUrl;
        reqBody = JSON.stringify({ requests: [{ image: { content: base64 }, features: [{ type: 'TEXT_DETECTION', maxResults: 10 }, { type: 'LABEL_DETECTION', maxResults: 20 }] }] });
      } else {
        reqBody = JSON.stringify({ image: dataUrl });
      }
      const resp = await sendRequestViaBackground(endpointUrl, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {}), body: reqBody }, { timeoutMs: 20000, retries: 2 });
      if (!resp) return { error: 'no response from background proxy' };
      if (resp.error) return { error: resp.error };
      return resp.json || resp.text || { status: resp.status };
    }
  } finally {
    try { if (stream && stream.getTracks) stream.getTracks().forEach(t => t.stop()); } catch (e) {}
  }
}

// Helper: convert dataURL to Blob
export function dataURLToBlob(dataURL) {
  const parts = dataURL.split(',');
  const meta = parts[0].match(/data:(.*);base64/);
  const mime = meta ? meta[1] : 'image/png';
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8 = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  return new Blob([u8], { type: mime });
}

// Capture a frame and send to Google Vision API (suitable for Gemini Vision workflows)
export async function captureAndSendToGoogleVision(apiKey) {
  if (!apiKey) throw new Error('Google Vision API key required');
  // Try background/native capture first to avoid invoking getDisplayMedia
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      const dataUrl = await new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage({ type: 'capture_tab' }, (resp) => {
            if (!resp) return reject(new Error('No response from background'));
            if (resp.error) return reject(new Error(resp.error));
            return resolve(resp.dataUrl);
          });
        } catch (e) { reject(e); }
      }).catch(() => null);
      if (dataUrl) {
        const base64 = dataUrl.split(',')[1];
        const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
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
          const resp = await sendRequestViaBackground(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          return resp.json || resp.text || { status: resp.status };
      }
    }
  } catch (bgErr) {
    // continue to fall back to in-page capture / file upload
  }

  // Try screen capture first; if it fails, prompt file upload and use that image
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  } catch (err) {
    // Fallback to file upload
    const fileDataUrl = await new Promise((resolve, reject) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0];
        if (!f) { document.body.removeChild(inp); return reject(new Error('No file selected')); }
        const r = new FileReader();
        r.onload = () => { document.body.removeChild(inp); resolve(r.result); };
        r.onerror = (e) => { document.body.removeChild(inp); reject(e); };
        r.readAsDataURL(f);
      }, { once: true });
      inp.click();
    });
    const base64 = fileDataUrl.split(',')[1];
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
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
    const resp = await sendRequestViaBackground(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return resp.json || resp.text || { status: resp.status };
  }

  try {
    const track = stream.getVideoTracks()[0];
    const video = document.createElement('video');
    video.srcObject = new MediaStream([track]);
    video.muted = true;
    await video.play().catch(()=>{});
    await new Promise((res) => setTimeout(res, 120));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try { track.stop(); } catch(e){}
    try { video.pause(); video.srcObject = null; } catch(e){}
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];

    // Build Google Vision request: request TEXT_DETECTION and OBJECT_LOCALIZATION
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
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

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await resp.json().catch(()=>({ status: resp.status }));
    return json;
  } finally {
    try { if (stream && stream.getTracks) stream.getTracks().forEach(t => t.stop()); } catch (e) {}
  }
}

// Capture and send image to a Gemini-compatible endpoint (proxy recommended)
export async function captureAndSendToGemini(endpointUrl, extraHeaders = {}, model = 'gemini-1.5') {
  if (!endpointUrl) throw new Error('No endpoint URL provided');

  // reuse sendRequestViaBackground defined earlier in this module
  const sendRequestViaBackground = async (url, options, opts = {}) => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      return await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: 'send_request', url, options, timeoutMs: opts.timeoutMs || 15000, retries: opts.retries || 2 }, (resp) => {
            if (chrome.runtime.lastError) return resolve({ error: chrome.runtime.lastError.message });
            resolve(resp);
          });
        } catch (e) { resolve({ error: e && e.message ? e.message : String(e) }); }
      });
    }
    try {
      const resp = await fetch(url, options);
      const text = await resp.text();
      let json = null;
      try { json = JSON.parse(text); } catch (e) { json = null; }
      return { status: resp.status, ok: resp.ok, json: json, text: text };
    } catch (e) {
      return { error: e && e.message ? e.message : String(e) };
    }
  };

  // Try background/native capture first
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      const dataUrl = await new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage({ type: 'capture_tab' }, (resp) => {
            if (!resp) return reject(new Error('No response from background'));
            if (resp.error) return reject(new Error(resp.error));
            return resolve(resp.dataUrl);
          });
        } catch (e) { reject(e); }
      }).catch(() => null);
      if (dataUrl) {
        const base64 = dataUrl.split(',')[1];
        const body = JSON.stringify({ image: base64, model });
        const resp = await sendRequestViaBackground(endpointUrl, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {}), body }, { timeoutMs: 20000, retries: 2 });
        if (!resp) return { error: 'no response from background proxy' };
        if (resp.error) return { error: resp.error };
        return resp.json || resp.text || { status: resp.status };
      }
    }
  } catch (bgErr) {
    // fall through to in-page capture
  }

  // Fallback to getDisplayMedia/file upload flows (reuse existing patterns)
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  } catch (err) {
    // file upload fallback
    try {
      const fileDataUrl = await new Promise((resolve, reject) => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.addEventListener('change', () => {
          const f = inp.files && inp.files[0];
          if (!f) { document.body.removeChild(inp); return reject(new Error('No file selected')); }
          const r = new FileReader();
          r.onload = () => { document.body.removeChild(inp); resolve(r.result); };
          r.onerror = (e) => { document.body.removeChild(inp); reject(e); };
          r.readAsDataURL(f);
        }, { once: true });
        inp.click();
      });
      const base64 = fileDataUrl.split(',')[1];
      const body = JSON.stringify({ image: base64, model });
      const resp = await sendRequestViaBackground(endpointUrl, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {}), body }, { timeoutMs: 20000, retries: 2 });
      if (!resp) return { error: 'no response from background proxy' };
      if (resp.error) return { error: resp.error };
      return resp.json || resp.text || { status: resp.status };
    } catch (e) {
      throw new Error('Screen capture failed and file-upload fallback failed: ' + (e && e.message ? e.message : String(e)));
    }
  }

  try {
    const track = stream.getVideoTracks()[0];
    const video = document.createElement('video');
    video.srcObject = new MediaStream([track]);
    video.muted = true;
    await video.play().catch(()=>{});
    await new Promise((res) => setTimeout(res, 120));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try { track.stop(); } catch(e){}
    try { video.pause(); video.srcObject = null; } catch(e){}
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];
    const body = JSON.stringify({ image: base64, model });
    const resp = await sendRequestViaBackground(endpointUrl, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {}), body }, { timeoutMs: 20000, retries: 2 });
    if (!resp) return { error: 'no response from background proxy' };
    if (resp.error) return { error: resp.error };
    return resp.json || resp.text || { status: resp.status };
  } finally {
    try { if (stream && stream.getTracks) stream.getTracks().forEach(t => t.stop()); } catch (e) {}
  }
}

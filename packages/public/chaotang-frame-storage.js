(function () {
  "use strict";
  const parentOrigin = window.location.origin;
  const bridgeNonce = new URLSearchParams(window.location.search).get(
    "bridgeNonce",
  );
  // A later navigation keeps the iframe WindowProxy but loses this document's
  // nonce. Never bootstrap it back to an arbitrary newly loaded document.
  let returnFocusTarget = null;
  window.CHAOTANG_PARENT = {
    postMessage(message, targetOrigin) {
      if (message?.type === "chaotang:action") {
        returnFocusTarget = document.activeElement;
      }
      window.parent.postMessage({ ...message, bridgeNonce }, targetOrigin);
    },
  };
  let nativeStorage;
  try {
    nativeStorage = window.localStorage;
  } catch {
    /* Opaque sandbox. */
  }
  const values = Object.create(null);
  const pending = new Map();
  const revisions = new Map();
  let available = Boolean(nativeStorage);
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let readyTimer;
  function failure() {
    window.dispatchEvent(new CustomEvent("chaotang:preference-save-failed"));
  }
  function write(key, value) {
    if (nativeStorage) {
      try {
        if (value === null) nativeStorage.removeItem(key);
        else nativeStorage.setItem(key, value);
        return Promise.resolve(true);
      } catch {
        failure();
        return Promise.resolve(false);
      }
    }
    if (!available || pending.size >= 32) {
      failure();
      return Promise.resolve(false);
    }
    const requestId = crypto.randomUUID();
    const revision = (revisions.get(key) || 0) + 1;
    revisions.set(key, revision);
    // Mirror for immediate reads; durable success is reported only on host ACK.
    const previous = values[key];
    if (value === null) delete values[key];
    else values[key] = value;
    return new Promise((resolve) => {
      const finish = (ok) => {
        const request = pending.get(requestId);
        if (!request) return;
        clearTimeout(request.timer);
        pending.delete(requestId);
        if (!ok) {
          if (
            revisions.get(key) === revision &&
            ((value === null && values[key] === undefined) ||
              values[key] === value)
          ) {
            if (previous === undefined) delete values[key];
            else values[key] = previous;
          }
          failure();
        }
        resolve(ok);
      };
      pending.set(requestId, {
        finish,
        timer: setTimeout(() => finish(false), 5000),
      });
      window.CHAOTANG_PARENT.postMessage(
        { type: "chaotang:demo-storage-write", key, value, requestId },
        parentOrigin,
      );
    });
  }
  window.addEventListener("message", (event) => {
    if (
      event.source !== window.parent ||
      event.origin !== parentOrigin ||
      !event.data
    )
      return;
    if (event.data.type === "chaotang:restore-focus") {
      const target = returnFocusTarget;
      returnFocusTarget = null;
      if (target?.isConnected && typeof target.focus === "function")
        target.focus();
      return;
    }
    if (event.data.type === "chaotang:demo-storage" && !nativeStorage) {
      const snapshot = event.data.values;
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
        return;
      for (const [key, value] of Object.entries(snapshot)) {
        if (typeof value === "string") values[key] = value;
      }
      available = event.data.available === true;
      clearTimeout(readyTimer);
      resolveReady(available);
    } else if (event.data.type === "chaotang:demo-storage-saved") {
      pending.get(event.data.requestId)?.finish(event.data.ok === true);
    }
  });
  window.CHAOTANG_DEMO_STORAGE = {
    ready,
    getItem(key) {
      return nativeStorage ? nativeStorage.getItem(key) : (values[key] ?? null);
    },
    setItem: write,
    removeItem(key) {
      return write(key, null);
    },
  };
  // The return channel belongs to this document, not the reusable iframe window.
  const channel = new MessageChannel();
  channel.port1.onmessage = (event) => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: event.data,
        origin: parentOrigin,
        source: window.parent,
      }),
    );
  };
  channel.port1.start();
  window.addEventListener(
    "pagehide",
    () => {
      channel.port1.postMessage({ type: "chaotang:bridge-closed" });
      channel.port1.close();
    },
    { once: true },
  );
  window.parent.postMessage(
    { type: "chaotang:bridge-ready", bridgeNonce },
    parentOrigin,
    [channel.port2],
  );
  if (nativeStorage) resolveReady(true);
  else {
    // An unavailable host must not leave a permanently blank court page.
    readyTimer = setTimeout(() => {
      resolveReady(false);
    }, 5000);
  }
})();

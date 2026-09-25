(function () {
  "use strict";

  const pageRoutes = {
    A01: "/today",
    A03: "/workspaces",
    B02: "/wealth",
    C02: "/forecast",
    C03: "/learning",
    E04: "/life",
  };

  // The approved UI runs inside a same-origin iframe. Native drag-region CSS
  // does not cross that iframe boundary, so explicitly ask the desktop host to
  // start a native drag from the dedicated, non-interactive title-bar surface.
  const dragSurface = document.querySelector("[data-window-drag-surface]");
  if (dragSurface) {
    dragSurface.addEventListener("mousedown", function (event) {
      if (event.button !== 0) return;
      event.preventDefault();
      window.parent.postMessage(
        { type: "chaotang:window-drag", doubleClick: event.detail >= 2 },
        window.location.origin
      );
    });
  }

  function selectPage(page) {
    const button = document.querySelector('[data-page="' + page + '"]');
    if (button) button.click();
  }

  function showLiveMessage(title, body, tone) {
    let panel = document.getElementById("chaotangLiveReply");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "chaotangLiveReply";
      panel.className = "live-reply";
      panel.innerHTML = '<div class="live-reply-head"><span></span><button type="button" aria-label="关闭真实回复">×</button></div><div class="live-reply-body"></div>';
      document.getElementById("app").appendChild(panel);
      panel.querySelector("button").addEventListener("click", function () { panel.hidden = true; });
    }
    panel.hidden = false;
    panel.dataset.tone = tone || "normal";
    panel.querySelector(".live-reply-head span").textContent = title;
    panel.querySelector(".live-reply-body").textContent = body;
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) return;
    if (event.data && event.data.type === "chaotang:route") {
      selectPage(event.data.page || "A01");
    }
    if (event.data && event.data.type === "chaotang:status") {
      const badge = document.querySelector(".truth-badge");
      if (badge) {
        badge.textContent = event.data.connected ? "LIVE · 客户端已连接" : "OFFLINE · 服务未连接";
        badge.classList.toggle("is-live", Boolean(event.data.connected));
      }
      const avatar = document.querySelector(".avatar");
      if (avatar && event.data.authenticated) {
        avatar.textContent = (event.data.username || "君").slice(0, 1);
        avatar.title = "已登录 · " + event.data.username;
      }
      const truth = document.querySelector(".capability-truth");
      if (truth) truth.textContent = event.data.connected ? "已连接朝堂客户端服务 · 外部动作仍需授权" : "服务未连接 · 不会触发外部动作";
    }
    if (event.data && event.data.type === "chaotang:consulting") {
      showLiveMessage("丞相正在研判", "正在调用已配置的模型服务，请稍候……", "loading");
    }
    if (event.data && event.data.type === "chaotang:reply") {
      showLiveMessage((event.data.consultant || "丞相") + " · 真实回复", event.data.reply || "未返回内容", "success");
    }
    if (event.data && event.data.type === "chaotang:error") {
      showLiveMessage("调用未完成", event.data.message || "请检查模型服务配置。", "error");
    }
  });

  document.addEventListener("click", function (event) {
    const pageButton = event.target.closest("[data-page]");
    const page = pageButton && pageButton.dataset.page;
    if (page && pageRoutes[page]) {
      window.parent.postMessage(
        { type: "chaotang:navigate", route: pageRoutes[page] },
        window.location.origin
      );
    }
    const actionButton = event.target.closest("[data-open]");
    const action = actionButton && actionButton.dataset.open;
    const actionMap = { account: "account", models: "models", skills: "skills", plugins: "mcp", capabilityHub: "skills" };
    if (actionMap[action]) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.parent.postMessage({ type: "chaotang:action", action: actionMap[action] }, window.location.origin);
    }
  }, true);

  const send = document.getElementById("sendButton");
  const input = document.getElementById("promptInput");
  if (send && input) {
    send.addEventListener("click", function (event) {
      const value = input.value.trim();
      if (!value) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      sessionStorage.setItem("chaotang.pending-intent", value);
      window.parent.postMessage(
        { type: "chaotang:consult", prompt: value },
        window.location.origin
      );
      input.value = "";
      send.disabled = true;
    }, true);
  }
})();

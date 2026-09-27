(function () {
  "use strict";

  let responseTimer = null;
  let draftTimer = null;
  const records = {};
  let activePage = "A01";
  let pendingPage = null;
  let accountName = null;
  let ready = false;
  let selected = {};
  let sessions = {};
  let saving = null;
  let requestId = null;
  const post = (message) =>
    window.parent.postMessage(message, window.location.origin);
  function key() {
    if (!selected[activePage]) {
      selected[activePage] = crypto.randomUUID();
      sessions[selected[activePage]] = {
        page: activePage,
        title: "新对话",
        updated: Date.now(),
        draft: "",
      };
    }
    return selected[activePage];
  }
  function save(requestId) {
    if (ready)
      post({
        type: "chaotang:store-save",
        body: JSON.stringify({ records, selected, sessions }),
        requestId,
      });
  }
  function feedback(text) {
    let status = document.getElementById("chatSaveStatus");
    if (!status) {
      status = document.createElement("p");
      status.id = "chatSaveStatus";
      document.getElementById("chaotangLiveReply")?.append(status);
    }
    status.textContent = text;
  }
  function listSessions() {
    renderHistory();
    const thread = document.querySelector(
      "#chaotangLiveReply .live-reply-thread",
    );
    thread.replaceChildren();
    Object.entries(sessions)
      .filter(([, s]) => s.page === activePage)
      .sort((a, b) => b[1].updated - a[1].updated)
      .forEach(([id, s]) => {
        const button = document.createElement("button");
        button.textContent =
          s.title + " · " + new Date(s.updated).toLocaleString();
        button.dataset.chatSession = id;
        thread.append(button);
      });
  }
  function renderHistory() {
    const previous = document.querySelector(
      "#chaotangLiveReply .live-reply-thread",
    );
    const scroll = previous?.scrollTop || 0;
    const follow =
      !previous || previous.scrollHeight - previous.clientHeight - scroll < 60;
    const entries = records[key()] || [];
    showLiveMessage(
      "对话记录 · " + sessions[key()].title,
      entries.length ? "" : "本会话还没有对话记录。",
      "normal",
    );
    const thread = document.querySelector(
      "#chaotangLiveReply .live-reply-thread",
    );
    if (!entries.length) return;
    thread.replaceChildren();
    entries.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "live-reply-answer";
      const label = document.createElement("small");
      label.textContent = entry.role === "user" ? "你" : "丞相";
      const body = document.createElement("div");
      body.className = "live-reply-body";
      body.textContent =
        entry.content +
        (entry.status === "sending"
          ? "\n正在研判…"
          : entry.status === "failed"
            ? "\n发送未完成，可重试。"
            : "");
      if (entry.status === "failed") {
        const retry = document.createElement("button");
        retry.textContent = "重试";
        retry.dataset.chatRetry = String(entries.indexOf(entry));
        body.append(retry);
      }
      row.append(label, body);
      thread.append(row);
    });
    thread.scrollTop = follow ? thread.scrollHeight : scroll;
  }

  function clearResponseTimer() {
    if (responseTimer !== null) {
      window.clearTimeout(responseTimer);
      responseTimer = null;
    }
  }

  function restorePendingPrompt() {
    const input = document.getElementById("promptInput");
    const send = document.getElementById("sendButton");
    const pending = sessionStorage.getItem("chaotang.pending-intent") || "";
    if (input && !input.value.trim()) input.value = pending;
    if (send) send.disabled = !input?.value.trim();
  }

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
      if (
        event.target.closest(
          "button, a, input, textarea, select, [role='button'], [role='menuitem']",
        )
      )
        return;
      event.preventDefault();
      window.parent.postMessage(
        { type: "chaotang:window-drag", doubleClick: event.detail >= 2 },
        window.location.origin,
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
      panel.setAttribute("role", "status");
      panel.setAttribute("aria-live", "polite");
      panel.innerHTML =
        '<div class="live-reply-head"><span></span><button type="button" aria-label="关闭真实回复">×</button></div><div class="live-reply-thread"><div class="live-reply-question"><small>你</small><p></p></div><div class="live-reply-answer"><small>朝堂</small><div class="live-reply-body"></div></div></div>';
      document.getElementById("app").appendChild(panel);
      panel.querySelector("button").addEventListener("click", function () {
        panel.hidden = true;
        delete document.getElementById("app").dataset.chatOpen;
      });
      const actions = document.createElement("nav");
      actions.innerHTML =
        '<button type="button" data-chat-list>会话</button><button type="button" data-chat-new>新对话</button>';
      panel.querySelector(".live-reply-head").append(actions);
    }
    panel.hidden = false;
    document.getElementById("app").dataset.chatOpen = "true";
    if (!panel.querySelector(".live-reply-question")) {
      panel.querySelector(".live-reply-thread").innerHTML =
        '<div class="live-reply-question"><small>你</small><p></p></div><div class="live-reply-answer"><small>朝堂</small><div class="live-reply-body"></div></div>';
    }
    panel.dataset.tone = tone || "normal";
    panel.querySelector(".live-reply-head span").textContent = title;
    panel.querySelector(".live-reply-body").textContent = body;
    const pending = sessionStorage.getItem("chaotang.pending-intent") || "";
    const question = panel.querySelector(".live-reply-question");
    question.hidden = !pending;
    question.querySelector("p").textContent = pending;
  }

  window.addEventListener("message", function (event) {
    if (
      event.origin !== window.location.origin ||
      event.source !== window.parent
    )
      return;
    if (event.data && event.data.type === "chaotang:route") {
      selectPage(event.data.page || "A01");
    }
    if (event.data && event.data.type === "chaotang:status") {
      const nextAccount = event.data.authenticated ? event.data.username : null;
      if (nextAccount !== accountName) {
        clearTimeout(draftTimer);
        draftTimer = null;
        const input = document.getElementById("promptInput");
        const send = document.getElementById("sendButton");
        if (input) input.value = "";
        if (send) send.disabled = true;
        Object.keys(records).forEach((key) => delete records[key]);
        document.getElementById("chaotangLiveReply")?.remove();
        accountName = nextAccount;
        sessionStorage.removeItem("chaotang.pending-intent");
        ready = false;
        selected = {};
        sessions = {};
        pendingPage = null;
        saving = null;
        requestId = null;
        clearResponseTimer();
        delete document.getElementById("app").dataset.chatOpen;
        if (accountName) post({ type: "chaotang:store-load" });
      }
      const badge = document.querySelector(".truth-badge");
      if (badge) {
        badge.textContent = event.data.connected
          ? "LIVE · 客户端已连接"
          : "OFFLINE · 服务未连接";
        badge.classList.toggle("is-live", Boolean(event.data.connected));
      }
      const avatar = document.querySelector(".avatar");
      if (avatar && event.data.authenticated) {
        avatar.textContent = (event.data.username || "君").slice(0, 1);
        avatar.title = "已登录 · " + event.data.username;
      } else if (avatar) {
        avatar.textContent = "君";
        avatar.title = "未登录";
      }
      const truth = document.querySelector(".capability-truth");
      if (truth)
        truth.textContent = event.data.connected
          ? "已连接朝堂客户端服务 · 外部动作仍需授权"
          : "服务未连接 · 不会触发外部动作";
    }
    if (
      event.data?.type === "chaotang:store" &&
      event.data.authenticated &&
      accountName
    ) {
      try {
        const stored = event.data.body
          ? JSON.parse(event.data.body)
          : { records: {}, selected: {}, sessions: {} };
        if (!stored.records || !stored.sessions || !stored.selected)
          throw new Error("format");
        Object.assign(records, stored.records);
        selected = stored.selected;
        sessions = stored.sessions;
        ready = true;
        Object.values(records).forEach((rows) =>
          rows.forEach((row) => {
            if (row.status === "sending") row.status = "failed";
          }),
        );
        document.getElementById("promptInput").value =
          sessions[selected[activePage]]?.draft || "";
        const send = document.getElementById("sendButton");
        if (send)
          send.disabled = !document.getElementById("promptInput").value.trim();
        if (records[selected[activePage]]?.length) renderHistory();
      } catch {
        showLiveMessage(
          "读取失败",
          "本地记录无法解析，已停止写入以保护原记录。",
          "error",
        );
      }
    }
    if (event.data?.type === "chaotang:saved") {
      feedback("已保存到本机");
      if (saving && saving.id === event.data.requestId) {
        const job = saving;
        saving = null;
        post({
          type: "chaotang:consult",
          prompt: job.prompt,
          page: job.page,
          messages: job.history,
          requestId: job.id,
        });
      }
    }
    if (event.data?.type === "chaotang:store-error") {
      saving = null;
      if (pendingPage) {
        const last = records[pendingPage]?.at(-1);
        if (last?.role === "user") last.status = "failed";
      }
      pendingPage = null;
      clearResponseTimer();
      renderHistory();
      feedback("本地保存失败：" + event.data.message);
    }
    if (event.data && event.data.type === "chaotang:consulting") {
      renderHistory();
      feedback("正在等待模型回复，旧消息仍可查看。");
    }
    if (event.data && event.data.type === "chaotang:reply") {
      if (event.data.requestId !== requestId) return;
      clearResponseTimer();
      if (!pendingPage) return;
      const page = pendingPage;
      records[page].at(-1).status = "done";
      records[page].push({
        role: "assistant",
        content: event.data.reply || "未返回内容",
        status: "done",
      });
      pendingPage = null;
      save();
      if (page === key()) renderHistory();
      sessionStorage.removeItem("chaotang.pending-intent");
      const sendButton = document.getElementById("sendButton");
      if (sendButton)
        sendButton.disabled = !document
          .getElementById("promptInput")
          ?.value.trim();
    }
    if (event.data && event.data.type === "chaotang:error") {
      if (event.data.requestId !== requestId) return;
      if (pendingPage) {
        const last = records[pendingPage]?.at(-1);
        if (last) last.status = "failed";
      }
      pendingPage = null;
      clearResponseTimer();
      save();
      renderHistory();
      feedback(event.data.message || "调用失败，可重试。");
    }
  });

  document.addEventListener(
    "click",
    function (event) {
      const target = event.target.closest("button");
      if (
        target?.matches(
          "[data-chat-list],[data-chat-new],[data-chat-session],[data-chat-retry]",
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (pendingPage) {
          feedback("请等待当前回复完成。");
          return;
        }
        if (target.hasAttribute("data-chat-list")) listSessions();
        if (target.hasAttribute("data-chat-new") && ready) {
          delete selected[activePage];
          key();
          save();
          renderHistory();
          document.getElementById("promptInput").value = "";
        }
        if (target.dataset.chatSession) {
          selected[activePage] = target.dataset.chatSession;
          save();
          renderHistory();
          document.getElementById("promptInput").value =
            sessions[key()].draft || "";
        }
        if (target.dataset.chatRetry) {
          const rows = records[key()],
            index = Number(target.dataset.chatRetry);
          if (index !== rows.length - 1) {
            feedback("请在新对话中重试较早的问题，避免改变后续上下文。");
            return;
          }
          const row = rows.pop();
          document.getElementById("promptInput").value = row.content;
          const button = document.getElementById("sendButton");
          button.disabled = false;
          button.click();
        }
        return;
      }
      const pageButton = event.target.closest("[data-page]");
      const page = pageButton && pageButton.dataset.page;
      if (page) {
        activePage = page;
        const panel = document.getElementById("chaotangLiveReply");
        if (panel) panel.hidden = true;
        delete document.getElementById("app").dataset.chatOpen;
        if (ready) {
          requestAnimationFrame(() => {
            document.getElementById("promptInput").value =
              sessions[selected[page]]?.draft || "";
          });
          if (records[selected[page]]?.length) renderHistory();
        }
      }
      // A03 is the approved business page, not the legacy coding-workspace router.
      if (page && page !== "A03" && pageRoutes[page]) {
        window.parent.postMessage(
          { type: "chaotang:navigate", route: pageRoutes[page] },
          window.location.origin,
        );
      }
      const actionButton = event.target.closest("[data-open]");
      const action = actionButton && actionButton.dataset.open;
      if (action === "history") {
        event.preventDefault();
        event.stopImmediatePropagation();
        listSessions();
        return;
      }
      const actionMap = {
        account: "account",
        models: "models",
        skills: "skills",
        plugins: "mcp",
        capabilityHub: "skills",
      };
      if (actionMap[action]) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.parent.postMessage(
          { type: "chaotang:action", action: actionMap[action] },
          window.location.origin,
        );
      }
    },
    true,
  );

  const send = document.getElementById("sendButton");
  const input = document.getElementById("promptInput");
  if (send && input) {
    send.addEventListener(
      "click",
      function (event) {
        const value = input.value.trim();
        if (!value) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (pendingPage) return;
        if (!ready) {
          showLiveMessage(
            "请先登录",
            "登录后恢复本机保存的会话，再发送消息。",
            "error",
          );
          post({ type: "chaotang:action", action: "account" });
          return;
        }
        pendingPage = key();
        const rows = records[key()] || (records[key()] = []);
        const history = [];
        for (let i = 0; i < rows.length - 1; i++)
          if (
            rows[i].role === "user" &&
            rows[i].status === "done" &&
            rows[i + 1].role === "assistant"
          ) {
            history.push(
              { role: "user", content: rows[i].content },
              { role: "assistant", content: rows[i + 1].content },
            );
            i++;
          }
        rows.push({ role: "user", content: value, status: "sending" });
        sessions[key()].updated = Date.now();
        sessions[key()].draft = "";
        if (sessions[key()].title === "新对话")
          sessions[key()].title = value.slice(0, 28);
        sessionStorage.setItem("chaotang.pending-intent", value);
        saving = {
          id: crypto.randomUUID(),
          prompt: value,
          page: activePage,
          history,
        };
        requestId = saving.id;
        renderHistory();
        feedback("正在保存消息…");
        save(saving.id);
        input.value = "";
        send.disabled = true;
        clearResponseTimer();
        responseTimer = window.setTimeout(function () {
          if (pendingPage) records[pendingPage].at(-1).status = "failed";
          saving = null;
          save();
          renderHistory();
          feedback("调用超时，原消息已保留，可重试。");
          responseTimer = null;
          pendingPage = null;
        }, 65000);
      },
      true,
    );
    input.addEventListener("input", () => {
      if (!ready) return;
      sessions[key()].draft = input.value;
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => {
        draftTimer = null;
        save();
      }, 400);
    });
  }
})();

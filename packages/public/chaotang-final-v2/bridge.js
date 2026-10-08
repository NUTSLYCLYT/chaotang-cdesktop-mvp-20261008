(function () {
  "use strict";
  let pendingIntentText = "";

  // Set only while a parent-driven route sync programmatically clicks a real
  // navigation button. It suppresses the outbound echo/action for that click so
  // the sync does not loop, while genuine user clicks still dispatch normally.
  let suppressNavigationDispatch = false;

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
    (window.CHAOTANG_PARENT || window.parent).postMessage(
      message,
      window.location.origin,
    );
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
    const pending = pendingIntentText;
    if (input && !input.value.trim()) input.value = pending;
    if (send) send.disabled = !input?.value.trim();
  }

  const pageRoutes = {
    A01: "/today",
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
      (window.CHAOTANG_PARENT || window.parent).postMessage(
        { type: "chaotang:window-drag", doubleClick: event.detail >= 2 },
        window.location.origin,
      );
    });
  }

  function selectPage(page) {
    const button = document.querySelector('button[data-page="' + page + '"]');
    if (!button) return;
    suppressNavigationDispatch = true;
    try {
      button.click();
    } finally {
      suppressNavigationDispatch = false;
    }
  }

  // The single operation surface for the real pages (A02/A03/A06/B02/C01). The
  // child measures its own stage (below the page heading, down to the composer)
  // and reports a strictly finite rectangle over the verified channel. The Host
  // places the real component inside it; the child never reads host state and
  // re-measures only on demand, never per frame, so no measurement loop can
  // start.
  //
  // The Host owns an explicit lease: it requests the surface when it opens a
  // real page and dismisses it on close or switch. While no lease is held the
  // child stays on its own composer even if the user is still on the page, so an
  // ordinary click can never reactivate a surface the Host has released.
  let inlineLease = false;
  let homeCatalogLease = false;
  let inlineActive = null;
  let inlineScheduled = false;

  function measureInlineStage() {
    const stage = document.getElementById("stage");
    if (!stage || typeof stage.getBoundingClientRect !== "function")
      return null;
    const stageRect = stage.getBoundingClientRect();
    if (!stageRect) return null;
    if (
      activePage === "A01" ||
      activePage === "A02" ||
      activePage === "A06" ||
      activePage === "C01" ||
      activePage === "A03" ||
      activePage === "B02" ||
      activePage === "B06" ||
      activePage === "C02" ||
      activePage === "C03"
    ) {
      const display = document.getElementById("centralDisplay");
      const bar = document.querySelector(".display-bar");
      if (!display || !bar) return null;
      const box = display.getBoundingClientRect(),
        head = bar.getBoundingClientRect();
      const left = Math.max(box.left + 1, stageRect.left);
      const right = Math.min(box.right - 1, stageRect.right);
      // A02 preserves its original decree controls at the foot of the paper.
      // Other offices keep a header at the top. Never cover either control bar.
      const controlsAtFoot = head.top > box.top + box.height / 2;
      const top = Math.max(controlsAtFoot ? box.top + 1 : head.bottom, stageRect.top);
      const bottom = Math.min(controlsAtFoot ? head.top : box.bottom - 1, stageRect.bottom);
      return { left, top, width: right - left, height: bottom - top };
    }
    const heading = document.querySelector(".page-heading");
    const headingRect =
      heading && typeof heading.getBoundingClientRect === "function"
        ? heading.getBoundingClientRect()
        : null;
    const top =
      headingRect &&
      Number.isFinite(headingRect.bottom) &&
      headingRect.bottom > stageRect.top
        ? headingRect.bottom
        : stageRect.top;
    return {
      left: stageRect.left,
      top: top,
      width: stageRect.width,
      height: stageRect.bottom - top,
    };
  }

  function usableInlineRect(rect) {
    return Boolean(
      rect &&
        Number.isFinite(rect.left) &&
        Number.isFinite(rect.top) &&
        Number.isFinite(rect.width) &&
        Number.isFinite(rect.height) &&
        rect.width > 0 &&
        rect.height > 0,
    );
  }

  function childOverlayOpen() {
    for (const id of ["drawer", "atlas", "onboarding"]) {
      const node = document.getElementById(id);
      if (node && node.open === true) return true;
    }
    return false;
  }

  // On screens below the shell's 1180px breakpoint both side panels collapse;
  // expanding one overlays the stage. The real surface must yield instead of
  // covering the panel. Only class changes on the two panels are observed.
  function narrowPanelsExpanded() {
    if (!(window.innerWidth < 1180)) return false;
    for (const side of ["left", "right"]) {
      const panel = document.querySelector("." + side + "-panel");
      if (panel && !panel.classList.contains("is-collapsed")) return true;
    }
    return false;
  }

  function composerHintOriginal(hint) {
    if (hint.dataset.courtInlineOriginal === undefined)
      hint.dataset.courtInlineOriginal = hint.textContent || "";
    return hint.dataset.courtInlineOriginal;
  }

  function applyInlineMode(mode) {
    if (mode === inlineActive) return;
    inlineActive = mode;
    const app = document.getElementById("app");
    if (app) {
      if (mode) app.dataset.courtInline = mode;
      else delete app.dataset.courtInline;
    }
    const input = document.getElementById("promptInput");
    const send = document.getElementById("sendButton");
    const hint = document.getElementById("composerHint");
    if (mode) {
      // active / connecting / suspended all mean the real surface owns this
      // page: the prototype demo controls and the ordinary send must stay inert
      // so there are never two live operation entries at once.
      if (input) input.readOnly = true;
      if (send) send.disabled = true;
      if (hint) {
        composerHintOriginal(hint);
        hint.textContent =
          mode === "suspended"
            ? "真实办理区暂时收起；返回后继续当前任务，此处不再重复发送。"
            : activePage === "A01"
              ? "在上方御屏选择成果；打开案例不会自动下旨或调用模型。"
            : activePage === "C01"
              ? "在上方御屏查看调查与证据；新需求请进入上书房，不会自动发起调查。"
              : activePage === "A06"
                ? "在上方史馆总卷查阅、下载与复盘；复用档案会带入上书房重新拟旨。"
                : activePage === "B02"
                  ? "在上方户部御屏输入数据、生成现金分析与成果；不会执行付款或记账。"
                  : "请在上方真实办理区填写需求、附资料并确认办理；此处不再重复发送。";
      }
      return;
    }
    // The lease was released (dismiss, leave page): restore the original
    // composer and, from the content still in the box, the correct send state.
    if (input) input.readOnly = false;
    if (send) send.disabled = !(input && input.value.trim());
    if (hint && hint.dataset.courtInlineOriginal !== undefined) {
      hint.textContent = hint.dataset.courtInlineOriginal;
      delete hint.dataset.courtInlineOriginal;
    }
  }

  function reportInlineSurface() {
    if (activePage === "A01" && !homeCatalogLease) inlineLease = false;
    if (!inlineLease) {
      applyInlineMode(null);
      return;
    }
    if (
      activePage !== "A01" &&
      activePage !== "A02" &&
      activePage !== "A03" &&
      activePage !== "A06" &&
      activePage !== "B02" &&
      activePage !== "B06" &&
      activePage !== "C01" &&
      activePage !== "C02" &&
      activePage !== "C03"
    ) {
      inlineLease = false;
      applyInlineMode(null);
      return;
    }
    if (
      childOverlayOpen() ||
      narrowPanelsExpanded() ||
      ((activePage === "A01" ||
        activePage === "A02" ||
        activePage === "A06" ||
        activePage === "C01" ||
        activePage === "A03" ||
        activePage === "B02" ||
        activePage === "B06" ||
        activePage === "C02" ||
        activePage === "C03") &&
        document.getElementById("app")?.dataset.scroll === "seal")
    ) {
      applyInlineMode("suspended");
      post({
        type: "chaotang:inline-surface",
        page: activePage,
        suspended: true,
        rect: null,
      });
      return;
    }
    // A transformed narrow side panel can make the browser scroll the otherwise
    // fixed shell while moving keyboard focus back to its collapse button.
    // The shell has no intentional document scrolling, so restore the viewport
    // before measuring. Otherwise a valid stage can report a negative left edge
    // and the Host must correctly reject it, leaving the real surface connecting.
    const appRoot = document.getElementById("app");
    if (appRoot && (appRoot.scrollLeft || appRoot.scrollTop)) {
      appRoot.scrollLeft = 0;
      appRoot.scrollTop = 0;
    }
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    const rect = measureInlineStage();
    if (!usableInlineRect(rect)) {
      // The Host is honest about connecting; the prototype controls stay inert
      // until the real rectangle is accepted, so no demo action can run.
      applyInlineMode("connecting");
      post({
        type: "chaotang:inline-surface",
        page: activePage,
        suspended: false,
        rect: null,
      });
      return;
    }
    applyInlineMode("active");
    post({
      type: "chaotang:inline-surface",
      page: activePage,
      suspended: false,
      rect: rect,
    });
  }

  function scheduleInlineSurface() {
    if (inlineScheduled) return;
    inlineScheduled = true;
    requestAnimationFrame(function () {
      inlineScheduled = false;
      reportInlineSurface();
    });
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
    const pending = pendingIntentText;
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
    if (event.data && event.data.type === "chaotang:inline-surface-request") {
      homeCatalogLease = event.data.page === "A01";
      inlineLease = true;
      // Open the existing scroll once on entry. Subsequent collapse stays closed.
      if (
        activePage === "A01" ||
      activePage === "A02" ||
        activePage === "A06" ||
        activePage === "C01" ||
        activePage === "A03" ||
        activePage === "B02" ||
        activePage === "B06" ||
        activePage === "C02" ||
        activePage === "C03"
      ) {
        const app = document.getElementById("app");
        if (app && (activePage === "A01" || app.dataset.scroll === "seal")) app.dataset.scroll = "full";
      }
      scheduleInlineSurface();
    }
    if (event.data && event.data.type === "chaotang:inline-surface-dismiss") {
      inlineLease = false;
      homeCatalogLease = false;
      applyInlineMode(null);
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
        pendingIntentText = "";
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
          ? "服务已连接 · 模型状态以回执为准"
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
      const identityName = document.querySelector(".identity-copy b");
      const identityStatus = document.querySelector(".identity-copy small");
      const identityControl = document.querySelector(".identity-control");
      const displayName = event.data.authenticated
        ? event.data.username || "已登录"
        : "未登录";
      const accountTitle = event.data.authenticated
        ? displayName + " · 账户设置"
        : "登录或注册朝堂账户";
      if (identityName) identityName.textContent = displayName;
      if (identityStatus)
        identityStatus.textContent = event.data.authenticated
          ? "已登录朝堂账户"
          : "登录后查看账户";
      if (identityControl) {
        identityControl.title = accountTitle;
        identityControl.setAttribute("aria-label", accountTitle);
      }
      const truth = document.querySelector(".capability-truth");
      if (truth)
        truth.textContent = event.data.connected
          ? "已连接朝堂客户端服务 · 模型与外部动作均以真实回执为准"
          : "服务未连接 · 不会触发外部动作";
      scheduleInlineSurface();
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
      if (inlineLease) {
        // A legacy native-chat storage failure must not take ownership away
        // from the current real business surface or hide its scroll controls.
        const hint = document.getElementById("composerHint");
        if (hint)
          hint.textContent = "历史对话暂不可用；可继续使用御屏内的业务功能。";
      } else {
        renderHistory();
        feedback("本地保存失败：" + event.data.message);
      }
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
      pendingIntentText = "";
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
      const pageButton = event.target.closest("button[data-page]");
      const page = pageButton && pageButton.dataset.page;
      if (page) {
        if (page === "A01" && (activePage !== "A01" || !suppressNavigationDispatch)) homeCatalogLease = false;
        activePage = page;
        // A genuine navigation (or a parent route sync) to a real page opens the
        // real operation surface; the Host confirms with its own request. An
        // explicit dismiss still wins: it clears the lease and ordinary clicks
        // do not restore it.
        if (
          page === "A02" ||
          page === "A03" ||
          page === "A06" ||
          page === "B02" ||
          page === "B06" ||
          page === "C01" ||
          page === "C02" ||
          page === "C03"
        )
          inlineLease = true;
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
      // Open the existing business components inside the original court shell.
      // Navigation itself does not create a job or call a model.
      const businessPages = {
        A02: "study",
        A03: "cases",
        B02: "hubu",
        B06: "gongbu",
        C01: "jinyiwei",
        A06: "shiguan",
        C02: "forecast",
        C03: "learning",
        E04: "life",
      };
      if (page && !suppressNavigationDispatch && businessPages[page]) {
        post({
          type: "chaotang:action",
          action: businessPages[page],
        });
      } else if (page && !suppressNavigationDispatch && pageRoutes[page]) {
        (window.CHAOTANG_PARENT || window.parent).postMessage(
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
        results: "results",
        account: "account",
        models: "models",
        skills: "skills",
        plugins: "mcp",
        capabilityHub: "skills",
      };
      if (actionMap[action]) {
        event.preventDefault();
        event.stopImmediatePropagation();
        (window.CHAOTANG_PARENT || window.parent).postMessage(
          { type: "chaotang:action", action: actionMap[action] },
          window.location.origin,
        );
      }
      scheduleInlineSurface();
    },
    true,
  );

  // Re-measure on real layout changes only: window resize, stage resize and the
  // child's own overlays opening or closing. All paths coalesce through
  // scheduleInlineSurface so there is no per-frame measurement loop.
  window.addEventListener("resize", scheduleInlineSurface);
  // Opening the original scroll animates its transform. ResizeObserver does
  // not observe transform-only movement; measure again at the real endpoint.
  document
    .getElementById("centralDisplay")
    ?.addEventListener("transitionend", scheduleInlineSurface);
  document
    .getElementById("centralDisplay")
    ?.addEventListener("animationend", scheduleInlineSurface);
  document
    .getElementById("stage")
    ?.addEventListener("scroll", scheduleInlineSurface);
  if (typeof MutationObserver === "function") {
    const inlineObserver = new MutationObserver(scheduleInlineSurface);
    const app = document.getElementById("app");
    if (app)
      inlineObserver.observe(app, {
        attributes: true,
        attributeFilter: ["data-scroll"],
      });
    for (const id of ["drawer", "atlas", "onboarding"]) {
      const node = document.getElementById(id);
      if (node)
        inlineObserver.observe(node, {
          attributes: true,
          attributeFilter: ["open", "hidden"],
        });
    }
    // Narrow-screen panels expand/collapse by toggling .is-collapsed only.
    for (const side of ["left", "right"]) {
      const panel = document.querySelector("." + side + "-panel");
      if (panel)
        inlineObserver.observe(panel, {
          attributes: true,
          attributeFilter: ["class"],
        });
    }
  }
  if (typeof ResizeObserver === "function") {
    const stage = document.getElementById("stage");
    if (stage) new ResizeObserver(scheduleInlineSurface).observe(stage);
    const display = document.getElementById("centralDisplay");
    if (display) new ResizeObserver(scheduleInlineSurface).observe(display);
  }

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
        pendingIntentText = value;
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

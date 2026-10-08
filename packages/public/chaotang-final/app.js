(async function () {
  "use strict";
  if (!window.CHAOTANG_DEMO_STORAGE) {
    const notice = document.createElement("p");
    notice.setAttribute("role", "alert");
    notice.textContent = "页面资源未完整加载，请刷新朝堂页面重试。已保存的任务和成果不会被删除。";
    document.body.replaceChildren(notice);
    return;
  }
  const preferencesAvailable = await window.CHAOTANG_DEMO_STORAGE.ready;
  const demoStorage = window.CHAOTANG_DEMO_STORAGE;
  window.addEventListener("chaotang:preference-save-failed", () => showToast("本次偏好未能保存，请稍后重试；真实任务和成果不受影响。"));

  const pages = window.CHAOTANG_PAGES || [];
  const pageMap = new Map(pages.map(page => [page.id, page]));
  const app = document.getElementById("app");
  const scene = document.getElementById("scene");
  const drawer = document.getElementById("drawer");
  const atlas = document.getElementById("atlas");
  const ministriesMenu = document.getElementById("ministriesMenu");
  const promptInput = document.getElementById("promptInput");
  const sendButton = document.getElementById("sendButton");
  const toast = document.getElementById("toast");
  let current = pageMap.get("A01");
  let discussionState = "default";
  let selectedStrategy = "";
  let currentTopicInput = "";
  let understandingVersion = 1;
  let petitionDraft = null;
  let taskState = "quiet";
  let taskPassport = null;
  let taskSequence = 0;
  let feedbackChoice = "";
  let conversationAgent = "";
  let followsPageAgent = true;
  const selectedSkills = new Set();
  const selectedPlugins = new Set();
  let selectedModelMode = "自动选择";
  let toastTimer;
  let tutorTimer;
  const CONTINUITY_KEY = "chaotang-demo-task-continuity-v1";
  const GROWTH_KEY = "chaotang-demo-growth-events-v1";
  const VISIT_KEY = "chaotang-demo-visit-v1";

  const conversationAgents = [
    ["丞相", "统筹未知问题，先复述理解，再协调各部"],
    ["户部尚书", "现金、预算、投资与风险判断"],
    ["钦天监监正", "条件推演、触发信号与失效边界"],
    ["锦衣卫指挥使", "事实、来源、反证与证据缺口"],
    ["军机大臣", "项目、阻塞、里程碑与交付"],
    ["翰林学士", "学习、练习、知识与 Skill 孵化"],
    ["吏部尚书", "人类员工、智能体员工、职责与能力编制"],
    ["礼部尚书", "品牌、内容、传播、商务与用户体验"],
    ["兵部尚书", "增长、客户、渠道、报价与竞争行动"],
    ["刑部尚书", "合同、合规、授权、风险与争议"],
    ["工部尚书", "产品、技术、进度、质量与交付"]
  ];
  const agentDestinations = {
    "丞相": "A02", "军机大臣": "A03", "锦衣卫指挥使": "C01", "钦天监监正": "C02", "翰林学士": "C03",
    "吏部尚书": "B01", "户部尚书": "B02", "礼部尚书": "B03", "兵部尚书": "B04", "刑部尚书": "B05", "工部尚书": "B06"
  };
  const recommendedConversationAgent = page => ["A02", "A03"].includes(page.id) ? "丞相" : page.agent;

  const $ = id => document.getElementById(id);
  const text = (id, value) => { const node = $(id); if (node) node.textContent = value || ""; };
  const groupNames = ["全部", ...new Set(pages.map(page => page.group))];

  const taskStateContent = {
    quiet: ["静殿待命", "尚无真实任务；百官保持待命，不伪造办理进度。"],
    summoned: ["丞相已被召见", "已收到一次本地演示事件；其他官员仍然待命。"],
    understanding: ["等待确认问题理解", "这是可纠正的本地理解卡；未确认前不会出现三策。"],
    advising: ["三策已经形成", "百官等待你选择；尚未生成正式奏请或触发执行。"],
    coordinate: ["最小智能体小队会办", "仅在可追溯任务事件后进入；当前状态必须标记真实、演示或失败。"],
    confirmation: ["奏请草案等待确认", "外部发送、付款、发布、交易与执行仍然锁定。"],
    result: ["成果包已经形成", "可先看一句结论，再下载演示成果或提交改进意见。"]
  };

  const taskStateSteps = {
    quiet: [],
    summoned: ["intent:active"],
    understanding: ["intent:done", "understand:active"],
    advising: ["intent:done", "understand:done", "advise:active"],
    confirmation: ["intent:done", "understand:done", "advise:done", "confirm:active"],
    coordinate: ["intent:done", "understand:done", "advise:done", "confirm:done", "coordinate:active"],
    result: ["intent:done", "understand:done", "advise:done", "confirm:done", "coordinate:done", "result:done"]
  };

  const displayMediumByPage = {
    A02: "decree",
    A03: "map",
    B02: "ledger",
    B03: "storyboard",
    B04: "map",
    B05: "evidence",
    B06: "blueprint",
    C01: "evidence",
    C02: "star",
    E06: "storyboard",
    F01: "evidence",
    F02: "evidence",
    F03: "evidence",
    F04: "evidence",
    F05: "evidence",
    G01: "star",
    G02: "star",
    G03: "star",
    H01: "ledger",
    H02: "ledger",
    H03: "ledger",
    H04: "ledger",
    I01: "decree",
    I02: "decree",
    I03: "evidence",
    I04: "evidence",
    I05: "blueprint",
    I06: "decree",
    J01: "ledger", J02: "ledger", J03: "evidence", J04: "evidence",
    K01: "storyboard", K02: "storyboard", K03: "storyboard", K04: "evidence",
    L01: "map", L02: "map", L03: "ledger", L04: "evidence",
    M01: "evidence", M02: "evidence", M03: "evidence",
    N01: "blueprint", N02: "blueprint", N03: "blueprint",
    O01: "decree", O02: "evidence", O03: "storyboard", O04: "decree"
  };

  const controlHelp = {
    alerts: "查看达到影响阈值的重要风险；原型不会生成真实预警。",
    todo: "集中查看需要你确认、补资料或授权的事项。",
    growth: "查看用户能力与朝堂能力的进化建议；不会自动升级。",
    upgrade: "查看Agent、Skill、任务书和用户能力的升级奏请；未经批准不会安装或启用。",
    compute: "预览模型、Agent 与工具可能使用的算筹；确认前不消耗。",
    models: "预留大模型选择；智能版自动推荐，定制版才展开速度、成本、隐私和上下文边界。",
    account: "配置身份、记忆、隐私、通知和授权边界。",
    materials: "加入本次任务可以引用的文件或背景；不会自动外传。",
    evidence: "查看来源、反证、更新时间和仍然不知道的部分。",
    agents: "选择当前对话 Agent；切换不会丢失同一任务上下文。",
    skills: "选择候选 Skill；未接入时只保存选择意图，不安装。",
    plugins: "选择外部能力；未授权时不会连接或调用服务。",
    agentTeam: "查看最小协作编队；没有真实任务时百官保持待命。",
    contextManager: "查看、移除或补充当前引用上下文。",
    voice: "查看语音输入方案；当前未连接麦克风或转写服务。",
    advice: "请当前 Agent 用简单语言解释推荐理由和取舍。",
    example: "查看与当前页面相似的完整示范，不触发真实办理。",
    coach: "获得一句可以直接照着说的提示。",
    glossary: "解释页面术语，不改变当前任务。",
    coordination: "查看同一任务经过哪些部门、当前真实状态和下一责任人。",
    benchmark: "查看能力对标需要的作品、任务、量表、样本和测评日期；证据不足时不会显示领先百分比。",
    atlas: "打开全部主、次、三级页面图谱。",
    capabilityHub: "按结果查看更多能力；小白无需选择 Skill、插件或模型。",
    morningBrief: "查看今天唯一值得关注的变化、建议和行动。",
    eveningReport: "回看今天已经形成的成果、阻塞与明日建议。",
    growthMap: "查看由真实或明确标记的演示成果点亮的六域成长证据。"
  };

  function readLocal(key, fallback) {
    try { return JSON.parse(demoStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (_error) { return fallback; }
  }

  async function writeLocal(key, value) {
    try { return (await demoStorage.setItem(key, JSON.stringify(value))) !== false; }
    catch (_error) { return false; }
  }

  function readSavedTask() {
    const saved = readLocal(CONTINUITY_KEY, null);
    return saved && saved.id && saved.stage !== "result" ? saved : null;
  }

  function persistTaskSnapshot() {
    if (!taskPassport || taskPassport.stage === "result") return;
    taskPassport.updatedAt = new Date().toISOString();
    writeLocal(CONTINUITY_KEY, taskPassport);
    updateResumeButton();
  }

  function clearSavedTask() {
    try { demoStorage.removeItem(CONTINUITY_KEY); } catch (_error) { /* local continuity is optional */ }
    updateResumeButton();
  }

  function growthEvents() {
    const events = readLocal(GROWTH_KEY, []);
    return Array.isArray(events) ? events : [];
  }

  function recordGrowthEvent() {
    if (!taskPassport || taskPassport.stage !== "result") return null;
    const events = growthEvents();
    const existing = events.find(event => event.taskId === taskPassport.id);
    if (existing) return existing;
    const contractPage = pageMap.get(taskPassport.sourcePage) || current;
    const growth = contractPage.growthContract || current.growthContract;
    const pdca = contractPage.pdcaContract || current.pdcaContract;
    const event = {
      id: `GROWTH-${Date.now()}`,
      taskId: taskPassport.id,
      pageId: contractPage.id,
      domain: growth.domain,
      artifact: growth.artifact,
      method: growth.method,
      evidence: growth.evidence,
      nextPractice: growth.nextPractice,
      resultState: "DEMO",
      createdAt: new Date().toISOString(),
      pdca: { ...pdca }
    };
    events.push(event);
    writeLocal(GROWTH_KEY, events.slice(-100));
    clearSavedTask();
    return event;
  }

  function updateResumeButton() {
    const button = $("resumeTaskButton");
    if (!button) return;
    const saved = readSavedTask();
    button.hidden = current?.id !== "A01" || !saved;
    if (saved) {
      button.textContent = "继续上次任务 →";
      button.title = `${current?.dailyHook?.resumeLabel || "继续上次任务"}：${saved.focus || saved.userInput}`;
    }
  }

  function resumeSavedTask() {
    const saved = readSavedTask();
    if (!saved) { showToast("当前没有可继续的未完任务。"); updateResumeButton(); return; }
    taskPassport = saved;
    app.dataset.taskPassport = saved.id;
    const destination = ["coordinate"].includes(saved.stage) ? "A03" : "A02";
    navigateTo(destination, { taskMode: "continue" });
    showToast(`已恢复同一任务 ${saved.id}；不会重新创建或自动执行。`);
  }

  function createTaskPassport(userInput, options = {}) {
    taskSequence += 1;
    taskPassport = {
      id: `DEMO-TASK-${Date.now().toString(36).toUpperCase()}-${String(taskSequence).padStart(2, "0")}`,
      userInput,
      sourcePage: options.sourcePage || current.id,
      focus: options.focus || current.action,
      contexts: [...(options.contexts || current.contexts || [])],
      version: 1,
      inputSource: options.inputSource || "USER_INPUT",
      sourceState: "DEMO",
      stage: "intent",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    persistTaskSnapshot();
    return taskPassport;
  }

  function clearTaskPassport() {
    taskPassport = null;
    app.dataset.taskPassport = "";
  }

  function taskContextLabels(page) {
    if (!taskPassport) return page.contexts;
    return [
      `任务护照 ${taskPassport.id}`,
      `用户原话：${taskPassport.userInput}`,
      ...taskPassport.contexts,
      `当前：${page.title}`
    ];
  }

  function updateTaskResultShortcut() {
    const shortcut = $("taskResultShortcut");
    if (!shortcut) return;
    shortcut.hidden = !taskPassport || taskPassport.stage !== "result" || current.id === "D04";
  }

  function setTaskStage(stage) {
    if (!taskPassport) return;
    taskPassport.stage = stage;
    if (stage === "result") {
      taskPassport.updatedAt = new Date().toISOString();
      recordGrowthEvent();
    } else persistTaskSnapshot();
    updateTaskResultShortcut();
  }

  function setPanelCollapsed(side, collapsed) {
    const panel = document.querySelector(`.${side}-panel`);
    const button = document.querySelector(`[data-collapse="${side}"]`);
    if (!panel || !button) return;
    panel.classList.toggle("is-collapsed", collapsed);
    button.setAttribute("aria-expanded", String(!collapsed));
    button.setAttribute("aria-label", `${collapsed ? "展开" : "收起"}${side === "left" ? "左" : "右"}栏`);
    button.textContent = collapsed ? (side === "left" ? "›" : "‹") : (side === "left" ? "‹" : "›");
  }

  function getTutorCopy(button) {
    const label = (button.getAttribute("aria-label") || button.textContent || "当前操作").replace(/\s+/g, " ").trim();
    if (button.id === "primaryAction") {
      return [label, `作用：进入当前推荐的下一阶段。后果：${current.consequence} 算筹：确认调用前不消耗。外部动作：默认关闭。可以照着说：“${current.nextPrompt}”`];
    }
    if (button.id === "explainNextAction") {
      return [label, `作用：请${current.agent}先解释推荐理由、代价和边界。后果：只把问题放入对话栏。算筹与外部动作：都不会触发。`];
    }
    if (button.id === "deferNextAction") {
      return [label, "作用：暂时不进入下一阶段。后果：当前页面和任务上下文保持不变。算筹与外部动作：都不会触发。"]; 
    }
    if (button.dataset.page) {
      const destination = pageMap.get(button.dataset.page);
      return [label, `作用：进入${destination?.title || "对应页面"}。后果：只切换页面并保留可用上下文。算筹：不消耗。外部动作：不会发生。小白可以说：“请告诉我进入这里能得到什么。”`];
    }
    if (button.dataset.mode) {
      return [label, button.dataset.mode === "smart" ? "作用：只看推荐、结果和下一步。后果：隐藏专业参数但不删除数据。" : "作用：展开证据、能力、权限和日志。后果：只改变展示层级，不执行任务。"]; 
    }
    if (button.hasAttribute("data-agent-picker")) {
      return [label, `${controlHelp.agents} 召见后进入他的主责部门；算筹与现实动作默认关闭。小白可以说：“我想得到这个结果，请推荐该找谁。”`];
    }
    if (button.dataset.open && controlHelp[button.dataset.open]) {
      return [label, `${controlHelp[button.dataset.open]} 算筹：确认调用前不消耗。外部动作：默认关闭。小白可以说：“请用简单的话告诉我先看什么。”`];
    }
    if (button.dataset.surface) {
      return [label, `作用：在中央御屏查看${label}。后果：只展示当前任务信息，不创建新任务。`];
    }
    if (button.dataset.strategy) {
      return [label, `作用：选择${button.dataset.strategy}作为奏请候选。后果：只记录选择；生成奏请前仍可更改，不会执行。`];
    }
    if (button.hasAttribute("data-scroll-toggle") || button.hasAttribute("data-scroll-collapse")) {
      return [label, "作用：展开或收起中央御屏。后果：只改变信息展示，不改变任务状态。"]; 
    }
    return [label, `作用：打开对应的本地原型说明。后果：不会调用模型、消耗算筹或产生外部操作。小白可以说：“${current.nextPrompt}”`]; 
  }

  function scheduleTutor(button) {
    window.clearTimeout(tutorTimer);
    tutorTimer = window.setTimeout(() => {
      const [title, detail] = getTutorCopy(button);
      text("buttonTutorTitle", title);
      text("buttonTutorDetail", detail);
      $("buttonTutor").hidden = false;
    }, 380);
  }

  function hideTutor() {
    window.clearTimeout(tutorTimer);
    $("buttonTutor").hidden = true;
  }

  function applyMode(mode, announce = false) {
    app.dataset.mode = mode;
    document.querySelectorAll(".mode-switch button").forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    setPanelCollapsed("left", false);
    setPanelCollapsed("right", false);
    if (announce) {
      app.dataset.scroll = mode === "smart" && !["A02", "D04"].includes(current.id) ? "seal" : current.id === "D03" ? "compare" : "half";
      updateScrollLabel();
      showToast(mode === "smart" ? "已切换智能版：保留简明左右栏，中央建议默认合卷。" : "已切换定制版：展开材料、证据、能力、权限和日志入口。");
    }
  }

  function setTaskState(nextState) {
    taskState = nextState;
    app.dataset.taskState = nextState;
    const [title, detail] = taskStateContent[nextState] || taskStateContent.quiet;
    text("smartTaskTitle", title);
    text("smartTaskDetail", detail);
    const dot = $("smartTaskDot");
    dot.className = `dot ${nextState === "quiet" ? "" : nextState === "confirmation" ? "warn" : "ok"}`.trim();
    const stateByStep = new Map((taskStateSteps[nextState] || []).map(item => item.split(":")));
    document.querySelectorAll("[data-task-step]").forEach(step => {
      const state = stateByStep.get(step.dataset.taskStep);
      step.classList.toggle("is-done", state === "done");
      step.classList.toggle("is-active", state === "active");
    });
  }

  function defaultTaskStateFor(page) {
    if (taskPassport?.stage && taskStateContent[taskPassport.stage]) return taskPassport.stage;
    if (page.id === "A02") return "understanding";
    return "quiet";
  }

  function applyResultPageAvailability() {
    if (current.id !== "D04" || taskPassport?.stage === "result") return;
    text("verdictTitle", "尚无可以裁决的任务成果；朝堂不会从空白页面伪造成功。");
    text("smartOutcome", "完成理解确认、方案选择与本地演示会办后，获得同一任务成果包");
    text("smartReason", "成果入口必须继承同一任务护照，并且只有完成阶段才能开放");
    text("situation", "当前没有达到完成阶段的任务护照");
    text("impact", "现在下载会失去用户原话、版本与办理证据");
    text("nowAction", "先从大殿或对话栏发起一件事");
    text("smartNowAction", "先说出你想得到的结果");
    text("smartNowReason", "丞相会先复述理解；未确认以前不会形成成果");
    text("smartRightAdvice", "先完成同一任务主流程，再回到这里裁决和下载。");
    text("signalText", "正式成果包：当前尚无达到完成阶段的任务护照。本原型不会从空白页面伪造成果或办理状态。");
    text("primaryAction", "查看成果形成条件");
    text("primaryConsequence", "点击后：只解释任务完成门槛，不生成、下载或伪造任何成果。");
    renderList("leftList", [
      { title: "任务护照", meta: "尚未建立或尚未完成", status: "等待", sigil: "护" },
      { title: "用户确认", meta: "理解与方案必须先确认", status: "门槛", sigil: "确" },
      { title: "本地会办", meta: "演示阶段也要完整留痕", status: "未到", sigil: "办" }
    ]);
    renderList("rightList", [
      { title: "成果状态", meta: "未形成，不可下载", status: "锁定", sigil: "果" },
      { title: "现实动作", meta: "发送、付款、发布仍关闭", status: "安全", sigil: "权" },
      { title: "下一入口", meta: "大殿或底部对话栏", status: "开始", sigil: "始" }
    ]);
  }

  function applyTaskStageControls() {
    if (current.id !== "A03" || !taskPassport) return;
    if (taskPassport.stage === "coordinate") {
      text("primaryAction", "完成本地演示会办");
      text("primaryConsequence", "点击后：只形成可下载的本地演示成果，不调用模型、部门或外部服务。");
    } else if (taskPassport.stage === "result") {
      text("primaryAction", "进入同一任务成果");
      text("primaryConsequence", "点击后：携带同一任务护照进入成果页；不会自动下载或触发现实动作。");
    }
  }

  function renderList(targetId, items) {
    const target = $(targetId);
    target.replaceChildren(...items.map(item => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "panel-item";
      button.dataset.open = "item";
      button.dataset.itemTitle = item.title;
      button.innerHTML = `<span class="sigil" aria-hidden="true">${item.sigil}</span><span><b>${item.title}</b><small>${item.meta}</small></span><em>${item.status}</em>`;
      button.addEventListener("click", () => openDrawer("item", item.title));
      return button;
    }));
  }

  function openSmartFocus(item, kind) {
    const surface = $("displaySurface");
    const content = $("scrollContent");
    const body = $("displaySurfaceBody");
    app.dataset.scroll = "half";
    updateScrollLabel();
    surface.hidden = false;
    content.hidden = true;
    document.querySelectorAll(".display-tabs [data-surface]").forEach(button => {
      button.classList.remove("is-active");
      button.setAttribute("aria-pressed", "false");
    });
    text("displayContext", item.title);
    text("displaySurfaceKicker", kind === "benefit" ? "你可以得到" : "值得关注");
    const intro = document.createElement("p");
    intro.className = "surface-intro";
    intro.textContent = item.meta;
    const list = document.createElement("div");
    list.className = "surface-list";
    const details = kind === "benefit"
      ? [["这会给你什么", item.meta], ["现在需要什么", current.action], ["由谁负责", `${current.agent}主责，必要时才召集最小协作队伍。`]]
      : [["为什么值得看", item.meta], ["当前状态", item.status], ["下一步", `先请${current.agent}解释影响，再决定是否深入。`]];
    details.forEach(([label, value]) => {
      const article = document.createElement("article");
      const heading = document.createElement("b");
      const detail = document.createElement("small");
      heading.textContent = label;
      detail.textContent = value;
      article.append(heading, detail);
      list.append(article);
    });
    const actions = document.createElement("div");
    actions.className = "surface-actions";
    const explain = document.createElement("button");
    explain.type = "button";
    explain.textContent = `请${current.agent}解释`;
    explain.addEventListener("click", () => {
      promptInput.value = `请用简单的话解释“${item.title}”对我有什么影响，我现在应该做什么。`;
      sendButton.disabled = false;
      promptInput.focus();
      showToast("问题已放入对话栏，你可以继续修改后发送。");
    });
    actions.append(explain);
    if (current.id === "E02") {
      const professional = document.createElement("button");
      professional.type = "button";
      professional.className = "primary";
      professional.textContent = "进入户部专业页面";
      professional.addEventListener("click", () => {
        createTaskPassport(`请围绕“${item.title}”形成一份财富判断。`, { sourcePage: current.id, focus: item.title, contexts: current.contexts, inputSource: "PAGE_RECOMMENDATION" });
        navigateTo("B02", { taskMode: "continue" });
      });
      actions.append(professional);
    }
    body.replaceChildren(intro, list, actions);
  }

  function renderSmartList(targetId, items, kind) {
    const target = $(targetId);
    target.replaceChildren(...items.map(item => {
      const button = document.createElement("button");
      button.type = "button";
      const title = document.createElement("b");
      const arrow = document.createElement("em");
      const meta = document.createElement("small");
      title.textContent = item.title;
      arrow.textContent = "→";
      meta.textContent = item.meta;
      button.append(title, arrow, meta);
      button.addEventListener("click", () => openSmartFocus(item, kind));
      return button;
    }));
  }

  function renderAbilityList(items) {
    const target = $("smartAbilityList");
    target.replaceChildren(...items.slice(0, 3).map(item => {
      const option = typeof item === "string" ? { label: item } : item;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option.label;
      button.addEventListener("click", () => {
        if (option.page && pageMap.has(option.page)) navigateTo(option.page, { taskMode: taskPassport ? "continue" : "clear" });
        else if (option.open) openDrawer(option.open, option.label);
        else openDrawer("item", option.label);
      });
      return button;
    }));
  }

  function renderComposerAgent() {
    text("composerAgent", conversationAgent);
    text("composerAgentDot", conversationAgent.slice(0, 1));
    text("agentDockStatus", followsPageAgent ? "跟随页面" : conversationAgent);
  }

  function renderSecondary(items) {
    const target = $("secondaryActions");
    target.replaceChildren(...items.map(label => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.secondary = label;
      button.addEventListener("click", () => {
        if (current.id === "A02" && label.includes("纠正")) resetDiscussion("已返回理解确认：旧确认和旧三策已经失效。");
        else if (label.includes("下载成果")) openResultPackage();
        else openDrawer("item", label);
      });
      return button;
    }));
  }

  function setActiveNavigation() {
    document.querySelectorAll("[data-page]").forEach(button => {
      button.classList.toggle("is-active", button.dataset.page === current.id);
      if (button.dataset.page === current.id) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function renderPage(page, pushHash = true, options = {}) {
    if (!page) return;
    window.clearTimeout(toastTimer);
    toast.classList.remove("is-visible");
    if (drawer.open) drawer.close();
    if (atlas.open) atlas.close();
    const taskMode = options.taskMode || "clear";
    if (taskMode === "clear") clearTaskPassport();
    current = page;
    const stage = $("stage");
    if (stage) stage.scrollTop = 0;
    document.querySelectorAll(".smart-sidebar").forEach(panel => { panel.scrollTop = 0; });
    app.dataset.displayMedium = displayMediumByPage[page.id] || "decree";
    scene.style.opacity = "0";
    window.setTimeout(() => {
      scene.style.backgroundImage = `url("${page.scene}")`;
      scene.style.opacity = "1";
    }, 90);
    text("pageKicker", page.kicker);
    text("pageTitle", page.title);
    text("pageSubtitle", page.subtitle);
    text("agentName", page.agent);
    text("agentMonogram", page.agent.slice(0, 1));
    if (followsPageAgent || !conversationAgent) conversationAgent = recommendedConversationAgent(page);
    renderComposerAgent();
    text("stageLabel", `阶段 · ${page.phase}`);
    text("verdictTitle", page.verdict);
    text("smartOutcome", page.outcome);
    text("smartReason", page.reason || page.impact);
    text("situation", page.situation);
    text("impact", page.impact);
    text("nowAction", page.action);
    text("canDo", page.canDo);
    text("whyTrust", page.why);
    text("leftTitle", page.leftTitle);
    text("leftSectionLabel", page.leftLabel);
    text("rightTitle", page.rightTitle);
    text("rightSummary", page.rightSummary);
    text("rightTiming", page.rightTiming);
    text("rightSectionLabel", page.rightLabel);
    text("smartNowAction", page.action);
    text("smartNowReason", page.impact);
    text("smartGrowth", page.growth);
    const latestGrowth = growthEvents().filter(event => event.pageId === page.id || event.domain === page.growthContract.domain).at(-1);
    text("smartProofTitle", latestGrowth ? latestGrowth.artifact : page.proofTitle);
    text("smartProofDetail", latestGrowth ? `${latestGrowth.resultState} 证据 · ${latestGrowth.method}` : page.proofDetail);
    text("smartRoleTag", `${page.agent} · 一句话认识这里`);
    text("smartRoleDefinition", page.roleDefinition);
    text("smartRoleValue", page.userValue);
    text("smartRoleHook", page.roleHook);
    text("smartAgentMonogram", page.agent.slice(0, 1));
    text("smartAgentName", page.agent);
    text("smartRightAgent", page.agent);
    text("smartRightAdvice", page.verdict);
    text("smartNewsTitle", page.newsTitle);
    text("smartNewsDetail", page.newsDetail);
    text("sealActionLabel", page.sealAction);
    text("primaryAction", page.primary);
    text("primaryConsequence", `点击后：${page.consequence}`);
    text("composerHint", page.hint);
    text("signalText", `${page.title}：${page.situation}。本原型未连接真实后端或外部执行。`);
    text("evidenceLabel", page.why);
    renderList("leftList", page.leftItems);
    renderList("rightList", page.rightItems);
    renderSmartList("smartBenefitList", page.benefits, "benefit");
    renderSmartList("smartWatchList", page.watch, "watch");
    renderAbilityList(page.abilities);
    renderSecondary(page.secondary);
    const continuingTask = taskMode === "continue" && taskPassport;
    const contextLabels = continuingTask ? taskContextLabels(page) : page.contexts;
    app.dataset.taskPassport = continuingTask ? taskPassport.id : "";
    updateTaskResultShortcut();
    updateResumeButton();
    const chips = $("contextChips");
    chips.replaceChildren(...contextLabels.map(label => {
      const chip = document.createElement("span"); chip.textContent = label; return chip;
    }));
    discussionState = page.id === "A02" ? "understanding" : "default";
    selectedStrategy = "";
    currentTopicInput = "";
    understandingVersion = 1;
    petitionDraft = null;
    app.dataset.discussion = discussionState;
    document.querySelectorAll("[data-strategy]").forEach(button => button.setAttribute("aria-pressed", "false"));
    $("primaryAction").disabled = false;
    app.dataset.scroll = app.dataset.mode === "smart" && !["A02", "D04"].includes(page.id) ? "seal" : page.id === "D03" ? "compare" : "half";
    setTaskState(defaultTaskStateFor(page));
    applyMode(app.dataset.mode || "smart");
    if (page.id === "A02" && continuingTask && taskPassport.userInput) {
      currentTopicInput = taskPassport.userInput;
      understandingVersion = taskPassport.version;
      if (taskPassport.stage === "advising") {
        discussionState = "options";
        selectedStrategy = taskPassport.selectedStrategy || "";
        app.dataset.scroll = "compare";
      } else if (taskPassport.stage === "confirmation") {
        discussionState = "draft";
        selectedStrategy = taskPassport.selectedStrategy || "衡策";
        createPetitionDraft();
        app.dataset.scroll = "full";
      }
      updateDiscussionState();
    }
    applyResultPageAvailability();
    applyTaskStageControls();
    renderCentralSurface("brief");
    updateScrollLabel();
    setActiveNavigation();
    if (pushHash) history.pushState({ page: page.id }, "", `#page=${page.id}`);
    document.title = `${page.title}｜朝堂 AI OS`;
    text("routeAnnouncement", `已进入${page.title}。当前主责：${page.agent}。`);
    if (pushHash || options.routeChange) $("pageTitle")?.focus({ preventScroll: true });
  }

  function updateDiscussionState() {
    if (current.id !== "A02") return;
    app.dataset.discussion = discussionState;
    const primary = $("primaryAction");
    if (discussionState === "understanding") {
      setTaskStage("understanding");
      setTaskState("understanding");
      text("stageLabel", "阶段 · 理解确认");
      text("verdictTitle", currentTopicInput ? `丞相理解 · 第 ${understandingVersion} 版：你要处理的是“${currentTopicInput}”。` : current.verdict);
      text("situation", currentTopicInput ? "议题或关键边界已经由你补充" : current.situation);
      text("impact", currentTopicInput ? "上一版确认、三策与授权已经失效" : current.impact);
      text("nowAction", currentTopicInput ? "检查这次复述是否准确" : current.action);
      text("primaryAction", current.primary);
      text("primaryConsequence", `点击后：${current.consequence}`);
      primary.disabled = false;
      return;
    }
    if (discussionState === "options") {
      setTaskStage("advising");
      setTaskState("advising");
      text("stageLabel", "阶段 · 三策比较");
      text("verdictTitle", "三策只改变路径，不改变你已经确认过的目标。");
      text("situation", "问题定义已经确认");
      text("impact", "三策的速度、风险与投入不同");
      text("nowAction", "选择最符合当前边界的一策");
      text("primaryAction", selectedStrategy ? `采用${selectedStrategy}，生成奏请草案` : "先选择一策");
      text("primaryConsequence", selectedStrategy ? "点击后：形成可预览的奏请草案，不会直接下旨或执行。" : "先比较三策并选择一项，主动作才会解锁。");
      primary.disabled = !selectedStrategy;
      return;
    }
    setTaskStage("confirmation");
    setTaskState("confirmation");
    text("stageLabel", "阶段 · 奏请预览");
    text("verdictTitle", `已选择${selectedStrategy}；先预览奏请，再决定是否正式下旨。`);
    text("situation", "方案已经由你选择");
    text("impact", "外部动作仍处于锁定状态");
    text("nowAction", "检查目标、承办、风险与授权边界");
    text("primaryAction", "预览奏请与授权边界");
    text("primaryConsequence", "点击后：只打开预览与确认说明，不会触发真实任务或外部动作。");
    primary.disabled = false;
  }

  function resetDiscussion(reason) {
    if (current.id !== "A02") return;
    discussionState = "understanding";
    selectedStrategy = "";
    document.querySelectorAll("[data-strategy]").forEach(button => button.setAttribute("aria-pressed", "false"));
    app.dataset.scroll = "half";
    updateScrollLabel();
    updateDiscussionState();
    showToast(reason || "议题已经改变：旧确认、旧三策和旧授权立即失效。");
  }

  function updateTopicUnderstanding(submitted) {
    if (!taskPassport) createTaskPassport(submitted, { sourcePage: current.id, contexts: current.contexts });
    else {
      taskPassport.userInput = submitted;
      taskPassport.version += 1;
      delete taskPassport.selectedStrategy;
    }
    currentTopicInput = submitted;
    understandingVersion = taskPassport.version;
    petitionDraft = null;
    resetDiscussion("已生成新的理解版本：旧确认、旧三策和旧授权已经失效。");
    const chips = $("contextChips");
    chips.replaceChildren(...taskContextLabels(current).map(label => {
      const chip = document.createElement("span");
      chip.textContent = label;
      return chip;
    }));
    app.dataset.taskPassport = taskPassport.id;
    text("signalText", `上书房已收到新的议题信息：正在等待你确认第 ${understandingVersion} 版理解。本原型未连接真实模型或外部执行。`);
    text("composerHint", "新议题已经写入理解卡；确认以前不会生成新的三策。");
  }

  function chooseStrategy(strategy) {
    if (current.id === "A02" && discussionState === "options") {
      selectedStrategy = strategy.dataset.strategy;
      if (taskPassport) {
        taskPassport.selectedStrategy = selectedStrategy;
        persistTaskSnapshot();
      }
      document.querySelectorAll("[data-strategy]").forEach(button => button.setAttribute("aria-pressed", String(button === strategy)));
      updateDiscussionState();
    } else if (current.id === "D03") openDrawer("item", `${strategy.dataset.strategy} · 会审意见`);
  }

  const strategyPlans = {
    "稳策": { approach: "先补齐关键证据，再进行最小规模验证。", risk: "窗口可能缩短，但不可逆风险最低。", stop: "核心证据仍缺失，或验证成本超过已确认边界。" },
    "衡策": { approach: "边验证边推进，保留核心投入并设置短周期检查点。", risk: "需要严格执行停止条件，避免投入惯性。", stop: "关键指标未改善，或任一高风险假设被证伪。" },
    "进策": { approach: "在授权边界内集中资源，抢占当前窗口并高频校正。", risk: "速度最快，但成本、返工和外部影响最高。", stop: "触发预算上限、权限边界或重大反证。" }
  };

  function createPetitionDraft() {
    const plan = strategyPlans[selectedStrategy];
    petitionDraft = {
      version: `议题 v${understandingVersion} · 草案 v1`,
      topic: currentTopicInput || "当前已确认的演示议题（真实议题尚未接入）",
      strategy: `${selectedStrategy}：${plan.approach}`,
      owner: "丞相统筹；唯一主责部门将在用户确认后路由",
      collaboration: "锦衣卫核验证据，钦天监维护条件，六部或专署按结果最小协作",
      risk: plan.risk,
      stop: plan.stop,
      permission: "只生成本地奏请草案；外部发送、付款、发布、交易和执行全部锁定"
    };
  }

  function openPetitionPreview() {
    if (!petitionDraft) createPetitionDraft();
    text("drawerKicker", "上书房 · 奏请草案");
    text("drawerTitle", "奏请预览与授权边界");
    const body = $("drawerBody");
    const intro = document.createElement("p");
    intro.textContent = "这是可修改的本地预览，不是正式下旨，也不会触发任何外部动作。";
    const list = document.createElement("div");
    list.className = "drawer-list";
    [
      ["版本", petitionDraft.version],
      ["议题", petitionDraft.topic],
      ["采用方案", petitionDraft.strategy],
      ["主责", petitionDraft.owner],
      ["最小协作", petitionDraft.collaboration],
      ["主要风险", petitionDraft.risk],
      ["停止条件", petitionDraft.stop],
      ["授权状态", petitionDraft.permission]
    ].forEach(([label, value]) => {
      const article = document.createElement("article");
      const heading = document.createElement("b");
      const detail = document.createElement("small");
      heading.textContent = label;
      detail.textContent = value;
      article.append(heading, detail);
      list.append(article);
    });
    body.replaceChildren(intro, list);
    const actions = document.createElement("div");
    actions.className = "drawer-actions";
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "primary";
    confirm.textContent = "确认本地奏请，交军机处会办";
    confirm.addEventListener("click", () => {
      setTaskStage("coordinate");
      drawer.close();
      navigateTo("A03", { taskMode: "continue" });
      showToast("已进入军机处本地演示会办；没有调用模型、部门或外部服务。");
    });
    actions.append(confirm);
    body.append(actions);
    if (!drawer.open) drawer.showModal();
  }

  function updateScrollLabel() {
    const labels = { seal: "玉玺", half: "半卷", full: "全卷", compare: "对卷" };
    text("scrollStateLabel", labels[app.dataset.scroll] || "半卷");
  }

  function toggleScroll() {
    const order = current.id === "D03" ? ["seal", "half", "compare", "full"] : current.id === "A02" && discussionState === "options" ? ["seal", "half", "compare"] : ["seal", "half", "full"];
    const index = order.indexOf(app.dataset.scroll);
    app.dataset.scroll = order[(index + 1) % order.length];
    updateScrollLabel();
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  function renderCentralSurface(type) {
    const surface = $("displaySurface");
    const content = $("scrollContent");
    const body = $("displaySurfaceBody");
    const normalized = type === "coordination" ? "progress" : type;
    document.querySelectorAll(".display-tabs [data-surface]").forEach(button => {
      const active = button.dataset.surface === (normalized === "brief" ? "brief" : normalized);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (normalized === "brief") {
      surface.hidden = true;
      content.hidden = false;
      text("displayContext", "当前御断");
      if (app.dataset.mode === "smart" && app.dataset.scroll === "full" && current.id !== "D03" && !(current.id === "A02" && discussionState === "options")) {
        app.dataset.scroll = "half";
        updateScrollLabel();
      }
      return;
    }

    const definitions = {
      advice: ["为什么这样建议", "先给推荐，再按需展开理由。以下为页面演示，不代表实时结论。", [["推荐", $("verdictTitle").textContent], ["与你的关系", $("impact").textContent], ["证据边界", current.why]]],
      example: ["示范案例", "示范帮助用户获得第一次成功，不会被冒充成用户的真实数据。", [["你可以这样说", `我想得到“${current.outcome}”，请先复述目标和边界。`], ["丞相先做", "确认问题定义，不急着给方案。"], ["最终得到", current.outcome]]],
      coach: ["教我一步", "不需要学习提示词、部门或模型。照着下面这句话说，朝堂先理解，再给建议。", [["你可以直接这样说", current.nextPrompt], ["再补一句边界", "告诉我最担心什么、不能做什么；如果信息不足，最多问我两个问题。"], ["你会学会", current.growth]]],
      glossary: ["名词解释", "朝堂名词必须翻译成用户能理解的行动和结果。", [["御断", "一句话核心判断。"], ["奏请", "执行前可以修改和确认的方案草案。"], ["回奏", "智能体或部门交回的阶段结果。"], ["智能体蜂群", "为同一结果临时组成的最小协作队伍。"]]],
      progress: [taskStateContent[taskState][0], taskStateContent[taskState][1], [[current.agent, taskState === "quiet" ? "待命 · 未收到真实任务事件" : "当前页面主责 · 本地演示"], ["锦衣卫", "只有需要核验证据时才召见。"], ["钦天监", "只有需要条件推演时才召见。"], ["六部与专署", "按结果最小组队，没有事件时不离阵。"]]],
      materials: ["材料与引用", "每份材料都要说明来源、用途和缺口。", current.leftItems.map(item => [item.title, `${item.meta} · ${item.status}`])],
      result: ["成果与下载", taskState === "result" ? "成果已形成；先看结论，再下载或反馈。" : "当前尚未形成真实成果，不能提前显示成功。", [["你获得的信息", current.situation], ["朝堂的建议", current.verdict], ["你会收获的结果", current.outcome], ["现在应该做", current.action], ["这次顺便学会", current.growth], ["外部动作", "全部保持锁定，需逐项预览确认。"]]]
    };
    const definition = definitions[normalized] || definitions.advice;
    text("displayContext", definition[0]);
    text("displaySurfaceKicker", normalized === "progress" || normalized === "materials" || normalized === "result" ? "任务工作区" : "次级页面");
    const intro = document.createElement("p");
    intro.className = "surface-intro";
    intro.textContent = definition[1];
    const list = document.createElement("div");
    list.className = "surface-list";
    definition[2].forEach(([label, value]) => {
      const article = document.createElement("article");
      const heading = document.createElement("b");
      const detail = document.createElement("small");
      heading.textContent = label;
      detail.textContent = value;
      article.append(heading, detail);
      list.append(article);
    });
    const actions = document.createElement("div");
    actions.className = "surface-actions";
    if (normalized === "example" || normalized === "coach") {
      const start = document.createElement("button");
      start.type = "button";
      start.className = "primary";
      start.textContent = normalized === "example" ? "照这个案例开始" : "回到对话栏开始";
      start.addEventListener("click", () => {
        promptInput.value = normalized === "example" ? `我想得到：${current.outcome}。请先复述你对目标和边界的理解。` : current.nextPrompt;
        renderCentralSurface("brief");
        sendButton.disabled = !promptInput.value.trim();
        promptInput.focus();
      });
      actions.append(start);
    }
    if (normalized === "advice") {
      const evidence = document.createElement("button");
      evidence.type = "button";
      evidence.textContent = "进入三级证据页";
      evidence.addEventListener("click", () => openDrawer("evidence"));
      actions.append(evidence);
    }
    if (normalized === "result") {
      const result = document.createElement("button");
      result.type = "button";
      result.className = "primary";
      result.textContent = taskState === "result" ? "查看、下载并反馈" : "查看成果形成条件";
      result.addEventListener("click", () => taskState === "result" ? openResultPackage() : openDrawer("workflow"));
      actions.append(result);
    }
    body.replaceChildren(intro, list, actions);
    content.hidden = true;
    surface.hidden = false;
    if (app.dataset.scroll === "half") app.dataset.scroll = "full";
    updateScrollLabel();
  }

  function openGuidanceDrawer(type) {
    const definitions = {
      advice: {
        kicker: `${current.agent} · 建议说明`,
        title: "为什么这样建议",
        intro: "先给选择，再展开理由；以下均为当前页面的演示内容，不代表实时结论。",
        items: [
          ["推荐", $("verdictTitle").textContent],
          ["与你的关系", $("impact").textContent],
          ["现在做什么", $("nowAction").textContent],
          ["证据边界", current.why]
        ],
        action: ["继续看证据与缺口", () => openDrawer("evidence")]
      },
      example: {
        kicker: "示范案例 · 可照着开始",
        title: `如何得到“${current.outcome}”`,
        intro: "示范只帮助理解操作，不会被冒充成你的真实数据或成功案例。",
        items: [
          ["用户这样说", `我想处理“${current.action}”，请先告诉我还缺哪两项关键信息。`],
          ["丞相先做", "复述目标、限制与担忧，请用户确认理解。"],
          ["朝堂再做", "按需查证、推演和会办，每次只要求用户处理一个决定。"],
          ["最终得到", current.outcome]
        ],
        action: ["照这个案例开始", () => {
          promptInput.value = `我想得到：${current.outcome}。请先复述你对目标和边界的理解。`;
          sendButton.disabled = false;
          drawer.close();
          promptInput.focus();
        }]
      },
      coach: {
        kicker: "翰林教习 · 随行辅助",
        title: "现在只做这一步",
        intro: "教学不会强制弹出，也不会要求你学习部门、模型或提示词。",
        items: [
          ["第一步", "说清楚你希望最后拿到什么结果。"],
          ["第二步", "补充最担心的风险或不能突破的边界。"],
          ["第三步", `点击“${$("primaryAction").textContent}”，让${current.agent}先替你整理。`]
        ],
        action: ["回到对话栏开始", () => { drawer.close(); promptInput.focus(); }]
      },
      coordination: {
        kicker: "朝堂协同 · 事件驱动",
        title: taskStateContent[taskState][0],
        intro: taskState === "quiet" ? "没有真实任务时军团保持待命；不会用循环动画伪造繁忙。" : "以下为本地交互演示。正式版只有收到真实任务事件后，官员才会离阵并生成回奏。",
        items: [
          [current.agent, taskState === "quiet" ? "待命 · 未收到任务事件" : "已召见 · 当前页面演示主责"],
          ["丞相", current.agent === "丞相" ? "主责统筹 · 演示" : "等待需要跨部门协调的真实事件"],
          ["锦衣卫", "等待证据核验事件；未接入时不显示查证中"],
          ["钦天监", "等待条件推演事件；不伪造概率和实时预测"],
          ["六部与专署", "按结果最小组队；没有事件时不离阵"]
        ],
        action: ["展开执行图与事件说明", () => openDrawer("workflow")]
      },
      glossary: {
        kicker: "通俗解释 · 次级页面",
        title: "不用先懂朝堂名词",
        intro: "页面首先说用户能得到什么；只有你想了解时，才展示朝堂术语。",
        items: [
          ["御断", "丞相给你的一句话核心判断。"],
          ["奏请", "执行以前可以修改、预览和确认的方案草案。"],
          ["回奏", "某位智能体或部门交回的阶段结果。"],
          ["算筹", "调用能力前可预览和限制的算力额度，不是金融资产。"],
          ["智能体蜂群", "为同一个结果临时组成的最小协作队伍，不代表所有Agent同时工作。"]
        ],
        action: ["进入三级专业说明", () => openDrawer("system")]
      }
    };
    const config = definitions[type];
    if (!config) return false;
    text("drawerKicker", config.kicker);
    text("drawerTitle", config.title);
    const body = $("drawerBody");
    const intro = document.createElement("p");
    intro.textContent = config.intro;
    const list = document.createElement("div");
    list.className = "drawer-list";
    config.items.forEach(([label, value]) => {
      const article = document.createElement("article");
      const heading = document.createElement("b");
      const detail = document.createElement("small");
      heading.textContent = label;
      detail.textContent = value;
      article.append(heading, detail);
      list.append(article);
    });
    body.replaceChildren(intro, list);
    if (config.action) {
      const actions = document.createElement("div");
      actions.className = "drawer-actions";
      const action = document.createElement("button");
      action.type = "button";
      action.className = "primary";
      action.textContent = config.action[0];
      action.addEventListener("click", config.action[1]);
      actions.append(action);
      body.append(actions);
    }
    if (!drawer.open) drawer.showModal();
    return true;
  }

  function downloadDemoResult() {
    if (!taskPassport || taskPassport.stage !== "result") {
      showToast("任务尚未完成：请先确认理解、选择方案并完成本地演示会办。");
      return;
    }
    const contractPage = pageMap.get(taskPassport.sourcePage) || current;
    const growth = contractPage.growthContract || current.growthContract;
    const pdca = contractPage.pdcaContract || current.pdcaContract;
    const content = [
      "# 朝堂 AI OS · 演示成果包",
      "",
      `- 页面：${current.title}`,
      `- 任务：${taskPassport.id}（演示）`,
      `- 用户原话：${taskPassport.userInput}`,
      `- 理解版本：v${taskPassport.version}`,
      `- 来源页面：${taskPassport.sourcePage}`,
      `- 输入来源：${taskPassport.inputSource}`,
      `- 任务阶段：${taskPassport.stage}`,
      "- 版本：DEMO-RESULT-V1",
      "- 外部执行：未授权",
      "",
      "## 一句结论",
      current.verdict,
      "",
      "## 对你的影响",
      current.impact,
      "",
      "## 建议行动",
      current.action,
      "",
      "## 证据边界",
      current.why,
      "",
      "## 这次成长",
      `- 你获得了什么：${growth.artifact}`,
      `- 这次哪里做得更好：${growth.method}`,
      "- 朝堂替你减少了什么：把理解、方案、会办、成果和反馈收进同一任务护照",
      `- 下一次只提升一点：${growth.nextPractice}`,
      "",
      "## PDCA",
      `- Plan：${pdca.plan}`,
      `- Do：${pdca.do}`,
      `- Check：${pdca.check}`,
      `- Act：${pdca.act}`,
      "",
      "> 这是由本地交互原型生成的演示文件，不包含真实后端数据、来源或执行结果。"
    ].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `朝堂演示成果-${current.id}.md`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast("演示成果已经生成并下载；它不包含真实账户、来源或执行数据。");
  }

  async function persistFeedback(record) {
    try {
      const key = "chaotang-demo-feedback-v1";
      const existing = JSON.parse(demoStorage.getItem(key) || "[]");
      const sameResultIndex = existing.findIndex(item => item.taskId === record.taskId && item.resultVersion === record.resultVersion);
      if (sameResultIndex >= 0) existing[sameResultIndex] = record;
      else existing.push(record);
      return (await demoStorage.setItem(key, JSON.stringify(existing.slice(-50)))) !== false;
    } catch (_error) {
      return false;
    }
  }

  function openResultPackage() {
    if (!taskPassport || taskPassport.stage !== "result") {
      openDrawer("workflow");
      showToast("成果仍被锁定：理解、方案与会办完成后才能进入同一任务成果。");
      return;
    }
    setTaskState("result");
    feedbackChoice = "";
    text("drawerKicker", "正式成果包 · 演示版本");
    text("drawerTitle", "先看结果，再决定是否继续");
    const body = $("drawerBody");

    const sheet = document.createElement("section");
    sheet.className = "result-sheet";
    const badge = document.createElement("span");
    badge.textContent = "DEMO-RESULT-V1 · 未连接真实后端";
    const heading = document.createElement("h3");
    heading.textContent = current.verdict;
    const summary = document.createElement("p");
    summary.textContent = `建议下一步：${current.action}。现实动作仍需逐项预览和明确确认。`;
    sheet.append(badge, heading, summary);

    const contractPage = pageMap.get(taskPassport.sourcePage) || current;
    const growth = contractPage.growthContract || current.growthContract;
    const event = recordGrowthEvent();
    const resultLearning = buildInfoList([
      ["你获得了什么", growth.artifact],
      ["这次哪里做得更好", growth.method],
      ["朝堂替你减少了什么", "把理解、方案、会办、成果与反馈收进同一任务护照"],
      ["下一次只提升一点", growth.nextPractice]
    ], "daily-summary");
    const pdca = event?.pdca || contractPage.pdcaContract;
    const pdcaView = buildInfoList([["计划 Plan", pdca.plan], ["执行 Do", pdca.do], ["验证 Check", pdca.check], ["改进 Act", pdca.act]], "pdca-grid");

    const actions = document.createElement("div");
    actions.className = "drawer-actions";
    const download = document.createElement("button");
    download.type = "button";
    download.className = "primary";
    download.textContent = "下载演示成果包 (.md)";
    download.disabled = taskPassport.stage !== "result";
    download.addEventListener("click", downloadDemoResult);
    const evidence = document.createElement("button");
    evidence.type = "button";
    evidence.textContent = "查看证据与缺口";
    evidence.addEventListener("click", () => openDrawer("evidence"));
    actions.append(download, evidence);

    const feedback = document.createElement("section");
    feedback.className = "result-feedback";
    const feedbackTitle = document.createElement("h3");
    feedbackTitle.textContent = "这份结果对你有帮助吗？";
    const feedbackIntro = document.createElement("p");
    feedbackIntro.textContent = "先做一个轻量选择；只有你愿意时才展开原因。";
    const vote = document.createElement("div");
    vote.className = "feedback-vote";
    const details = document.createElement("div");
    details.className = "feedback-details";
    details.hidden = true;
    const reasons = document.createElement("div");
    reasons.className = "feedback-reasons";
    const comment = document.createElement("textarea");
    comment.placeholder = "可选：告诉朝堂哪里理解错了，或怎样更有用";
    comment.setAttribute("aria-label", "补充改进意见");
    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "primary";
    submit.textContent = "保存本地反馈";
    submit.disabled = true;
    const feedbackActions = document.createElement("div");
    feedbackActions.className = "drawer-actions";
    feedbackActions.append(submit);
    const privacy = document.createElement("small");
    privacy.className = "feedback-privacy";
    privacy.textContent = "原型说明：反馈只保存在当前浏览器，不会上传、训练模型或改变真实Agent。";
    const status = document.createElement("p");
    status.setAttribute("aria-live", "polite");

    const reasonLabels = ["结论清楚", "建议可执行", "理解错目标", "内容太复杂", "证据不足", "缺少下一步"];
    reasonLabels.forEach(label => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => button.setAttribute("aria-pressed", String(button.getAttribute("aria-pressed") !== "true")));
      reasons.append(button);
    });

    [["helpful", "有帮助"], ["improve", "需要改进"]].forEach(([value, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.feedback = value;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        feedbackChoice = value;
        vote.querySelectorAll("button").forEach(candidate => candidate.setAttribute("aria-pressed", String(candidate === button)));
        details.hidden = false;
        submit.disabled = false;
      });
      vote.append(button);
    });

    submit.addEventListener("click", async () => {
      const selectedReasons = [...reasons.querySelectorAll('button[aria-pressed="true"]')].map(button => button.textContent);
      const saved = await persistFeedback({
        taskId: taskPassport.id,
        resultVersion: "DEMO-RESULT-V1",
        pageId: current.id,
        mode: app.dataset.mode,
        rating: feedbackChoice,
        reasons: selectedReasons,
        comment: comment.value.trim(),
        createdAt: new Date().toISOString()
      });
      const events = growthEvents();
      const linked = events.find(event => event.taskId === taskPassport.id);
      if (linked) {
        linked.feedback = { rating: feedbackChoice, reasons: selectedReasons, comment: comment.value.trim(), createdAt: new Date().toISOString() };
        linked.pdca.act = selectedReasons.length || comment.value.trim()
          ? `根据用户反馈优先改进：${[...selectedReasons, comment.value.trim()].filter(Boolean).join("；")}`
          : linked.pdca.act;
        writeLocal(GROWTH_KEY, events);
      }
      status.textContent = saved ? "反馈已保存在当前浏览器。感谢你帮助朝堂改进。" : "当前浏览器不允许本地保存；反馈尚未记录。";
      submit.disabled = true;
      showToast(status.textContent);
    });

    details.append(reasons, comment, feedbackActions, privacy, status);
    feedback.append(feedbackTitle, feedbackIntro, vote, details);
    body.replaceChildren(sheet, resultLearning, pdcaView, actions, feedback);
    if (!drawer.open) drawer.showModal();
  }

  function showBuiltDrawer(kicker, title, nodes) {
    text("drawerKicker", kicker);
    text("drawerTitle", title);
    $("drawerBody").replaceChildren(...nodes);
    window.setTimeout(() => { if (!drawer.open) drawer.showModal(); }, 0);
  }

  function buildInfoList(items, className = "drawer-list") {
    const list = document.createElement("div");
    list.className = className;
    items.forEach(([label, value]) => {
      const article = document.createElement("article");
      const heading = document.createElement("b");
      const detail = document.createElement("small");
      heading.textContent = label;
      detail.textContent = value;
      article.append(heading, detail);
      list.append(article);
    });
    return list;
  }

  function buildTruthNote(message) {
    const note = document.createElement("p");
    note.className = "truth-note";
    note.textContent = message;
    return note;
  }

  function openDailyBriefing(kind = "morning") {
    const saved = readSavedTask();
    const today = new Date().toISOString().slice(0, 10);
    const todayEvents = growthEvents().filter(event => event.createdAt?.slice(0, 10) === today);
    const isEvening = kind === "evening";
    const intro = document.createElement("p");
    intro.textContent = isEvening
      ? "晚间回奏只汇总已有证据，不用浏览、点击或登录次数冒充成果。"
      : "早朝三分钟只呈一件值得你关注的变化、一个建议和一个行动。";
    const items = isEvening
      ? [
          ["今天完成了什么", todayEvents.length ? todayEvents.at(-1).artifact : "尚无经过任务闭环形成的成果"],
          ["哪件事仍被阻塞", saved ? `${saved.focus || saved.userInput} · 当前阶段 ${saved.stage}` : "当前没有已暂存的未完任务"],
          ["明天先做什么", todayEvents.length ? todayEvents.at(-1).nextPractice : current.dailyHook.evening]
        ]
      : [
          ["今天发生了什么", current.dailyHook.meaningfulChange],
          ["丞相只建议什么", current.verdict],
          ["现在唯一行动", current.action],
          ["未完之事", saved ? `${saved.focus || saved.userInput} · 需要你明确点击继续` : "没有自动恢复的旧任务"]
        ];
    const actions = document.createElement("div");
    actions.className = "drawer-actions";
    if (saved && !isEvening) {
      const resume = document.createElement("button");
      resume.type = "button";
      resume.className = "primary";
      resume.textContent = "继续上次未完之事";
      resume.addEventListener("click", () => { drawer.close(); resumeSavedTask(); });
      actions.append(resume);
    }
    showBuiltDrawer("DEMO · 朝报结构", isEvening ? "晚间回奏" : "早朝三分钟", [intro, buildInfoList(items, "daily-summary"), actions, buildTruthNote("当前没有接入真实日历、新闻、项目或账户数据；时间、变化与成果均不伪造。")]);
    writeLocal(VISIT_KEY, { lastViewedAt: new Date().toISOString(), view: kind, sourceState: "DEMO" });
  }

  function openGrowthMap() {
    const domains = ["事业", "财富", "学习", "生活", "健康", "娱乐"];
    const events = growthEvents();
    const map = document.createElement("div");
    map.className = "growth-map";
    domains.forEach(domain => {
      const matches = events.filter(event => event.domain === domain);
      const card = document.createElement("article");
      card.className = `growth-domain${matches.length ? " is-lit" : ""}`;
      const name = document.createElement("span");
      const status = document.createElement("b");
      const detail = document.createElement("small");
      name.textContent = domain;
      status.textContent = matches.length ? `${matches.length} 项演示成果证据` : "尚无成果证据";
      detail.textContent = matches.length ? matches.at(-1).artifact : "不会因登录、点击或阅读时长点亮";
      card.append(name, status, detail);
      map.append(card);
    });
    showBuiltDrawer("成长护照 · 证据优先", "人生六域成长地图", [map, buildTruthNote("只有完成任务并形成成果时才记录；演示成果明确标记 DEMO，不显示虚假百分位或领先排名。")]);
  }

  function openGrowthPassport() {
    const events = growthEvents();
    const intro = document.createElement("p");
    intro.textContent = events.length
      ? "成长来自你完成过的作品、判断和复盘证据，不来自签到或红点。"
      : "尚无可验证成长证据。完成一次完整任务后，这里才会记录作品、方法和下一项练习。";
    const latest = events.at(-1);
    const items = latest ? [
      ["你获得了什么", latest.artifact],
      ["这次哪里做得更好", latest.method],
      ["朝堂替你减少了什么", "把理解、方案、会办、成果与反馈收进同一任务护照"],
      ["下一次只提升一点", latest.nextPractice],
      ["证据状态", `${latest.resultState} · ${latest.evidence}`]
    ] : [["当前状态", "证据不足，暂不排名"], ["正式点亮条件", "完成任务、形成成果、保留任务护照与结果证据"]];
    const pdca = latest ? buildInfoList([["计划 Plan", latest.pdca.plan], ["执行 Do", latest.pdca.do], ["验证 Check", latest.pdca.check], ["改进 Act", latest.pdca.act]], "pdca-grid") : document.createElement("div");
    const actions = document.createElement("div");
    actions.className = "drawer-actions";
    const map = document.createElement("button");
    map.type = "button";
    map.textContent = "查看六域成长地图";
    map.addEventListener("click", openGrowthMap);
    actions.append(map);
    showBuiltDrawer("成长护照 · PDCA", "每一次成果都留下进步证据", [intro, buildInfoList(items), pdca, actions, buildTruthNote("不存在统一任务、量表、样本、作品和测评日期时，不展示“超过99%的人”等排名。")]);
  }

  function openCapabilityHub() {
    const intro = document.createElement("p");
    intro.textContent = "智能版不要求你选择模型、Skill 或插件。先说结果，丞相再解释为什么需要某项能力；确认以前不会调用或消耗算筹。";
    const list = buildInfoList([
      ["更换智能体", "保留同一议题和材料，只改变当前对话对象"],
      ["添加材料与引用", "选择本次任务可用的上下文；不会自动外传"],
      ["Skills 与插件", "按结果推荐；当前原型只显示能力意图，尚未接入"],
      ["最小协作编队", "复杂任务确认后才召集，静殿状态不伪造工作"],
      ["定制版", "需要时再查看模型、Schema、权限、成本和日志"]
    ]);
    const actions = document.createElement("div");
    actions.className = "drawer-actions";
    [["选择智能体", openAgentPicker], ["管理上下文", openContextManager]].forEach(([label, action]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", action);
      actions.append(button);
    });
    showBuiltDrawer("对话能力 · 小白智能版", "更多能力", [intro, list, actions]);
  }

  function openModelPicker() {
    const intro = document.createElement("p");
    intro.textContent = "智能版不要求选择模型；朝堂应根据任务的准确性、速度、隐私、上下文和算筹自动推荐。这里仅预留产品入口，当前不会调用任何模型。";
    const options = [
      ["自动选择", "按结果、风险和材料自动推荐；默认选项"],
      ["深度推理", "适合复杂判断与多材料比较 · 尚未接入"],
      ["快速回应", "适合低风险整理与简短问答 · 尚未接入"],
      ["私有／本地", "适合敏感材料与本地部署 · 尚未接入"]
    ];
    const list = document.createElement("div");
    list.className = "drawer-list agent-picker-list";
    options.forEach(([name, description]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "drawer-choice";
      button.setAttribute("aria-pressed", String(selectedModelMode === name));
      button.innerHTML = `<b>${name}</b><small>${description}</small><em>${selectedModelMode === name ? "当前 · 原型" : "选择意图"}</em>`;
      button.addEventListener("click", () => {
        selectedModelMode = name;
        text("modelDockStatus", name === "自动选择" ? name : `${name} · 待接`);
        openModelPicker();
      });
      list.append(button);
    });
    showBuiltDrawer("对话能力坞 · 模型路由", "选择大模型策略", [intro, list, buildTruthNote("正式版必须从真实模型注册表读取可用性、价格、上下文、数据处理位置和失败回退；不能仅凭名称显示可用。")]);
  }

  function openUpgradeCenter() {
    const intro = document.createElement("p");
    intro.textContent = "升级分为用户能力、Agent、Skill 与标准任务书四条轨道。任何安装、授权、替换或删除都必须先经过来源核验、沙箱评测、独立复核和用户批准。";
    const list = buildInfoList([
      ["用户成长", "用作品、决策质量和真实结果证明，不用签到冒充进步"],
      ["Agent升级", "先与现有能力在固定任务上对照，再小范围试用"],
      ["Skill升级", "检查来源、许可、权限、维护与单位成果成本"],
      ["任务书升级", "把高质量成果沉淀成下一次可复用的标准流程"]
    ]);
    const actions = document.createElement("div");
    actions.className = "drawer-actions";
    [["进入进化殿", "I06"], ["查看能力目录", "D05"], ["查看成长护照", null]].forEach(([label, pageId]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => {
        drawer.close();
        if (pageId) navigateTo(pageId, { taskMode: taskPassport ? "continue" : "clear" });
        else openGrowthPassport();
      });
      actions.append(button);
    });
    showBuiltDrawer("个人朝堂 · 受控进化", "朝堂升级", [intro, list, actions, buildTruthNote("长期未处理不代表同意；当前原型不会安装、启用、替换或删除任何真实能力。")]);
  }

  function openFivePageFeature(type) {
    const definitions = {
      unknowns: ["上书房 · 理解门", "最多两个关键未知", "信息不足时只追问最可能改变方案的两项，不用问卷轰炸用户。", [["未知一", "目标成功的最低标准是什么？"], ["未知二", "什么结果出现时必须停止？"], ["锁定规则", "确认理解以前不显示三策"]]],
      strategyGuide: ["上书房 · 三策", "三策怎样比较", "三策不是三个答案，而是同一目标下不同的速度、风险和投入取舍。", [["稳策", "先补证据，风险最低"], ["衡策", "边验证边推进，设置停止条件"], ["进策", "抢窗口，高频校正且成本更高"]]],
      methodCard: ["上书房 · 翰林教习", "问题定义方法卡", "这张卡是任务结束后可以带走的方法，而不是额外课程。", [["结果", "最后必须交付什么？"], ["边界", "什么不能做、不能超过？"], ["停止条件", "出现什么就不再继续？"]]],
      progressBrief: ["军机处 · DEMO", "今日进展回奏", "只汇报真实任务事件；没有事件时明确待命。", [["当前阶段", taskPassport?.stage || "未建立任务"], ["唯一阻塞", current.action], ["今日事件", taskPassport ? "仅有本地原型状态变更" : "无任务事件"], ["下一步", "先确认范围边界"]]],
      blocker: ["军机处 · 裁决点", "当前唯一阻塞", "只把真正需要用户决定的边界推到前台。", [["阻塞", "是否排除非核心场景"], ["不处理的后果", "继续投入会扩大返工"], ["处理后得到", current.outcome]]],
      intelRadar: ["锦衣卫 · DEMO", "全球信息雷达", "按政治、经济、军事、科技和行业分区，但只把与用户目标相关的信息推到前台。", [["全球政治", "真实来源未接入"], ["经济与市场", "真实来源未接入"], ["军事与安全", "真实来源未接入"], ["科技与 AI", "真实来源未接入"], ["用户行业", "目标画像与来源均未接入"]]],
      sourceConflict: ["锦衣卫 · 验真", "来源冲突对照", "冲突不是错误状态；它提醒用户不要过早把主张当成事实。", [["主张", "关键变化正在发生"], ["支持来源", "尚无第二独立来源"], ["相反信号", "存在一项演示反证"], ["结论", "保持未证实，不进入战略建议"]]],
      impactRouting: ["锦衣卫 · 分发", "这条情报影响谁", "核验后才按影响对象定向分发；锦衣卫不在本页代替部门做预测或专业建议。", [["钦天监", "用于条件推演与触发信号"], ["户部", "用于财富风险与机会研究"], ["礼部", "用于品牌趋势与传播判断"], ["军机处", "若影响在办项目则追加任务事件"]]],
      scenarioRoom: ["钦天监 · DEMO", "三景推演", "不用无依据概率；每种情景都写清条件、行动和失效。", [["上行情景", "若渠道窗口扩大：保留增量投入选项"], ["基线情景", "若条件维持：按检查点小步推进"], ["受阻情景", "若预算收紧：优先守住核心验证"]]],
      triggerCompass: ["钦天监 · 条件", "触发信号罗盘", "信号不是预测成功率，而是提醒何时必须重新判断。", [["转进信号", "核心渠道连续出现可复验证据"], ["转守信号", "现金或预算触及预设安全线"], ["失效条件", "关键外部信息被锦衣卫证伪"], ["转向动作", "生成新版本，不覆盖旧判断"]]],
      forecastReview: ["钦天监 × 史馆", "预测与实际", "只有真实结果回填后才评估判断；当前没有真实预测记录。", [["当时条件", "尚无真实记录"], ["实际结果", "尚未回填"], ["偏差来源", "证据不足，不能归因"], ["改进建议", "先建立统一任务、条件和结果量表"]]]
    };
    const config = definitions[type];
    if (!config) return false;
    const gridClass = type === "scenarioRoom" ? "scenario-grid" : "drawer-list";
    showBuiltDrawer(config[0], config[1], [Object.assign(document.createElement("p"), { textContent: config[2] }), buildInfoList(config[3], gridClass), buildTruthNote("本页面为交互与信息结构演示；未接入的来源、事件、预测和结果不会被包装成实时数据。")]);
    return true;
  }

  function openAgentPicker() {
    const intro = document.createElement("p");
    intro.textContent = "你可以更换当前对话智能体；议题、材料和历史仍保留。部门主责不会因此自动改变。";
    const list = document.createElement("div");
    list.className = "drawer-list agent-picker-list";
    const follow = document.createElement("button");
    follow.type = "button";
    follow.className = "drawer-choice";
    follow.innerHTML = `<b>跟随当前页面推荐</b><small>进入不同部门时自动切换到最合适的主责智能体</small><em>${followsPageAgent ? "当前" : "选择"}</em>`;
    follow.addEventListener("click", () => {
      followsPageAgent = true;
      conversationAgent = recommendedConversationAgent(current);
      renderComposerAgent();
      drawer.close();
      showToast(`已跟随页面推荐：当前与${conversationAgent}商议。`);
    });
    list.append(follow);
    conversationAgents.forEach(([name, description]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "drawer-choice";
      const selected = !followsPageAgent && conversationAgent === name;
      button.innerHTML = `<b>${name}</b><small>${description}</small><em>${selected ? "当前" : "召见"}</em>`;
      button.addEventListener("click", () => {
        followsPageAgent = false;
        conversationAgent = name;
        renderComposerAgent();
        drawer.close();
        const destination = agentDestinations[name];
        if (destination && destination !== current.id) navigateTo(destination, { taskMode: taskPassport ? "continue" : "clear" });
        showToast(`已召见${name}并进入其主责页面；当前议题与引用材料保持不变。`);
      });
      list.append(button);
    });
    const note = document.createElement("small");
    note.className = "feedback-privacy";
    note.textContent = "原型只改变界面中的对话对象，不调用模型，也不表示该智能体已在线。";
    showBuiltDrawer(current.title, "选择对话智能体", [intro, list, note]);
  }

  function openSkillPicker() {
    const intro = document.createElement("p");
    intro.textContent = "小白可以不选；朝堂会按结果推荐。爱好者可把 Skill 作为本次对话的能力意图，正式版必须由真实能力注册表确认可用。";
    const skills = [
      ["深度研究", "跨来源查证并说明证据缺口"],
      ["方案比较", "按目标、成本、风险和停止条件比较"],
      ["项目拆解", "形成里程碑、责任、阻塞和验收"],
      ["资料分析", "从用户材料中提取事实、假设和问题"],
      ["创意生成", "形成文案、图像或视频的创作方案"]
    ];
    const list = document.createElement("div");
    list.className = "drawer-list agent-picker-list";
    skills.forEach(([name, description]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "drawer-choice";
      button.setAttribute("aria-pressed", String(selectedSkills.has(name)));
      button.innerHTML = `<b>${name}</b><small>${description}</small><em>${selectedSkills.has(name) ? "已选 · 原型" : "选择"}</em>`;
      button.addEventListener("click", () => {
        if (selectedSkills.has(name)) selectedSkills.delete(name); else selectedSkills.add(name);
        text("skillDockStatus", selectedSkills.size ? `已选 ${selectedSkills.size}` : "按需选择");
        openSkillPicker();
      });
      list.append(button);
    });
    const note = document.createElement("small");
    note.className = "feedback-privacy";
    note.textContent = "当前只保存本地原型选择，不会执行 Skill 或消耗算筹。";
    showBuiltDrawer("对话能力坞", "选择 Skills", [intro, list, note]);
  }

  function openPluginPicker() {
    const intro = document.createElement("p");
    intro.textContent = "插件负责连接外部信息或工具。所有连接、读取和写入都要单独说明权限；当前原型没有真实插件连接。";
    const plugins = [["文件与云盘", "读取用户明确选择的文件"], ["网页与浏览器", "查找并引用公开信息"], ["表格与数据", "分析结构化数据和动态表格"], ["图像与视频", "连接创作和媒体工作流"]];
    const list = document.createElement("div");
    list.className = "drawer-list agent-picker-list";
    plugins.forEach(([name, description]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "drawer-choice";
      button.setAttribute("aria-pressed", String(selectedPlugins.has(name)));
      button.innerHTML = `<b>${name}</b><small>${description}</small><em>${selectedPlugins.has(name) ? "已选 · 待接入" : "选择意图"}</em>`;
      button.addEventListener("click", () => {
        if (selectedPlugins.has(name)) selectedPlugins.delete(name); else selectedPlugins.add(name);
        text("pluginDockStatus", selectedPlugins.size ? `已选 ${selectedPlugins.size} · 待接` : "尚未接入");
        openPluginPicker();
      });
      list.append(button);
    });
    const note = document.createElement("small");
    note.className = "feedback-privacy";
    note.textContent = "选择只表示你的使用意图；未建立授权、未读取数据、未调用外部服务。";
    showBuiltDrawer("对话能力坞", "选择插件", [intro, list, note]);
  }

  function openVoiceDesign() {
    const intro = document.createElement("p");
    intro.textContent = "语音入口遵循先转写、再预览、后发送。用户始终能看见将要发送的文字，并可删除录音与转写。";
    const list = document.createElement("div");
    list.className = "drawer-list";
    [["按住说话", "适合一句需求；松开后只生成可编辑转写。"], ["连续商议", "适合长讨论；分段确认发言者和议题。"], ["会议纪要", "只在用户明确开始后记录，并显示本地/云端处理边界。"]].forEach(([name, description]) => {
      const article = document.createElement("article");
      article.innerHTML = `<b>${name} · 尚未接入</b><small>${description}</small>`;
      list.append(article);
    });
    const note = document.createElement("small");
    note.className = "feedback-privacy";
    note.textContent = "本原型不会请求麦克风权限或录制声音。";
    showBuiltDrawer("对话能力坞", "语音交互设计", [intro, list, note]);
  }

  function openAgentTeam() {
    const intro = document.createElement("p");
    intro.textContent = "一位主责智能体面对你，其他智能体只在确有需要时形成最小编队。复杂任务先由丞相建议立案，经你确认后才送军机处。";
    const list = document.createElement("div");
    list.className = "drawer-list";
    [[conversationAgent || current.agent, "当前对话对象；负责解释和汇总"], ["锦衣卫", "需要核验事实时加入"], ["钦天监", "需要条件推演时加入"], ["军机处", "复杂任务经确认立案后管理进度与交付"]].forEach(([name, description]) => {
      const article = document.createElement("article");
      article.innerHTML = `<b>${name}</b><small>${description} · 当前仅为原型说明</small>`;
      list.append(article);
    });
    showBuiltDrawer("百司协同", "最小智能体编队", [intro, list]);
  }

  function openContextManager() {
    const intro = document.createElement("p");
    intro.textContent = "切换智能体时保留同一议题和已引用材料；切换议题时旧方案与确认立即失效。";
    const list = document.createElement("div");
    list.className = "drawer-list";
    taskContextLabels(current).forEach(label => {
      const article = document.createElement("article");
      const heading = document.createElement("b");
      const detail = document.createElement("small");
      heading.textContent = label;
      detail.textContent = taskPassport ? `同一任务 · ${taskPassport.id}` : "当前页面上下文 · 未建立任务";
      article.append(heading, detail);
      list.append(article);
    });
    const privacy = document.createElement("article");
    privacy.innerHTML = `<b>记忆与隐私</b><small>正式版必须允许逐项查看、纠正、遗忘和撤销，不用隐性画像替用户做主。</small>`;
    list.append(privacy);
    showBuiltDrawer(current.title, "管理本次上下文", [intro, list]);
  }

  function openTaskPassport() {
    const intro = document.createElement("p");
    intro.textContent = taskPassport
      ? "这是当前唯一任务事实源；页面芯片、上下文管理和任务护照都读取同一份内容。"
      : "当前没有任务护照。只有用户提交目标或明确采用页面推荐后才会建立。";
    const list = document.createElement("div");
    list.className = "drawer-list";
    const entries = taskPassport
      ? [["任务 ID", taskPassport.id], ["用户原话", taskPassport.userInput], ["来源页面", taskPassport.sourcePage], ["当前焦点", taskPassport.focus], ["理解版本", `v${taskPassport.version}`], ["任务阶段", taskPassport.stage], ["数据状态", taskPassport.sourceState]]
      : [["状态", "尚未建立"], ["建立条件", "提交一句目标，或明确采用页面推荐"], ["现实动作", "全部保持锁定"]];
    entries.forEach(([label, value]) => {
      const article = document.createElement("article");
      const heading = document.createElement("b");
      const detail = document.createElement("small");
      heading.textContent = label;
      detail.textContent = value;
      article.append(heading, detail);
      list.append(article);
    });
    showBuiltDrawer(current.title, "任务护照", [intro, list]);
  }

  function openBenchmarkDrawer() {
    const benchmark = current.benchmark;
    const missingMarker = /尚未|尚无|待|不足|未定义|未测评/;
    const verified = current.benchmarkState === "VERIFIED" && [benchmark.cohort, benchmark.sample, benchmark.rubric, benchmark.artifact, benchmark.measuredAt, benchmark.uncertainty].every(value => value && !missingMarker.test(value));
    const intro = document.createElement("p");
    intro.textContent = verified
      ? "该相对位置已具备作品、统一任务、评分量表和有效样本；仍应按测评日期与适用人群理解。"
      : "当前证据不足，因此不显示“前1%”“超过多少人”等排名。先展示你真实完成了什么，再补齐对标条件。";
    const list = document.createElement("div");
    list.className = "drawer-list";
    [
      ["对标人群", current.benchmark.cohort],
      ["有效样本", current.benchmark.sample],
      ["任务与量表", current.benchmark.rubric],
      ["成果证据", current.benchmark.artifact],
      ["测评时间", benchmark.measuredAt],
      ["不确定性", benchmark.uncertainty]
    ].forEach(([label, value]) => {
      const article = document.createElement("article");
      article.innerHTML = `<b>${label}</b><small>${value}</small>`;
      list.append(article);
    });
    const note = document.createElement("small");
    note.className = "feedback-privacy";
    note.textContent = "正式版只在样本定义、样本量、任务一致性、评分标准、测评日期和可核验成果都存在时显示百分位，并优先显示区间而非伪精确数字。";
    showBuiltDrawer("真实成长 · 证据优先", "能力对标依据", [intro, list, note]);
  }

  const drawerContent = {
    alerts: ["重要预警", "演示原型中的预警不会声称实时", ["一项证据缺口可能改变当前判断", "一项外部动作尚未获得用户授权"]],
    todo: ["待你处理", "只集中展示真正需要用户确认的事项", ["确认当前问题是否理解正确", "补充一项关键材料", "预览并确认下一阶段后果"]],
    growth: ["升级体系", "用户、Agent、Skill 与任务书四条轨道", ["用户升级：更会判断和驾驭 AI", "Agent 升级：真实结果质量与可靠性", "Skill 升级：复用率与单位成本", "任务书升级：标准化与可交付价值"]],
    compute: ["算筹", "平台内可核销算力额度，不是虚拟币或金融资产", ["任务开始前预览预计消耗", "确认以前不扣除", "定制版可设置任务和周期上限"]],
    account: ["用户设置 · 设计预览", "借鉴 Codex 的低学习成本设置结构；本原型尚未保存设置，正式版所有偏好都要可预览、撤销和恢复默认", ["通用：语言、主题、字体、轻动画与无障碍", "对话：回答详略、默认智能体、推荐强度与反对意见", "语音：输入设备、转写预览、声音与隐私（尚未接入）", "Skills 与插件：选择、权限、来源和真实可用状态", "上下文与记忆：查看、纠正、暂时停用与彻底遗忘", "通知与预警：重要程度、勿扰时段与渠道", "隐私与权限：材料、外部读取、写入和撤销", "算筹与用量：任务前预估、周期上限和历史", "数据：导入、导出、备份与删除确认", "定制版：能力注册表、Provider、Schema 和日志", "账户：身份、安全、设备与退出"]],
    briefing: ["今日朝报", "按项目、预测、情报、代办与预警分组", ["项目：只显示真实里程碑和阻塞", "预测：显示条件、触发与失效，不伪造概率", "情报：仙狐采集原料、锦衣卫核验", "代办：只显示已授权范围", "预警：说明影响与最迟处理时间"]],
    agents: ["召见智能体", "一位主责，可按需加入最小协作成员", ["丞相：统一协调与最终综合", "锦衣卫：事实与证据核验", "钦天监：条件推演", "六部/专署：专业分奏", "人类审核者：独立身份，只在需要时进入审核门"]],
    materials: ["材料与引用", "每份材料必须说明来源状态与当前用途", ["当前议题摘要 · 演示", "用户上传材料 · 尚未提供", "部门回奏 · 尚未接入", "公开来源 · 尚未接入"]],
    evidence: ["证据、来源与缺口", "本原型不伪造真实来源、可信度或更新时间", ["来源状态：DEMO", "真实来源：未接入", "反证：页面合同已预留", "缺口：正式接入后动态显示"]],
    history: ["历史与版本", "切换议题后旧理解、三策和授权立即失效", ["当前任务护照：演示任务", "旧版本：只读保留", "成果与证据：追加，不覆盖", "实际结果：由史馆回填"]],
    system: ["系统细节", "定制版的三级入口，不干扰小白主流程", ["执行图与依赖", "Capability Registry 状态", "权限范围与撤销", "版本、日志与成本", "Provider 与 Schema（待接入）"]],
    passport: ["任务护照", "跨页面始终是同一件事", ["canonical task：DEMO-TASK-001", "当前议题与材料", "参与者与权限", "版本与官印", "现实动作授权"]],
    permissions: ["权限边界", "所有高影响动作都要预览并明确确认", ["读取材料", "调用能力", "外部发送", "付款与交易", "发布与删除"]],
    versions: ["版本与日志", "原型只展示结构，不伪造真实执行事件", ["理解版本", "方案版本", "成果版本", "授权版本", "审计记录"]],
    capability: ["能力状态", "正式状态必须来自真实 Capability Registry", ["LIVE：真实链路通过验证", "PILOT：限定范围试运行", "DEMO：演示逻辑", "待接入：没有真实后端"]],
    assumptions: ["假设与条件", "每次调整只改变一个变量并生成新版本", ["已知事实", "关键未知（最多两项）", "触发信号", "失效条件"]],
    workflow: ["执行图", "只有真实任务事件才显示小队离阵", ["发现 → 预测", "商议 → 决策", "执行 → 复盘", "结果回填 → 进化"]]
  };

  function openDrawer(type, customTitle) {
    if (type === "briefing" || type === "morningBrief") { openDailyBriefing("morning"); return; }
    if (type === "eveningReport") { openDailyBriefing("evening"); return; }
    if (type === "growthMap") { openGrowthMap(); return; }
    if (type === "growth") { openGrowthPassport(); return; }
    if (type === "upgrade") { openUpgradeCenter(); return; }
    if (type === "models") { openModelPicker(); return; }
    if (type === "capabilityHub") { openCapabilityHub(); return; }
    if (openFivePageFeature(type)) return;
    if (type === "agents") { openAgentPicker(); return; }
    if (type === "skills") { openSkillPicker(); return; }
    if (type === "plugins") { openPluginPicker(); return; }
    if (type === "voice") { openVoiceDesign(); return; }
    if (type === "agentTeam") { openAgentTeam(); return; }
    if (type === "contextManager") { openContextManager(); return; }
    if (type === "passport") { openTaskPassport(); return; }
    if (type === "benchmark") { openBenchmarkDrawer(); return; }
    if (["advice", "example", "coach", "coordination", "glossary"].includes(type) && openGuidanceDrawer(type)) return;
    if (type === "result") { openResultPackage(); return; }
    const content = drawerContent[type] || [customTitle || "详情", "当前对象的完整上下文", ["查看内容", "查看来源与缺口", "交给丞相统筹"]];
    text("drawerKicker", current.title);
    text("drawerTitle", customTitle || content[0]);
    const body = $("drawerBody");
    body.innerHTML = `<p>${content[1]}</p><div class="drawer-list">${content[2].map((item, index) => `<article><b>${index + 1}. ${item}</b><small>原型说明 · 不触发真实执行</small></article>`).join("")}</div>`;
    window.setTimeout(() => { if (!drawer.open) drawer.showModal(); }, 0);
  }

  function navigateTo(id, options = {}) {
    const next = pageMap.get(id);
    const taskMode = options.taskMode || (options.preserveContext ? "continue" : "clear");
    if (next && next.id !== current.id) renderPage(next, true, { ...options, taskMode });
    setMinistriesMenu(false);
    if (atlas.open) atlas.close();
  }

  function openTaskResultPage() {
    if (!taskPassport || taskPassport.stage !== "result") {
      openDrawer("workflow");
      showToast("同一任务尚未完成：先确认理解、选择方案并完成本地演示会办。");
      return;
    }
    navigateTo("D04", { taskMode: "continue" });
  }

  function setMinistriesMenu(open, restoreFocus = false) {
    const button = document.querySelector("[data-menu='ministries']");
    ministriesMenu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) ministriesMenu.querySelector("[role='menuitem']")?.focus();
    else if (restoreFocus) button.focus();
  }

  let atlasLevel = "全部层级";
  let atlasGroup = "全部";

  function renderAtlas() {
    const target = $("atlasGrid");
    const visible = pages.filter(page => (atlasLevel === "全部层级" || page.level === atlasLevel) && (atlasGroup === "全部" || page.group === atlasGroup));
    text("atlasCount", `${visible.length} / ${pages.length} 个页面 · ${atlasLevel} · ${atlasGroup}`);
    target.replaceChildren(...visible.map(page => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "atlas-card";
      button.dataset.page = page.id;
      button.style.backgroundImage = `url("${page.scene}")`;
      const parent = page.parentPage ? pageMap.get(page.parentPage)?.title : "朝堂总图谱";
      button.innerHTML = `<span>${page.id} · ${page.group} · ${page.level}</span><b>${page.title}</b><small>${page.subtitle}<br>上级：${parent}</small>`;
      button.addEventListener("click", () => navigateTo(page.id));
      return button;
    }));
  }

  function buildAtlas() {
    const filters = $("atlasFilters");
    const levelFilters = document.createElement("div");
    levelFilters.className = "atlas-level-filter";
    ["全部层级", "主页面", "次级页面", "三级页面"].forEach((name, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = name;
      button.dataset.levelFilter = name;
      if (index === 0) button.classList.add("is-active");
      button.addEventListener("click", () => {
        atlasLevel = name;
        document.querySelectorAll("[data-level-filter]").forEach(candidate => candidate.classList.toggle("is-active", candidate === button));
        renderAtlas();
      });
      levelFilters.append(button);
    });
    const groupSelect = document.createElement("select");
    groupSelect.setAttribute("aria-label", "按机构筛选页面");
    groupNames.forEach(name => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name === "全部" ? "全部机构" : name;
      groupSelect.append(option);
    });
    groupSelect.addEventListener("change", () => { atlasGroup = groupSelect.value; renderAtlas(); });
    filters.replaceChildren(levelFilters, groupSelect);
    renderAtlas();
  }

  function bindStaticControls() {
    document.querySelectorAll("[data-page]:not(.atlas-card)").forEach(button => button.addEventListener("click", () => navigateTo(button.dataset.page)));
    document.querySelectorAll("[data-agent-picker]").forEach(button => button.addEventListener("click", openAgentPicker));
    $("taskResultShortcut")?.addEventListener("click", openTaskResultPage);
    $("resumeTaskButton")?.addEventListener("click", resumeSavedTask);
    const menuButton = document.querySelector("[data-menu='ministries']");
    menuButton.addEventListener("click", () => setMinistriesMenu(ministriesMenu.hidden));
    document.querySelectorAll(".mode-switch button[data-mode]").forEach(button => button.addEventListener("click", () => {
      applyMode(button.dataset.mode, true);
    }));
    document.querySelectorAll("[data-scroll-toggle]").forEach(button => button.addEventListener("click", toggleScroll));
    document.querySelectorAll("[data-scroll-collapse]").forEach(button => button.addEventListener("click", () => {
      app.dataset.scroll = "seal";
      updateScrollLabel();
    }));
    document.querySelectorAll("[data-surface]").forEach(button => button.addEventListener("click", () => renderCentralSurface(button.dataset.surface)));
    document.querySelectorAll("[data-collapse]").forEach(button => button.addEventListener("click", () => {
      const side = button.dataset.collapse;
      const panel = document.querySelector(`.${side}-panel`);
      setPanelCollapsed(side, !panel.classList.contains("is-collapsed"));
    }));
    document.querySelectorAll("[data-open]:not(.panel-item)").forEach(button => button.addEventListener("click", () => {
      if (button.dataset.open === "atlas") { if (!atlas.open) atlas.showModal(); }
      else if (app.dataset.mode === "smart" && ["advice", "example", "coach", "glossary", "coordination"].includes(button.dataset.open)) renderCentralSurface(button.dataset.open);
      else openDrawer(button.dataset.open, button.dataset.itemTitle);
    }));
    document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => button.closest("dialog")?.close()));
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !ministriesMenu.hidden) {
        event.preventDefault();
        setMinistriesMenu(false, true);
      }
    });
    document.addEventListener("click", event => {
      if (!ministriesMenu.hidden && !ministriesMenu.contains(event.target) && !menuButton.contains(event.target)) setMinistriesMenu(false);
    });
    document.addEventListener("mouseover", event => {
      const button = event.target.closest("button");
      if (!button || (event.relatedTarget && button.contains(event.relatedTarget))) return;
      scheduleTutor(button);
    });
    document.addEventListener("mouseout", event => {
      const button = event.target.closest("button");
      if (!button || (event.relatedTarget && button.contains(event.relatedTarget))) return;
      hideTutor();
    });
    document.addEventListener("focusin", event => {
      const button = event.target.closest("button");
      if (button) scheduleTutor(button);
    });
    document.addEventListener("focusout", event => {
      if (event.target.closest("button")) hideTutor();
    });
  }

  document.querySelectorAll("[data-strategy]").forEach(button => button.addEventListener("click", () => chooseStrategy(button)));

  $("primaryAction").addEventListener("click", () => {
    if (current.id === "A01" && app.dataset.mode === "smart") {
      if (taskState === "quiet") {
        if (!taskPassport) createTaskPassport(current.action, { sourcePage: current.id, focus: current.action, contexts: current.contexts, inputSource: "PAGE_RECOMMENDATION" });
        setTaskStage("summoned");
        app.dataset.taskPassport = taskPassport.id;
        setTaskState("summoned");
        text("primaryAction", "进入上书房确认理解");
        text("primaryConsequence", "点击后：进入同一任务的理解确认页；不会自动生成方案或执行。");
        showToast("丞相已由你的点击召见；这是本地演示事件，其他官员仍然待命。");
      } else navigateTo("A02", { taskMode: "continue" });
      return;
    }
    if (current.id === "A02") {
      if (discussionState === "understanding") {
        discussionState = "options";
        app.dataset.scroll = "compare";
        updateDiscussionState();
        showToast("理解已经确认：现在展示三策；尚未生成奏请或触发执行。");
      } else if (discussionState === "options" && selectedStrategy) {
        discussionState = "draft";
        app.dataset.scroll = "full";
        createPetitionDraft();
        updateDiscussionState();
        showToast(`已采用${selectedStrategy}形成本地奏请草案；外部动作仍然锁定。`);
      } else if (discussionState === "draft") openPetitionPreview();
      updateScrollLabel();
      return;
    }
    if (current.id === "A03" && taskPassport?.stage === "coordinate") {
      setTaskStage("result");
      setTaskState("result");
      text("primaryAction", "进入同一任务成果");
      text("primaryConsequence", "点击后：携带同一任务护照进入成果页；不会自动下载或触发现实动作。");
      showToast("本地演示会办已形成可下载演示成果；未调用真实模型、部门或外部服务。");
      return;
    }
    if (current.id === "A03" && taskPassport?.stage === "result") {
      openTaskResultPage();
      return;
    }
    if (current.id === "D04") {
      if (taskPassport?.stage === "result") openResultPackage();
      else openDrawer("workflow");
      return;
    }
    if (app.dataset.mode === "smart") setTaskState("summoned");
    showToast(`${current.primary}：已进入本地演示下一阶段；没有触发真实任务或外部动作。`);
    if (app.dataset.scroll === "seal") app.dataset.scroll = "half";
    updateScrollLabel();
  });

  promptInput.addEventListener("input", () => { sendButton.disabled = !promptInput.value.trim(); });
  $("explainNextAction").addEventListener("click", () => {
    promptInput.value = `请${current.agent}先用小白能懂的话解释：为什么推荐“${current.action}”，我会得到什么，还有什么风险？`;
    sendButton.disabled = false;
    promptInput.focus();
    showToast("解释请求已放入对话栏；你可以修改后再发送，不会直接执行建议。");
  });
  $("deferNextAction").addEventListener("click", () => {
    if (!taskPassport) createTaskPassport(current.action, { sourcePage: current.id, focus: current.action, contexts: current.contexts, inputSource: "PAGE_RECOMMENDATION" });
    persistTaskSnapshot();
    showToast("已暂存当前建议：页面、上下文和任务状态保持不变，没有消耗算筹或触发外部动作。");
  });
  promptInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (!sendButton.disabled) sendButton.click(); }
  });
  sendButton.addEventListener("click", () => {
    const submitted = promptInput.value.trim();
    if (current.id === "A02") updateTopicUnderstanding(submitted);
    else {
      createTaskPassport(submitted, { sourcePage: current.id, focus: submitted, contexts: current.contexts });
      navigateTo("A02", { taskMode: "continue" });
      showToast("已把你的原话带入上书房理解卡；尚未发送到任何模型或外部系统。");
    }
    promptInput.value = "";
    sendButton.disabled = true;
  });

  [drawer, atlas].forEach(dialog => dialog.addEventListener("click", event => {
    const box = dialog.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    if (outside) dialog.close();
  }));

  buildAtlas();
  const requested = new URLSearchParams(location.hash.replace(/^#/, "")).get("page");
  const initialPage = pageMap.get(requested) || current;
  history.replaceState({ page: initialPage.id }, "", `#page=${initialPage.id}`);
  renderPage(initialPage, false);
  bindStaticControls();
  window.addEventListener("hashchange", () => {
    const id = new URLSearchParams(location.hash.replace(/^#/, "")).get("page");
    const next = pageMap.get(id) || pageMap.get("A01");
    if (next && next.id !== current.id) renderPage(next, false, { taskMode: "clear", routeChange: true });
  });
  if (!preferencesAvailable) showToast("偏好暂时不可用，请刷新朝堂页面重试；已保存的任务和成果不会被删除。");
})();

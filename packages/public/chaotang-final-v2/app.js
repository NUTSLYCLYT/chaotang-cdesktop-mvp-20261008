(function () {
  "use strict";

  const pages = window.CHAOTANG_PAGES || [];
  const pageMap = new Map(pages.map(page => [page.id, page]));
  const decreeJobUi = window.CHAOTANG_DECREE_JOB_UI || {};
  const app = document.getElementById("app");
  const scene = document.getElementById("scene");
  const drawer = document.getElementById("drawer");
  const atlas = document.getElementById("atlas");
  const ministriesMenu = document.getElementById("ministriesMenu");
  const specialsMenu = document.getElementById("specialsMenu");
  const promptInput = document.getElementById("promptInput");
  const sendButton = document.getElementById("sendButton");
  const toast = document.getElementById("toast");
  let current = pageMap.get("A01");
  let discussionState = "default";
  let selectedStrategy = "";
  let currentTopicInput = "";
  let understandingVersion = 1;
  let decreeDraftVersion = 0;
  let activeDecreeFingerprint = "";
  let petitionDraft = null;
  let taskState = "quiet";
  let taskPassport = null;
  let activeRailPreview = null;
  let activeOfficeContext = null;
  let taskSequence = 0;
  let feedbackChoice = "";
  let conversationAgent = "";
  let followsPageAgent = true;
  const selectedSkills = new Set();
  const selectedPlugins = new Set();
  let selectedModelMode = "自动选择";
  let toastTimer;
  let tutorTimer;
  let tutorPinned = false;
  const CONTINUITY_KEY = "chaotang-demo-task-continuity-v1";
  const GROWTH_KEY = "chaotang-demo-growth-events-v1";
  const VISIT_KEY = "chaotang-demo-visit-v1";
  const ONBOARDING_KEY = "chaotang-demo-onboarding-v2";
  const ONBOARDING_STEPS = [
    {
      title: "您现在最想先改善什么？",
      intro: "不必理解部门、模型或工具，选择最接近的一项即可。",
      key: "goal",
      options: [
        ["业", "事业突破", "项目、增长、客户与工作效率"], ["财", "财富增长", "现金、预算、投资与商业机会"],
        ["学", "学习进化", "学会 AI、专业知识与新能力"], ["生", "生活更轻松", "日程、家庭、出行与日常代办"],
        ["健", "健康准备", "整理变化、健康记录与就医问题"], ["乐", "创作娱乐", "图片、视频、内容与高质量休闲"],
        ["急", "先解决眼前问题", "暂时不分类，直接处理当前最急的事"]
      ]
    },
    {
      title: "您最希望先拿到什么结果？",
      intro: "朝堂后台可以很复杂，但前台先只交付一种最有用的结果。",
      key: "result",
      options: [
        ["断", "一句明确判断", "告诉我今天最重要的是什么"], ["策", "一份可执行方案", "给出步骤、取舍与停止条件"],
        ["果", "一个可下载成果", "报告、清单、表格或内容成品"], ["项", "一个持续推进项目", "组织智能体、跟踪阻塞并验收" ]
      ]
    },
    {
      title: "为了这个结果，您最不能牺牲什么？",
      intro: "真正懂你，不只是知道你想要什么，也要知道哪条底线不能碰。",
      key: "boundary",
      options: [
        ["时", "我的时间", "不接受长期占用自己或家人的时间"], ["健", "健康与精力", "不以透支身体和长期压力换结果"],
        ["家", "家庭与关系", "不让工作或收益破坏重要关系"], ["财", "现金安全", "不承担超出承受能力的资金风险"],
        ["信", "隐私与信誉", "不泄露敏感信息，不损害长期信用"], ["正", "质量与原则", "不以欺骗、违法或粗制滥造换速度"],
        ["问", "我还不确定", "请丞相先提醒我可能失去什么"]
      ]
    }
  ];
  let onboardingStep = 0;
  let onboardingChoices = {};
  let transientOnboardingPreference = null;

  const conversationAgents = [
    ["丞相", "统筹未知问题，先复述理解，再协调各部"],
    ["户部尚书", "现金、预算、投资与风险判断"],
    ["钦天监监正", "条件推演、触发信号与失效边界"],
    ["锦衣卫指挥使", "事实、来源、反证与证据缺口"],
    ["丞相 · 军机处", "丞相统筹，军机处承办项目、阻塞、里程碑与交付"],
    ["翰林学士", "学习、练习、知识与 Skill 孵化"],
    ["吏部尚书", "人类员工、智能体员工、职责与能力编制"],
    ["礼部尚书", "品牌、内容、传播、商务与用户体验"],
    ["兵部尚书", "增长、客户、渠道、报价与竞争行动"],
    ["刑部尚书", "合同、合规、授权、风险与争议"],
    ["工部尚书", "产品、技术、进度、质量与交付"],
    ["鸿胪寺卿", "外部模型、Skill、数据、专家与合作准入"]
  ];
  const agentDestinations = {
    "丞相": "A02", "丞相 · 军机处": "A03", "锦衣卫指挥使": "C01", "钦天监监正": "C02", "翰林学士": "C03",
    "吏部尚书": "B01", "户部尚书": "B02", "礼部尚书": "B03", "兵部尚书": "B04", "刑部尚书": "B05", "工部尚书": "B06", "鸿胪寺卿": "P01"
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
    A06: "archive",
    A02: "decree",
    A03: "map",
    B01: "panorama",
    B02: "panorama",
    B03: "panorama",
    B04: "panorama",
    B05: "panorama",
    B06: "panorama",
    C01: "evidence",
    C02: "star",
    C03: "ranking",
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
    O01: "decree", O02: "evidence", O03: "storyboard", O04: "decree",
    P01: "gateway", P02: "gateway", P03: "gateway", P04: "evidence",
    R01: "archive", R02: "archive", R03: "evidence", R04: "archive",
    S01: "map", S02: "evidence",
    T01: "map", T02: "evidence", T03: "ledger", U01: "decree"
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
    composerTools: "按需添加材料、Skill、插件、协作或管理上下文；默认不会调用任何能力。",
    draftDecree: "把模糊想法整理成结果、边界、证据和停止条件；只生成可编辑草案，不会自动发送或执行。",
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
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (_error) { return fallback; }
  }

  function writeLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_error) { return false; }
  }

  function onboardingChoiceLabel(key) {
    const step = ONBOARDING_STEPS.find(item => item.key === key);
    return step?.options.find(option => option[1] === onboardingChoices[key])?.[1] || onboardingChoices[key] || "尚未选择";
  }

  function renderOnboarding() {
    const progress = $("onboardingProgress");
    const progressValue = Math.min(onboardingStep + 1, ONBOARDING_STEPS.length + 1);
    progress.setAttribute("aria-valuenow", String(progressValue));
    progress.setAttribute("aria-valuetext", onboardingStep < ONBOARDING_STEPS.length ? `第${progressValue}问，共${ONBOARDING_STEPS.length}问` : "确认丞相理解");
    progress.replaceChildren(...[0, 1, 2, 3].map(index => {
      const marker = document.createElement("i");
      marker.className = index < onboardingStep ? "is-done" : index === onboardingStep ? "is-current" : "";
      return marker;
    }));
    const options = $("onboardingOptions");
    const summary = $("onboardingSummary");
    const next = $("onboardingNext");
    const back = $("onboardingBack");
    back.hidden = onboardingStep === 0;
    back.textContent = onboardingStep >= ONBOARDING_STEPS.length ? "返回修改" : "上一问";
    if (onboardingStep < ONBOARDING_STEPS.length) {
      const step = ONBOARDING_STEPS[onboardingStep];
      text("onboardingKicker", `丞相调研 · 第 ${onboardingStep + 1} 问，共 3 问`);
      text("onboardingTitle", step.title);
      text("onboardingIntro", step.intro);
      summary.hidden = true;
      options.hidden = false;
      options.replaceChildren(...step.options.map(([sigil, label, detail]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "onboarding-option";
        button.setAttribute("aria-pressed", String(onboardingChoices[step.key] === label));
        const icon = document.createElement("span");
        const copy = document.createElement("div");
        const title = document.createElement("b");
        const description = document.createElement("small");
        icon.textContent = sigil;
        title.textContent = label;
        description.textContent = detail;
        copy.append(title, description);
        button.append(icon, copy);
        button.addEventListener("click", () => {
          onboardingChoices[step.key] = label;
          options.querySelectorAll("button").forEach(candidate => candidate.setAttribute("aria-pressed", String(candidate === button)));
          next.disabled = false;
          next.textContent = onboardingStep === 2 ? "查看丞相理解" : "继续";
        });
        return button;
      }));
      next.disabled = !onboardingChoices[step.key];
      next.textContent = onboardingStep === 2 ? "查看丞相理解" : onboardingChoices[step.key] ? "继续" : "选择后继续";
      requestAnimationFrame(() => $("onboardingTitle")?.focus({ preventScroll: true }));
      return;
    }
    text("onboardingKicker", "丞相复述 · 请确认理解");
    text("onboardingTitle", "臣先这样为您安排");
    text("onboardingIntro", "这里只保存使用偏好，不代表朝堂已经获得您的真实资料或完成任何分析。");
    options.hidden = true;
    summary.hidden = false;
    summary.replaceChildren();
    const understanding = document.createElement("b");
    understanding.textContent = `您最想先改善“${onboardingChoiceLabel("goal")}”，希望先得到“${onboardingChoiceLabel("result")}”，最不能牺牲“${onboardingChoiceLabel("boundary")}”。`;
    const explanation = document.createElement("p");
    explanation.textContent = "进入大殿后，左栏确认愿望与结果，右栏提醒代价、底线与证据；复杂能力由丞相在需要时召集。";
    const promises = document.createElement("ol");
    ["建议前校准：愿望、结果、代价、底线、证据", "先复述理解，再给一个推荐选择", "付款、发布、发送等现实操作必须预览确认"].forEach(item => {
      const li = document.createElement("li"); li.textContent = item; promises.append(li);
    });
    summary.append(understanding, explanation, promises);
    next.disabled = false;
    next.textContent = "进入大殿，看我的第一步";
    requestAnimationFrame(() => $("onboardingTitle")?.focus({ preventScroll: true }));
  }

  function openOnboarding(force = false) {
    const dialog = $("onboarding");
    if (!force && (readLocal(ONBOARDING_KEY, null) || transientOnboardingPreference)) return;
    const saved = force ? (readLocal(ONBOARDING_KEY, null) || transientOnboardingPreference) : null;
    onboardingChoices = saved && !saved.skipped ? { goal: saved.goal, result: saved.result, boundary: saved.boundary } : {};
    onboardingStep = 0;
    renderOnboarding();
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => $("onboardingTitle")?.focus({ preventScroll: true }));
  }

  function completeOnboarding(skipped = false) {
    const preference = skipped ? { skipped: true, sourceState: "DEMO", savedAt: new Date().toISOString() } : { ...onboardingChoices, style: "直接推荐一个选择", cost: "尚待结合具体任务校准", skipped: false, sourceState: "DEMO", savedAt: new Date().toISOString() };
    const saved = writeLocal(ONBOARDING_KEY, preference);
    transientOnboardingPreference = preference;
    $("onboarding").close();
    const destination = pageMap.get("A01");
    if (current.id === "A01") renderPage(destination, false, { taskMode: "clear" });
    else navigateTo("A01");
    if (!saved) showToast("浏览器未能保存偏好；本次会话会临时沿用，关闭页面后可能丢失。");
    else showToast(skipped ? "已跳过本地偏好设置；你仍可直接告诉丞相想得到什么。" : "丞相已记录本地演示偏好；尚未连接账户或真实数据。");
    $("primaryAction")?.focus({ preventScroll: true });
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
    try { localStorage.removeItem(CONTINUITY_KEY); } catch (_error) { /* local continuity is optional */ }
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
      artifact: taskPassport.resultFormat || growth.artifact,
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
      resultTargetPage: options.resultTargetPage || null,
      resultTitle: options.resultTitle || null,
      resultFormat: options.resultFormat || null,
      sourceState: "DEMO",
      stage: "intent",
      jobState: null,
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
      ...(taskPassport.officeName ? [`来源各司：${taskPassport.departmentName} · ${taskPassport.officeName}`] : []),
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
      const mediumName = $("displayMediumLabel")?.textContent || "中央展示";
      return [label, `作用：展开或收起${mediumName}。后果：只改变信息展示，不改变任务状态。`]; 
    }
    return [label, `作用：打开对应的本地原型说明。后果：不会调用模型、消耗算筹或产生外部操作。小白可以说：“${current.nextPrompt}”`]; 
  }

  function placeTutorAtPointer(clientX, clientY) {
    const tutor = $("buttonTutor");
    if (!tutor || tutor.hidden || tutorPinned) return;
    const appRect = app.getBoundingClientRect();
    const width = Math.min(330, Math.max(240, window.innerWidth - 44));
    const height = Math.max(92, tutor.offsetHeight || 112);
    const preferredLeft = clientX - appRect.left + 18;
    const left = Math.min(appRect.width - width - 12, Math.max(12, preferredLeft));
    const preferredTop = clientY - appRect.top - 14;
    const top = Math.min(appRect.height - height - 12, Math.max(12, preferredTop));
    tutor.style.left = `${left}px`;
    tutor.style.top = `${top}px`;
    tutor.style.right = "auto";
    tutor.style.bottom = "auto";
  }

  function scheduleTutor(button, pointer) {
    if (tutorPinned) return;
    window.clearTimeout(tutorTimer);
    tutorTimer = window.setTimeout(() => {
      const [title, detail] = getTutorCopy(button);
      text("buttonTutorTitle", title);
      text("buttonTutorDetail", detail);
      $("buttonTutor").hidden = false;
      if (pointer?.clientX != null) placeTutorAtPointer(pointer.clientX, pointer.clientY);
      else {
        const rect = button.getBoundingClientRect();
        placeTutorAtPointer(rect.right, rect.top + rect.height / 2);
      }
    }, 380);
  }

  function hideTutor() {
    if (tutorPinned) return;
    window.clearTimeout(tutorTimer);
    const tutor = $("buttonTutor");
    tutor.hidden = true;
    tutor.style.left = "";
    tutor.style.top = "";
    tutor.style.right = "";
    tutor.style.bottom = "";
  }

  function closePinnedTutor() {
    tutorPinned = false;
    const tutor = $("buttonTutor");
    tutor.classList.remove("is-pinned");
    tutor.hidden = true;
    tutor.style.left = "";
    tutor.style.top = "";
    tutor.style.right = "";
    tutor.style.bottom = "";
  }

  function showGuidanceNear(button, type) {
    const copies = {
      advice: ["为什么值得做", `${current.verdict} ${current.impact}`],
      example: [`最后能带走：${current.exampleCase.artifact}`, `你可以照着说：${current.exampleCase.starter}`],
      coach: ["照着这样说", current.nextPrompt],
      glossary: ["名词不用先学", "先说想得到的结果；术语、模型、Skill和部门只在你主动展开时解释。"],
      coordination: ["朝堂怎样协同", "你只面对一位主责；跨部门事项由丞相建立同一任务，军机处按真实事件推进。"]
    };
    const [title, detail] = copies[type] || getTutorCopy(button);
    const tutor = $("buttonTutor");
    text("buttonTutorTitle", title);
    text("buttonTutorDetail", detail);
    tutor.hidden = false;
    tutorPinned = true;
    tutor.classList.add("is-pinned");
    const appRect = app.getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    const width = Math.min(330, Math.max(240, window.innerWidth - 44));
    const left = Math.min(appRect.width - width - 14, Math.max(14, rect.left - appRect.left));
    const estimatedHeight = 128;
    const below = rect.bottom - appRect.top + 8;
    const top = below + estimatedHeight < appRect.height - 12 ? below : Math.max(12, rect.top - appRect.top - estimatedHeight - 8);
    tutor.style.left = `${left}px`;
    tutor.style.top = `${top}px`;
    tutor.style.right = "auto";
    tutor.style.bottom = "auto";
  }

  function updateDisplayTabsForMode(page = current, mode = app.dataset.mode || "smart") {
    if (!page) return;
    const generic = mode === "smart"
      ? { brief: "建议", progress: "进展", materials: "依据", result: "成果" }
      : { brief: "判断", progress: "办理", materials: "材料", result: "成果" };
    const customLabels = {
      A02: { brief: "商议", progress: "奏折", materials: "大势", result: "圣旨" },
      A03: { brief: "项目", progress: "事件", materials: "蜂群", result: "成果" },
      A06: { brief: "档案总卷", progress: "进化", materials: "知识库", result: "数据册" },
      C03: { brief: "今日进化", progress: "状元榜", materials: "能力科举", result: "升级奏请" },
      P01: { brief: "万邦总图", progress: "大模型", materials: "外接设备", result: "交易市集" }
    };
    const smartLabels = {
      A02: { brief: "商议", progress: "奏折", materials: "大势", result: "圣旨" },
      A03: { brief: "项目", progress: "进展", materials: "蜂群", result: "成果" },
      A06: { brief: "档案", progress: "进化", materials: "知识", result: "成果" },
      C03: { brief: "学习", progress: "榜单", materials: "评测", result: "升级" },
      P01: { brief: "总览", progress: "模型", materials: "设备", result: "市集" }
    };
    const labels = (mode === "smart" ? smartLabels[page.id] : customLabels[page.id]) || generic;
    document.querySelectorAll(".display-tabs [data-surface]").forEach(button => {
      button.textContent = labels[button.dataset.surface] || button.textContent;
      const hidden = mode === "smart" && button.dataset.surface === "materials";
      button.hidden = hidden;
      button.setAttribute("aria-hidden", String(hidden));
      button.tabIndex = hidden ? -1 : 0;
    });
    document.querySelector(".display-tabs")?.setAttribute("aria-label", mode === "smart"
      ? "简明工作区：建议、进展与成果"
      : "专业工作区：判断、办理、材料与成果");
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
    updateDisplayTabsForMode(current, mode);
    if (announce) {
      app.dataset.scroll = "seal";
      updateScrollLabel();
      showToast(mode === "smart" ? "已切换智能版：中央只保留一份可收起的工作卷。" : "已切换定制版：展开材料、证据、能力、权限和日志入口。");
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
    if (current?.id === "A01") {
      text("smartAgentRoleLabel", "");
      text("smartAgentPosture", current.personaIntro);
      text("smartAgentSummon", nextState === "quiet" ? "召见" : "查看");
    }
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
    const jobState = taskPassport.jobState || (taskPassport.stage === "result" ? "RESULT_READY" : taskPassport.stage === "coordinate" ? "QUEUED" : null);
    const config = jobState ? decreeJobUi[jobState] : null;
    if (config) {
      taskPassport.jobState = jobState;
      app.dataset.jobState = jobState;
      app.dataset.jobAllowCancel = String(config.allowCancel);
      app.dataset.jobShowResult = String(config.showResult);
      text("stageLabel", `任务状态 · ${config.label}`);
      text("smartTaskTitle", config.label);
      text("smartTaskDetail", config.consequence);
      text("primaryAction", config.primary);
      text("primaryConsequence", `点击后：${config.consequence}`);
      text("signalText", `${config.label} · ${config.allowCancel ? "可申请停止" : "当前不可取消"} · ${config.showResult ? "已有成果入口" : "尚无可验收成果"}。本原型未连接真实任务事件。`);
    } else if (taskPassport.stage === "result") {
      text("primaryAction", "进入同一任务成果");
      text("primaryConsequence", "点击后：携带同一任务护照进入成果页；不会自动下载或触发现实动作。");
    }
  }

  function openJobStateDetails() {
    const jobState = taskPassport?.jobState;
    const config = jobState ? decreeJobUi[jobState] : null;
    if (!config) return;
    const intro = document.createElement("p");
    intro.textContent = config.consequence;
    const details = buildInfoList([
      ["当前状态", `${jobState} · ${config.label}`],
      ["停止权限", config.allowCancel ? "可以申请停止；正式接入后调用受控取消接口" : "当前状态不提供取消入口"],
      ["成果入口", config.showResult ? "可以进入成果预览或归档成果" : "尚无可验收成果"],
      ["真实性", "本地状态演示；未连接真实任务、进度或成功事件"]
    ]);
    showBuiltDrawer("军机处 · 任务状态", config.label, [intro, details]);
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

  function renderStudyDocument(item, kind, body) {
    const isForecast = kind === "watch" || kind === "trend";
    const isPetition = !isForecast && item.title.includes("奏折");
    const memorial = window.document.createElement("article");
    memorial.className = "memorial-document";
    memorial.dataset.kind = isForecast ? "forecast" : isPetition ? "petition" : "reply";

    const heading = document.createElement("header");
    const kicker = document.createElement("span");
    const title = document.createElement("h2");
    const issuer = document.createElement("small");
    kicker.textContent = isForecast ? "钦天候问" : isPetition ? "据实奏闻" : "专署回奏";
    title.textContent = item.title;
    issuer.textContent = isForecast ? "钦天监启" : isPetition ? "臣等谨奏" : "专署谨回";
    heading.append(kicker, title, issuer);

    const rows = document.createElement("dl");
    const documentRows = isForecast
      ? [["所观", item.meta], ["所议", "只把会改变当前选择的大势、触发信号与失效条件呈给丞相。"], ["谨候", "待议题确认后再研判，不以预测代替事实。"]]
      : isPetition
        ? [["事由", `围绕当前议题调阅“${item.title}”。`], ["所议", item.meta], ["谨奏", "由丞相汇总，不单独改变目标、预算或权限。"]]
        : [["回奏正文", item.meta], ["证据", "采用同一议题下已确认的材料与引用。"], ["后令", "由丞相决定是否补证、会审或纳入拟旨。"]];
    documentRows.forEach(([label, value]) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = label;
      description.textContent = value;
      row.append(term, description);
      rows.append(row);
    });
    memorial.append(heading, rows);

    const actions = document.createElement("div");
    actions.className = "surface-actions formal-actions";
    const include = document.createElement("button");
    include.type = "button";
    include.textContent = "纳入议题";
    include.addEventListener("click", () => {
      promptInput.value = `请丞相把“${item.title}”纳入当前议题，并先复述它会改变哪项判断。`;
      sendButton.disabled = false;
      app.dataset.composerStage = "draft";
      activeDecreeFingerprint = "";
      promptInput.focus();
      showToast("已纳入对话栏；仍可修改，不会直接会办或执行。 ");
    });
    const draft = document.createElement("button");
    draft.type = "button";
    draft.className = "primary";
    draft.textContent = "拟旨";
    draft.addEventListener("click", openDraftDecree);
    actions.append(include, draft);
    body.replaceChildren(memorial, actions);
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
    const surfaceLabels = { benefit: "可交付成果", memorial: "奏折与回奏", office: "各司能力", watch: "相关信息", trend: "战略大势", case: "高手方法案例", task: "执行任务", project: "正式任务与阶段", swarm: "蜂群专业会签" };
    text("displaySurfaceKicker", surfaceLabels[kind] || "值得关注");
    if (current.id === "A02" && ["benefit", "memorial", "watch", "trend"].includes(kind)) {
      renderStudyDocument(item, kind, body);
      return;
    }
    const intro = document.createElement("p");
    intro.className = "surface-intro";
    intro.textContent = item.meta;
    const list = document.createElement("div");
    list.className = "surface-list";
    const routedAgent = conversationAgent === current.agent ? current.agent : `${conversationAgent}转请${current.agent}`;
    const responsibility = conversationAgent === current.agent
      ? `${current.agent}负责当前对话与专业处理。`
      : `${conversationAgent}负责当前对话与统筹，${current.agent}负责本页专业处理。`;
    const details = kind === "project"
      ? [["立项状态", item.status], ["当前阶段", item.progress?.label || item.meta], ["项目说明", item.meta], ["进度边界", "只在军机处收到可核验任务事件后推进；DEMO 不代表真实执行。"]]
      : kind === "swarm"
        ? [["专业意见", item.meta], ["意见状态", item.status], ["怎样影响项目", "由丞相汇总为一个项目建议；分奏本身不会直接改变范围、预算或权限。"]]
        : kind === "benefit"
      ? [["最终得到什么", item.format || item.meta], ["需要你提供", item.inputs || current.action], ["由谁负责", responsibility], ["权限与现实后果", item.permission || "先形成本地演示草案；任何现实副作用都需要另行确认。"]]
      : kind === "office"
        ? [["这司负责什么", item.meta], ["能为你带来什么", `围绕“${current.outcome}”提供专业能力与结果。`], ["怎样使用", `直接告诉${routedAgent}想要的结果，由其决定是否调用此司。`]]
        : kind === "task"
          ? [["真实状态", item.status], ["当前说明", item.meta], ["何时变化", "只有军机处收到真实任务事件后才更新，不用动画或百分比伪造忙碌。"]]
          : kind === "case"
            ? [["方法要点", item.meta], ["案例边界", "这是方法演示，不代表任何名人或机构正在使用朝堂。"], ["怎样用于你", `请${routedAgent}结合你的目标、材料和限制重新判断，不直接照抄。`]]
            : [["信息摘要", item.meta], ["呈报口径", item.status], ["可选动作", `纳入当前议题，或请${routedAgent}进一步说明。`]];
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
    explain.textContent = kind === "office" ? "请解释怎么用" : `请${routedAgent}解释`;
    explain.addEventListener("click", () => {
      promptInput.value = `请${routedAgent}用简单的话解释“${item.title}”对我有什么影响，我现在应该做什么。`;
      sendButton.disabled = false;
      app.dataset.composerStage = "draft";
      promptInput.focus();
      showToast("问题已放入对话栏，你可以继续修改后发送。");
    });
    actions.append(explain);
    if (kind === "office" && item.page && pageMap.has(item.page)) {
      const enter = document.createElement("button");
      enter.type = "button";
      enter.textContent = "查看专业详情";
      enter.addEventListener("click", () => {
        activeOfficeContext = { officeName: item.title, officeDuty: item.meta, departmentName: current.title.split(" · ")[0], sourcePage: current.id };
        if (taskPassport) Object.assign(taskPassport, activeOfficeContext);
        navigateTo(item.page, { taskMode: taskPassport ? "continue" : "clear", officeContext: activeOfficeContext });
      });
      actions.append(enter);
    }
    if (kind === "office") {
      const requestResult = document.createElement("button");
      requestResult.type = "button";
      requestResult.className = "primary";
      requestResult.dataset.resultAction = "true";
      requestResult.textContent = "请本司呈送成果";
      requestResult.addEventListener("click", () => {
        const request = `请${current.agent}调用“${item.title}”的专业能力，先复述我要得到的成果、所需材料与完成标准；信息足够时直接呈送可验收草案，需要跨部门或高风险操作时再请丞相拟旨。`;
        createTaskPassport(request, {
          sourcePage: current.id,
          focus: item.title,
          contexts: [...(current.contexts || []), item.meta],
          inputSource: "OFFICE_RESULT_SUMMONS",
          resultTitle: current.outcome,
          resultFormat: item.expectedOutput || current.outcome
        });
        promptInput.value = request;
        sendButton.disabled = false;
        app.dataset.composerStage = "draft";
        activeDecreeFingerprint = "";
        promptInput.focus();
        showToast("成果召令已放入对话栏；本司先确认结果，跨部门或高风险事项才升级给丞相。 ");
      });
      actions.append(requestResult);
    }
    if (kind === "benefit") {
      const generate = document.createElement("button");
      generate.type = "button";
      generate.className = "primary";
      generate.dataset.resultAction = "true";
      generate.textContent = item.page ? "请丞相先确认理解" : "索取此成果";
      generate.addEventListener("click", () => {
        createTaskPassport(`请生成“${item.title}”，先复述你对结果、限制和完成标准的理解。`, {
          sourcePage: current.id,
          focus: item.title,
          contexts: [...(current.contexts || []), item.format || item.meta],
          inputSource: item.agentResult ? "AGENT_RESULT_SUMMONS" : "RESULT_CONTRACT",
          resultTargetPage: item.page || null,
          resultTitle: item.title,
          resultFormat: item.format || item.meta
        });
        if (item.page && pageMap.has(item.page)) {
          navigateTo("A02", { taskMode: "continue" });
          showToast(`已把“${item.title}”带入上书房理解卡；确认以前不会进入生成页或调用外部服务。`);
        } else {
          promptInput.value = taskPassport.userInput;
          sendButton.disabled = false;
          app.dataset.composerStage = "draft";
          promptInput.focus();
          showToast("成果要求已放入对话栏；确认理解后才会继续。 ");
        }
      });
      actions.append(generate);
    }
    body.replaceChildren(intro, list, actions);
  }

  function openAgentResultSummons() {
    openSmartFocus({
      title: current.outcome,
      meta: current.userValue || current.personaIntro,
      status: "先呈草案",
      sigil: "果",
      format: current.outcome,
      inputs: current.action,
      permission: "先呈可验收草案；发送、付款、发布、交易或其他现实操作仍需单独预览确认。",
      agentResult: true
    }, "benefit");
  }

  function renderRailPreviewSecondary(item) {
    const target = $("secondaryActions");
    const buttons = [];
    if (item.page && pageMap.has(item.page)) {
      const enter = document.createElement("button");
      enter.type = "button";
      enter.textContent = `进入${pageMap.get(item.page).title}`;
      enter.addEventListener("click", () => navigateTo(item.page, { taskMode: taskPassport ? "continue" : "clear" }));
      buttons.push(enter);
    }
    const back = document.createElement("button");
    back.type = "button";
    back.textContent = "返回本页总览";
    back.addEventListener("click", () => renderPage(current, false, { taskMode: taskPassport ? "continue" : "clear", openDisplay: true }));
    buttons.push(back);
    target.replaceChildren(...buttons);
  }

  function isDeliverableRailItem(item) {
    return Boolean(item.format || item.expectedOutput || item.contractState || item.agentResult);
  }

  function openRailPreview(item, kind, trigger) {
    const inputKinds = new Set(["watch", "case", "trend", "task", "ability"]);
    const flow = inputKinds.has(kind) ? "input" : "output";
    activeRailPreview = { item, flow, pageId: current.id };
    document.querySelectorAll("#smartBenefitList button, #smartWatchList button, #domainUnitList button, #domainTaskList button, #smartAbilityList button").forEach(button => button.classList.toggle("is-preview-active", button === trigger));
    app.dataset.railPreview = flow;
    app.dataset.scroll = "half";
    text("stageLabel", flow === "output" ? "侧栏预览 · 输出成果流" : "侧栏预览 · 输入情报流");
    text("displayContext", `${current.title} · ${flow === "output" ? "成果预览" : "情报预览"}`);
    text("verdictTitle", item.title);
    const triadLabels = ["用户会获得什么", "为什么现在点", "点击后发生什么"];
    document.querySelectorAll(".triad article > span").forEach((label, index) => { label.textContent = triadLabels[index]; });
    text("situation", flow === "output"
      ? (item.format || item.expectedOutput || item.meta || current.outcome)
      : "先看它是否会改变你的当前目标、项目或停止条件");
    text("impact", flow === "output"
      ? (item.meta || `形成一份可查看的“${item.title}”`)
      : (item.meta || "只有与你有关且值得现在处理的信息才进入这里"));
    text("nowAction", flow === "output"
      ? `由${current.agent}先复述成果、材料和完成标准，再决定是否生成`
      : `把这条信息连同当前上下文交给${current.agent}解释，不立即跳转`);
    text("smartOutcome", flow === "output"
      ? `可带走：${item.format || item.expectedOutput || item.title}`
      : `可获得：影响说明、证据边界与一个建议动作`);
    const routeOnly = flow === "output" && item.page && !isDeliverableRailItem(item);
    text("primaryAction", flow === "output" ? (routeOnly ? `继续：${item.title}` : `索取：${item.title}`) : `带着此事问${current.agent}`);
    text("primaryConsequence", flow === "output"
      ? (routeOnly ? "点击后：携带当前上下文进入对应页面；不会直接生成或执行。" : "点击后：建立同一任务护照并进入理解确认；不会直接生成或执行。")
      : "点击后：把问题放入对话栏并保留当前上下文；不会自动发送或跳转。 ");
    renderRailPreviewSecondary(item);
    updateScrollLabel();
    $("primaryAction").focus({ preventScroll: true });
    showToast("已在中央御屏预览；确认价值以后再继续，不会立即跳转页面。");
  }

  function handleRailPreviewPrimary() {
    if (!activeRailPreview || activeRailPreview.pageId !== current.id) return false;
    const { item, flow } = activeRailPreview;
    if (flow === "output") {
      if (item.page && pageMap.has(item.page) && !isDeliverableRailItem(item)) {
        if (!taskPassport) createTaskPassport(item.meta || item.title, {
          sourcePage: current.id,
          focus: item.title,
          contexts: [...(current.contexts || []), item.meta || "侧栏页面预览"],
          inputSource: "PAGE_RAIL_PREVIEW"
        });
        navigateTo(item.page, { taskMode: "continue" });
        showToast(`已携带当前上下文进入“${pageMap.get(item.page).title}”；没有自动生成或执行。`);
        return true;
      }
      createTaskPassport(`请形成“${item.title}”，先复述结果、必要材料、完成标准和不能越过的边界。`, {
        sourcePage: current.id,
        focus: item.title,
        contexts: [...(current.contexts || []), item.meta || "侧栏成果预览"],
        inputSource: "RESULT_CONTRACT",
        resultTargetPage: item.page || null,
        resultTitle: item.title,
        resultFormat: item.format || item.expectedOutput || item.meta || item.title
      });
      navigateTo("A02", { taskMode: "continue" });
      showToast(`已把“${item.title}”带入上书房理解卡；确认以前不会生成或执行。`);
    } else {
      promptInput.value = `请${current.agent}解释“${item.title}”为什么与我有关、依据是什么、现在最建议我做什么。`;
      sendButton.disabled = false;
      app.dataset.composerStage = "draft";
      promptInput.focus();
      showToast("问题和当前事项已放入对话栏；你可以修改后再发送。");
    }
    return true;
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
      arrow.textContent = kind === "benefit" || kind === "project" ? (item.status || "生成") : "→";
      meta.textContent = item.meta;
      button.append(title, arrow, meta);
      if (item.progress) {
        button.classList.add("project-progress-card");
        const progress = document.createElement("span");
        progress.className = "project-progress";
        progress.setAttribute("aria-label", `${item.title}：${item.progress.label}`);
        const marks = document.createElement("span");
        marks.className = "project-progress-marks";
        for (let index = 0; index < item.progress.total; index += 1) {
          const mark = document.createElement("i");
          if (index < item.progress.complete) mark.className = "is-done";
          marks.append(mark);
        }
        const label = document.createElement("b");
        label.textContent = item.progress.label;
        progress.append(marks, label);
        button.append(progress);
      }
      button.addEventListener("click", () => {
        if (current.level === "主页面") openRailPreview(item, kind, button);
        else if (kind === "project" && item.page && pageMap.has(item.page)) navigateTo(item.page, { taskMode: taskPassport ? "continue" : "clear" });
        else openSmartFocus(item, kind);
      });
      return button;
    }));
  }

  function renderProjectSwarm(items) {
    const target = $("projectSwarmList");
    target.replaceChildren(...(items || []).slice(0, 4).map(item => {
      const button = document.createElement("button");
      button.type = "button";
      const title = document.createElement("b");
      const state = document.createElement("em");
      const detail = document.createElement("small");
      title.textContent = item.title;
      state.textContent = item.status;
      detail.textContent = item.meta;
      button.append(title, state, detail);
      button.addEventListener("click", () => openSmartFocus(item, "swarm"));
      return button;
    }));
  }

  function renderDepartmentOffices(items) {
    const target = $("departmentOfficeList");
    target.replaceChildren(...(items || []).map(item => {
      const button = document.createElement("button");
      button.type = "button";
      const sigil = document.createElement("span");
      const copy = document.createElement("span");
      const title = document.createElement("b");
      const meta = document.createElement("small");
      const arrow = document.createElement("em");
      sigil.className = "department-office-sigil";
      sigil.textContent = item.sigil;
      title.textContent = item.title;
      meta.textContent = item.meta;
      arrow.textContent = "查看";
      copy.append(title, meta);
      button.append(sigil, copy, arrow);
      button.addEventListener("click", () => openSmartFocus(item, "office"));
      return button;
    }));
  }

  function renderDepartmentMarket(items) {
    const target = $("departmentMarketBoard");
    target.replaceChildren(...(items || []).map(item => {
      const card = document.createElement("article");
      const label = document.createElement("span");
      const value = document.createElement("b");
      const state = document.createElement("small");
      label.textContent = item.label;
      value.textContent = item.value || "--";
      state.textContent = item.state || "尚未接入";
      card.append(label, value, state);
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `查看${item.label}状态`);
      const open = () => openSmartFocus({ title: item.label, meta: `${item.value || "--"} · ${item.state || "尚未接入"}`, status: item.state || "尚未接入" }, "watch");
      card.addEventListener("click", open);
      card.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
      });
      return card;
    }));
  }

  function renderDepartmentTasks(items) {
    const target = $("departmentTaskList");
    const visibleItems = [...(items || [])];
    if (taskPassport && visibleItems.length) {
      visibleItems[0] = {
        title: `当前任务 · ${taskPassport.focus}`,
        meta: `${taskPassport.id} · ${taskPassport.userInput}`,
        status: `DEMO · ${taskPassport.stage}`,
        sigil: "任"
      };
    }
    target.replaceChildren(...visibleItems.map(item => {
      const button = document.createElement("button");
      button.type = "button";
      const title = document.createElement("b");
      const state = document.createElement("em");
      const meta = document.createElement("small");
      title.textContent = item.title;
      state.textContent = item.status;
      meta.textContent = item.meta;
      button.append(title, state, meta);
      button.addEventListener("click", () => openSmartFocus(item, "task"));
      return button;
    }));
  }

  function renderDomainUnits(items) {
    const target = $("domainUnitList");
    const unitItems = items || [];
    const buttons = unitItems.slice(0, 4).map(item => {
      const button = document.createElement("button");
      button.type = "button";
      const sigil = document.createElement("span");
      const copy = document.createElement("span");
      const title = document.createElement("b");
      const meta = document.createElement("small");
      const owner = document.createElement("em");
      sigil.className = "department-office-sigil";
      sigil.textContent = item.sigil;
      title.textContent = item.title;
      meta.textContent = item.meta;
      owner.textContent = `${item.status} →`;
      copy.append(title, meta);
      button.append(sigil, copy, owner);
      button.addEventListener("click", () => {
        if (item.page && pageMap.has(item.page)) {
          if (current.level === "主页面") openRailPreview(item, "benefit", button);
          else navigateTo(item.page, { taskMode: taskPassport ? "continue" : "clear" });
        }
      });
      return button;
    });
    if (unitItems.length > 4) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "domain-more-button";
      more.textContent = `查看全部 ${unitItems.length} 个相关板块 →`;
      more.addEventListener("click", () => openDomainDirectory(unitItems));
      buttons.push(more);
    }
    target.replaceChildren(...buttons);
  }

  function openDomainDirectory(items) {
    const intro = document.createElement("p");
    intro.textContent = "按你想得到的结果进入对应主责部门；复杂事项仍可直接交给丞相统筹。";
    const list = document.createElement("div");
    list.className = "drawer-list agent-picker-list";
    items.forEach(item => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "drawer-choice";
      button.innerHTML = `<b>${item.title}</b><small>${item.meta}</small><em>${item.status} →</em>`;
      button.addEventListener("click", () => {
        drawer.close();
        if (item.page && pageMap.has(item.page)) {
          if (current.level === "主页面") openRailPreview(item, "benefit", null);
          else navigateTo(item.page, { taskMode: taskPassport ? "continue" : "clear" });
        }
      });
      list.append(button);
    });
    showBuiltDrawer(current.title, "全部相关板块", [intro, list]);
  }

  function renderDomainTasks(items) {
    const target = $("domainTaskList");
    const visibleItems = [...(items || [])];
    if (taskPassport && visibleItems.length) {
      visibleItems[0] = {
        title: `当前任务 · ${taskPassport.focus}`,
        meta: `${taskPassport.id} · ${taskPassport.userInput}`,
        status: `DEMO · ${taskPassport.stage}`,
        sigil: "任",
        page: taskPassport.stage === "coordinate" ? "A03" : "A02"
      };
    }
    target.replaceChildren(...visibleItems.map(item => {
      const button = document.createElement("button");
      button.type = "button";
      const title = document.createElement("b");
      const state = document.createElement("em");
      const meta = document.createElement("small");
      title.textContent = item.title;
      state.textContent = item.status;
      meta.textContent = item.meta;
      button.append(title, state, meta);
      button.addEventListener("click", () => {
        if (item.page && pageMap.has(item.page) && current.level === "主页面") openRailPreview(item, "task", button);
        else if (item.page && pageMap.has(item.page)) navigateTo(item.page, { taskMode: taskPassport ? "continue" : "clear" });
        else openSmartFocus(item, "task");
      });
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
      if (option.strategy) button.dataset.studyStrategy = option.strategy;
      button.addEventListener("click", () => {
        if (option.strategy && current.id === "A02") {
          if (discussionState !== "options") {
            showToast("请先准奏确认丞相的理解，钦天监才会呈上可选择的三策。");
            return;
          }
          const strategyButton = document.querySelector(`[data-strategy="${option.strategy}"]`);
          if (strategyButton) chooseStrategy(strategyButton);
        } else if (option.surface) renderCentralSurface(option.surface);
        else if (option.page && pageMap.has(option.page) && current.level === "主页面") openRailPreview({
          title: option.label,
          meta: `先预览进入“${pageMap.get(option.page).title}”后可以查看什么，再决定是否继续。`,
          status: "专业页面",
          sigil: "入",
          page: option.page
        }, "ability", button);
        else if (option.page && pageMap.has(option.page)) navigateTo(option.page, { taskMode: taskPassport ? "continue" : "clear" });
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
        if (current.id === "A02" && label.includes("拟旨")) openDraftDecree();
        else if (current.id === "A02" && (label.includes("驳回") || label.includes("纠正"))) resetDiscussion("已驳回当前理解：旧确认、旧三策和旧授权已经失效。");
        else if (current.id === "A02" && label.includes("补证")) openDrawer("evidence", "补证：请锦衣卫核验");
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

  function applyAgentIdentity(page) {
    const resultCapable = !["A01", "A02", "A03"].includes(page.id);
    text("smartAgentMonogram", page.personaName.slice(0, 1));
    text("smartAgentRoleLabel", "");
    text("smartAgentName", `${page.agent} · ${page.personaName}`);
    text("smartAgentPosture", page.personaIntro);
    const summon = $("smartAgentSummon");
    summon.dataset.open = resultCapable ? "agentResult" : "agents";
    summon.textContent = resultCapable ? "索取成果" : "召见";
    summon.setAttribute("aria-label", resultCapable
      ? `向${page.agent}索取可验收成果`
      : `召见${page.agent}`);
  }

  function renderPage(page, pushHash = true, options = {}) {
    if (!page) return;
    closePinnedTutor();
    window.clearTimeout(toastTimer);
    toast.classList.remove("is-visible");
    if (drawer.open) drawer.close();
    if (atlas.open) atlas.close();
    const taskMode = options.taskMode || (taskPassport ? "continue" : "clear");
    if (taskMode === "clear") clearTaskPassport();
    current = page;
    activeRailPreview = null;
    delete app.dataset.railPreview;
    app.dataset.page = page.id;
    app.dataset.simpleCore = ["A01", "A02", "A03", "C01", "C02"].includes(page.id) ? "true" : "false";
    const domainPage = page.group === "人生六域" && /^E0[1-6]$/.test(page.id);
    app.dataset.domainPage = domainPage ? "true" : "false";
    app.dataset.domainOperating = page.domainOperatingModel ? "true" : "false";
    app.dataset.departmentPage = page.departmentDashboard ? "true" : "false";
    app.dataset.opc = page.id === "E01" ? "true" : "false";
    app.dataset.composerStage = "idle";
    app.dataset.specialStep = "idle";
    app.dataset.viewState = "normal";
    const stage = $("stage");
    if (stage) stage.scrollTop = 0;
    document.querySelectorAll(".smart-sidebar").forEach(panel => { panel.scrollTop = 0; });
    app.dataset.displayMedium = displayMediumByPage[page.id] || "decree";
    const pageMediumLabels = {
      A03: ["军机舆图", "项目", "事件", "蜂群", "验收"],
      S01: ["呈报总图", "任务", "触发", "权限", "记录"], S02: ["呈报合同", "总览", "触发", "权限", "失败"],
      T01: ["行程图", "路线", "预算", "证件风险", "预订"], T02: ["行前册", "预算", "证件", "风险", "备选"], T03: ["授权清单", "对象", "条款", "隐私", "确认"],
      U01: ["拟旨台", "原话", "拟旨", "节流", "作品"]
    };
    const mediumLabels = pageMediumLabels[page.id] || (app.dataset.displayMedium === "panorama"
      ? ["远景画卷", "总览", "各司", "信息", "成果"]
      : app.dataset.displayMedium === "map"
        ? ["军机舆图", "项目", "阶段", "蜂群", "验收"]
        : app.dataset.displayMedium === "archive"
          ? ["史馆总卷", "总览", "时间线", "知识", "档案"]
          : ["御屏", "御断", "办理", "材料", "成果"]);
    ["displayMediumLabel", "displayTabBrief", "displayTabProgress", "displayTabMaterials", "displayTabResult"].forEach((id, index) => text(id, mediumLabels[index]));
    const mediumName = mediumLabels[0];
    document.querySelector(".display-tabs")?.setAttribute("aria-label", `${mediumName}内容`);
    document.querySelector("[data-scroll-collapse]")?.setAttribute("aria-label", `收起${mediumName}到底部`);
    document.querySelectorAll("[data-scroll-toggle]").forEach(button => button.setAttribute("aria-label", `切换${mediumName}状态`));
    app.style.setProperty("--agent-portrait-image", `url("${page.portrait}")`);
    app.style.setProperty("--agent-portrait-position", page.portraitPosition || "50% 50%");
    scene.style.opacity = "0";
    scene.style.backgroundImage = `image-set(url("${page.sceneSmall}") 1x, url("${page.scene}") 2x)`;
    window.requestAnimationFrame(() => { scene.style.opacity = "1"; });
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
    text("smartRoleTag", page.id === "A03" ? `${page.agent}统筹` : "一句话认识这里");
    text("smartRoleDefinition", page.roleDefinition);
    text("smartRoleValue", page.userValue);
    text("smartRoleHook", page.roleHook);
    text("smartAgentMonogram", page.agent.slice(0, 1));
    text("smartAgentName", page.agent);
    text("smartAgentPosture", `陛下，臣已将${page.title.split(" · ")[0]}的职责、可交付成果与当前建议呈上；您只需说想得到什么。`);
    text("smartAgentSummon", "召见");
    text("smartBenefitLabel", "你可以得到");
    text("smartWatchLabel", "值得关注");
    text("smartAbilityLabel", "这个部门还能为你做");
    text("smartNewsLabel", "新信息与提醒");
    text("smartAgentRoleLabel", "");
    text("smartRightAgent", page.id === "A03" ? page.agent : page.rightAgent);
    text("smartRightAdvice", page.rightAdvice);
    text("smartNewsTitle", page.newsTitle);
    text("smartNewsDetail", page.newsDetail);
    text("leftPanelKicker", ["A01", "A02", "A03", "C01", "C02"].includes(page.id) ? "你会得到" : "当前上下文");
    text("rightPanelKicker", ["A01", "A02", "A03", "C01", "C02"].includes(page.id) ? "现在关注" : "结果与边界");
    text("sealMonogram", page.id === "A02" ? "旨" : page.id === "A03" ? "军" : page.id === "C01" ? "证" : page.id === "C02" ? "星" : "玺");
    text("sealActionLabel", page.sealAction);
    text("primaryAction", page.primary);
    text("primaryConsequence", `点击后：${page.consequence}`);
    text("composerHint", page.hint);
    text("signalText", `${page.title}：${page.situation}。本原型未连接真实后端或外部执行。`);
    text("evidenceLabel", page.why);
    renderList("leftList", page.leftItems);
    renderList("rightList", page.rightItems);
    const simpleCorePage = app.dataset.simpleCore === "true";
    renderSmartList("smartBenefitList", simpleCorePage ? page.leftItems : page.benefits, "benefit");
    renderSmartList("smartWatchList", simpleCorePage ? page.rightItems : page.watch, "watch");
    renderAbilityList(page.abilities);
    renderProjectSwarm(page.swarmOpinions);
    renderSecondary(page.secondary);
    if (page.departmentDashboard) {
      text("leftPanelKicker", "尚书 · 各司 · 成果");
      text("rightPanelKicker", "信息 · 影响 · 任务");
      text("smartRoleTag", "这个部门能为你做什么");
      text("smartAgentRoleLabel", "");
      text("smartAgentPosture", `陛下，臣已将本部能力、各司职掌与可交付成果分类呈上；您只需说想得到什么。`);
      text("smartBenefitLabel", "可交付成果");
      text("smartWatchLabel", "高手方法案例 · 演示");
      text("departmentOfficeLabel", page.officeLabel || "旗下各司");
      text("departmentMarketTitle", page.marketTitle || "领域信息");
      text("departmentMarketState", page.sourceState === "LIVE" ? "真实接入" : "尚未接入");
      text("departmentTaskTitle", "相关执行任务");
      text("smartAbilityLabel", "进入专业工作台");
      renderSmartList("smartBenefitList", page.benefits, "benefit");
      renderSmartList("smartWatchList", page.watch, "case");
      renderDepartmentOffices(page.offices);
      renderDepartmentMarket(page.marketBoard);
      renderDepartmentTasks(page.departmentTasks);
    } else {
      renderDepartmentOffices([]);
      renderDepartmentMarket([]);
      renderDepartmentTasks([]);
    }
    if (domainPage) {
      text("leftPanelKicker", "能力 · 可得成果");
      text("rightPanelKicker", "值得先看 · 深入入口");
      text("smartRoleTag", "这一域为你解决什么");
      text("smartBenefitLabel", "可直接生成成果");
      text("smartWatchLabel", "高手方法案例 · 演示");
      text("smartAbilityLabel", "需要时再深入");
      text("smartNewsLabel", "与本域有关的新信息");
      text("domainUnitLabel", page.domainUnitLabel || "专业板块");
      text("domainTaskTitle", "当前任务与总经办");
      renderSmartList("smartBenefitList", page.benefits, "benefit");
      renderSmartList("smartWatchList", page.watch, "case");
      renderDomainUnits(page.domainUnits);
      renderDomainTasks(page.domainTasks);
      if (page.id === "E01") {
        text("leftPanelKicker", "一人公司 · OPC");
        text("rightPanelKicker", "瓶颈 · 军团 · 结果");
        text("smartBenefitLabel", "OPC可直接生成成果");
        text("smartAbilityLabel", "总经办与专业工作台");
        text("smartNewsLabel", "与你的一人公司有关");
      }
    } else {
      renderDomainUnits([]);
      renderDomainTasks([]);
    }
    const onboardingPreference = readLocal(ONBOARDING_KEY, null) || transientOnboardingPreference;
    if (page.id === "A01" && onboardingPreference && !onboardingPreference.skipped) {
      text("smartRoleTag", "丞相已记住你的偏好 · 可随时纠正");
      text("smartRoleDefinition", `臣理解您想改善“${onboardingPreference.goal}”，希望得到“${onboardingPreference.result}”，同时不能牺牲“${onboardingPreference.boundary}”。`);
      text("smartBenefitLabel", "今日三件呈报");
      text("smartWatchLabel", "建议前必须说清");
      text("smartNowAction", `告诉丞相你在“${onboardingPreference.goal}”上最想解决的具体问题`);
      text("smartNowReason", `丞相会先说明可能代价与证据，再推荐一个不越过“${onboardingPreference.boundary}”的选择。`);
      text("smartOutcome", `先形成“${onboardingPreference.result}”，再由丞相说明代价、底线与证据。`);
      text("verdictTitle", `围绕“${onboardingPreference.goal}”，今天先确定一个值得推进的具体结果。`);
      promptInput.placeholder = `例如：我想在“${onboardingPreference.goal}”上得到什么结果，可接受什么代价，绝不能牺牲什么……`;
    } else if (["A02", "A03", "C01", "C02"].includes(page.id) && onboardingPreference && !onboardingPreference.skipped) {
      const goal = onboardingPreference.goal;
      const result = onboardingPreference.result;
      const boundary = onboardingPreference.boundary;
      const personalizedRails = {
        A02: {
          leftTitle: "丞相这样理解你",
          rightTitle: "出三策前必须守住",
          left: [
            { title: "这次商议为了什么", meta: `先围绕“${goal}”把愿望说成可确认目标`, status: "请确认", sigil: "愿" },
            { title: "你希望拿到什么", meta: `优先形成“${result}”`, status: "已记住", sigil: "果" },
            { title: "臣若理解不对", meta: "一句话纠正；旧确认和旧三策立即失效", status: "可纠正", sigil: "改" }
          ],
          right: [
            { title: "你的底线", meta: `不能牺牲“${boundary}”`, status: "共同遵守", sigil: "界" },
            { title: "每一策的代价", meta: "时间、金钱、精力和机会成本逐项说清", status: "先比较", sigil: "价" },
            { title: "建议是否站得住", meta: "证据、未知和失效条件明确分开", status: "可追溯", sigil: "证" }
          ]
        },
        A03: {
          leftTitle: "这个项目为何替你而做",
          rightTitle: "继续以前只确认三件事",
          left: [
            { title: "始终围绕你的愿望", meta: `项目服务于“${goal}”，跨部门也不丢目标`, status: "同一任务", sigil: "愿" },
            { title: "最后怎样算有结果", meta: `验收时优先交付“${result}”`, status: "可验收", sigil: "果" },
            { title: "现在真正卡在哪里", meta: "只呈报一个会影响结果的真实阻塞", status: "直说", sigil: "阻" }
          ],
          right: [
            { title: "不能越过的边界", meta: `不得牺牲“${boundary}”`, status: "已锁定", sigil: "界" },
            { title: "继续要付出什么", meta: "新增时间、预算和依赖必须先预览", status: "待确认", sigil: "价" },
            { title: "凭什么显示完成", meta: "真实事件、产物和验收缺一不可", status: "有证据", sigil: "证" }
          ]
        },
        C01: {
          leftTitle: "锦衣卫只查与你有关的事",
          rightTitle: "情报入朝前必须过三关",
          left: [
            { title: "为什么替你查", meta: `只核验会影响“${goal}”的关键主张`, status: "不跑题", sigil: "愿" },
            { title: "最后交给你什么", meta: "事实、反证、未知和影响去向", status: "可带走", sigil: "果" },
            { title: "这会影响你什么", meta: `说明它是否改变“${result}”的判断`, status: "说人话", sigil: "联" }
          ],
          right: [
            { title: "采集不能越界", meta: `不得以“${boundary}”为代价`, status: "固定底线", sigil: "界" },
            { title: "核验可能付出什么", meta: "说明时间、来源成本和无法证实的可能", status: "先说明", sigil: "价" },
            { title: "凭什么相信", meta: "独立来源、反证、新鲜度和未知同时展示", status: "可追溯", sigil: "证" }
          ]
        },
        C02: {
          leftTitle: "钦天监先理解你为何预测",
          rightTitle: "战略建议前必须说清",
          left: [
            { title: "预测服务哪个决定", meta: `围绕“${goal}”，不做与您无关的趋势表演`, status: "不跑题", sigil: "愿" },
            { title: "最终交给你什么", meta: `用三种情景帮助形成“${result}”`, status: "可行动", sigil: "果" },
            { title: "环境变了怎么办", meta: "触发信号出现就更新，不让旧结论绑住你", status: "可转向", sigil: "转" }
          ],
          right: [
            { title: "什么风险不能承担", meta: `不得牺牲“${boundary}”`, status: "共同遵守", sigil: "界" },
            { title: "选择会失去什么", meta: "时间窗口、资源占用和其他机会一起比较", status: "先说明", sigil: "价" },
            { title: "判断依据可靠吗", meta: "锦衣卫核验、关键未知和失效条件都可查看", status: "可追溯", sigil: "证" }
          ]
        }
      }[page.id];
      text("leftTitle", personalizedRails.leftTitle);
      text("rightTitle", personalizedRails.rightTitle);
      text("leftPanelKicker", "朝堂这样懂你");
      text("rightPanelKicker", "代价 · 底线 · 证据");
      renderList("leftList", personalizedRails.left);
      renderList("rightList", personalizedRails.right);
      renderSmartList("smartBenefitList", personalizedRails.left, "benefit");
      renderSmartList("smartWatchList", personalizedRails.right, "watch");
      promptInput.placeholder = `告诉${page.agent}：我想在“${goal}”上得到什么，绝不能牺牲“${boundary}”……`;
    } else {
      promptInput.placeholder = "告诉朝堂你想得到什么结果、最担心什么……";
    }
    const triadLabels = page.id === "A03" ? ["项目目标", "当前阶段", "唯一阻塞"] : ["发生了什么", "与你的关系", "现在做什么"];
    document.querySelectorAll(".triad article > span").forEach((label, index) => { label.textContent = triadLabels[index]; });
    const outcomeLabel = document.querySelector(".smart-outcome > span");
    if (outcomeLabel) outcomeLabel.textContent = page.id === "A03" ? "当前项目" : "你将得到";
    if (page.level === "主页面") {
      document.querySelector(".left-panel")?.setAttribute("data-rail-flow", "output");
      document.querySelector(".right-panel")?.setAttribute("data-rail-flow", "input");
      document.querySelector(".left-panel")?.setAttribute("aria-label", `${page.title}输出成果流`);
      document.querySelector(".right-panel")?.setAttribute("aria-label", `${page.title}输入情报流`);
    }
    if (page.id === "A01") {
      text("leftPanelKicker", "朝堂为你办理");
      text("rightPanelKicker", "天下变化入朝");
      text("smartAgentRoleLabel", "");
      text("smartBenefitLabel", "建议 · 续办 · 成果");
      text("smartWatchLabel", "情报 · 信号 · 裁决");
    }
    if (page.id === "A02") {
      text("leftPanelKicker", "丞相 · 最佳执行");
      text("rightPanelKicker", "钦天监 · 最佳预测");
      text("smartBenefitLabel", "各部奏折与回奏");
      text("smartWatchLabel", "当前关注的大势");
      text("smartAbilityLabel", "确认理解后呈上战略选择");
      text("smartNewsLabel", "预测边界");
      text("smartRightAgent", page.rightAgent);
      text("smartRightAdvice", page.rightAdvice);
      text("smartAgentRoleLabel", "");
      text("smartAgentPosture", "陛下，臣负责调阅各部奏折、校准目标并统筹执行；钦天监另呈大势与战略，最终仍候您圣裁。");
      renderSmartList("smartBenefitList", page.leftItems, "memorial");
      renderSmartList("smartWatchList", page.rightItems, "trend");
      renderAbilityList(page.abilities);
      const trendButton = document.querySelector(".right-panel .smart-watch-section [data-surface]");
      if (trendButton) { trendButton.dataset.surface = "materials"; trendButton.textContent = "查看大势"; }
      const tabNames = { brief: "商议", progress: "奏折", materials: "大势", result: "圣旨" };
      document.querySelectorAll(".display-tabs [data-surface]").forEach(button => { button.textContent = tabNames[button.dataset.surface] || button.textContent; });
      const returnButton = document.querySelector(".display-surface-head [data-surface='brief']");
      if (returnButton) returnButton.textContent = "← 返回商议";
    } else if (page.id === "A03") {
      text("leftPanelKicker", "立项 · 阶段 · 进度");
      text("rightPanelKicker", "项目总责 · 分析");
      text("smartBenefitLabel", "项目立项与阶段");
      text("smartWatchLabel", "丞相对当前项目的分析");
      text("smartAbilityLabel", "深入查看项目");
      text("smartNewsLabel", "进度边界");
      text("smartRightAgent", page.rightAgent);
      text("smartRightAdvice", page.rightAdvice);
      text("smartAgentRoleLabel", "");
      text("smartAgentPosture", "陛下，凡多 Agent、蜂群或跨部门协同，臣都会先建立唯一项目，再按真实事件回奏进度与阻塞。");
      renderSmartList("smartBenefitList", page.leftItems, "project");
      renderSmartList("smartWatchList", page.rightItems, "watch");
      renderAbilityList(page.abilities);
      renderProjectSwarm(page.swarmOpinions);
      const projectButton = document.querySelector(".right-panel .smart-watch-section [data-surface]");
      if (projectButton) { projectButton.dataset.surface = "materials"; projectButton.textContent = "查看分析"; }
      const tabNames = { brief: "项目", progress: "事件", materials: "蜂群", result: "成果" };
      document.querySelectorAll(".display-tabs [data-surface]").forEach(button => { button.textContent = tabNames[button.dataset.surface] || button.textContent; });
      const returnButton = document.querySelector(".display-surface-head [data-surface='brief']");
      if (returnButton) returnButton.textContent = "← 返回项目";
    } else if (["A06", "C03", "P01"].includes(page.id)) {
      const tabNamesByPage = {
        A06: { brief: "档案总卷", progress: "进化", materials: "知识库", result: "数据册" },
        C03: { brief: "今日进化", progress: "状元榜", materials: "能力科举", result: "升级奏请" },
        P01: { brief: "万邦总图", progress: "大模型", materials: "外接设备", result: "交易市集" }
      };
      const tabNames = tabNamesByPage[page.id];
      document.querySelectorAll(".display-tabs [data-surface]").forEach(button => { button.textContent = tabNames[button.dataset.surface] || button.textContent; });
      const returnButton = document.querySelector(".display-surface-head [data-surface='brief']");
      if (returnButton) returnButton.textContent = `← 返回${tabNames.brief}`;
      const watchButton = document.querySelector(".right-panel .smart-watch-section [data-surface]");
      if (watchButton) { watchButton.dataset.surface = "progress"; watchButton.textContent = `查看${tabNames.progress}`; }
    } else {
      const tabNames = { brief: "御断", progress: "办理", materials: "材料", result: "成果" };
      document.querySelectorAll(".display-tabs [data-surface]").forEach(button => { button.textContent = tabNames[button.dataset.surface] || button.textContent; });
      const returnButton = document.querySelector(".display-surface-head [data-surface='brief']");
      if (returnButton) returnButton.textContent = "← 返回御断";
      const watchButton = document.querySelector(".right-panel .smart-watch-section [data-surface]");
      if (watchButton) { watchButton.dataset.surface = "progress"; watchButton.textContent = "查看办理"; }
    }
    const continuingTask = taskMode === "continue" && taskPassport;
    const officeContext = options.officeContext || (continuingTask && taskPassport.officeName ? taskPassport : null);
    const contextLabels = continuingTask ? taskContextLabels(page) : officeContext
      ? [`来源各司：${officeContext.departmentName} · ${officeContext.officeName}`, `司职：${officeContext.officeDuty}`, ...page.contexts]
      : page.contexts;
    app.dataset.taskPassport = continuingTask ? taskPassport.id : "";
    updateTaskResultShortcut();
    updateResumeButton();
    const chips = $("contextChips");
    chips.replaceChildren(...contextLabels.map(label => {
      const chip = document.createElement("span"); chip.textContent = label; return chip;
    }));
    if (officeContext) {
      text("displayContext", `${officeContext.officeName} · 共享专业工作台`);
      text("signalText", `${officeContext.departmentName} · ${officeContext.officeName}已进入共享专业工作台；司级专属参数与真实数据尚未接入。`);
    }
    discussionState = page.id === "A02" ? "understanding" : "default";
    selectedStrategy = "";
    currentTopicInput = "";
    understandingVersion = 1;
    petitionDraft = null;
    app.dataset.discussion = discussionState;
    delete app.dataset.jobState;
    delete app.dataset.jobAllowCancel;
    delete app.dataset.jobShowResult;
    document.querySelectorAll("[data-strategy]").forEach(button => button.setAttribute("aria-pressed", "false"));
    $("primaryAction").disabled = false;
    app.dataset.scroll = page.id === "D03" ? "compare" : "half";
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
    } else if (page.id === "A02") updateDiscussionState();
    if (continuingTask && taskPassport.inputSource === "RESULT_CONTRACT" && page.id === taskPassport.resultTargetPage) {
      app.dataset.scroll = "half";
      setTaskState(taskPassport.stage === "result" ? "result" : "summoned");
      text("verdictTitle", `专业生成页已接收：${taskPassport.resultTitle}。`);
      text("nowAction", `形成${taskPassport.resultFormat || "本地演示成果"}`);
      text("primaryAction", `生成本地演示：${taskPassport.resultTitle}`);
      text("primaryConsequence", "点击后：只生成标记为 DEMO 的本地成果包，不调用模型、不写入外部系统，也不产生现实操作。");
    }
    applyResultPageAvailability();
    applyTaskStageControls();
    renderCentralSurface("brief");
    renderSpecialWorkspace(page);
    applyAgentIdentity(page);
    updateDisplayTabsForMode(page, app.dataset.mode || "smart");
    if (!options.openDisplay) app.dataset.scroll = "seal";
    updateScrollLabel();
    setActiveNavigation();
    if (pushHash) history.pushState({ page: page.id, taskId: taskPassport?.id || null }, "", `#page=${page.id}`);
    document.title = `${page.title}｜朝堂 AI OS`;
    text("routeAnnouncement", `已进入${page.title}。当前主责：${page.agent}。`);
    if (pushHash || options.routeChange) $("pageTitle")?.focus({ preventScroll: true });
    if (window.innerWidth < 1180) {
      setPanelCollapsed("left", true);
      setPanelCollapsed("right", true);
    }
  }

  function renderSpecialWorkspace(page) {
    const workspace = $("specialWorkspace");
    if (!workspace) return;
    workspace.hidden = true;
    workspace.replaceChildren();
    const contracts = {
      R01: ["档案检索", "按任务、成果、人物、部门或时间查找", [["检索范围", "任务与成果 · 决策与证据 · 知识与版本"], ["当前状态", "真实档案尚未接入；不会伪造搜索结果"]]],
      S01: ["自动呈报计划", "只在出现重要变化、真实进展或新成果时呈报", [["价值阈值", "无新判断时保持静默"], ["控制权", "可暂停 · 可撤销 · 预算有上限"]]],
      T01: ["旅行草案", "目的与底线 → 路线与预算 → 证件风险 → 授权预览", [["先确认", "目的地、日期、同行人与不能牺牲的体验"], ["现实边界", "不搜索实时价格，不预订，不付款"]]],
      U01: ["拟旨前后对照", "原话保留不改写人格；只补结果、边界、证据与停止条件", [["原话", "我想解决一件事，但还没想清楚怎么问"], ["拟旨", "最终交付＋最多两个未知＋引用去重＋停止条件"]]]
    };
    const contract = contracts[page.id];
    if (!contract) return;
    workspace.hidden = false;
    const heading = document.createElement("div"); heading.className = "special-workspace-head";
    const title = document.createElement("b"); title.textContent = contract[0];
    const note = document.createElement("small"); note.textContent = contract[1];
    heading.append(title, note);
    const grid = document.createElement("div"); grid.className = "special-workspace-grid";
    contract[2].forEach(([label, value]) => {
      const article = document.createElement("article");
      const key = document.createElement("span"); key.textContent = label;
      const detail = document.createElement("b"); detail.textContent = value;
      article.append(key, detail); grid.append(article);
    });
    workspace.append(heading, grid);
  }

  function updateDiscussionState() {
    if (current.id !== "A02") return;
    app.dataset.discussion = discussionState;
    const primary = $("primaryAction");
    const syncStrategicChoices = () => {
      document.querySelectorAll("[data-study-strategy]").forEach(button => {
        const locked = discussionState === "understanding";
        button.disabled = locked;
        button.setAttribute("aria-disabled", String(locked));
        button.setAttribute("aria-pressed", String(button.dataset.studyStrategy === selectedStrategy));
        button.title = locked ? "先准奏确认问题理解，才可选择战略" : "选择后仍需准奏，不会直接执行";
      });
      text("smartAbilityLabel", discussionState === "understanding" ? "确认理解后呈上战略选择" : discussionState === "options" ? "钦天监呈上三种战略选择" : "已选战略 · 可在圣旨前驳回");
    };
    if (discussionState === "understanding") {
      setTaskStage("understanding");
      setTaskState("understanding");
      text("stageLabel", "阶段 · 理解确认");
      if (!taskPassport) {
        text("verdictTitle", "先说出你想解决什么，丞相才能复述并确认。");
        text("situation", "当前还没有用户议题或任务护照");
        text("impact", "没有你的原话，朝堂不会用通用演示句替你下旨");
        text("nowAction", "在底部说出想得到的结果、限制或担忧");
        text("primaryAction", "先说出你想得到什么");
        text("primaryConsequence", "点击后：光标进入对话栏；不会生成三策、拟旨或任务。");
        primary.disabled = false;
        syncStrategicChoices();
        return;
      }
      const isResultContract = taskPassport?.inputSource === "RESULT_CONTRACT" && taskPassport.resultTargetPage;
      text("verdictTitle", isResultContract
        ? `丞相理解：你要得到“${taskPassport.resultTitle}”，交付为“${taskPassport.resultFormat}”。`
        : currentTopicInput ? `丞相理解 · 第 ${understandingVersion} 版：你要处理的是“${currentTopicInput}”。` : current.verdict);
      text("situation", isResultContract ? `成果来自${pageMap.get(taskPassport.sourcePage)?.title || "当前部门"}的结果合同` : currentTopicInput ? "议题或关键边界已经由你补充" : current.situation);
      text("impact", isResultContract ? "确认后只进入专业生成页；不会直接生成、调用模型或执行现实操作" : currentTopicInput ? "上一版确认、三策与授权已经失效" : current.impact);
      text("nowAction", isResultContract ? "核对成果名称、格式和必要输入" : currentTopicInput ? "检查这次复述是否准确" : current.action);
      text("primaryAction", isResultContract ? "确认理解，进入专业生成页" : current.primary);
      text("primaryConsequence", isResultContract ? "点击后：携带同一任务护照进入专业生成页；不会调用模型或外部服务。" : `点击后：${current.consequence}`);
      primary.disabled = false;
      syncStrategicChoices();
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
      text("primaryAction", selectedStrategy ? `采用${selectedStrategy}，形成拟旨` : "请先选择一策");
      text("primaryConsequence", selectedStrategy ? "点击后：形成可预览的奏请草案，不会直接下旨或执行。" : "先比较三策并选择一项，主动作才会解锁。");
      primary.disabled = !selectedStrategy;
      syncStrategicChoices();
      return;
    }
    setTaskStage("confirmation");
    setTaskState("confirmation");
    text("stageLabel", "阶段 · 奏请预览");
    text("verdictTitle", `已选择${selectedStrategy}；先预览奏请，再决定是否正式下旨。`);
    text("situation", "方案已经由你选择");
    text("impact", "外部动作仍处于锁定状态");
    text("nowAction", "检查目标、承办、风险与授权边界");
    text("primaryAction", "确认版本，预览正式下旨");
    text("primaryConsequence", "点击后：御屏转为圣旨预览，只展示目标、主责、风险和授权边界；不会触发真实任务或外部动作。");
    primary.disabled = false;
    syncStrategicChoices();
  }

  function resetDiscussion(reason) {
    if (current.id !== "A02") return;
    discussionState = "understanding";
    selectedStrategy = "";
    if (taskPassport) delete taskPassport.selectedStrategy;
    activeDecreeFingerprint = "";
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
    confirm.textContent = "正式下旨（本地演示）";
    confirm.addEventListener("click", () => {
      if (!taskPassport) {
        drawer.close();
        promptInput.focus();
        showToast("请先说出具体目标；没有用户原话和任务护照，不能正式下旨。");
        return;
      }
      taskPassport.jobState = "QUEUED";
      setTaskStage("coordinate");
      drawer.close();
      navigateTo("A03", { taskMode: "continue" });
      showToast("已进入军机处本地演示会办；没有调用模型、部门或外部服务。");
    });
    actions.append(confirm);
    if (window.parent !== window) {
      const prepare = document.createElement("button");
      prepare.type = "button";
      prepare.className = "primary";
      prepare.textContent = "转入真实办理";
      prepare.addEventListener("click", () => {
        const objective = taskPassport?.userInput?.trim();
        if (!objective || objective.length > 4000) {
          showToast("请填写 1 至 4000 字的目标，再转入真实上书房。");
          return;
        }
        window.parent.postMessage({ type: "chaotang:prepare-decree", prompt: objective }, window.location.origin);
        drawer.close();
        showToast("已请求打开真实上书房；仍需登录、确认理解与拟旨后才能正式下旨。");
      });
      actions.append(prepare);
    }
    body.append(actions);
    if (!drawer.open) drawer.showModal();
  }

  function updateScrollLabel() {
    const labels = { seal: "玉玺", half: "半卷", full: "全卷", compare: "对卷" };
    const medium = app.dataset.displayMedium;
    const generic = { seal: "收起", half: "摘要", full: "展开", compare: "对照" };
    text("scrollStateLabel", (medium === "decree" ? labels : generic)[app.dataset.scroll] || (medium === "decree" ? "半卷" : "摘要"));
    const expanded = app.dataset.scroll !== "seal";
    document.querySelectorAll("[data-scroll-toggle], [data-scroll-collapse]").forEach(button => button.setAttribute("aria-expanded", String(expanded)));
  }

  function handleSpecialWorkspaceAction() {
    const contracts = {
      R01: { understood: "丞相理解：你要在同一处找到相关任务、成果、决策与版本。", result: "《档案检索条件卡》DEMO：已列出检索范围、筛选条件与无结果状态。", confirm: "确认检索条件并生成演示卡" },
      S01: { understood: "丞相理解：你只希望在出现重要变化或真实进展时收到呈报。", result: "《自动呈报草案》DEMO：价值阈值、来源、频率、预算上限与暂停条件已列明。", confirm: "确认边界并生成呈报草案" },
      T01: { understood: "内务府理解：先守住预算、体力与同行体验，再比较路线。", result: "《旅行草案》DEMO：目标、路线骨架、预算、证件风险与授权步骤已列明。", confirm: "确认目标并生成旅行草案" },
      U01: { understood: "翰林学士理解：保留你的原话，只补可验收结果、关键未知与停止条件。", result: "《拟旨练习卡》DEMO：已形成原话、拟旨、引用去重与复用模板的前后对照。", confirm: "确认理解并生成拟旨练习" }
    };
    const contract = contracts[current.id];
    if (!contract) return false;
    if (app.dataset.specialStep === "result") {
      openResultPackage();
      return true;
    }
    const workspace = $("specialWorkspace");
    if (app.dataset.specialStep !== "understood") {
      createTaskPassport(current.action, { sourcePage: current.id, focus: current.outcome, contexts: current.contexts, inputSource: "SPECIAL_WORKSPACE" });
      setTaskStage("understanding");
      app.dataset.specialStep = "understood";
      const note = document.createElement("p"); note.className = "special-contract-note"; note.textContent = contract.understood;
      workspace.append(note);
      text("primaryAction", contract.confirm);
      text("primaryConsequence", "点击后：只形成标记为 DEMO 的本地可编辑产物，不调用模型或外部服务。");
      showToast(`${current.agent}已先复述理解；请确认后再生成演示产物。`);
      return true;
    }
    setTaskStage("result");
    setTaskState("result");
    const result = document.createElement("article"); result.className = "special-contract-result";
    const label = document.createElement("span"); label.textContent = "可带走成果";
    const value = document.createElement("b"); value.textContent = contract.result;
    result.append(label, value); workspace.append(result);
    text("primaryAction", "查看、下载并反馈");
    text("primaryConsequence", "点击后：打开同一任务的本地演示成果包；不会产生现实操作。");
    app.dataset.specialStep = "result";
    showToast("本地演示成果已形成；真实数据、实时信息和外部执行均未接入。");
    return true;
  }

  function toggleScroll() {
    const order = current.id === "D03" ? ["seal", "half", "compare", "full"] : current.id === "A02" && discussionState === "options" ? ["seal", "half", "compare"] : ["seal", "half", "full"];
    const index = order.indexOf(app.dataset.scroll);
    app.dataset.scroll = order[(index + 1) % order.length];
    updateScrollLabel();
    requestAnimationFrame(() => {
      const target = app.dataset.scroll === "seal" ? document.querySelector(".seal-state button") : document.querySelector(".display-collapse");
      target?.focus({ preventScroll: true });
    });
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
      const briefContexts = { A06: "史馆 · 档案总卷", C03: "翰林院 · 今日进化", P01: "鸿胪寺 · 万邦总图" };
      text("displayContext", current.id === "A02" ? (discussionState === "understanding" ? "御前商议 · 理解确认" : discussionState === "options" ? "御前商议 · 三策会审" : "圣旨草案 · 待御裁") : current.id === "A03" ? "项目总览 · 当前阻塞" : briefContexts[current.id] || "当前御断");
      if (app.dataset.mode === "smart" && app.dataset.scroll === "full" && current.id !== "D03" && !(current.id === "A02" && discussionState === "options")) {
        app.dataset.scroll = "half";
        updateScrollLabel();
      }
      return;
    }

    const definitions = {
      advice: ["为什么这样建议", "先给推荐，再按需展开理由。以下为页面演示，不代表实时结论。", [["推荐", $("verdictTitle").textContent], ["与你的关系", $("impact").textContent], ["证据边界", current.why]]],
      example: ["示范案例", "先看一个相似的人怎么说、朝堂怎么判断、最后能带走什么。以下只是教学示范，不是你的真实数据。", [["他这样说", current.exampleCase.userSays], ["朝堂发现", current.exampleCase.insight], ["只做这几步", current.exampleCase.process], ["最终带走", current.exampleCase.artifact]]],
      coach: ["教我一步", "不需要学习提示词、部门或模型。照着下面这句话说，朝堂先理解，再给建议。", [["你可以直接这样说", current.nextPrompt], ["再补一句边界", "告诉我最担心什么、不能做什么；如果信息不足，最多问我两个问题。"], ["你会学会", current.growth]]],
      glossary: ["名词解释", "朝堂名词必须翻译成用户能理解的行动和结果。", [["御断", "一句话核心判断。"], ["奏请", "执行前可以修改和确认的方案草案。"], ["回奏", "智能体或部门交回的阶段结果。"], ["智能体蜂群", "为同一结果临时组成的最小协作队伍。"]]],
      progress: [taskStateContent[taskState][0], taskStateContent[taskState][1], [[current.agent, taskState === "quiet" ? "待命 · 未收到真实任务事件" : "当前页面主责 · 本地演示"], ["锦衣卫", "只有需要核验证据时才召见。"], ["钦天监", "只有需要条件推演时才召见。"], ["六部与专署", "按结果最小组队，没有事件时不离阵。"]]],
      materials: ["材料与引用", "每份材料都要说明来源、用途和缺口。", current.leftItems.map(item => [item.title, `${item.meta} · ${item.status}`])],
      result: ["成果与下载", taskState === "result" ? "成果已形成；先看结论，再下载或反馈。" : "当前尚未形成真实成果，不能提前显示成功。", [["你获得的信息", current.situation], ["朝堂的建议", current.verdict], ["你会收获的结果", current.outcome], ["现在应该做", current.action], ["这次顺便学会", current.growth], ["外部动作", "全部保持锁定，需逐项预览确认。"]]],
      archiveSearch: ["档案检索", "按项目、人物、部门、时间和成果查找；当前原型只展示结构，不伪造已有档案。", [["任务与成果", "检索同一任务的目标、过程、产物与验收"], ["决策与证据", "回看当时为什么这样判断、哪些条件后来改变"], ["知识条目", "查找经过确认的方法、规则、来源和适用边界"], ["版本与权限", "查看谁在何时修改、引用、授权或撤销"]]]
    };
    if (current.id === "A02") {
      definitions.progress = ["各部奏折与回奏", "所有专业意见沿用同一议题和任务护照；以下均为未接入真实后端的演示结构。", current.leftItems.map(item => [item.title, `${item.meta} · ${item.status}`])];
      definitions.materials = ["钦天监 · 大势与预测", "钦天监只使用锦衣卫核验后的信息形成条件判断；预测不是承诺，关键条件变化即失效。", current.rightItems.map(item => [item.title, `${item.meta} · ${item.status}`])];
      definitions.result = ["圣旨 · 决策与授权", discussionState === "draft" ? "已形成可预览草案；正式交军机处以前仍可驳回或补证。" : "理解与战略尚未完成，当前不能形成圣旨。", [["问题定义", discussionState === "understanding" ? "等待您准奏确认" : "已经用户确认"], ["战略选择", selectedStrategy || "尚未选择"], ["主责", "丞相统筹；承办部门将在授权前明确"], ["外部动作", "保持锁定，必须逐项预览确认"]]];
    } else if (current.id === "A03") {
      definitions.progress = ["项目事件线", "阶段只随可核验事件变化；没有事件时保持原位，不用时间流逝或动画冒充推进。", [["立项", "已建立结果合同与唯一项目"], ["范围确认", "当前阶段 · 等待客户记录使用边界"], ["最小验证", "尚未开始"], ["验收复盘", "尚未开始"]]];
      definitions.materials = ["蜂群会签意见", "每位 Agent 只提交自己的专业会签；由丞相汇总为一个项目建议，会签不会直接改变授权。", current.swarmOpinions.map(item => [item.title, `${item.meta} · ${item.status}`])];
      definitions.result = ["项目成果与验收", taskState === "result" ? "成果已经形成，可以查看证据、下载和反馈。" : "尚无真实执行事件和验收产物，当前不能显示完成。", [["预期成果", "《14天项目回奏＋验收清单》"], ["最小验收", "整理时间是否减少50%，且不降低客户体验"], ["当前证据", "尚未接入真实任务事件"], ["外部动作", "数据访问、发送、发布与付款全部保持锁定"]]];
    } else if (current.id === "A06") {
      definitions.progress = ["进化时间线", "只用作品、决策、结果和复盘证据说明进化，不用登录天数或虚假排名。", [["用户能力", "查看新学会的方法与可复用作品"], ["智能体能力", "查看哪项能力因真实结果获得升级建议"], ["判断质量", "比较当时判断、实际结果与偏差来源"], ["下一次改进", "只保留一条最值得继续练习的建议"]]];
      definitions.materials = ["知识库", "按主题、项目和来源检索已确认知识；原始材料、推断和总结保持分层。", [["个人方法库", "你已经验证有效的做事方法"], ["项目知识库", "任务材料、决策、产物与复盘"], ["朝堂知识库", "经过审核的规则、模板与能力说明"], ["来源与版本", "每条知识保留出处、时间和适用边界"]]];
      definitions.result = ["档案数据册", "数据库入口只展示索引、关系和状态，不把未接入数据伪装成已有记录。", [["任务与成果", "按人物、项目、时间、部门和结果检索"], ["决策与证据", "查看当时为什么这样判断"], ["能力与版本", "查看 Agent、Skill、工作流的演进记录"], ["当前状态", "真实档案与数据库尚未接入"]]];
    } else if (current.id === "C03") {
      definitions.progress = ["状元榜", "榜单只依据可复现评测与真实任务表现，不按热度、下载量或宣传排名。", [["插件榜", "按稳定性、安全性、任务价值和维护状态评选"], ["Skill榜", "按正确率、成本、复用率和边界清晰度评选"], ["Agent榜", "按真实成果、人工纠错率和协作表现评选"], ["工作流榜", "按完成率、可回退性与交付质量评选"]]];
      definitions.materials = ["能力科举", "候选先由锦衣卫核验来源，再经过沙箱、黄金任务和独立复核。", [["本期候选", "插件、Skills、Agents 与工作流"], ["考试科目", "质量、成本、速度、安全、权限和可维护性"], ["当前结果", "尚未接入真实候选与评测数据"], ["入朝条件", "用户批准、可撤销、可回退且不扩大权限"]]];
      definitions.result = ["升级奏请", "只有候选通过评测并证明能改善真实结果，才允许提出升级；不会自动安装。", [["升级什么", "明确版本、能力和替代对象"], ["为什么升级", "引用真实任务差距和评测回执"], ["如何验证", "先影子运行，再小范围试用"], ["如何回退", "保留旧版本、停止条件与撤销入口"]]];
    } else if (current.id === "P01") {
      definitions.progress = ["全球大模型名录", "比较模型能力、成本、速度、数据地区与可用协议；当前不连接真实供应商。", [["通用大模型", "理解、推理、生成与多模态候选"], ["专业模型", "代码、研究、金融、图像、视频与语音候选"], ["执行环境", "Codex、Harness 与外部 Agent Runtime"], ["准入状态", "候选默认无执行权，必须通过入朝三试"]]];
      definitions.materials = ["外接设备与服务", "设备、企业系统、数据源和 SaaS 统一先说明读取什么、能做什么及如何断开。", [["本地设备", "电脑、手机、传感器、机器人与专用终端"], ["企业系统", "ERP、CRM、知识库和行业数据库"], ["外部服务", "MCP、API、SaaS 与人工专家"], ["权限原则", "只读优先、独立凭据、最小租户范围"]]];
      definitions.result = ["Skills 与经验交易市集", "交易对象首先是可验证的能力契约、经验包与结果证据，不出售未经验证的宣传。", [["Skills 市集", "查看输入输出、依赖、权限、价格和评测"], ["Agent与工作流", "查看适用任务、协作边界和真实结果"], ["经验与知识包", "购买前说明来源、许可、复用范围和更新责任"], ["现实交易", "当前未开放；付款、安装和授权必须分别确认"]]];
    }
    const fullDefinition = definitions[normalized] || definitions.advice;
    const definition = app.dataset.mode === "smart"
      ? [fullDefinition[0], fullDefinition[1], fullDefinition[2].slice(0, 3)]
      : fullDefinition;
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
      start.textContent = normalized === "example" ? "以此为模板" : "回到对话栏开始";
      start.addEventListener("click", () => {
        promptInput.value = normalized === "example" ? current.exampleCase.starter : current.nextPrompt;
        renderCentralSurface("brief");
        sendButton.disabled = !promptInput.value.trim();
        app.dataset.composerStage = promptInput.value.trim() ? "draft" : "idle";
        promptInput.focus();
        if (normalized === "example") showToast("示范模板已放入对话栏；请把【请填写】改成你的真实情况后再发送。");
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
    if (["seal", "half"].includes(app.dataset.scroll)) app.dataset.scroll = "full";
    updateScrollLabel();
  }

  function renderPageState(state = "normal") {
    const allowed = ["empty", "loading", "failure", "insufficient", "permission", "stale"];
    if (state === "normal" || !allowed.includes(state)) {
      app.dataset.viewState = "normal";
      renderCentralSurface("brief");
      return;
    }
    app.dataset.viewState = state;
    const surface = $("displaySurface");
    const content = $("scrollContent");
    const body = $("displaySurfaceBody");
    const labels = {
      empty: ["当前为空", "开始说明目标"],
      loading: ["正在读取", "取消读取"],
      failure: ["读取失败", "重试读取"],
      insufficient: ["材料不足", "补充关键信息"],
      permission: ["权限不足", "查看所需权限"],
      stale: ["数据可能过期", "更新并重新核验"]
    };
    text("displayContext", labels[state][0]);
    text("displaySurfaceKicker", "页面状态 · 可恢复");
    const intro = document.createElement("p");
    intro.className = "surface-intro";
    intro.textContent = current.states[state];
    const truth = document.createElement("div");
    truth.className = "surface-list";
    [["任务上下文", taskPassport ? `继续保留 ${taskPassport.id}` : "当前没有任务护照"], ["已输入内容", "保持在对话栏，不因失败或权限状态清空"], ["数据边界", "没有成功证据时不会显示结果、进度或可信度"]].forEach(([label, value]) => {
      const article = document.createElement("article");
      article.innerHTML = `<b>${label}</b><small>${value}</small>`;
      truth.append(article);
    });
    const actions = document.createElement("div");
    actions.className = "surface-actions";
    const action = document.createElement("button");
    action.type = "button";
    action.className = "primary";
    action.textContent = labels[state][1];
    action.addEventListener("click", () => {
      if (["empty", "insufficient"].includes(state)) { promptInput.focus(); showToast("请补充目标或最多两项关键信息；原有上下文仍保留。"); return; }
      if (state === "permission") { openDrawer("permissions"); return; }
      renderPageState("normal");
      showToast(state === "stale" ? "已回到核验前状态；正式版需真实来源更新后才形成新结论。" : "已回到正常页面；当前原型没有伪造新的读取或成功事件。");
    });
    actions.append(action);
    body.replaceChildren(intro, truth, actions);
    content.hidden = true;
    surface.hidden = false;
    if (app.dataset.scroll === "seal") app.dataset.scroll = "half";
    updateScrollLabel();
  }
  window.CHAOTANG_SET_VIEW_STATE = renderPageState;

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
        title: "看懂以后，换成你的情况",
        intro: "示范只帮助你理解怎么开始，不会被冒充成你的真实数据或成功案例。",
        items: [
          ["他这样说", current.exampleCase.userSays],
          ["朝堂发现", current.exampleCase.insight],
          ["只做这几步", current.exampleCase.process],
          ["最终带走", current.exampleCase.artifact]
        ],
        action: ["以此为模板", () => {
          promptInput.value = current.exampleCase.starter;
          sendButton.disabled = false;
          app.dataset.composerStage = "draft";
          drawer.close();
          promptInput.focus();
          showToast("示范模板已放入对话栏；请把【请填写】改成你的真实情况后再发送。");
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
      `- 约定成果：${taskPassport.resultTitle || growth.artifact}`,
      `- 交付格式：${taskPassport.resultFormat || growth.artifact}`,
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
      `- 你获得了什么：${taskPassport.resultFormat || growth.artifact}`,
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

  function persistFeedback(record) {
    try {
      const key = "chaotang-demo-feedback-v1";
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      const sameResultIndex = existing.findIndex(item => item.taskId === record.taskId && item.resultVersion === record.resultVersion);
      if (sameResultIndex >= 0) existing[sameResultIndex] = record;
      else existing.push(record);
      localStorage.setItem(key, JSON.stringify(existing.slice(-50)));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function openSharePreview() {
    if (!taskPassport || taskPassport.stage !== "result") return;
    const contractPage = pageMap.get(taskPassport.sourcePage) || current;
    const growth = contractPage.growthContract || current.growthContract;
    text("drawerKicker", "成果传播 · 脱敏预览");
    text("drawerTitle", "先预览，再决定是否带走");
    const body = $("drawerBody");
    const card = document.createElement("section");
    card.className = "share-card";
    const brand = document.createElement("span");
    const heading = document.createElement("h3");
    const result = document.createElement("p");
    const next = document.createElement("small");
    brand.textContent = "朝堂 AI OS · 御断成果卡 · DEMO";
    heading.textContent = contractPage.verdict;
      result.textContent = `本次形成：${taskPassport.resultFormat || growth.artifact}`;
    next.textContent = `下一步：${contractPage.action}。证据状态：演示，未连接真实来源。`;
    card.append(brand, heading, result, next);
    const note = buildTruthNote("脱敏卡不包含用户原话、任务编号、材料内容、账户信息或未授权来源；本原型不会直接发布到外部平台。");
    const actions = document.createElement("div");
    actions.className = "drawer-actions";
    const download = document.createElement("button");
    download.type = "button";
    download.className = "primary";
    download.textContent = "下载脱敏成果卡 (.txt)";
    download.addEventListener("click", () => {
      const content = ["朝堂 AI OS · 御断成果卡 · DEMO", "", contractPage.verdict, "", `本次形成：${taskPassport.resultFormat || growth.artifact}`, `下一步：${contractPage.action}`, "", "演示状态：未连接真实来源或外部执行。"].join("\n");
      const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `朝堂脱敏成果卡-${contractPage.id}.txt`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast("脱敏演示成果卡已下载；没有执行外部分享。 ");
    });
    const back = document.createElement("button");
    back.type = "button";
    back.textContent = "返回完整成果";
    back.addEventListener("click", openResultPackage);
    actions.append(download, back);
    body.replaceChildren(card, note, actions);
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
      ["你获得了什么", taskPassport.resultFormat || growth.artifact],
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
    const share = document.createElement("button");
    share.type = "button";
    share.textContent = "预览脱敏分享卡";
    share.addEventListener("click", openSharePreview);
    actions.append(download, share, evidence);

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

    submit.addEventListener("click", () => {
      const selectedReasons = [...reasons.querySelectorAll('button[aria-pressed="true"]')].map(button => button.textContent);
      const saved = persistFeedback({
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

  function openComposerTools() {
    const intro = document.createElement("p");
    intro.textContent = "这里只收纳偶尔使用的材料与专业能力。小白可以不选，先直接说出想得到的结果。";
    const actions = document.createElement("div");
    actions.className = "drawer-actions";
    [
      ["添加材料", () => openDrawer("materials")],
      ["引用与上下文", openContextManager],
      ["Skills", openSkillPicker],
      ["插件", openPluginPicker],
      ["协同智能体", openAgentTeam]
    ].forEach(([label, action]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", action);
      actions.append(button);
    });
    showBuiltDrawer("对话栏 · 按需展开", "添加材料与能力", [intro, actions, buildTruthNote("当前原型不会读取文件、调用Skill、连接插件、召集智能体或消耗算筹。")]);
  }

  function openDraftDecree() {
    const original = promptInput.value.trim() || taskPassport?.userInput || current.verdict || "请丞相先复述当前议题。";
    const resultTarget = current.outcome || "一份可查看、可修改、可带走的成果";
    decreeDraftVersion += 1;
    const fingerprint = `${current.id}:${understandingVersion}:${decreeDraftVersion}:${original.length}:${selectedStrategy || "未择策"}`;
    activeDecreeFingerprint = fingerprint;
    const canonicalDraft = [
      `我要解决：${original}`,
      `最终交付：${resultTarget}`,
      `请先确认：成功标准与截止时间（最多追问两项关键未知）`,
      `边界：不得伪造事实、来源、进度或成功状态；外部动作先预览确认`,
      `停止条件：出现会推翻判断、超出预算或触碰权限边界的事实时暂停并回奏`,
      `输出顺序：一句结论 → 建议行动 → 依据与未知 → 可带走成果`,
      `节流规则：复用当前任务护照与引用；去除重复背景；只展开会改变判断的信息`
    ].join("\n");

    const surface = $("displaySurface");
    const content = $("scrollContent");
    const body = $("displaySurfaceBody");
    app.dataset.scroll = "half";
    updateScrollLabel();
    surface.hidden = false;
    content.hidden = true;
    text("displayContext", `丞相拟旨 · 第 ${decreeDraftVersion} 版`);
    text("displaySurfaceKicker", discussionState === "understanding" ? "拟旨草案 · 待确认理解" : "拟旨草案 · 可继续修订");

    const decreeDocument = window.document.createElement("article");
    decreeDocument.className = "memorial-document decree-document";
    decreeDocument.dataset.kind = "decree";
    const heading = document.createElement("header");
    const kicker = document.createElement("span");
    const title = document.createElement("h2");
    const issuer = document.createElement("small");
    kicker.textContent = "奉天承运";
    title.textContent = "拟旨";
    issuer.textContent = `丞相谨拟 · 第 ${decreeDraftVersion} 版`;
    heading.append(kicker, title, issuer);
    const rows = document.createElement("dl");
    [
      ["御意", original],
      ["所求", resultTarget],
      ["承办", selectedStrategy ? `丞相按“${selectedStrategy}”统筹；军机处与各部依结果合同承办。` : "先由丞相确认理解；择策后再明确承办部门。"],
      ["验收", "交付可查看、可修改、可带走的成果，并说明依据、未知与停止条件。"],
      ["边界", "发布、付款、交易、发送、删除与其他外部动作，必须另行预览并明确确认。"]
    ].forEach(([label, value]) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = label;
      description.textContent = value;
      row.append(term, description);
      rows.append(row);
    });
    decreeDocument.append(heading, rows);

    const actions = document.createElement("div");
    actions.className = "surface-actions formal-actions";
    const revise = document.createElement("button");
    revise.type = "button";
    revise.textContent = "退回修改";
    revise.addEventListener("click", () => {
      promptInput.value = original;
      sendButton.disabled = false;
      app.dataset.composerStage = "draft";
      activeDecreeFingerprint = "";
      promptInput.focus();
      showToast("原意已放回对话栏；修改后须重新拟旨。 ");
    });
    const adopt = document.createElement("button");
    adopt.type = "button";
    adopt.className = "primary";
    adopt.textContent = "采用拟旨，继续修改";
    adopt.addEventListener("click", () => {
      if (activeDecreeFingerprint !== fingerprint) {
        showToast("当前草案已失效，请按最新议题重新拟旨。 ");
        return;
      }
      promptInput.value = canonicalDraft;
      sendButton.disabled = false;
      app.dataset.composerStage = "draft";
      promptInput.focus();
      showToast("拟旨已放入对话栏；这只是可编辑草案，尚未发送或执行。 ");
    });
    actions.append(revise, adopt);
    body.replaceChildren(decreeDocument, actions);
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
        const trigger = document.querySelector(".model-inline");
        trigger?.setAttribute("aria-label", `选择大模型策略，当前${name}${name === "自动选择" ? "" : "，尚未接入"}`);
        openModelPicker();
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => drawer.querySelector('.drawer-choice[aria-pressed="true"]')?.focus()));
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
    if (type === "agentResult") { openAgentResultSummons(); return; }
    if (type === "draftDecree") { openDraftDecree(); return; }
    if (type === "composerTools") { openComposerTools(); return; }
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
    if (type === "capability") {
      const integration = current.backendIntegration;
      const escapeMarkup = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
      text("drawerKicker", `${current.title} · 真实接入边界`);
      text("drawerTitle", "后端能力与前端接入状态");
      const body = $("drawerBody");
      const endpoints = integration.endpoints.length
        ? integration.endpoints.map(endpoint => `<article><b>${escapeMarkup(endpoint)}</b><small>ext-dev 已发现的候选接口；正式接入前仍需契约与权限验证</small></article>`).join("")
        : "<article><b>尚未确定真实接口</b><small>不会用演示数据冒充后端结果</small></article>";
      body.innerHTML = `<p>这里把“后端是否具备能力”和“本原型是否已经接入”分开说明。</p><div class="drawer-list"><article><b>后端准备度：${escapeMarkup(integration.readiness)}</b><small>${escapeMarkup(integration.owner)}</small></article><article><b>当前前端：${escapeMarkup(integration.connection)}</b><small>因此本页面仍显示原型或尚未接入状态</small></article>${endpoints}<article><b>推荐下一步</b><small>${escapeMarkup(integration.next)}</small></article></div>`;
      window.setTimeout(() => { if (!drawer.open) drawer.showModal(); }, 0);
      return;
    }
    const content = drawerContent[type] || [customTitle || "详情", "当前对象的完整上下文", ["查看内容", "查看来源与缺口", "交给丞相统筹"]];
    text("drawerKicker", current.title);
    text("drawerTitle", customTitle || content[0]);
    const body = $("drawerBody");
    body.innerHTML = `<p>${content[1]}</p><div class="drawer-list">${content[2].map((item, index) => `<article><b>${index + 1}. ${item}</b><small>原型说明 · 不触发真实执行</small></article>`).join("")}</div>`;
    if (type === "account") {
      const actions = document.createElement("div");
      actions.className = "drawer-actions";
      const restart = document.createElement("button");
      restart.type = "button";
      restart.className = "primary";
      restart.textContent = "重新进行丞相入场问卷";
      restart.addEventListener("click", () => { drawer.close(); openOnboarding(true); });
      actions.append(restart);
      body.append(actions);
    }
    window.setTimeout(() => { if (!drawer.open) drawer.showModal(); }, 0);
  }

  function navigateTo(id, options = {}) {
    const next = pageMap.get(id);
    const taskMode = options.taskMode || ((options.preserveContext || taskPassport) ? "continue" : "clear");
    if (next && next.id !== current.id) renderPage(next, true, { ...options, taskMode });
    setMinistriesMenu(false);
    setSpecialsMenu(false);
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
    if (open) setSpecialsMenu(false);
    ministriesMenu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) {
      const rect = button.getBoundingClientRect();
      const width = Math.min(560, window.innerWidth - 24);
      ministriesMenu.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
      ministriesMenu.querySelector("[role='menuitem']")?.focus();
    }
    else if (restoreFocus) button.focus();
  }

  function setSpecialsMenu(open, restoreFocus = false) {
    const button = document.querySelector("[data-menu='specials']");
    if (!button || !specialsMenu) return;
    if (open) setMinistriesMenu(false);
    specialsMenu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) {
      const rect = button.getBoundingClientRect();
      const width = Math.min(560, window.innerWidth - 24);
      specialsMenu.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
      specialsMenu.querySelector("[role='menuitem']")?.focus();
    } else if (restoreFocus) button.focus();
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
    $("onboardingNext")?.addEventListener("click", () => {
      if (onboardingStep < ONBOARDING_STEPS.length) {
        const key = ONBOARDING_STEPS[onboardingStep].key;
        if (!onboardingChoices[key]) return;
        onboardingStep += 1;
        renderOnboarding();
      } else completeOnboarding(false);
    });
    $("onboardingBack")?.addEventListener("click", () => {
      onboardingStep = Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, onboardingStep - 1));
      renderOnboarding();
    });
    $("onboardingSkip")?.addEventListener("click", () => completeOnboarding(true));
    const menuButton = document.querySelector("[data-menu='ministries']");
    const specialsButton = document.querySelector("[data-menu='specials']");
    menuButton.addEventListener("click", event => {
      event.stopPropagation();
      setMinistriesMenu(ministriesMenu.hidden);
    });
    specialsButton.addEventListener("click", event => {
      event.stopPropagation();
      setSpecialsMenu(specialsMenu.hidden);
    });
    document.querySelectorAll(".mode-switch button[data-mode]").forEach(button => button.addEventListener("click", () => {
      applyMode(button.dataset.mode, true);
    }));
    document.querySelectorAll("[data-scroll-toggle]").forEach(button => button.addEventListener("click", toggleScroll));
    document.querySelectorAll("[data-scroll-collapse]").forEach(button => button.addEventListener("click", () => {
      app.dataset.scroll = "seal";
      updateScrollLabel();
      requestAnimationFrame(() => document.querySelector(".seal-state button")?.focus({ preventScroll: true }));
    }));
    document.querySelectorAll("[data-surface]").forEach(button => button.addEventListener("click", () => renderCentralSurface(button.dataset.surface)));
    document.querySelectorAll("[data-collapse]").forEach(button => button.addEventListener("click", () => {
      const side = button.dataset.collapse;
      const panel = document.querySelector(`.${side}-panel`);
      setPanelCollapsed(side, !panel.classList.contains("is-collapsed"));
    }));
    document.querySelectorAll("[data-open='atlas']").forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (!atlas.open) atlas.showModal();
    }));
    document.querySelectorAll("[data-open]:not(.panel-item):not([data-open='atlas'])").forEach(button => button.addEventListener("click", () => {
      if (app.dataset.mode === "smart" && ["advice", "example", "coach", "glossary", "coordination"].includes(button.dataset.open)) showGuidanceNear(button, button.dataset.open);
      else openDrawer(button.dataset.open, button.dataset.itemTitle);
    }));
    document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => button.closest("dialog")?.close()));
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && tutorPinned) {
        event.preventDefault();
        closePinnedTutor();
      } else if (event.key === "Escape" && (!ministriesMenu.hidden || !specialsMenu.hidden)) {
        event.preventDefault();
        if (!ministriesMenu.hidden) setMinistriesMenu(false, true);
        else setSpecialsMenu(false, true);
      }
    });
    [ministriesMenu, specialsMenu].forEach(menu => menu?.addEventListener("keydown", event => {
      const items = [...menu.querySelectorAll("[role='menuitem']:not([disabled])")];
      const index = items.indexOf(document.activeElement);
      let next = null;
      if (event.key === "ArrowDown" || event.key === "ArrowRight") next = items[(index + 1 + items.length) % items.length];
      else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = items[(index - 1 + items.length) % items.length];
      else if (event.key === "Home") next = items[0];
      else if (event.key === "End") next = items.at(-1);
      if (next) { event.preventDefault(); next.focus(); }
    }));
    document.addEventListener("click", event => {
      if (!ministriesMenu.hidden && !ministriesMenu.contains(event.target) && !menuButton.contains(event.target)) setMinistriesMenu(false);
      if (!specialsMenu.hidden && !specialsMenu.contains(event.target) && !specialsButton.contains(event.target)) setSpecialsMenu(false);
      if (tutorPinned && !$("buttonTutor").contains(event.target) && !event.target.closest("[data-open='advice'], [data-open='example'], [data-open='coach'], [data-open='glossary'], [data-open='coordination']")) closePinnedTutor();
    });
    document.addEventListener("mouseover", event => {
      const button = event.target.closest("button");
      if (!button || (event.relatedTarget && button.contains(event.relatedTarget))) return;
      scheduleTutor(button, event);
    });
    document.addEventListener("mousemove", event => {
      if (!$('buttonTutor')?.hidden && !tutorPinned && event.target.closest("button")) placeTutorAtPointer(event.clientX, event.clientY);
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
    if (handleRailPreviewPrimary()) return;
    if (handleSpecialWorkspaceAction()) return;
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
      if (!taskPassport) {
        promptInput.focus();
        showToast("请先在底部说出具体目标；丞相复述确认以后，才会呈上三策。");
        return;
      }
      if (discussionState === "understanding" && taskPassport?.inputSource === "RESULT_CONTRACT" && taskPassport.resultTargetPage && pageMap.has(taskPassport.resultTargetPage)) {
        setTaskStage("summoned");
        navigateTo(taskPassport.resultTargetPage, { taskMode: "continue" });
        showToast(`理解已确认：已携带同一任务护照进入“${taskPassport.resultTitle}”专业生成页；尚未调用模型或外部服务。`);
        return;
      }
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
    if (taskPassport?.inputSource === "RESULT_CONTRACT" && current.id === taskPassport.resultTargetPage && taskPassport.stage === "summoned") {
      setTaskStage("result");
      setTaskState("result");
      openResultPackage();
      showToast(`已形成“${taskPassport.resultTitle}”本地演示成果包；没有调用模型或执行现实操作。`);
      return;
    }
    if (current.id === "A03" && taskPassport?.jobState) {
      const config = decreeJobUi[taskPassport.jobState];
      if (config?.showResult) {
        setTaskStage("result");
        setTaskState("result");
        openTaskResultPage();
      } else openJobStateDetails();
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
    if (app.dataset.mode === "smart") {
      if (!taskPassport) createTaskPassport(current.action, {
        sourcePage: current.id,
        focus: current.outcome,
        contexts: current.contexts,
        inputSource: "PAGE_PRIMARY_ACTION"
      });
      setTaskStage("understanding");
      navigateTo("A02", { taskMode: "continue" });
      showToast(`已把“${current.outcome}”带入丞相理解卡；确认以前不会生成方案或执行。`);
      return;
    }
    setTaskState("summoned");
    showToast(`${current.primary}：已进入本地演示下一阶段；没有触发真实任务或外部动作。`);
    if (app.dataset.scroll === "seal") app.dataset.scroll = "half";
    updateScrollLabel();
  });

  promptInput.addEventListener("input", () => {
    activeDecreeFingerprint = "";
    const hasDraft = Boolean(promptInput.value.trim());
    sendButton.disabled = !hasDraft;
    app.dataset.composerStage = hasDraft ? "draft" : "idle";
  });
  $("explainNextAction").addEventListener("click", () => {
    const routedAgent = conversationAgent === current.agent ? current.agent : `${conversationAgent}转请${current.agent}`;
    promptInput.value = `请${routedAgent}先用小白能懂的话解释：为什么推荐“${current.action}”，我会得到什么，还有什么风险？`;
    sendButton.disabled = false;
    app.dataset.composerStage = "draft";
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
    app.dataset.composerStage = "idle";
  });

  [drawer, atlas].forEach(dialog => dialog.addEventListener("click", event => {
    const box = dialog.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    if (event.target === dialog && outside) dialog.close();
  }));

  buildAtlas();
  const requested = new URLSearchParams(location.hash.replace(/^#/, "")).get("page");
  const initialPage = pageMap.get(requested) || current;
  history.replaceState({ page: initialPage.id, taskId: taskPassport?.id || null }, "", `#page=${initialPage.id}`);
  renderPage(initialPage, false);
  bindStaticControls();
  let narrowPanels = window.innerWidth < 1180;
  if (narrowPanels) {
    setPanelCollapsed("left", true);
    setPanelCollapsed("right", true);
  }
  window.addEventListener("resize", () => {
    const nextNarrow = window.innerWidth < 1180;
    if (nextNarrow === narrowPanels) return;
    narrowPanels = nextNarrow;
    setPanelCollapsed("left", nextNarrow);
    setPanelCollapsed("right", nextNarrow);
  });
  window.setTimeout(() => openOnboarding(false), 180);
  window.addEventListener("hashchange", () => {
    const id = new URLSearchParams(location.hash.replace(/^#/, "")).get("page");
    const next = pageMap.get(id) || pageMap.get("A01");
    if (next && next.id !== current.id) renderPage(next, false, { taskMode: taskPassport ? "continue" : "clear", routeChange: true });
  });
})();

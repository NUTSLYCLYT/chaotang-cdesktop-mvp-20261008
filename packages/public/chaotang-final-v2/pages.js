(function () {
  const I = (title, meta, status = "待确认", sigil = "卷") => ({ title, meta, status, sigil });
  const ROLE_PROFILES = {
    "丞相": ["把你的模糊愿望变成清晰目标，筛选最合适的智能体，并统筹执行到结果。", "你不必懂部门和工具，只要说出想要的结果；丞相负责推荐、协调、纠错与汇总。"],
    "丞相 · 军机处": ["由丞相统筹，把已经确认的复杂任务交军机处变成可追踪项目，盯住阶段、阻塞、责任和验收。", "你会获得清晰进度、唯一待裁决事项和可验收成果，而不是一堆忙碌状态。"],
    "史官": ["记录当时判断、执行事件和真实结果，让你和智能体从证据中持续进化。", "你会知道哪些判断有效、为什么偏差，并把经验变成下次可复用的方法。"],
    "吏部尚书": ["分开管理人类员工与智能体员工，再为任务组成最小、责任清楚的班底。", "你会得到主责、协作、权限和能力缺口，避免人机身份与责任混乱。"],
    "户部尚书": ["把现金、预算、投资、资产和风险翻译成一个可确认的财富决定。", "你会获得安全边界、预算顺序、投资研究与风险说明；交易仍由你确认。"],
    "礼部尚书": ["把业务目标变成广告、品牌、内容、图像和视频的一体化营销成果。", "你会获得受众、主张、素材方案、审核与发布预览，而不只是漂亮内容。"],
    "兵部尚书": ["用可信客户与市场事实制定增长、销售、渠道和谈判攻坚方案。", "你会获得优先客户、行动路径、报价边界和下一步成交动作。"],
    "刑部尚书": ["识别合同、合规和不可逆风险，并给出可修改的安全方案。", "你会获得风险条款、理由、修改建议和需要人工复核的明确边界。"],
    "工部尚书": ["把方案变成可测试、可回退、可验收的产品、技术与交付成果。", "你会获得里程碑、依赖、测试、质量门和交付包。"],
    "锦衣卫指挥使": ["核验信息真假、来源、反证和缺口，让决策建立在可追溯事实之上。", "你会获得事实清单、证据链、相反信号和仍然不知道的部分。"],
    "钦天监监正": ["汇总经过核验的内外部信息与数据，进行条件预测和战略分析。", "你会获得情景、趋势、触发信号、失效条件和应当何时调整战略。"],
    "翰林学士": ["把知识变成练习、作品、项目证据和可复用的 AI 能力。", "你会获得学习路径、今日练习、真实作品和下一次更好的用法。"],
    "太医令": ["整理健康变化、缺失信息和就医问题，提高专业咨询质量。", "你会获得变化摘要、行动清单和咨询准备；不会得到伪造诊断。"],
    "内务府总管": ["把日程、家庭、出行、采购和娱乐安排成真正能完成的生活方案。", "你会获得今日三件事、冲突处理和代办预览；外部动作由你授权。"],
    "门下侍中": ["在证据、权限或风险不合格时阻断任务，并说明如何补正再审。", "你会知道为什么不能继续、缺什么、满足什么条件才能安全恢复。"],
    "御史大夫": ["独立检查来源、权限、质量和执行冲突，不为原执行链背书。", "你会获得独立发现、证据缺口、质量结论和必要的阻断意见。"],
    "鸿胪寺卿": ["让外部模型、Skill、专家、数据和企业系统经过验证后安全进入朝堂。", "你不必逐个比较外部工具；鸿胪寺会呈上候选价值、风险、费用、权限和是否值得授权。"]
  };
  const HISTORICAL_PERSONAS = {
    "丞相": ["张居正", "把模糊目标变成结果契约，并统筹各部交付。"],
    "丞相 · 军机处": ["张居正", "把复杂任务立项，盯住阻塞、责任与验收。"],
    "吏部尚书": ["蹇义", "区分人类与智能体员工，为结果组成最小责任班底。"],
    "户部尚书": ["夏原吉", "守住现金与预算边界，形成财务、融资与投资判断。"],
    "礼部尚书": ["张璁", "统一品牌、商务礼仪、营销内容与对外表达。"],
    "兵部尚书": ["于谦", "制定客户、增长、渠道与谈判攻坚方案。"],
    "刑部尚书": ["魏象枢", "审查合同、合规、权限与不可逆风险。"],
    "工部尚书": ["宋应星", "把方案变成可测试、可回退、可验收的交付。"],
    "锦衣卫指挥使": ["沈炼", "核验事实、来源、反证与证据缺口。"],
    "钦天监监正": ["刘伯温", "把已核验信息变成条件预测与战略选择。"],
    "翰林学士": ["王阳明", "把知识变成练习、作品与可复用能力。"],
    "太医令": ["李时珍", "整理健康变化、用药与就医材料，形成咨询准备清单。"],
    "内务府总管": ["张居翰", "协调日程、家庭、出行与生活代办。"],
    "史官": ["司马迁", "保存判断、证据与真实结果，沉淀可复用经验。"],
    "门下侍中": ["魏征", "独立审议证据、权限与风险，不合格即退回。"],
    "御史大夫": ["海瑞", "独立检查质量、权限与执行冲突。"],
    "鸿胪寺卿": ["张骞", "评估外部模型、Skill、专家与系统的准入价值。"]
  };
  const BACKEND_INTEGRATION = {
    A01: {
      readiness: "后端已有读取能力",
      connection: "本原型尚未接入",
      owner: "大殿聚合适配层",
      endpoints: ["GET /api/court/dadian/pulse", "GET /api/court/dadian/feed", "GET /api/court/decision-judgment"],
      next: "先接只读今日判断、变化与来源，再接用户确认。"
    },
    A02: {
      readiness: "核心闭环已有接口",
      connection: "本原型尚未接入",
      owner: "上书房任务与圣旨适配层",
      endpoints: ["POST /api/v1/chancellor-consult", "POST /api/v1/chancellor-drafts", "POST /api/v1/decrees/chancellor", "GET /api/v1/decree-jobs/{id}", "POST /api/v1/decree-jobs/{id}/cancel"],
      next: "按咨询复述 → 用户确认 → 拟旨 → 版本确认 → 正式下旨接入；正式下旨仍保留独立授权门。"
    },
    A03: {
      readiness: "异步任务读取与取消接口已存在",
      connection: "本原型尚未接入",
      owner: "军机处项目适配层",
      endpoints: ["GET /api/v1/decree-jobs/{id}", "POST /api/v1/decree-jobs/{id}/cancel"],
      next: "军机处不重复创建任务，只读取上书房正式下旨产生的同一任务；没有真实事件时保持待命。"
    },
    A06: {
      readiness: "档案与复盘接口已存在",
      connection: "本原型尚未接入",
      owner: "史馆只读索引适配层",
      endpoints: ["GET /api/chaotang/archive", "GET /api/court/shiguan/stats", "POST /api/shiguan/archives/{archive_id}/retrospective"],
      next: "先接只读检索、成果与版本；删除和对外分享继续锁定。"
    },
    C01: {
      readiness: "只读情报与证据能力已存在",
      connection: "本原型尚未接入",
      owner: "锦衣卫证据适配层",
      endpoints: ["GET /api/v1/jinyiwei/summary", "GET /api/v1/jinyiwei/investigations", "GET /api/v1/jinyiwei/investigations/{investigation_id}"],
      next: "只读接入调查摘要、案卷、来源尝试、冲突与未知；不允许任意网址抓取，不把收盘价冒充实时行情。"
    },
    C02: {
      readiness: "情景与预测接口已存在",
      connection: "本原型尚未接入",
      owner: "钦天监条件推演适配层",
      endpoints: ["POST /api/v1/qintianjian/consult", "POST /api/v1/qintianjian/forecasts", "GET /api/v1/qintianjian/forecasts", "GET /api/v1/qintianjian/triggers/pending", "POST /api/v1/qintianjian/forecasts/{forecast_id}/reviews"],
      next: "只接受锦衣卫核验后的来源；显示条件与失效信号，不显示伪概率。"
    }
  };
  const SHARED_VIEW_CONTRACTS = Object.freeze({
    PageOverview: "一句判断、用户影响、建议行动与数据边界",
    TaskPassport: "同一任务跨上书房、军机处、六部与史馆流转的唯一身份",
    Deliverable: "可查看、可下载、可确认并可追溯的成果",
    OutcomeFeedback: "满意度、采用情况、问题原因与真实结果",
    UserGrowthLedger: "作品、能力证据、称号、等级与算筹变化依据"
  });
  const RAIL_FLOW_CONTRACT = Object.freeze({
    left: "OUTPUT_FLOW：朝堂已经替用户形成、正在办理或可以带走的成果",
    center: "PREVIEW_DECIDE：所有侧栏事项先在中央御屏预览，再决定商议、索取成果或进入专业页",
    right: "INTELLIGENCE_FLOW：为什么现在值得关注、发生了什么变化、需要用户裁决什么",
    freezeQuestions: ["用户会获得什么", "为什么现在点", "点击后发生什么"]
  });
  const DECREE_JOB_STATES = Object.freeze({
    QUEUED: "待承办", RUNNING: "办理中", RETRY_WAIT: "等待重试", RESULT_READY: "成果待验收",
    ARCHIVING: "正在入史馆", SUCCEEDED: "已完成", FAILED: "办理失败", CANCELLED: "已停止"
  });
  const DECREE_JOB_UI = Object.freeze({
    QUEUED: { label: "待承办", primary: "查看承办条件", consequence: "只查看主责、依赖与启动条件；可申请停止，不会伪造执行进度。", allowCancel: true, showResult: false, tone: "neutral" },
    RUNNING: { label: "办理中", primary: "查看当前进展", consequence: "只读取真实任务事件、当前阻塞与承办意见；可申请停止。", allowCancel: true, showResult: false, tone: "active" },
    RETRY_WAIT: { label: "等待重试", primary: "查看重试原因", consequence: "查看失败原因、下次重试条件和停止入口；不会自动提前重试。", allowCancel: true, showResult: false, tone: "warning" },
    RESULT_READY: { label: "成果待验收", primary: "验收当前成果", consequence: "打开同一任务的成果预览；确认以前不会归档或对外发送。", allowCancel: false, showResult: true, tone: "review" },
    ARCHIVING: { label: "正在入史馆", primary: "查看入馆进度", consequence: "只查看归档事件、版本和证据状态；不重复归档。", allowCancel: false, showResult: false, tone: "active" },
    SUCCEEDED: { label: "已完成", primary: "查看已归档成果", consequence: "打开已完成任务的成果与史馆记录；不会再次执行。", allowCancel: false, showResult: true, tone: "success" },
    FAILED: { label: "办理失败", primary: "查看失败原因", consequence: "查看错误、已完成部分和重办建议；不会自动重启任务。", allowCancel: false, showResult: false, tone: "danger" },
    CANCELLED: { label: "已停止", primary: "查看停止记录", consequence: "查看停止时间、原因和保留成果；不会恢复或重新执行。", allowCancel: false, showResult: false, tone: "muted" }
  });
  const PAGE_PROFILES = {
    A01: ["每天替你汇总六域变化，只留下今天最值得决定的一件事。", "你会获得今日信息、丞相建议、唯一行动和可继续商议的完整上下文。", "看看朝堂今天为何只建议这一件事 →"],
    A02: ["把复杂想法说清楚、比较三策，再形成可确认的奏请。", "你会获得准确的问题定义、三种可比较方案和执行前的授权预览。", "看一次从一句话到三策的完整商议 →"],
    A04: ["根据用户想要的结果，找到唯一主责部门和最小协作部门。", "你会获得承办建议、推荐理由、能力边界和预期成果。", "说一个结果，看朝堂如何分派 →"],
    A05: ["只说想带走的成果，丞相自动匹配最合适的专业团队和办理路径。", "你会获得主责Agent、成果格式、所需材料、权限边界与真实可用状态。", "说一个成果，看丞相如何安排 →"],
    C06: ["为同一个结果组成最小充分智能体队伍，并保持一位主责。", "你会获得参与者、职责、依赖、权限和算筹影响。", "看一个复杂任务如何组建最小编队 →"],
    D03: ["把跨部门分歧压缩成一个用户可以裁决的核心取舍。", "你会获得共同事实、真实分歧、方案后果和唯一裁决点。", "看朝堂如何处理真正的意见冲突 →"],
    D04: ["把判断、行动、证据和附件收成可查看、下载和反馈的成果包。", "你会获得一句结论、可带走产物、下一步和改进入口。", "查看一份标准成果包包含什么 →"],
    D05: ["用专业模式查看能力契约、依赖、成本和成熟状态。", "你会获得可调用能力目录、真实状态、输入输出和权限边界。", "查看能力如何从 DEMO 走向 LIVE →"],
    D06: ["把默认智能体、记忆、通知、隐私和算筹边界配置成个人朝堂。", "你会获得可预览、可撤销、可恢复默认的个人方案。", "看看个人朝堂可以安全记住什么 →"],
    E01: ["把你的事业目标变成由AI员工军团持续运转的一人公司。", "你会获得当前唯一瓶颈、最小执行编队和一张OPC经营作战图。", "说出事业目标，看丞相如何组建一人公司 →"]
  };
  const P = (id, group, title, scene, data) => ({
    id, group, title,
    scene: `assets/scenes-web/${scene.replace(/\.png$/, "-1600.webp")}`,
    sceneSmall: `assets/scenes-web/${scene.replace(/\.png$/, "-960.webp")}`,
    portrait: data.portrait || `assets/portraits/${scene.replace(/\.png$/, ".webp")}`,
    portraitPosition: data.portraitPosition || "50% 66%",
    level: data.level || "主页面",
    parentPage: data.parentPage || null,
    childPages: data.childPages || [],
    kicker: data.kicker || `${title} · ${data.level || "主页面"}`,
    subtitle: data.subtitle,
    agent: data.agent,
    personaName: data.personaName || HISTORICAL_PERSONAS[data.agent]?.[0] || data.agent,
    personaIntro: data.personaIntro || HISTORICAL_PERSONAS[data.agent]?.[1] || ROLE_PROFILES[data.agent]?.[0] || data.subtitle,
    portraitArt: data.portraitArt || `电影级写实东方人物肖像，${data.agent}，历史人物原型${data.personaName || HISTORICAL_PERSONAS[data.agent]?.[0] || data.agent}，真实皮肤与布料，正面三分之二身，人物清晰，部门环境虚化，乌木金线与克制朱砂，禁止动画感、游戏感、文字和UI`,
    roleDefinition: data.roleDefinition || PAGE_PROFILES[id]?.[0] || ROLE_PROFILES[data.agent]?.[0] || data.subtitle,
    userValue: data.userValue || PAGE_PROFILES[id]?.[1] || ROLE_PROFILES[data.agent]?.[1] || data.outcome,
    roleHook: data.roleHook || PAGE_PROFILES[id]?.[2] || "看它怎样替你做完一件事 →",
    entryAction: data.entryAction || `查看${data.agent}给我的第一步`,
    entryPromise: data.entryPromise || `完成后你将得到：${data.outcome || `一份围绕“${data.action}”的可执行建议`}`,
    phase: data.phase || "发现",
    outcome: data.outcome || `一份围绕“${data.action}”的可执行建议`,
    reason: data.reason || data.impact,
    verdict: data.verdict,
    situation: data.situation,
    impact: data.impact,
    action: data.action,
    canDo: data.canDo,
    why: data.why || "演示材料，尚未接入真实来源；正式版将显示来源、更新时间、缺口与状态。",
    primary: data.primary,
    consequence: data.consequence,
    secondary: data.secondary || ["查看依据", "补充材料", "交丞相统筹"],
    leftTitle: data.leftTitle,
    leftLabel: data.leftLabel || "当前材料",
    leftItems: data.leftItems,
    rightTitle: data.rightTitle,
    rightAgent: data.rightAgent || data.agent,
    rightAdvice: data.rightAdvice || data.verdict,
    rightSummary: data.rightSummary,
    rightTiming: data.rightTiming || "在进入下一阶段前完成",
    rightLabel: data.rightLabel || "待你处理",
    rightItems: data.rightItems,
    swarmOpinions: data.swarmOpinions || [],
    benefits: data.benefits || [I("你会获得核心判断", data.verdict, "可查看", "断"), I("你会得到可带走结果", data.outcome || `一份围绕“${data.action}”的可执行建议`, "待形成", "果"), I("你会知道下一步", data.action, "现在做", "行")],
    watch: data.watch || data.rightItems,
    abilities: data.abilities || data.secondary || ["查看依据", "补充材料", "交丞相统筹"],
    growth: data.growth || `学会先说清想要的结果，再让${data.agent}解释判断、选择与边界`,
    dailyHook: {
      morning: `今天先看清“${data.verdict}”，再决定是否行动。`,
      evening: `回看今天围绕“${data.action}”形成了什么真实结果。`,
      meaningfulChange: data.situation,
      resumeLabel: `继续“${data.action}”`,
      ...(data.dailyHook || {})
    },
    growthContract: {
      domain: data.growthDomain || group,
      artifact: data.outcome || `一份围绕“${data.action}”的可执行建议`,
      method: data.growth || `学会先说清结果，再判断下一步`,
      evidence: `任务护照、用户确认与可下载成果共同构成证据`,
      nextPractice: `下一次先说明目标、限制和停止条件`,
      ...(data.growthContract || {})
    },
    pdcaContract: {
      plan: data.action,
      do: `由${data.agent}在确认后组织最小必要行动`,
      check: `用成果、来源与实际结果验证判断`,
      act: `根据反馈保留有效方法，并只改进下一项关键能力`,
      ...(data.pdcaContract || {})
    },
    proofTitle: data.proofTitle || "尚未形成可验证的进步证据",
    proofDetail: data.proofDetail || "完成真实任务、作品或测评后，才显示你具体提升了什么；不会用阅读时长或点击次数冒充能力。",
    benchmarkState: data.benchmarkState || "INSUFFICIENT_EVIDENCE",
    benchmark: {
      cohort: "尚未定义对标人群",
      sample: "尚无有效样本",
      rubric: "尚未冻结任务与评分标准",
      artifact: "尚无可核验成果",
      measuredAt: "尚未测评",
      uncertainty: "证据不足，暂不排名",
      ...(data.benchmark || {})
    },
    sourceState: data.sourceState || "DEMO",
    backendIntegration: data.backendIntegration || BACKEND_INTEGRATION[id] || {
      readiness: "页面合同已规划",
      connection: "本原型尚未接入",
      owner: "待指定适配层",
      endpoints: [],
      next: "先确认真实事实源与接口契约，再接只读数据。"
    },
    freshness: data.freshness || "NOT_CONNECTED",
    evidenceRefs: data.evidenceRefs || [],
    capabilityState: data.capabilityState || "DEMO",
    sideEffect: data.sideEffect || "NONE",
    taskPassportPolicy: data.taskPassportPolicy || "INHERIT_OR_CREATE",
    reducedMotionFallback: data.reducedMotionFallback || "STATIC_SCENE_WITH_CSS_FALLBACK",
    states: {
      empty: "当前没有可展示的数据；你可以补充目标或材料。",
      loading: "正在读取已授权信息；尚未形成结论。",
      failure: "本次读取失败；不会把失败伪装成空白或成功。",
      insufficient: "材料不足；先补最多两项关键未知。",
      permission: "权限不足；查看所需权限并由你决定是否授权。",
      stale: "数据可能过期；更新并重新核验后再用于判断。",
      ...(data.states || {})
    },
    nextPrompt: data.nextPrompt || `我想得到“${data.outcome || data.action}”，请先告诉我你如何理解，并给出推荐选择。`,
    exampleCase: {
      userSays: data.exampleCase?.userSays || `我想处理“${data.action}”，请先告诉我还缺什么。`,
      insight: data.exampleCase?.insight || data.verdict,
      process: data.exampleCase?.process || `先由${data.agent}复述理解，再给出一个推荐选择。`,
      artifact: data.exampleCase?.artifact || data.outcome || `一份围绕“${data.action}”的可执行建议`,
      starter: data.exampleCase?.starter || data.nextPrompt || `我想得到“${data.outcome || data.action}”，请先复述你对目标和边界的理解。`
    },
    newsTitle: data.newsTitle || "尚未接入真实信息源",
    newsDetail: data.newsDetail || "正式版只展示与你当前目标有关、可追溯的信息。",
    sealAction: data.sealAction || `查看${data.agent}完整建议`,
    contexts: data.contexts || [title, "演示材料"],
    hint: data.hint || "当前操作只更新本地原型状态，不会触发真实外部执行。"
    ,railModel: data.railModel || { left: "OUTPUT_FLOW", center: "PREVIEW_DECIDE", right: "INTELLIGENCE_FLOW" }
    ,railContract: data.railContract || {
      userGets: data.outcome || `一份围绕“${data.action}”的可执行建议`,
      whyNow: data.impact || data.situation,
      onClick: "先在中央御屏预览价值、影响与按钮后果；不直接跳转，不触发现实操作。"
    }
    ,fiveDimensions: {
      functionButtons: data.functionButtons || [data.primary, ...(data.abilities || data.secondary || ["查看依据", "补充材料", "交丞相统筹"]).slice(0, 3).map(item => typeof item === "string" ? item : item.label)],
      contentDisplay: data.contentDisplay || [data.verdict, data.impact, data.outcome || data.action],
      interactionLogic: data.interactionLogic || `唯一主动作：${data.primary}；后果：${data.consequence}`,
      artDirection: data.artDirection || `写实东方仙宫；${title}专属场景；${data.agent}拟人化主责；业务文字由真实前端渲染`,
      systemFit: data.systemFit || `遵循同一任务护照、三级渐进披露、演示数据边界与${data.level || "主页面"}合同`
    }
  });

  window.CHAOTANG_SHARED_VIEW_CONTRACTS = SHARED_VIEW_CONTRACTS;
  window.CHAOTANG_RAIL_FLOW_CONTRACT = RAIL_FLOW_CONTRACT;
  window.CHAOTANG_DECREE_JOB_STATES = DECREE_JOB_STATES;
  window.CHAOTANG_DECREE_JOB_UI = DECREE_JOB_UI;
  window.CHAOTANG_PAGES = [
    P("A01", "核心中枢", "大殿 · 今日总览", "dadian-final-v2.png", {
      subtitle: "朝堂替你看六域，今天只呈一件最值得决定的事。", agent: "丞相", phase: "发现",
      outcome: "现金分析与 Excel；或先准备调查、产品改进需求",
      verdict: "先选你想带走的成果，再交给朝堂办理。", situation: "六域信息已汇总，真实个人数据尚未接入", impact: "先看影响，再决定是否深入", action: "听丞相呈报今日一件事",
      canDo: "丞相可汇总事业、财富、学习、生活、健康与娱乐信号，并带着全部上下文进入上书房。",
      primary: "选择成果，开始办理", consequence: "在本页御屏选择成果案例，查看所需资料和可用状态；不会自动下旨或调用模型。",
      secondary: ["打开今日朝报", "查看这条判断的依据", "换一个关注领域"],
      roleHook: "看示范：20人公司先让AI接管哪里 →", entryAction: "请丞相告诉我今天先做什么", entryPromise: "你会得到：一条明确建议、一张今日行动卡，以及继续办理的完整上下文。",
      benefits: [I("今天发生了什么", "六域变化已降噪，只留下最影响你的一件事", "先看", "讯"), I("丞相建议怎么选", "先验证一个低风险、可验收的AI接管机会", "建议", "断"), I("最终能带走什么", "一张今日行动卡，可继续商议或交军机处", "成果", "果")],
      watch: [I("昨天的事推进了吗", "未完任务会沿用同一任务护照继续", "续办", "续"), I("现在要我确认什么", "首屏最多只出现一个需要你决定的事项", "一项", "裁"), I("这条判断何时失效", "正式版随依据、条件变化重新判断", "可追", "界")],
      exampleCase: { userSays: "我经营一家20人的公司，不知道AI应该先接管哪里。", insight: "不要先买工具；先找重复高、风险低、容易验收的流程。", process: "比较客服、销售跟进、报表与内部知识，先用两周验证销售跟进。", artifact: "《AI接管机会清单＋两周行动卡》", starter: "我想让AI先接管一项工作。我的团队或场景是【请填写】，最想改善的是【请填写】，不能接受的风险是【请填写】。请先复述目标，再推荐最值得验证的一项。" },
      abilities: [{ label: "早朝三分钟", open: "morningBrief" }, { label: "六域成长地图", open: "growthMap" }, { label: "晚间回奏", open: "eveningReport" }],
      dailyHook: { morning: "早朝只呈一件与你最相关的变化、一个建议和一个行动。", evening: "晚间只回奏今日已形成的成果、阻塞与明日唯一建议。", meaningfulChange: "六域信号已汇总，但真实数据源尚未接入；当前仅展示演示结构。", resumeLabel: "继续上次未完之事" },
      growthContract: { domain: "人生六域", artifact: "一份今日唯一行动与可带走的决策摘要", method: "学会用影响而不是热度选择今天的唯一主攻", evidence: "御断、用户确认、任务护照与最终成果", nextPractice: "明天先检验今天的判断是否带来真实结果" },
      pdcaContract: { plan: "确认今天唯一主攻", do: "带着同一任务护照进入上书房", check: "在成果包与晚间回奏中验证", act: "把真实结果写入史馆并调整明日御断" },
      personaIntro: "替您汇总六域，只呈今天最值得决定的一件事。",
      leftTitle: "为你办理", leftLabel: "建议、续办、成果", leftItems: [I("丞相今日建议", "说出目标后，只呈一项明确建议、代价和今日行动卡", "现在获取", "断"), I("未完任务续办", "沿用同一任务护照，从上次真实进度继续，不让你重新解释", "继续办理", "续"), I("成果与成长证据", "行动卡、报告、作品和真实进步证据集中呈送", "查看成果", "果")],
      rightTitle: "天下变化与待你裁决", rightSummary: "右侧只接收会改变当前目标的信息、未来信号和需要你确认的事项。", rightItems: [I("锦衣卫重要情报", "只呈核验通过且可能影响当前目标的变化", "看对我的影响", "讯"), I("钦天监未来信号", "用条件、触发信号和失效边界说明未来可能怎样", "查看应对策略", "势"), I("军机处待你裁决", "真实项目只呈一个最影响结果的待确认事项", "现在裁决", "裁")],
      sealAction: "听丞相呈报今日一件事"
    }),
    P("A02", "核心中枢", "上书房 · 商议", "shangshufang-final-v3.png", {
      subtitle: "丞相统筹最佳执行，钦天监研判大势；先把问题说清楚，再形成三策与圣旨。", agent: "丞相", phase: "理解确认", portrait: "assets/portraits/shangshufang-final-v2.webp",
      roleDefinition: "丞相是复杂任务的总负责人：先复述您的真实意图，再调阅各部奏折、组织会商并统筹执行到可验收结果。",
      userValue: "您只需面对丞相说出想要的结果；各部专业意见、证据、预测、方案和执行回奏都在同一议题中汇总，不必来回转述。",
      outcome: "一份准确的问题定义和三种可比较方案",
      verdict: "你真正需要的不是更多建议，而是一个可确认的问题定义。", situation: "目标、限制和担忧仍混在一起", impact: "过早出方案会解决错问题", action: "先确认丞相的复述",
      canDo: "丞相可协调仙狐采集、锦衣卫核验、钦天监推演和六部承办；用户也可随时进入专业部门。",
      primary: "确认理解，查看三策", consequence: "确认后才显示三种可比较方案；选策后才能形成拟旨。切换议题会立即使旧确认、旧方案和旧授权失效。",
      secondary: ["拟旨", "驳回", "补证"],
      roleHook: "看示范：一句模糊想法怎样变成三策 →", entryAction: "开始一次丞相商议", entryPromise: "你会得到：一张问题定义卡、三种可比较方案和执行前奏请。",
      benefits: [I("六部会商奏折", "吏、户、礼、兵、刑、工六部意见按同一议题汇总", "调阅", "奏"), I("锦衣卫补证回奏", "核验关键事实、反证与来源", "调阅", "证"), I("钦天监战略回奏", "大势、条件情景、触发信号与失效条件", "调阅", "势"), I("军机处项目回奏", "阶段、唯一阻塞、承办责任与可验收成果", "调阅", "军"), I("专署机构回奏", "翰林院、太医院、内务府与鸿胪寺的专业意见", "调阅", "署"), I("史馆复盘回奏", "过去判断、真实结果与可复用经验", "调阅", "史")],
      watch: [I("全球与政策大势", "只呈会改变当前议题的重要变化", "研判", "势"), I("行业与竞争格局", "机会窗口、反向信号与判断失效条件", "研判", "业"), I("技术与 AI 能力窗口", "模型、Agent 与执行器的成熟度变化", "研判", "技")],
      exampleCase: { userSays: "我想用AI提高公司效率，但不希望裁员，也不能影响客户体验。", insight: "真正问题不是买什么工具，而是先释放哪类重复工作。", process: "丞相先复述目标，只追问工作痛点与停止条件；确认以后才给稳、衡、进三策。", artifact: "《问题定义卡＋三策对比表》", starter: "我想用AI改善【请填写的业务或团队】，希望得到【请填写的结果】，不能突破的边界是【请填写】，最担心的是【请填写】。请先复述你的理解。" },
      leftTitle: "丞相 · 总领复杂任务", leftLabel: "各部奏折与回奏", leftItems: [I("六部会商奏折", "吏、户、礼、兵、刑、工六部意见按同一议题汇总", "调阅", "奏"), I("锦衣卫补证回奏", "核验关键事实、反证与来源", "调阅", "证"), I("钦天监战略回奏", "大势、条件情景、触发信号与失效条件", "调阅", "势"), I("军机处项目回奏", "阶段、唯一阻塞、承办责任与可验收成果", "调阅", "军"), I("专署机构回奏", "翰林院、太医院、内务府与鸿胪寺的专业意见", "调阅", "署"), I("史馆复盘回奏", "过去判断、真实结果与可复用经验", "调阅", "史")],
      rightTitle: "钦天监 · 首席战略官", rightAgent: "钦天监监正", rightAdvice: "臣负责把锦衣卫核验过的信息变成大势判断、条件情景与战略选择；预测不是承诺，触发条件变化就应重新研判。", rightSummary: "钦天监负责看未来，丞相负责把选择变成结果。", rightItems: [I("全球与政策大势", "只呈会改变当前议题的重要变化", "研判", "势"), I("行业与竞争格局", "机会窗口、反向信号与判断失效条件", "研判", "业"), I("技术与 AI 能力窗口", "模型、Agent 与执行器的成熟度变化", "研判", "技")],
      contexts: ["当前议题", "3份材料", "旧三策已失效"], hint: "当前阶段只澄清目标；未确认理解前不能进入三策。",
      abilities: [{ label: "守势 · 先补关键证据", strategy: "稳策" }, { label: "衡势 · 边验证边推进", strategy: "衡策" }, { label: "进势 · 抢占当前窗口", strategy: "进策" }],
      newsTitle: "钦天监候您提出当前议题",
      newsDetail: "议题确认后，钦天监只呈与决策有关的大势、触发信号和失效条件。",
      dailyHook: { morning: "昨天未说清的议题会在这里继续，但必须由你明确恢复。", evening: "只记录确认过的问题定义、被选方案与仍未解决的未知。", meaningfulChange: "丞相等待你确认理解；未确认以前不生成三策。", resumeLabel: "继续上次商议" },
      growthContract: { domain: "决策", artifact: "一份经过用户确认的问题定义与三策比较", method: "学会先定义问题、限制和停止条件，再比较方案", evidence: "用户原话、理解版本、三策选择与奏请草案", nextPractice: "下一次把最担心的失败方式也告诉丞相" },
      pdcaContract: { plan: "确认真正要解决的问题", do: "选择一策并形成奏请草案", check: "军机处按阻塞和验收检查", act: "史馆比较方案与实际结果" }
    }),
    P("A03", "核心中枢", "军机处 · 项目", "junjichu-final-v2.png", {
      subtitle: "读取上书房正式下旨产生的任务，追踪多 Agent、蜂群和跨部门协同的真实进展。", agent: "丞相", phase: "推进", portraitPosition: "38% 49%",
      personaIntro: "丞相统筹，军机处承办；所有多 Agent 与蜂群任务只继承上书房正式下旨的唯一项目。",
      roleDefinition: "凡需两个以上 Agent、蜂群或跨部门协同，正式下旨后自动进入军机处；丞相是项目总责，军机处保存范围、事件、阻塞、会签和验收证据，不在此重复建项。",
      userValue: "你只看项目是否立项、现在到哪一步、谁在负责、蜂群有什么分歧、下一步需要你决定什么，不需要管理每个 Agent。",
      outcome: "《14天 AI 销售跟进验证》",
      verdict: "当前阶段：范围确认；唯一阻塞是客户记录的使用边界尚未确认。", situation: "目标：14天内验证AI能否减少50%的销售整理时间", impact: "阶段：范围确认 · 尚无真实执行事件", action: "阻塞：确认哪些客户记录允许用于测试",
      canDo: "军机处可协调负责人、里程碑、回奏和验收，但不会自行改变预算或授权外部发布。",
      primary: "去上书房正式下旨", consequence: "当前未连接真实任务队列；点击后回到上书房完成同一任务的拟旨与确认，不在军机处重复创建项目。",
      secondary: ["查看项目全貌", "查看蜂群会审"],
      roleHook: "看示范：14天验证项目怎样推进 →", entryAction: "查看当前项目最重要的一步", entryPromise: "你会得到：唯一阻塞、下一步负责人、时间线和可验收成果。",
      benefits: [{ title: "AI 销售跟进验证", meta: "演示项目 · 尚未连接任务队列", status: "演示", sigil: "验", progress: { complete: 1, total: 4, label: "1/4 · 范围确认" } }, { title: "官网内容生产系统", meta: "结果合同尚待确认", status: "候选", sigil: "网", progress: { complete: 0, total: 4, label: "0/4 · 未立项" } }, { title: "现金安全线自动回奏", meta: "缺少真实财务授权与数据", status: "待补证", sigil: "财", progress: { complete: 0, total: 4, label: "0/4 · 待补材料" } }, { title: "上书房正式下旨", meta: "先确认结果合同与拟旨，正式任务才自动进入军机处", status: "去上书房", sigil: "旨", page: "A02" }],
      watch: [I("项目价值是否仍成立", "目标明确，但尚无真实执行结果可证明收益", "丞相分析", "值"), I("为什么先处理这个阻塞", "数据边界不清会让后续验证失去合法性和可复用性", "优先", "阻"), I("现在是否需要您裁决", "只需确认允许进入测试的记录范围；其他事项继续待命", "一项", "裁")],
      swarmOpinions: [I("锦衣卫 · 证据会签", "先核验客户记录来源、授权与可用范围", "待补证", "证"), I("工部 · 技术会签", "可先用脱敏样本验证流程，不必接入生产系统", "可行", "工"), I("刑部 · 风险会签", "未经授权的客户数据不得进入测试", "阻断", "刑"), I("户部 · 成本会签", "先冻结最小验证预算，再决定是否扩容", "待确认", "户")],
      exampleCase: { userSays: "请在14天内验证AI销售跟进能否减少50%的人工整理时间。", insight: "当前唯一阻塞不是技术，而是哪些客户记录允许用于测试。", process: "确认数据边界，再依次完成材料准备、最小验证、员工试用与成果验收。", artifact: "《14天项目回奏＋验收清单》", starter: "请在【请填写时间】内验证【请填写方案】能否改善【请填写指标】。请丞相先帮我确认范围、数据边界和最小验收标准，再交军机处承办。" },
      leftTitle: "正式任务与进度", leftLabel: "上书房下旨后自动进入", leftItems: [{ title: "AI 销售跟进验证", meta: "演示项目 · 尚未连接任务队列", status: "演示", sigil: "验", progress: { complete: 1, total: 4, label: "1/4 · 范围确认" } }, { title: "官网内容生产系统", meta: "结果合同尚待确认", status: "候选", sigil: "网", progress: { complete: 0, total: 4, label: "0/4 · 未立项" } }, { title: "现金安全线自动回奏", meta: "缺少真实财务授权与数据", status: "待补证", sigil: "财", progress: { complete: 0, total: 4, label: "0/4 · 待补材料" } }, { title: "上书房正式下旨", meta: "先确认结果合同与拟旨，正式任务才自动进入军机处", status: "去上书房", sigil: "旨", page: "A02" }],
      rightTitle: "丞相 · 项目总责", rightAgent: "丞相（项目总责）", rightAdvice: "臣认为项目并非执行缓慢，而是数据边界尚未确认。先解决这一处，蜂群才能在同一范围内安全协同。", rightSummary: "不看虚假忙碌，只看真实事件、唯一阻塞与验收结果。", rightItems: [I("项目价值是否仍成立", "目标明确，但尚无真实执行结果可证明收益", "丞相分析", "值"), I("为什么先处理这个阻塞", "数据边界不清会让后续验证失去合法性和可复用性", "优先", "阻"), I("现在是否需要您裁决", "只需确认允许进入测试的记录范围；其他事项继续待命", "一项", "裁")],
      abilities: [{ label: "项目事件线", open: "progressBrief" }, { label: "蜂群会签记录", open: "swarmReview" }, { label: "验收标准", open: "result" }],
      newsTitle: "真实任务事件尚未接入",
      newsDetail: "进度条只随已验证事件变化；不会用动画、时间流逝或 Agent 数量伪造项目进展。",
      dailyHook: { morning: "只呈报今天唯一会影响交付的阻塞，不陈列虚假忙碌。", evening: "汇总今天发生的真实任务事件、未完成原因与明日唯一动作。", meaningfulChange: "当前只有一个范围边界需要确认；真实任务事件尚未接入。", resumeLabel: "继续上次项目" },
      growthContract: { domain: "事业", artifact: "一份包含阻塞处理、时间线和验收边界的项目回奏", method: "学会用事件、阻塞和验收判断项目，而不是看忙碌程度", evidence: "任务事件、责任人确认、里程碑与验收产物", nextPractice: "下一次立项时先冻结最小验收标准" },
      pdcaContract: { plan: "冻结范围与最小验收", do: "最小执行小队按事件推进", check: "只用真实产物和验收门判断完成", act: "复盘返工与阻塞，调整下一阶段计划" },
      sealAction: "展开军机项目舆图",
      jobStates: DECREE_JOB_STATES
    }),
    P("A04", "核心中枢", "六部各司 · 承办中枢", "liubu-hub-final-v2.png", {
      subtitle: "按你想要的结果找到唯一承办部门，不要求先理解六部。", agent: "丞相", phase: "路由",
      verdict: "先说想得到什么结果，朝堂再解释应该由谁负责。", situation: "任务跨越多个专业领域", impact: "多人主责会造成责任稀释", action: "确认一个主责部门",
      canDo: "丞相推荐唯一主责部门和最小协作部门，各部只形成专业分奏。",
      primary: "丞相 · 推荐唯一承办部门", consequence: "生成推荐理由、预期成果和能力边界；用户确认后才路由同一任务。",
      leftTitle: "待分派事项", leftItems: [I("业务目标", "结果描述尚可继续补充", "已收", "目"), I("材料范围", "3 项可用、1 项缺失", "混合", "料"), I("权限边界", "未允许外部动作", "安全", "权")],
      rightTitle: "承办建议", rightSummary: "主责唯一，协作最小，成果最终回到丞相。", rightItems: [I("推荐主责", "根据目标实时生成", "待生成", "主"), I("协作部门", "只有必要时加入", "未组", "协"), I("能力状态", "正式版读取 Registry", "DEMO", "态")]
    }),
    P("A05", "核心中枢", "专署 · 成果路由台", "capability-directory-final-v1.png", {
      subtitle: "不用选择Agent、Skill或模型，只说想带走的成果，丞相替你安排最短交付路线。", agent: "丞相", phase: "成果路由",
      outcome: "一条主责明确、可直接启动的成果交付路线",
      verdict: "不要选择能力，只选择你想带走的成果。", situation: "目标已经提出，但主责与办理路径尚未确认", impact: "由用户研究工具会增加学习成本，也容易选错执行方式", action: "让丞相匹配一位主责和最短成果路线",
      canDo: "丞相根据成果、材料、风险和权限，自动决定本司直办、上书房拟旨或军机处立项。",
      primary: "丞相 · 为我匹配成果路线", consequence: "只形成主责、交付物和办理路径建议；确认以前不调用能力、不扣算筹、不执行外部动作。",
      secondary: ["查看可交付成果", "查看办理边界", "看一个成果示例"],
      benefits: [I("分析与判断", "研究报告、证据清单、预测情景和决策建议", "可索取", "断"), I("方案与计划", "项目方案、预算、学习路径、营销或生活安排", "可索取", "策"), I("文件与成品", "表格、文案、图像视频、合同修改稿和成果包", "可索取", "果")],
      abilities: [{ label: "查看可交付成果", open: "capabilityHub" }, { label: "查看办理边界", open: "permissions" }, { label: "看一个成果示例", open: "example" }],
      leftTitle: "你想带走什么", leftItems: [I("一份判断", "帮我看清事实、影响与选择", "直办", "断"), I("一套方案", "给出步骤、取舍、边界和验收", "路由", "策"), I("一个成品", "生成可查看、修改和下载的成果", "交付", "果")],
      rightTitle: "丞相自动安排", rightSummary: "简单任务本司直办；跨部门请丞相拟旨；多智能体协同送军机处立项。", rightItems: [I("主责是谁", "始终只由一位主责官员面对用户", "自动匹配", "主"), I("怎样办理", "直办／拟旨／立项由风险与复杂度决定", "自动路由", "路"), I("何时确认", "算筹、权限和外部副作用发生前再请用户确认", "保持控制", "权")]
    }),
    P("A06", "核心中枢", "史馆 · 档案、知识与进化", "shiguan-final-v2.png", {
      subtitle: "按人物、项目、时间与成果快速查档，看清自己、智能体和知识怎样进化。", agent: "史官", phase: "查档复盘",
      verdict: "史馆不只是存文件，而是让每次判断、成果和经验都能被找到、验证与复用。", situation: "档案、知识与结果尚未接入真实索引", impact: "找不到过去的证据，就无法证明成长或改进下一次任务", action: "选择要查的人物、项目或成果",
      canDo: "追加记录事件、证据、结果、知识与版本；支持检索和复盘，但不覆盖旧版本。",
      primary: "史官 · 查找我的全部档案", consequence: "只查询已授权档案索引；不会修改、删除或对外共享历史记录。",
      secondary: ["查看进化时间线", "进入知识库", "打开数据册"],
      abilities: [{ label: "查找全部档案", surface: "archiveSearch" }, { label: "查看进化时间线", surface: "progress" }, { label: "知识库与数据册", surface: "materials" }],
      benefits: [I("全部档案", "按人物、部门、项目、时间、成果与版本检索", "可查找", "档"), I("进化了什么", "比较当时判断、执行、实际结果与能力变化", "可复盘", "进"), I("知识与数据", "把可复用经验沉淀为知识卡、数据册和方法版本", "可整理", "知")],
      watch: [I("待复盘成果", "有真实结果后才形成进化证据", "待接入", "复"), I("可复用经验", "经验证后才进入知识库，不把猜测当规则", "待验证", "用"), I("版本与来源", "旧版本只读，来源、时间和权限始终可追溯", "受保护", "证")],
      leftTitle: "档案检索入口", leftItems: [I("人物与Agent", "查看责任、贡献与能力版本", "可筛选", "人"), I("项目与任务", "查看卷轴、事件、材料与成果", "可筛选", "项"), I("知识与数据", "查看知识卡、数据册、来源与关系", "可筛选", "知")],
      rightTitle: "结果与进化", rightSummary: "只有真实结果才能推动用户、Agent、Skill和工作流升级。", rightItems: [I("进化时间线", "判断—执行—结果—改进", "待接入", "进"), I("知识库", "经过验证的经验与最佳方法", "待接入", "库"), I("档案安全", "版本只读、权限可审计", "固定", "证")]
    }),

    P("B01", "六部承办", "吏部 · 人类与智能体组织", "libu-personnel-final-v2.png", {
      subtitle: "人类员工与智能体员工分籍管理，任务时按责任、权限和能力临时合编。", agent: "吏部尚书", phase: "组阁",
      verdict: "这项任务需要一位人类负责人和三位 Agent，不需要扩大编制。", situation: "责任与能力仍未完全对齐", impact: "身份混淆会产生授权风险", action: "形成最小合编班底",
      canDo: "分别维护人籍、机籍、权限、绩效证据和能力缺口，再为任务临时合编。",
      primary: "吏部 · 形成最小合编班底", consequence: "生成责任与权限草案；不会自动邀请、雇佣、解聘或授权任何人。",
      secondary: ["查看人籍", "查看机籍", "补齐能力缺口"],
      leftTitle: "人籍与机籍", leftItems: [I("人类负责人", "真实员工 · 权限另审", "待定", "人"), I("Agent 主责", "数字身份 · 可撤销", "候选", "机"), I("能力缺口", "需要一项专业复核", "1项", "缺")],
      rightTitle: "合编与责任", rightSummary: "身份永久分开，任务责任临时合编。", rightItems: [I("责任图", "一事一主责", "草案", "责"), I("权限", "最小授权、随时撤销", "待审", "权"), I("人工审核", "仅作为说明门", "按需", "审")]
    }),
    P("B02", "六部承办", "户部 · 财务与专业投资", "hubu-finance-final-v2.png", {
      subtitle: "把预算、现金、估值、配置和风险放进同一张可裁决判断书。", agent: "户部尚书", phase: "财务判断",
      verdict: "先守住现金与风险边界，再讨论哪项资产值得增加配置。", situation: "预算与投资目标相互竞争", impact: "缺少账户和风险边界时不应交易", action: "形成财务与投资判断书",
      canDo: "补齐凭证、比较情景、研究标的和组合风险；账户接入与交易逐项授权。",
      primary: "户部 · 形成财务／投资判断书", consequence: "只生成研究和配置建议，不接入账户、不下单、不付款。",
      secondary: ["补充财务凭证", "进入专业投资", "比较三种情景"],
      leftTitle: "账册与资产", leftItems: [I("现金安全", "可支配边界待接真实账", "DEMO", "现"), I("预算", "三个项目争夺资源", "待决", "预"), I("投资材料", "标的与账户未授权", "缺失", "投")],
      rightTitle: "判断与风险", rightSummary: "研究门、判断门、账户门、交易门逐层解锁。", rightItems: [I("估值假设", "来源与更新时间待接", "待核", "估"), I("组合风险", "集中度与流动性", "待算", "险"), I("交易权限", "默认关闭", "锁定", "权")]
      ,benefits: [I("现金流安全线", "知道未来可用现金和需要预留的边界", "看详情", "现"), I("预算分配方案", "比较事业、生活与投资之间的资源取舍", "看方案", "预"), I("专业投资研究", "查看标的、估值、组合与风险；不代替交易确认", "进入", "投")]
      ,watch: [I("现金与预算冲突", "先确认必要支出，再讨论新增配置", "先处理", "安"), I("组合集中度", "正式接入后按真实持仓计算", "待接入", "险"), I("账户与交易权限", "默认关闭，逐项预览和授权", "安全", "权")]
      ,abilities: [{ label: "财富驾驶舱", page: "H01" }, { label: "投资与商业机会", page: "H02" }, { label: "财富风险护城河", page: "H03" }]
      ,newsTitle: "市场与标的信息尚未接入"
      ,newsDetail: "接入后只显示与你的目标、持仓和风险边界相关且可追溯的信息。"
      ,sealAction: "查看户部完整分析"
    }),
    P("B03", "六部承办", "礼部 · 品牌商务与对外表达", "libu-marketing-final-v2.png", {
      subtitle: "统一品牌形象、商务礼仪、对外书写、宣传资料和媒体成果。", agent: "礼部尚书", phase: "品牌与商务",
      verdict: "先统一对外主张与接待标准，再生成素材，才能让每次表达都积累信任。", situation: "品牌、商务与内容标准尚未形成同一体系", impact: "各说各话会削弱专业形象并增加返工", action: "先形成品牌与商务标准",
      canDo: "接收锦衣卫核验的品牌趋势与流行信号，形成品牌策略、商务接待、书写规范、宣传资料、图像视频和发布预览；不承担情报预测。",
      primary: "礼部 · 形成营销方案", consequence: "生成受众、主张、素材与渠道草案；不会自动发布或投放。",
      secondary: ["品牌与书写标准", "商务接待方案", "图像视频与发布预览"],
      leftTitle: "品牌与商务", leftItems: [I("品牌主张", "需要与业务目标统一", "待清", "牌"), I("商务礼仪", "接待、会议与往来标准", "待定", "礼"), I("趋势原料", "由锦衣卫核验后分发", "待接", "讯")],
      rightTitle: "成果与发布", rightSummary: "对外表达必须先统一标准，再生成，再审校，最后授权发布。", rightItems: [I("文案与资料", "书写模板和宣传包", "待生", "文"), I("图像与视频", "能力状态按 Registry", "DEMO", "影"), I("发布授权", "默认关闭", "锁定", "发")],
      benefits: [I("品牌形象更统一", "获得品牌主张、视觉与语言标准", "看标准", "牌"), I("商务表现更专业", "获得接待、会议、往来和材料清单", "看方案", "礼"), I("对外成果可直接使用", "获得文案、图像、视频与发布预览", "看成果", "宣")],
      watch: [I("最新品牌趋势", "只有锦衣卫核验后才进入礼部", "待接", "讯"), I("对外表达一致性", "检查每份材料是否符合品牌标准", "待检", "一"), I("发布与版权边界", "正式发布前逐项预览和授权", "安全", "权")],
      newsTitle: "品牌趋势与商务信息尚未接入",
      newsDetail: "接入后只展示与当前品牌、受众和商务计划有关的可追溯信号。"
    }),
    P("B04", "六部承办", "兵部 · 客户增长与销售攻坚", "bingbu-sales-final-v2.png", {
      subtitle: "用可信客户事实确定目标、渠道、报价和下一步成交动作。", agent: "兵部尚书", phase: "攻坚策划",
      verdict: "当前不缺线索，缺的是一个有证据支持的优先客户。", situation: "客户与渠道信号分散", impact: "同时追击会消耗团队窗口", action: "选择下一座目标城门",
      canDo: "调用锦衣卫核验客户事实、户部验证定价，并交军机处建立攻坚项目。",
      primary: "兵部 · 制定下一步攻坚", consequence: "形成客户、渠道和谈判动作草案；不会自动联系客户或发送报价。",
      leftTitle: "客户战场", leftItems: [I("目标客户", "3 个候选仍需排序", "候选", "客"), I("市场证据", "仙狐原料待锦衣卫核验", "待核", "证"), I("渠道", "两条路径可比较", "可选", "渠")],
      rightTitle: "攻坚与边界", rightSummary: "客户事实先核验，报价再由户部校验。", rightItems: [I("优先目标", "等待证据评分", "待定", "标"), I("报价边界", "尚未取得预算许可", "锁定", "价"), I("外部联系", "必须预览并授权", "关闭", "联")]
    }),
    P("B05", "六部承办", "刑部 · 合同合规与风险", "xingbu-legal-final-v2.png", {
      subtitle: "看清哪些条款不可接受、为什么，以及如何安全修改。", agent: "刑部尚书", phase: "风险审查",
      verdict: "当前存在一项不可逆义务，必须修改后再进入人工法审。", situation: "关键条款与授权边界冲突", impact: "直接签署可能产生长期责任", action: "形成可修改的审查意见",
      canDo: "列出风险、证据、义务、修改建议和人工复核条件，不提供无边界法律结论。",
      primary: "刑部 · 形成审查意见", consequence: "生成风险与修改草案；不会签署、发送或替代执业律师意见。",
      secondary: ["查看风险条款", "补充证据", "准备人工复核"],
      leftTitle: "合同与证据", leftItems: [I("合同版本", "本次只审查演示副本", "草案", "约"), I("证据附件", "2 项完整、1 项缺失", "缺口", "证"), I("授权范围", "无签署权限", "安全", "权")],
      rightTitle: "风险与审查门", rightSummary: "机器意见不等于法律定论。", rightItems: [I("高风险义务", "需要明确终止条件", "阻塞", "险"), I("修改建议", "形成对照稿后再看", "待生", "改"), I("人工法审", "适用时明确说明", "按需", "人")]
    }),
    P("B06", "六部承办", "工部 · 产品技术与交付", "gongbu-delivery-final-v2.png", {
      subtitle: "把方案变成可测试、可回退、可验收的真实成果。", agent: "工部尚书", phase: "交付设计",
      verdict: "先冻结最小验收标准，再投入完整交付。", situation: "范围大于当前验证能力", impact: "直接上线会失去回退点", action: "建立分阶段交付计划",
      canDo: "拆解设计、材料、供应、测试、质量门和验收；发布、部署与采购另行授权。",
      primary: "工部 · 形成交付计划", consequence: "生成里程碑、测试与回退草案；不会部署、采购或发布。",
      secondary: ["查看工程图", "补充测试证据", "检查发布门"],
      leftTitle: "方案与供应", leftItems: [I("交付范围", "核心与非核心待分", "待冻", "范"), I("材料/BOM", "演示结构，未接供应链", "DEMO", "料"), I("依赖", "两项外部能力待确认", "2项", "依")],
      rightTitle: "质量与验收", rightSummary: "没有测试证据就不会显示完成。", rightItems: [I("原型", "当前组件待验证", "进行中", "原"), I("质量门", "验收标准尚未冻结", "阻塞", "质"), I("发布权限", "默认关闭", "锁定", "发")]
    }),

    P("C01", "专署能力", "锦衣卫 · 全球情报与验真", "jinyiwei-final-v2.png", {
      subtitle: "收拢全球政治、经济、军事、科技与行业变化，再把原料变成可追溯事实。", agent: "锦衣卫指挥使", phase: "情报与核验",
      verdict: "最关键的事实尚未被第二个独立来源支持。", situation: "原料已采集但可信度未定", impact: "直接用于决策会放大误判", action: "核验一个关键事实",
      canDo: "仙狐在授权范围内采集；锦衣卫负责去重、聚类、核验、反证、标记鲜度并向钦天监与六部定向分发，不在本页替钦天监做预测。",
      primary: "查看今日重要情报", consequence: "只读取已有调查摘要与案卷；不会新建调查、抓取任意网址或访问未授权数据。",
      secondary: ["查看原始来源", "补充反证", "预览变化监控草案"],
      roleHook: "看示范：一条AI传闻怎样查清真假 →", entryAction: "查看今天最值得核验的信息", entryPromise: "你会得到：已确认事实、相反证据、信息缺口和部门影响图。",
      abilities: [{ label: "全球信息雷达", open: "intelRadar" }, { label: "来源冲突对照", open: "sourceConflict" }, { label: "影响分发图", open: "impactRouting" }],
      leftTitle: "锦衣卫只查与你有关的事", leftItems: [I("你真正想弄清什么", "先限定一个会影响你目标的关键主张", "不跑题", "愿"), I("你最终会得到什么", "事实、反证、缺口和影响去向", "可带走", "果"), I("这和你有什么关系", "明确影响哪个目标、项目或部门", "说人话", "联")],
      rightTitle: "情报进入朝堂前先过三关", rightSummary: "信息再热，也不能跳过采集代价、隐私底线和证据门。", rightItems: [I("核验要付出什么", "时间、来源成本与仍可能无法证实", "先说明", "价"), I("什么绝对不能碰", "不越权采集，不泄露隐私，不把传闻当事实", "固定底线", "界"), I("凭什么相信", "独立来源、反证、新鲜度与未知同时展示", "可追溯", "证")],
      benefits: [I("哪些事实已经确认", "把事实、推断、传闻和反证分开", "看结论", "真"), I("这与我有什么关系", "标出会影响哪个目标、项目和部门", "看影响", "联"), I("最终能带走什么", "情报核验卡、来源对照与影响分发图", "成果", "果")],
      watch: [I("来源是不是最新", "真实接入后显示来源时间与过期状态", "待接", "时"), I("还有什么没证实", "未通过第二来源支持的主张保持未证实", "受控", "疑"), I("是否足以触发预警", "只在真实影响阈值满足时提醒", "不骚扰", "警")],
      exampleCase: { userSays: "有人说新的AI模型会让传统客服系统失去价值，这是真的吗？", insight: "不能把新闻标题当事实；要把官方事实、媒体推断、用户评论和反证分开。", process: "限定主张，寻找第二独立来源与相反信号，标记新鲜度，再说明影响哪些部门。", artifact: "《情报核验卡＋部门影响图》", starter: "请核验这项说法：【请粘贴主张或链接】。先限定主张，列出已确认事实、反证、来源新鲜度和仍未确认的部分。" },
      newsTitle: "全球真实信息源尚未接入",
      newsDetail: "当前只展示情报产品结构；不生成虚假新闻、更新时间或紧急预警。",
      dailyHook: { morning: "只呈报与当前目标有关、经过核验且足以改变判断的信息。", evening: "汇总今天新证实、被推翻、仍有冲突的关键主张。", meaningfulChange: "一个关键主张缺少第二独立来源；当前不能升级为事实。", resumeLabel: "继续核验上次情报" },
      growthContract: { domain: "信息素养", artifact: "一份带来源、反证、鲜度、缺口和影响对象的情报卡", method: "学会区分原料、主张、证据与经过核验的事实", evidence: "来源快照、冲突对照、核验记录与分发去向", nextPractice: "下一次先问：这条信息可能被什么证据推翻" },
      pdcaContract: { plan: "界定要核验的关键主张", do: "在授权范围内补充独立来源与反证", check: "核对来源冲突、鲜度和证据缺口", act: "只把通过门槛的信息分发给钦天监与相关部门" }
    }),
    P("C02", "专署能力", "钦天监 · 条件推演", "qintianjian-final-v2.png", {
      subtitle: "汇总经过核验的内外部信息与数据，进行条件预测和战略分析。", agent: "钦天监监正", phase: "战略推演",
      outcome: "一份包含趋势、三种情景、触发信号和战略选择的分析",
      verdict: "结果取决于两项关键条件；当前应保留战略弹性，而不是押注单一路径。", situation: "内外部信息显示关键条件正在变化", impact: "忽略触发与失效会让战略在环境改变后仍继续执行", action: "形成三种情景与转向条件",
      canDo: "汇总内部经营、外部市场、公开情报和历史结果；形成趋势、上行/基线/受阻情景、战略选项、触发信号、风险窗口与失效条件。",
      primary: "钦天监 · 形成战略推演", consequence: "创建带版本的条件分析，不生成无依据概率或成功保证。",
      secondary: ["汇总战略信息", "比较三种情景", "设置条件预警"],
      roleHook: "看示范：未来90天该不该扩大AI投入 →", entryAction: "查看今天最重要的战略判断", entryPromise: "你会得到：三种条件情景、一条推荐路线和明确转向信号。",
      abilities: [{ label: "三景推演", open: "scenarioRoom" }, { label: "触发信号罗盘", open: "triggerCompass" }, { label: "预测与实际", open: "forecastReview" }],
      leftTitle: "钦天监先理解你为何要预测", leftItems: [I("你真正想决定什么", "预测不是看热闹，而是帮助一个具体选择", "不跑题", "愿"), I("你最终会得到什么", "三种情景、一条推荐路线和转向信号", "可行动", "果"), I("环境变了怎么办", "触发信号出现就更新，不让旧结论绑住你", "可纠正", "转")],
      rightTitle: "战略建议前先说清", rightSummary: "收益、代价、底线和证据同时出现，避免用伪精确制造信心。", rightItems: [I("选择这条路会失去什么", "时间窗口、资源占用和其他机会", "先比较", "价"), I("什么风险不能承担", "由任务护照继承用户底线与停止条件", "共同遵守", "界"), I("判断依据可靠吗", "锦衣卫核验、关键未知与失效条件均可查看", "可追溯", "证")],
      benefits: [I("未来可能怎么走", "只看上行、基线和受阻三种条件情景", "看三景", "势"), I("现在建议怎么选", "给出一条推荐路线与保留弹性的理由", "看建议", "策"), I("最终能带走什么", "三景战略卡与触发信号罗盘", "成果", "果")],
      watch: [I("还缺哪两个条件", "材料不足时不伪造概率和保证", "最多2项", "问"), I("判断依据可靠吗", "外部信号必须先经锦衣卫核验", "待核", "证"), I("什么时候改变路线", "每条战略都写明触发与失效条件", "可追", "转")],
      exampleCase: { userSays: "未来90天，我们应该扩大AI产品投入吗？", insight: "不要猜一个成功概率；先定义上行、基线、受阻三种条件。", process: "核验条件，比较三景，定义转进与转守信号，并写明本判断何时失效。", artifact: "《三景战略卡＋触发信号罗盘》", starter: "请推演未来【请填写时间范围】，我们是否应该【请填写决策】。不要给无依据概率，请列出三种条件情景、推荐路线、转向信号和失效条件。" },
      newsTitle: "战略信息源尚未接入",
      newsDetail: "正式版汇总内部数据、公开信息和历史结果，每条信号显示来源、影响与失效。",
      growth: "学会用条件、信号和失效判断未来，而不是追求一个看似精确的预测数字",
      dailyHook: { morning: "只呈报足以改变战略选择的条件变化与触发信号。", evening: "比较今天的条件判断与实际变化，不用结果倒推伪造准确率。", meaningfulChange: "两项关键条件仍未确定；当前只能做条件情景，不能给概率保证。", resumeLabel: "继续上次推演" },
      growthContract: { domain: "战略", artifact: "一份三情景、触发信号、失效条件和转向动作的战略卡", method: "学会把预测写成条件与行动，而不是一个伪精确数字", evidence: "核验信息、假设版本、触发记录和史馆实际结果", nextPractice: "下一次先定义什么信号出现时必须改变路线" },
      pdcaContract: { plan: "冻结关键条件与三种情景", do: "按当前情景保留可撤销行动", check: "监测触发、反证与失效条件", act: "触发后生成新版本并由史馆比较实际结果" },
      sealAction: "查看钦天监战略判断"
    }),
    P("C03", "专署能力", "翰林院 · 学习与Skill孵化", "hanlinyuan-final-v2.png", {
      subtitle: "既帮助用户快速掌握真实能力，也替朝堂发现、评测和孵化更好的 Skills 与 Agents。", agent: "翰林学士", phase: "双轮进化",
      verdict: "今天先完成一项与真实目标有关的练习；新能力先进入评测，不直接安装。", situation: "用户学习目标与朝堂能力缺口需要共同整理", impact: "只收藏资料或追逐新工具都不会形成真实进化", action: "确认今天最值得获得的一项能力",
      canDo: "锦衣卫提供前沿资料与候选，翰林院负责课程和能力评测，工部沙箱测试，御史台复核，吏部登记任用，丞相提交升级奏请。",
      primary: "翰林院 · 制定今日进化计划", consequence: "只形成一课、一练和候选评测计划；不会自动安装 Skill、Agent 或插件。",
      secondary: ["用户学习路径", "Skill与Agent选贤", "查看朝堂进化奏请"],
      abilities: [{ label: "今日进化", surface: "brief" }, { label: "状元榜与能力科举", surface: "progress" }, { label: "朝堂升级奏请", surface: "result" }],
      leftTitle: "用户与系统", leftItems: [I("用户目标", "与当前真实任务相连", "待确", "学"), I("前沿资料", "等待锦衣卫核验与分发", "待接", "卷"), I("能力缺口", "来自史馆结果与吏部登记", "待接", "能")],
      rightTitle: "推荐与边界", rightSummary: "学习用作品证明；系统升级用真实任务评测证明。", rightItems: [I("今日一课", "一个本质、一个示例、一个练习", "待生", "课"), I("候选能力", "必须经过来源、沙箱和复核", "待评", "选"), I("安装与启用", "需要用户明确批准", "锁定", "权")],
      benefits: [I("今日学习任务", "只学一项最支持当前目标的能力，并交付一个作品", "开始", "课"), I("状元榜", "按真实任务表现筛选优秀插件、Skills、Agents和工作流", "看榜", "榜"), I("能力升级奏请", "说明升级价值、评测证据、权限与回退方法", "看奏请", "升")],
      watch: [I("插件与Skill候选", "来源、版本、许可和真实任务收益必须可核", "待评", "技"), I("Agent与工作流候选", "先走影子模式，不因热度直接启用", "待试", "贤"), I("是否真正学会", "不使用阅读时长伪造掌握，只看作品和迁移能力", "作品", "作")],
      newsTitle: "前沿学习资料与能力候选尚未接入",
      newsDetail: "正式版只呈报与用户计划或朝堂能力缺口有关、可追溯且经过筛选的新内容。",
      growth: "学会把一个真实目标拆成知识、练习、作品和可复用能力"
    }),
    P("C04", "专署能力", "太医院 · 健康记录与就医准备", "taiyiyuan-final-v2.png", {
      subtitle: "整理健康变化、缺失信息和就医问题，不替代医生诊断。", agent: "太医令", phase: "健康整理",
      verdict: "先把最近的变化和红旗信号整理清楚，再决定下一步。", situation: "记录分散且有一项信息缺失", impact: "模糊描述会降低咨询效率", action: "生成就医准备单",
      canDo: "整理趋势、症状、作息、运动、问题和资料摘要；隐私与外部联系单独授权。",
      primary: "太医院 · 整理就医准备单", consequence: "只生成整理摘要和问题清单，不诊断、开药或自动联系机构。",
      secondary: ["添加健康记录", "查看隐私范围", "导出咨询摘要"],
      leftTitle: "健康档案", leftItems: [I("近期趋势", "演示记录，非医疗数据", "DEMO", "势"), I("已知症状", "需要用户确认描述", "待确", "症"), I("隐私权限", "仅本次商议可见", "受限", "私")],
      rightTitle: "下一步准备", rightSummary: "红旗信号只触发就医建议，不给出诊断。", rightItems: [I("缺失信息", "持续时间与诱因", "2项", "缺"), I("咨询问题", "等待整理成清单", "待生", "问"), I("专业就医", "由用户自行决定", "人工", "医")]
    }),
    P("C05", "专署能力", "内务府 · 生活安排与代办", "neiwufu-final-v2.png", {
      subtitle: "把生活事务安排好，但所有预订、采购和付款都保留给用户确认。", agent: "内务府总管", phase: "生活安排",
      verdict: "今天只安排三件事，先消除时间冲突，再考虑代办。", situation: "家庭、出行与工作同时占用时间", impact: "过度安排会让计划无法完成", action: "生成一份可执行今日安排",
      canDo: "整理日程、家庭、旅行、采购与娱乐；外部动作先预览后授权。",
      primary: "内务府 · 生成今日生活安排", consequence: "只生成安排草案，不加入日历、不预订、不采购、不付款。",
      secondary: ["调整时间边界", "查看代办清单", "预览预算影响"],
      leftTitle: "生活事项", leftItems: [I("时间冲突", "两件事发生重叠", "重要", "时"), I("家庭事项", "一项需要本人决定", "待定", "家"), I("外部代办", "尚未授予任何权限", "关闭", "办")],
      rightTitle: "安排与授权", rightSummary: "先选本次生活目标，再显示唯一动作。", rightItems: [I("今日三件事", "等待系统编排", "待生", "三"), I("预算边界", "用户尚未确认", "待定", "筹"), I("外部动作", "预订/采购/付款分开授权", "锁定", "权")]
    }),
    P("C06", "专署能力", "百司蜂群 · 最小智能体编队", "baishi-swarm-final-v3.png", {
      subtitle: "用最少、最合适的 Agent 组成护办审证小队，而不是让军团全部上场。", agent: "丞相", phase: "组队",
      verdict: "这项任务只需要五位参与者，庞大军团继续待命。", situation: "任务需要跨专业协作", impact: "成员过多会增加冲突和成本", action: "形成最小充分编队",
      canDo: "选择主责、护办审证成员、依赖、权限和算筹边界，显示不可用能力。",
      primary: "丞相 · 组建最小蜂群", consequence: "生成参与者与依赖草案；真实任务事件发生前小队不会离阵。",
      secondary: ["调整成员", "查看能力契约", "查看算筹影响"],
      leftTitle: "参与者与能力", leftItems: [I("主责官员", "只允许一位", "候选", "主"), I("护办审证", "四类职责按需加入", "待组", "队"), I("能力缺口", "不可用项明确标记", "透明", "缺")],
      rightTitle: "依赖与边界", rightSummary: "军团规模代表储备，不代表正在工作。", rightItems: [I("当前激活", "真实版来自任务事件", "0", "动"), I("权限", "成员获得最小范围", "待审", "权"), I("算筹", "确认前不消耗", "安全", "筹")]
    }),

    P("D01", "治理成果", "门下省 · 阻断与再审", "menxia-final-v1.png", {
      subtitle: "明确为什么不能继续、缺什么，以及满足哪些条件后才能再审。", agent: "门下侍中", phase: "治理门",
      verdict: "当前任务必须暂停：关键证据缺失，继续会越过授权边界。", situation: "任务触发两条机器红线", impact: "绕过将造成不可追溯风险", action: "补正后再提交审查",
      canDo: "说明阻断理由、缺证、条件和版本；不会因重试次数自动放行。",
      primary: "门下省 · 提交补正后再审", consequence: "创建新审查版本，旧阻断理由保留；不会自动通过。",
      secondary: ["查看红线", "返回修改", "补充证据"],
      leftTitle: "阻断原因", leftItems: [I("证据不足", "第二来源仍未取得", "红线", "证"), I("授权越界", "外部动作未获许可", "红线", "权"), I("当前版本", "阻断结论保持只读", "v1", "版")],
      rightTitle: "再审条件", rightSummary: "补正不是通过，仍需重新检查。", rightItems: [I("必要证据", "补齐后才可提交", "缺失", "补"), I("授权范围", "需要用户明确确认", "待定", "授"), I("再审入口", "条件满足后开放", "锁定", "门")]
    }),
    P("D02", "治理成果", "御史台 · 独立审计", "yushitai-final-v1.png", {
      subtitle: "独立检查来源、权限、质量和执行冲突，不为原执行链背书。", agent: "御史大夫", phase: "独立复核",
      verdict: "执行结果可用，但证据链中有一处无法独立追溯。", situation: "成果与来源之间缺少一段链路", impact: "正式采用前仍存在可信缺口", action: "发起独立复核",
      canDo: "审计来源链、权限、冲突、质量和版本，发现问题可以阻断。",
      primary: "御史台 · 发起独立复核", consequence: "创建独立审计记录；不会修改原成果或替执行者补证。",
      secondary: ["查看证据链", "报告质量问题", "比较执行版本"],
      leftTitle: "执行侧产物", leftItems: [I("正式成果", "来自同一任务版本", "已收", "果"), I("来源链", "一段追溯缺失", "缺口", "链"), I("权限记录", "需与动作逐项对应", "待审", "权")],
      rightTitle: "独立发现", rightSummary: "审查者与执行者保持物理和逻辑分离。", rightItems: [I("来源问题", "无法追溯一项结论", "重要", "源"), I("质量门", "尚未给出通过结论", "审中", "质"), I("阻断权", "理由与版本可复核", "有效", "停")]
    }),
    P("D03", "治理成果", "大朝会 · 跨部门裁决", "grand-council-final-v2.png", {
      subtitle: "只在真正跨部门冲突时召开，把分歧压缩成一个老板裁决点。", agent: "丞相", phase: "会审裁决",
      verdict: "各部并非事实冲突，而是在增长速度与风险边界上取舍不同。", situation: "两套方案共享事实但目标权重不同", impact: "拖延会同时错过窗口与控制权", action: "裁决一个核心取舍",
      canDo: "对卷展示共同事实、分歧、硬冲突和后果；裁决后形成执行约束。",
      primary: "丞相 · 提交唯一裁决问题", consequence: "只冻结一个裁决点；不会同时处理多个模糊问题。",
      secondary: ["进入对卷", "补充共同事实", "请部门再次回奏"],
      leftTitle: "方案甲", leftItems: [I("共同事实", "与乙案一致", "已知", "同"), I("核心主张", "更重视速度与窗口", "立场", "甲"), I("主要风险", "资源和质量压力", "风险", "险")],
      rightTitle: "方案乙", rightSummary: "你只需裁决速度与风险边界的取舍。", rightItems: [I("共同事实", "与甲案一致", "已知", "同"), I("核心主张", "更重视证据与控制", "立场", "乙"), I("主要代价", "可能错过部分窗口", "代价", "缓")]
    }),
    P("D04", "治理成果", "正式成果包 · 用户裁决", "result-package-final-v2.png", {
      subtitle: "先看一句结论和关键风险，再按需展开成果、证据、缺口和下一步。", agent: "丞相", phase: "成果裁决",
      outcome: "一份可下载、可继续办理的成果包",
      verdict: "方案可进入小规模验证，但必须保留停止条件和复盘节点。", situation: "六部与专署已形成一份合并回奏", impact: "采纳后仍需逐项授权现实动作", action: "裁决正式成果包",
      canDo: "提供结论、附件、证据、缺口和下一步；下载与外部执行完全分离。",
      primary: "用户 · 裁决正式奏折", consequence: "打开裁决选项；不会自动下载、发送、付款、交易或发布。",
      secondary: ["展开全部证据", "下载成果预览", "要求补证"],
      leftTitle: "成果五件套", leftItems: [I("一句御断", "当前推荐结论", "已成", "断"), I("可用成果", "文档与附件待接", "DEMO", "果"), I("下一步", "现实动作未授权", "待裁", "行")],
      rightTitle: "证据与风险", rightSummary: "采纳结论不等于授权任何现实动作。", rightItems: [I("来源", "演示材料，未接真实源", "DEMO", "源"), I("缺口", "一项不确定仍保留", "1项", "缺"), I("授权", "外部动作全部关闭", "安全", "权")]
    }),
    P("D05", "治理成果", "百司能力目录 · 专业模式", "capability-directory-final-v1.png", {
      subtitle: "爱好者和极客查看真正可用、试验或待建的能力、版本与契约。", agent: "丞相", phase: "能力治理",
      verdict: "目录用于解释和治理，不应该让小白自己在四十一司中找工具。", situation: "当前需要确认能力成熟度", impact: "错误状态会造成虚假承诺", action: "按目标推荐一项能力",
      canDo: "展示能力合同、成熟度、版本、依赖、成本和缺口；正式状态来自 Registry。",
      primary: "丞相 · 按目标推荐能力", consequence: "生成一项推荐与解释，不会直接试用、安装或扣除算筹。",
      leftTitle: "目标与领域", leftItems: [I("当前目标", "继承自任务护照", "已知", "目"), I("专业领域", "由结果自动匹配", "待配", "域"), I("能力缺口", "未接入项不隐藏", "透明", "缺")],
      rightTitle: "契约与成熟度", rightSummary: "LIVE、PILOT、DEMO、待接入必须来自事实源。", rightItems: [I("能力合同", "输入/输出/边界", "可查", "契"), I("版本", "变更与回退记录", "待接", "版"), I("算筹成本", "确认调用前预览", "透明", "筹")]
    }),
    P("D06", "治理成果", "个人朝堂 · 定制与授权", "shangshufang-final-v2.png", {
      subtitle: "定制默认主责、会审阵容、预警、记忆、隐私和成本边界。", agent: "丞相", phase: "个人设置",
      verdict: "先定义你希望朝堂如何协作，再决定哪些能力可以长期记住。", situation: "默认偏好尚未冻结", impact: "过度授权会损害可控性", action: "保存一份可预览的个人方案",
      canDo: "配置默认主责、会审、通知、隐私、记忆与算筹边界；人类和 Agent 身份分开。",
      primary: "用户 · 保存个人朝堂方案", consequence: "先显示影响预览，再保存本地草案；不会永久授权或删除数据。",
      secondary: ["预览影响", "恢复默认", "查看身份与权限"],
      leftTitle: "你的偏好", leftItems: [I("默认主责", "丞相负责未知问题", "草案", "主"), I("人生六域", "优先级由你决定", "待定", "六"), I("记忆范围", "按议题单独控制", "受限", "忆")],
      rightTitle: "授权与成本", rightSummary: "每项设置都可预览、撤销和恢复默认。", rightItems: [I("Agent 权限", "与人类权限分籍", "最小", "权"), I("通知", "重要事件才打扰", "可调", "铃"), I("算筹上限", "任务前显示影响", "待定", "筹")]
    }),

    P("E01", "人生六域", "事业 · 一人公司 OPC", "dadian-final-v2.png", {
      subtitle: "一个真人老板＋一套AI朝廷，把获客、交付和经营变成可持续的一人公司。", agent: "丞相", phase: "OPC经营判断",
      roleDefinition: "把你一人的目标变成由AI员工军团持续运转的获客、交付和经营系统。",
      userValue: "你只负责目标、取舍和最终确认；丞相统筹，六部与百司负责研究、获客、交付和复盘。",
      outcome: "一张OPC经营作战图、今日唯一瓶颈和最小AI执行编队",
      verdict: "一人公司不是一个人做所有事，而是你只做关键判断，让AI朝廷承担可标准化的工作。", situation: "老板同时兼任获客、产品、交付和运营", impact: "注意力被日常事务耗尽，增长与交付难以同时稳定", action: "先找出当前唯一经营瓶颈",
      canDo: "丞相统筹；锦衣卫找信息；兵部获客；工部交付；吏部编制AI员工；户部守住现金；军机处推进项目。",
      primary: "丞相 · 生成我的OPC作战图", consequence: "只形成角色、流程和任务草案；不会自动营销、发布、收款、付款或调用外部服务。",
      entryAction: "建立我的一人公司 OPC", entryPromise: "你会得到：当前唯一瓶颈、三支AI执行军团和一张今日OPC行动卡。",
      benefits: [I("获客与收入", "锦衣卫找市场信号，礼部整理表达，兵部推进客户", "主板块", "客"), I("产品与交付", "工部形成可验收成果，军机处持续推进复杂任务", "主板块", "产"), I("AI员工与经营后台", "吏部编制AI员工，户部守现金，翰林院持续升级能力", "主板块", "员")],
      watch: [I("当前唯一经营瓶颈", "先判断卡在获客、交付还是经营后台", "先判断", "阻"), I("老板必须亲自做什么", "只保留目标、关系、取舍和高影响确认", "要亲决", "君"), I("哪些可以交给AI军团", "按风险、权限和可验收结果逐项交办", "可交办", "军")],
      newsTitle: "OPC经营信号尚未接入", newsDetail: "正式版只呈送与你行业、客户、现金和交付直接有关的已核验变化。",
      leftTitle: "OPC经营版图", leftItems: [I("获客", "等待接入真实客户线索", "待接", "客"), I("交付", "一个成果需要定义验收", "待定", "产"), I("AI员工", "等待确认最小编队", "待编", "员")],
      rightTitle: "瓶颈与军团", rightSummary: "先找唯一瓶颈，再召集最小军团。", rightItems: [I("唯一瓶颈", "等待丞相复述确认", "待定", "阻"), I("老板亲决", "目标与高影响取舍", "保留", "君"), I("朝堂承办", "研究、获客、交付、复盘", "可办", "军")]
    }),
    P("E02", "人生六域", "财富 · 安全与增长", "hubu-finance-final-v2.png", {
      subtitle: "先守住安全和现金，再决定预算、投资与资产配置。", agent: "户部尚书", phase: "财富判断",
      roleDefinition: "把现金流、预算、收入、资产和投资机会整理成安全线与今日财富行动。",
      userValue: "你会先知道财富安全边界和钱是否安全，再看增长机会；所有付款与交易仍由你逐项确认。",
      outcome: "一份财富安全线、预算取舍和投资研究入口",
      verdict: "当前最重要的是确认现金安全边界，而不是寻找新的高收益标的。", situation: "支出计划与投资目标重叠", impact: "流动性不足会压缩未来选择", action: "形成今日财富判断",
      canDo: "整理现金、预算、收入、标的、配置和风险；所有交易与付款逐项授权。",
      primary: "户部 · 形成今日财富判断", consequence: "生成财务建议；不会接入账户、付款或交易。",
      entryAction: "请户部先判断财富安全线", entryPromise: "你会得到：现金安全判断、预算优先级和是否值得深入研究的投资入口。",
      leftTitle: "财富全景", leftItems: [I("现金流", "演示数据，未接账户", "DEMO", "现"), I("预算", "两项支出需要排序", "待决", "预"), I("资产", "专业投资入口可展开", "待接", "资")],
      rightTitle: "安全与行动", rightSummary: "先安全、再增长、后交易。", rightItems: [I("安全线", "等待真实数据计算", "待接", "安"), I("今日行动", "只保留一项", "待生", "行"), I("交易权限", "默认关闭", "锁定", "权")]
      ,benefits: [I("现金流是否安全", "看清未来可用现金与必要预留；当前仅为结构演示", "查看", "现"), I("预算该怎么排", "得到一项优先顺序和取舍理由", "查看", "预"), I("投资是否值得做", "先研究价值与风险，再决定是否进入专业投资", "深入", "投")]
      ,watch: [I("先确认安全线", "没有真实账户数据时不会给出虚假金额", "第一步", "安"), I("两项支出正在竞争", "需要你先说明哪项结果更重要", "需选择", "预"), I("市场信号", "来源尚未接入，暂不展示行情结论", "待接入", "讯")]
      ,newsTitle: "财富信息源尚未接入"
      ,newsDetail: "正式版只出现与你的现金、预算或投资目标直接相关的新闻，并显示来源和影响。"
      ,sealAction: "查看今日财富建议"
    }),
    P("E03", "人生六域", "学习 · 今日进化", "hanlinyuan-final-v2.png", {
      subtitle: "明确今天学什么、怎么练，以及它要支持哪个真实结果。", agent: "翰林学士", phase: "学习规划",
      roleDefinition: "把前沿资料、知识解释、练习和真实作品连接成一条能验证进步的学习路径。",
      userValue: "你不再收藏课程，而是每天完成一次练习、留下一件作品，并让朝堂同步进化。",
      outcome: "一张十分钟训练卡和一件能证明进步的作品",
      verdict: "今天只学一个马上能用的动作，并留下作品。", situation: "收藏很多，真正练习太少", impact: "知识没有变成可复用能力", action: "告诉翰林学士：我最想学会什么",
      canDo: "把目标、锦衣卫核验资料、浅显解释、练习、项目和复盘连成可执行路径，并同步发现朝堂能力缺口。",
      primary: "翰林院 · 生成今日学习路径", consequence: "生成学习与练习草案，不会伪造掌握进度。",
      entryAction: "请翰林学士安排今日学习", entryPromise: "你会得到：今天学什么、怎样练、完成什么作品，以及下一次如何进步。",
      abilities: [{ label: "进入翰林院", page: "C03" }, { label: "个人御学堂", page: "I02" }, { label: "前沿校书阁", page: "I03" }],
      benefits: [I("今天十分钟学会什么", "只推荐一个能立刻用于真实任务的动作", "现在开始", "学"), I("做一件能展示的作品", "边做边学，结束时留下提示词、方案、代码或成品", "可带走", "作"), I("发现值得学的新能力", "筛选前沿Agent、Skill与工作流，再告诉你值不值得学", "每周更新", "新")],
      watch: [I("我现在最缺哪项能力", "从正在推进的项目反推，不建立无尽课程表", "先看", "缺"), I("怎样用AI让我学得更快", "先示范、再模仿、最后用作品检验", "可体验", "快"), I("学完以后强在哪里", "用作品和真实任务前后对照，不用虚假排名", "有证据", "证")],
      newsTitle: "前沿学习源尚未接入", newsDetail: "正式版由锦衣卫搜集、翰林院筛选，只推荐能支持你当前目标的资料、Agent和Skill。",
      leftTitle: "学习目标", leftItems: [I("能力目标", "支持当前事业项目", "已知", "能"), I("学习材料", "等待锦衣卫核验与推荐", "待接", "卷"), I("时间", "由用户确认今日可用时间", "待确", "时")],
      rightTitle: "练习与成果", rightSummary: "今天的结束标准是一件作品，而不是看完一门课。", rightItems: [I("练习", "一项输出型任务", "待生", "练"), I("作品", "连接真实项目", "可连", "作"), I("复盘", "结果回填史馆", "待后", "复")]
    }),
    P("E04", "人生六域", "生活 · 今日安排", "neiwufu-final-v2.png", {
      subtitle: "把日程、家庭、出行和采购变成三件真正能完成的事。", agent: "内务府总管", phase: "生活安排",
      roleDefinition: "把日程、家庭、出行、采购和代办协调成今天真正能完成的三件事。",
      userValue: "你会少做无关紧要的事，守住家庭和休息；外部代办始终先预览再授权。",
      outcome: "一份家人关怀、节假日安排与生活代办清单",
      verdict: "把重要的人和重要的日子照顾好，其余琐事交给内务府。", situation: "家人、节日、出行与日常琐事容易被忙碌淹没", impact: "真正重要的关系常常输给临时事务", action: "告诉内务府：最近最想照顾好的人或事情",
      canDo: "整理冲突、预算和代办；预订、采购、付款分别预览和授权。",
      primary: "内务府 · 生成今日安排", consequence: "只生成安排草案，不写入日历或执行外部动作。",
      entryAction: "请内务府整理今日三件事", entryPromise: "你会得到：三件最重要的安排、冲突处理和需要你授权的代办。",
      benefits: [I("家人生日与纪念日", "添加日期和偏好，提前准备礼物、祝福与惊喜方案", "去准备", "礼"), I("节假日与周末安排", "结合家人、预算与时间，给出少量真正合适的选择", "看安排", "假"), I("旅行聚会与生活代办", "先比较路线、预算和取消条件，再由你决定是否办理", "可预览", "行")],
      watch: [I("最近有什么重要日子", "生日、纪念日、节假日与家庭约定集中提醒", "添加后可见", "日"), I("哪件事必须你亲自做", "陪伴、承诺和关系由你完成，琐事才交给AI", "替你守住", "心"), I("内务府能替你准备什么", "礼物候选、行程草案、采购比较和提醒文案", "直接有用", "办")],
      newsTitle: "生活服务尚未接入", newsDetail: "正式版只显示会影响你今日安排的天气、出行、日历与家庭事项，并逐项说明来源。",
      leftTitle: "今日事项", leftItems: [I("日程冲突", "两项重叠", "重要", "时"), I("家庭", "一项需要本人参与", "保留", "家"), I("代办", "尚未授权", "关闭", "办")],
      rightTitle: "值得你亲自关心", rightSummary: "内务府管琐事，你把时间留给真正重要的人。", rightItems: [I("家人", "添加生日、纪念日和最近想关心的人", "可设置", "家"), I("假期", "先选想休息、陪伴还是远行", "一键说明", "假"), I("惊喜", "礼物、祝福、聚会和回忆可一起策划", "可生成", "喜")],
      sealAction: "看看内务府替我记住什么"
    }),
    P("E05", "人生六域", "健康 · 今日准备", "taiyiyuan-final-v2.png", {
      subtitle: "发现记录变化、补齐缺失信息，并准备更高质量的专业咨询。", agent: "太医令", phase: "健康准备",
      roleDefinition: "整理健康变化、记录缺口和专业咨询问题，帮助你更准确地描述情况。",
      userValue: "你会得到清晰记录和咨询准备，而不是未经验证的诊断、治疗或健康评分。",
      outcome: "一张健康变化卡、家人关怀清单和就医准备包",
      verdict: "先把自己和家人的重要变化记清楚，再决定要不要进一步咨询。", situation: "零散感受和资料尚未形成连续记录", impact: "需要专业帮助时容易遗漏关键细节", action: "告诉太医令：最近最想关注谁的哪项变化",
      canDo: "整理记录、问题和摘要；不诊断、不替代医生、不自动联系机构。",
      primary: "太医院 · 生成健康行动清单", consequence: "生成记录和咨询准备建议，不提供诊断或治疗。",
      entryAction: "请太医令整理今日健康准备", entryPromise: "你会得到：变化摘要、需要补充的记录和可带给专业人员的问题清单。",
      benefits: [I("最近哪里发生了变化", "把睡眠、精力、运动、用药或检查按时间整理", "开始记录", "变"), I("替家人准备一次关怀", "整理父母复查、孩子成长或家人用药需要问的问题", "去准备", "家"), I("带走一份咨询准备包", "摘要、资料目录和问题清单一次整理好", "可下载", "包")],
      watch: [I("是否有需要及时处理的信号", "只按明确安全规则提醒寻求专业帮助，不猜病因", "安全优先", "警"), I("下次咨询别忘了问什么", "把最容易遗漏的问题提前写好", "很实用", "问"), I("哪些资料还缺", "只列缺口，不用推测填空", "一目了然", "缺")],
      newsTitle: "健康资料与服务未接入", newsDetail: "正式版只呈送与你记录和咨询准备有关的信息，并明确非诊断边界。",
      leftTitle: "健康变化", leftItems: [I("趋势", "演示记录，非真实健康数据", "DEMO", "势"), I("作息", "两天信息缺失", "缺口", "眠"), I("运动", "需要用户补充", "待补", "动")],
      rightTitle: "今天值得关心", rightSummary: "太医令负责整理与提醒，专业判断仍交给专业人员。", rightItems: [I("自己", "最近睡眠、精力或身体感受有什么变化", "可记录", "身"), I("家人", "父母复查、孩子成长或家人用药是否需要准备", "可关怀", "家"), I("咨询", "把资料和问题一次准备齐", "可带走", "询")],
      sealAction: "看看今天该关注什么"
    }),
    P("E06", "人生六域", "娱乐 · 创作与观看", "entertainment-final-v2.png", {
      subtitle: "在有限时间里选择一次真正适合的创作或观看体验。", agent: "内务府总管", phase: "休闲选择",
      roleDefinition: "把AI图像视频创作、影视发现和今日休闲安排变成一次真正放松或有作品的体验。",
      userValue: "你可以选择创作一件作品或享受一次观看，不让推荐和选项继续消耗注意力。",
      outcome: "一个惊喜创作成品或一份今晚刚刚好的观看安排",
      verdict: "今晚只给你一个好选择：真正放松，或者把一个灵感做成作品。", situation: "内容太多、选择太累，灵感又容易转瞬即逝", impact: "休闲反而继续消耗注意力", action: "告诉内务府：今晚想放松，还是想创作",
      canDo: "左侧调用 AI 图像/视频创作，右侧做影视发现与观看安排；仙狐不承担娱乐人格。",
      primary: "内务府 · 安排今晚休闲", consequence: "先询问创作或观看偏好；不会自动播放、购买或发布内容。",
      entryAction: "选择今晚创作或观看", entryPromise: "你会得到：一个可保存的创作项目，或一份不浪费时间的观看安排。",
      secondary: ["我要创作图像/视频", "我要看电影/视频", "加入今日安排"],
      benefits: [I("今晚只推荐一部", "告诉我有多少时间和什么心情，只给少量明确选择", "轻松选", "映"), I("把一个灵感做成图或视频", "从一句想法到提示词、分镜和候选成品", "开始创作", "创"), I("给家人朋友做个惊喜", "纪念图、祝福视频、旅行回忆和节日内容一次策划", "有温度", "喜")],
      watch: [I("30、60还是120分钟", "先按时间筛选，不让选片耗掉整晚", "先选择", "时"), I("今天想被治愈还是被启发", "只问一个感受，不建立隐性兴趣画像", "说一句", "心"), I("创作完成后带走什么", "保存成品、提示词、分镜和版本，下次可以继续", "能带走", "藏")],
      newsTitle: "影视与创作服务尚未接入", newsDetail: "正式版只显示符合你时间和明确偏好的内容，以及可追溯的创作工具与素材信息。",
      leftTitle: "AI 创作", leftItems: [I("图像创作", "从想法到候选画面", "可选", "图"), I("视频创作", "提示词、分镜与渲染", "待接", "影"), I("作品项目", "保存与版本归档", "可建", "作")],
      rightTitle: "今晚想得到什么感觉", rightSummary: "只问时间和心情，然后替你减少选择。", rightItems: [I("放松", "给我一部刚刚好的电影或视频", "可选择", "松"), I("创作", "把脑中的画面变成图像或短片", "可开始", "创"), I("惊喜", "给重要的人做一份有温度的内容", "可策划", "喜")],
      sealAction: "今晚给我一个好选择",
      contexts: ["今晚休闲", "尚未选择创作/观看"], hint: "仙狐只负责信息采集，不会作为娱乐人格或对话对象出现。"
    }),

    P("F01", "情报工作台", "全球三小时简报", "jinyiwei-final-v2.png", {
      subtitle: "每三小时最多生成一份去重简报；没有真实来源事件就明确显示无更新。", agent: "锦衣卫指挥使", phase: "定时呈报",
      roleDefinition: "把全球政治、经济、军事、科技与行业变化压缩成与你有关的事实简报。",
      userValue: "你会先看到最重要的一条变化、为什么与你有关、哪些仍未证实，以及应该转交哪个部门。",
      outcome: "一份可追溯、去重、按用户目标排序的三小时简报",
      verdict: "真实信息源尚未接入；当前只展示简报结构，不生成虚假全球事件。", situation: "来源连接、用户关注主题和核验规则尚未配置", impact: "没有真实来源时任何新闻摘要都会误导", action: "选择需要关注的地区与主题",
      canDo: "接入真实来源后，锦衣卫按事件去重、核验、分级并定向分发；钦天监另行负责预测。",
      primary: "锦衣卫 · 配置简报范围", consequence: "只保存本地演示偏好，不订阅、不采集、不发送通知。",
      secondary: ["政治与经济", "军事与科技", "行业与六部影响"],
      abilities: [{ label: "查看证据护照", page: "F04" }, { label: "查看部门分发", page: "F05" }, { label: "配置紧急预警", page: "F03" }],
      leftTitle: "优先呈报", leftItems: [I("全球要闻", "真实来源尚未接入", "待接", "球"), I("行业变化", "等待选择用户行业", "待选", "业"), I("六部影响", "核验后再确定分发", "待核", "分")],
      rightTitle: "核验与鲜度", rightSummary: "推荐优先看高影响且与你相关的事实；未核验内容保持隔离。", rightItems: [I("来源连接", "尚未接入 Provider", "待接", "源"), I("最近更新", "无真实事件，不显示伪时间", "无", "时"), I("未证实", "不会进入部门建议", "隔离", "疑")],
      benefits: [I("最重要的一条变化", "从全球事件中只推荐与你最相关的事实", "待接", "一"), I("它为什么影响你", "明确关联事业、财富、学习、生活、健康或娱乐", "待接", "关"), I("接下来交给谁", "核验后转交钦天监或具体六部继续深化", "待接", "分")],
      watch: [I("信息源是否真实可用", "没有来源就不展示新闻", "首要", "源"), I("核验是否完成", "事实、传闻与推断分层", "规则", "证"), I("是否达到打扰阈值", "非重要变化留在简报，不发预警", "克制", "静")],
      newsTitle: "尚未接入全球实时信息源", newsDetail: "正式版显示真实来源、采集时间、核验时间、鲜度和撤回状态。"
    }),
    P("F02", "情报工作台", "行业情报台", "jinyiwei-final-v2.png", {
      subtitle: "围绕用户行业呈报政策、技术、竞争、客户与供应链事实，不把传闻当机会。", agent: "锦衣卫指挥使", phase: "行业监测",
      roleDefinition: "持续整理与你行业有关的变化，并说明事实、影响对象和仍需核验的部分。",
      userValue: "你会获得今日行业变化、竞争与客户信号、供应链风险，以及可以交给哪个部门继续处理。",
      outcome: "一张按影响排序的行业情报地图",
      verdict: "尚未选择行业与真实来源；当前不展示虚假的竞争或市场信号。", situation: "行业画像与监测范围仍为空", impact: "范围过宽会产生噪声，范围过窄会漏掉结构变化", action: "确认行业、地区和五个重点对象",
      canDo: "监测政策、技术、竞争者、客户与供应链事件；只呈报证据和影响对象，不生成战略预测。",
      primary: "锦衣卫 · 建立行业监测范围", consequence: "只生成本地演示监测清单，不访问未授权数据或创建真实订阅。",
      secondary: ["政策与监管", "技术与竞争", "客户与供应链"],
      abilities: [{ label: "查看证据护照", page: "F04" }, { label: "分发给相关部门", page: "F05" }, { label: "交钦天监推演", page: "G01" }],
      leftTitle: "行业事件河", leftItems: [I("政策", "来源尚未接入", "待接", "政"), I("技术与竞争", "监测对象尚未选择", "待选", "技"), I("客户与供应链", "范围和授权待确认", "待定", "链")],
      rightTitle: "推荐先看", rightSummary: "次级页信息可以全面，但永远先推荐影响最大且证据最完整的一条。", rightItems: [I("用户相关性", "等待目标与行业画像", "待接", "关"), I("影响范围", "由受影响部门解释", "待分", "部"), I("事实状态", "主张、反证、缺口分开", "透明", "证")],
      newsTitle: "行业来源尚未接入", newsDetail: "正式版按同一事件对象更新，不用重复新闻制造信息瀑布。"
    }),
    P("F03", "情报工作台", "紧急预警台", "jinyiwei-final-v2.png", {
      subtitle: "只在证据、影响、用户相关性和时间窗口同时达标时打扰用户。", agent: "锦衣卫指挥使", phase: "事件预警",
      roleDefinition: "识别可能造成重大变化的事实事件，并在证据不足时明确标记而不是制造恐慌。",
      userValue: "你会知道发生了什么、为什么现在必须看、最迟何时行动，以及应该找谁继续判断。",
      outcome: "一条有证据、影响、时间窗和责任去向的预警",
      verdict: "当前没有真实来源与用户影响模型，因此不显示任何伪造紧急事件。", situation: "预警来源、阈值和通知渠道均未接入", impact: "过度预警会制造焦虑，漏报又会错过关键窗口", action: "确认四级预警阈值",
      canDo: "按关注、重要、紧急、阻断四级管理事件；必要时只引导至钦天监或相关部门，不在本页代做判断。",
      primary: "锦衣卫 · 配置预警阈值", consequence: "只生成本地演示规则，不开启监控或发送通知。",
      secondary: ["预警等级", "通知范围", "撤回与更正"],
      abilities: [{ label: "查看事件证据", page: "F04" }, { label: "交钦天监判断", page: "G01" }, { label: "查看部门去向", page: "F05" }],
      leftTitle: "预警四级", leftItems: [I("关注", "进入简报，不主动打扰", "克制", "注"), I("重要", "进入待处理并说明影响", "待接", "重"), I("紧急/阻断", "必须满足严格证据门", "锁定", "急")],
      rightTitle: "为什么打扰", rightSummary: "每次预警必须解释证据、影响、截止时间和建议去向。", rightItems: [I("证据门", "独立来源与反证", "待配", "证"), I("影响门", "与用户目标直接相关", "待配", "关"), I("时间门", "存在真实行动窗口", "待配", "时")],
      newsTitle: "当前无真实预警", newsDetail: "这是诚实的空白状态；正式版支持更正、撤回和误报反馈。"
    }),
    P("F04", "情报工作台", "情报事件 · 证据护照", "jinyiwei-final-v2.png", {
      subtitle: "把一条事件拆成主张、来源、反证、鲜度、缺口和版本，供各部共享同一事实。", agent: "锦衣卫指挥使", phase: "证据详情",
      roleDefinition: "维护同一事件的证据身份，不让每个部门各自复制和解释一套事实。",
      userValue: "你能逐项核对事实从哪里来、何时更新、哪些仍未知，以及后来是否被更正或撤回。",
      outcome: "一个跨部门共用、可追溯的事件对象",
      verdict: "当前没有选中的真实事件；以下只展示证据护照字段。", situation: "事件主张与来源记录为空", impact: "缺少共享事件对象会让各部门依据不一致", action: "从真实简报选择一条事件",
      canDo: "记录原文、发布时间、采集时间、核验时间、独立来源、反证、未知、鲜度、版本和分发历史。",
      primary: "锦衣卫 · 选择一条事件查看", consequence: "只打开本地演示详情，不创建来源或伪造证据。",
      secondary: ["主张与来源", "反证与未知", "更正与分发历史"],
      abilities: [{ label: "返回三小时简报", page: "F01" }, { label: "查看部门分发", page: "F05" }, { label: "交钦天监推演", page: "G01" }],
      leftTitle: "证据结构", leftItems: [I("核心主张", "尚无真实事件", "空白", "主"), I("独立来源", "来源连接未建立", "待接", "源"), I("反证与未知", "不得自动补全", "保留", "反")],
      rightTitle: "时间与版本", rightSummary: "三级专业页展示完整证据，而主页面只展示推荐结论。", rightItems: [I("采集/核验时间", "必须来自真实事件", "待接", "时"), I("鲜度", "根据来源更新计算", "待接", "鲜"), I("更正/撤回", "保留所有旧版本", "可追", "版")]
    }),
    P("F05", "情报工作台", "六部分发台", "jinyiwei-final-v2.png", {
      subtitle: "同一条核验事实按影响对象送往相关部门，每个部门只做自己的专业解释。", agent: "锦衣卫指挥使", phase: "情报分发",
      roleDefinition: "决定一条事实应该提醒谁，不在锦衣卫页面代替六部或钦天监分析。",
      userValue: "你会看到情报送到了哪里、为什么送、哪个部门将输出什么结果，以及是否需要你的关注。",
      outcome: "一张事实到部门结果的透明分发图",
      verdict: "当前没有真实事件可分发；展示的是跨部门联动合同。", situation: "事件对象和受影响范围均为空", impact: "无规则分发会造成部门噪声或职责混淆", action: "先选择一条已核验事件",
      canDo: "分发事实与证据引用；钦天监负责情景，户部负责财富，礼部负责品牌商务，兵部负责增长，刑部负责合规。",
      primary: "锦衣卫 · 预览分发去向", consequence: "只生成本地演示路由，不向任何部门发送任务。",
      secondary: ["钦天监与丞相", "六部专业解释", "军机处任务去向"],
      abilities: [{ label: "钦天监战略观象台", page: "G01" }, { label: "户部财富驾驶舱", page: "H01" }, { label: "返回证据护照", page: "F04" }],
      leftTitle: "同一事实", leftItems: [I("事件护照", "来源和版本唯一", "待选", "证"), I("影响对象", "按用户计划确定", "待算", "关"), I("分发理由", "必须可解释", "透明", "由")],
      rightTitle: "部门结果", rightSummary: "联动不等于混岗：每一页始终坚持自己的主题。", rightItems: [I("钦天监", "输出情景与触发条件", "可转", "天"), I("户部", "输出财富影响与边界", "可转", "户"), I("其他六部", "按本职输出专业结果", "可转", "部")]
    }),

    P("G01", "战略工作台", "钦天监 · 战略观象台", "qintianjian-final-v2.png", {
      subtitle: "把锦衣卫核验事实、内部数据和历史结果转成趋势、情景与战略选择。", agent: "钦天监监正", phase: "战略观测",
      outcome: "一份说明趋势、影响、选择与转向条件的战略总览",
      verdict: "外部事实与内部数据尚未接入；当前不生成伪造预测。", situation: "情报事件、经营数据与历史基线均为空", impact: "缺少事实和基线时任何趋势判断都不可靠", action: "选择需要推演的决策问题",
      canDo: "引用锦衣卫事件护照，结合内部数据与史馆结果形成条件分析；不回头承担情报采集和验真。",
      primary: "钦天监 · 建立战略问题", consequence: "只生成本地演示问题卡，不计算概率或触发执行。",
      secondary: ["趋势与信号", "战略选择", "风险窗口"],
      abilities: [{ label: "进入三景推演", page: "G02" }, { label: "查看触发与失效", page: "G03" }, { label: "返回情报证据", page: "F04" }],
      leftTitle: "战略输入", leftItems: [I("核验情报", "等待锦衣卫事件护照", "待接", "证"), I("内部数据", "尚未接入经营事实", "待接", "内"), I("历史结果", "等待史馆基线", "待接", "史")],
      rightTitle: "推荐先看", rightSummary: "先看最可能改变用户选择的一项条件，再展开完整战略资料。", rightItems: [I("关键趋势", "必须有事实与历史基线", "待析", "势"), I("战略取舍", "说明代价与可逆性", "待析", "策"), I("转向窗口", "定义何时必须调整", "待析", "转")],
      newsTitle: "战略输入尚未接入", newsDetail: "正式版每条判断可回到锦衣卫证据，并由史馆回测实际结果。"
    }),
    P("G02", "战略工作台", "钦天监 · 三景推演室", "qintianjian-final-v2.png", {
      subtitle: "不用伪精确概率，用上行、基线、受阻三种条件情景比较行动与代价。", agent: "钦天监监正", phase: "情景推演",
      outcome: "三种条件情景、每种应对动作和共同停止条件",
      verdict: "尚无真实战略问题与证据，三景内容保持空白。", situation: "关键变量和可用资源未确认", impact: "先写结论会把假设伪装成预测", action: "确认最多两项关键未知",
      canDo: "比较各情景的条件、早期信号、资源、行动、代价与可逆性；不宣称确定未来。",
      primary: "钦天监 · 确认关键未知", consequence: "只冻结本地演示假设，未生成概率、建议或任务。",
      secondary: ["上行情景", "基线情景", "受阻情景"],
      abilities: [{ label: "查看触发与失效", page: "G03" }, { label: "返回战略观象台", page: "G01" }, { label: "请丞相比较三策", page: "A02" }],
      leftTitle: "三种未来", leftItems: [I("上行", "条件与信号待定义", "空白", "上"), I("基线", "历史基线尚未接入", "空白", "中"), I("受阻", "反方条件待补充", "空白", "阻")],
      rightTitle: "选择与代价", rightSummary: "次级页全面展示情景，但先推荐用户关注最敏感的一项变量。", rightItems: [I("共同动作", "各情景都值得做的准备", "待析", "共"), I("不可逆动作", "必须推迟到证据充分", "锁定", "险"), I("转向成本", "提前定义再行动", "待析", "转")]
    }),
    P("G03", "战略工作台", "钦天监 · 触发与失效台", "qintianjian-final-v2.png", {
      subtitle: "提前定义什么变化会强化、削弱或推翻当前战略，让建议可以自我纠错。", agent: "钦天监监正", phase: "战略监测",
      outcome: "一组可观测触发信号、失效条件和转向建议",
      verdict: "当前战略与真实信号未接入，无法配置有效预警。", situation: "没有被确认的战略版本", impact: "没有失效条件的建议会在环境变化后继续误导", action: "选择一个已确认战略版本",
      canDo: "监测强化信号、削弱信号、失效条件和风险窗口；真实通知需经过锦衣卫事实核验。",
      primary: "钦天监 · 定义转向条件", consequence: "只生成本地演示条件表，不创建监控或通知。",
      secondary: ["强化信号", "削弱信号", "失效与转向"],
      abilities: [{ label: "返回三景推演", page: "G02" }, { label: "查看锦衣卫预警", page: "F03" }, { label: "交丞相调整方案", page: "A02" }],
      leftTitle: "可观测信号", leftItems: [I("强化", "事实出现后更新版本", "待接", "强"), I("削弱", "保留相反信号", "待接", "弱"), I("失效", "满足即停止旧建议", "待定", "停")],
      rightTitle: "转向规则", rightSummary: "预测的价值不在猜中，而在更早知道何时改变行动。", rightItems: [I("观察频率", "由事件而非假时钟驱动", "待配", "时"), I("责任 Agent", "钦天监解释、丞相取舍", "明确", "责"), I("史馆回测", "用实际结果检验信号", "待后", "史")]
    }),

    P("H01", "财富工作台", "户部 · 财富驾驶舱", "hubu-finance-final-v2.png", {
      subtitle: "一屏看清现金安全、预算取舍、资产风险和最值得研究的财富机会。", agent: "户部尚书", phase: "财富总览",
      outcome: "一份先安全、再增长、后交易的财富优先顺序",
      verdict: "真实账户、预算和持仓尚未接入，因此不展示虚假金额或收益。", situation: "财务数据与用户风险边界均为空", impact: "没有完整账目时直接谈机会会损害流动性", action: "选择要解决的财富问题",
      canDo: "引用锦衣卫市场事实和钦天监情景，独立形成现金、预算、投资、税务与保值建议；不代替用户交易。",
      primary: "户部 · 建立财富全景", consequence: "只生成本地演示资料清单，不连接账户、不付款、不下单。",
      secondary: ["现金与预算", "资产与风险", "收入与商业机会"],
      abilities: [{ label: "投资与商业机会", page: "H02" }, { label: "财富风险护城河", page: "H03" }, { label: "预算现金与税务", page: "H04" }],
      leftTitle: "财富四账", leftItems: [I("现金", "账户未授权", "待接", "现"), I("预算", "目标与必要支出待确认", "待定", "预"), I("资产与负债", "持仓与债务未接入", "待接", "资")],
      rightTitle: "推荐先看", rightSummary: "主页面只推荐最重要的一项财富选择，完整账目进入次级与三级页。", rightItems: [I("安全线", "先确认必要流动性", "首要", "安"), I("可选机会", "证据与反方理由并列", "待研", "机"), I("现实动作", "账户门与交易门关闭", "安全", "权")],
      newsTitle: "财富信息与账户尚未接入", newsDetail: "正式版只展示与用户现金、预算、持仓和目标有关的可追溯影响。"
    }),
    P("H02", "财富工作台", "户部 · 投资与商业机会", "hubu-finance-final-v2.png", {
      subtitle: "把投资、提升收入、优化成本和商业机会放在同一套证据与风险框架中比较。", agent: "户部尚书", phase: "机会研究",
      outcome: "机会论点、催化条件、最强反对理由、失效条件和下一步验证",
      verdict: "尚无真实市场、标的或业务数据；当前不推荐任何投资或赚钱项目。", situation: "机会输入与用户能力边界均为空", impact: "脱离现金和能力谈机会会把想象当成收益", action: "选择投资或商业增长方向",
      canDo: "研究标的、行业、收入、成本和商业模式；每个机会必须附证据、反方席和失效条件。",
      primary: "户部 · 建立机会研究卡", consequence: "只生成本地演示研究结构，不构成投资建议、收益保证或交易指令。",
      secondary: ["投资研究", "收入与商业机会", "成本与效率机会"],
      abilities: [{ label: "查看风险护城河", page: "H03" }, { label: "查看行业情报", page: "F02" }, { label: "进入战略情景", page: "G02" }],
      leftTitle: "机会候选", leftItems: [I("投资", "标的与行情未接入", "待接", "投"), I("增加收入", "用户资源与能力待确认", "待问", "收"), I("商业机会", "行业事实尚未核验", "待核", "商")],
      rightTitle: "机会反方席", rightSummary: "先推荐最值得验证的一项，同时完整展示反对理由、代价与退出条件。", rightItems: [I("核心论点", "必须有可追溯证据", "待生", "论"), I("最强反方", "不能折叠或隐藏", "必看", "反"), I("失效与退出", "行动前先定义", "锁定", "退")]
    }),
    P("H03", "财富工作台", "户部 · 财富风险护城河", "hubu-finance-final-v2.png", {
      subtitle: "先守住现金、流动性、集中度和选择权，再讨论收益与扩张。", agent: "户部尚书", phase: "风险防守",
      outcome: "现金安全线、主要暴露、压力情景和可执行的风险边界",
      verdict: "真实持仓、负债与现金流未接入，无法计算任何风险分数。", situation: "财富数据与风险承受范围均为空", impact: "伪造风险分会制造虚假安全感", action: "确认需要守住的最低安全与选择权",
      canDo: "分析集中度、流动性、利率、汇率、政策和尾部风险；高风险事项明确建议专业复核。",
      primary: "户部 · 定义财富安全线", consequence: "只生成本地演示边界，不连接账户或改变配置。",
      secondary: ["现金与流动性", "集中度与负债", "政策与尾部风险"],
      abilities: [{ label: "预算现金与税务", page: "H04" }, { label: "查看紧急预警", page: "F03" }, { label: "返回财富驾驶舱", page: "H01" }],
      leftTitle: "风险暴露", leftItems: [I("流动性", "现金与期限未接入", "待接", "流"), I("集中度", "持仓未授权", "待接", "集"), I("负债与尾部", "义务资料缺失", "待补", "险")],
      rightTitle: "护城河", rightSummary: "完整展示风险，但始终先推荐最应守住的一条安全边界。", rightItems: [I("最低安全线", "由用户目标和账目决定", "待算", "安"), I("压力情景", "不使用无依据概率", "待析", "压"), I("专业复核", "税务、法律等按需说明", "按需", "人")]
    }),
    P("H04", "财富工作台", "户部 · 预算现金与税务", "hubu-finance-final-v2.png", {
      subtitle: "把现金流、项目预算、必要支出和税务影响放在同一张可核对账册中。", agent: "户部尚书", phase: "账务规划",
      outcome: "预算优先顺序、现金影响、税务资料清单和需专业复核事项",
      verdict: "账目与所在司法辖区尚未接入，不能给出金额、税额或确定税务结论。", situation: "收入、支出、凭证与地区规则均为空", impact: "用演示数据做预算或税务决策会造成现实损失", action: "确认预算目标与资料范围",
      canDo: "整理收入、支出、预算、凭证和税务问题；适用时准备交给会计或税务专业人士的复核包。",
      primary: "户部 · 建立预算与现金账", consequence: "只生成本地演示资料模板，不读取账户、不报税、不付款。",
      secondary: ["现金流", "项目与生活预算", "税务资料与复核"],
      abilities: [{ label: "返回财富驾驶舱", page: "H01" }, { label: "查看风险护城河", page: "H03" }, { label: "交丞相协调预算", page: "A02" }],
      leftTitle: "账目与凭证", leftItems: [I("收入与支出", "真实账目未接入", "待接", "账"), I("项目预算", "需与军机处任务对应", "待连", "项"), I("税务资料", "地区与凭证待确认", "待补", "税")],
      rightTitle: "取舍与复核", rightSummary: "次级页展示全账，主推荐只告诉用户今天最需要确认的一个预算取舍。", rightItems: [I("现金影响", "必须基于真实账目", "待算", "现"), I("预算优先级", "与用户计划和结果绑定", "待排", "序"), I("专业复核", "不替代会计和税务意见", "说明", "人")]
    }),

    P("I01", "翰林进化", "翰林院 · 今日进化", "hanlinyuan-final-v2.png", {
      level: "次级页面", subtitle: "今天只推荐一项最能支持真实目标的学习，并交付一个可以带走的作品。", agent: "翰林学士", phase: "今日一课",
      outcome: "一个本质概念、一个练习和一个可复用成果",
      proofTitle: "完成作品后，才证明你真的会了",
      proofDetail: "当前尚无作品、任务测评或同群体样本，因此不显示“前1%”等排名；完成作品并通过统一量表后再生成可核验对标。",
      benchmark: { cohort: "待选择：同岗位 / 同学习阶段 / 同任务类型", sample: "尚无有效样本", rubric: "待冻结：真实任务完成度、质量、独立完成能力", artifact: "尚无作品证据", measuredAt: "尚未测评" },
      verdict: "先学会当前任务最需要的一项能力，不追逐与目标无关的新工具。", situation: "用户目标、可用时间和能力证据尚未确认", impact: "同时学习太多内容会延迟真实结果", action: "选择今天想完成的一个结果",
      canDo: "从锦衣卫核验资料中选一份最合适的内容，用浅显解释、示例、练习、作品和复盘形成完整一课。",
      primary: "翰林学士 · 生成今日一课", consequence: "只生成本地演示课程结构，不订阅、购买或调用外部课程。",
      secondary: ["为什么推荐这课", "调整难度与时间", "先看相似案例"],
      abilities: [{ label: "进入个人御学堂", page: "I02" }, { label: "查看前沿校书阁", page: "I03" }, { label: "Skill与Agent选贤", page: "I04" }],
      leftTitle: "今日学习输入", leftItems: [I("真实目标", "等待用户用一句话确认", "待问", "目"), I("当前水平", "只询问最多两项关键未知", "待问", "学"), I("可用时间", "由用户决定，不伪造日程", "待定", "时")],
      rightTitle: "推荐结果", rightSummary: "用户只需决定是否开始，知识路径与练习由翰林学士准备。", rightItems: [I("本质概念", "用小白能懂的话解释", "待生", "理"), I("真实练习", "与当前任务直接相关", "待生", "练"), I("可带走成果", "模板、作品或可复用方法", "待生", "果")],
      benefits: [I("快速理解一个本质", "不先堆术语，用真实问题解释", "开始", "理"), I("马上做一次练习", "在完成任务的同时学习", "待生", "练"), I("得到一个作品", "用成果证明掌握，而不是阅读进度", "待生", "作")],
      watch: [I("是否与目标有关", "无关内容不会进入今日推荐", "首要", "关"), I("资料是否可靠", "等待锦衣卫来源护照", "待接", "证"), I("是否形成作品", "作品完成后才进入史馆复盘", "标准", "作")],
      newsTitle: "今日前沿资料尚未接入", newsDetail: "没有真实资料时只展示课程结构，不伪造热门内容或更新状态。"
    }),
    P("I02", "翰林进化", "御学堂 · 个人学习系统", "hanlinyuan-final-v2.png", {
      level: "次级页面", subtitle: "把目标、知识、练习、项目、作品和复盘连成一条个人能力成长路径。", agent: "翰林学士", phase: "学习路径",
      outcome: "一条以作品和真实能力为证据的个人学习路径",
      proofTitle: "能力提升以真实作品和复测为准",
      proofDetail: "系统会告诉你会做了什么、在哪个标准上进步；只有样本、量表和作品齐全时，才显示相对位置与区间。",
      benchmark: { cohort: "待确认对标人群", sample: "尚无有效样本", rubric: "作品质量、迁移能力、独立完成度、复测稳定性", artifact: "等待目标作品", measuredAt: "尚未测评" },
      verdict: "学习完成的标准不是看完，而是用户完成一件过去做不到的事。", situation: "能力目标和作品证据尚未建立", impact: "只记录阅读时长会产生虚假进度", action: "确定一个能力目标和一件目标作品",
      canDo: "诊断起点、选择资料、安排检索练习、项目应用和讲回测试；结果回填史馆。",
      primary: "御学堂 · 建立个人学习路径", consequence: "生成本地演示学习草案，不注册课程或向外部平台提交资料。",
      secondary: ["能力地图", "练习与项目", "作品和复盘"],
      abilities: [{ label: "返回今日进化", page: "I01" }, { label: "打开前沿校书阁", page: "I03" }, { label: "进入真实项目", page: "A03" }],
      leftTitle: "目标与路径", leftItems: [I("能力目标", "由用户结果反推", "待定", "能"), I("知识路径", "只保留必要前置", "待生", "路"), I("练习计划", "短练习连接真实项目", "待生", "练")],
      rightTitle: "掌握证据", rightSummary: "次级页展示完整路径，但先推荐下一件最值得完成的作品。", rightItems: [I("目标作品", "等待用户确认", "待定", "作"), I("真实应用", "连接军机处任务", "可连", "用"), I("复盘证据", "结果与反馈进入史馆", "待后", "史")]
    }),
    P("I03", "翰林进化", "校书阁 · 前沿知识与资料", "hanlinyuan-final-v2.png", {
      level: "三级页面", subtitle: "集中展示经过核验的官方文档、GitHub、论文、视频、报告、案例和反方意见。", agent: "翰林学士", phase: "资料深读",
      outcome: "一套有来源、有难度、有适用范围和阅读顺序的知识资料包",
      verdict: "GitHub、B站、YouTube 与官方来源尚未接入；当前不推荐虚假热门项目。", situation: "来源 Provider 与用户学习主题均为空", impact: "未经筛选的资料越多，用户越难形成能力", action: "确认学习主题和希望解决的问题",
      canDo: "接收锦衣卫来源护照，按可信度、鲜度、难度、适用范围和用户目标整理资料；不负责系统安装。",
      primary: "校书阁 · 建立资料检索范围", consequence: "只保存本地演示范围，不访问账号、不订阅频道或下载仓库。",
      secondary: ["官方与论文", "GitHub与工具", "B站与YouTube视频"],
      abilities: [{ label: "返回御学堂", page: "I02" }, { label: "查看选贤台", page: "I04" }, { label: "查看锦衣卫证据", page: "F04" }],
      leftTitle: "资料全景", leftItems: [I("官方文档", "优先作为能力事实源", "待接", "官"), I("代码与论文", "许可证和版本必须可追", "待接", "研"), I("视频与案例", "区分演示、观点与事实", "待接", "影")],
      rightTitle: "推荐先看", rightSummary: "三级页可以全面，但翰林学士必须标出最值得先看的章节和原因。", rightItems: [I("适合水平", "根据作品证据判断", "待接", "级"), I("是否过时", "显示真实更新时间与版本", "待接", "时"), I("阅读顺序", "先本质、再示例、后实践", "待生", "序")],
      newsTitle: "前沿资料源尚未接入", newsDetail: "正式版每条资料显示来源、版本、许可、适用对象、过时风险和推荐章节。"
    }),
    P("I04", "翰林进化", "选贤台 · Skill与Agent候选", "hanlinyuan-final-v2.png", {
      level: "次级页面", subtitle: "发现并比较更好的 Skills 与 Agents，但候选绝不等于安装或正式任用。", agent: "翰林学士", phase: "能力选拔",
      outcome: "一份包含价值、来源、适用任务、权限、成本、风险和反对理由的候选护照",
      verdict: "当前没有真实候选来源与评测结果，不展示伪造排名或推荐。", situation: "候选、许可证、维护状态和能力证据均为空", impact: "追逐新工具会增加供应链、成本和重复能力", action: "选择要补齐的一个系统能力缺口",
      canDo: "锦衣卫发现候选，翰林院评估知识与能力价值，吏部负责登记任用；高影响候选必须进入工部演武场和御史复核。",
      primary: "选贤台 · 建立候选评测题", consequence: "只生成本地演示评测合同，不克隆、安装、加载或执行候选代码。",
      secondary: ["Skill候选", "Agent候选", "现有能力对照"],
      abilities: [{ label: "进入演武场", page: "I05" }, { label: "查看进化奏请", page: "I06" }, { label: "查看前沿资料", page: "I03" }],
      leftTitle: "候选护照", leftItems: [I("来源与维护者", "等待锦衣卫核验", "待接", "源"), I("能力与适用任务", "需要固定样例证明", "待评", "能"), I("许可与权限", "陌生权限默认拒绝", "锁定", "权")],
      rightTitle: "推荐与反方", rightSummary: "只推荐最值得测试的一项，同时展示它为什么可能不值得使用。", rightItems: [I("相对价值", "必须与现有能力对照", "待评", "比"), I("最强反对理由", "不能折叠隐藏", "必看", "反"), I("下一道门", "沙箱、复核、批准", "锁定", "门")]
    }),
    P("I05", "翰林进化", "演武场 · 能力沙箱评测", "gongbu-delivery-final-v2.png", {
      level: "三级页面", subtitle: "让新旧能力在同一批真实任务上赛马，胜出后仍需复核和批准。", agent: "工部尚书", phase: "隔离评测",
      outcome: "质量、速度、成本、权限、失败、回退和适用范围的对照报告",
      verdict: "没有候选包、沙箱或基线任务，当前不会显示虚假通过状态。", situation: "候选能力与评测环境均未接入", impact: "未经隔离运行可能损害数据、系统和用户信任", action: "从选贤台选择一个候选并冻结测试合同",
      canDo: "在隔离环境执行固定任务，记录工具调用、权限、网络、写入、成本、失败和回退；御史台保持独立审查。",
      primary: "工部 · 预览沙箱评测合同", consequence: "只展示本地演示合同，不执行候选代码、联网、写文件或消耗真实算筹。",
      secondary: ["测试任务", "新旧能力对照", "权限与回退日志"],
      abilities: [{ label: "返回选贤台", page: "I04" }, { label: "进入进化殿", page: "I06" }, { label: "查看御史审计", page: "D02" }],
      leftTitle: "评测合同", leftItems: [I("固定任务", "覆盖成功与失败场景", "待冻", "题"), I("现有基线", "使用同一输入和验收", "待接", "基"), I("候选环境", "权限最小、可销毁", "隔离", "箱")],
      rightTitle: "真实证据", rightSummary: "三级页完整展示参数和日志，小白只看到是否值得进入小范围试用。", rightItems: [I("质量与稳定", "没有测试就没有结论", "待测", "质"), I("成本与速度", "真实运行后才显示", "待测", "筹"), I("失败与回退", "必须在启用前证明", "必测", "退")]
    }),
    P("I06", "翰林进化", "进化殿 · 朝堂升级奏请", "capability-directory-final-v1.png", {
      level: "次级页面", subtitle: "把分散候选压缩成一份用户看得懂、可试用、可拒绝、可回退的升级奏请。", agent: "丞相", phase: "升级裁决",
      outcome: "本期最值得试用的一项能力、价值、风险、权限、成本和回退计划",
      verdict: "当前没有完成评测和复核的候选，因此没有可批准的升级奏请。", situation: "来源、沙箱、御史复核与吏部登记均未完成", impact: "长期未处理不能视为同意，陌生能力不得自动启用", action: "等待一项候选完成全部审查门",
      canDo: "丞相可以代筛选、去重、归档和整理月报，但正式安装、授权和启用仍由用户批准；严重风险可按预授权策略先隔离。",
      primary: "丞相 · 查看本期进化摘要", consequence: "只打开本地演示摘要；当前没有真实候选，也不会安装、升级或删除任何能力。",
      secondary: ["建议试用", "暂不处理", "要求重新评测"],
      abilities: [{ label: "返回选贤台", page: "I04" }, { label: "查看演武场", page: "I05" }, { label: "查看能力目录", page: "D05" }],
      leftTitle: "升级奏请", leftItems: [I("建议新增", "尚无通过评测候选", "空白", "新"), I("建议替换", "必须证明相对现有能力更好", "空白", "换"), I("建议淘汰", "只提议，不自动删除", "空白", "汰")],
      rightTitle: "用户控制", rightSummary: "只让用户裁决一项最有价值的升级，其他候选自动归档等待。", rightItems: [I("安装与权限", "必须预览并明确批准", "锁定", "权"), I("小范围试用", "先灰度、后观察", "待批", "试"), I("史馆回测", "用真实结果决定保留或回退", "待后", "史")],
      benefits: [I("知道为什么要升级", "价值、风险和替代关系说清楚", "看摘要", "理"), I("只决定一件事", "本期只推荐最有价值的一项", "待裁", "一"), I("随时可以回退", "试用、观察、保留和回退都有记录", "安全", "退")],
      watch: [I("是否完成来源核验", "没有护照不能进入奏请", "门一", "证"), I("是否通过沙箱与复核", "没有对照测试不能启用", "门二", "测"), I("是否获得用户批准", "沉默不是同意", "门三", "权")]
    }),

    P("J01", "吏部工作台", "吏部 · 组织驾驶舱", "libu-personnel-final-v2.png", {
      level: "次级页面", parentPage: "B01", subtitle: "全面看清人类员工、Agent员工、能力缺口和今天唯一需要调整的责任。", agent: "吏部尚书", phase: "组织全景",
      outcome: "一张人机分账、主责唯一、权限清楚的组织图", verdict: "先补一个会影响当前项目的责任缺口，不进行大规模改编。", situation: "人类与Agent名册尚未接入", impact: "混合身份会让责任、成本和授权失真", action: "确认当前任务的唯一主责",
      canDo: "分开维护人籍与机籍，再为同一任务形成最小临时合编。", primary: "吏部尚书 · 形成组织诊断", consequence: "只生成本地组织诊断，不任免人员或启停Agent。",
      abilities: [{ label: "查看人类员工册", page: "J02" }, { label: "查看Agent员工册", page: "J03" }, { label: "责任与权限台", page: "J04" }],
      leftTitle: "人籍与机籍", leftItems: [I("人类员工", "职责、关系和人工审核单独呈现", "待接", "人"), I("Agent员工", "能力、算筹和权限单独呈现", "待接", "机"), I("临时合编", "同一任务才建立", "待命", "编")],
      rightTitle: "今日组织建议", rightSummary: "只把一个最影响结果的责任缺口推给用户。", rightItems: [I("唯一主责", "等待任务目标", "待定", "主"), I("能力缺口", "需要固定任务验证", "待评", "缺"), I("现实任免", "必须人工确认", "锁定", "权")]
    }),
    P("J02", "吏部工作台", "人事司 · 人类员工册", "libu-personnel-final-v2.png", {
      level: "次级页面", parentPage: "J01", subtitle: "只管理真实人类员工的岗位、关系、责任、审核和发展，不与Agent成本混账。", agent: "吏部尚书", phase: "人籍管理",
      outcome: "一份岗位、责任、协作与人工审核边界清单", verdict: "先确认岗位对结果负责什么，再讨论人员调整。", situation: "真实员工资料尚未授权", impact: "先看人名会放大偏见并掩盖岗位问题", action: "冻结一个岗位的结果责任",
      canDo: "整理岗位、职责、交接、发展和必须由人承担的审核门。", primary: "吏部尚书 · 建立人籍责任卡", consequence: "只生成演示责任卡，不评价、招聘、解雇或调整薪酬。",
      abilities: [{ label: "返回组织驾驶舱", page: "J01" }, { label: "对照Agent员工册", page: "J03" }, { label: "查看责任权限", page: "J04" }],
      leftTitle: "岗位与关系", leftItems: [I("岗位结果", "等待真实组织范围", "待补", "岗"), I("协作关系", "不从通讯频率推断", "未知", "协"), I("发展计划", "必须与本人确认", "锁定", "育")],
      rightTitle: "人工边界", rightSummary: "人工审核不是副将，而是明确的责任门。", rightItems: [I("必须人工判断", "法律、伦理和现实授权", "保留", "人"), I("可由Agent辅助", "整理、比较和起草", "建议", "助"), I("员工隐私", "最小读取、可撤销", "锁定", "私")]
    }),
    P("J03", "吏部工作台", "机籍司 · Agent员工册", "baishi-swarm-final-v2.png", {
      level: "次级页面", parentPage: "J01", subtitle: "查看Agent的能力、适用任务、算筹、权限、版本和失败边界。", agent: "吏部尚书", phase: "机籍管理",
      outcome: "一份可验证、可停用、可替换的Agent机籍", verdict: "没有固定任务证据的Agent只能列为候选，不能正式任用。", situation: "真实能力注册表尚未接入", impact: "只凭名称和宣传任用会造成重复能力与权限风险", action: "选择一个能力缺口建立评测试题",
      canDo: "登记Agent身份、能力、版本、算筹、权限、依赖、失败与回退。", primary: "吏部尚书 · 建立Agent评测卡", consequence: "只生成演示评测卡，不安装、启用或调用Agent。",
      abilities: [{ label: "进入选贤台", page: "I04" }, { label: "进入演武场", page: "I05" }, { label: "查看责任权限", page: "J04" }],
      leftTitle: "机籍事实", leftItems: [I("能力契约", "输入、输出和适用任务", "待接", "能"), I("版本与维护", "真实注册表未接入", "待接", "版"), I("算筹与权限", "任务前必须预览", "锁定", "筹")],
      rightTitle: "任用建议", rightSummary: "能力储备可以很多，当前任务只推荐最小编队。", rightItems: [I("主责Agent", "依据固定任务证据", "待评", "主"), I("协作Agent", "只有必要时加入", "待命", "协"), I("停用与回退", "必须保留旧版本", "预留", "退")]
    }),
    P("J04", "吏部工作台", "吏部 · 能力责任与权限台", "libu-personnel-final-v2.png", {
      level: "三级页面", parentPage: "J03", subtitle: "为极客展示RACI、能力Schema、权限范围、算筹上限、版本和审计日志。", agent: "吏部尚书", phase: "专业控制",
      outcome: "一份可审计的人机责任矩阵与最小权限草案", verdict: "任何Agent都不能同时拥有无限读取、外部写入和自我批准。", situation: "权限事实源与组织目录尚未连接", impact: "隐性权限会破坏问责和回退", action: "审查一个角色的最小权限",
      canDo: "展示RACI、Schema、Provider、版本、成本、日志和撤销路径。", primary: "吏部尚书 · 预览权限矩阵", consequence: "只生成预览，不授予、撤销或修改任何现实权限。",
      abilities: [{ label: "返回组织驾驶舱", page: "J01" }, { label: "查看Agent机籍", page: "J03" }, { label: "交御史台审计", page: "D02" }],
      leftTitle: "责任矩阵", leftItems: [I("Accountable", "唯一结果责任人", "待定", "责"), I("Responsible", "实际承办者", "待定", "办"), I("Consulted/Informed", "最小知情范围", "待定", "知")],
      rightTitle: "权限与日志", rightSummary: "三级页允许复杂，但默认只推荐一项风险最高的权限。", rightItems: [I("读取范围", "按材料与时限授权", "待配", "读"), I("写入范围", "默认关闭", "锁定", "写"), I("审计与撤销", "每次变化必须留痕", "必备", "审")]
    }),

    P("K01", "礼部工作台", "礼部 · 品牌天气台", "libu-marketing-final-v2.png", {
      level: "次级页面", parentPage: "B03", subtitle: "把趋势、受众反应、品牌一致性和传播风险压缩成今天最值得调整的一件事。", agent: "礼部尚书", phase: "品牌判断",
      outcome: "一份品牌天气、推荐动作和失效条件", verdict: "没有真实品牌资产和渠道数据时，不宣称品牌正在变好或变坏。", situation: "品牌规范、受众与渠道数据尚未接入", impact: "追逐热点会破坏长期一致性", action: "确认本次对外表达的唯一目标",
      canDo: "结合锦衣卫趋势事实，形成品牌、商务与传播建议。", primary: "礼部尚书 · 形成品牌天气", consequence: "只生成演示判断，不发布内容或改动品牌资产。",
      abilities: [{ label: "生成营销成果包", page: "K02" }, { label: "进入图像视频工坊", page: "K03" }, { label: "查看发布标准", page: "K04" }],
      leftTitle: "品牌信号", leftItems: [I("受众变化", "真实调研尚未接入", "待接", "众"), I("流行要素", "需锦衣卫来源核验", "待核", "潮"), I("品牌一致性", "资产和规范待接", "待接", "牌")],
      rightTitle: "今日礼部建议", rightSummary: "先确定一个表达目标，再选择内容形式。", rightItems: [I("推荐主张", "等待业务目标", "待定", "言"), I("渠道取舍", "按受众与任务选择", "待定", "渠"), I("发布风险", "事实、版权与承诺", "必审", "险")]
    }),
    P("K02", "礼部工作台", "礼部 · 营销成果包", "libu-marketing-final-v2.png", {
      level: "次级页面", parentPage: "K01", subtitle: "把受众、主张、文案、图片、视频、渠道和审核收进同一个可下载成果包。", agent: "礼部尚书", phase: "成果编排",
      outcome: "一份可预览、可审核、可下载的整合营销成果包", verdict: "先让所有素材服务同一个商业目标，再考虑数量和形式。", situation: "活动目标、产品事实和品牌规范尚未确认", impact: "素材分散会造成口径冲突和审阅成本", action: "冻结活动目标与唯一核心主张",
      canDo: "组织文案、图像、视频、落地页、渠道适配、事实核验和发布清单。", primary: "礼部尚书 · 生成成果包结构", consequence: "只生成本地结构，不调用生成模型或发布渠道。",
      abilities: [{ label: "进入图像视频工坊", page: "K03" }, { label: "检查发布标准", page: "K04" }, { label: "查看锦衣卫趋势", page: "F02" }],
      leftTitle: "成果组成", leftItems: [I("受众与主张", "等待确认", "待定", "众"), I("文案与视觉", "候选尚未生成", "待生", "创"), I("渠道适配", "真实渠道未连接", "待接", "渠")],
      rightTitle: "审核与带走", rightSummary: "用户首先看到最终效果和一处需确认问题。", rightItems: [I("事实核验", "主张需有证据", "待核", "证"), I("品牌审核", "规范与口径一致", "待审", "牌"), I("下载/发布", "下载可用，发布需另行确认", "锁定", "发")]
    }),
    P("K03", "礼部工作台", "礼部 · 图像视频工坊", "entertainment-final-v2.png", {
      level: "次级页面", parentPage: "K01", subtitle: "从商业目标反推脚本、分镜、图像和视频候选，不把生成本身当结果。", agent: "礼部尚书", phase: "媒体创作",
      outcome: "一套可比较的脚本、分镜、图像与视频制作方案", verdict: "先确认受众看完要做什么，再选择图像或视频。", situation: "创作目标、素材权利和生成服务尚未接入", impact: "先生成再找用途会浪费算筹并增加版权风险", action: "确认一个传播目标和一个输出规格",
      canDo: "形成创意方向、脚本、分镜、提示词、生成计划、版本比较和人工审阅。", primary: "礼部尚书 · 生成创作简报", consequence: "只生成演示简报，不调用图像或视频模型。",
      abilities: [{ label: "回到营销成果包", page: "K02" }, { label: "检查发布标准", page: "K04" }, { label: "娱乐创作工作室", page: "O03" }],
      leftTitle: "创作输入", leftItems: [I("目标与受众", "等待用户确认", "待定", "目"), I("参考与素材", "权利状态待核", "待核", "材"), I("规格与算筹", "生成前必须预览", "待算", "规")],
      rightTitle: "候选与审阅", rightSummary: "每轮最多三种视觉方向，只保留一个推荐。", rightItems: [I("脚本与分镜", "尚未生成", "待生", "镜"), I("候选画面", "尚未调用模型", "空白", "图"), I("人工审核", "人物、品牌、事实与版权", "必需", "审")]
    }),
    P("K04", "礼部工作台", "礼部 · 对外发布标准台", "libu-marketing-final-v2.png", {
      level: "三级页面", parentPage: "K02", subtitle: "集中查看事实、版权、品牌、渠道、商务承诺、版本和发布权限。", agent: "礼部尚书", phase: "发布控制",
      outcome: "一份允许、需确认、禁止三段式发布检查表", verdict: "没有完成事实、权利和承诺审核的内容不得进入发布确认。", situation: "真实素材、渠道和授权记录尚未接入", impact: "一次错误发布可能造成品牌、法律和商务损失", action: "审查一项最高风险的发布条件",
      canDo: "展示渠道规格、品牌Token、版权来源、事实主张、审批人、版本和撤回预案。", primary: "礼部尚书 · 预览发布检查", consequence: "只生成检查预览，不上传、发布、发送或删除内容。",
      abilities: [{ label: "返回营销成果包", page: "K02" }, { label: "交刑部复核", page: "M01" }, { label: "查看御史审计", page: "D02" }],
      leftTitle: "内容合格门", leftItems: [I("事实主张", "需要来源引用", "待核", "实"), I("版权与肖像", "需要权利证明", "待核", "权"), I("品牌与渠道", "规范和规格待接", "待接", "规")],
      rightTitle: "发布控制", rightSummary: "三级细节不替代用户最终确认。", rightItems: [I("允许", "低风险且审核完成", "待判", "允"), I("需要确认", "承诺、成本或外部发送", "锁定", "确"), I("禁止", "缺证、侵权或越权", "阻断", "禁")]
    }),

    P("L01", "兵部工作台", "兵部 · 客户战图", "bingbu-sales-final-v2.png", {
      level: "次级页面", parentPage: "B04", subtitle: "把客户、渠道、竞争、关系阶段和机会窗口放在同一张攻坚地图上。", agent: "兵部尚书", phase: "增长全景",
      outcome: "一张客户优先级、机会窗口和唯一下一动作战图", verdict: "今天只攻一个最可能推进且证据较完整的目标。", situation: "CRM、渠道和竞争事实尚未接入", impact: "同时追逐所有线索会稀释成交动作", action: "确认本周唯一攻坚目标",
      canDo: "汇总线索、客户、渠道、报价和竞争事实，推荐一个下一销售动作。", primary: "兵部尚书 · 形成客户战图", consequence: "只生成演示战图，不联系客户或写入CRM。",
      abilities: [{ label: "查看下一销售动作", page: "L02" }, { label: "查看渠道与报价", page: "L03" }, { label: "查看战情证据", page: "L04" }],
      leftTitle: "客户战场", leftItems: [I("重点客户", "真实线索尚未接入", "待接", "客"), I("渠道位置", "投入与冲突待确认", "待接", "渠"), I("竞争事实", "需锦衣卫核验", "待核", "竞")],
      rightTitle: "今日攻坚", rightSummary: "只推荐一个最可能改变结果的动作。", rightItems: [I("优先目标", "等待事实排序", "待定", "标"), I("下一动作", "会议、材料或报价三选一", "待选", "行"), I("停止条件", "避免无效追逐", "待定", "止")]
    }),
    P("L02", "兵部工作台", "兵部 · 下一销售动作", "bingbu-sales-final-v2.png", {
      level: "次级页面", parentPage: "L01", subtitle: "根据客户阶段只推荐下一步，不把完整销售流程同时压给用户。", agent: "兵部尚书", phase: "单步攻坚",
      outcome: "一个带目标、对象、材料、话术和完成标准的销售动作", verdict: "下一步应该减少客户的不确定，而不是重复介绍产品。", situation: "客户真实问题与决策链尚未核验", impact: "错误动作会降低信任并浪费窗口", action: "确认客户当前最关键的未知",
      canDo: "准备会议问题、跟进材料、方案对照、报价预览和下一检查点。", primary: "兵部尚书 · 生成下一动作", consequence: "只生成动作草案，不发送邮件、消息或报价。",
      abilities: [{ label: "返回客户战图", page: "L01" }, { label: "准备渠道与报价", page: "L03" }, { label: "检查证据", page: "L04" }],
      leftTitle: "客户当前阶段", leftItems: [I("真实需求", "尚未获得客户证据", "待核", "需"), I("决策角色", "不从职位自动推断", "未知", "角"), I("上次承诺", "真实记录未接入", "待接", "诺")],
      rightTitle: "下一步建议", rightSummary: "一个动作、一个完成标准、一个停止条件。", rightItems: [I("动作目标", "减少一个关键未知", "推荐", "目"), I("所需材料", "只带必要内容", "待备", "料"), I("完成标准", "客户确认下一检查点", "待定", "验")]
    }),
    P("L03", "兵部工作台", "兵部 · 渠道与报价台", "bingbu-sales-final-v2.png", {
      level: "次级页面", parentPage: "L01", subtitle: "同时看清渠道投入、冲突、报价依据、谈判边界和发送前确认。", agent: "兵部尚书", phase: "商务方案",
      outcome: "一份渠道选择与报价边界草案", verdict: "报价之前先确认价值依据、成本底线和对外承诺。", situation: "成本、客户价值和渠道条款尚未接入", impact: "无依据报价会损害利润与长期关系", action: "确认报价目标和不可突破的边界",
      canDo: "比较渠道、形成报价逻辑、谈判选项、审批链和发送预览。", primary: "兵部尚书 · 形成报价草案", consequence: "只生成草案，不发送报价、签约或改变价格。",
      abilities: [{ label: "返回客户战图", page: "L01" }, { label: "交户部核算", page: "H04" }, { label: "交刑部审约", page: "M02" }],
      leftTitle: "渠道与成本", leftItems: [I("渠道投入", "真实成本尚未接入", "待接", "投"), I("渠道冲突", "区域与客户规则待核", "待核", "冲"), I("成本底线", "需户部真实账目", "待算", "底")],
      rightTitle: "报价与谈判", rightSummary: "发送以前必须显示价格、承诺和有效期。", rightItems: [I("价值依据", "等待客户事实", "待补", "值"), I("谈判选项", "最多三项可比较", "待生", "策"), I("发送确认", "外部动作保持锁定", "锁定", "发")]
    }),
    P("L04", "兵部工作台", "兵部 · 战情证据与实验日志", "bingbu-sales-final-v2.png", {
      level: "三级页面", parentPage: "L02", subtitle: "为极客展示线索来源、阶段变化、实验指标、停止条件、版本和CRM写入预览。", agent: "兵部尚书", phase: "增长证据",
      outcome: "一份可追溯的增长实验和客户事实日志", verdict: "没有真实事件、样本和指标定义时，不显示转化率或预测成交。", situation: "线索与CRM事件源尚未接入", impact: "虚假漏斗会驱动错误投入", action: "冻结一个增长实验的证据合同",
      canDo: "展示来源、事件、指标、样本、版本、成本、权限和回滚。", primary: "兵部尚书 · 预览实验合同", consequence: "只生成预览，不创建广告、写入CRM或联系客户。",
      abilities: [{ label: "返回下一销售动作", page: "L02" }, { label: "查看锦衣卫来源", page: "F04" }, { label: "交史馆复盘", page: "A06" }],
      leftTitle: "事件与指标", leftItems: [I("线索来源", "真实来源未接入", "待接", "源"), I("阶段事件", "必须由真实动作产生", "空白", "事"), I("指标量表", "样本与口径待冻结", "待定", "尺")],
      rightTitle: "实验与权限", rightSummary: "三级页展示全量日志，首要风险仍只推荐一项。", rightItems: [I("停止条件", "避免无限追加投入", "必填", "止"), I("CRM写入", "默认预览、用户确认", "锁定", "写"), I("复盘版本", "结果追加，不覆盖", "预留", "史")]
    }),

    P("M01", "刑部工作台", "刑部 · 风险红线台", "xingbu-legal-final-v2.png", {
      level: "次级页面", parentPage: "B05", subtitle: "把合同、合规、知识产权和不可逆风险压缩成允许、需确认、禁止。", agent: "刑部尚书", phase: "风险总览",
      outcome: "一份三段式风险结论和最小整改建议", verdict: "先阻断一项可能不可逆的风险，再讨论如何继续。", situation: "真实合同、地区和规则尚未接入", impact: "缺少适用范围时给确定结论会误导用户", action: "选择一份材料并确认司法辖区",
      canDo: "识别风险、说明理由、给修改建议和必须由专业人士复核的边界。", primary: "刑部尚书 · 形成风险红线", consequence: "只生成演示意见，不构成法律意见或签署授权。",
      abilities: [{ label: "进入合同对照", page: "M02" }, { label: "查看规则与证据", page: "M03" }, { label: "交门下省再审", page: "D01" }],
      leftTitle: "风险来源", leftItems: [I("合同条款", "真实文件尚未提供", "待接", "约"), I("适用规则", "地区与事项待确认", "待定", "法"), I("权利来源", "版权与许可待核", "待核", "权")],
      rightTitle: "三段结论", rightSummary: "主页面不堆法条，只告诉用户能否继续和为什么。", rightItems: [I("允许", "低风险且证据完整", "待判", "允"), I("需要确认", "高影响或专业复核", "锁定", "确"), I("禁止", "违法、越权或缺证", "阻断", "禁")]
    }),
    P("M02", "刑部工作台", "合同司 · 修改前后对照", "xingbu-legal-final-v2.png", {
      level: "次级页面", parentPage: "M01", subtitle: "逐条显示原文、风险、修改建议、影响、替代措辞和必须人工确认的事项。", agent: "刑部尚书", phase: "合同审阅",
      outcome: "一份可审阅的合同修改前后对照稿", verdict: "最先处理会改变责任、付款、数据或退出条件的条款。", situation: "尚未提供真实合同和交易背景", impact: "孤立修改条款可能破坏整体交易安排", action: "选择一份合同并说明交易目标",
      canDo: "标记风险、生成对照、说明取舍、列证据缺口和专业复核问题。", primary: "合同司 · 建立对照稿", consequence: "只生成演示对照，不修改原文件、发送或签署。",
      abilities: [{ label: "返回风险红线", page: "M01" }, { label: "查看规则证据", page: "M03" }, { label: "交礼部检查承诺", page: "K04" }],
      leftTitle: "原文与背景", leftItems: [I("合同版本", "真实文件未提供", "空白", "原"), I("交易目标", "需用户说明", "待补", "目"), I("关键附件", "清单尚未建立", "待补", "附")],
      rightTitle: "修改与确认", rightSummary: "只先推荐修改风险最高的一条。", rightItems: [I("建议文本", "等待上下文", "待生", "改"), I("影响说明", "责任、费用和退出", "待评", "影"), I("人工复核", "必要时明确说明", "保留", "人")]
    }),
    P("M03", "刑部工作台", "刑部 · 规则证据与审批矩阵", "xingbu-legal-final-v2.png", {
      level: "三级页面", parentPage: "M02", subtitle: "展示适用规则、原文来源、版本、证据、例外、审批、权限和审计记录。", agent: "刑部尚书", phase: "专业控制",
      outcome: "一份规则证据链、例外条件和审批矩阵", verdict: "规则来源、适用范围或版本不明时，结论必须保持不确定。", situation: "真实法规与企业制度源尚未连接", impact: "过期规则或错误辖区会造成严重误判", action: "确认规则主题、地区和有效日期",
      canDo: "维护规则原文、版本、适用范围、证据引用、例外、审批和更正。", primary: "刑部尚书 · 预览规则矩阵", consequence: "只展示字段，不拉取付费数据库或形成正式法律结论。",
      abilities: [{ label: "返回合同对照", page: "M02" }, { label: "查看锦衣卫证据", page: "F04" }, { label: "交御史台审计", page: "D02" }],
      leftTitle: "规则与证据", leftItems: [I("原文来源", "权威来源尚未接入", "待接", "源"), I("版本有效期", "真实日期不可伪造", "未知", "时"), I("适用范围", "地区与事项待确认", "待定", "域")],
      rightTitle: "例外与审批", rightSummary: "复杂参数只在三级页出现，用户仍只决定是否继续。", rightItems: [I("例外条件", "必须有依据和到期日", "待配", "例"), I("审批矩阵", "高影响动作双重确认", "锁定", "审"), I("更正日志", "旧结论只读保留", "预留", "版")]
    }),

    P("N01", "工部工作台", "工部 · 交付驾驶舱", "gongbu-delivery-final-v2.png", {
      level: "次级页面", parentPage: "B06", subtitle: "把需求、依赖、里程碑、质量、回退和最终验收放在同一个交付视图。", agent: "工部尚书", phase: "交付全景",
      outcome: "一份可验证、可回退、可验收的交付计划", verdict: "今天先冻结最小验收成果，不扩大功能范围。", situation: "真实仓库、任务和测试事件尚未接入", impact: "没有验收定义会把忙碌误认为完成", action: "确认最小可验收成果",
      canDo: "把方案变成范围、依赖、里程碑、测试、质量门、回退和交付包。", primary: "工部尚书 · 形成交付驾驶舱", consequence: "只生成演示计划，不改代码、运行部署或写入项目系统。",
      abilities: [{ label: "查看里程碑证据", page: "N02" }, { label: "进入工程控制台", page: "N03" }, { label: "交军机处管理", page: "A03" }],
      leftTitle: "需求与依赖", leftItems: [I("用户问题", "等待真实需求", "待补", "问"), I("范围边界", "非目标必须明确", "待定", "界"), I("关键依赖", "真实系统未连接", "待接", "依")],
      rightTitle: "质量与交付", rightSummary: "先展示最终可验收成果和一个当前阻塞。", rightItems: [I("验收成果", "等待冻结", "待定", "果"), I("当前阻塞", "必须来自真实事件", "无", "阻"), I("失败回退", "发布前必须验证", "预留", "退")]
    }),
    P("N02", "工部工作台", "工部 · 里程碑证据链", "gongbu-delivery-final-v2.png", {
      level: "次级页面", parentPage: "N01", subtitle: "每个里程碑同时展示目标、真实事件、产物、测试、验收人和下一责任人。", agent: "工部尚书", phase: "里程碑验证",
      outcome: "一条从需求到验收的里程碑证据链", verdict: "没有产物和验收证据的里程碑不能标记完成。", situation: "真实任务事件与产物尚未接入", impact: "伪进度会让项目在错误时机进入下一阶段", action: "选择一个里程碑冻结完成定义",
      canDo: "串联任务事件、版本、产物、测试、缺陷、验收和下一责任人。", primary: "工部尚书 · 建立证据链", consequence: "只建立演示结构，不伪造进度、测试或完成状态。",
      abilities: [{ label: "返回交付驾驶舱", page: "N01" }, { label: "查看工程控制台", page: "N03" }, { label: "交史馆复盘", page: "A06" }],
      leftTitle: "里程碑事实", leftItems: [I("完成定义", "等待用户冻结", "待定", "标"), I("真实事件", "尚未接入", "空白", "事"), I("产物版本", "必须可访问和可追踪", "待接", "版")],
      rightTitle: "验证与责任", rightSummary: "每次只突出一个缺失的验收证据。", rightItems: [I("测试证据", "未运行不显示通过", "空白", "测"), I("验收人", "必须明确身份", "待定", "验"), I("下一责任人", "验收后才切换", "锁定", "责")]
    }),
    P("N03", "工部工作台", "工部 · 工程质量与回退台", "gongbu-delivery-final-v2.png", {
      level: "三级页面", parentPage: "N02", subtitle: "面向极客展示架构、依赖、测试矩阵、性能、安全、发布、日志和回退证据。", agent: "工部尚书", phase: "工程控制",
      outcome: "一份工程验证、发布门和回退演练报告", verdict: "没有通过真实构建、测试和回退演练，不得宣称可以发布。", situation: "真实仓库与CI未连接", impact: "只看界面截图无法证明系统可靠", action: "冻结受影响矩阵和证明命令",
      canDo: "展示代码事实、架构边界、依赖、测试、性能、安全、构建、发布与回滚。", primary: "工部尚书 · 预览工程门禁", consequence: "只生成预览，不执行命令、部署或改变生产环境。",
      abilities: [{ label: "进入 PACK 流水线闸门", page: "N04" }, { label: "返回里程碑证据", page: "N02" }, { label: "交御史台审计", page: "D02" }, { label: "交军机处看进度", page: "A03" }],
      leftTitle: "工程事实", leftItems: [I("架构与依赖", "真实仓库未读取", "待接", "构"), I("测试矩阵", "精准、构建和真实链路", "待定", "测"), I("性能与安全", "必须有独立证据", "待审", "安")],
      rightTitle: "发布与回退", rightSummary: "三级页展示全部门禁，不把“能构建”冒充“可上线”。", rightItems: [I("发布预览", "变更、影响和窗口", "待生", "发"), I("回退演练", "发布前必须证明", "待测", "退"), I("日志与审计", "失败也必须保留", "预留", "志")]
    }),

    P("N04", "工部工作台", "工部 · PACK 流水线闸门", "gongbu-delivery-final-v2.png", {
      level: "三级页面", parentPage: "N03", subtitle: "维护 P0～P5 放行链，统一设计验证、工具健康、交付体检、同步完整性、信心指数与最终裁决。", agent: "工部尚书", phase: "质量封驳",
      outcome: "一份可追溯、失败即封驳的 PACK 阶段门禁报告", verdict: "闸门规范已接入；执行引擎与项目数据未连接前，只能展示规则，不得显示通过。", situation: "已载入 pack-pipeline-gates 规则包；外部项目仓库尚未连接", impact: "没有真实数据、成本账本与命令回执时，任何绿灯都可能是假绿", action: "连接受控项目仓库并确认唯一流水线入口",
      canDo: "展示 P0～P5、V1～V3、D1～D8、阈值、fail-closed 原则和新增闸门六步焊接规程；连接执行器后再接收真实回执。", primary: "工部·质量司 · 载入 PACK 门禁规范", consequence: "当前只读接入，不执行规则包中的命令、不访问写死路径、不修改或发布客户工程。",
      abilities: [{ label: "返回工程质量与回退台", page: "N03" }, { label: "查看工部交付驾驶舱", page: "N01" }, { label: "交御史台复核门禁证据", page: "D02" }],
      leftTitle: "P0～P3.8 前置闸门", leftItems: [I("P0 设计验证", "V1 串数窗口 · V2 温度适配 · V3 报价不低于成本", "待执行", "验"), I("P1 工具健康", "金标用例与投毒测试", "待执行", "具"), I("P2 交付物体检", "D1/D2/D3/D4/D5/D6/D8", "待执行", "检"), I("P3～P3.8", "同步一致 · 发布源卫生 · 完整性", "待执行", "同")],
      rightTitle: "P4～P5 放行裁决", rightSummary: "规范已接入，执行状态保持未连接；任何解析失败必须封驳。", rightItems: [I("P4 信心指数", "低于 70、未闭环 P0 或含封驳即失败", "待执行", "信"), I("P5 放行裁决", "任一阶段红灯即退出并封驳", "锁定", "闸"), I("闸门自测", "新增闸门必须造病、断言、全绿并回写文档", "规范就绪", "测")]
    }),

    P("O01", "生活与陪伴", "内务府 · 今日三件事", "neiwufu-final-v2.png", {
      level: "次级页面", parentPage: "C05", subtitle: "把日程、家庭、采购和休息压缩成今天真正能完成的三件事。", agent: "内务府总管", phase: "生活编排",
      outcome: "一份含冲突处理、授权边界和休息窗口的今日安排", verdict: "先取消一件低价值安排，再安排代办。", situation: "真实日历与家庭信息尚未授权", impact: "只叠加任务会损害恢复和关系", action: "确认今天必须由本人完成的一件事",
      canDo: "整理冲突、优先级、采购、出行和休息；外部操作逐项预览。", primary: "内务府总管 · 生成今日三件事", consequence: "只生成本地安排，不写日历、预订、采购或付款。",
      abilities: [{ label: "返回生活主页", page: "E04" }, { label: "查看健康准备", page: "O02" }, { label: "安排娱乐创作", page: "O03" }],
      leftTitle: "生活输入", leftItems: [I("日程冲突", "真实日历未授权", "待接", "时"), I("家庭事项", "由用户主动说明", "待补", "家"), I("休息窗口", "不从在线时长推断", "待定", "休")],
      rightTitle: "今日建议", rightSummary: "三件事以内，且明确哪些必须本人完成。", rightItems: [I("本人完成", "保留关键关系与判断", "待定", "君"), I("可由朝堂准备", "整理、比较和提醒", "建议", "助"), I("现实代办", "逐项授权和确认", "锁定", "办")]
    }),
    P("O02", "生活与陪伴", "太医院 · 健康咨询准备包", "taiyiyuan-final-v2.png", {
      level: "次级页面", parentPage: "C04", subtitle: "把变化记录、用药资料、红旗、问题和检查材料整理成专业咨询准备包。", agent: "太医令", phase: "就医准备",
      outcome: "一份可交给专业医疗人员的变化摘要和问题清单", verdict: "先补齐变化时间线，不自行推断病因。", situation: "真实健康资料尚未提供", impact: "缺少连续记录会降低咨询效率", action: "记录一项变化的开始时间与发展过程",
      canDo: "整理用户提供的记录、材料和问题；明确红旗和非诊断边界。", primary: "太医令 · 生成咨询准备包", consequence: "只整理材料，不诊断、处方、联系机构或替代医生。",
      abilities: [{ label: "返回健康主页", page: "E05" }, { label: "安排今日生活", page: "O01" }, { label: "查看成果包", page: "D04" }],
      leftTitle: "变化与材料", leftItems: [I("变化时间线", "等待用户记录", "待补", "时"), I("用药与检查", "只读取用户提供内容", "待补", "材"), I("生活因素", "不自动推断因果", "未知", "生")],
      rightTitle: "安全咨询", rightSummary: "优先展示红旗、应该问什么和资料缺口。", rightItems: [I("红旗提示", "依据正式规则接入后显示", "待接", "警"), I("咨询问题", "围绕变化和影响", "待生", "问"), I("医疗边界", "始终明确非诊断", "固定", "界")]
    }),
    P("O03", "生活与陪伴", "娱乐 · AI图像视频创作室", "entertainment-final-v2.png", {
      level: "次级页面", parentPage: "E06", subtitle: "把灵感变成图像或视频作品，同时保留版本、素材权利和算筹边界。", agent: "内务府总管", phase: "休闲创作",
      outcome: "一份创意简报、候选方向和作品版本计划", verdict: "今晚只完成一个小作品，不把休闲变成大型项目。", situation: "创意、素材和生成服务尚未选择", impact: "选择过多会消耗休息和算筹", action: "在图像和视频中选择一种成果",
      canDo: "生成创意简报、提示词、分镜、候选比较、版本和收藏结构。", primary: "内务府总管 · 生成创作简报", consequence: "只生成本地简报，不调用生成模型、购买素材或发布作品。",
      abilities: [{ label: "返回娱乐主页", page: "E06" }, { label: "礼部商业创作", page: "K03" }, { label: "查看成果包", page: "D04" }],
      leftTitle: "灵感与素材", leftItems: [I("想表达什么", "等待一句创意", "待问", "意"), I("参考素材", "权利状态待核", "待核", "材"), I("时间与算筹", "生成前必须预览", "待定", "筹")],
      rightTitle: "作品与收藏", rightSummary: "一个推荐方向、最多两个备选，不制造选择疲劳。", rightItems: [I("推荐方向", "等待创意目标", "待生", "荐"), I("生成版本", "模型尚未接入", "空白", "版"), I("作品收藏", "真实成果才点亮", "待后", "藏")]
    }),
    P("O04", "生活与陪伴", "御前召见 · 智能体会晤", "shangshufang-final-v2.png", {
      level: "次级页面", parentPage: "A04", subtitle: "先说明你会得到什么结果，再让主责智能体以真人化近景复述、建议和确认下一步。", agent: "丞相", phase: "召见会晤",
      outcome: "一次保留同一任务上下文的拟人化专业会晤", verdict: "先由丞相推荐主责；用户仍可直接召见熟悉的部门负责人。", situation: "当前只提供本地人物与路由演示", impact: "让用户先选模型和工具会增加认知负担", action: "说出想得到的结果，由丞相推荐一位主责",
      canDo: "展示智能体身份、专长、能交付的成果、需要的材料和现实边界；召见后进入其部门。", primary: "丞相 · 推荐召见对象", consequence: "只形成推荐并进入部门页面，不调用模型或启动任务。",
      abilities: [{ label: "召见锦衣卫", page: "C01" }, { label: "召见钦天监", page: "C02" }, { label: "召见六部", page: "A04" }],
      leftTitle: "你想得到什么", leftItems: [I("结果目标", "一句话即可", "待说", "目"), I("当前材料", "保持同一上下文", "可带", "引"), I("最担心什么", "最多补两个未知", "待问", "问")],
      rightTitle: "召见建议", rightSummary: "每次只推荐一位主责和最多一位协作。", rightItems: [I("主责智能体", "根据结果与能力边界推荐", "待荐", "主"), I("可带走成果", "召见前先说清楚", "透明", "果"), I("进入部门", "保留任务护照和材料", "可行", "门")]
    }),

    P("P01", "鸿胪寺", "鸿胪寺 · 万邦能力与交易国门", "grand-council-final-v2.png", {
      subtitle: "统一发现和管理全球大模型、外接设备、Skills、Agents、工作流与经验交易。", agent: "鸿胪寺卿", phase: "能力通关",
      outcome: "一份适合当前任务的外部能力组合与准入建议", verdict: "先比较能力和真实收益，再决定连接、购买或授权什么。", situation: "大模型网关、外设目录和交易市集仍在路线图阶段", impact: "把目录候选误当成已可用，会带来权限、隐私、费用与供应链风险", action: "说明当前任务缺少模型、设备、Skill还是经验",
      canDo: "发现并登记大模型、外接设备、插件、Skill、Agent、工作流、专家和经验包；通过五道证据门后才可申请进入真实任务。",
      primary: "鸿胪寺卿 · 推荐外部能力组合", consequence: "只生成比较与准入建议；不会安装、连接、购买、授权、付款或调用任何真实外部能力。",
      abilities: [{ label: "万邦大模型与能力名录", surface: "progress" }, { label: "外接设备与企业连接", surface: "materials" }, { label: "Skills与经验交易市集", surface: "result" }],
      leftTitle: "万邦能力入口", leftItems: [I("大模型", "推理、生成、理解与多模态能力目录", "路线图", "模"), I("外接设备", "电脑、浏览器、机器人、传感器和企业系统", "路线图", "器"), I("能力与经验市集", "Skills、Agents、工作流和验证过的经验包", "未开放", "市")],
      rightTitle: "开放与可信", rightSummary: "鸿胪寺管入口与出口，不拥有正式任务事实。", rightItems: [I("五道准入关", "来源、契约、沙箱、安全、Owner授权", "固定", "关"), I("外部执行权", "候选默认 NO_EXECUTION_AUTHORITY", "关闭", "权"), I("当前建设状态", "真实生态准入与连接仍需验证", "ROADMAP", "图")],
      benefits: [I("最佳模型组合", "按质量、速度、成本与隐私为当前任务推荐", "可比较", "模"), I("外接设备方案", "列明连接对象、读取内容、控制范围和撤销方法", "可预览", "器"), I("能力与经验交易", "比较Skills、Agents、工作流和经验包的证据与适用性", "可审查", "市")],
      watch: [I("真实能力与成本", "必须和当前基线在固定任务上比较，不用宣传代替评测", "待评测", "比"), I("设备与数据权限", "默认只读、最小权限，凭据不进入提示词", "先说明", "数"), I("购买与现实动作", "安装、连接、交易、付款与发布都需另行确认", "关闭", "界")],
      newsTitle: "鸿胪寺生产网关尚未完成",
      newsDetail: "当前仅展示产品合同与受控流程；不把路线图能力包装成已经上线。",
      sourceState: "NOT_CONNECTED", capabilityState: "NOT_CONNECTED", freshness: "NOT_CONNECTED"
    }),
    P("P02", "鸿胪寺", "鸿胪寺 · 能力准入五关", "capability-directory-final-v1.png", {
      level: "次级页面", parentPage: "P01", subtitle: "用五道证据门判断一个外部模型、Skill或工具能否进入朝堂。", agent: "鸿胪寺卿", phase: "候选审查",
      outcome: "一份候选能力的准入、拒绝或补证建议", verdict: "候选能力默认无权；只有证据通过，才值得向Owner请求授权。", situation: "当前没有真实候选能力或评测记录", impact: "未经验证的外部能力可能扩大数据、成本和执行风险", action: "提交一个候选名称或来源",
      canDo: "检查发布者与许可、能力输入输出、沙箱基线、安全与租户边界，并形成Owner授权前的完整证据包。",
      primary: "鸿胪寺卿 · 预览五关审查", consequence: "只展示审查结构，不下载、安装、运行或授权候选能力。",
      abilities: [{ label: "返回鸿胪总览", page: "P01" }, { label: "查看授权审计", page: "P04" }, { label: "交御史台复核", page: "D02" }],
      leftTitle: "前三道关", leftItems: [I("来源身份关", "发布者、版本、许可、签名与依赖", "待证", "一"), I("能力契约关", "输入输出、工具、预算与副作用", "待证", "二"), I("沙箱评测关", "黄金任务、成本、时延与稳定性", "待测", "三")],
      rightTitle: "授权前两道关", rightSummary: "安全与Owner授权不能由第三方内容绕过。", rightItems: [I("安全与租户关", "凭据、网络、隔离、注入与供应链", "待审", "四"), I("Owner授权关", "按当前任务最小授权并可撤销", "锁定", "五"), I("正式任务事实", "仍由军机处与史馆记录", "不越权", "实")],
      sourceState: "NOT_CONNECTED", capabilityState: "NOT_CONNECTED"
    }),
    P("P03", "鸿胪寺", "鸿胪寺 · 企业连接与专家合作", "libu-marketing-final-v2.png", {
      level: "次级页面", parentPage: "P01", subtitle: "把ERP、CRM、知识库、行业数据和人类专家接入需要它们的真实任务。", agent: "鸿胪寺卿", phase: "连接合作",
      outcome: "一份连接范围、专家责任、费用、保密与验收清单", verdict: "先证明这项连接或专家复核能改变结果，再申请最小权限。", situation: "真实企业连接器与专家网络尚未接入", impact: "没有责任与数据边界的连接会制造新的事实源和泄露风险", action: "选择需要连接的数据或专业复核",
      canDo: "形成只读优先的企业连接方案，登记专家责任、利益冲突、费用、保密、交付和验收边界。",
      primary: "鸿胪寺卿 · 形成连接合作清单", consequence: "只生成预览，不读取企业系统、不联系专家、不签约或付款。",
      abilities: [{ label: "返回鸿胪总览", page: "P01" }, { label: "进入能力准入", page: "P02" }, { label: "查看授权审计", page: "P04" }],
      leftTitle: "需要连接什么", leftItems: [I("企业系统", "ERP、CRM与知识库，只读优先", "未接入", "企"), I("行业数据", "来源、许可、鲜度与用途必须明确", "未接入", "数"), I("专家伙伴", "责任、费用、冲突与保密必须明确", "未建立", "专")],
      rightTitle: "连接前必须说清", rightSummary: "为什么需要、读取什么、花费多少、可能风险、如何撤销。", rightItems: [I("最小权限", "不申请与当前任务无关的访问", "固定", "权"), I("费用与责任", "调用或合作前必须预览", "待定", "费"), I("现实联系", "未获确认不会发送邀请或材料", "关闭", "联")],
      sourceState: "NOT_CONNECTED", capabilityState: "NOT_CONNECTED"
    }),
    P("P04", "鸿胪寺", "鸿胪寺 · 授权、撤销与生态审计", "yushitai-final-v1.png", {
      level: "三级页面", parentPage: "P02", subtitle: "面向专业用户查看候选状态、权限投影、版本、费用、撤销与独立复核证据。", agent: "鸿胪寺卿", phase: "专业控制",
      outcome: "一份可审计、可撤销的外部能力授权预览", verdict: "没有当前任务与Owner授权，任何外部能力都保持无权。", situation: "正式信任根、撤销服务和结算体系尚未完成", impact: "缺少撤销与审计会把一次授权变成长期风险", action: "核对候选、任务、权限与撤销条件",
      canDo: "展示CANDIDATE_ONLY、评测证据、权限范围、租户边界、费用、版本、撤销与熔断状态。",
      primary: "鸿胪寺卿 · 预览授权证据包", consequence: "只显示演示字段，不激活、撤销、结算或调用任何真实外部能力。",
      abilities: [{ label: "返回能力准入", page: "P02" }, { label: "交御史台独立复核", page: "D02" }, { label: "交史馆记录结果", page: "A06" }],
      leftTitle: "身份与权限", leftItems: [I("候选状态", "CANDIDATE_ONLY", "无权", "候"), I("任务授权", "当前没有真实Owner授权", "锁定", "权"), I("租户边界", "凭据不得进入提示词", "固定", "租")],
      rightTitle: "版本与撤销", rightSummary: "一次授权不等于永久信任，真实表现仍由史馆记录。", rightItems: [I("版本与依赖", "SBOM与签名服务尚未接入", "待建", "版"), I("撤销与熔断", "真实服务尚未完成", "ROADMAP", "撤"), I("费用与结算", "法定货币与合规渠道，算筹只计资源", "边界", "费")],
      sourceState: "NOT_CONNECTED", capabilityState: "NOT_CONNECTED"
    })
  ];

  window.CHAOTANG_PAGES.push(
    P("R01", "史馆", "史馆 · 档案检索中心", "shiguan-final-v2.png", {
      level: "次级页面", parentPage: "A06", subtitle: "按项目、人物、部门、时间和成果查找同一任务的完整事实链。", agent: "史官", phase: "档案检索",
      outcome: "一组带来源、版本和权限状态的可追溯档案", verdict: "先按成果或项目找，不让用户先理解数据库结构。", situation: "真实档案索引尚未接入", impact: "没有统一索引会让判断、材料和成果彼此失联", action: "输入项目、成果或人物名称",
      canDo: "检索任务、决策、证据、成果、复盘与成长记录。", primary: "史官 · 查找档案", consequence: "只检索本地演示结构，不读取未授权知识库。",
      abilities: [{ label: "查看知识条目", page: "R02" }, { label: "查看数据源目录", page: "R03" }, { label: "版本与权限", page: "R04" }],
      leftTitle: "怎么找", leftItems: [I("按项目", "目标、阶段、成果与复盘", "可检索", "项"), I("按成果", "报告、表格、作品与证据包", "可检索", "果"), I("按人物部门", "主责、协作与真实贡献", "可检索", "人")],
      rightTitle: "优先查看", rightSummary: "先推荐与你当前任务最相关的一条。", rightItems: [I("最近成果", "真实档案尚未接入", "空白", "近"), I("待复盘决定", "实际结果回填后显示", "待接", "复"), I("可复用方法", "必须有成果证据", "待证", "法")]
    }),
    P("R02", "史馆", "史馆 · 知识条目详情", "shiguan-final-v2.png", {
      level: "三级页面", parentPage: "R01", subtitle: "查看一条知识的原始材料、结论、适用边界、引用关系和更新责任。", agent: "史官", phase: "知识核验",
      outcome: "一条可引用、可纠正、可追溯的知识条目", verdict: "总结与原始事实永久分层，过期内容不能继续冒充真值。", situation: "尚未选择真实知识条目", impact: "失去来源和适用边界的知识会污染后续决策", action: "选择一条知识查看证据链",
      canDo: "展示原文、摘要、推断、反证、适用范围和引用任务。", primary: "史官 · 查看知识证据链", consequence: "只展示演示字段，不修改知识库。",
      abilities: [{ label: "返回档案检索", page: "R01" }, { label: "查看数据源", page: "R03" }, { label: "比较版本", page: "R04" }],
      leftTitle: "条目内容", leftItems: [I("原始事实", "来源与原文保持分层", "待接", "实"), I("整理结论", "必须标明作者与时间", "待接", "结"), I("适用边界", "地区、对象与失效条件", "待补", "界")],
      rightTitle: "证据关系", rightSummary: "推荐先看最可能改变判断的一条反证。", rightItems: [I("支持来源", "尚未接入", "空白", "支"), I("冲突反证", "尚未接入", "空白", "反"), I("引用任务", "同一任务护照关联", "预留", "引")]
    }),
    P("R03", "史馆", "史馆 · 数据源目录", "jinyiwei-final-v2.png", {
      level: "次级页面", parentPage: "A06", subtitle: "统一查看来源身份、鲜度、许可、用途、质量和受影响部门。", agent: "史官", phase: "数据治理",
      outcome: "一份数据源状态与影响目录", verdict: "来源未验证或过期时，只能作为线索，不能作为决策事实。", situation: "真实数据源注册表尚未接入", impact: "来源混用会让锦衣卫核验和史馆复盘失真", action: "按部门或任务查看所需数据源",
      canDo: "登记公开、企业、用户与系统数据源及其状态。", primary: "史官 · 查看数据源目录", consequence: "只展示目录结构，不连接或读取外部数据。",
      abilities: [{ label: "返回史馆", page: "A06" }, { label: "查看知识条目", page: "R02" }, { label: "进入锦衣卫", page: "C01" }],
      leftTitle: "来源类型", leftItems: [I("公开来源", "原文、发布时间与许可", "待接", "公"), I("企业事实", "权限、Owner与使用目的", "待接", "企"), I("用户材料", "逐项授权与可撤销", "待接", "私")],
      rightTitle: "质量状态", rightSummary: "先显示会影响当前判断的新鲜度和冲突。", rightItems: [I("鲜度", "真实更新时间不可伪造", "未知", "时"), I("冲突", "锦衣卫核验后记录", "待接", "冲"), I("受影响任务", "由同一任务护照关联", "预留", "任")]
    }),
    P("R04", "史馆", "史馆 · 版本、权限与审计", "yushitai-final-v1.png", {
      level: "三级页面", parentPage: "R01", subtitle: "查看谁在何时修改、引用、授权、撤销与更正，不覆盖旧事实。", agent: "史官", phase: "版本审计",
      outcome: "一条可回退的版本与权限审计链", verdict: "更正必须追加新版本，不能悄悄覆盖当时的判断。", situation: "真实审计事件尚未接入", impact: "没有版本链就无法判断系统为何改变", action: "选择一个档案或知识条目比较版本",
      canDo: "比较差异、查看权限、引用关系、撤销与责任。", primary: "史官 · 比较版本", consequence: "只展示演示差异，不修改或撤销真实记录。",
      abilities: [{ label: "返回档案检索", page: "R01" }, { label: "查看知识条目", page: "R02" }, { label: "交御史台复核", page: "D02" }],
      leftTitle: "版本事实", leftItems: [I("创建与更正", "追加版本，不覆盖", "固定", "版"), I("引用关系", "影响哪些任务与成果", "待接", "引"), I("责任身份", "人类与Agent永久分籍", "固定", "责")],
      rightTitle: "权限审计", rightSummary: "优先显示越权、过期或不可撤销风险。", rightItems: [I("读取权限", "按任务最小授权", "待接", "读"), I("修改权限", "高影响操作需确认", "锁定", "改"), I("撤销与回退", "保留事实和原因", "预留", "退")]
    }),
    P("S01", "朝堂运转", "朝堂运转 · 定时任务与自动呈报", "grand-council-final-v2.png", {
      level: "次级页面", parentPage: "A01", subtitle: "统一管理每天替你观察、整理和呈报的任务，不用红点制造焦虑。", agent: "丞相", phase: "持续运转",
      outcome: "一份可暂停、可解释、可审计的自动呈报计划", verdict: "只保留会带来新判断、新进展或新成果的定时任务。", situation: "真实调度器与通知系统尚未接入", impact: "没有价值阈值的自动化只会制造噪音和成本", action: "选择一项真正值得持续观察的事情",
      canDo: "管理锦衣卫简报、项目回奏、学习推荐、预算复核与生活提醒。", primary: "丞相 · 建立呈报草案", consequence: "只形成草案；启用频率、通知和外部读取前必须确认。",
      abilities: [{ label: "查看任务详情", page: "S02" }, { label: "进入锦衣卫", page: "C01" }, { label: "查看军机项目", page: "A03" }],
      leftTitle: "按结果管理", leftItems: [I("重要变化", "达到影响阈值才呈报", "待配置", "变"), I("项目进展", "有真实事件才更新", "待接", "项"), I("成长建议", "有作品或能力差距才出现", "待证", "学")],
      rightTitle: "今日呈报", rightSummary: "没有真实新信息时保持静默。", rightItems: [I("待确认", "真实调度器未接入", "空白", "确"), I("下次运行", "不得伪造时间", "未知", "时"), I("通知边界", "频率与渠道由用户控制", "固定", "铃")]
    }),
    P("S02", "朝堂运转", "朝堂运转 · 定时任务详情", "junjichu-final-v2.png", {
      level: "三级页面", parentPage: "S01", subtitle: "查看触发条件、来源、算筹上限、通知、权限、失败和暂停。", agent: "丞相", phase: "自动化控制",
      outcome: "一份可预览、可暂停和可撤销的自动任务合同", verdict: "定时不等于授权；每次现实副作用仍按规则确认。", situation: "尚未选择真实定时任务", impact: "无限频率和无限上下文会浪费算筹并扩大权限", action: "冻结触发条件与停止条件",
      canDo: "配置频率、价值阈值、来源、预算、通知、失败和撤销。", primary: "丞相 · 预览自动任务合同", consequence: "只预览，不创建真实计划任务或通知。",
      abilities: [{ label: "返回自动呈报", page: "S01" }, { label: "查看权限", page: "D06" }, { label: "查看史馆记录", page: "A06" }],
      leftTitle: "何时运行", leftItems: [I("触发条件", "事件优先于固定频率", "待定", "触"), I("算筹上限", "超过预算自动停止", "待定", "筹"), I("停止条件", "无价值或来源失效即停", "待定", "停")],
      rightTitle: "运行后果", rightSummary: "先告诉用户会读什么、生成什么、通知什么。", rightItems: [I("读取范围", "最小必要来源", "待批", "读"), I("交付成果", "必须可查看或下载", "待定", "果"), I("失败与撤销", "失败显式呈报，一键暂停", "固定", "退")]
    }),
    P("T01", "生活与陪伴", "内务府 · 旅行行程中心", "neiwufu-final-v2.png", {
      level: "次级页面", parentPage: "E04", subtitle: "把目的、时间、预算、同行人、证件与风险整理成可调整行程。", agent: "内务府总管", phase: "旅行规划",
      outcome: "一份可调整的行程、预算和准备清单", verdict: "先冻结旅行目标和不能牺牲的底线，再比较路线。", situation: "真实日期、目的地与预订信息尚未提供", impact: "只追求景点数量会损害预算、体力与同行体验", action: "说明目的地、时间和最重要的体验",
      canDo: "规划路线、时间、预算、证件、风险和预订预览。", primary: "内务府总管 · 生成旅行草案", consequence: "只生成草案，不搜索实时价格、预订或付款。",
      abilities: [{ label: "预算证件风险", page: "T02" }, { label: "预订授权预览", page: "T03" }, { label: "锦衣卫查目的地", page: "C01" }],
      leftTitle: "旅行输入", leftItems: [I("为什么去", "休息、探索、商务或陪伴", "待说", "意"), I("时间与同行", "节奏和关系优先", "待补", "时"), I("预算边界", "交通、住宿与弹性", "待定", "财")],
      rightTitle: "行前关注", rightSummary: "优先看证件、取消和安全，不用景点轰炸用户。", rightItems: [I("目的地变化", "真实来源未接入", "待接", "讯"), I("证件与规则", "需权威来源核验", "待核", "证"), I("预订风险", "价格、取消与付款", "锁定", "订")]
    }),
    P("T02", "生活与陪伴", "旅行 · 预算、证件与风险", "jinyiwei-final-v2.png", {
      level: "三级页面", parentPage: "T01", subtitle: "把费用区间、证件、天气、交通、健康与安全信息放进同一准备页。", agent: "内务府总管", phase: "行前准备",
      outcome: "一份旅行预算、证件和风险核对表", verdict: "证件或关键规则未核验时，不进入不可退预订。", situation: "真实目的地与权威来源尚未接入", impact: "过期信息可能造成额外费用或无法成行", action: "确认目的地、日期和身份条件",
      canDo: "整理预算、证件、保险、天气、交通、健康与安全信息。", primary: "内务府总管 · 形成行前清单", consequence: "只整理结构，不提供实时承诺或办理证件。",
      abilities: [{ label: "返回行程中心", page: "T01" }, { label: "预订授权预览", page: "T03" }, { label: "锦衣卫核验", page: "F04" }],
      leftTitle: "必须准备", leftItems: [I("预算区间", "真实价格尚未接入", "待估", "财"), I("证件规则", "按身份与目的地核验", "待核", "证"), I("健康准备", "不替代专业建议", "待补", "健")],
      rightTitle: "风险与替代", rightSummary: "每项重要风险同时给一个可替代方案。", rightItems: [I("取消风险", "比较可退与不可退", "待查", "退"), I("交通天气", "依赖实时来源", "待接", "天"), I("备用路线", "条件变化时切换", "待生", "备")]
    }),
    P("T03", "生活与陪伴", "旅行 · 预订授权预览", "neiwufu-final-v2.png", {
      level: "三级页面", parentPage: "T01", subtitle: "在任何预订、发送和付款以前统一预览价格、条款、个人信息与取消条件。", agent: "内务府总管", phase: "现实操作确认",
      outcome: "一份逐项可确认的预订与付款预览", verdict: "默认不预订；先把总价、取消、数据和支付对象讲清楚。", situation: "预订平台、价格与支付均未接入", impact: "一次点击可能产生付款、锁价、共享身份信息等现实后果", action: "逐项检查并选择是否授权",
      canDo: "预览交通、住宿、活动、保险、联系人和支付信息。", primary: "内务府总管 · 预览授权清单", consequence: "只展示预览；没有逐项确认不会预订、发送或付款。", sideEffect: "CONFIRM_REQUIRED",
      abilities: [{ label: "返回行程中心", page: "T01" }, { label: "查看风险清单", page: "T02" }, { label: "查看权限设置", page: "D06" }],
      leftTitle: "预订对象", leftItems: [I("交通", "班次、姓名与取消", "未接", "行"), I("住宿", "日期、房型与税费", "未接", "宿"), I("活动与保险", "条款与覆盖范围", "未接", "活")],
      rightTitle: "授权前确认", rightSummary: "用户逐项批准，默认全部关闭。", rightItems: [I("总价与币种", "必须来自实时来源", "未知", "价"), I("个人信息", "只发送最小必要字段", "锁定", "私"), I("付款与取消", "二次确认并保留凭证", "锁定", "付")]
    }),
    P("U01", "翰林院", "翰林院 · 拟旨与提示词进化", "hanlinyuan-final-v2.png", {
      level: "次级页面", parentPage: "C03", subtitle: "从真实任务中学会说对问题、压缩上下文和定义可验收成果。", agent: "翰林学士", phase: "作品驱动学习",
      outcome: "一份可复用的拟旨模板、前后对照和真实作品", verdict: "好提示词不是更长，而是结果、边界、证据和停止条件更清楚。", situation: "尚未选择真实任务作为练习", impact: "脱离任务背提示词难以迁移，也会重复消耗上下文", action: "带入一件真实任务生成第一份拟旨",
      canDo: "从原话生成结果契约、去重上下文、比较版本并用成果评测。", primary: "翰林学士 · 开始一次拟旨练习", consequence: "只生成可编辑练习，不发送、不调用模型或计算虚假Token节省。",
      abilities: [{ label: "返回翰林院", page: "C03" }, { label: "今日十分钟学习", page: "I02" }, { label: "作品评测", page: "I05" }],
      leftTitle: "今天只练一件事", leftItems: [I("原话", "保留用户真实表达", "待写", "原"), I("拟旨", "目标、成果、边界与未知", "待生", "旨"), I("上下文节流", "去重、摘要与引用复用", "待评", "省")],
      rightTitle: "学完带走", rightSummary: "每次学习必须留下作品，而不是只看教程。", rightItems: [I("前后对照", "知道为什么更有效", "待生", "比"), I("可复用模板", "来自真实任务", "待生", "模"), I("下一次练习", "只补一个能力缺口", "待荐", "进")]
    })
  );
  const hierarchy = {
    F01: ["次级页面", "C01"], F02: ["次级页面", "C01"], F03: ["次级页面", "C01"], F04: ["三级页面", "F01"], F05: ["次级页面", "C01"],
    G01: ["次级页面", "C02"], G02: ["三级页面", "G01"], G03: ["三级页面", "G01"],
    H01: ["次级页面", "B02"], H02: ["三级页面", "H01"], H03: ["三级页面", "H01"], H04: ["三级页面", "H01"],
    I01: ["次级页面", "C03"], I02: ["次级页面", "I01"], I03: ["三级页面", "I02"], I04: ["次级页面", "I01"], I05: ["三级页面", "I04"], I06: ["次级页面", "I01"],
    P02: ["次级页面", "P01"], P03: ["次级页面", "P01"], P04: ["三级页面", "P02"],
    R01: ["次级页面", "A06"], R02: ["三级页面", "R01"], R03: ["次级页面", "A06"], R04: ["三级页面", "R01"],
    S01: ["次级页面", "A01"], S02: ["三级页面", "S01"],
    T01: ["次级页面", "E04"], T02: ["三级页面", "T01"], T03: ["三级页面", "T01"], U01: ["次级页面", "C03"]
  };
  const linkOverrides = {
    A04: [{ label: "进入六部部级主页", page: "B01" }, { label: "召见一位智能体", page: "O04" }, { label: "查看百司编队", page: "C06" }],
    B01: [{ label: "进入组织驾驶舱", page: "J01" }, { label: "查看人类员工", page: "J02" }, { label: "查看Agent员工", page: "J03" }],
    B02: [{ label: "进入财富驾驶舱", page: "H01" }, { label: "查看投资机会", page: "H02" }, { label: "查看预算现金", page: "H04" }],
    B03: [{ label: "进入品牌天气台", page: "K01" }, { label: "生成营销成果包", page: "K02" }, { label: "进入图像视频工坊", page: "K03" }],
    B04: [{ label: "进入客户战图", page: "L01" }, { label: "查看下一销售动作", page: "L02" }, { label: "查看渠道与报价", page: "L03" }],
    B05: [{ label: "进入风险红线台", page: "M01" }, { label: "查看合同对照", page: "M02" }, { label: "查看规则证据", page: "M03" }],
    B06: [{ label: "进入交付驾驶舱", page: "N01" }, { label: "查看里程碑证据", page: "N02" }, { label: "进入工程控制台", page: "N03" }],
    C04: [{ label: "生成健康咨询准备包", page: "O02" }, { label: "返回健康今日页", page: "E05" }, { label: "查看成果包", page: "D04" }],
    C05: [{ label: "生成今日三件事", page: "O01" }, { label: "返回生活今日页", page: "E04" }, { label: "安排娱乐创作", page: "O03" }],
    C06: [{ label: "进入御前召见", page: "O04" }, { label: "查看Agent员工册", page: "J03" }, { label: "交军机处管理", page: "A03" }],
    A06: [{ label: "查找全部档案", page: "R01" }, { label: "查看数据源目录", page: "R03" }, { label: "版本与权限", page: "R04" }],
    C03: [{ label: "今日十分钟学习", page: "I02" }, { label: "状元榜与能力科举", page: "I04" }, { label: "拟旨与提示词进化", page: "U01" }],
    E01: [{ label: "兵部 · 获取客户", page: "L01" }, { label: "工部 · 产品交付", page: "N01" }, { label: "吏部 · AI员工", page: "J03" }],
    E02: [{ label: "进入财富驾驶舱", page: "H01" }, { label: "查看投资机会", page: "H02" }, { label: "查看预算现金", page: "H04" }],
    E04: [{ label: "生成今日三件事", page: "O01" }, { label: "规划一次旅行", page: "T01" }, { label: "查看健康准备", page: "O02" }],
    E05: [{ label: "生成咨询准备包", page: "O02" }, { label: "召见太医令", page: "C04" }, { label: "查看今日安排", page: "O01" }],
    E06: [{ label: "进入AI创作室", page: "O03" }, { label: "礼部商业创作", page: "K03" }, { label: "加入今日安排", page: "O01" }]
  };
  const NC = (label, value = "--", state = "尚未接入") => ({ label, value, state });
  const WAITING_TASKS = [
    I("当前无真实执行任务", "接入军机处任务事件后，才显示真实阶段、阻塞和责任人", "待命", "任"),
    I("没有任务不会伪造忙碌", "候命状态不会显示虚假进度、完成率或成功结果", "真实", "静")
  ];
  const DEPARTMENT_DASHBOARDS = {
    B01: {
      officeLabel: "吏部各司", portraitPosition: "35% 68%", marketTitle: "人才与智能体动态",
      offices: [
        { ...I("任免司", "岗位任免、唯一主责与授权边界", "进入", "任"), page: "J01" },
        { ...I("招聘司", "按能力缺口筛选人类员工候选", "进入", "招"), page: "J02" },
        { ...I("劳关司", "协作关系、劳动事项与人工审核说明", "进入", "劳"), page: "J02" },
        { ...I("薪酬司", "薪酬结构、激励条件与成本边界", "进入", "薪"), page: "J01" },
        { ...I("制度司", "制度、职责、审批与撤销规则", "进入", "制"), page: "J04" },
        { ...I("协同司", "人类员工与Agent员工分籍、任务合编", "进入", "协"), page: "J03" }
      ],
      outputs: [I("人机组织图", "永久分开人籍与机籍，任务内临时合编", "可生成", "图"), I("最小编队建议", "给出唯一主责、必要协作和能力缺口", "可生成", "编"), I("责任权限清单", "说明谁负责、能看什么、能做什么和如何撤销", "可生成", "权")],
      market: [NC("关键岗位"), NC("Agent候选"), NC("能力缺口"), NC("评测事件")]
    },
    B02: {
      officeLabel: "户部各司", portraitPosition: "35% 85%", marketTitle: "牌价与指数",
      offices: [
        { ...I("预算司", "预算优先级、现金安全线与停止条件", "进入", "预"), page: "H04" },
        { ...I("出纳司", "收支、付款准备与现金流核对", "进入", "纳"), page: "H04" },
        { ...I("盐铁司", "成本、价格、资源与商业机会研究", "进入", "盐"), page: "H01" },
        { ...I("融资司", "融资材料、资金用途与偿付边界", "进入", "融"), page: "H01" },
        { ...I("审计司", "账目证据、异常与责任追溯", "进入", "审"), page: "H03" },
        { ...I("会计司", "财报、口径、利润与经营摘要", "进入", "会"), page: "H01" },
        { ...I("投资司", "机会、反证、组合与退出条件", "进入", "投"), page: "H02" }
      ],
      outputs: [I("财务经营报告", "现金、收入、成本、预算与关键缺口汇总", "可生成", "财"), I("投资分析报告", "标的、估值、情景、组合与风险边界", "可生成", "投"), I("融资与财税建议", "融资准备、资金用途、现金流和财税材料清单", "可生成", "融")],
      market: [NC("沪深300"), NC("恒生指数"), NC("标普500"), NC("黄金"), NC("美元指数"), NC("人民币中间价")]
    },
    B03: {
      officeLabel: "礼部各司", portraitPosition: "50% 68%", marketTitle: "品牌与传播信号",
      offices: [
        { ...I("品牌司", "品牌主张、视觉、语言与体验标准", "进入", "牌"), page: "K01" },
        { ...I("公关司", "舆情响应、媒体关系与危机表达", "进入", "公"), page: "K02" },
        { ...I("客户沟通司", "商务接待、提案与客户沟通标准", "进入", "客"), page: "K02" },
        { ...I("内容司", "文案、图像、视频与内容资产", "进入", "文"), page: "K03" },
        { ...I("政企司", "政企材料、礼仪与正式书写规范", "进入", "政"), page: "K04" },
        { ...I("体验司", "触点体验、服务语言与品牌一致性", "进入", "验"), page: "K01" }
      ],
      outputs: [I("品牌标准手册", "统一主张、视觉、语言和使用边界", "可生成", "标"), I("营销成果包", "受众、文案、图像、视频与渠道预览", "可生成", "营"), I("商务接待方案", "议程、礼仪、材料、分工与跟进清单", "可生成", "宾")],
      market: [NC("品牌趋势"), NC("受众变化"), NC("内容热点"), NC("版权风险")]
    },
    B04: {
      officeLabel: "兵部各司", portraitPosition: "50% 65%", marketTitle: "客户与增长信号",
      offices: [
        { ...I("报价司", "报价结构、让步边界与退出条件", "进入", "价"), page: "L03" },
        { ...I("线索司", "线索验证、优先级与下一接触动作", "进入", "索"), page: "L01" },
        { ...I("渠道司", "渠道比较、节奏、资源与转化证据", "进入", "渠"), page: "L03" },
        { ...I("客户司", "客户画像、需求、关系与成交路径", "进入", "客"), page: "L01" },
        { ...I("竞情司", "竞品变化、差异与应对依据", "进入", "竞"), page: "L04" },
        { ...I("增长司", "增长实验、指标与唯一下一动作", "进入", "增"), page: "L02" }
      ],
      outputs: [I("客户战图", "把候选客户按价值、证据与可达性排序", "可生成", "客"), I("下一销售动作", "只推荐一个最值得执行的成交步骤", "可生成", "行"), I("渠道与报价方案", "比较渠道、报价边界和谈判取舍", "可生成", "价")],
      market: [NC("目标客户"), NC("渠道信号"), NC("竞品动作"), NC("成交事件")]
    },
    B05: {
      officeLabel: "刑部各司", portraitPosition: "50% 66%", marketTitle: "规则与风险变化",
      offices: [
        { ...I("合同司", "合同义务、风险条款与修改对照", "进入", "合"), page: "M02" },
        { ...I("合规稽查司", "规则、适用范围、版本与审查证据", "进入", "规"), page: "M03" },
        { ...I("风控司", "不可逆后果、风险红线与停止条件", "进入", "风"), page: "M01" },
        { ...I("缺证核查司", "缺失事实、证据冲突与补正清单", "进入", "证"), page: "M03" },
        { ...I("争议处置司", "争议事实、方案取舍与人工复核点", "进入", "争"), page: "M01" },
        { ...I("知识产权司", "版权、商标、许可与权属证据", "进入", "知"), page: "M03" },
        { ...I("制度司", "审批门、例外、责任与撤销制度", "进入", "制"), page: "M01" }
      ],
      outputs: [I("风险红线报告", "说明什么不能做、为什么和补正条件", "可生成", "险"), I("合同修改对照", "原条款、风险、修改稿和仍需确认事项", "可生成", "改"), I("规则审批矩阵", "列明规则来源、例外、审批人与外部副作用", "可生成", "矩")],
      market: [NC("法规变化"), NC("合同风险"), NC("合规事件"), NC("人工复核")]
    },
    B06: {
      officeLabel: "工部各司", portraitPosition: "50% 65%", marketTitle: "技术与交付信号",
      offices: [
        { ...I("产研司", "产品范围、需求、验证与完成定义", "进入", "产"), page: "N01" },
        { ...I("技术司", "架构、代码、依赖、性能与安全", "进入", "技"), page: "N03" },
        { ...I("物料司", "材料、供应、成本与可制造性", "进入", "料"), page: "N01" },
        { ...I("进度司", "阶段、里程碑、阻塞与下一责任人", "进入", "进"), page: "N02" },
        { ...I("质量司", "测试、验收、发布门与失败回退", "进入", "质"), page: "N03" },
        { ...I("现场司", "现场信息、问题闭环与交付证据", "进入", "现"), page: "N02" },
        { ...I("承诺司", "交付承诺、范围变更与验收责任", "进入", "诺"), page: "N01" }
      ],
      outputs: [I("交付驾驶舱", "范围、依赖、阶段、阻塞与下一责任人", "可生成", "交"), I("里程碑证据链", "把产物、测试、验收和版本串成事实链", "可生成", "证"), I("工程质量报告", "构建、测试、性能、安全、发布与回退", "可生成", "工")],
      market: [NC("依赖变化"), NC("供应风险"), NC("测试事件"), NC("交付阻塞")]
    },
    C01: {
      officeLabel: "锦衣卫四司", portraitPosition: "24% 58%", marketTitle: "全球情报雷达",
      offices: [I("采集司", "按部门需求采集公开与授权信息原料", "看能力", "采"), I("验真司", "核对独立来源、新鲜度、原文与身份", "看能力", "验"), I("反证司", "主动寻找冲突、反例与未知", "看能力", "反"), I("分发司", "只把核验信息送给受影响部门和任务", "看能力", "分")],
      outputs: [I("与你有关的全球三小时简报", "按你的目标为政治、经济、军事、科技与行业变化降噪", "可生成", "报"), I("你的情报核验卡", "事实、推断、反证、鲜度和仍未知部分", "可生成", "证"), I("对你的部门影响分发图", "说明这条信息影响哪个目标、部门和下一步", "可生成", "联")],
      market: [NC("全球政治", "--", "来源未接"), NC("经济市场", "--", "来源未接"), NC("科技AI", "--", "来源未接"), NC("用户行业", "--", "画像未接")]
    },
    C02: {
      officeLabel: "钦天监四台", portraitPosition: "50% 65%", marketTitle: "战略触发信号",
      offices: [I("观象台", "汇总已核验的内外部变化", "看能力", "观"), I("推演台", "构建上行、基线与受阻三种条件情景", "看能力", "演"), I("候变台", "记录转进、转守与判断失效信号", "看能力", "变"), I("校准台", "与史馆对照预测、执行和真实结果", "看能力", "校")],
      outputs: [I("与你有关的三景战略卡", "用条件情景说明你的目标可能怎样变化", "可生成", "景"), I("你的触发信号罗盘", "说明何时转进、转守或重新判断", "可生成", "罗"), I("给你的战略应对方案", "给出推荐路线、保留选项和失效条件", "可生成", "策")],
      market: [NC("转进信号"), NC("转守信号"), NC("失效条件"), NC("史馆校准")]
    },
    C03: {
      officeLabel: "翰林四馆", portraitPosition: "50% 66%", marketTitle: "前沿知识与能力",
      offices: [I("御学馆", "为用户设计浅显、快速、作品驱动的学习路径", "看能力", "学"), I("状元阁", "为插件、Skills、Agents和工作流建立可解释榜单", "看能力", "榜"), I("选贤馆", "用真实任务筛选值得引入的能力", "看能力", "选"), I("进化馆", "用作品与任务结果提出升级奏请", "看能力", "进")],
      outputs: [I("个人学习路线", "目标、起点、每日十分钟任务与作品标准", "可生成", "路"), I("状元榜与能力评测报告", "比较来源、能力、风险、成本和真实任务表现", "可生成", "榜"), I("朝堂升级奏请", "说明升级什么、为什么、如何验证与回退", "可生成", "升")],
      market: [NC("插件候选"), NC("Skill候选"), NC("Agent候选"), NC("工作流候选")]
    },
    C04: {
      officeLabel: "太医四科", portraitPosition: "50% 66%", marketTitle: "健康与服务信息",
      offices: [I("问诊科", "整理变化、时间线、影响与缺失信息", "看能力", "问"), I("典籍科", "引用可靠健康资料并说明适用边界", "看能力", "典"), I("调养科", "围绕睡眠、运动、饮食形成可执行记录", "看能力", "养"), I("就医科", "准备问题清单、材料包与专业咨询边界", "看能力", "医")],
      outputs: [I("健康变化摘要", "把用户提供的变化按时间和影响说清楚", "可生成", "变"), I("就医问题清单", "减少咨询遗漏，不替代专业诊断", "可生成", "问"), I("健康咨询准备包", "材料、用药、检查、红旗与待问事项", "可生成", "包")],
      market: [NC("健康资料"), NC("服务变化"), NC("就医提醒"), NC("资料缺口")]
    },
    C05: {
      officeLabel: "内务四房", portraitPosition: "50% 66%", marketTitle: "生活服务信息",
      offices: [I("日程房", "日程、家庭、出行与冲突协调", "看能力", "程"), I("采办房", "采购比较、预算影响与授权预览", "看能力", "采"), I("膳宿房", "饮食、居住、休息与恢复安排", "看能力", "宿"), I("雅乐房", "娱乐推荐、AI创作与作品收藏", "看能力", "乐")],
      outputs: [I("家人生日与纪念日计划", "礼物、祝福、惊喜与提前准备清单", "可生成", "礼"), I("节假日与周末安排", "结合时间、家人和预算给出少量好选择", "可生成", "假"), I("旅行聚会与生活代办", "路线、预算、采购与授权预览", "可生成", "行")],
      market: [NC("重要日子"), NC("节假日安排"), NC("出行与天气"), NC("待授权代办")]
    },
    C06: {
      officeLabel: "蜂群四营", portraitPosition: "50% 66%", marketTitle: "智能体能力状态",
      offices: [I("先锋营", "快速探索、收集材料与发现未知", "看能力", "先"), I("中军营", "主责Agent统筹判断、计划和结果", "看能力", "中"), I("协同营", "按依赖并行处理专业子任务", "看能力", "协"), I("校验营", "独立检查证据、质量、风险和完成定义", "看能力", "校")],
      outputs: [I("最小智能体编队", "只召集完成当前结果所需的最少成员", "可生成", "编"), I("协同作战图", "显示主责、贡献、依赖、权限和算筹影响", "可生成", "图"), I("Agent贡献回奏", "每位Agent只汇报自己的真实贡献和阻塞", "可生成", "奏")],
      market: [NC("可用Agent"), NC("能力缺口"), NC("权限状态"), NC("真实事件")]
    },
    P01: {
      officeLabel: "万邦四馆", portraitPosition: "50% 64%", marketTitle: "外部能力与交易状态",
      offices: [I("大模型馆", "多模型推理、生成、多模态与成本能力名录", "ROADMAP", "模"), I("外设与连接器", "电脑、浏览器、机器人、传感器和企业系统", "ROADMAP", "器"), I("Skills与Agent馆", "插件、Skills、Agents与工作流候选", "ROADMAP", "技"), I("经验交易市集", "经真实任务验证的经验包与合作交付", "未开放", "市")],
      outputs: [I("能力比较与准入报告", "质量、成本、来源、契约、评测与安全结论", "可预览", "准"), I("外接设备连接清单", "数据范围、控制权限、费用、风险与撤销方式", "可预览", "器"), I("市集交易与授权证据包", "权属、版本、任务、价格、审计和熔断条件", "可预览", "市")],
      market: [NC("大模型候选", "--", "网关未建"), NC("外接设备", "--", "目录未建"), NC("Skills／Agent", "--", "市集未建"), NC("经验包", "--", "交易未开放")],
      tasks: [I("当前无真实准入任务", "生产网关、伙伴门户与真实候选尚未接入", "ROADMAP", "任"), I("候选默认无执行权", "未获Owner授权前不会进入正式任务", "锁定", "权")]
    }
  };
  const RESULT_CONTRACTS = {
    B01: { pages: ["J01", "J03", "J04"], formats: ["组织图＋岗位责任表", "主责与协作编队卡", "权限、审批与撤销清单"], inputs: "你的目标、现有人类员工、可用Agent与不可越过的权限边界", permission: "只生成组织与用人建议；聘用、解雇、授权和外部执行均需人工确认。" },
    B02: { pages: ["H01", "H02", "H04"], formats: ["经营财报＋风险摘要", "投资研究报告＋反证清单", "融资材料清单＋现金流方案"], inputs: "已授权的收入、成本、现金、负债、预算目标与风险偏好", permission: "只形成研究与决策材料；不交易、不付款、不报税，现实金融动作必须明确确认。" },
    B03: { pages: ["K01", "K02", "K03"], formats: ["品牌标准手册", "渠道营销成果包", "图像视频创作任务书"], inputs: "品牌目标、目标受众、产品真值、渠道、预算与禁用表达", permission: "先生成预览与审阅稿；发布、投放、发送和购买媒体必须单独确认。" },
    B04: { pages: ["L01", "L02", "L03"], formats: ["客户优先级战图", "下一销售动作卡", "渠道报价与谈判方案"], inputs: "产品真值、目标客户、历史触达、报价边界与成交目标", permission: "只生成销售建议和草稿；联系客户、发送报价和签约必须人工确认。" },
    B05: { pages: ["M01", "M02", "M03"], formats: ["风险红线报告", "合同逐条修改对照", "规则、审批与证据矩阵"], inputs: "合同或动作原文、适用地区、主体身份、时间与预期外部后果", permission: "提供风险整理与审查辅助，不替代律师、监管机构或最终人工审批。" },
    B06: { pages: ["N01", "N02", "N03"], formats: ["交付驾驶舱", "里程碑证据链", "工程质量与回退报告"], inputs: "目标成果、验收标准、代码或材料、依赖、截止时间与回退要求", permission: "默认先预览变更；部署、发布、采购和不可逆工程动作必须经过批准。" },
    C01: { pages: ["F01", "F04", "F05"], formats: ["全球变化简报", "事实—推断—反证核验卡", "部门与任务影响分发图"], inputs: "关注主题、地区、行业、时间窗口、已授权来源与当前任务", permission: "只采集公开或已授权信息；不伪造来源，不把推断写成事实。" },
    C02: { pages: ["G01", "G02", "G03"], formats: ["三种条件情景卡", "触发与失效信号罗盘", "战略应对与保留选项"], inputs: "锦衣卫已核验事实、内部经营数据、目标、约束和停止条件", permission: "不输出无依据的成功概率；预测只作条件判断，重大行动仍需用户裁决。" },
    C03: { pages: ["I02", "I04", "I06"], formats: ["个人学习路线＋今日练习", "能力候选比较与评测表", "升级奏请＋验证回退计划"], inputs: "学习目标、当前水平、可用时间、作品标准与系统能力缺口", permission: "安装、升级或启用Agent与Skill前必须展示来源、权限、测试和回退。" },
    C04: { pages: ["O02", "O02", "D04"], formats: ["健康变化时间线", "就医问题清单", "健康咨询准备包"], inputs: "用户主动提供的症状变化、时间、用药、检查与希望咨询的问题", permission: "只做信息整理和就医准备，不诊断、不处方；紧急情况应联系当地专业服务。" },
    C05: { pages: ["O01", "T01", "O03"], formats: ["今日三件事", "旅行行程、预算与授权预览", "休息娱乐与创作方案"], inputs: "日程、家庭约束、预算、精力、偏好和明确授权范围", permission: "预约、购买、发送、付款等现实动作必须先预览并确认。" },
    C06: { pages: ["O04", "A03", "D04"], formats: ["最小智能体编队卡", "主责、依赖与协同作战图", "Agent真实贡献回奏"], inputs: "结果契约、任务阶段、能力缺口、预算、时限与权限边界", permission: "军团规模不等于真实执行；只有任务事件才能改变Agent状态并产生算筹记录。" },
    P01: { pages: ["P02", "P03", "P04"], formats: ["外部能力五关准入报告", "企业与专家合作清单", "授权、撤销与审计证据包"], inputs: "候选身份、能力契约、版本、费用、数据范围、安全证据与Owner授权", permission: "当前为ROADMAP；候选默认无执行权，未经五关审查与Owner授权不得进入正式任务。" }
  };
  const METHOD_CASES = {
    B01: [["先定责任，再选人", "先冻结唯一主责和验收标准，再决定调用人类员工还是Agent。"], ["最小编队原则", "能由一位主责完成，就不召集三位Agent制造沟通成本。"], ["用结果考功", "只用真实任务成果、质量和复用价值评价，不用在线时长冒充贡献。"]],
    B02: [["先守现金安全线", "先判断能活多久，再讨论扩张、投资与高增长。"], ["投资先写反证", "先写出什么事实出现时必须放弃，再研究上行空间。"], ["预算服从结果", "每一笔预算都绑定结果、验收时间和停止条件。"]],
    B03: [["一个受众一个主张", "首屏只回答目标客户为什么现在应该相信你。"], ["先真值后创意", "先锁定产品事实与证据，再生成文案、图像和视频。"], ["发布前统一审阅", "品牌、版权、合规与渠道尺寸在同一成果包中确认。"]],
    B04: [["先攻最可成交客户", "不按名单平均用力，先找价值高、证据足、可触达的客户。"], ["一次只推进一步", "每位客户只推荐一个最可能推动成交的下一动作。"], ["报价同时写底线", "给出报价时同步说明成本、让步边界与退出条件。"]],
    B05: [["先看不可逆后果", "付款、发布、签约和删除优先进入审查门。"], ["结论必须可补正", "不能做时同时说明缺什么、如何修改、何时可以重新审核。"], ["规则必须带版本", "每项规则记录来源、适用范围、更新时间和仍需专业复核之处。"]],
    B06: [["完成定义先于开工", "先写验收标准、失败回退和证据，再拆工程任务。"], ["小批量可验证交付", "把大项目拆成能独立验收、可回退的最小成果。"], ["证据跟随版本", "每次交付同步保存构建、测试、评审和验收证据。"]],
    C01: [["事实与推断分栏", "任何简报都把原始事实、分析推断和仍未知部分分开。"], ["冲突来源并列", "来源不一致时不替用户隐藏分歧，而是呈现冲突与可信边界。"], ["情报必须落到任务", "只有能解释对哪个目标、部门或决策的影响，信息才进入首页。"]],
    C02: [["情景代替假概率", "证据不足时给条件情景，不编造精确成功率。"], ["先定义转向信号", "行动前先约定何时转进、转守或废弃当前判断。"], ["预测必须回看", "史馆持续比较当时判断和真实结果，校准下一次推演。"]],
    C03: [["作品证明学习", "不以观看时长评估掌握程度，而以作品和真实任务表现评测。"], ["每天只练一个动作", "把复杂课程压缩成十分钟练习和一个可检查成果。"], ["升级先走影子模式", "新Agent或Skill先无权试运行，验证真实收益后再奏请授权。"]],
    C04: [["先整理变化时间线", "把什么时候开始、如何变化和已经尝试什么说清楚。"], ["咨询前准备问题", "用问题清单减少遗漏，提高与专业人士沟通效率。"], ["明确非诊断边界", "资料整理、风险提醒与专业诊断始终分开。"]],
    C05: [["最近有什么重要日子", "生日、纪念日、节假日和家庭约定集中准备。"], ["哪件事必须你亲自做", "陪伴、承诺和关系由你完成，琐事才交给AI。"], ["内务府能替你准备什么", "礼物候选、惊喜方案、行程草案、采购比较和提醒文案。"]],
    C06: [["后台千军，前台一责", "用户只面对一位主责，蜂群在后台按依赖协作。"], ["影子小队先试跑", "新编队先给出本来会怎么做，不产生现实副作用。"], ["每人只报真实贡献", "Agent只汇报自己完成的产物、证据和阻塞。"]],
    P01: [["外部能力先科举", "候选先核身份、契约、沙箱、安全和授权，再谈接入。"], ["只读连接优先", "企业系统先从最小只读范围开始，验证价值后再扩大权限。"], ["授权必须可撤销", "版本、任务、租户、费用与熔断条件共同进入授权证据包。"]]
  };
  const DOMAIN_OPERATING_MODELS = {
    E01: {
      label: "一人公司治理结构",
      units: [
        { title: "财务经营", meta: "现金流、预算、融资与投资", status: "户部", sigil: "财", page: "B02" },
        { title: "法务风控", meta: "合同、合规、审批与风险红线", status: "刑部", sigil: "法", page: "B05" },
        { title: "研发交付", meta: "产品、工程、质量与验收", status: "工部", sigil: "研", page: "B06" },
        { title: "销售增长", meta: "客户、渠道、报价与成交", status: "兵部", sigil: "销", page: "B04" },
        { title: "品牌市场", meta: "品牌、营销、内容与商务表达", status: "礼部", sigil: "市", page: "B03" },
        { title: "组织与AI员工", meta: "人类员工、Agent员工、责任与考功", status: "吏部", sigil: "组", page: "B01" }
      ],
      outputs: [
        { title: "OPC经营总览", meta: "看清收入、现金、客户、交付和唯一瓶颈", status: "可生成", sigil: "总", page: "A03", format: "经营总览＋今日瓶颈卡" },
        { title: "获客与销售作战图", meta: "得到优先客户、下一动作和报价边界", status: "可生成", sigil: "客", page: "L01", format: "客户战图＋销售动作卡" },
        { title: "产品交付计划", meta: "把承诺拆成可验收、可回退的成果", status: "可生成", sigil: "交", page: "N01", format: "里程碑＋验收与回退计划" }
      ],
      cases: [["老板只保留四类决定", "目标、关键关系、重大取舍和高影响批准由人负责，其余交给AI军团。"], ["先找唯一经营瓶颈", "每天只判断当前最限制增长的是获客、交付、现金还是组织。"], ["复杂任务交总经办", "跨三个以上部门或存在高风险时，由丞相形成结果契约并交军机处推进。"]]
    },
    E02: {
      label: "个人财富治理结构",
      units: [
        { title: "现金与预算", meta: "现金安全线、支出顺序和停止条件", status: "户部", sigil: "现", page: "H04" },
        { title: "投资研究", meta: "价值、反证、情景和配置边界", status: "户部", sigil: "投", page: "H02" },
        { title: "收入增长", meta: "事业收入、客户与商业机会", status: "兵部", sigil: "增", page: "L01" },
        { title: "财税与融资", meta: "材料、结构、现金用途与风险准备", status: "户部", sigil: "税", page: "H01" },
        { title: "合同与资产风险", meta: "规则、合同、授权和不可逆动作", status: "刑部", sigil: "险", page: "M01" }
      ],
      outputs: [
        { title: "财富安全线", meta: "知道现金是否安全、必须预留多少和何时重算", status: "可生成", sigil: "安", page: "H04", format: "安全线＋预算优先级" },
        { title: "投资研究报告", meta: "同时看到机会、反证、风险和放弃条件", status: "可生成", sigil: "研", page: "H02", format: "投资分析＋反证清单" },
        { title: "融资财税准备包", meta: "形成融资、财务和财税材料清单", status: "可生成", sigil: "融", page: "H01", format: "准备清单＋现金用途方案" }
      ],
      cases: [["先安全再增长", "没有真实现金安全线时，不推荐高风险扩张和交易。"], ["所有机会都带反证", "先说明什么事实会推翻判断，再讨论收益空间。"], ["交易永远最后确认", "研究、建议和执行分开，付款与交易逐项授权。"]]
    },
    E03: {
      label: "个人进化治理结构",
      units: [
        { title: "学习路线", meta: "目标、起点、十分钟练习和作品标准", status: "翰林院", sigil: "路", page: "I02" },
        { title: "前沿资料", meta: "官方文档、论文、GitHub和视频核验", status: "锦衣卫", sigil: "讯", page: "F01" },
        { title: "Agent与Skill选贤", meta: "来源、能力、风险、成本和评测", status: "翰林院", sigil: "贤", page: "I04" },
        { title: "作品与项目实践", meta: "用真实作品证明能力，不靠学习时长", status: "工部", sigil: "作", page: "N01" },
        { title: "复盘与成长证据", meta: "比较方法、作品和真实结果", status: "史馆", sigil: "史", page: "A06" }
      ],
      outputs: [
        { title: "今天十分钟学会什么", meta: "只练一个马上能用于真实任务的动作", status: "现在开始", sigil: "学", page: "I02", format: "十分钟训练卡＋作品标准" },
        { title: "做一件能展示的作品", meta: "边做边学，结束时留下提示词、方案、代码或成品", status: "可带走", sigil: "作", page: "I02", format: "作品＋方法复盘卡" },
        { title: "发现值得学的新能力", meta: "筛选前沿Agent、Skill与工作流，告诉你值不值得学", status: "每周更新", sigil: "新", page: "I04", format: "能力候选比较＋影子评测计划" }
      ],
      cases: [["我现在最缺哪项能力", "从正在推进的项目反推，不建立无尽课程表。"], ["怎样用AI让我学得更快", "先示范、再模仿、最后用作品检验。"], ["学完以后强在哪里", "用作品和真实任务前后对照，不用虚假排名。"]]
    },
    E04: {
      label: "个人生活治理结构",
      units: [
        { title: "日程与优先级", meta: "工作、家庭、出行和休息冲突", status: "内务府", sigil: "程", page: "O01" },
        { title: "家庭与关系", meta: "保留需要本人参与的重要事项", status: "内务府", sigil: "家", page: "C05" },
        { title: "采购与预算", meta: "比较方案、价格和授权边界", status: "户部", sigil: "采", page: "B02" },
        { title: "出行与外部信息", meta: "天气、交通、地点与风险核验", status: "锦衣卫", sigil: "行", page: "C01" },
        { title: "合同与权益", meta: "租赁、服务、取消和消费风险", status: "刑部", sigil: "权", page: "B05" },
        { title: "健康与恢复", meta: "记录、休息与专业咨询准备", status: "太医院", sigil: "养", page: "C04" }
      ],
      outputs: [
        { title: "家人生日与纪念日", meta: "提前准备礼物、祝福、惊喜与提醒", status: "去准备", sigil: "礼", page: "O01", format: "关怀计划＋惊喜清单" },
        { title: "节假日与周末安排", meta: "结合家人、预算和时间，给出少量真正合适的选择", status: "看安排", sigil: "假", page: "O01", format: "假日安排＋预算草案" },
        { title: "旅行聚会与生活代办", meta: "比较路线、预算和取消条件，再由你决定是否办理", status: "可预览", sigil: "行", page: "T01", format: "行程聚会方案＋授权预览" }
      ],
      cases: [["最近有什么重要日子", "生日、纪念日、节假日与家庭约定集中提醒。"], ["哪件事必须你亲自做", "陪伴、承诺和关系由你完成，琐事才交给AI。"], ["内务府能替你准备什么", "礼物候选、行程草案、采购比较和提醒文案。"]]
    },
    E05: {
      label: "个人健康治理结构",
      units: [
        { title: "变化与时间线", meta: "症状、作息、运动和已有材料", status: "太医院", sigil: "变", page: "O02" },
        { title: "专业咨询准备", meta: "摘要、问题清单和资料目录", status: "太医院", sigil: "询", page: "C04" },
        { title: "资料与证据核验", meta: "可靠来源、适用边界和未知", status: "锦衣卫", sigil: "证", page: "C01" },
        { title: "隐私与授权", meta: "按议题控制健康材料的查看范围", status: "刑部", sigil: "私", page: "D06" },
        { title: "作息与生活协调", meta: "日程、恢复和低风险记录习惯", status: "内务府", sigil: "养", page: "C05" }
      ],
      outputs: [
        { title: "最近哪里发生了变化", meta: "把睡眠、精力、运动、用药或检查按时间整理", status: "开始记录", sigil: "变", page: "O02", format: "健康变化时间线" },
        { title: "替家人准备一次关怀", meta: "整理父母复查、孩子成长或家人用药要问的问题", status: "去准备", sigil: "家", page: "O02", format: "家人关怀清单＋问题卡" },
        { title: "带走一份咨询准备包", meta: "摘要、资料目录和问题清单一次整理好", status: "可下载", sigil: "包", page: "D04", format: "可下载咨询准备包" }
      ],
      cases: [["是否有需要及时处理的信号", "只按明确安全规则提醒寻求专业帮助，不猜病因。"], ["下次咨询别忘了问什么", "把最容易遗漏的问题提前写好。"], ["哪些资料还缺", "只列缺口，不用推测填空。"]]
    },
    E06: {
      label: "个人娱乐与创作结构",
      units: [
        { title: "AI图像与视频", meta: "创意、提示词、分镜、生成与版本", status: "礼部", sigil: "创", page: "K03" },
        { title: "电影与视频发现", meta: "按时间和明确偏好减少选择", status: "内务府", sigil: "看", page: "O03" },
        { title: "素材与趋势情报", meta: "内容趋势、素材来源和新工具核验", status: "锦衣卫", sigil: "讯", page: "C01" },
        { title: "版权与发布审查", meta: "授权、版权、平台规则和发布预览", status: "刑部", sigil: "权", page: "B05" },
        { title: "作品收藏与复盘", meta: "版本、成果、反馈和可复用方法", status: "史馆", sigil: "藏", page: "A06" }
      ],
      outputs: [
        { title: "今晚只推荐一部", meta: "告诉我时间和心情，只给少量明确选择", status: "轻松选", sigil: "映", page: "O03", format: "观看选择＋时间安排" },
        { title: "把一个灵感做成图或视频", meta: "从一句想法到提示词、分镜和候选成品", status: "开始创作", sigil: "创", page: "K03", format: "创作任务书＋候选版本" },
        { title: "给家人朋友做个惊喜", meta: "纪念图、祝福视频、旅行回忆和节日内容一起策划", status: "有温度", sigil: "喜", page: "K03", format: "惊喜内容方案＋候选作品" }
      ],
      cases: [["30、60还是120分钟", "先按时间筛选，不让选片耗掉整晚。"], ["今天想被治愈还是被启发", "只问一个感受，不建立隐性兴趣画像。"], ["创作完成后带走什么", "保存成品、提示词、分镜和版本，下次可以继续。"]]
    }
  };
  const pageById = new Map(window.CHAOTANG_PAGES.map(page => [page.id, page]));
  Object.entries(DEPARTMENT_DASHBOARDS).forEach(([id, dashboard]) => {
    const page = pageById.get(id);
    if (!page) return;
    page.departmentDashboard = true;
    page.officeLabel = dashboard.officeLabel;
    page.offices = dashboard.offices;
    const resultContract = RESULT_CONTRACTS[id];
    page.benefits = dashboard.outputs.map((item, index) => ({
      ...item,
      page: resultContract.pages[index],
      format: resultContract.formats[index],
      inputs: resultContract.inputs,
      permission: resultContract.permission,
      contractState: "DEMO_TEMPLATE"
    }));
    page.watch = (METHOD_CASES[id] || []).map(([title, meta]) => ({ title, meta, status: "方法演示", sigil: "法", caseState: "DEMO_METHOD" }));
    page.marketTitle = dashboard.marketTitle;
    page.marketBoard = dashboard.market;
    page.departmentTasks = dashboard.tasks || WAITING_TASKS;
    page.portraitPosition = dashboard.portraitPosition;
  });
  Object.entries(DOMAIN_OPERATING_MODELS).forEach(([id, model]) => {
    const page = pageById.get(id);
    if (!page) return;
    page.domainOperatingModel = true;
    page.domainUnitLabel = model.label;
    page.domainUnits = model.units;
    page.benefits = model.outputs.map(item => ({
      ...item,
      inputs: `围绕“${page.title}”说明目标、当前情况、限制、截止时间和不能接受的后果`,
      permission: "先生成建议或成果草案；复杂跨部门任务由丞相形成结果契约，外部副作用仍需用户确认。",
      contractState: "DEMO_TEMPLATE"
    }));
    page.watch = model.cases.map(([title, meta]) => ({ title, meta, status: "方法演示", sigil: "法", caseState: "DEMO_METHOD" }));
    page.domainTasks = [
      { title: "当前没有真实六域任务", meta: "建立任务护照后才显示阶段、阻塞和成果；不会伪造忙碌。", status: "待命", sigil: "静" },
      { title: "复杂任务交丞相总经办", meta: "跨部门、长周期或高风险事项先确认结果契约，再交军机处推进。", status: "可商议", sigil: "相", page: "A02" }
    ];
  });
  Object.entries(hierarchy).forEach(([id, [level, parentPage]]) => {
    const page = pageById.get(id);
    if (!page) return;
    page.level = level;
    page.parentPage = parentPage;
  });
  Object.entries(linkOverrides).forEach(([id, abilities]) => {
    const page = pageById.get(id);
    if (page) page.abilities = abilities;
  });
  window.CHAOTANG_PAGES.forEach(page => { page.childPages = []; });
  window.CHAOTANG_PAGES.forEach(page => {
    if (page.parentPage && pageById.has(page.parentPage)) pageById.get(page.parentPage).childPages.push(page.id);
    page.kicker = `${page.title} · ${page.level}`;
    page.fiveDimensions.functionButtons = [
      page.primary,
      ...page.abilities.slice(0, 3).map(item => typeof item === "string" ? item : item.label)
    ];
    page.fiveDimensions.systemFit = `遵循同一任务护照、三级渐进披露、演示数据边界与${page.level}合同`;
  });
  const validatePageManifest = page => {
    const errors = [];
    if (!page.id || !page.title || !page.primary || !page.consequence) errors.push("IDENTITY_OR_ACTION_MISSING");
    if (!["DEMO", "PILOT", "LIVE", "NOT_CONNECTED"].includes(page.sourceState)) errors.push("INVALID_SOURCE_STATE");
    if (!["DEMO", "PILOT", "LIVE", "NOT_CONNECTED"].includes(page.capabilityState)) errors.push("INVALID_CAPABILITY_STATE");
    if (!["NONE", "PREVIEW_REQUIRED", "CONFIRM_REQUIRED"].includes(page.sideEffect)) errors.push("INVALID_SIDE_EFFECT");
    if (!["INHERIT_OR_CREATE", "INHERIT_ONLY", "CREATE_NEW"].includes(page.taskPassportPolicy)) errors.push("INVALID_TASK_POLICY");
    if (!Array.isArray(page.evidenceRefs)) errors.push("INVALID_EVIDENCE_REFS");
    if (!page.backendIntegration?.readiness || !page.backendIntegration?.connection || !page.backendIntegration?.owner || !Array.isArray(page.backendIntegration?.endpoints) || !page.backendIntegration?.next) errors.push("INVALID_BACKEND_INTEGRATION");
    if (page.sourceState === "LIVE" && (page.freshness === "NOT_CONNECTED" || page.evidenceRefs.length === 0)) errors.push("LIVE_WITHOUT_EVIDENCE");
    if (page.sideEffect !== "NONE" && !/预览|确认|授权/.test(page.consequence)) errors.push("SIDE_EFFECT_WITHOUT_CONFIRMATION");
    if (!page.reducedMotionFallback) errors.push("MISSING_MOTION_FALLBACK");
    if (!["主页面", "次级页面", "三级页面"].includes(page.level)) errors.push("INVALID_PAGE_LEVEL");
    if (page.level === "主页面") {
      if (page.railModel?.left !== "OUTPUT_FLOW" || page.railModel?.center !== "PREVIEW_DECIDE" || page.railModel?.right !== "INTELLIGENCE_FLOW") errors.push("INVALID_RAIL_FLOW_MODEL");
      for (const field of ["userGets", "whyNow", "onClick"]) if (!page.railContract?.[field]) errors.push(`MISSING_RAIL_CONTRACT_${field.toUpperCase()}`);
    }
    if (page.parentPage && !window.CHAOTANG_PAGES.some(candidate => candidate.id === page.parentPage)) errors.push("INVALID_PARENT_PAGE");
    if (!Array.isArray(page.childPages) || page.childPages.some(id => !window.CHAOTANG_PAGES.some(candidate => candidate.id === id))) errors.push("INVALID_CHILD_PAGES");
    if (!page.kicker.endsWith(`· ${page.level}`)) errors.push("KICKER_LEVEL_DRIFT");
    const expectedButtons = [page.primary, ...page.abilities.slice(0, 3).map(item => typeof item === "string" ? item : item.label)];
    if (JSON.stringify(page.fiveDimensions?.functionButtons) !== JSON.stringify(expectedButtons)) errors.push("FUNCTION_BUTTON_CONTRACT_DRIFT");
    for (const field of ["functionButtons", "contentDisplay", "interactionLogic", "artDirection", "systemFit"]) {
      if (!page.fiveDimensions?.[field] || (Array.isArray(page.fiveDimensions[field]) && page.fiveDimensions[field].length < 3)) errors.push(`MISSING_FIVE_DIMENSION_${field.toUpperCase()}`);
    }
    for (const field of ["morning", "evening", "meaningfulChange", "resumeLabel"]) {
      if (!page.dailyHook?.[field]) errors.push(`MISSING_DAILY_${field.toUpperCase()}`);
    }
    for (const field of ["domain", "artifact", "method", "evidence", "nextPractice"]) {
      if (!page.growthContract?.[field]) errors.push(`MISSING_GROWTH_${field.toUpperCase()}`);
    }
    for (const field of ["plan", "do", "check", "act"]) {
      if (!page.pdcaContract?.[field]) errors.push(`MISSING_PDCA_${field.toUpperCase()}`);
    }
    for (const state of ["empty", "loading", "failure", "insufficient", "permission", "stale"]) {
      if (!page.states?.[state]) errors.push(`MISSING_STATE_${state.toUpperCase()}`);
    }
    return errors;
  };
  window.CHAOTANG_VALIDATE_PAGE_MANIFEST = validatePageManifest;
  const invalidContracts = window.CHAOTANG_PAGES.filter(page => !page.roleDefinition || !page.userValue || !Array.isArray(page.benefits) || page.benefits.length < 3 || page.benefits.some(item => !item.title || !item.meta) || validatePageManifest(page).length);
  if (invalidContracts.length) throw new Error(`页面合同不完整：${invalidContracts.map(page => page.id).join(", ")}`);
})();

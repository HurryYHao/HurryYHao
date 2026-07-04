// 系统配置 - 环境变量与常量

// 可用的 AI 提供商
export const AI_PROVIDERS = {
  ZHENJING: 'zhenjing',
  COZE: 'coze',
  OPENAI: 'openai',
} as const;

// 支持的模型列表
export const AVAILABLE_MODELS = {
  [AI_PROVIDERS.ZHENJING]: [
    'gpt-4o-mini',
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
    'deepseek-chat',
    'deepseek-reasoner',
    'doubao-seed-2-0-pro-260215',
    'claude-3-5-sonnet-20241022',
    'gemini-2.0-flash-exp',
  ],
  [AI_PROVIDERS.COZE]: [
    'doubao-seed-2-0-pro-260215',
  ],
  [AI_PROVIDERS.OPENAI]: [
    'gpt-4o-mini',
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
  ],
} as const;

export const CONFIG = {
  // 鑫云平台账号 (从环境变量读取，不包含硬编码凭据)
  xinyun: {
    phone: process.env.XINYUN_PHONE || '',
    password: process.env.XINYUN_PASSWORD || '',
    tenantId: process.env.XINYUN_TENANT_ID || '',
  },

  // API 域名
  api: {
    clsjcorp: 'https://api.clsjcorp.com',
    xinyuntv: 'https://api.xinyuntv.com',
    leepow: 'https://api.leepow.com',
  },

  // AI 配置 - 现在统一使用 coze-coding-dev-sdk
  ai: {
    // 默认使用的 AI 提供商（只有COZE）
    defaultProvider: AI_PROVIDERS.COZE,
    // 帧境 API 配置（废弃，保留配置项以便未来扩展）
    zhenjing: {
      apiKey: process.env.ZHENJING_API_KEY || '',
      baseUrl: process.env.ZHENJING_BASE_URL || 'https://zhenjing.top/v1',
      model: process.env.ZHENJING_MODEL || 'gpt-4o-mini',
    },
    // Coze API 配置（通过 coze-coding-dev-sdk 自动管理）
    coze: {
      model: 'doubao-seed-2-0-pro-260215',
    },
  },

  // 腾讯云 ASR 配置
  tencentCloud: {
    secretId: process.env.TENCENTCLOUD_SECRET_ID || '',
    secretKey: process.env.TENCENTCLOUD_SECRET_KEY || '',
    region: process.env.TENCENTCLOUD_REGION || 'ap-guangzhou',
    appId: process.env.TENCENTCLOUD_APP_ID || '',
  },

  // 腾讯云 COS 配置
  cos: {
    secretId: process.env.COS_SECRET_ID || process.env.TENCENTCLOUD_SECRET_ID || '',
    secretKey: process.env.COS_SECRET_KEY || process.env.TENCENTCLOUD_SECRET_KEY || '',
    region: process.env.COS_REGION || process.env.TENCENTCLOUD_REGION || 'ap-guangzhou',
    bucket: process.env.COS_BUCKET || '',
    prefix: process.env.COS_PREFIX || 'ai-live-analysis',
  },

  // 管理页固定请求头
  adminHeaders: {
    Authorization: 'bGFtcF93ZWJfcHJvOmxhbXBfd2ViX3Byb19zZWNyZXQ=',
    applicationid: '1',
    tenantid: process.env.XINYUN_TENANT_ID || '',
    gray_version: 'lizhixiang',
    path: '/livemanage/openClassesRoom',
    Referer: 'https://console.clsjcorp.com/',
    Origin: 'https://console.clsjcorp.com',
  },

  // 调度参数
  pollIntervalSeconds: Number(process.env.POLL_INTERVAL_SECONDS) || 30,
  snapshotIntervalMinutes: Number(process.env.SNAPSHOT_INTERVAL_MINUTES) || 30,
  loginRetryMax: Number(process.env.LOGIN_RETRY_MAX) || 3,
  tokenRefreshThresholdSeconds: Number(process.env.TOKEN_REFRESH_THRESHOLD_SECONDS) || 300,

  // Token 有效期（鑫云管理页Token约2小时，监播页LiveToken约7天）
  tokenExpiryHours: 2,
  liveTokenExpiryDays: 7,
} as const;

// 直播状态枚举（来自鑫云平台 findPage API）
export const LIVE_STATUS = {
  STARTING: 'STARTING',     // 直播中
  STARTED: 'STARTED',       // 已结束
  NOT_STARTED: 'NOT_STARTED', // 未开播
} as const;

// 会话状态
export const SESSION_STATUS = {
  IDLE: 'idle',
  RECORDING: 'recording',
  ANALYZING: 'analyzing',
  ENDED: 'ended',
  ERROR: 'error',
} as const;

// 报告类型
export const REPORT_TYPE = {
  SEGMENT: 'segment',
  FINAL: 'final',
} as const;

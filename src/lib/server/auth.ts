// 鑫云平台 API 客户端 - 登录鉴权 + 请求封装

import { CONFIG } from './config';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { UniversalLLMClient } from './llm-client';

// ==================== 类型定义 ====================

interface TokenData {
  token: string;
  expiresAt: number; // Unix timestamp ms
}

interface LiveTokenData {
  liveToken: string;
  roomId: string;
  expiresAt: number;
}

interface CaptchaResult {
  key: string;
  imageBase64: string;
}

interface LoginResult {
  token: string;
  expiresAt: number;
}

interface TrtcInfo {
  sdkAppId: number;
  userId: string;
  userSig: string;
  roomId: string;
}

// ==================== 验证码解析 ====================

/**
 * 解析验证码：清理输入内容，返回纯数字或表达式
 */
function parseCaptcha(code: string): string {
  // 清理多余字符
  let cleaned = code.trim();
  // 去掉多余的空格
  cleaned = cleaned.replace(/\s+/g, '');
  // 去掉等号
  cleaned = cleaned.replace(/=+$/, '');
  
  // 如果能解析为纯数字，直接返回
  const numMatch = cleaned.match(/^\d+$/);
  if (numMatch) {
    return numMatch[0];
  }
  
  return cleaned;
}

// ==================== Token 管理 ====================

const TOKEN_KEY = 'xinyun_admin_token';
const LIVE_TOKEN_PREFIX = 'live_token_';

// 登录退避机制
let loginFailureCount = 0;
let loginBackoffUntil = 0; // Unix timestamp ms，在此时间之前不尝试登录
const LOGIN_MAX_BACKOFF_MS = 30 * 60 * 1000; // 最长退避 30 分钟
const LOGIN_BASE_BACKOFF_MS = 60 * 1000; // 基础退避 1 分钟

/**
 * 从数据库获取存储的 Token
 */
async function getStoredToken(): Promise<TokenData | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('system_config')
    .select('config_value')
    .eq('config_key', TOKEN_KEY)
    .maybeSingle();

  if (error || !data?.config_value) return null;

  try {
    return JSON.parse(data.config_value) as TokenData;
  } catch {
    return null;
  }
}

/**
 * 存储 Token 到数据库
 */
async function storeToken(tokenData: TokenData): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('system_config')
    .upsert(
      { config_key: TOKEN_KEY, config_value: JSON.stringify(tokenData), updated_at: new Date().toISOString() },
      { onConflict: 'config_key' }
    );

  if (error) throw new Error(`存储Token失败: ${(error as any).message || error}`);
}

/**
 * 获取存储的 LiveToken
 */
async function getStoredLiveToken(roomId: string): Promise<LiveTokenData | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('system_config')
    .select('config_value')
    .eq('config_key', `${LIVE_TOKEN_PREFIX}${roomId}`)
    .maybeSingle();

  if (error || !data?.config_value) return null;

  try {
    return JSON.parse(data.config_value) as LiveTokenData;
  } catch {
    return null;
  }
}

/**
 * 存储 LiveToken
 */
async function storeLiveToken(tokenData: LiveTokenData): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('system_config')
    .upsert(
      { config_key: `${LIVE_TOKEN_PREFIX}${tokenData.roomId}`, config_value: JSON.stringify(tokenData), updated_at: new Date().toISOString() },
      { onConflict: 'config_key' }
    );

  if (error) throw new Error(`存储LiveToken失败: ${(error as any).message || error}`);
}

// ==================== 登录流程 ====================

/**
 * Step 1: 获取验证码图片
 */
async function fetchCaptcha(): Promise<CaptchaResult> {
  const key = `xinyun_sync_${crypto.randomUUID().replace(/-/g, '')}`;
  const timestamp = Date.now();
  const url = `${CONFIG.api.clsjcorp}/api/oauth/anyTenant/captcha?key=${key}&_t=${timestamp}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`获取验证码失败: ${response.status}`);

  const contentType = response.headers.get('content-type') || '';
  let imageBase64: string;

  if (contentType.includes('json')) {
    // 返回 JSON 格式
    const json = await response.json() as { data?: { image?: string; img?: string; base64?: string } };
    imageBase64 = json.data?.image || json.data?.img || json.data?.base64 || '';
    if (!imageBase64) throw new Error('验证码响应中未找到图片数据');
  } else {
    // 返回图片二进制
    const buffer = Buffer.from(await response.arrayBuffer());
    imageBase64 = buffer.toString('base64');
  }

  return { key, imageBase64 };
}

/**
 * Step 2: 识别验证码（优先 LLM 图片识别，备选外部 OCR）
 */
async function ocrCaptcha(imageBase64: string): Promise<string> {
  // 优先使用 LLM 图片识别（doubao-seed-2-0-pro 支持图片输入）
  try {
    const llmResult = await llmOcrCaptcha(imageBase64);
    if (llmResult) return llmResult;
  } catch (err) {
    console.warn('LLM验证码识别失败，尝试外部OCR:', err instanceof Error ? err.message : err);
  }

  // 备选：外部 OCR 服务
  try {
    const response = await fetch(CONFIG.api.leepow, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64 }),
    });

    if (!response.ok) throw new Error(`外部OCR识别失败: ${response.status}`);

    const result = await response.json() as { code?: number; data?: string; result?: string; text?: string };
    const ocrText = result.data || result.result || result.text || '';

    if (!ocrText) throw new Error('外部OCR识别结果为空');

    return parseCaptcha(ocrText);
  } catch (err) {
    throw new Error(`验证码识别失败（LLM和外部OCR均不可用）: ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * 使用 LLM 图片识别验证码
 */
async function llmOcrCaptcha(imageBase64: string): Promise<string | null> {
  const client = new UniversalLLMClient();
  await client.initFromDb();

  const prompt = `你是一个验证码识别专家。请识别这张验证码图片中的数学表达式并计算出结果。

规则：
1. 验证码是一个二元数学表达式，格式为 "数字 运算符 数字 ="
2. 运算符可能是 +、-、×、÷
3. 请只返回计算结果的数字，不要返回任何其他内容
4. 例如：图片显示 "3+5=" 则返回 "8"，图片显示 "12-4=" 则返回 "8"`;

  const imageUrl = `data:image/png;base64,${imageBase64}`;

  const messages = [
    {
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: prompt },
        { type: 'image_url' as const, image_url: { url: imageUrl, detail: 'high' as const } },
      ],
    },
  ];

  const response = await client.invoke(messages as any, {
    temperature: 0.1,
  });

  const text = response.trim() || '';
  if (!text) return null;

  // 提取纯数字结果
  const numMatch = text.match(/-?\d+/);
  if (numMatch) return numMatch[0];

  // 如果 LLM 返回的是表达式，用 parseCaptcha 解析
  return parseCaptcha(text);
}

/**
 * Step 3: 验证码登录 (preLogin)
 * 需要 Authorization (Basic Auth) + applicationid + tenantid header
 * 端点: POST /api/oauth/anyTenant/preLogin
 */
async function preLogin(key: string, code: string): Promise<string> {
  const response = await fetch(`${CONFIG.api.clsjcorp}/api/oauth/anyTenant/preLogin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      Authorization: CONFIG.adminHeaders.Authorization,
      applicationid: '1',
      tenantid: CONFIG.adminHeaders.tenantid,
    },
    body: JSON.stringify({
      username: CONFIG.xinyun.phone,
      password: CONFIG.xinyun.password,
      grantType: 'CAPTCHA',
      key,
      code,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`preLogin失败: ${response.status} - ${errorBody}`);
  }

  const result = await response.json() as { code?: number; data?: { uuid?: string }; uuid?: string; isSuccess?: boolean; msg?: string };
  const uuid = result.data?.uuid || result.uuid;

  if (!uuid) throw new Error(`preLogin未返回uuid: ${JSON.stringify(result)}`);

  return uuid;
}

/**
 * Step 4: 选租户登录 (tenantLogin)
 * 需要 Authorization + applicationid + tenantid header
 * 端点: POST /api/oauth/anyTenant/tenantLogin
 * 注意: tenantLogin 也需要 key 和 code 字段
 */
async function tenantLogin(uuid: string, key: string, code: string): Promise<LoginResult> {
  const response = await fetch(`${CONFIG.api.clsjcorp}/api/oauth/anyTenant/tenantLogin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      Authorization: CONFIG.adminHeaders.Authorization,
      applicationid: '1',
      tenantid: CONFIG.adminHeaders.tenantid,
    },
    body: JSON.stringify({
      username: CONFIG.xinyun.phone,
      password: CONFIG.xinyun.password,
      grantType: 'CAPTCHA',
      key,
      code,
      uuid,
      tenantId: CONFIG.xinyun.tenantId,
    }),
  });

  if (!response.ok) throw new Error(`tenantLogin失败: ${response.status}`);

  const result = await response.json() as { code?: number; data?: { token?: string }; token?: string; isSuccess?: boolean };
  const token = result.data?.token || result.token;

  if (!token) throw new Error('tenantLogin未返回token');

  const expiresAt = Date.now() + CONFIG.tokenExpiryHours * 60 * 60 * 1000;

  return { token, expiresAt };
}

/**
 * Step 5: 获取监播页 LiveToken (createSession)
 * 
 * 认证策略（按优先级）：
 * 1. 新端点 + 已有的 LiveToken header（续期场景）
 * 2. 新端点 + 管理页 token header（首次获取）
 * 3. 旧端点 + 管理页 token header（兼容回退）
 * 
 * 新端点: POST /api/livebiz/openClassesRoom/assistant/public/createSession
 * 旧端点: POST /live/auth/createSession
 */
async function createLiveToken(roomId: string, adminToken: string): Promise<LiveTokenData> {
  // 先尝试使用已有的 LiveToken 续期
  const existingLiveToken = await getStoredLiveToken(roomId);
  const hasValidLiveToken = existingLiveToken && existingLiveToken.expiresAt > Date.now();

  // 策略1: 新端点 + LiveToken header（续期）
  if (hasValidLiveToken) {
    try {
      const result = await callCreateSession(
        `${CONFIG.api.xinyuntv}/api/livebiz/openClassesRoom/assistant/public/createSession`,
        roomId,
        { LiveToken: existingLiveToken.liveToken, gray_version: 'PROD' },
        'sessionToken'
      );
      if (result) return result;
    } catch {
      console.warn('[Auth] createSession 用LiveToken续期失败，尝试其他方式...');
    }
  }

  // 策略2: 旧端点 + 管理页 token + tenantid header
  try {
    const result = await callCreateSession(
      `${CONFIG.api.xinyuntv}/live/auth/createSession`,
      roomId,
      { token: adminToken, TenantId: CONFIG.xinyun.tenantId },
      'liveToken'
    );
    if (result) return result;
  } catch (e) {
    console.warn(`[Auth] 旧端点createSession失败: ${(e as Error).message}`);
  }

  // 策略3: 新端点 + 管理页 token + tenantid + gray_version
  try {
    const result = await callCreateSession(
      `${CONFIG.api.xinyuntv}/api/livebiz/openClassesRoom/assistant/public/createSession`,
      roomId,
      { token: adminToken, TenantId: CONFIG.xinyun.tenantId, gray_version: 'PROD' },
      'sessionToken'
    );
    if (result) return result;
  } catch (e) {
    console.warn(`[Auth] 新端点createSession(管理页token)失败: ${(e as Error).message}`);
  }

  // 策略4: 新端点 + LiveToken header + tenantid (无已有LiveToken时也尝试)
  try {
    const result = await callCreateSession(
      `${CONFIG.api.xinyuntv}/api/livebiz/openClassesRoom/assistant/public/createSession`,
      roomId,
      { TenantId: CONFIG.xinyun.tenantId, gray_version: 'PROD' },
      'sessionToken'
    );
    if (result) return result;
  } catch (e) {
    console.warn(`[Auth] 新端点createSession(无认证)失败: ${(e as Error).message}`);
  }

  throw new Error('createLiveToken: 所有认证策略均失败，无法获取LiveToken');
}

/**
 * 调用 createSession 端点的通用方法
 * @param url 完整URL
 * @param roomId 房间ID
 * @param extraHeaders 额外请求头
 * @param tokenField 返回数据中 token 的字段名（新端点=sessionToken，旧端点=liveToken）
 */
async function callCreateSession(
  url: string,
  roomId: string,
  extraHeaders: Record<string, string>,
  tokenField: 'sessionToken' | 'liveToken'
): Promise<LiveTokenData | null> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ roomId }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} - ${errBody.slice(0, 200)}`);
  }

  const result = await response.json() as {
    code?: number;
    data?: Record<string, unknown>;
    isSuccess?: boolean;
    msg?: string;
  };

  if (result.code && result.code !== 0) {
    throw new Error(`code=${result.code}, msg=${result.msg}`);
  }

  const tokenValue = result.data?.[tokenField] as string | undefined;
  // 也尝试另一个字段名（兼容新旧端点返回格式）
  const liveToken = tokenValue || (result.data?.liveToken as string) || (result.data?.sessionToken as string);
  if (!liveToken) return null;

  const expireTime = result.data?.expireTime as string | undefined;
  const expiresAt = expireTime
    ? parseInt(expireTime, 10)
    : Date.now() + CONFIG.liveTokenExpiryDays * 24 * 60 * 60 * 1000;

  return { liveToken, roomId, expiresAt };
}

// ==================== 公开 API ====================

// In-memory token cache
const memoryTokenCache = new Map<string, TokenData>();

/**
 * 完整登录流程（含验证码重试）
 */
export async function login(force: boolean = false, verbose: boolean = true): Promise<LoginResult> {
  // 退避检查：如果还在退避期，直接报错
  if (!force && Date.now() < loginBackoffUntil) {
    const remainSec = Math.ceil((loginBackoffUntil - Date.now()) / 1000);
    throw new Error(`登录退避中，${remainSec}秒后可重试（连续失败${loginFailureCount}次）`);
  }

  // 如果非强制，先检查缓存
  if (!force) {
    const cached = memoryTokenCache.get('admin');
    if (cached && cached.expiresAt > Date.now()) {
      return { token: cached.token, expiresAt: cached.expiresAt };
    }
    // 尝试从数据库恢复
    try {
      const stored = await getStoredToken();
      if (stored && stored.expiresAt > Date.now()) {
        memoryTokenCache.set('admin', stored);
        return { token: stored.token, expiresAt: stored.expiresAt };
      }
    } catch { /* ignore */ }
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= CONFIG.loginRetryMax; attempt++) {
    try {
      // Step 1: 获取验证码
      if (verbose) console.log(`[Auth] 登录尝试 ${attempt}/${CONFIG.loginRetryMax}: 获取验证码...`);
      const captcha = await fetchCaptcha();
      if (verbose) console.log(`[Auth] 验证码获取成功, key=${captcha.key}, 图片大小=${captcha.imageBase64.length}`);

      // Step 2: OCR 识别
      if (verbose) console.log(`[Auth] 开始识别验证码...`);
      const code = await ocrCaptcha(captcha.imageBase64);
      if (verbose) console.log(`[Auth] 验证码识别结果: ${code}`);

      // Step 3: preLogin
      if (verbose) console.log(`[Auth] 执行 preLogin...`);
      const uuid = await preLogin(captcha.key, code);
      if (verbose) console.log(`[Auth] preLogin成功, uuid=${uuid}`);

      // Step 4: tenantLogin (需要 key, code)
      if (verbose) console.log(`[Auth] 执行 tenantLogin...`);
      const loginResult = await tenantLogin(uuid, captcha.key, code);
      if (verbose) console.log(`[Auth] 登录成功!`);

      // 存储Token
      await storeToken(loginResult);
      memoryTokenCache.set('admin', {
        token: loginResult.token,
        expiresAt: loginResult.expiresAt,
      });

      // 登录成功，重置退避
      loginFailureCount = 0;
      loginBackoffUntil = 0;

      return loginResult;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (verbose) console.error(`[Auth] 登录尝试 ${attempt}/${CONFIG.loginRetryMax} 失败:`, lastError.message);
    }
  }

  // 登录全部失败，增加退避
  loginFailureCount++;
  const backoffMs = Math.min(LOGIN_BASE_BACKOFF_MS * loginFailureCount, LOGIN_MAX_BACKOFF_MS);
  loginBackoffUntil = Date.now() + backoffMs;
  console.warn(`[Auth] 登录连续失败${loginFailureCount}次，退避${Math.round(backoffMs / 1000)}秒`);

  throw new Error(`登录失败（重试${CONFIG.loginRetryMax}次）: ${lastError?.message}`);
}

/**
 * 获取验证码图片和 key
 */
export async function getCaptcha(): Promise<{ captchaImage: string; captchaKey: string }> {
  const key = `xinyun_sync_${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`;
  const url = `${CONFIG.api.clsjcorp}/api/oauth/anyTenant/captcha?key=${key}&_t=${Date.now()}`;

  const res = await fetch(url, {
    headers: {
      'Authorization': CONFIG.adminHeaders.Authorization,
      'applicationid': CONFIG.adminHeaders.applicationid,
      'tenantid': CONFIG.adminHeaders.tenantid,
      'Referer': CONFIG.adminHeaders.Referer,
      'Origin': CONFIG.adminHeaders.Origin,
    },
  });

  if (!res.ok) throw new Error(`获取验证码失败: ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const base64 = buffer.toString('base64');
  const captchaImage = `data:image/png;base64,${base64}`;

  return { captchaImage, captchaKey: key };
}

/**
 * 手动验证码登录
 */
export async function manualLogin(captchaKey: string, captchaCode: string): Promise<LoginResult> {
  // preLogin
  const preLoginBody = {
    username: CONFIG.xinyun.phone,
    password: CONFIG.xinyun.password,
    grantType: 'CAPTCHA',
    key: captchaKey,
    code: captchaCode,
  };

  const preLoginRes = await fetch(`${CONFIG.api.clsjcorp}/api/oauth/anyTenant/preLogin`, {
    method: 'POST',
    headers: {
      'Authorization': CONFIG.adminHeaders.Authorization,
      'applicationid': CONFIG.adminHeaders.applicationid,
      'tenantid': CONFIG.adminHeaders.tenantid,
      'Content-Type': 'application/json;charset=UTF-8',
      'Referer': CONFIG.adminHeaders.Referer,
      'Origin': CONFIG.adminHeaders.Origin,
    },
    body: JSON.stringify(preLoginBody),
  });

  if (!preLoginRes.ok) {
    const errText = await preLoginRes.text();
    throw new Error(`preLogin失败: ${preLoginRes.status} - ${errText}`);
  }

  const preLoginData = await preLoginRes.json();
  if (preLoginData.code !== 0) {
    throw new Error(preLoginData.msg || '验证码不正确');
  }

  const uuid = preLoginData.data?.uuid;
  if (!uuid) throw new Error('preLogin未返回uuid');

  // tenantLogin
  const tenantLoginBody = {
    ...preLoginBody,
    uuid,
    tenantId: CONFIG.xinyun.tenantId,
  };

  const tenantLoginRes = await fetch(`${CONFIG.api.clsjcorp}/api/oauth/anyTenant/tenantLogin`, {
    method: 'POST',
    headers: {
      'Authorization': CONFIG.adminHeaders.Authorization,
      'applicationid': CONFIG.adminHeaders.applicationid,
      'tenantid': CONFIG.adminHeaders.tenantid,
      'Content-Type': 'application/json;charset=UTF-8',
      'Referer': CONFIG.adminHeaders.Referer,
      'Origin': CONFIG.adminHeaders.Origin,
    },
    body: JSON.stringify(tenantLoginBody),
  });

  if (!tenantLoginRes.ok) {
    const errText = await tenantLoginRes.text();
    throw new Error(`tenantLogin失败: ${tenantLoginRes.status} - ${errText}`);
  }

  const tenantLoginData = await tenantLoginRes.json();
  if (tenantLoginData.code !== 0) {
    throw new Error(tenantLoginData.msg || '租户登录失败');
  }

  const token = tenantLoginData.data?.token;
  if (!token) throw new Error('tenantLogin未返回token');

  // 保存 token
  const expiresAt = Date.now() + 2 * 60 * 60 * 1000; // 2小时
  await storeToken({ token, expiresAt });

  console.info('[Auth] 手动登录成功!');
  return { token, expiresAt };
}

/**
 * 获取当前 Token 状态
 */
export async function getTokenStatus(): Promise<{ hasToken: boolean; expiresAt: number | null; isExpired: boolean }> {
  const stored = await getStoredToken();
  if (!stored) return { hasToken: false, expiresAt: null, isExpired: true };

  const isExpired = stored.expiresAt <= Date.now();
  return { hasToken: true, expiresAt: stored.expiresAt, isExpired };
}

/**
 * 获取有效的管理页 Token（自动刷新）
 */
export async function getAdminToken(verbose: boolean = false): Promise<string> {
  const stored = await getStoredToken();

  // Token 有效且未到刷新阈值
  if (stored && stored.expiresAt > Date.now() + CONFIG.tokenRefreshThresholdSeconds * 1000) {
    return stored.token;
  }

  // 需要刷新 - 重新登录
  const loginResult = await login(false, verbose);
  return loginResult.token;
}

/**
 * 获取有效的 LiveToken（自动刷新）
 */
export async function getLiveToken(roomId: string): Promise<string> {
  const stored = await getStoredLiveToken(roomId);

  if (stored && stored.expiresAt > Date.now()) {
    return stored.liveToken;
  }

  // 需要重新获取
  const adminToken = await getAdminToken();
  const result = await createLiveToken(roomId, adminToken);
  await storeLiveToken(result);
  return result.liveToken;
}

/**
 * 管理页 API 请求（自动带 Token + 固定请求头）
 */
export async function adminApiRequest<T = unknown>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    params?: Record<string, string>;
    pathOverride?: string;  // 覆盖默认的 path header（如统计API需要 /livemanage/openClassesRoom/analysis/{roomId}）
  } = {}
): Promise<T> {
  const token = await getAdminToken(true); // 启用详细日志
  const { method = 'POST', body, params, pathOverride } = options;

  let url = path.startsWith('http') ? path : `${CONFIG.api.clsjcorp}${path}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += (url.includes('?') ? '&' : '?') + searchParams.toString();
  }

  const headers: Record<string, string> = {
    ...CONFIG.adminHeaders,
    token,
    'Content-Type': 'application/json',
  };

  // 如果指定了 pathOverride，覆盖默认的 path header
  if (pathOverride) {
    headers.path = pathOverride;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    // Token 过期，清除并重试一次
    const client = getSupabaseClient();
    await client.from('system_config').delete().eq('config_key', TOKEN_KEY);

    const newToken = await getAdminToken(true); // 启用详细日志
    headers.token = newToken;

    const retryResponse = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!retryResponse.ok) throw new Error(`API请求失败(重试): ${retryResponse.status}`);
    return retryResponse.json() as Promise<T>;
  }

  if (!response.ok) throw new Error(`API请求失败: ${response.status}`);
  return response.json() as Promise<T>;
}

/**
 * 监播页 API 请求（自动带 LiveToken + gray_version）
 * 所有 xinyuntv.com 的 API 统一使用 LiveToken Header 认证
 */
export async function liveApiRequest<T = unknown>(
  path: string,
  roomId: string,
  options: {
    method?: string;
    body?: unknown;
    params?: Record<string, string>;
  } = {}
): Promise<T> {
  const liveToken = await getLiveToken(roomId);
  const { method = 'POST', body, params } = options;

  let url = path.startsWith('http') ? path : `${CONFIG.api.xinyuntv}/${path}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += (url.includes('?') ? '&' : '?') + searchParams.toString();
  }

  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    LiveToken: liveToken,
    gray_version: 'PROD',
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) throw new Error(`监播页API请求失败: ${response.status}`);
  return response.json() as Promise<T>;
}

/**
 * 获取 TRTC 进房参数 + IM + 白板 + 房间配置
 * 端点: GET /api/livebiz/openClassesRoom/assistant/public/getRoomParameter?roomId=xxx
 * 使用 LiveToken 认证
 */
export async function getRoomParameter(roomId: string): Promise<{
  trtc: TrtcInfo;
  im: Record<string, unknown>;
  whiteboard: Record<string, unknown>;
  mainUrl: string;
  liveSpaceId: string;
  baseSetting: Record<string, unknown>;
  userInfo: Record<string, unknown>;
}> {
  const liveToken = await getLiveToken(roomId);

  const response = await fetch(
    `${CONFIG.api.xinyuntv}/api/livebiz/openClassesRoom/assistant/public/getRoomParameter?roomId=${roomId}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
        Token: liveToken,
        TenantId: CONFIG.xinyun.tenantId,
      },
    }
  );

  if (!response.ok) throw new Error(`getRoomParameter失败: ${response.status}`);

  const result = await response.json() as {
    code: number;
    data: {
      roomId: string;
      liveSpaceId: string;
      trtc: TrtcInfo;
      im: Record<string, unknown>;
      whiteboard: Record<string, unknown>;
      mainUrl: string;
      baseSetting: Record<string, unknown>;
      userInfo: Record<string, unknown>;
    };
    isSuccess?: boolean;
  };

  if (result.code !== 0 || !result.data) {
    throw new Error(`getRoomParameter返回错误: code=${result.code}`);
  }

  return {
    trtc: result.data.trtc,
    im: result.data.im || {},
    whiteboard: result.data.whiteboard || {},
    mainUrl: result.data.mainUrl || '',
    liveSpaceId: result.data.liveSpaceId || '',
    baseSetting: result.data.baseSetting || {},
    userInfo: result.data.userInfo || {},
  };
}

/**
 * 获取 TRTC 进房参数（兼容旧调用）
 */
export async function getTrtcInfo(roomId: string): Promise<TrtcInfo> {
  const roomParam = await getRoomParameter(roomId);
  return roomParam.trtc;
}

/**
 * 获取房间的 liveSpaceId
 * 从管理页 API 获取（无需 LiveToken）
 */
export async function getLiveSpaceId(roomId: string): Promise<string | null> {
  try {
    const result = await adminApiRequest<{
      code: number;
      data: Array<{ id: string; liveSpaceId?: string }>;
      isSuccess?: boolean;
    }>(`/api/livemanage/roomLiveSpace/selectOptions?roomId=${roomId}`, { method: 'GET' });

    if (result.code === 0 && result.data?.length) {
      return result.data[result.data.length - 1]?.id || null;
    }
  } catch (err) {
    console.warn(`管理页API获取liveSpaceId失败(${roomId}):`, err instanceof Error ? err.message : err);
  }

  return null;
}

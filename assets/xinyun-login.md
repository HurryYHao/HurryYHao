# 鑫云(Xinyun)平台登录系统技术文档

## 一、系统概述

鑫云平台（`https://api.clsjcorp.com`）近期启用了验证码登录机制，`grantType: 'PASSWORD'` 已不再支持，必须使用 `CAPTCHA` 方式登录。本系统实现了完整的验证码登录流程，支持**手动输入验证码**和**自动OCR识别**两种模式。

### 核心变更
| 项目 | 旧方式 | 新方式 |
|------|--------|--------|
| grantType | PASSWORD | CAPTCHA |
| 登录端点 | /api/oauth/anyTenant/login | /api/oauth/anyTenant/tenantLogin |
| 是否需要验证码 | 否 | 是（数学表达式） |
| 是否需要预登录 | 否 | 是（获取UUID） |
| Token持久化 | 仅内存缓存 | 内存 + 数据库双写 |

---

## 二、登录流程

### 2.1 完整时序图

```
前端/定时任务          后端(xinyun-service)         鑫云平台           OCR服务
    │                      │                        │                 │
    │  1.请求验证码         │                        │                 │
    │─────────────────────>│  2.获取验证码图片        │                 │
    │                      │───────────────────────>│                 │
    │                      │<───────图片+key─────────│                 │
    │                      │                        │                 │
    │  [手动模式]           │                        │                 │
    │  返回验证码图片给用户  │                        │                 │
    │  用户输入验证码       │                        │                 │
    │                      │                        │                 │
    │  [自动模式]           │                        │                 │
    │                      │  3.OCR识别验证码         │                 │
    │                      │────────────────────────────────────────>│
    │                      │<───────────────────────识别结果──────────│
    │                      │  4.parseCaptcha计算结果  │                 │
    │                      │                        │                 │
    │  5.提交登录           │                        │                 │
    │─────────────────────>│  6.preLogin(预登录)     │                 │
    │                      │───────────────────────>│                 │
    │                      │<──uuid+租户列表─────────│                 │
    │                      │                        │                 │
    │                      │  7.tenantLogin(租户登录) │                 │
    │                      │───────────────────────>│                 │
    │                      │<─────token──────────────│                 │
    │                      │                        │                 │
    │                      │  8.保存token(内存+DB)    │                 │
    │<────登录结果──────────│                        │                 │
```

### 2.2 详细步骤

#### Step 1: 获取验证码
- **接口**: `GET https://api.clsjcorp.com/api/oauth/anyTenant/captcha?key={key}&_t={timestamp}`
- **参数**:
  - `key`: 32位随机字符串（前缀 `xinyun_sync_`）
  - `_t`: 时间戳（防缓存）
- **响应**: PNG验证码图片（二进制）
- **验证码类型**: 数学表达式，如 `3+5`、`9-2`、`4×6`、`8÷2`

#### Step 2: 预登录（preLogin）
- **接口**: `POST https://api.clsjcorp.com/api/oauth/anyTenant/preLogin`
- **请求头**:
  ```
  Content-Type: application/json;charset=UTF-8
  Authorization: bGFtcF93ZWJfcHJvOmxhbXBfd2ViX3Byb19zZWNyZXQ=
  applicationid: 1
  tenantid: 751087375173437746
  ```
- **请求体**:
  ```json
  {
    "username": "鑫云账号",
    "password": "鑫云密码",
    "grantType": "CAPTCHA",
    "key": "验证码key（与获取验证码时一致）",
    "code": "验证码计算结果（如：8）"
  }
  ```
- **响应**:
  ```json
  {
    "code": 0,
    "isSuccess": true,
    "data": {
      "uuid": "35b8ba540bef406db4722a133a330c53",
      "orgResultVO": {
        "tenantList": [
          {
            "id": "751087375173437746",
            "code": "GZWHQ",
            "name": "长沙体焰传..."
          }
        ]
      }
    }
  }
  ```

#### Step 3: 租户登录（tenantLogin）
- **接口**: `POST https://api.clsjcorp.com/api/oauth/anyTenant/tenantLogin`
- **请求头**: 同preLogin + `tenantid: {具体租户ID}`
- **请求体**:
  ```json
  {
    "username": "鑫云账号",
    "password": "鑫云密码",
    "grantType": "CAPTCHA",
    "key": "验证码key",
    "code": "验证码结果",
    "uuid": "preLogin返回的uuid",
    "tenantId": "751087375173437746"
  }
  ```
- **响应**:
  ```json
  {
    "code": 0,
    "isSuccess": true,
    "data": {
      "tenantId": "751087375173437746",
      "uuid": "35b8ba540bef406db4722a133a330c53",
      "token": "eyJ0eXAiOiJKc29uV2ViVG9rZW4iLCJhbGciOiJIUzI1NiJ9...",
      "expiration": null
    }
  }
  ```
- **注意**: `expiration` 字段可能为 null，系统默认按2小时有效期处理

---

## 三、验证码识别

### 3.1 自动识别（OCR）

使用第三方API自动识别验证码：

- **API**: `https://api.leepow.com/verifycode`
- **请求**:
  ```json
  { "image": "base64编码的验证码图片（不含data:image前缀）" }
  ```
- **响应**:
  ```json
  { "code": 0, "msg": null, "data": "3+5=8" }
  ```
- **准确率**: 约60-70%，可能将验证码中的 `?` 识别为数字，导致返回 `1+9=9`（实际应为 `1+9=?`）

### 3.2 数学表达式解析（parseCaptcha）

OCR返回的结果可能是以下格式，需要解析计算：

| OCR返回 | 解析过程 | 最终结果 |
|---------|---------|---------|
| `3+5` | 直接计算 | `8` |
| `9-2` | 直接计算 | `7` |
| `4*6` | 直接计算 | `24` |
| `1+9=9` | 去掉等号及后面 → `1+9` | `10` |
| `3×5=15` | 去掉等号及后面 → `3×5` | `15` |
| `6÷2` | 直接计算 | `3` |
| `42` | 纯数字直接返回 | `42` |

**关键逻辑**：
1. 先检测 `=` 号，如果等号前是有效表达式（`\d+[+-*/×÷]\d+`），则剥离等号及后面内容
2. 匹配简单二元表达式并计算
3. 纯数字直接返回
4. 兜底：尝试安全eval（仅允许数字和运算符）

### 3.3 自动登录重试机制

`loginWithAutoCaptcha(maxRetries=3)` 最多重试3次：
1. 获取验证码 → OCR识别 → preLogin → tenantLogin
2. 如果验证码错误（响应含"验证码"/"captcha"/"code"），重新获取验证码重试
3. 如果OCR识别失败，重试
4. 3次均失败则返回错误，提示手动登录

---

## 四、Token管理

### 4.1 Token生命周期

```
获取Token → 内存缓存(tokenCache) + 数据库持久化(system_settings)
     ↓
请求时优先读内存缓存
     ↓ (过期/无缓存)
读数据库持久化token
     ↓ (过期/无记录)
自动验证码登录(loginWithAutoCaptcha)
     ↓ (失败)
抛出异常，提示手动登录
```

### 4.2 存储位置

| 位置 | Key | 说明 |
|------|-----|------|
| 内存 | `tokenCache` | `{ token, expireTime }` 进程内缓存 |
| 数据库 | `xinyun_token` | JWT token原文 |
| 数据库 | `xinyun_token_expires_at` | ISO时间戳，如 `2026-06-22T10:13:06.545Z` |
| 数据库 | `xinyun_tenant_id` | 租户ID |

### 4.3 过期策略
- 内存缓存提前5分钟过期（避免边界请求失败）
- 数据库token提前5分钟过期
- 默认有效期2小时（鑫云API不返回expiration时）

### 4.4 Token失效自动恢复

`xinyunRequest()` 发起业务请求时：
1. 正常请求
2. 若返回 400/401/403 且包含 "token"/"验证" 关键字
3. 清除内存缓存 → 重新 `login()` → 重试请求

---

## 五、API接口文档

### 5.1 管理端登录接口

**路径**: `/api/admin/xinyun/login`

#### GET - 查询Token状态
```
GET /api/admin/xinyun/login?action=status
```
响应：
```json
{
  "hasToken": true,
  "expiresAt": "2026-06-22T10:13:06.545Z",
  "isExpired": false
}
```

#### GET - 获取验证码
```
GET /api/admin/xinyun/login?action=captcha
```
响应：
```json
{
  "captchaImage": "data:image/png;base64,iVBORw0KGgo...",
  "captchaKey": "xinyun_sync_xea66prb672t1lkqnb"
}
```

#### POST - 手动验证码登录
```
POST /api/admin/xinyun/login
Content-Type: application/json

{
  "captchaKey": "xinyun_sync_xea66prb672t1lkqnb",
  "captchaCode": "8"
}
```
成功响应：
```json
{
  "success": true,
  "message": "鑫云登录成功，Token已保存",
  "expiresAt": "2026-06-22T10:13:06.545Z"
}
```
失败响应：
```json
{
  "error": "验证码不正确",
  "needNewCaptcha": true
}
```

#### POST - 自动验证码登录
```
POST /api/admin/xinyun/login
Content-Type: application/json

{ "action": "auto" }
```
成功响应：
```json
{
  "success": true,
  "message": "鑫云自动登录成功",
  "expiresAt": "2026-06-22T10:13:06.545Z"
}
```

### 5.2 独立验证码接口

**路径**: `/api/xinyun/captcha`

```
GET /api/xinyun/captcha
```
响应同上 `?action=captcha`。

### 5.3 定时同步接口

**路径**: `/api/cron/xinyun-sync`

```
GET /api/cron/xinyun-sync?token=shanhu-auto-sync
```
此接口会自动调用 `login()` → 按需自动验证码登录 → 同步订单。

---

## 六、前端UI交互

### 6.1 管理后台设置页面

位置：`src/app/admin/settings/page.tsx` → 鑫云配置区域

**交互流程**：
1. 页面加载时自动调用 `?action=status` 检查Token状态
2. 点击「获取验证码」→ 调用 `?action=captcha` → 显示验证码图片
3. 用户输入验证码 → 点击「登录」→ POST手动登录
4. 或点击「自动登录」→ POST `{ action: "auto" }`
5. 点击验证码图片可刷新验证码
6. 登录成功后显示Token过期时间

### 6.2 状态变量

| 变量名 | 类型 | 说明 |
|--------|------|------|
| `xinyunCaptchaImage` | string | base64验证码图片 |
| `xinyunCaptchaKey` | string | 验证码key |
| `xinyunCaptchaCode` | string | 用户输入的验证码 |
| `xinyunCaptchaLoading` | boolean | 验证码加载中 |
| `xinyunCaptchaError` | string | 验证码错误信息 |
| `xinyunLoginLoading` | boolean | 登录中 |
| `xinyunLoginStatus` | string | 登录状态文本 |

---

## 七、核心文件清单

| 文件路径 | 说明 |
|---------|------|
| `src/lib/xinyun-service.ts` | 核心服务层：登录、验证码、Token管理、请求封装 |
| `src/app/api/admin/xinyun/login/route.ts` | 管理端登录API（状态查询/验证码/手动登录/自动登录） |
| `src/app/api/xinyun/captcha/route.ts` | 独立验证码API |
| `src/app/api/xinyun/sync/route.ts` | 订单同步API |
| `src/app/api/cron/xinyun-sync/route.ts` | 定时同步入口 |
| `src/app/admin/settings/page.tsx` | 管理后台设置页面（含鑫云登录UI） |

---

## 八、鑫云平台请求头规范

所有对鑫云平台的请求必须携带以下请求头：

```
Content-Type: application/json;charset=UTF-8
Authorization: bGFtcF93ZWJfcHJvOmxhbXBfd2ViX3Byb19zZWNyZXQ=
applicationid: 1
tenantid: 751087375173437746
token: {JWT token}                          # 业务请求时必带
gray_version: lizhixiang                     # 业务请求时必带
path: /livemanage/order                      # 业务请求时必带（lamp-cloud权限校验）
Referer: https://console.clsjcorp.com/
Origin: https://console.clsjcorp.com
```

**重要**：`path` 头是 lamp-cloud 框架的权限校验关键，必须匹配后台菜单资源路径，否则返回403。

---

## 九、常见问题排查

### 9.1 "验证码不正确"
- OCR识别不准确，尝试自动重试（最多3次）
- 手动输入模式更可靠
- 点击验证码图片刷新获取更清晰的图片

### 9.2 "UUID不能为空"
- preLogin失败，检查账号密码是否正确
- 检查验证码key与获取验证码时是否一致
- 验证码已过期（有效期约5分钟），需要重新获取

### 9.3 "授权类型不能为空"
- preLogin请求缺少 `grantType: "CAPTCHA"` 字段

### 9.4 "Invalid time value"
- 鑫云API返回的 `expiration` 字段格式异常或为null
- 系统已做容错处理，默认使用2小时有效期

### 9.5 Token频繁过期
- 鑫云Token有效期约2小时
- 系统在Token过期时会自动重新登录
- 如果自动登录失败，检查OCR服务是否可用

### 9.6 数据库Token与内存缓存不一致
- 正常现象：`login()` 先查内存缓存 → 再查数据库 → 最后重新登录
- 服务重启后内存缓存丢失，自动从数据库恢复

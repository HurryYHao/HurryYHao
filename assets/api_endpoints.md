---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 4a7fccb9e4f6f1ff830afdb2242e9356_d4c20ac4761211f19641525400d9a7a1
    ReservedCode1: nn/mje0mCew1LyhsD8BeUa4CbvnC/OFouHV5jHw10fhEkLhhfnRTUbjXf6qf6vF3/Fi+3tVR/DZE1OBmHJPxGs9SsO3bCNHZZexKZ31XzJr9Nzzn1OxSOZBAfs3IArtW3bsz528aeRxPUAXobcDglLsO7R/CntuBmRZ36ObNBhsWBFmfkq5BKTUhrlo=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 4a7fccb9e4f6f1ff830afdb2242e9356_d4c20ac4761211f19641525400d9a7a1
    ReservedCode2: nn/mje0mCew1LyhsD8BeUa4CbvnC/OFouHV5jHw10fhEkLhhfnRTUbjXf6qf6vF3/Fi+3tVR/DZE1OBmHJPxGs9SsO3bCNHZZexKZ31XzJr9Nzzn1OxSOZBAfs3IArtW3bsz528aeRxPUAXobcDglLsO7R/CntuBmRZ36ObNBhsWBFmfkq5BKTUhrlo=
---

﻿# 鑫云直播监播页 API 端点抓取报告

> 抓取日期: 2026-07-02 | 目标房间: roomId=100042779 "7月2号雅文老师闺蜜直播间"
> 域名: **api.xinyuntv.com**

---

## 认证机制

所有监播页 API 通过 HTTP Header **`LiveToken`** 进行认证（JWT 格式），不使用 Cookie。

`LiveToken` 来源：`createSession` 接口返回的 `data.sessionToken`。

JWT Payload 示例结构：
```json
{
  "nbf": 1782995628,
  "exp": 1783600428,
  "iat": 1782995628,
  "userId": 751086378741009631,
  "tenantId": 751087375173437746,
  "roomId": 100042779,
  "sessionId": "669a3f5b-deae-4338-ad2e-16bcabf68495",
  "sessionConnTime": "2026-07-02 20:33:48"
}
```

所有请求都需要携带：
- `LiveToken: <JWT>`
- `gray_version: PROD`（可选，用于灰度路由）

---

## API 1: createSession（获取 LiveToken）

| 属性 | 值 |
|------|-----|
| **域名** | `api.xinyuntv.com` |
| **完整路径** | `/api/livebiz/openClassesRoom/assistant/public/createSession` |
| **Method** | `POST` |
| **Content-Type** | `application/json` |

### 请求头

```
Content-Type: application/json
LiveToken: <当前有效的JWT> (首次调用可能不需要)
gray_version: PROD
```

### 请求体

```json
{
  "roomId": "100042779"
}
```

> `roomId` 为字符串类型。

### 响应结构

```json
{
  "code": 0,
  "data": {
    "roomSession": {
      "userId": "751086378741009631",
      "tenantId": "751087375173437746",
      "roomId": "100042779",
      "sessionId": "669a3f5b-deae-4338-ad2e-16bcabf68495",
      "sessionConnTime": "2026-07-02 20:33:48"
    },
    "sessionToken": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
    "expireTime": "1783600428866"
  },
  "msg": "ok",
  "path": null,
  "extra": null,
  "timestamp": "1782995628866",
  "isSuccess": true
}
```

关键字段：
- `data.sessionToken` — 即 LiveToken，用于后续所有 API 调用的认证
- `data.roomSession.sessionId` — 会话 ID
- `data.expireTime` — Token 过期时间（Unix 毫秒时间戳）

---

## API 2: getLiveStat（获取直播统计数据）

| 属性 | 值 |
|------|-----|
| **域名** | `api.xinyuntv.com` |
| **完整路径** | `/api/livebiz/openClassesRoom/assistant/public/getLiveStat` |
| **Method** | `GET` |
| **Query Params** | `liveSpaceId=784385672504781916` |

### 请求头

```
Accept: application/json, text/plain, */*
LiveToken: <JWT从createSession获取>
gray_version: PROD
```

### 请求参数（Query String）

| 参数 | 类型 | 值 | 说明 |
|------|------|-----|------|
| `liveSpaceId` | string | `784385672504781916` | 直播空间 ID |

### 响应结构

```json
{
  "code": 0,
  "data": {
    "startTime": "2026-07-02 20:00:21",
    "endTime": null,
    "watcherCnt": "939",
    "viewCnt": 1539,
    "peakConcurrentViewers": 501,
    "avgWatchTimeSeconds": "625",
    "commenterCnt": "122",
    "commentCnt": 271,
    "mallPageViewCnt": 0,
    "productClickCnt": 0,
    "transactionCnt": 0,
    "transactionAmount": "0.00",
    "payUserCnt": "0",
    "giftDonationCnt": 0,
    "giftDonationAmount": "0.00",
    "redPacketIssueCnt": 0,
    "redPacketAmount": "0.00",
    "complateCnt": null,
    "replyData": null,
    "nwatcherCnt": "228",
    "navgWatchTimeSeconds": "768"
  },
  "msg": "ok",
  "path": null,
  "extra": null,
  "timestamp": "1782995575511",
  "isSuccess": true
}
```

> ⚠️ 注意：`getLiveStat` 返回的是直播统计数据（观看人数、评论数等），**不包含 TRTC 进房参数**。TRTC 参数由下方 `getRoomParameter` 提供。

---

## 补充 API: getRoomParameter（获取 TRTC 进房参数 + IM + 白板 + 房间配置）

| 属性 | 值 |
|------|-----|
| **域名** | `api.xinyuntv.com` |
| **完整路径** | `/api/livebiz/openClassesRoom/assistant/public/getRoomParameter` |
| **Method** | `GET` |
| **Query Params** | `roomId=100042779` 或 `liveSpaceId=784385672504781916` |

### 请求头

```
LiveToken: <JWT从createSession获取>
gray_version: PROD
```

### 响应结构 — TRTC 部分

```json
{
  "code": 0,
  "data": {
    "roomId": "100042779",
    "liveSpaceId": "784385672504781916",
    "tenantId": "751087375173437746",
    "trtc": {
      "roomId": "100042779",
      "sdkAppId": "1600073723",
      "userId": "751086378741009631",
      "userSig": "eJw1jsEKgkAURf9l1pHvzTjzZoQWLVqVCGkI7QyneIilk0gQ...",
      "shareUserId": "share_751086378741009631",
      "shareUserSig": "eJw1jksLgkAUhf-LbAu54*jcUWg1VIssEEPBTQiONpgxPrIw..."
    },
    "im": {
      "appKey": "083111942048bf0a2136e7a3893a10ff",
      "accountId": "751086378741009631",
      "token": "426ec490b09516d5b924a98afcdf20dc",
      "nickName": "雅文老师助理",
      "avatar": "https://public-1342245288.cos.ap-guangzhou.myqcloud.com/...",
      "roomId": "15268679693",
      "serverExtension": "{\"role\":\"ASSISTANT\"}"
    },
    "whiteboard": {
      "sdkAppId": "1600073723",
      "userId": "whiteboard_100042779",
      "userSig": "eJw1jssOgjAURP*la6O3BSklceFzYQRJtBs2pqZFrwRto...",
      "classId": "100042779",
      "nonce": "1782995671859",
      "uid": "751086378741009631",
      "checkSum": "eca398f8f5cf0a4842c55ec0d79e98b22a98f35d",
      "curTime": "1782995671",
      "appKey": "083111942048bf0a2136e7a3893a10ff"
    },
    "mainUrl": "webrtc://play-stream.clsjcorp.com/live_1600073723/main_100042779_720p",
    "liveServiceProvider": "TENCENT",
    "baseSetting": {
      "name": "7月2号雅文老师闺蜜直播间",
      "liveStatus": "STARTING",
      "delayType": "SUPER_LOW_DELAY",
      "startTime": "2026-07-02 20:00:00",
      "upTime": "2026-07-02 20:00:21"
    },
    "userInfo": {
      "userId": "751086378741009631",
      "nickName": "雅文老师助理",
      "role": "ASSISTANT",
      "online": true
    }
  },
  "msg": "ok",
  "isSuccess": true
}
```

---

## 调用流程总结

```
1. POST /api/livebiz/openClassesRoom/assistant/public/createSession
   Body: { "roomId": "100042779" }
   → 获取 data.sessionToken (即 LiveToken)

2. GET /api/livebiz/openClassesRoom/assistant/public/getRoomParameter?roomId=100042779
   Header: LiveToken: <step1的sessionToken>
   → 获取 data.trtc.{sdkAppId, userId, userSig, roomId} (TRTC 进房参数)
   → 获取 data.im.{appKey, accountId, token, roomId} (IM 登录参数)
   → 获取 data.mainUrl (WebRTC 拉流地址)

3. GET /api/livebiz/openClassesRoom/assistant/public/getLiveStat?liveSpaceId=<liveSpaceId>
   Header: LiveToken: <step1的sessionToken>
   → 获取实时统计数据（观看人数、评论数等）
```

---

## 通用响应格式

所有 API 返回统一格式：
```json
{
  "code": 0,           // 0 = 成功
  "data": { ... },     // 业务数据
  "msg": "ok",         // 状态消息
  "path": null,
  "extra": null,
  "timestamp": "...",  // 时间戳（Unix 毫秒）
  "isSuccess": true
}
```

---

## 环境信息

| 项目 | 值 |
|------|-----|
| 管理后台 | `https://console.clsjcorp.com` |
| 监播页 | `https://console.assistant.clsjcorp.com/live?id=100042779` |
| API 域名 | `https://api.xinyuntv.com` |
| TRTC sdkAppId | `1600073723` |
| IM appKey | `083111942048bf0a2136e7a3893a10ff` |
| 直播服务商 | TENCENT（腾讯云） |
| 延迟类型 | SUPER_LOW_DELAY（超低延时） |
| 拉流地址 | `webrtc://play-stream.clsjcorp.com/live_1600073723/main_100042779_720p` |
*（内容由AI生成，仅供参考）*

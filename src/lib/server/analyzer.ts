// AI分析引擎 - 五维分析 + Skill自优化

import { getSupabaseClient } from '@/storage/database/supabase-client';
import { REPORT_TYPE, AI_PROVIDERS } from './config';
import { UniversalLLMClient } from './llm-client';
import { filterContent, filterForAI } from './content-filter';
import { getSessionSnapshots } from './fetcher';
import { memoryManager } from './memory-manager';

// ==================== 类型定义 ====================

interface FiveDimensionResult {
  anchor_analysis: string;       // 主播话术
  interaction_analysis: string;  // 互动热度
  conversion_analysis: string;   // 商品转化
  sentiment_analysis: string;    // 评论舆情
  rhythm_analysis: string;       // 直播节奏
}

// ==================== Skill 管理 ====================

const ANALYSIS_FRAMEWORK = `# 私域直播数据分析框架

你是一位专业的**私域直播**数据分析专家。请根据提供的直播数据，从五个维度进行深度分析。

**核心背景**：
1. **这是私域直播，不是公域直播**：没有算法推流、没有自然流量推荐，观众全部来自私域社群（微信群/朋友圈/粉丝群），流量规模远小于公域，不能用公域的流量标准来评判
2. **这是私密产品的直播**：销售的是两性健康/私护类产品，属于高隐私、高信任需求的品类，转化路径长，用户决策谨慎
3. **"教学+带货"混合模式**：主播以两性情感心理教学为切入点（痛点共情→心理解读→实操技巧→产品植入），分析时需要识别每个阶段的话术目的（建立信任→激发需求→促单）
4. **私域的关键指标是粉丝粘性和复购**，不是流量规模。在线人数100-500是私域直播的正常范围，不应用公域千万人标准来评判
5. **新粉进入渠道是社群邀请**，不是算法推荐；新粉占比高说明社群裂变效果好，是正向信号而非问题

### 1. 主播话术与内容结构分析
- 识别直播的典型阶段结构：开场暖场→情感痛点挖掘→心理理论（懂人性/两性差异）→实操技巧演示→产品植入→互动促单→收尾
- 分析每个阶段的话术策略：痛点共情（"他是不是不主动了"）→ 心理解读（"男人追求征服感"）→ 技巧教学（"教你三步拿回主动权"）→ 产品衔接（"用这个效果更好"）
- 评估话术的情绪调动能力：从"扎心"到"给方案"的节奏把控
- 识别高频口头禅与标志性话术
- **关联话术与数据涨跌：标注哪些话术后成交/互动明显上升或下降**
- 对主播共情力与感染力进行评分(1-10)
- **私域特色**：分析主播如何利用"姐妹"称呼、私域信任感、社群口碑来建立亲密关系

### 2. 互动热度与观众参与分析
- 评论量/在线人数时间曲线
- 互动率（评论数/在线人数）——**私域直播互动率通常高于公域，10%-30%属于正常范围**
- **重点识别"互动引导型"话术**：主播提问"你们选择一还是二""把老公年龄打在公屏上"等触发评论爆发的技巧
- 高峰低谷拐点识别，**定位互动爆发的具体时间点（精确到分秒），关联对应时段的话术**
- 观众评论中的高频诉求与情绪信号
- 标注互动高峰时段与低谷时段
- **私域特色**：评论是核心互动方式（非弹幕），每条评论都代表真实用户需求

### 3. 商品转化与销售节奏分析
- **重点分析"教学→产品"的衔接话术**：主播如何从心理课/实操课自然过渡到产品推荐
- 分析产品推荐频率与节奏：是集中推荐还是分散穿插
- 识别"效果暗示"话术：将产品使用效果与两性关系改善关联的表述
- 新粉/老粉转化率对比——**私域中新粉成交多说明社群裂变效果好，是正向信号**
- 观看→互动→下单→支付漏斗——**私密产品决策链长，每个环节的转化率天然低于快消品**
- **若下单未支付高则增加逼单话术提示"未支付的订单10分钟后自动关闭，库存有限"**
- **私域特色**：客单价和复购率比单次成交额更重要；产品是私密品类，用户不会在评论区公开咨询产品细节

### 4. 评论舆情与观众画像分析
- **真实用户评论样本情绪正负面分析（基于实际评论内容）**
- **高频关键词云（去除水词，如"有了""不会"等单字）**
- **观众画像提取**：从评论中判断观众群体特征（年龄段、婚恋状况、核心痛点）
- **需求分层分析**：将评论按需求类型归类（关系修复型/技巧学习型/产品咨询型/情感倾诉型）
- **负面预警：识别投诉、退款、差评信号**
- 标注评论爆发时间点
- **私域特色**：评论用户是高粘性粉丝，评论内容真实反映核心用户需求；少有水军/恶意评论

### 5. 直播节奏与效率分析
- **时间维度的数据波动，标注高峰低谷时段**
- **话术-数据涨跌交叉分析：哪个话术后成交涨/跌，哪个商品讲解后成交上升**
- 各环节时间占比：暖场/心理课/实操演示/产品推荐/互动 各占多少时间
- **节奏问题诊断**：是否存在某个阶段过长导致用户流失，或产品推荐时机不对
- 人均产值(成交/场观)分析及与历史对比——**私域人均产值通常远高于公域**
- 改进建议
- **私域特色**：不分析"流量推荐""推流"等公域概念，重点分析粉丝活跃时段、社群引流效率、私域运营动作（如群预告/朋友圈预热）对在线人数的影响

## 输出格式
请严格按照以下格式输出，包含两部分：
首先是 Markdown 格式的具体分析文本，然后在末尾输出 JSON 格式的结构化数据（必须包含在 \`\`\`json 代码块中）。

### 1. Markdown 格式要求
每个维度独立段落，使用 Markdown 格式。包含具体数据引用和分析。
- 综合表现总览
- ### 主播话术与内容结构
- ### 互动热度与观众参与
- ### 商品转化与销售节奏
- ### 评论舆情与观众画像
- ### 直播节奏与流量效率

### 2. JSON 格式要求
必须在最后严格输出以下 JSON 结构：
\`\`\`json
{
  "summary": "一句话总结本场/本片段表现",
  "scores": {
    "overall": 8.5,
    "anchor": 8.0,
    "interaction": 8.5,
    "conversion": 9.0,
    "sentiment": 8.0,
    "rhythm": 8.5
  },
  "alerts": [
    {
      "type": "warning",
      "severity": "high",
      "title": "预警标题",
      "description": "详细描述"
    }
  ],
  "action_items": [
    {
      "dimension": "conversion",
      "priority": "high",
      "title": "行动建议标题",
      "description": "具体怎么做"
    }
  ],
  "highlights": [
    {
      "dimension": "interaction",
      "title": "亮点总结"
    }
  ]
}
\`\`\``;

// ==================== 主播名称提取 ====================

/**
 * 从直播间名称中提取主播名称
 * 规则：提取"XX老师"等模式，否则取房间名关键部分
 */
export function extractAnchorName(roomName: string): string {
  if (!roomName || typeof roomName !== 'string') return '未知主播';

  // 优先匹配"XX老师"，但排除日期标记（号、日、月、年）
  // 先去掉日期部分（如"6月30号"、"7月1日"），再匹配老师
  const cleanedName = roomName.replace(/\d+月\d+[号日]|[0-9]{4}年/, '').trim();
  const teacherMatch = cleanedName.match(/([\u4e00-\u9fa5]{1,4}老师)/);
  if (teacherMatch) return teacherMatch[1];

  // 匹配"XX主播"
  const anchorMatch = roomName.match(/([\u4e00-\u9fa5]{1,4}主播)/);
  if (anchorMatch) return anchorMatch[1];

  // 匹配"XX的直播间"/"XX直播间"
  const roomMatch = roomName.match(/([\u4e00-\u9fa5]{1,6})的?直播间/);
  if (roomMatch) return roomMatch[1];

  // 默认取房间名前6字
  return roomName.slice(0, 6);
}

/**
 * 已知主播映射（手动补充，用于精确匹配）
 */
const KNOWN_ANCHORS: Record<string, string> = {
  '雅文': '雅文老师',
};

function resolveAnchorName(roomName: string): string {
  // 先检查已知主播映射
  for (const [keyword, anchorName] of Object.entries(KNOWN_ANCHORS)) {
    if (roomName.includes(keyword)) return anchorName;
  }
  return extractAnchorName(roomName);
}

// ==================== 前一场对比 ====================

/**
 * 获取同一主播的上一场直播关键指标，用于对比分析
 */
async function getPreviousSessionComparison(
  currentSessionId: number,
  anchorName: string
): Promise<string> {
  const client = getSupabaseClient();

  // 查找同一主播的上一场已结束直播
  const { data: prevSessions, error } = await client
    .from('live_sessions')
    .select('id, room_name, start_time, end_time, anchor_name')
    .eq('anchor_name', anchorName)
    .eq('status', 'ended')
    .neq('id', currentSessionId)
    .order('end_time', { ascending: false })
    .limit(1);

  if (error || !prevSessions || prevSessions.length === 0) return '';

  const prevSession = prevSessions[0];

  // 获取上一场的终场分析报告
  const { data: prevReports } = await client
    .from('analysis_reports')
    .select('analysis_text, report_type')
    .eq('session_id', prevSession.id)
    .eq('report_type', 'final')
    .order('id', { ascending: false })
    .limit(1);

  // 获取上一场的快照数据核心指标
  const { data: prevSnapshots } = await client
    .from('snapshot_data')
    .select('raw_json, snapshot_time')
    .eq('session_id', prevSession.id)
    .order('snapshot_seq', { ascending: false })
    .limit(1);

  // 提取上一场核心指标
  let prevMetrics = '';
  if (prevSnapshots && prevSnapshots.length > 0) {
    const rawJson = (prevSnapshots[0] as Record<string, unknown>).rawJson as Record<string, unknown> | null;
    if (rawJson) {
      const analysis = (rawJson.analysis as Record<string, unknown>) || {};
      const orderSummary = (rawJson.orderSummary as Record<string, unknown>) || {};
      prevMetrics = `
上一场核心指标:
- 峰值在线: ${analysis.peakConcurrentViewers || 'N/A'}
- 累计观看(场观): ${analysis.watcherCnt || 'N/A'}
- 评论数: ${analysis.commentCnt || 'N/A'}
- 成交总额: ¥${analysis.transactionAmount || orderSummary.totalAmount || 'N/A'}
- 成交单数: ${analysis.transactionCnt || orderSummary.paySuccessTotal || 'N/A'}
- 支付人数: ${analysis.payUserCnt || orderSummary.payUserTotal || 'N/A'}
	- 人均产值(成交/场观): ${Number(analysis.watcherCnt||0)>0 && Number(analysis.transactionAmount||orderSummary.totalAmount||0)>0 ? '¥'+(Number(analysis.transactionAmount||orderSummary.totalAmount||0)/Number(analysis.watcherCnt||0)).toFixed(2) : 'N/A'}`;
	    }
	  }

	  // 上一场分析摘要（取前1500字）
  let prevAnalysisSummary = '';
  if (prevReports && prevReports.length > 0 && prevReports[0].analysis_text) {
    const text = prevReports[0].analysis_text as string;
    prevAnalysisSummary = `\n\n上一场分析报告摘要:\n${text.slice(0, 1500)}${text.length > 1500 ? '...(已截断)' : ''}`;
  }

  const psRoomName = prevSession.roomName ?? prevSession.room_name ?? '';
  const psStartTime = prevSession.startTime ?? prevSession.start_time;
  const psEndTime = prevSession.endTime ?? prevSession.end_time;

  return `【与前一场对比数据】
上一场直播: ${psRoomName}
时间: ${psStartTime ? new Date(String(psStartTime)).toLocaleString('zh-CN') : 'N/A'} ~ ${psEndTime ? new Date(String(psEndTime)).toLocaleString('zh-CN') : 'N/A'}
${prevMetrics}${prevAnalysisSummary}

**请务必在分析中与前一场数据进行对比**，指出：
1. 各项指标的变化趋势（提升/下降/持平），必须包含人均产值(成交/场观)对比
2. 话术改进效果（对比上次的分析建议）
3. 互动和转化是否进步
4. 场观和人均产值的综合变化分析
5. 用【前场对比】标签标注所有对比内容`;
}

/**
 * 获取核心基准主播（雅文老师）的数据，用于跨主播对比
 */
async function getBenchmarkAnchorData(anchorName: string): Promise<string> {
  // 只有非雅文老师的主播才需要对比
  if (anchorName === '雅文老师') return '';

  const client = getSupabaseClient();

  // 获取雅文老师最近3场的关键指标
  const { data: benchmarkSessions } = await client
    .from('live_sessions')
    .select('id, room_name, start_time, end_time')
    .eq('anchor_name', '雅文老师')
    .eq('status', 'ended')
    .order('end_time', { ascending: false })
    .limit(3);

  if (!benchmarkSessions || benchmarkSessions.length === 0) return '';

  const metricsList: string[] = [];
  for (const session of benchmarkSessions) {
    const { data: snaps } = await client
      .from('snapshot_data')
      .select('raw_json')
      .eq('session_id', session.id)
      .order('snapshot_seq', { ascending: false })
      .limit(1);

    if (snaps && snaps.length > 0) {
      const rawJson = (snaps[0] as Record<string, unknown>).rawJson as Record<string, unknown> | null;
      if (rawJson) {
        const a = (rawJson.analysis as Record<string, unknown>) || {};
        const o = (rawJson.orderSummary as Record<string, unknown>) || {};
        const bAmount = Number(a.transactionAmount || o.totalAmount || 0);
        const bWatchers = Number(a.watcherCnt || 0);
        const bPerViewer = bWatchers > 0 && bAmount > 0 ? `¥${(bAmount/bWatchers).toFixed(2)}` : '-';
        const sRoomName = session.roomName ?? session.room_name ?? '';
        const sStartTime = session.startTime ?? session.start_time ?? '';
        metricsList.push(`  ${sRoomName}(${new Date(String(sStartTime)).toLocaleDateString('zh-CN')}): 峰值在线${a.peakConcurrentViewers||'-'} / 场观${a.watcherCnt||'-'} / 成交¥${bAmount||'-'} / ${a.transactionCnt||o.paySuccessTotal||'-'}单 / 人均产值${bPerViewer}`);
      }
    }
  }

  if (metricsList.length === 0) return '';

  return `【核心基准主播对比（雅文老师）】
以下是核心基准主播"雅文老师"的近期表现，请作为对比参考：
${metricsList.join('\n')}

**请在分析中与雅文老师的数据进行对比**，用【基准对比】标签标注，指出：
1. 与核心基准主播的差距，特别是人均产值差距
2. 场观效率对比：谁的人均产值更高，原因是什么
3. 可从雅文老师学习的话术和节奏策略
4. 针对性的追赶建议`;
}

/**
 * 获取当前活跃的 Skill（框架 + 知识）
 */
async function getActiveSkill(): Promise<{ content: string; version: string }> {
  const client = getSupabaseClient();

  // 获取最新Skill版本
  const { data: skillData, error } = await client
    .from('skill_versions')
    .select('content, version')
    .eq('is_active', 1)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !skillData) {
    // 首次运行：用框架 + 现有知识生成完整Skill
    const knowledgeContext = await buildKnowledgeContext();
    const fullSkill = knowledgeContext
      ? `${ANALYSIS_FRAMEWORK}\n\n${knowledgeContext}`
      : ANALYSIS_FRAMEWORK;
    return { content: fullSkill, version: 'v1' };
  }

  return { content: skillData.content, version: skillData.version };
}

/**
 * 从数据库构建知识上下文（模型无关的结构化知识）
 */
async function buildKnowledgeContext(): Promise<string> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('analysis_knowledge')
    .select('category, dimension, key, value, confidence, sample_count')
    .gte('confidence', 2)  // 只使用被验证2次以上的知识
    .order('confidence', { ascending: false });

  if (error || !data || data.length === 0) return '';

  // 按类别分组构建上下文
  const grouped = new Map<string, Map<string, { key: string; value: string; confidence: number; sample_count: number }[]>>();

  for (const row of data) {
    if (!grouped.has(row.category)) grouped.set(row.category, new Map());
    const catMap = grouped.get(row.category)!;
    if (!catMap.has(row.dimension)) catMap.set(row.dimension, []);
    catMap.get(row.dimension)!.push({
      key: row.key,
      value: row.value,
      confidence: row.confidence,
      sample_count: row.sample_count,
    });
  }

  const lines: string[] = ['# 历史分析知识库（自动积累）'];
  lines.push('> 以下知识来自历史分析经验的自动提取和验证，供参考使用。');

  // 阈值类知识
  const thresholdMap = grouped.get('threshold');
  if (thresholdMap) {
    lines.push('\n## 评估阈值标准');
    for (const [dim, items] of thresholdMap) {
      lines.push(`\n### ${getDimensionLabel(dim)}`);
      for (const item of items) {
        lines.push(`- ${item.key}: ${item.value} (置信度${item.confidence}/5, ${item.sample_count}次验证)`);
      }
    }
  }

  // 模式类知识
  const patternMap = grouped.get('pattern');
  if (patternMap) {
    lines.push('\n## 已识别的数据模式');
    for (const [dim, items] of patternMap) {
      lines.push(`\n### ${getDimensionLabel(dim)}`);
      for (const item of items) {
        lines.push(`- ${item.key}: ${item.value} (置信度${item.confidence}/5)`);
      }
    }
  }

  // 基准类知识
  const benchmarkMap = grouped.get('benchmark');
  if (benchmarkMap) {
    lines.push('\n## 行业基准数据');
    for (const [dim, items] of benchmarkMap) {
      lines.push(`\n### ${getDimensionLabel(dim)}`);
      for (const item of items) {
        lines.push(`- ${item.key}: ${item.value} (置信度${item.confidence}/5)`);
      }
    }
  }

  // 规则类知识
  const ruleMap = grouped.get('rule');
  if (ruleMap) {
    lines.push('\n## 分析规则与建议');
    for (const [dim, items] of ruleMap) {
      lines.push(`\n### ${getDimensionLabel(dim)}`);
      for (const item of items) {
        lines.push(`- ${item.key}: ${item.value} (置信度${item.confidence}/5)`);
      }
    }
  }

  return lines.join('\n');
}

function getDimensionLabel(dim: string): string {
  const labels: Record<string, string> = {
    anchor: '主播话术',
    interaction: '互动热度',
    conversion: '商品转化',
    sentiment: '评论舆情',
    rhythm: '直播节奏',
    general: '通用',
  };
  return labels[dim] || dim;
}

// ==================== 数据提取工具 ====================

/**
 * 格式化毫秒时间戳为 HH:MM:SS
 */
function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

/**
 * 从chartData中提取指定时间窗口的时序数据
 */
function extractChartWindow(
  chartData: Record<string, unknown>,
  startTime: Date | null,
  endTime: Date | null
): string {
  const xis = (chartData.xis as string[]) || [];
  const onlineList = (chartData.onlineUserCntList as number[]) || [];
  const commenterList = (chartData.commenterCntList as number[]) || [];
  const clickList = (chartData.productClickCntList as number[]) || [];
  const payUserList = (chartData.payUserCntList as number[]) || [];
  const amountList = (chartData.transactionAmountList as number[]) || [];
  const cntList = (chartData.transactionCntList as number[]) || [];
  const mallViewList = (chartData.mallPageViewCntList as number[]) || [];

  if (xis.length === 0) return '无时序数据';

  // Determine window indices
  let startIdx = 0;
  let endIdx = xis.length;

  if (startTime) {
    const startStr = `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}`;
    startIdx = xis.findIndex((t) => t >= startStr);
    if (startIdx === -1) startIdx = 0;
  }
  if (endTime) {
    const endStr = `${String(endTime.getHours()).padStart(2, '0')}:${String(endTime.getMinutes()).padStart(2, '0')}`;
    endIdx = xis.findIndex((t) => t >= endStr);
    if (endIdx === -1) endIdx = xis.length;
  }

  // Build time-series summary - sample to reduce data size (max 60 points)
  const windowXis = xis.slice(startIdx, endIdx);
  const windowOnline = onlineList.slice(startIdx, endIdx);
  const windowCommenter = commenterList.slice(startIdx, endIdx);
  const windowClick = clickList.slice(startIdx, endIdx);
  const windowPayUser = payUserList.slice(startIdx, endIdx);
  const windowAmount = amountList.slice(startIdx, endIdx);
  if (windowXis.length === 0) return '此时段无时序数据';

  // Calculate summary stats
  const onlineValues = windowOnline.filter(v => v !== undefined && v !== null);
  const avgOnline = onlineValues.length > 0 ? Math.round(onlineValues.reduce((a, b) => a + b, 0) / onlineValues.length) : 0;
  const maxOnline = onlineValues.length > 0 ? Math.max(...onlineValues) : 0;
  const minOnline = onlineValues.length > 0 ? Math.min(...onlineValues) : 0;

  // Find peak/trough minutes
  const peakOnlineIdx = onlineValues.indexOf(maxOnline);
  const troughOnlineIdx = onlineValues.indexOf(minOnline);

  // Sample the data points (take every Nth point if too many)
  const maxPoints = 60;
  const step = Math.max(1, Math.floor(windowXis.length / maxPoints));

  let timeSeriesLines: string[] = [];
  timeSeriesLines.push(`时间 | 在线 | 评论人数 | 商品点击 | 支付人数 | 成交额`);
  for (let i = 0; i < windowXis.length; i += step) {
    timeSeriesLines.push(
      `${windowXis[i]} | ${windowOnline[i] ?? '-'} | ${windowCommenter[i] ?? '-'} | ${windowClick[i] ?? '-'} | ${windowPayUser[i] ?? '-'} | ¥${windowAmount[i] ?? '-'}`
    );
  }

  return `
【时段统计】
- 时间范围: ${windowXis[0]} ~ ${windowXis[windowXis.length - 1]}
- 平均在线人数: ${avgOnline}
- 在线峰值: ${maxOnline} (时间: ${windowXis[peakOnlineIdx * step] || '-'})
- 在线低谷: ${minOnline} (时间: ${windowXis[troughOnlineIdx * step] || '-'})

【分钟级时序数据】
${timeSeriesLines.join('\n')}
`;
}

/**
 * 构建商品漏斗数据
 */
function buildGoodsFunnel(orderRecords: Record<string, unknown>[]): string {
  const goodsMap = new Map<string, {
    goodsName: string;
    goodsPrice: number;
    clickCount: number;
    buyCount: number;
    paidCount: number;
    unpaidCount: number;
    totalPaidAmount: number;
  }>();

  for (const o of orderRecords) {
    const name = String(o.goodsName || o.productName || '');
    if (!name) continue;
    const price = Number(o.goodsPrice || 0);
    const click = Number(o.clickCount || 0);
    const buy = Number(o.buyCount || 0);
    const payStatus = String(o.payStatus || '');
    const isPaid = payStatus === 'SUCCESS' || payStatus === 'PAID' || payStatus === '已支付';
    const payPrice = Number(o.payPrice || o.payAmount || 0);

    const existing = goodsMap.get(name);
    if (existing) {
      existing.clickCount += click;
      existing.buyCount += buy;
      if (isPaid) {
        existing.paidCount += 1;
        existing.totalPaidAmount += payPrice || price;
      } else if (payStatus === 'NOTPAY') {
        existing.unpaidCount += 1;
      }
    } else {
      goodsMap.set(name, {
        goodsName: name,
        goodsPrice: price,
        clickCount: click,
        buyCount: buy,
        paidCount: isPaid ? 1 : 0,
        unpaidCount: payStatus === 'NOTPAY' ? 1 : 0,
        totalPaidAmount: isPaid ? (payPrice || price) : 0,
      });
    }
  }

  if (goodsMap.size === 0) return '无商品订单数据';

  const lines: string[] = [];
  lines.push('商品名称 | 价格 | 点击次数 | 下单次数 | 已支付 | 未支付 | 点击→下单率 | 下单→支付率 | 支付总额');
  for (const g of goodsMap.values()) {
    const clickToOrder = g.clickCount > 0 ? `${((g.buyCount / g.clickCount) * 100).toFixed(1)}%` : '-';
    const orderToPaid = g.buyCount > 0 ? `${((g.paidCount / g.buyCount) * 100).toFixed(1)}%` : (g.paidCount > 0 ? '100%' : '-');
    lines.push(`${g.goodsName} | ¥${g.goodsPrice} | ${g.clickCount} | ${g.buyCount} | ${g.paidCount} | ${g.unpaidCount} | ${clickToOrder} | ${orderToPaid} | ¥${g.totalPaidAmount.toFixed(2)}`);
  }

  return lines.join('\n');
}

/**
 * 构建评论分析数据（带分秒级时间戳）
 */
function buildCommentsData(
  comments: Record<string, unknown>[],
  startTime: Date | null,
  endTime: Date | null
): string {
  // Filter by time window if specified
  let filtered = comments;
  if (startTime || endTime) {
    filtered = comments.filter((c) => {
      const ts = Number(c.timestamp || 0);
      if (!ts) return true; // keep if no timestamp
      const d = new Date(ts);
      if (startTime && d < startTime) return false;
      if (endTime && d > endTime) return false;
      return true;
    });
  }

  if (filtered.length === 0) return '无评论数据';

  // Count by sentiment keywords
  const positiveWords = ['好', '棒', '喜欢', '赞', '牛', '厉害', '太好了', '买了', '下单', '已拍', '谢谢', '爱'];
  const negativeWords = ['差', '烂', '垃圾', '骗', '假', '退', '差评', '失望', '不好', '不满', '坑', '贵'];
  const questionWords = ['怎么用', '多少钱', '多久', '什么时候', '能', '可以', '有没有', '吗', '？', '?', '如何', '效果'];

  let positiveCnt = 0;
  let negativeCnt = 0;
  let questionCnt = 0;
  const keywordMap = new Map<string, number>();

  for (const c of filtered) {
    const content = String(c.content || '');
    const isPositive = positiveWords.some(w => content.includes(w));
    const isNegative = negativeWords.some(w => content.includes(w));
    const isQuestion = questionWords.some(w => content.includes(w));
    if (isPositive) positiveCnt++;
    if (isNegative) negativeCnt++;
    if (isQuestion) questionCnt++;

    // Extract meaningful keywords (2+ chars, filter common stop words)
    const stopWords = new Set(['有了', '不会', '可以', '没有', '这个', '那个', '什么', '怎么', '老师', '还是', '一个', '就是', '已经', '现在', '自己', '知道', '这样', '的话', '是不是', '的话']);
    const words = content.replace(/[，。！？、；：""''（）【】\s]/g, ' ').split(/\s+/).filter(w => w.length >= 2 && !stopWords.has(w));
    for (const w of words) {
      keywordMap.set(w, (keywordMap.get(w) || 0) + 1);
    }
  }

  // Sort keywords by frequency
  const topKeywords = Array.from(keywordMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([word, cnt]) => `${word}(${cnt})`)
    .join(', ');

  // Categorize questions
  const priceQ = filtered.filter(c => /价|钱|多少|贵|便宜|优惠|折扣/.test(String(c.content))).length;
  const qualityQ = filtered.filter(c => /质量|效果|好用|管用|有用|有效/.test(String(c.content))).length;
  const shippingQ = filtered.filter(c => /物流|快递|发货|收货|到货|几天/.test(String(c.content))).length;
  const usageQ = filtered.filter(c => /怎么用|如何用|用法|使用|教程/.test(String(c.content))).length;

  // Negative warnings
  const negativeComments = filtered.filter(c => negativeWords.some(w => String(c.content || '').includes(w)));

  // Build comments sample with timestamps (不截断，展示全部评论数据)
  const commentSample = filtered.map((c) => {
    const ts = Number(c.timestamp || 0);
    const timeStr = ts > 0 ? formatTimestamp(ts) : '--:--:--';
    const userTag = c.isNewUser ? '[新]' : '[老]';
    const content = String(c.content || '');
    return `${timeStr} ${userTag}${c.nickname || '匿名'}: ${content}`;
  }).join('\n');

  return `
【评论统计】
- 总评论数: ${filtered.length}
- 正面情绪: ${positiveCnt}条 (${((positiveCnt / filtered.length) * 100).toFixed(1)}%)
- 负面情绪: ${negativeCnt}条 (${((negativeCnt / filtered.length) * 100).toFixed(1)}%)
- 提问类: ${questionCnt}条 (${((questionCnt / filtered.length) * 100).toFixed(1)}%)

【问题归类】
- 价格相关: ${priceQ}条
- 效果/质量相关: ${qualityQ}条
- 物流相关: ${shippingQ}条
- 使用方法相关: ${usageQ}条

【高频关键词Top30】
${topKeywords || '无'}

${negativeComments.length > 0 ? `【负面预警】\n${negativeComments.slice(0, 10).map(c => {
  const ts = Number(c.timestamp || 0);
  const timeStr = ts > 0 ? formatTimestamp(ts) : '--:--:--';
  return `⚠ ${timeStr} ${c.nickname || '匿名'}: ${c.content}`;
}).join('\n')}` : '【负面预警】无明显负面信号'}

【评论样本(前50条，含分秒时间戳)】
${commentSample}
`;
}

/**
 * 构建新老粉数据
 */
function buildNewoldData(newoldData: Record<string, string>): string {
  return `
【新老粉数据】
新学员:
- 观看人数: ${newoldData.nwatcherCnt || 'N/A'}
- 支付人数: ${newoldData.ntransactionUserCnt || 'N/A'}
- 转化率: ${newoldData.nconversionRate || 'N/A'}%
- 观看≥30min人数: ${newoldData.nwatcher30Cnt || 'N/A'}

老学员:
- 观看人数: ${newoldData.owatcherCnt || 'N/A'}
- 支付人数: ${newoldData.otransactionUserCnt || 'N/A'}
- 转化率: ${newoldData.oconversionRate || 'N/A'}%
- 观看≥30min人数: ${newoldData.owatcher30Cnt || 'N/A'}
`;
}

// ==================== 分析引擎 ====================

/**
 * 构建五维分析 Prompt
 */
/**
 * 获取与当前直播关联的历史脚本和商品成交基准
 */
async function getHistoricalScripts(): Promise<string> {
  const client = getSupabaseClient();
  
  const { data: scripts, error } = await client
    .from('live_scripts')
    .select('*')
    .order('id', { ascending: false })
    .limit(50);

  if (error || !scripts || scripts.length === 0) return '';

  const scriptText = scripts.map((s: Record<string, unknown>) => {
    const sd = s.sessionDate ?? s.session_date;
    const an = s.anchorName ?? s.anchor_name;
    const kw = s.keywords;
    const cp = s.contentPoints ?? s.content_points;
    const pl = s.productList ?? s.product_list;
    const td = s.transactionData ?? s.transaction_data;
    const rt = s.replayTransaction ?? s.replay_transaction;
    const parts = [`场次: ${sd}`];
    if (an) parts.push(`主播: ${an}`);
    if (kw) parts.push(`关键词: ${kw}`);
    if (cp) parts.push(`内容要点:\n${cp}`);
    if (pl) parts.push(`产品清单:\n${pl}`);
    if (td) parts.push(`成交数据:\n${td}`);
    if (rt) parts.push(`录播成交: ${rt}`);
    return parts.join('\n');
  }).join('\n---\n');

  return `【历史直播脚本与成交数据参考】\n以下为过往直播的脚本大纲和成交数据，用于对比分析当前直播表现、识别话术模式、建立成交基准线：\n\n${scriptText}`;
}

/**
 * 获取商品成交基准知识
 */
async function getProductBenchmarks(): Promise<string> {
  const client = getSupabaseClient();
  
  const { data: benchmarks, error } = await client
    .from('analysis_knowledge')
    .select('*')
    .in('category', ['benchmark', 'threshold', 'pattern'])
    .in('dimension', ['conversion', 'general'])
    .gte('confidence', 2)
    .order('sample_count', { ascending: false })
    .limit(30);

  if (error || !benchmarks || benchmarks.length === 0) return '';

  const grouped: Record<string, string[]> = {};
  for (const b of benchmarks) {
    const dim = b.dimension as string;
    if (!grouped[dim]) grouped[dim] = [];
    grouped[dim].push(`- ${b.key}: ${b.value} (置信度${b.confidence}, ${b.sample_count}次验证)`);
  }

  const text = Object.entries(grouped)
    .map(([dim, items]) => `### ${dim === 'conversion' ? '商品转化' : '通用'}基准\n${items.join('\n')}`)
    .join('\n\n');

  return `【商品成交基准数据】\n${text}`;
}

function buildAnalysisDataMarkdown(
  snapshotData: Record<string, unknown>[],
  reportType: 'segment' | 'final',
  segmentSeq: number,
  sessionStartTime: string | null = null,
): string {
  const typeLabel = reportType === REPORT_TYPE.FINAL ? '终场综合' : `第${segmentSeq}片段(近30分钟)`;

  // 计算直播已进行时长
  let liveDuration = '';
  if (sessionStartTime && reportType !== REPORT_TYPE.FINAL) {
    const start = new Date(sessionStartTime);
    const elapsed = Date.now() - start.getTime();
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    liveDuration = `，直播已进行约${hours}小时${minutes}分钟`;
  }
  const segmentContext = reportType === REPORT_TYPE.FINAL
    ? `终场综合分析（整场直播）。这是直播结束后的完整复盘，需综合所有片段数据，分析整场直播的完整时间线：开场暖场→情感痛点→心理理论→实操演示→产品植入→互动促单→收尾。重点关注：整场转化漏斗、各阶段数据变化趋势、话术策略的阶段性效果、产品销售节奏、主播全场的节奏把控能力。`
    : `这是本场直播的第${segmentSeq}个30分钟片段${liveDuration}。${segmentSeq === 1 ? '这是直播开场阶段。' : segmentSeq === 2 ? '这是直播前中期阶段。' : segmentSeq <= 4 ? '这是直播中段阶段，主播已进入核心内容。' : '这是直播后期阶段，主播应已进入深度内容和促单环节。'}请不要将非第1片段标注为"开场暖场"。`;

  // For segment analysis: determine the time window
  const mdLastSnap = snapshotData[snapshotData.length - 1];
  const snapshotTimeVal = mdLastSnap?.snapshotTime ?? mdLastSnap?.snapshot_time;
  const snapshotTime = snapshotTimeVal ? new Date(String(snapshotTimeVal)) : null;

  // For segment: window is last 30 min before snapshot_time
  // For final: window is entire session
  let windowStart: Date | null = null;
  let windowEnd: Date | null = null;

  if (reportType !== REPORT_TYPE.FINAL && snapshotTime) {
    windowEnd = snapshotTime;
    windowStart = new Date(snapshotTime.getTime() - 30 * 60 * 1000);
  }

  const sections: string[] = [];

  sections.push(`# 直播数据分析资料 - ${typeLabel}`);
  sections.push(`\n> 生成时间: ${new Date().toISOString()}`);
  sections.push(`> **片段上下文**: ${segmentContext}\n`);

  for (let idx = 0; idx < snapshotData.length; idx++) {
    const snap = snapshotData[idx];
    const rawJson = (snap.rawJson ?? snap.raw_json) as Record<string, unknown> | null;
    if (!rawJson) continue;

    const analysis = (rawJson.analysis as Record<string, unknown>) || {};
    const newoldData = (rawJson.newoldData as Record<string, string>) || {};
    const chartData = (rawJson.chartData as Record<string, unknown>) || {};
    const comments = (rawJson.comments as Record<string, unknown>[]) || [];
    const orderDetails = (rawJson.orderDetails as Record<string, unknown>[]) || [];
    const orderSummary = (rawJson.orderSummary as Record<string, unknown>) || {};
    const transcription = snap.transcription as string | null;
    // 对转写文字做轻量过滤（AI分析场景保留健康教育术语和产品名，仅移除极端违法内容）
    const filteredTranscription = transcription ? filterForAI(transcription).filtered : null;

    // Core metrics
    const onlineCount = analysis.peakConcurrentViewers || 'N/A';
    const avgOnline = chartData.onlineUserCntList
      ? Math.round((chartData.onlineUserCntList as number[]).reduce((a: number, b: number) => a + b, 0) / (chartData.onlineUserCntList as number[]).length)
      : 'N/A';
    const watcherCnt = analysis.watcherCnt || 'N/A';
    const viewCnt = analysis.viewCnt || 'N/A';
    const commentCnt = analysis.commentCnt || 'N/A';
    const commenterCnt = analysis.commenterCnt || 'N/A';
    const interactionRate = analysis.interactionRate || 'N/A';
    const productClickCnt = analysis.productClickCnt || 'N/A';
    const mallPageViewCnt = analysis.mallPageViewCnt || 'N/A';
    const transactionAmount = analysis.transactionAmount || orderSummary.totalAmount || 'N/A';
    const transactionCnt = analysis.transactionCnt || orderSummary.paySuccessTotal || 'N/A';
    const payUserCnt = analysis.payUserCnt || orderSummary.payUserTotal || 'N/A';
    const avgWatchTime = analysis.avgWatchTime || 'N/A';
    const displayOnline = reportType === REPORT_TYPE.FINAL ? onlineCount : avgOnline;

    sections.push(`\n## 片段 ${idx + 1} (快照时间: ${snap.snapshotTime ?? snap.snapshot_time})\n`);

    sections.push(`### 核心指标\n`);
    sections.push(`| 指标 | 数值 |`);
    sections.push(`|------|------|`);
    sections.push(`| 当前/峰值在线人数 | ${displayOnline}${reportType !== REPORT_TYPE.FINAL ? ` (平均${avgOnline})` : ''} |`);
    sections.push(`| 累计观看人数 | ${watcherCnt} |`);
    sections.push(`| 累计观看人次 | ${viewCnt} |`);
    sections.push(`| 评论数(条) | ${commentCnt} |`);
    sections.push(`| 评论人数(人) | ${commenterCnt} |`);
    sections.push(`| 互动率 | ${interactionRate}% |`);
    sections.push(`| 商品点击次数 | ${productClickCnt} |`);
    sections.push(`| 商城浏览次数 | ${mallPageViewCnt} |`);
    sections.push(`| 成交总额 | ¥${transactionAmount} |`);
    sections.push(`| 成交单数 | ${transactionCnt} |`);
    sections.push(`| 支付人数 | ${payUserCnt} |`);
    sections.push(`| 人均产值(成交/场观) | ${Number(watcherCnt) > 0 && Number(transactionAmount) > 0 ? '¥' + (Number(transactionAmount) / Number(watcherCnt)).toFixed(2) : 'N/A'} |`);
    sections.push(`| 平均观看时长 | ${avgWatchTime}秒 |`);

    // 主播语音转写 - 完整不截断
    if (filteredTranscription) {
      sections.push(`\n### 主播语音转写\n\n${filteredTranscription}\n`);
    } else {
      sections.push(`\n### 主播语音转写\n\n暂无转写数据\n`);
    }

    // 新老粉数据
    sections.push(`\n### 新老粉数据\n`);
    sections.push(`**新学员:**`);
    sections.push(`- 观看人数: ${newoldData.nwatcherCnt || 'N/A'}`);
    sections.push(`- 支付人数: ${newoldData.ntransactionUserCnt || 'N/A'}`);
    sections.push(`- 转化率: ${newoldData.nconversionRate || 'N/A'}%`);
    sections.push(`- 观看≥30min人数: ${newoldData.nwatcher30Cnt || 'N/A'}`);
    sections.push(`\n**老学员:**`);
    sections.push(`- 观看人数: ${newoldData.owatcherCnt || 'N/A'}`);
    sections.push(`- 支付人数: ${newoldData.otransactionUserCnt || 'N/A'}`);
    sections.push(`- 转化率: ${newoldData.oconversionRate || 'N/A'}%`);
    sections.push(`- 观看≥30min人数: ${newoldData.owatcher30Cnt || 'N/A'}`);

    // 时间曲线数据
    sections.push(`\n### 时间曲线数据\n\n${extractChartWindow(chartData, windowStart, windowEnd)}\n`);

    // 商品漏斗数据
    sections.push(`\n### 商品漏斗数据(点击→下单→支付)\n\n${buildGoodsFunnel(orderDetails)}\n`);

    // 评论舆情数据 - 完整不截断
    sections.push(`\n### 评论舆情数据\n\n${buildCommentsDataFull(comments, windowStart, windowEnd)}\n`);
  }

  // For final analysis, collect all transcriptions into a complete script
  if (reportType === REPORT_TYPE.FINAL) {
    const transcriptions = snapshotData
      .map((snap, idx) => {
        const t = snap.transcription as string | null;
        const filtered = t ? filterForAI(t).filtered : null;
        return filtered ? `### 片段${idx + 1}\n\n${filtered}` : '';
      })
      .filter(Boolean)
      .join('\n\n');
    if (transcriptions) {
      sections.push(`\n## 整场直播完整脚本\n\n${transcriptions}\n`);
    }
  }

  return sections.join('\n');
}

/**
 * 构建完整评论数据（不截断，用于 md 文件）
 */
function buildCommentsDataFull(
  comments: Record<string, unknown>[],
  windowStart: Date | null,
  windowEnd: Date | null
): string {
  if (!comments || comments.length === 0) return '暂无评论数据';

  // Filter by time window if specified
  const filtered = windowStart && windowEnd
    ? comments.filter(c => {
        const ts = Number(c.timestamp || 0);
        if (!ts) return true;
        const d = new Date(ts);
        return d >= windowStart! && d <= windowEnd!;
      })
    : comments;

  if (filtered.length === 0) return '时间窗口内暂无评论';

  // Sentiment analysis
  const positiveWords = ['好', '棒', '喜欢', '想要', '买了', '下单', '赞', '厉害', '牛', '漂亮', '心动', '好看', '爱', '帅', '美', '甜', '舒服', '推荐', '值', '可以', '实惠', '质量好', '正品', '靠谱'];
  const negativeWords = ['差', '烂', '假', '骗', '退款', '投诉', '垃圾', '贵', '慢', '坏', '失望', '难用', '不好', '不满', '坑', '无语', '套路', '再也不', '被坑', '退货', '忽悠'];
  const questionWords = ['吗', '呢', '？', '怎么', '什么', '哪', '多少', '如何', '为什么', '能不能', '可以吗'];

  let positiveCnt = 0, negativeCnt = 0, questionCnt = 0;
  let priceQ = 0, qualityQ = 0, shippingQ = 0, usageQ = 0;
  const keywordMap = new Map<string, number>();

  for (const c of filtered) {
    const content = String(c.content || '');
    if (positiveWords.some(w => content.includes(w))) positiveCnt++;
    if (negativeWords.some(w => content.includes(w))) negativeCnt++;
    if (questionWords.some(w => content.includes(w))) questionCnt++;
    if (/价格|多少钱|贵|便宜|优惠|打折/.test(content)) priceQ++;
    if (/效果|质量|好用|正品|假/.test(content)) qualityQ++;
    if (/发货|快递|物流|到货|包邮/.test(content)) shippingQ++;
    if (/怎么用|使用|方法|步骤|教程/.test(content)) usageQ++;
    // Extract keywords (2-4 char segments)
    for (let i = 0; i < content.length - 1; i++) {
      const kw = content.substring(i, Math.min(i + 4, content.length));
      if (kw.length >= 2 && /[\u4e00-\u9fff]/.test(kw)) {
        keywordMap.set(kw, (keywordMap.get(kw) || 0) + 1);
      }
    }
  }

  const topKeywords = [...keywordMap.entries()]
    .filter(([, cnt]) => cnt >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([kw, cnt]) => `${kw}(${cnt})`)
    .join(', ');

  const negativeComments = filtered.filter(c => negativeWords.some(w => String(c.content || '').includes(w)));

  // Build full comments list (no truncation)
  const commentList = filtered.map((c) => {
    const ts = Number(c.timestamp || 0);
    const timeStr = ts > 0 ? formatTimestamp(ts) : '--:--:--';
    const userTag = c.isNewUser ? '[新]' : '[老]';
    return `${timeStr} ${userTag}${c.nickname || '匿名'}: ${c.content}`;
  }).join('\n');

  return `
【评论统计】
- 总评论数: ${filtered.length}
- 正面情绪: ${positiveCnt}条 (${((positiveCnt / filtered.length) * 100).toFixed(1)}%)
- 负面情绪: ${negativeCnt}条 (${((negativeCnt / filtered.length) * 100).toFixed(1)}%)
- 提问类: ${questionCnt}条 (${((questionCnt / filtered.length) * 100).toFixed(1)}%)

【问题归类】
- 价格相关: ${priceQ}条
- 效果/质量相关: ${qualityQ}条
- 物流相关: ${shippingQ}条
- 使用方法相关: ${usageQ}条

【高频关键词Top30】
${topKeywords || '无'}

${negativeComments.length > 0 ? `【负面预警】\n${negativeComments.slice(0, 20).map(c => {
  const ts = Number(c.timestamp || 0);
  const timeStr = ts > 0 ? formatTimestamp(ts) : '--:--:--';
  return `⚠ ${timeStr} ${c.nickname || '匿名'}: ${c.content}`;
}).join('\n')}` : '【负面预警】无明显负面信号'}

【全部评论(共${filtered.length}条)】
${commentList}
`;
}

function buildAnalysisPrompt(
  skillContent: string,
  snapshotData: Record<string, unknown>[],
  reportType: 'segment' | 'final',
  segmentSeq: number,
  historicalContext: string = '',
  previousSessionComparison: string = '',
  benchmarkAnchorData: string = '',
  sessionStartTime: string | null = null,
): string {
  const typeLabel = reportType === REPORT_TYPE.FINAL ? '终场综合' : `第${segmentSeq}片段(近30分钟)`;

  // 计算直播已进行时长
  let liveDuration = '';
  if (sessionStartTime && reportType !== REPORT_TYPE.FINAL) {
    const start = new Date(sessionStartTime);
    const elapsed = Date.now() - start.getTime();
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    liveDuration = `，直播已进行约${hours}小时${minutes}分钟`;
  }
  const segmentContext = reportType === REPORT_TYPE.FINAL
    ? '终场综合分析（整场直播）'
    : `这是本场直播的第${segmentSeq}个30分钟片段${liveDuration}。${segmentSeq === 1 ? '这是直播开场阶段。' : segmentSeq === 2 ? '这是直播前中期阶段。' : segmentSeq <= 4 ? '这是直播中段阶段，主播已进入核心内容。' : '这是直播后期阶段，主播应已进入深度内容和促单环节。'}请不要将非第1片段标注为"开场暖场"。`;

  // For segment analysis: determine the time window
  const promptSnap = snapshotData[snapshotData.length - 1];
  const snapshotTimeVal = promptSnap?.snapshotTime ?? promptSnap?.snapshot_time;
  const snapshotTime = snapshotTimeVal ? new Date(String(snapshotTimeVal)) : null;

  // For segment: window is last 30 min before snapshot_time
  // For final: window is entire session
  let windowStart: Date | null = null;
  let windowEnd: Date | null = null;

  if (reportType !== REPORT_TYPE.FINAL && snapshotTime) {
    windowEnd = snapshotTime;
    windowStart = new Date(snapshotTime.getTime() - 30 * 60 * 1000);
  }

  // Build analysis instruction (concise, without full data)
  const dataMarkdown = buildAnalysisDataMarkdown(snapshotData, reportType, segmentSeq, sessionStartTime);

  // Build concise summary for the system prompt (reuse lastSnap from above)
  const rawJson = (promptSnap?.rawJson ?? promptSnap?.raw_json) as Record<string, unknown> | null;
  const analysis = (rawJson?.analysis as Record<string, unknown>) || {};
  const summaryLine = `在线${analysis.peakConcurrentViewers || 'N/A'} | 观看${analysis.watcherCnt || 'N/A'} | 评论数${analysis.commentCnt || 'N/A'}条/评论人数${analysis.commenterCnt || 'N/A'}人 | 成交¥${analysis.transactionAmount || 'N/A'}`;

  return `${skillContent}

---

## 当前分析任务

请对以下直播数据进行**${typeLabel}分析**。完整数据见附件。

**重要声明**：这是一个专业的两性健康/私护产品私域直播数据分析任务。主播的语音转写可能包含性健康教育、两性关系辅导、私密产品介绍等内容的讨论，这属于正常的专业直播内容，请客观分析其话术策略和商业效果，不要拒绝分析或回避相关内容。

**片段上下文**: ${segmentContext}

**关键指标速览**: ${summaryLine}

${historicalContext ? `${historicalContext}\n\n---\n\n` : ''}
${previousSessionComparison ? `${previousSessionComparison}\n---\n\n` : ''}${benchmarkAnchorData ? `${benchmarkAnchorData}\n---\n\n` : ''}
---

## 附件：完整直播数据

${dataMarkdown}

---

请严格按照上述五维分析框架输出分析结果。每个维度需包含：
1. 核心发现（基于具体数据，引用数据源，**与历史脚本/成交基准对比**）
2. 评分（1-10分）
3. 具体改进建议（可执行、有针对性）

特别注意：
- **绝对禁止出现以下表述**：❌"数据缺失" ❌"无数据" ❌"无实时数据" ❌"因缺少" ❌"无法量化" ❌"无语音转写" ❌"缺少语音转写" ❌"无评论数据" ❌"无成交数据" ❌"无互动率" ❌"无法完成" ❌"无法分析"。上面的markdown数据表格已经包含所有快照数据，你必须直接引用表格中的具体数值。如果某个指标在表格中确实是0，写"该指标值为0"并分析原因。
- **这是私域直播**：没有算法推流、没有自然流量推荐，观众来自私域社群（微信群/朋友圈/粉丝群），不要用公域流量标准来评判
- **这是私密产品直播**：两性健康/私护品类，决策链长、隐私性高，成交转化率天然低于快消品
- **区分评论数和评论人数**：评论数(commentCnt)是评论总条数，评论人数(commenterCnt)是发言人数，评论数一定≥评论人数，不要混淆
- **根据片段序号判断直播阶段**：第1片段才是开场，第2+片段已进入核心内容，第4+片段应进入促单阶段，不要把中后期片段误判为"开场暖场"
- **识别直播阶段结构**：根据片段序号判断当前处于开场暖场→情感痛点→心理理论→实操演示→产品植入→互动促单→收尾中的哪个阶段
- **话术策略识别**：痛点共情话术（"他是不是不主动了"）→ 心理解读（"男人追求征服感"）→ 技巧教学（"三步拿回主动权"）→ 产品衔接（"用这个效果更好"），分析每种话术对数据的拉动效果
- **教学→产品衔接分析**：主播如何从心理课/实操课自然过渡到产品推荐，衔接是否流畅
- 评论时间精确到分秒，定位互动爆发的具体时间点，关联对应话术
- 关联话术与数据涨跌（哪个话术后成交/互动明显变化）
- 商品漏斗要分析每个环节的流失率并给出针对性建议
- 评论舆情要用真实评论样本分析，不要泛泛而谈
- **观众画像提取**：从评论中判断观众群体特征（年龄段、婚恋状况、核心痛点）
- 数据波动要标注具体时间段
- **新粉占比高是私域社群裂变效果好的正向信号，不是问题**
- **对比历史脚本和成交基准，识别当前直播与过往的差异和改进点**
- **基于历史成交数据，评估当前商品组合和话术的转化效果**
${previousSessionComparison ? `- **必须与前一场直播对比，标注【前场对比】**，指出进步和退步的地方` : ''}${benchmarkAnchorData ? `- **必须与核心基准主播（雅文老师）对比，标注【基准对比】**，指出差距和追赶建议` : ''}

输出格式要求：
- 请严格遵守前面定义的 Markdown + JSON 混合输出格式。
- 文本分析必须在前面，JSON 结构必须在最后，并用 \`\`\`json 包裹。
- 文本部分中，每个维度使用 ### 标题
- 包含具体数据引用
- 与历史数据对比时标注【历史对比】
${previousSessionComparison ? '- 与前一场对比时标注【前场对比】' : ''}${benchmarkAnchorData ? '- 与核心基准对比时标注【基准对比】' : ''}
`;
}

/**
 * 使用 LLM 执行五维分析
 * 采用多模型并发调用策略：发送请求给多个模型，返回最先完成且成功的结果
 */
async function callLLMAnalysis(prompt: string): Promise<string> {
  // 256k 上下文模型支持约 640K chars，其他模型约 128K chars
  // 使用 md 格式组织完整数据发送给 AI，不再截断
  const MAX_PROMPT_LENGTH = 600000;
  let effectivePrompt = prompt;
  if (prompt.length > MAX_PROMPT_LENGTH) {
    console.warn(`[Analyzer] Prompt 过长 (${prompt.length} chars)，截断到 ${MAX_PROMPT_LENGTH}`);
    effectivePrompt = prompt.substring(0, MAX_PROMPT_LENGTH) + '\n\n[注意：数据已因长度限制截断，请基于已有数据进行分析]';
  } else {
    console.log(`[Analyzer] Prompt 长度: ${prompt.length} chars (完整数据，不截断)`);
  }

  const messages = [
    {
      role: 'system' as const,
      content: '你是一位专业的**私域直播**数据分析专家，擅长从多维度分析私域直播数据并给出可操作的改进建议。核心认知：1)这是私域直播，没有算法推流和自然流量，观众来自私域社群；2)销售的是两性健康/私护类私密产品，转化路径长、决策谨慎；3)直播采用"教学+带货"混合模式（痛点共情→心理解读→实操演示→产品植入）；4)私域关键指标是粉丝粘性和复购率，不是流量规模；5)在线100-500人是私域正常范围，新粉占比高说明社群裂变效果好。你能精准识别话术策略与数据涨跌的关联。',
    },
    {
      role: 'user' as const,
      content: effectivePrompt,
    },
  ];

  // 定义模型调用策略：优先使用 256k 长上下文模型，其他模型作为备选并发调用
  // 256k 模型可以接收完整 markdown 数据文件，不截断
  const modelsToTry = [
    { model: 'doubao-seed-2-0-mini-260215', name: 'Doubao Mini (256k)' },   // 256k 上下文，成本低
    { model: 'doubao-seed-2-0-pro-260215', name: 'Doubao Pro' },
    { model: 'doubao-seed-2-0-lite-260215', name: 'Doubao Lite' },
    { model: 'doubao-seed-1-8-251228', name: 'Doubao 1.8' },
    { model: 'deepseek-v3-2-251201', name: 'DeepSeek V3' },
    { model: 'kimi-k2-5-260127', name: 'Kimi K2' },
    { model: 'glm-5-0-260211', name: 'GLM 5' },
    { model: 'glm-5-turbo-260316', name: 'GLM 5 Turbo' },
    { model: 'glm-4-7-251222', name: 'GLM 4' },
    { model: 'minimax-m2-5-260212', name: 'MiniMax M2.5' },
    { model: 'minimax-m2-7-260318', name: 'MiniMax M2.7' },
    { model: 'qwen-3-5-plus-260215', name: 'Qwen 3.5 Plus' },
  ];

  console.log(`[Analyzer] 发送AI分析: prompt长度=${effectivePrompt.length} chars, 模型数=${modelsToTry.length}`);

  console.log(`[Analyzer] 启动多模型并发分析, 参与模型: ${modelsToTry.map(m => m.name).join(', ')}`);

  try {
    // 构造多个独立的分析任务
    const promises = modelsToTry.map(async (config) => {
      try {
        // 创建独立的客户端实例用于不同模型
        const modelClient = new UniversalLLMClient();
        await modelClient.initFromDb();
        
        // 使用 setForceModel 指定模型（provider已废弃，只传空字符串）
        modelClient.setForceModel('', config.model);
        
        const response = await modelClient.invoke(messages as any, {
          temperature: 0.4,
        });
        
        if (!response || response.trim().length < 50) {
          throw new Error(`返回响应过短(${response?.trim().length || 0}字符)，视为无效`);
        }
        console.log(`[Analyzer] 并发任务成功返回: ${config.name}`);
        return response;
      } catch (err) {
        console.warn(`[Analyzer] 并发任务失败 (${config.name}):`, err instanceof Error ? err.message : err);
        throw err;
      }
    });

    // 返回第一个成功的 Promise
    return await Promise.any(promises);
  } catch (aggregateError) {
    console.error('[Analyzer] 所有并发 AI 模型调用均失败:', aggregateError);
    // 所有尝试均失败时，返回一段友好的降级提示而不是崩溃
    return `### 分析失败\n\n很抱歉，由于目前多个 AI 模型服务均无法响应，本次数据分析未能成功生成。\n\n\`\`\`json\n{"summary": "分析服务暂时不可用","scores": {"overall": 0,"anchor": 0,"interaction": 0,"conversion": 0,"sentiment": 0,"rhythm": 0},"alerts": [],"action_items": []}\n\`\`\``;
  }
}

/**
 * 从分析文本中提取五维内容
 */
function extractDimensions(analysisText: string): FiveDimensionResult {
  const safeText = analysisText || '';
  const sections = safeText.split(/###\s*/);
  const result: FiveDimensionResult = {
    anchor_analysis: '',
    interaction_analysis: '',
    conversion_analysis: '',
    sentiment_analysis: '',
    rhythm_analysis: '',
  };

  const dimensionKeywords: Record<keyof FiveDimensionResult, string[]> = {
    anchor_analysis: ['主播话术', '话术分析', '主播'],
    interaction_analysis: ['互动热度', '互动分析', '互动'],
    conversion_analysis: ['商品转化', '转化分析', '转化'],
    sentiment_analysis: ['评论舆情', '舆情分析', '舆情'],
    rhythm_analysis: ['直播节奏', '节奏分析', '节奏'],
  };

  for (const section of sections) {
    if (!section.trim()) continue;

    for (const [key, keywords] of Object.entries(dimensionKeywords)) {
      if (keywords.some((kw) => section.includes(kw))) {
        result[key as keyof FiveDimensionResult] = section.trim();
        break;
      }
    }
  }

  // 如果某个维度为空，使用完整文本
  for (const key of Object.keys(result) as (keyof FiveDimensionResult)[]) {
    if (!result[key]) {
      result[key] = safeText;
      break;
    }
  }

  return result;
}

/**
 * 从分析文本中解析出 JSON 和 Markdown 结果
 */
export function extractJsonAndMarkdown(analysisText: string) {
  let jsonStr = '';
  let markdown = analysisText || '';
  
  if (analysisText) {
    const jsonMatch = analysisText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
      markdown = analysisText.replace(jsonMatch[0], '').trim();
    } else {
      const firstBrace = analysisText.indexOf('{');
      const lastBrace = analysisText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = analysisText.substring(firstBrace, lastBrace + 1);
        markdown = analysisText.substring(0, firstBrace).trim() + '\n' + analysisText.substring(lastBrace + 1).trim();
      }
    }
  }

  let jsonData: any = {};
  try {
    if (jsonStr) jsonData = JSON.parse(jsonStr);
  } catch (e) {
    console.warn('[Analyzer] JSON 解析失败:', e);
  }

  return { json: jsonData, markdown };
}

/** 从分析文本中提取预警项 */
function extractAlerts(_analysisText: string, jsonData?: any): Array<{
  type: string;
  severity: string;
  title: string;
  description: string;
}> {
  if (jsonData && Array.isArray(jsonData.alerts)) {
    return jsonData.alerts;
  }
  return [];
}

/** 从分析文本中提取可执行建议 */
function extractActionItems(_analysisText: string, jsonData?: any): Array<{
  dimension: string;
  title: string;
  description: string;
  priority: string;
}> {
  if (jsonData && Array.isArray(jsonData.action_items)) {
    return jsonData.action_items;
  }
  return [];
}

/** 从分析文本中提取亮点 */
function extractHighlights(_analysisText: string, jsonData?: any): Array<{
  dimension: string;
  title: string;
  metric?: string;
}> {
  if (jsonData && Array.isArray(jsonData.highlights)) {
    return jsonData.highlights;
  }
  return [];
}

/** 保存预警到live_alerts表 */
async function saveAlerts(sessionId: number, alerts: Array<{ type: string; severity: string; title: string; description: string }>) {
  if (alerts.length === 0) return;
  const client = getSupabaseClient();
  
  // 获取session的start_time来计算预警的实际直播时间
  const { data: session } = await client
    .from('live_sessions')
    .select('start_time')
    .eq('id', sessionId)
    .single();
  
  // 如果有start_time，计算直播已经进行了多久，用start_time + 已进行时长作为triggered_at
  let triggeredAt: string;
  if (session?.start_time) {
    // 预警时间 = 直播开始时间 + 已进行时长（即当前时间）
    // 但为了反映真实直播时间，使用start_time加上偏移量
    const startTime = new Date(session.start_time).getTime();
    const now = Date.now();
    // 如果start_time是北京时间(如20:00:00)而now是UTC，需要对齐
    // triggered_at使用now即可，前端通过offset_minutes转换为直播相对时间
    triggeredAt = new Date(now).toISOString();
  } else {
    triggeredAt = new Date().toISOString();
  }
  
  for (const alert of alerts) {
    await client.from('live_alerts').insert({
      session_id: sessionId,
      alert_type: alert.type,
      level: alert.severity,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
      evidence: null,
      suggestion: null,
      status: 'open',
      triggered_at: triggeredAt,
      resolved_at: null,
      is_read: false,
      created_at: triggeredAt,
    });
  }
  console.info(`[Alerts] 保存 ${alerts.length} 条预警 (session=${sessionId})`);
}

/** 保存行动项 - 已弃用（action_items 表已删除） */
async function saveActionItems(
  _sessionId: number,
  _reportId: number | undefined,
  _anchorName: string | null,
  items: Array<{ dimension: string; title: string; description: string; priority: string }>,
  _sourceQuote: string
) {
  // action_items 表已删除，行动项保留在 analysis_reports.action_items JSON 字段中
  if (items.length > 0) {
    console.info(`[ActionItems] ${items.length} 条建议已包含在报告中（独立表已移除）`);
  }
}

// 时间轴事件功能已移除（live_timeline_events 表已删除）
async function saveAnalysisTimelineEvents(
  _sessionId: number,
  _alerts: Array<{ type: string; severity: string; title: string; description: string }>,
  _highlights: Array<{ dimension: string; title: string; metric?: string }>,
  _reportType: 'segment' | 'final'
) {
  // live_timeline_events 表已删除，不再写入时间轴事件
}

export async function upsertAnchorProfile(anchorName: string): Promise<void> {
  if (!anchorName || anchorName === '未知主播') return;

  const client = getSupabaseClient();
  const { data: reports, error: reportError } = await client
    .from('analysis_reports')
    .select('session_id, overall_score, anchor_score, interaction_score, conversion_score, sentiment_score, rhythm_score')
    .eq('anchor_name', anchorName)
    .eq('report_type', 'final')
    .order('created_at', { ascending: false })
    .limit(10);

  if (reportError || !reports || reports.length === 0) return;

  const toNumber = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const average = (values: number[]) => {
    const valid = values.filter((value) => Number.isFinite(value));
    if (valid.length === 0) return 0;
    return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(1));
  };

  const reportSessionIds = reports.map((report: any) => report.session_id).filter(Boolean);
  const snapshotMetrics: Array<{
    sales: number;
    viewers: number;
    online: number;
    conversionRate: number;
    commentRate: number;
    goodsNames: string[];
  }> = [];

  for (const sessionId of reportSessionIds) {
    const { data: snapshots } = await client
      .from('snapshot_data')
      .select('watcher_cnt, comment_cnt, online_user_cnt, order_total, raw_json')
      .eq('session_id', sessionId)
      .order('snapshot_seq', { ascending: false })
      .limit(1);

    const snapshot = snapshots?.[0] as any;
    if (!snapshot) continue;

    const rawJson = snapshot.rawJson || snapshot.raw_json || {};
    const analysis = rawJson.analysis || {};
    const orderDetails = Array.isArray(rawJson.orderDetails) ? rawJson.orderDetails : [];
    const productClickCnt = Number(analysis.productClickCnt || 0);
    const payUserCnt = Number(analysis.payUserCnt || 0);
    const online = toNumber(snapshot.onlineUserCnt || snapshot.online_user_cnt || analysis.peakConcurrentViewers || 0);
    const comments = toNumber(snapshot.commentCnt || snapshot.comment_cnt || analysis.commentCnt || 0);
    const viewers = toNumber(snapshot.watcherCnt || snapshot.watcher_cnt || analysis.watcherCnt || 0);

    snapshotMetrics.push({
      sales: toNumber(snapshot.order_total || analysis.transactionAmount || 0),
      viewers,
      online,
      conversionRate: productClickCnt > 0 ? Number(((payUserCnt / productClickCnt) * 100).toFixed(1)) : 0,
      commentRate: online > 0 ? Number(((comments / online) * 100).toFixed(1)) : 0,
      goodsNames: orderDetails
        .map((detail: any) => String(detail.goodsName || detail.productName || '').trim())
        .filter(Boolean),
    });
  }

  const { data: anchorMemory } = await client
    .from('anchor_memories')
    .select('strengths, improvement_areas, product_specialties')
    .eq('anchor_name', anchorName)
    .eq('is_archived', false)
    .maybeSingle();

  const goodsFrequency = new Map<string, number>();
  for (const metric of snapshotMetrics) {
    for (const goodsName of metric.goodsNames) {
      goodsFrequency.set(goodsName, (goodsFrequency.get(goodsName) || 0) + 1);
    }
  }

  const bestProductTypes =
    (Array.isArray(anchorMemory?.product_specialties) && anchorMemory.product_specialties.length > 0
      ? anchorMemory.product_specialties
      : Array.from(goodsFrequency.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([goodsName]) => goodsName)) || [];

  const payload = {
    anchor_name: anchorName,
    avg_sales: average(snapshotMetrics.map((metric) => metric.sales)),
    avg_viewers: average(snapshotMetrics.map((metric) => metric.viewers)),
    avg_online: average(snapshotMetrics.map((metric) => metric.online)),
    avg_conversion_rate: average(snapshotMetrics.map((metric) => metric.conversionRate)),
    avg_comment_rate: average(snapshotMetrics.map((metric) => metric.commentRate)),
    avg_score: average(reports.map((report: any) => toNumber(report.overall_score))),
    dimension_scores: {
      anchor: average(reports.map((report: any) => toNumber(report.anchor_score))),
      interaction: average(reports.map((report: any) => toNumber(report.interaction_score))),
      conversion: average(reports.map((report: any) => toNumber(report.conversion_score))),
      sentiment: average(reports.map((report: any) => toNumber(report.sentiment_score))),
      rhythm: average(reports.map((report: any) => toNumber(report.rhythm_score))),
    },
    strengths: Array.isArray(anchorMemory?.strengths) ? anchorMemory.strengths.slice(0, 8) : [],
    weaknesses: Array.isArray(anchorMemory?.improvement_areas) ? anchorMemory.improvement_areas.slice(0, 8) : [],
    best_product_types: bestProductTypes,
    updated_at: new Date().toISOString(),
  };

  const existing = await client
    .from('anchor_profiles')
    .select('anchor_name')
    .eq('anchor_name', anchorName)
    .maybeSingle();

  if (existing.data?.anchor_name) {
    await client.from('anchor_profiles').update(payload).eq('anchor_name', anchorName);
  } else {
    await client.from('anchor_profiles').insert(payload);
  }
}

// ==================== Skill 自优化（知识积累系统） ====================

/**
 * 知识条目
 */
interface KnowledgeItem {
  category: 'threshold' | 'pattern' | 'benchmark' | 'rule';
  dimension: string;
  key: string;
  value: string;
  source: string;
}

/**
 * 从分析结果和数据中提取结构化知识
 * 不依赖LLM，直接从数据中计算和归纳
 */
function extractKnowledgeFromAnalysis(
  snapshotData: Record<string, unknown>[],
  analysisText: string,
  sessionId: number
): KnowledgeItem[] {
  const items: KnowledgeItem[] = [];
  const source = `session_${sessionId}`;

  for (const snap of snapshotData) {
    const rawJson = (snap.rawJson ?? snap.raw_json) as Record<string, unknown> | null;
    if (!rawJson) continue;

    const analysis = (rawJson.analysis as Record<string, unknown>) || {};
    const newoldData = (rawJson.newoldData as Record<string, string>) || {};
    const chartData = (rawJson.chartData as Record<string, unknown>) || {};
    const comments = (rawJson.comments as Record<string, unknown>[]) || [];
    const orderDetails = (rawJson.orderDetails as Record<string, unknown>[]) || [];

    // ---- 阈值类知识 (threshold) ----
    // 互动率标准
    const commentCnt = Number(analysis.commentCnt || 0);
    const peakViewers = Number(analysis.peakConcurrentViewers || 0);
    const interactionRate = peakViewers > 0 ? (commentCnt / peakViewers * 100) : 0;
    if (interactionRate > 0) {
      items.push({
        category: 'threshold',
        dimension: 'interaction',
        key: '互动率(评论数/峰值在线)',
        value: `${interactionRate.toFixed(1)}%`,
        source,
      });
    }

    // 商品转化率标准
    const productClickCnt = Number(analysis.productClickCnt || 0);
    const payUserCnt = Number(analysis.payUserCnt || 0);
    const transactionCnt = Number(analysis.transactionCnt || 0);
    if (productClickCnt > 0 && transactionCnt > 0) {
      const clickToOrderRate = (transactionCnt / productClickCnt * 100).toFixed(1);
      items.push({
        category: 'threshold',
        dimension: 'conversion',
        key: '点击→下单转化率',
        value: `${clickToOrderRate}%`,
        source,
      });
    }
    if (transactionCnt > 0 && payUserCnt > 0) {
      const orderToPayRate = (payUserCnt / transactionCnt * 100).toFixed(1);
      items.push({
        category: 'threshold',
        dimension: 'conversion',
        key: '下单→支付转化率',
        value: `${orderToPayRate}%`,
        source,
      });
    }

    // 评论率(评论人数/观看人数)
    const commenterCnt = Number(analysis.commenterCnt || 0);
    const watcherCnt = Number(analysis.watcherCnt || 0);
    if (watcherCnt > 0 && commenterCnt > 0) {
      const commenterRate = (commenterCnt / watcherCnt * 100).toFixed(1);
      items.push({
        category: 'threshold',
        dimension: 'interaction',
        key: '评论人数占比(评论人数/观看人数)',
        value: `${commenterRate}%`,
        source,
      });
    }

    // ---- 基准类知识 (benchmark) ----
    // 峰值在线
    if (peakViewers > 0) {
      items.push({
        category: 'benchmark',
        dimension: 'interaction',
        key: '峰值在线人数',
        value: String(peakViewers),
        source,
      });
    }

    // 平均观看时长
    const avgWatchTime = Number(analysis.avgWatchTime || 0);
    if (avgWatchTime > 0) {
      const minutes = Math.round(avgWatchTime / 60);
      items.push({
        category: 'benchmark',
        dimension: 'rhythm',
        key: '平均观看时长',
        value: `${minutes}分钟`,
        source,
      });
    }

    // 成交金额
    const transactionAmount = Number(analysis.transactionAmount || 0);
    if (transactionAmount > 0) {
      items.push({
        category: 'benchmark',
        dimension: 'conversion',
        key: '成交金额',
        value: `¥${transactionAmount}`,
        source,
      });
    }

    // 客单价
    if (transactionAmount > 0 && payUserCnt > 0) {
      const avgPrice = (transactionAmount / payUserCnt).toFixed(0);
      items.push({
        category: 'benchmark',
        dimension: 'conversion',
        key: '客单价',
        value: `¥${avgPrice}`,
        source,
      });
    }

    // ---- 新老粉数据 ----
    if (newoldData.nconversionRate) {
      items.push({
        category: 'benchmark',
        dimension: 'conversion',
        key: '新粉转化率',
        value: `${newoldData.nconversionRate}%`,
        source,
      });
    }
    if (newoldData.oconversionRate) {
      items.push({
        category: 'benchmark',
        dimension: 'conversion',
        key: '老粉转化率',
        value: `${newoldData.oconversionRate}%`,
        source,
      });
    }

    // ---- 模式类知识 (pattern) ----
    // 流量高峰时段识别
    const onlineList = (chartData.onlineUserCntList as number[]) || [];
    const xis = (chartData.xis as string[]) || [];
    if (onlineList.length > 0 && xis.length > 0) {
      const maxIdx = onlineList.indexOf(Math.max(...onlineList));
      const minIdx = onlineList.indexOf(Math.min(...onlineList.filter(v => v > 0)));
      if (maxIdx >= 0 && xis[maxIdx]) {
        items.push({
          category: 'pattern',
          dimension: 'rhythm',
          key: '流量高峰时段',
          value: `${xis[maxIdx]} (${onlineList[maxIdx]}人)`,
          source,
        });
      }
      if (minIdx >= 0 && xis[minIdx]) {
        items.push({
          category: 'pattern',
          dimension: 'rhythm',
          key: '流量低谷时段',
          value: `${xis[minIdx]} (${onlineList[minIdx]}人)`,
          source,
        });
      }
    }

    // 评论情绪分布
    if (comments.length > 0) {
      const positiveWords = ['好', '棒', '喜欢', '赞', '牛', '厉害', '买了', '下单', '已拍', '谢谢'];
      const negativeWords = ['差', '烂', '垃圾', '骗', '假', '退', '差评', '失望', '不好', '贵'];
      let posCnt = 0, negCnt = 0;
      for (const c of comments) {
        const content = String(c.content || '');
        if (positiveWords.some(w => content.includes(w))) posCnt++;
        if (negativeWords.some(w => content.includes(w))) negCnt++;
      }
      items.push({
        category: 'pattern',
        dimension: 'sentiment',
        key: '评论情绪分布',
        value: `正面${posCnt}条(${(posCnt/comments.length*100).toFixed(1)}%), 负面${negCnt}条(${(negCnt/comments.length*100).toFixed(1)}%)`,
        source,
      });
    }

    // 商品漏斗模式
    if (orderDetails.length > 0) {
      const unpaidCnt = orderDetails.filter(o => String(o.payStatus) === 'NOTPAY').length;
      const paidCnt = orderDetails.filter(o => String(o.payStatus) === 'SUCCESS').length;
      if (unpaidCnt > 0 || paidCnt > 0) {
        const totalOrders = unpaidCnt + paidCnt;
        const unpaidRate = (unpaidCnt / totalOrders * 100).toFixed(1);
        items.push({
          category: 'pattern',
          dimension: 'conversion',
          key: '下单未支付率',
          value: `${unpaidRate}% (${unpaidCnt}/${totalOrders})`,
          source,
        });
      }
    }
  }

  // ---- 规则类知识 (rule) ----
  // 从分析文本中提取改进建议作为规则
  const suggestionPatterns = [
    { regex: /建议(.{5,50})/g, dimension: 'general' },
    { regex: /优化(.{5,50})/g, dimension: 'general' },
    { regex: /可以(.{5,50}话术.{0,20})/g, dimension: 'anchor' },
    { regex: /增加(.{5,30})提示/g, dimension: 'conversion' },
  ];

  let ruleCount = 0;
  for (const { regex, dimension } of suggestionPatterns) {
    const matches = [...analysisText.matchAll(regex)];
    for (const match of matches) {
      if (ruleCount >= 5) break; // 最多提取5条规则
      const suggestion = match[1] || match[0];
      if (suggestion.length >= 5 && suggestion.length <= 60) {
        items.push({
          category: 'rule',
          dimension,
          key: '改进建议',
          value: suggestion,
          source,
        });
        ruleCount++;
      }
    }
    if (ruleCount >= 5) break;
  }

  return items;
}

/**
 * 保存知识条目到数据库（upsert with confidence tracking）
 */
async function saveKnowledgeItems(items: KnowledgeItem[]): Promise<number> {
  const client = getSupabaseClient();
  let saved = 0;

  for (const item of items) {
    try {
      // 检查是否已存在相同知识
      const { data: existing } = await client
        .from('analysis_knowledge')
        .select('id, confidence, sample_count, value, source')
        .eq('category', item.category)
        .eq('dimension', item.dimension)
        .eq('key', item.key)
        .maybeSingle();

      if (existing) {
        // 已存在：更新置信度和样本数（安全处理 null/NaN）
        const existingConfidence = Number(existing.confidence ?? 1) || 1;
        const existingSampleCount = Number(existing.sampleCount ?? 0) || 0;
        const existingValue = String(existing.value ?? '');
        const existingSource = String(existing.source ?? '');
        const existingId = Number(existing.id);

        const newConfidence = Math.min(5, existingConfidence + 1);
        const newSampleCount = existingSampleCount + 1;

        // 如果值差异大，降低置信度（说明知识不稳定）
        const valueChanged = existingValue !== item.value;
        const adjustedConfidence = valueChanged ? Math.max(1, existingConfidence - 1) : newConfidence;

        await client
          .from('analysis_knowledge')
          .update({
            value: valueChanged ? `${existingValue} | ${item.value}` : item.value,
            confidence: adjustedConfidence,
            sample_count: newSampleCount,
            last_validated_at: new Date().toISOString(),
            source: `${existingSource}, ${item.source}`,
          })
          .eq('id', existingId);
      } else {
        // 不存在：插入新知识
        await client.from('analysis_knowledge').insert({
          category: item.category,
          dimension: item.dimension,
          key: item.key,
          value: item.value,
          source: item.source,
          confidence: 1,
          sample_count: 1,
          last_validated_at: new Date().toISOString(),
        });
      }
      saved++;
    } catch (itemErr) {
      // 单条保存失败不影响其他条目
      console.error(`[Knowledge] 保存知识失败(key=${item.key}):`, itemErr instanceof Error ? itemErr.message : String(itemErr));
    }
  }

  return saved;
}

/**
 * 用最新知识重建Skill并保存为新版本
 */
async function rebuildAndSaveSkill(currentVersion: string, sourceSession: number): Promise<void> {
  const knowledgeContext = await buildKnowledgeContext();
  const fullSkill = knowledgeContext
    ? `${ANALYSIS_FRAMEWORK}\n\n${knowledgeContext}`
    : ANALYSIS_FRAMEWORK;

  const versionNum = parseInt(currentVersion.replace('v', ''), 10) || 1;
  const newVersion = `v${versionNum + 1}`;

  const client = getSupabaseClient();

  // 将旧版本标记为非活跃
  await client
    .from('skill_versions')
    .update({ is_active: 0 })
    .eq('is_active', 1);

  // 插入新版本
  await client.from('skill_versions').insert({
    version: newVersion,
    content: fullSkill,
    change_log: `session_${sourceSession} 分析后自动积累知识，重建Skill`,
    is_active: 1,
    knowledge_snapshot: knowledgeContext,
  });
}

/**
 * 评估分析质量并提取知识（替代旧的evaluateAndOptimizeSkill）
 */
async function extractAndSaveKnowledge(
  snapshotData: Record<string, unknown>[],
  analysisText: string,
  sessionId: number,
  currentVersion: string
): Promise<void> {
  try {
    // 1. 从数据和分析中提取知识
    const knowledgeItems = extractKnowledgeFromAnalysis(snapshotData, analysisText, sessionId);
    console.log(`[Knowledge] 从session_${sessionId}提取${knowledgeItems.length}条知识`);

    // 2. 保存知识到数据库
    const savedCount = await saveKnowledgeItems(knowledgeItems);
    console.log(`[Knowledge] 保存/更新${savedCount}条知识`);

    // 3. 检查是否需要重建Skill（每积累10条新知识或每3次分析）
    const { count } = await getSupabaseClient()
      .from('analysis_knowledge')
      .select('*', { count: 'exact' })
      .gte('confidence', 2);

    const shouldRebuild = (count || 0) >= 10 && knowledgeItems.length >= 3;
    if (shouldRebuild) {
      await rebuildAndSaveSkill(currentVersion, sessionId);
      console.log(`[Knowledge] Skill已重建升级`);
    }
  } catch (err) {
    console.error('[Knowledge] 知识提取失败:', err instanceof Error ? err.message : err);
  }
}

// ==================== 公开 API ====================

/**
 * 执行分析（片段/终场）
 */
export async function runAnalysis(
  sessionId: number,
  roomId: string,
  segmentSeq: number,
  reportType: 'segment' | 'final'
): Promise<number> {
  try {
  return await _runAnalysisImpl(sessionId, roomId, segmentSeq, reportType);
  } catch (err) {
    console.error(`[runAnalysis] 详细错误:`, err);
    throw err;
  }
}

async function _runAnalysisImpl(
  sessionId: number,
  roomId: string,
  segmentSeq: number,
  reportType: 'segment' | 'final'
): Promise<number> {
  console.log(`[runAnalysis] 开始分析: session=${sessionId}, room=${roomId}, type=${reportType}, seq=${segmentSeq}`);
  const client = getSupabaseClient();

  // 获取会话信息（含主播名称和模板名称）
  // DbQueryBuilder 自动将 snake_case 转为 camelCase
  const { data: sessionInfo } = await client
    .from('live_sessions')
    .select('room_name, anchor_name, room_type, template_name, start_time')
    .eq('id', sessionId)
    .maybeSingle();

  // camelCase 快捷访问（DbQueryBuilder 返回 camelCase 字段名）
  const si: { roomName: string; anchorName: string; roomType: string; templateName: string } = {
    roomName: String((sessionInfo as Record<string, unknown>)?.roomName ?? (sessionInfo as Record<string, unknown>)?.room_name ?? ''),
    anchorName: String((sessionInfo as Record<string, unknown>)?.anchorName ?? (sessionInfo as Record<string, unknown>)?.anchor_name ?? ''),
    roomType: String((sessionInfo as Record<string, unknown>)?.roomType ?? (sessionInfo as Record<string, unknown>)?.room_type ?? ''),
    templateName: String((sessionInfo as Record<string, unknown>)?.templateName ?? (sessionInfo as Record<string, unknown>)?.template_name ?? ''),
  };

  // 如果是智能直播且有模板名称，检查是否已有相同模板的终场分析
  const templateName = si.templateName;
  const isIntelligentLive = si.roomType === 'intelligence' && templateName;
  
  if (isIntelligentLive && reportType === REPORT_TYPE.FINAL) {
    // 查找相同模板名称的已完成终场分析
    const { data: existingReports } = await client
      .from('analysis_reports')
      .select('id, session_id, created_at')
      .eq('report_type', REPORT_TYPE.FINAL)
      .eq('session_id', sessionId)
      .limit(1);
      
    // 也查找其他使用相同模板的会话的终场分析
    const { data: otherTemplateReports } = await client
      .from('analysis_reports')
      .select('id, session_id, created_at')
      .eq('report_type', REPORT_TYPE.FINAL)
      .limit(10)
      .order('created_at', { ascending: false });
      
    // 对于相同模板的情况，我们记录一下，但仍然继续分析（因为可能有新的内容）
    // 这里我们可以添加逻辑来避免重复，但先保留分析功能
  }

  const anchorName = si.anchorName || (si.roomName ? resolveAnchorName(si.roomName) : '未知主播');

  // 更新 anchor_name（如果还没有的话）
  if (sessionInfo && !si.anchorName) {
    await client.from('live_sessions').update({ anchor_name: anchorName }).eq('id', sessionId);
  }

  // 获取快照数据
  console.log(`[runAnalysis] 正在获取快照数据: session=${sessionId}`);
  const snapshots = await getSessionSnapshots(sessionId);
  console.log(`[runAnalysis] 快照数据获取完成: count=${snapshots.length}`);

  if (snapshots.length === 0) {
    console.log(`[runAnalysis] 没有快照数据可供分析，退出`);
    throw new Error('没有快照数据可供分析');
  }

  // 终场分析使用所有快照，片段分析只使用对应快照
  // DbQueryBuilder 自动将 snake_case 转为 camelCase，需兼容两种字段名
  let analysisSnapshots = reportType === REPORT_TYPE.FINAL
    ? snapshots
    : snapshots.filter((s) => (s.snapshotSeq ?? s.snapshot_seq) === segmentSeq);

  if (analysisSnapshots.length === 0 && reportType !== REPORT_TYPE.FINAL) {
    // 如果指定片段没有数据，使用最新的快照
    analysisSnapshots = [snapshots[snapshots.length - 1]];
  }

  // 从快照中提取商品名称列表（用于获取商品记忆）
  const goodsNames = extractGoodsNamesFromSnapshots(analysisSnapshots.length > 0 ? analysisSnapshots : snapshots);

  // 获取记忆上下文
  const memoryContext = await memoryManager.getContextForAnalysis(anchorName, goodsNames);
  const formattedMemoryContext = memoryManager.formatMemoryForPrompt(memoryContext);

  // 获取当前 Skill
  const skill = await getActiveSkill();

  // 获取历史脚本和商品基准数据
  const [historicalScripts, productBenchmarks] = await Promise.all([
    getHistoricalScripts(),
    getProductBenchmarks(),
  ]);
  const historicalContext = [formattedMemoryContext, historicalScripts, productBenchmarks].filter(Boolean).join('\n\n');

  // 终场分析时获取前一场对比和跨主播基准对比
  let previousSessionComparison = '';
  let benchmarkAnchorData = '';
  if (reportType === REPORT_TYPE.FINAL) {
    [previousSessionComparison, benchmarkAnchorData] = await Promise.all([
      getPreviousSessionComparison(sessionId, anchorName),
      getBenchmarkAnchorData(anchorName),
    ]);
  }

  const sessionStartTime = sessionInfo?.startTime ?? sessionInfo?.start_time ?? null;

  // 构建完整数据 Markdown（不截断，作为附件发送给 AI）
  const dataMarkdown = buildAnalysisDataMarkdown(
    analysisSnapshots.length > 0 ? analysisSnapshots : snapshots,
    reportType,
    segmentSeq,
    sessionStartTime
  );

  // 构建分析指令 Prompt（不含完整数据）
  const analysisPrompt = buildAnalysisPrompt(
    skill.content,
    analysisSnapshots.length > 0 ? analysisSnapshots : snapshots,
    reportType,
    segmentSeq,
    historicalContext,
    previousSessionComparison,
    benchmarkAnchorData,
    sessionStartTime
  );

  // 合并为完整 prompt：指令 + 完整数据附件
  const fullPrompt = `${analysisPrompt}\n\n---\n\n# 直播数据附件\n\n${dataMarkdown}`;

  console.log(`[runAnalysis] Prompt 组装完成: 指令=${analysisPrompt.length}字符, 数据附件=${dataMarkdown.length}字符, 合计=${fullPrompt.length}字符`);

  // 调用 LLM 分析（内容审核拒绝时加强过滤后重试一次）
  // 增加完整性检查：如果分析结果不完整（全0分/降级提示/维度为空），自动重试
  const MAX_RETRIES = 3;
  let analysisText = '';
  let retryCount = 0;

  // 日志：记录发送给AI的数据摘要，便于排查"数据缺失"问题
  const dataSnapCount = snapshots.length;
  const dataHasTranscription = snapshots.some((s: Record<string, unknown>) => s.transcription || s.rawJson);
  const dataHasComments = snapshots.some((s: Record<string, unknown>) => {
    const rawJson = (s.rawJson ?? s.raw_json) as Record<string, unknown> | null;
    const comments = rawJson?.comments as Record<string, unknown>[] | undefined;
    return comments && comments.length > 0;
  });
  console.log(`[runAnalysis] 发送数据摘要: 快照${dataSnapCount}条, 有转写=${dataHasTranscription}, 有评论=${dataHasComments}, prompt长度=${fullPrompt.length}字符`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    retryCount = attempt;
    if (attempt > 1) {
      // 重试前等待2秒，避免过快请求
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    try {
      analysisText = await callLLMAnalysis(fullPrompt);
    } catch (llmError: unknown) {
      const errMsg = llmError instanceof Error ? llmError.message : String(llmError);
      // 如果因内容审核失败，加强过滤后重试一次
      if (errMsg.includes('DataInspectionFailed') || errMsg.includes('inappropriate content') || errMsg.includes('低俗') || errMsg.includes('色情')) {
        console.log(`[runAnalysis] LLM内容审核拒绝，加强过滤后重试(第${attempt}次)...`);
        const aggressiveFiltered = filterContent(fullPrompt, true);
        try {
          analysisText = await callLLMAnalysis(aggressiveFiltered.filtered);
        } catch (retryError: unknown) {
          console.error(`[runAnalysis] 加强过滤版仍被拒绝`);
          if (attempt < MAX_RETRIES) continue;
          throw retryError;
        }
      } else {
        if (attempt < MAX_RETRIES) {
          console.warn(`[runAnalysis] LLM调用失败(第${attempt}次)，重试...`, errMsg);
          continue;
        }
        throw llmError;
      }
    }

    // 完整性检查：分析结果是否有效
    if (!analysisText || analysisText.trim().length < 100) {
      console.warn(`[runAnalysis] 分析结果过短(${analysisText?.trim().length || 0}字符)，第${attempt}次重试...`);
      if (attempt < MAX_RETRIES) continue;
    }

    // 检查是否为降级提示
    if (analysisText.includes('分析失败') || analysisText.includes('分析服务暂时不可用')) {
      console.warn(`[runAnalysis] 分析结果为降级提示，第${attempt}次重试...`);
      if (attempt < MAX_RETRIES) continue;
    }

    // 检查五维内容是否提取得到
    const testExtract = extractDimensions(extractJsonAndMarkdown(analysisText).markdown);
    const nonEmptyDimensions = Object.values(testExtract).filter(d => d && d.trim().length > 20).length;
    if (nonEmptyDimensions < 3) {
      console.warn(`[runAnalysis] 分析维度不完整(仅${nonEmptyDimensions}/5有内容)，第${attempt}次重试...`);
      if (attempt < MAX_RETRIES) continue;
    }

    // 检查是否出现"数据缺失/无数据"等空洞内容 — AI不该说没数据，必须基于快照数据分析
    const noDataPatterns = [
      '数据缺失', '无实时数据', '无数据', '无法量化', '因缺少', '因无语音', '无语音转写',
      '无评论数据', '无互动率', '无商品漏斗', '无成交数据', '缺少实时数据', '缺少数据',
      '无法完成', '无法分析', '无法评估', '无法判断', '缺少语音', '无语音转写数据',
      '无成交', '无互动', '无评论', '无法识别', '数据不足', '数据为空',
      '未获取到数据', '未能获取', '没有数据', '暂无数据', '暂缺数据',
      '缺失数据', '缺失实时', '无法提供', '无法给出', '不能确定',
    ];
    const noDataHitCount = noDataPatterns.filter(p => analysisText.includes(p)).length;
    if (noDataHitCount >= 2) {
      console.warn(`[runAnalysis] 分析结果包含${noDataHitCount}处"数据缺失"类表述(${noDataPatterns.filter(p => analysisText.includes(p)).join(', ')}), 第${attempt}次重试...`);
      if (attempt < MAX_RETRIES) continue;
      // 如果已达最大重试次数，仍包含"数据缺失"，则拒绝保存
      console.error(`[runAnalysis] ${MAX_RETRIES}次重试后仍含"数据缺失"表述，抛出错误不保存`);
      throw new Error(`AI分析${MAX_RETRIES}次重试后仍返回"数据缺失"类结果，本次分析不保存`);
    }

    // 检查JSON中的评分是否全为0
    const testJson = extractJsonAndMarkdown(analysisText).json;
    const testScores = testJson?.scores || {};
    const allScoresZero = ['overall', 'anchor', 'interaction', 'conversion', 'sentiment', 'rhythm']
      .every(k => !testScores[k] || Number(testScores[k]) === 0);
    if (allScoresZero) {
      console.warn(`[runAnalysis] 评分全为0或缺失，第${attempt}次重试...`);
      if (attempt < MAX_RETRIES) continue;
    }

    // 通过所有检查，跳出重试循环
    console.log(`[runAnalysis] 分析结果完整性检查通过(第${attempt}次尝试，维度=${nonEmptyDimensions}/5)`);
    break;
  }

  if (retryCount >= MAX_RETRIES && (!analysisText || analysisText.trim().length < 100)) {
    throw new Error(`AI分析${MAX_RETRIES}次重试后仍无有效结果`);
  }

  // 提取五维分析和 JSON
  const extracted = extractJsonAndMarkdown(analysisText);
  const jsonData = extracted.json;
  const markdownText = extracted.markdown;
  const dimensions = extractDimensions(markdownText);
  
  const scores = jsonData?.scores || {};
  const alerts = extractAlerts(markdownText, jsonData);
  const actionItems = extractActionItems(markdownText, jsonData);
  const highlights = extractHighlights(markdownText, jsonData);

  // 安全序列化 analysis_json，确保写入 jsonb 不会因非法字符失败
  let safeAnalysisJson: any = {};
  try {
    // 深度清理：递归移除所有 undefined 值和非法 JSON 字符
    function sanitizeForJson(obj: any): any {
      if (obj === null || obj === undefined) return null;
      if (typeof obj === 'number') return Number.isFinite(obj) ? obj : null;
      if (typeof obj === 'boolean') return obj;
      if (typeof obj === 'string') {
        // 只移除 NUL 字符，不手动转义反斜杠（JSON.stringify 会自动处理）
        return obj.replace(/\0/g, '');
      }
      if (Array.isArray(obj)) return obj.map(sanitizeForJson);
      if (typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (value !== undefined) {
            result[key] = sanitizeForJson(value);
          }
        }
        return result;
      }
      return String(obj);
    }
    const sanitized = sanitizeForJson(jsonData);
    const jsonStr = JSON.stringify(sanitized);
    safeAnalysisJson = JSON.parse(jsonStr); // round-trip 确保合法
    console.log(`[Analyzer] safeAnalysisJson 序列化成功，长度=${jsonStr.length}`);
  } catch (e) {
    console.warn('[Analyzer] analysis_json 序列化安全处理:', e);
    safeAnalysisJson = { scores: jsonData?.scores || {}, raw_error: 'JSON round-trip failed' };
  }

  // 存储分析报告（含主播名称和模板名称）
  let insertData: Record<string, unknown>;
  try {
    // 清理所有字符串字段中的非法字符
    function cleanStr(v: unknown): unknown {
      if (typeof v === 'string') return v.replace(/\0/g, '');
      if (Array.isArray(v)) return v.map(cleanStr);
      if (v && typeof v === 'object') {
        const r: any = {};
        for (const [k, val] of Object.entries(v)) r[k] = cleanStr(val);
        return r;
      }
      return v;
    }
    insertData = {
      session_id: sessionId,
      report_type: reportType,
      segment_seq: segmentSeq,
      anchor_analysis: dimensions.anchor_analysis,
      interaction_analysis: dimensions.interaction_analysis,
      conversion_analysis: dimensions.conversion_analysis,
      sentiment_analysis: dimensions.sentiment_analysis,
      rhythm_analysis: dimensions.rhythm_analysis,
      analysis_text: (markdownText || '').replace(/\0/g, ''),
      analysis_json: cleanStr(safeAnalysisJson),
      skill_version: skill.version,
      model_used: 'doubao-seed-2-0-pro-260215',
      anchor_name: anchorName,
      template_name: templateName,
      room_type: si.roomType,
      overall_score: scores.overall || null,
      anchor_score: scores.anchor || null,
      interaction_score: scores.interaction || null,
      conversion_score: scores.conversion || null,
      sentiment_score: scores.sentiment || null,
      rhythm_score: scores.rhythm || null,
      alerts: cleanStr(alerts),
      action_items: cleanStr(actionItems),
      highlights: cleanStr(highlights),
    };

    // 调试：预序列化检查
    const jsonCheck = JSON.stringify(insertData);
    console.log(`[Analyzer] Insert data JSON check passed, length=${jsonCheck.length}`);
    // 逐一检查 jsonb 字段
    for (const field of ['analysis_json', 'alerts', 'action_items', 'highlights']) {
      const val = insertData[field];
      try {
        const s = JSON.stringify(val);
        JSON.parse(s); // 验证可 round-trip
      } catch (e) {
        console.error(`[Analyzer] JSONB字段 ${field} 检查失败:`, e);
        insertData[field] = {};
      }
    }
  } catch (jsonErr) {
    console.error('[Analyzer] Insert data JSON 预检查失败:', jsonErr);
    // 降级：移除可能有问题的字段
    insertData = {
      session_id: sessionId,
      report_type: reportType,
      segment_seq: segmentSeq,
      anchor_analysis: dimensions.anchor_analysis?.substring(0, 5000) || '',
      interaction_analysis: dimensions.interaction_analysis?.substring(0, 5000) || '',
      conversion_analysis: dimensions.conversion_analysis?.substring(0, 5000) || '',
      sentiment_analysis: dimensions.sentiment_analysis?.substring(0, 5000) || '',
      rhythm_analysis: dimensions.rhythm_analysis?.substring(0, 5000) || '',
      analysis_text: (markdownText || '').substring(0, 10000).replace(/\0/g, ''),
      analysis_json: {},
      skill_version: skill.version,
      model_used: 'doubao-seed-2-0-pro-260215',
      anchor_name: anchorName,
      template_name: templateName,
      room_type: si.roomType,
      overall_score: scores.overall || null,
      anchor_score: scores.anchor || null,
      interaction_score: scores.interaction || null,
      conversion_score: scores.conversion || null,
      sentiment_score: scores.sentiment || null,
      rhythm_score: scores.rhythm || null,
      alerts: [],
      action_items: [],
      highlights: [],
    };
  }

  const { data, error } = await client
    .from('analysis_reports')
    .insert(insertData)
    .select('id')
    .single();

  if (error) throw new Error(`存储分析报告失败: ${error.message}`);
  const reportId = data.id;

  saveAlerts(sessionId, alerts).catch((err) => {
    console.error('[Alerts] 保存预警失败:', err);
  });

  saveAnalysisTimelineEvents(sessionId, alerts, highlights, reportType).catch((err) => {
    console.error('[Timeline] 保存分析时间轴事件失败:', err);
  });

  if (reportType === REPORT_TYPE.FINAL && actionItems.length > 0) {
    saveActionItems(sessionId, reportId, anchorName, actionItems, analysisText.substring(0, 1000)).catch((err) => {
      console.error('[ActionItems] 保存行动项失败:', err);
    });
  }

  // 知识积累（异步，不阻塞主流程）
  extractAndSaveKnowledge(analysisSnapshots.length > 0 ? analysisSnapshots : snapshots, analysisText, sessionId, skill.version).catch((err) => {
    console.error('[Knowledge] 知识提取异常:', err);
  });

  // 保存分析洞察到记忆系统（异步，不阻塞主流程）
  if (reportType === REPORT_TYPE.FINAL) {
    saveInsightsToMemory(
      sessionId,
      anchorName,
      goodsNames,
      analysisText,
      jsonData,
      'doubao-seed-2-0-pro-260215'
    ).catch((err) => {
      console.error('[Memory] 保存记忆异常:', err);
    });
  }

  // 终场分析完成后自动填充直播脚本（异步）
  if (reportType === REPORT_TYPE.FINAL) {
    autoFillLiveScript(sessionId, anchorName, analysisText, analysisSnapshots.length > 0 ? analysisSnapshots : snapshots).catch((err) => {
      console.error('[Script] 自动填充脚本失败:', err);
    });

    upsertAnchorProfile(anchorName).catch((err) => {
      console.error('[AnchorProfile] 自动生成主播画像失败:', err);
    });
  }

  return reportId;
}

/**
 * 分析完成后自动填充直播脚本到 live_scripts 表
 */
async function autoFillLiveScript(
  sessionId: number,
  anchorName: string,
  analysisText: string,
  snapshots: Record<string, unknown>[]
): Promise<void> {
  const client = getSupabaseClient();

  // 获取会话信息
  const { data: session } = await client
    .from('live_sessions')
    .select('room_name, start_time, end_time')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) return;

  const sessionDate = session.start_time
    ? new Date(String(session.start_time)).toLocaleDateString('zh-CN')
    : new Date().toLocaleDateString('zh-CN');

  // 检查是否已有该场次的脚本
  const { data: existing } = await client
    .from('live_scripts')
    .select('id')
    .eq('session_date', sessionDate)
    .eq('anchor_name', anchorName)
    .maybeSingle();

  if (existing) return; // 已有则不重复填充

  // 从分析文本中提取关键词和内容要点
  const safeAnalysisText = analysisText || '';
  const anchorSection = safeAnalysisText.match(/###?\s*(?:主播话术|话术分析)[\s\S]*?(?=###?\s*(?:互动|商品|评论|直播|节奏|$))/i);
  const conversionSection = safeAnalysisText.match(/###?\s*(?:商品转化|转化分析)[\s\S]*?(?=###?\s*(?:评论|直播|节奏|互动|主播|$))/i);

  // 从快照数据提取商品和成交信息
  const profileLastSnap = snapshots[snapshots.length - 1];
  const rawJson = (profileLastSnap?.rawJson ?? profileLastSnap?.raw_json) as Record<string, unknown> | null;
  const orderDetails = rawJson ? (rawJson.orderDetails as Record<string, unknown>[]) : [];
  const orderSummary = rawJson ? (rawJson.orderSummary as Record<string, unknown>) : {};

  // 商品列表
  const productList = orderDetails
    .filter((g: Record<string, unknown>) => g.goodsName)
    .map((g: Record<string, unknown>) => `${g.goodsName}: 点击${g.clickCount || 0} / 下单${g.orderCount || 0} / 已付${g.paidCount || 0} / ¥${g.totalPaidAmount || 0}`)
    .join('\n');

  // 成交数据
  const transactionData = [
    `成交总额: ¥${orderSummary.totalAmount || 'N/A'}`,
    `成交单数: ${orderSummary.paySuccessTotal || 'N/A'}`,
    `支付人数: ${orderSummary.payUserTotal || 'N/A'}`,
  ].join('\n');

  // 关键词：从话术分析中提取
  const keywords = anchorSection?.[0]
    ? anchorSection[0].slice(0, 200).replace(/[#*\n]/g, ' ').trim()
    : '';

  // 内容要点：整场分析文本的前800字作为要点
  const contentPoints = safeAnalysisText.slice(0, 800);

  await client.from('live_scripts').insert({
    session_date: sessionDate,
    anchor_name: anchorName,
    keywords: keywords.slice(0, 500) || null,
    content_points: contentPoints || null,
    product_list: productList || null,
    transaction_data: transactionData || null,
    source: `自动填充(session#${sessionId})`,
  });

  console.log(`[Script] 自动填充直播脚本: anchor=${anchorName}, date=${sessionDate}`);
}

/**
 * 流式分析（用于前端实时展示）
 */
export async function* streamAnalysis(
  sessionId: number,
  roomId: string,
  segmentSeq: number,
  reportType: 'segment' | 'final'
): AsyncGenerator<string> {
  const client = getSupabaseClient();

  // 获取会话信息（含主播名称）
  const { data: sessionInfo } = await client
    .from('live_sessions')
    .select('room_name, anchor_name, room_type, template_name')
    .eq('id', sessionId)
    .maybeSingle();

  const si2: { roomName: string; anchorName: string; roomType: string; templateName: string } = {
    roomName: String((sessionInfo as Record<string, unknown>)?.roomName ?? (sessionInfo as Record<string, unknown>)?.room_name ?? ''),
    anchorName: String((sessionInfo as Record<string, unknown>)?.anchorName ?? (sessionInfo as Record<string, unknown>)?.anchor_name ?? ''),
    roomType: String((sessionInfo as Record<string, unknown>)?.roomType ?? (sessionInfo as Record<string, unknown>)?.room_type ?? ''),
    templateName: String((sessionInfo as Record<string, unknown>)?.templateName ?? (sessionInfo as Record<string, unknown>)?.template_name ?? ''),
  };

  const anchorName = si2.anchorName || (si2.roomName ? resolveAnchorName(si2.roomName) : '未知主播');

  // 更新 anchor_name（如果还没有的话）
  if (sessionInfo && !si2.anchorName) {
    await client.from('live_sessions').update({ anchor_name: anchorName }).eq('id', sessionId);
  }

  const snapshots = await getSessionSnapshots(sessionId);
  if (snapshots.length === 0) throw new Error('没有快照数据可供分析');

  const analysisSnapshots = reportType === REPORT_TYPE.FINAL
    ? snapshots
    : snapshots.filter((s) => (s.snapshotSeq ?? s.snapshot_seq) === segmentSeq);

  const goodsNames = extractGoodsNamesFromSnapshots(analysisSnapshots.length > 0 ? analysisSnapshots : snapshots);
  const memoryContext = await memoryManager.getContextForAnalysis(anchorName, goodsNames);
  const formattedMemoryContext = memoryManager.formatMemoryForPrompt(memoryContext);
  const skill = await getActiveSkill();

  // 获取历史脚本和商品基准数据
  const [historicalScripts, productBenchmarks] = await Promise.all([
    getHistoricalScripts(),
    getProductBenchmarks(),
  ]);
  const historicalContext = [formattedMemoryContext, historicalScripts, productBenchmarks].filter(Boolean).join('\n\n');

  // 终场分析时获取前一场对比和跨主播基准对比
  let previousSessionComparison = '';
  let benchmarkAnchorData = '';
  if (reportType === REPORT_TYPE.FINAL) {
    [previousSessionComparison, benchmarkAnchorData] = await Promise.all([
      getPreviousSessionComparison(sessionId, anchorName),
      getBenchmarkAnchorData(anchorName),
    ]);
  }

  const prompt = buildAnalysisPrompt(
    skill.content,
    analysisSnapshots.length > 0 ? analysisSnapshots : snapshots,
    reportType,
    segmentSeq,
    historicalContext,
    previousSessionComparison,
    benchmarkAnchorData
  );

  const llmClient = new UniversalLLMClient();
  await llmClient.initFromDb();

  const messages = [
    {
      role: 'system' as const,
      content: '你是一位专业的直播数据分析专家，擅长从多维度分析直播数据并给出可操作的改进建议。',
    },
    { role: 'user' as const, content: prompt },
  ];

  let fullText = '';

  const stream = llmClient.stream(messages as any, {
    temperature: 0.4,
  });

  for await (const chunk of stream) {
    if (chunk.content) {
      const text = chunk.content.toString();
      fullText += text;
      yield text;
    }
  }

  // 流式完成后存储分析报告（含主播名称+结构化字段）
  const { json: jsonData, markdown: markdownText } = extractJsonAndMarkdown(fullText);
  const dimensions = extractDimensions(markdownText);
  const scores = jsonData?.scores || {};
  const alerts = extractAlerts(markdownText, jsonData);
  const actionItems = extractActionItems(markdownText, jsonData);
  const highlights = extractHighlights(markdownText, jsonData);

  const { data: reportData, error: reportError } = await client.from('analysis_reports').insert({
    session_id: sessionId,
    report_type: reportType,
    segment_seq: segmentSeq,
    anchor_analysis: dimensions.anchor_analysis,
    interaction_analysis: dimensions.interaction_analysis,
    conversion_analysis: dimensions.conversion_analysis,
    sentiment_analysis: dimensions.sentiment_analysis,
    rhythm_analysis: dimensions.rhythm_analysis,
    analysis_text: markdownText,
    analysis_json: jsonData,
    skill_version: skill.version,
    model_used: 'doubao-seed-2-0-pro-260215',
    anchor_name: anchorName,
    template_name: si2.templateName,
    room_type: si2.roomType,
    overall_score: scores.overall || null,
    anchor_score: scores.anchor || null,
    interaction_score: scores.interaction || null,
    conversion_score: scores.conversion || null,
    sentiment_score: scores.sentiment || null,
    rhythm_score: scores.rhythm || null,
    alerts: alerts,
    action_items: actionItems,
    highlights: highlights,
  }).select('id').single();

  const reportId = reportData?.id;

  // 保存预警到 live_alerts 表
  saveAlerts(sessionId, alerts).catch((err) => {
    console.error('[Alerts] 保存预警失败:', err);
  });

  saveAnalysisTimelineEvents(sessionId, alerts, highlights, reportType).catch((err) => {
    console.error('[Timeline] 保存分析时间轴事件失败:', err);
  });

  // 保存行动项到 action_items 表（终场分析时）
  if (reportType === REPORT_TYPE.FINAL && actionItems.length > 0) {
    saveActionItems(sessionId, reportId, anchorName, actionItems, fullText.substring(0, 1000)).catch((err) => {
      console.error('[ActionItems] 保存行动项失败:', err);
    });
  }

  extractAndSaveKnowledge(analysisSnapshots.length > 0 ? analysisSnapshots : snapshots, fullText, sessionId, skill.version).catch((err) => {
    console.error('[Knowledge] 流式分析知识提取异常:', err);
  });

  if (reportType === REPORT_TYPE.FINAL) {
    saveInsightsToMemory(
      sessionId,
      anchorName,
      goodsNames,
      fullText,
      jsonData,
      'doubao-seed-2-0-pro-260215'
    ).catch((err) => {
      console.error('[Memory] 保存记忆异常:', err);
    });
  }

  // 终场分析完成后自动填充直播脚本（异步）
  if (reportType === REPORT_TYPE.FINAL) {
    autoFillLiveScript(sessionId, anchorName, fullText, analysisSnapshots.length > 0 ? analysisSnapshots : snapshots).catch((err) => {
      console.error('[Script] 自动填充脚本失败:', err);
    });

    upsertAnchorProfile(anchorName).catch((err) => {
      console.error('[AnchorProfile] 自动生成主播画像失败:', err);
    });
  }
}

// ==================== 录播回放分析 ====================

/**
 * 执行录播回放分析（完整分析）
 */
export async function runAnalysisForReplay(
  sessionId: number,
  roomId: string,
  liveSpaceId: string
): Promise<number> {
  const client = getSupabaseClient();

  // 获取会话信息（含主播名称）
  const { data: sessionInfo } = await client
    .from('live_sessions')
    .select('room_name, anchor_name, start_time, end_time')
    .eq('id', sessionId)
    .maybeSingle();

  const si3 = {
    roomName: (sessionInfo as any)?.roomName ?? (sessionInfo as any)?.room_name ?? '',
    anchorName: (sessionInfo as any)?.anchorName ?? (sessionInfo as any)?.anchor_name ?? '',
    startTime: (sessionInfo as any)?.startTime ?? (sessionInfo as any)?.start_time ?? '',
    endTime: (sessionInfo as any)?.endTime ?? (sessionInfo as any)?.end_time ?? '',
  };

  const anchorName = si3.anchorName || (si3.roomName ? extractAnchorName(si3.roomName) : '未知主播');

  // 更新 anchor_name（如果还没有的话）
  if (sessionInfo && !si3.anchorName) {
    await client.from('live_sessions').update({ anchor_name: anchorName }).eq('id', sessionId);
  }

  // 获取快照数据
  const snapshots = await getSessionSnapshots(sessionId);

  if (snapshots.length === 0) {
    throw new Error('没有录播快照数据可供分析');
  }

  const goodsNames = extractGoodsNamesFromSnapshots(snapshots);

  // 获取当前 Skill
  const skill = await getActiveSkill();

  // 构建录播分析专用的 prompt
  const prompt = buildReplayAnalysisPrompt(
    skill.content,
    snapshots,
    anchorName,
    si3.startTime,
    si3.endTime
  );

  // 调用 LLM 分析
  const analysisText = await callLLMAnalysis(prompt);

  // 提取五维分析和 JSON
  const extracted = extractJsonAndMarkdown(analysisText);
  const jsonData = extracted.json;
  const markdownText = extracted.markdown;
  const dimensions = extractDimensions(markdownText);
  
  const scores = jsonData?.scores || {};
  const alerts = extractAlerts(markdownText, jsonData);
  const actionItems = extractActionItems(markdownText, jsonData);
  const highlights = extractHighlights(markdownText, jsonData);

  // 存储分析报告（含主播名称）
  const { data, error } = await client
    .from('analysis_reports')
    .insert({
      session_id: sessionId,
      report_type: 'final' as const,
      segment_seq: 1,
      anchor_analysis: dimensions.anchor_analysis,
      interaction_analysis: dimensions.interaction_analysis,
      conversion_analysis: dimensions.conversion_analysis,
      sentiment_analysis: dimensions.sentiment_analysis,
      rhythm_analysis: dimensions.rhythm_analysis,
      analysis_text: markdownText,
      analysis_json: jsonData,
      skill_version: skill.version,
      model_used: 'doubao-seed-2-0-pro-260215',
      anchor_name: anchorName,
      overall_score: scores.overall || null,
      anchor_score: scores.anchor || null,
      interaction_score: scores.interaction || null,
      conversion_score: scores.conversion || null,
      sentiment_score: scores.sentiment || null,
      rhythm_score: scores.rhythm || null,
      alerts: alerts,
      action_items: actionItems,
      highlights: highlights,
    })
    .select('id')
    .single();

  if (error) throw new Error(`存储录播分析报告失败: ${error.message}`);

  // 知识积累（异步，不阻塞主流程）
  extractAndSaveKnowledge(snapshots, analysisText, sessionId, skill.version).catch((err) => {
    console.error('[Knowledge] 录播知识提取异常:', err);
  });

  saveAlerts(sessionId, alerts).catch((err) => {
    console.error('[Alerts] 保存预警失败:', err);
  });

  saveAnalysisTimelineEvents(sessionId, alerts, highlights, 'final').catch((err) => {
    console.error('[Timeline] 保存分析时间轴事件失败:', err);
  });

  if (actionItems.length > 0) {
    saveActionItems(sessionId, data.id, anchorName, actionItems, analysisText.substring(0, 1000)).catch((err) => {
      console.error('[ActionItems] 保存行动项失败:', err);
    });
  }

  saveInsightsToMemory(
    sessionId,
    anchorName,
    goodsNames,
    analysisText,
    jsonData,
    'doubao-seed-2-0-pro-260215'
  ).catch((err) => {
    console.error('[Memory] 保存录播记忆异常:', err);
  });

  // 自动填充直播脚本
  autoFillLiveScript(sessionId, anchorName, analysisText, snapshots).catch((err) => {
    console.error('[Script] 自动填充脚本失败:', err);
  });

  upsertAnchorProfile(anchorName).catch((err) => {
    console.error('[AnchorProfile] 自动生成主播画像失败:', err);
  });

  return data.id;
}

/**
 * 构建录播分析 Prompt
 */
function buildReplayAnalysisPrompt(
  skillContent: string,
  snapshotData: Record<string, unknown>[],
  anchorName: string,
  startTime: string | null,
  endTime: string | null
): string {
  // 构建完整数据
  const dataSummary = snapshotData.map((snap, idx) => {
    const rawJson = (snap.rawJson ?? snap.raw_json) as Record<string, unknown> | null;
    if (!rawJson) return '';

    const analysis = (rawJson.analysis as Record<string, unknown>) || {};
    const newoldData = (rawJson.newoldData as Record<string, string>) || {};
    const chartData = (rawJson.chartData as Record<string, unknown>) || {};
    const orderAnalysis = (rawJson.orderAnalysis as Record<string, unknown>) || {};

    return `
--- 录播数据 ${idx + 1} ---

【核心指标】
- 观看人数: ${analysis.watcherCnt || 'N/A'}
- 观看次数: ${analysis.viewCnt || 'N/A'}
- 峰值在线: ${analysis.peakConcurrentViewers || 'N/A'}
- 平均观看时长: ${analysis.avgWatchTime ? `${analysis.avgWatchTime}秒` : 'N/A'}
- 完播人数: ${analysis.complateCnt || 'N/A'}
- 完播率: ${analysis.completionRate || 'N/A'}
- 评论人数: ${analysis.commenterCnt || 'N/A'}
- 评论数: ${analysis.commentCnt || 'N/A'}
- 互动率: ${analysis.interactionRate || 'N/A'}%
- 商品页浏览: ${analysis.mallPageViewCnt || 'N/A'}
- 商品点击: ${analysis.productClickCnt || 'N/A'}
- 成交单数: ${analysis.transactionCnt || 'N/A'}
- 成交金额: ¥${analysis.transactionAmount || 'N/A'}

【录播专属指标】
- 录播观看人数: ${analysis.replyWatcherCnt || 'N/A'}
- 录播观看次数: ${analysis.replyViewCnt || 'N/A'}
- 录播平均观看时长: ${analysis.replyAvgWatchTime ? `${analysis.replyAvgWatchTime}秒` : 'N/A'}

【新老粉数据】
- 新学员数: ${newoldData.nwatcherCnt || 'N/A'}
- 新学员转化率: ${newoldData.nconversionRate || 'N/A'}%
- 老学员数: ${newoldData.owatcherCnt || 'N/A'}
- 老学员转化率: ${newoldData.oconversionRate || 'N/A'}%

【订单分析】
- 支付人数总计: ${orderAnalysis.payUserTotal || 'N/A'}
- 支付成功总计: ${orderAnalysis.paySuccessTotal || 'N/A'}
- 总金额: ¥${orderAnalysis.totalAmount || 'N/A'}

【时间趋势数据】
${extractChartWindow(chartData, null, null)}
`;
  }).join('\n');

  const sessionTimeInfo = startTime && endTime
    ? `录播时间: ${new Date(startTime).toLocaleString('zh-CN')} ~ ${new Date(endTime).toLocaleString('zh-CN')}`
    : '录播时间: 未知';

  return `${skillContent}

---

## 录播回放分析任务

【基本信息】
- 主播: ${anchorName}
- ${sessionTimeInfo}

请对以下录播数据进行**完整分析**。这是一场录播回放（智能直播），请特别关注：
1. 录播的完播率和平均观看时长
2. 新老粉在录播中的转化情况
3. 录播互动效果与实时直播的对比
4. 商品点击和转化在录播中的表现
5. 评论中的常见问题和反馈

${dataSummary}

---

请严格遵守前面定义的五维分析框架输出分析结果：
- 每个维度使用 ### 标题
- 包含具体数据引用
- 给出可操作的改进建议
- 最后必须输出 JSON 结构，用 \`\`\`json 包裹
`;
}

// ==================== 记忆系统集成 ====================

/**
 * 从快照数据中提取商品名称列表
 */
function extractGoodsNamesFromSnapshots(snapshots: Record<string, unknown>[]): string[] {
  const goodsNames = new Set<string>();
  
  for (const snap of snapshots) {
    const rawJson = (snap.rawJson ?? snap.raw_json) as Record<string, unknown> | null;
    if (!rawJson) continue;
    
    const orderDetails = rawJson.orderDetails as Record<string, unknown>[] | null;
    if (orderDetails && orderDetails.length > 0) {
      for (const order of orderDetails) {
        const goodsName = String(order.goodsName || order.productName || '');
        if (goodsName) {
          goodsNames.add(goodsName);
        }
      }
    }
  }
  
  return Array.from(goodsNames);
}

/**
 * 将分析洞察保存到记忆系统
 */
async function saveInsightsToMemory(
  sessionId: number,
  anchorName: string,
  goodsNames: string[],
  analysisText: string,
  jsonData: any,
  modelUsed: string
): Promise<void> {
  try {
    // 提取关键洞察
    const keyInsights = extractKeyInsights(analysisText, jsonData);
    const whatWorked = extractWhatWorked(analysisText);
    const whatFailed = extractWhatFailed(analysisText);
    
    // 保存会话记忆
    await memoryManager.createSessionMemory(
      sessionId,
      {
        key_insights: keyInsights,
        what_worked: whatWorked,
        what_failed: whatFailed,
        action_outcomes: jsonData?.action_items || [],
        new_learnings: extractNewLearnings(analysisText),
      },
      memoryManager.getModelIdentifier('volcengine', modelUsed)
    );
    
    // 更新主播记忆
    const existingAnchorMemory = await memoryManager.getAnchorMemory(anchorName);
    const newLearnings = extractNewLearnings(analysisText);
    
    if (existingAnchorMemory) {
      await memoryManager.createOrUpdateAnchorMemory(
        anchorName,
        {
          key_observations: [...(existingAnchorMemory.key_observations || []), ...keyInsights].slice(-50),
          strengths: [...(existingAnchorMemory.strengths || []), ...whatWorked].slice(-20),
          improvement_areas: [...(existingAnchorMemory.improvement_areas || []), ...whatFailed].slice(-20),
          historical_summary: updateHistoricalSummary(existingAnchorMemory.historical_summary, analysisText),
        },
        memoryManager.getModelIdentifier('volcengine', modelUsed)
      );
    } else {
      await memoryManager.createOrUpdateAnchorMemory(
        anchorName,
        {
          key_observations: keyInsights,
          strengths: whatWorked,
          improvement_areas: whatFailed,
          historical_summary: analysisText.slice(0, 500),
        },
        memoryManager.getModelIdentifier('volcengine', modelUsed)
      );
    }
    
    // 更新商品记忆
    for (const goodsName of goodsNames) {
      const productInsights = extractProductInsights(analysisText, goodsName);
      const existingProductMemory = await memoryManager.getProductMemory(goodsName);
      
      if (existingProductMemory) {
        await memoryManager.createOrUpdateProductMemory(
          goodsName,
          {
            conversion_insights: [...(existingProductMemory.conversion_insights || []), ...productInsights].slice(-30),
            optimal_pitches: [...(existingProductMemory.optimal_pitches || []), ...extractOptimalPitches(analysisText, goodsName)].slice(-20),
            performance_summary: updatePerformanceSummary(existingProductMemory.performance_summary, analysisText, goodsName),
          },
          memoryManager.getModelIdentifier('volcengine', modelUsed)
        );
      } else {
        await memoryManager.createOrUpdateProductMemory(
          goodsName,
          {
            conversion_insights: productInsights,
            optimal_pitches: extractOptimalPitches(analysisText, goodsName),
            performance_summary: extractPerformanceSummary(analysisText, goodsName),
          },
          memoryManager.getModelIdentifier('volcengine', modelUsed)
        );
      }
    }
    
    console.log(`[Memory] 保存分析洞察到记忆系统: session=${sessionId}, anchor=${anchorName}`);
  } catch (err) {
    console.error('[Memory] 保存记忆失败:', err);
  }
}

/**
 * 从分析文本中提取关键洞察
 */
function extractKeyInsights(analysisText: string, jsonData: any): string[] {
  const insights: string[] = [];
  
  // 从 JSON 数据中提取亮点
  if (jsonData?.highlights && Array.isArray(jsonData.highlights)) {
    for (const highlight of jsonData.highlights) {
      if (highlight.title) {
        insights.push(highlight.title);
      }
    }
  }
  
  // 从文本中提取关键句子
  const sentences = analysisText.split(/[。！？\n]/).filter(s => s.trim().length > 10);
  for (const sentence of sentences.slice(0, 10)) {
    if (sentence.includes('关键') || sentence.includes('重要') || sentence.includes('发现')) {
      insights.push(sentence.trim());
    }
  }
  
  return insights.slice(0, 20);
}

/**
 * 从分析文本中提取做得好的部分
 */
function extractWhatWorked(analysisText: string): string[] {
  const worked: string[] = [];
  const keywords = ['做得好', '优势', '优秀', '成功', '亮点', '值得肯定'];
  
  const sentences = analysisText.split(/[。！？\n]/).filter(s => s.trim().length > 10);
  for (const sentence of sentences) {
    if (keywords.some(kw => sentence.includes(kw))) {
      worked.push(sentence.trim());
    }
  }
  
  return worked.slice(0, 10);
}

/**
 * 从分析文本中提取需要改进的部分
 */
function extractWhatFailed(analysisText: string): string[] {
  const failed: string[] = [];
  const keywords = ['需要改进', '问题', '不足', '缺点', '薄弱', '优化'];
  
  const sentences = analysisText.split(/[。！？\n]/).filter(s => s.trim().length > 10);
  for (const sentence of sentences) {
    if (keywords.some(kw => sentence.includes(kw))) {
      failed.push(sentence.trim());
    }
  }
  
  return failed.slice(0, 10);
}

/**
 * 从分析文本中提取新学习到的经验
 */
function extractNewLearnings(analysisText: string): string[] {
  const learnings: string[] = [];
  const keywords = ['学到', '经验', '教训', '总结', '启示'];
  
  const sentences = analysisText.split(/[。！？\n]/).filter(s => s.trim().length > 10);
  for (const sentence of sentences) {
    if (keywords.some(kw => sentence.includes(kw))) {
      learnings.push(sentence.trim());
    }
  }
  
  return learnings.slice(0, 10);
}

/**
 * 更新主播历史总结
 */
function updateHistoricalSummary(existingSummary: string | undefined, newAnalysis: string): string {
  const oldSummary = existingSummary || '';
  const newSummary = newAnalysis.slice(0, 300);
  
  if (oldSummary.length === 0) {
    return newSummary;
  }
  
  return `${oldSummary.slice(0, 200)}\n\n${new Date().toLocaleDateString('zh-CN')}: ${newSummary.slice(0, 200)}`;
}

/**
 * 提取商品特定洞察
 */
function extractProductInsights(analysisText: string, goodsName: string): string[] {
  const insights: string[] = [];
  const sentences = analysisText.split(/[。！？\n]/).filter(s => s.trim().length > 10);
  
  for (const sentence of sentences) {
    if (sentence.includes(goodsName)) {
      insights.push(sentence.trim());
    }
  }
  
  return insights.slice(0, 10);
}

/**
 * 提取商品最佳话术
 */
function extractOptimalPitches(analysisText: string, goodsName: string): string[] {
  const pitches: string[] = [];
  const keywords = ['话术', '介绍', '推荐', '卖点'];
  
  const sentences = analysisText.split(/[。！？\n]/).filter(s => s.trim().length > 10);
  for (const sentence of sentences) {
    if (sentence.includes(goodsName) && keywords.some(kw => sentence.includes(kw))) {
      pitches.push(sentence.trim());
    }
  }
  
  return pitches.slice(0, 5);
}

/**
 * 提取商品表现总结
 */
function extractPerformanceSummary(analysisText: string, goodsName: string): string {
  const relevantParts = analysisText.split(/###?/).filter(part => part.includes(goodsName));
  if (relevantParts.length > 0) {
    return relevantParts[0].slice(0, 300);
  }
  return analysisText.slice(0, 200);
}

/**
 * 更新商品表现总结
 */
function updatePerformanceSummary(existingSummary: string | undefined, newAnalysis: string, goodsName: string): string {
  const oldSummary = existingSummary || '';
  const newSummary = extractPerformanceSummary(newAnalysis, goodsName);
  
  if (oldSummary.length === 0) {
    return newSummary;
  }
  
  return `${oldSummary.slice(0, 200)}\n\n${new Date().toLocaleDateString('zh-CN')}: ${newSummary.slice(0, 200)}`;
}

// ==================== 商品作战卡分析 ====================

/**
 * 分析商品的历史表现并生成作战卡
 */
export async function analyzeProduct(productData: {
  goods_name: string;
  summary: {
    total_sessions: number;
    total_clicks: number;
    total_orders: number;
    total_paid: number;
    total_amount: number;
    avg_click_to_order_rate: string;
    avg_order_to_pay_rate: string;
    avg_click_to_pay_rate: string;
    avg_amount_per_session: string;
  };
  best_session: any;
  worst_session: any;
  recent_sessions: any[];
}): Promise<string> {
  // 获取商品记忆
  const productMemory = await memoryManager.getProductMemory(productData.goods_name);
  const memoryContext = productMemory ? memoryManager.formatMemoryForPrompt({
    anchorMemory: null,
    productMemories: [productMemory],
    recentSessionMemories: [],
    generalKnowledge: [],
  }) : '';
  
  const llmClient = new UniversalLLMClient();
  await llmClient.initFromDb();

  const prompt = buildProductAnalysisPrompt(productData, memoryContext);

  const messages = [
    {
      role: 'system' as const,
      content: '你是一位专业的直播商品分析专家，擅长根据商品的历史销售数据，分析商品表现、给出优化建议，并生成商品作战卡。',
    },
    { role: 'user' as const, content: prompt },
  ];

  const response = await llmClient.invoke(messages as any, {
    temperature: 0.4,
  });

  return response;
}

/**
 * 构建商品分析 Prompt
 */
function buildProductAnalysisPrompt(productData: {
  goods_name: string;
  summary: {
    total_sessions: number;
    total_clicks: number;
    total_orders: number;
    total_paid: number;
    total_amount: number;
    avg_click_to_order_rate: string;
    avg_order_to_pay_rate: string;
    avg_click_to_pay_rate: string;
    avg_amount_per_session: string;
  };
  best_session: any;
  worst_session: any;
  recent_sessions: any[];
}, memoryContext: string = ''): string {
  // 格式化最佳场次信息
  const bestSessionInfo = productData.best_session ? `
【最佳场次】
- 直播间: ${productData.best_session.live_sessions?.room_name || '未知'}
- 主播: ${productData.best_session.live_sessions?.anchor_name || '未知'}
- 时间: ${(productData.best_session.snapshotTime ?? productData.best_session.snapshot_time) ? new Date(String(productData.best_session.snapshotTime ?? productData.best_session.snapshot_time)).toLocaleString('zh-CN') : '未知'}
- 点击数: ${productData.best_session.click_count || 0}
- 下单数: ${productData.best_session.order_count || 0}
- 支付数: ${productData.best_session.paid_count || 0}
- 成交金额: ¥${productData.best_session.pay_amount || 0}
` : '';

  // 格式化近期场次信息
  const recentSessionsInfo = productData.recent_sessions && productData.recent_sessions.length > 0 ? `
【近期场次表现】
${productData.recent_sessions.slice(0, 5).map((session: any, index: number) => `
场次 ${index + 1}:
- 直播间: ${session.room_name || '未知'}
- 主播: ${session.anchor_name || '未知'}
- 时间: ${session.start_time ? new Date(session.start_time).toLocaleString('zh-CN') : '未知'}
`).join('')}
` : '';

  return `
# 商品作战卡分析任务

${memoryContext ? `
【历史记忆上下文】
${memoryContext}
` : ''}

【商品基本信息】
- 商品名称: ${productData.goods_name}

【历史数据汇总】
- 累计上播场次: ${productData.summary.total_sessions}
- 累计点击数: ${productData.summary.total_clicks}
- 累计下单数: ${productData.summary.total_orders}
- 累计支付数: ${productData.summary.total_paid}
- 累计成交金额: ¥${productData.summary.total_amount}
- 场均成交金额: ¥${productData.summary.avg_amount_per_session}

【转化漏斗】
- 点击→下单转化率: ${productData.summary.avg_click_to_order_rate}%
- 下单→支付转化率: ${productData.summary.avg_order_to_pay_rate}%
- 点击→支付转化率: ${productData.summary.avg_click_to_pay_rate}%

${bestSessionInfo}

${recentSessionsInfo}

---

请根据以上数据，为该商品生成一份详细的作战卡分析报告，包含以下内容：

1. **商品概况**（150字以内）：简要总结商品的整体表现

2. **核心指标分析**：
   - 分析点击→下单→支付各环节的转化情况
   - 指出转化漏斗中的薄弱环节

3. **最佳场次复盘**：
   - 分析最佳场次的成功因素
   - 提取可复用的经验

4. **问题诊断**：
   - 分析最差场次的问题所在
   - 指出需要改进的地方

5. **优化建议**：
   - 针对商品介绍话术的建议
   - 针对价格策略的建议
   - 针对展示方式的建议
   - 针对上播时机的建议

6. **行动清单**：
   - 列出3-5条具体可执行的优化动作

请用 Markdown 格式输出，标题层级清晰，数据引用准确，建议具体可操作。
`;
}

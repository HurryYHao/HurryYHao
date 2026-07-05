/**
 * 内容审核过滤模块
 * 对ASR转写文字进行色情/违规词检测和去除，避免AI模型拒绝分析
 */

// ==================== 违规词库 ====================

/**
 * 精确匹配词库（整词匹配，避免误杀）
 * 包含常见的色情/低俗/违规词汇
 */
const EXACT_BLOCK_WORDS: string[] = [
  // 性相关
  '做爱', '性交', '口交', '肛交', '自慰', '手淫', '阳痿', '早泄',
  '勃起', '射精', '高潮', '性欲', '淫荡', '淫乱', '淫秽', '淫贱',
  '阴道', '阴茎', '龟头', '阴蒂', '阴唇', '乳房', '乳沟',
  '强奸', '轮奸', '迷奸', '性侵', '猥亵', '性骚扰',
  '嫖娼', '卖淫', '妓女', '妓院', '援交', '出台',
  '情趣用品', '飞机杯', '自慰器', '催情', '春药',
  '裸体', '裸照', '裸聊', '裸舞', '脱衣',
  '偷拍', '走光', '泄春光', '不雅', '不雅视频',
  // 低俗
  '操你', '日你', '草你', '傻逼', '煞笔', '傻B',
  '妈的', '他妈', '你妈', '他妈的', '滚蛋',
  '王八蛋', '狗日的', '畜生', '畜牲',
  '滚床单', '打炮', '约炮', '开房',
  // 赌博
  '赌博', '赌场', '下注', '押注', '庄家', '开盘',
  // 毒品
  '毒品', '吸毒', '大麻', '冰毒', '海洛因', '摇头丸', 'K粉',
  '可卡因', '鸦片', '吗啡',
];

/**
 * 正则模式匹配（处理变体、谐音、拆字等绕过手法）
 */
const REGEX_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // 谐音变体：口*交 → 口☆交
  { pattern: /口\s*[☆*·\s]\s*交/g, replacement: '[已过滤]' },
  { pattern: /做\s*[☆*·\s]\s*爱/g, replacement: '[已过滤]' },
  { pattern: /性\s*[☆*·\s]\s*交/g, replacement: '[已过滤]' },
  // 拆字：日+立 = 阴 等
  { pattern: /阴\s*[部道唇蒂]/g, replacement: '[已过滤]' },
  // 数字谐音
  { pattern: /[0O〇][0O〇][0O〇]7/g, replacement: '[已过滤]' },  // 007
  { pattern: /约?[泡炮]\s*[友伴]/g, replacement: '[已过滤]' },
  // 常见绕过：加空格、加点、加符号
  { pattern: /裸\s*[聊体照舞]/g, replacement: '[已过滤]' },
  { pattern: /偷\s*[拍窥]/g, replacement: '[已过滤]' },
  { pattern: /走\s*光/g, replacement: '[已过滤]' },
  { pattern: /催\s*情/g, replacement: '[已过滤]' },
  { pattern: /春\s*药/g, replacement: '[已过滤]' },
  { pattern: /性\s*[侵扰虐待]/g, replacement: '[已过滤]' },
];

/**
 * 敏感句模式：如果整句话符合这些模式，移除整句
 */
const SENTENCE_PATTERNS: RegExp[] = [
  /想要.*[联系方式微信电话].*[约见聊]/,
  /加.*[微信VX].*[约聊约]/,
];

// ==================== 过滤引擎 ====================

export interface FilterResult {
  /** 过滤后的文本 */
  filtered: string;
  /** 是否有内容被过滤 */
  wasFiltered: boolean;
  /** 过滤统计 */
  stats: {
    exactMatches: number;
    regexMatches: number;
    sentenceRemovals: number;
  };
}

/**
 * 对文本进行违规内容过滤
 * 1. 精确词匹配 → 替换为 [已过滤]
 * 2. 正则模式匹配 → 替换为 [已过滤]
 * 3. 敏感句模式 → 移除整句
 */
export function filterContent(text: string): FilterResult {
  if (!text || text.trim().length === 0) {
    return { filtered: text, wasFiltered: false, stats: { exactMatches: 0, regexMatches: 0, sentenceRemovals: 0 } };
  }

  let result = text;
  let exactMatches = 0;
  let regexMatches = 0;
  let sentenceRemovals = 0;

  // Step 1: 精确词替换（全词匹配）
  for (const word of EXACT_BLOCK_WORDS) {
    // 使用全局替换，不区分大小写处理
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    const before = result;
    result = result.replace(regex, '[已过滤]');
    if (before !== result) {
      exactMatches++;
    }
  }

  // Step 2: 正则模式匹配
  for (const { pattern, replacement } of REGEX_PATTERNS) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (before !== result) {
      regexMatches++;
    }
  }

  // Step 3: 敏感句移除
  const sentences = result.split(/(?<=[。！？\n])/);
  const kept: string[] = [];
  for (const sentence of sentences) {
    let shouldRemove = false;
    for (const pattern of SENTENCE_PATTERNS) {
      if (pattern.test(sentence)) {
        shouldRemove = true;
        sentenceRemovals++;
        break;
      }
    }
    if (!shouldRemove) {
      kept.push(sentence);
    }
  }
  result = kept.join('');

  // 清理连续的 [已过滤] 标记
  result = result.replace(/(\[已过滤]\s*){2,}/g, '[已过滤]');

  const wasFiltered = exactMatches > 0 || regexMatches > 0 || sentenceRemovals > 0;

  return {
    filtered: result,
    wasFiltered,
    stats: { exactMatches, regexMatches, sentenceRemovals },
  };
}

/**
 * 过滤转写文本（用于 ASR 转写后、存储前）
 * 返回过滤后的文本
 */
export function filterTranscription(text: string): string {
  const result = filterContent(text);
  if (result.wasFiltered) {
    console.log(`[ContentFilter] 转写文本过滤: 精确词=${result.stats.exactMatches}, 正则=${result.stats.regexMatches}, 敏感句=${result.stats.sentenceRemovals}`);
  }
  return result.filtered;
}

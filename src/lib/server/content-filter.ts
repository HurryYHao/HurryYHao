/**
 * 内容审核过滤模块
 * 对ASR转写文字进行色情/违规词检测和去除，避免AI模型拒绝分析
 * 
 * 三层过滤：精确词库 → 正则模式 → 敏感句移除
 * 第四层：如果过滤后仍有残留风险，对整段文字做摘要化处理
 */

// ==================== 违规词库 ====================

/**
 * 精确匹配词库（整词匹配）
 * 覆盖：性相关、低俗、赌博、毒品、暴力、直播带货场景常见擦边词
 */
const EXACT_BLOCK_WORDS: string[] = [
  // 性相关 - 明确
  '做爱', '性交', '口交', '肛交', '自慰', '手淫', '阳痿', '早泄',
  '勃起', '射精', '高潮', '性欲', '淫荡', '淫乱', '淫秽', '淫贱',
  '阴道', '阴茎', '龟头', '阴蒂', '阴唇', '乳房', '乳沟',
  '强奸', '轮奸', '迷奸', '性侵', '猥亵', '性骚扰',
  '嫖娼', '卖淫', '妓女', '妓院', '援交', '出台',
  '情趣用品', '飞机杯', '自慰器', '催情', '春药',
  '裸体', '裸照', '裸聊', '裸舞', '脱衣',
  '偷拍', '走光', '泄春光', '不雅', '不雅视频',
  // 性相关 - 直播/社交常见擦边词
  '大尺度', '擦边', '擦边球', '搞黄色', '色色', '色情',
  '开腿', '露点', '深V', '事业线', '沟沟',
  '胸大', '大胸', '巨乳', '美胸', '丰胸', '揉胸',
  '翘臀', '美臀', '大屁股', '腿玩年',
  '福利', '发福利', '送福利', '看光了',
  '受不了', '受不了了', '顶不住了',
  '好涩', '好色', '涩涩', '色色的',
  '诱惑', '勾引', '挑逗', '撩人', '魅惑',
  '性感', '火辣', '惹火', '喷鼻血', '流鼻血',
  '想入非非', '心痒痒', '想摸', '让你看',
  '私密处', '敏感部位', '私人部位',
  '蕾丝', '丁字裤', '三角裤', '内衣秀',
  // 性相关 - 口语化/隐晦表达（直播评论高频）
  '缴械', '缴械了', '受不了了', '顶不住',
  '蛋蛋', '下体', '私处', '私密', '那个位置',
  '进入身体', '进入体内', '插进去', '插入',
  '口一个', '口一下', '来一口',
  '骚货', '骚死了', '骚了', '好骚', '太骚了',
  '贱人', '小贱人', '犯贱',
  '爽死', '爽死了', '爽翻了', '太爽了',
  '叫床', '呻吟', '喘息', '娇喘',
  '体位', '姿势', '后入', '骑乘', '女上位', '男上位',
  '射了', '要射了', '快射了', '马上射', '要出来了',
  '出来了', '要泄了', '泄了',
  '硬了', '硬起来', '起来', '有反应了',
  '湿了', '流水了', '出水了', '湿湿的',
  '高潮了', '到高潮', '到顶了', '上头了',
  '做的时候', '那个的时候', '办事的时候',
  '开苞', '破处', '初夜', '第一次',
  '舔一下', '舔舔', '亲一下', '亲亲',
  '口交', '吹箫', '咬', '含一下',
  '打飞机', '打手枪', '撸管', '撸',
  '约炮', '约啪', '开房', '滚床单', '打炮',
  '上床', '同房', '发生关系', '那事',
  '前戏', '前趣', '调情', '助兴',
  '延时', '持久', '持久战', '忍住',
  '缩阴', '紧致', '收紧',
  '增大', '增粗', '变长', '变粗',
  '壮阳', '补肾', '助勃',
  '精液', '精子', '卵子', '受精',
  '前列腺', '龟头炎', '包皮',
  '荷尔蒙', '雌激素', '雄激素', '睾丸酮',
  '情趣', '助情', '催情', '动情',
  '性冷淡', '性欲强', '性欲旺', '欲望强',
  '高潮棒', '八爪鱼', '紧箍咒', '啪啪丸', '粉嫩油',
  '震动棒', '跳蛋', '按摩棒', '仿真器',
  '润滑', '润滑液', '润滑油', '按摩油',
  '角色扮演', '制服诱惑', '护士装', '女仆装',
  'SM', '绑缚', '调教', '臣服',
  // 性相关 - 评论中的隐晦色情
  '老公没在家', '老公不在', '一个人在家',
  '不知道啥时候能用到', '没男人',
  '往上拉', '往下拉', '往下摸',
  '边做', '做了', '做的时候',
  '一起来看', '一起做',
  '想看你', '想摸你',
  '进来', '进入', '放进去',
  // 低俗/粗口
  '操你', '日你', '草你', '傻逼', '煞笔', '傻B', '沙雕',
  '妈的', '他妈', '你妈', '他妈的', '滚蛋',
  '王八蛋', '狗日的', '畜生', '畜牲',
  '装逼', '牛逼', '苦逼', '逗逼', '二逼',
  '扯淡', '扯犊子', '放屁', '放狗屁',
  '死鬼', '骚货', '荡妇', '婊子',
  '操', '日', '靠', '卧槽', '我靠', '我擦',
  '屌', '屌丝', '屌爆', '吊丝',
  '屁事', '屁话', '放屁',
  '滚', '滚粗', '滚开', '滚蛋',
  '我擦', '擦了', '擦擦',
  '特么', '尼玛', '泥玛',
  '草泥马', '马勒戈壁',
  'JB', 'jb', '鸡巴', '鸡鸡',
  '蛋疼', '蛋蛋',
  '装13', '装B',
  '法克', 'fuck', 'shit', 'bitch',
  '绿茶婊', '心机婊', '奶茶婊',
  '撕逼', '撕B',
  '买了个表', 'MLGB',
  // 赌博
  '赌博', '赌场', '下注', '押注', '庄家', '开盘',
  '百家乐', '老虎机', '轮盘', '棋牌',
  // 毒品
  '毒品', '吸毒', '大麻', '冰毒', '海洛因', '摇头丸', 'K粉',
  '可卡因', '鸦片', '吗啡', '上瘾', '毒瘾',
  // 暴力
  '砍死', '打死', '弄死', '杀掉', '灭口',
  '捅刀', '割喉', '血腥', '残暴',
  // 直播带货特有违规词
  '全网最低', '全网第一', '史上最低', '绝对低价',
  '国家级', '世界级', '最佳', '最好', '最棒', '顶级',
  '永久免费', '无效退款', '包治百病',
  '秒杀', '抢爆', '疯抢',
  // 迷信
  '算命', '算卦', '保佑', '招财进宝', '辟邪',
  '转运', '改运势', '求姻缘',
];

/**
 * 正则模式匹配（处理变体、谐音、拆字等绕过手法）
 */
const REGEX_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // 谐音变体
  { pattern: /口\s*[☆*·\s]\s*交/g, replacement: '[已过滤]' },
  { pattern: /做\s*[☆*·\s]\s*爱/g, replacement: '[已过滤]' },
  { pattern: /性\s*[☆*·\s]\s*交/g, replacement: '[已过滤]' },
  // 拆字
  { pattern: /阴\s*[部道唇蒂]/g, replacement: '[已过滤]' },
  // 数字谐音
  { pattern: /约?[泡炮]\s*[友伴]/g, replacement: '[已过滤]' },
  // 常见绕过
  { pattern: /裸\s*[聊体照舞]/g, replacement: '[已过滤]' },
  { pattern: /偷\s*[拍窥]/g, replacement: '[已过滤]' },
  { pattern: /走\s*光/g, replacement: '[已过滤]' },
  { pattern: /催\s*情/g, replacement: '[已过滤]' },
  { pattern: /春\s*药/g, replacement: '[已过滤]' },
  { pattern: /性\s*[侵扰虐待]/g, replacement: '[已过滤]' },
  // 擦边隐晦表达
  { pattern: /[好太]\s*[大长深紧湿软热滑嫩满]/g, replacement: '[已过滤]' },
  { pattern: /[揉摸捏]\s*[胸奶臀]/g, replacement: '[已过滤]' },
  { pattern: /[脱扒掀]\s*[衣裤裙衣服]/g, replacement: '[已过滤]' },
  // 直播评论中的色情隐晦表达
  { pattern: /[想好]\s*[摸看亲咬舔揉捏]?\s*[你她他]?\s*[的这]?[里下上面胸腿臀私处]/g, replacement: '[已过滤]' },
  { pattern: /进\s*[入去]\s*[身体里]/g, replacement: '[已过滤]' },
  { pattern: /[放塞插]\s*[进入去]/g, replacement: '[已过滤]' },
  { pattern: /[硬湿爽]\s*[了得不行]/g, replacement: '[已过滤]' },
  { pattern: /射\s*[了出不]/g, replacement: '[已过滤]' },
  { pattern: /[叫呻娇]\s*[床声]/g, replacement: '[已过滤]' },
  { pattern: /精\s*[液子]/g, replacement: '[已过滤]' },
  { pattern: /[做来搞]\s*[爱那那个]/g, replacement: '[已过滤]' },
  { pattern: /[边一]\s*[做搞来]\s*[着完边次]/g, replacement: '[已过滤]' },
  { pattern: /蛋\s*[蛋疼]/g, replacement: '[已过滤]' },
  { pattern: /口\s*[一一下个]/g, replacement: '[已过滤]' },
  { pattern: /骂?\s*你?\s*[骚sS][了死]/g, replacement: '[已过滤]' },
  { pattern: /[打用]\s*[油手]\s*[就会]/g, replacement: '[已过滤]' },
  { pattern: /缴\s*[械]/g, replacement: '[已过滤]' },
  { pattern: /前\s*[戏趣]/g, replacement: '[已过滤]' },
  { pattern: /缩\s*[阴]/g, replacement: '[已过滤]' },
  { pattern: /壮\s*[阳]/g, replacement: '[已过滤]' },
  { pattern: /延\s*[时]/g, replacement: '[已过滤]' },
  { pattern: /持\s*[久]/g, replacement: '[已过滤]' },
  { pattern: /高\s*[潮]/g, replacement: '[已过滤]' },
  { pattern: /性\s*[冷欲淡]/g, replacement: '[已过滤]' },
  // 重复语气词+敏感暗示
  { pattern: /嗯\s*[啊哦]{2,}/g, replacement: '[已过滤]' },
  { pattern: /啊\s*[嗯哦哈]{2,}/g, replacement: '[已过滤]' },
  { pattern: /哈\s*[啊嗯哦]{3,}/g, replacement: '[已过滤]' },
  // 英文变体
  { pattern: /\b(sex|porn|nude|xxx|horny|erotic|orgasm)\b/gi, replacement: '[已过滤]' },
  { pattern: /\b(fuck|shit|bitch|damn|ass)\b/gi, replacement: '[已过滤]' },
];

/**
 * 敏感句模式：如果整句话符合这些模式，移除整句
 */
const SENTENCE_PATTERNS: RegExp[] = [
  /想要.*[联系方式微信电话].*[约见聊]/,
  /加.*[微信VX].*[约聊约]/,
  /[快赶紧来].*[摸看看亲亲抱]/,
  /[想好想].*[摸看看尝尝]/,
  /[给为你].*[福利特殊惊喜].*[粉丝宝宝]/,
  /[今专特别].*[福利]/,
  /[宝宝亲爱].*[想你想要].*[摸抱]/,
  // 直播色情隐晦话术模式
  /[老老公].*[不在].*[一人在家].*[来]/,
  /[想好].*[进插入去].*[身体里面]/,
  /[湿流水].*[不行受不了]/,
  /[硬挺].*[不行受不了]/,
  /[叫呻娇].*[得不行好大声]/,
  /[做搞弄].*[那那个事].*[时候]/,
  /[穿上脱下].*[给为你看]/,
  /[想看看].*[那里私处]/,
  /[奶胸臀腿].*[摸揉捏亲]/,
  /[紧致松].*[里面进去]/,
];

/**
 * 高风险关键词：如果文本中包含这些词，直接对包含该词的句子做整句移除（不只是替换词）
 */
const HIGH_RISK_WORDS: string[] = [
  '做爱', '性交', '口交', '强奸', '迷奸', '猥亵',
  '嫖娼', '卖淫', '裸聊', '裸体', '裸照',
  '手淫', '自慰', '淫荡', '淫乱', '淫秽',
  '赌博', '吸毒', '毒品',
  // 直播场景高频高风险
  '约炮', '打炮', '开房', '滚床单',
  '骚货', '荡妇', '婊子', '贱人',
  '口一个', '口一下',
  '射了', '要射了', '马上射',
  '高潮棒', '啪啪丸', '紧箍咒', '粉嫩油',
  '缩阴', '壮阳', '延时', '催情', '春药',
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
    highRiskRemovals: number;
  };
}

/**
 * 对文本进行违规内容过滤
 * 1. 精确词匹配 → 替换为 [已过滤]
 * 2. 正则模式匹配 → 替换为 [已过滤]
 * 3. 高风险词 → 移除整句
 * 4. 敏感句模式 → 移除整句
 */
export function filterContent(text: string, aggressive: boolean = false): FilterResult {
  if (!text || text.trim().length === 0) {
    return { filtered: text, wasFiltered: false, stats: { exactMatches: 0, regexMatches: 0, sentenceRemovals: 0, highRiskRemovals: 0 } };
  }

  let result = text;
  let exactMatches = 0;
  let regexMatches = 0;
  let sentenceRemovals = 0;
  let highRiskRemovals = 0;

  // Step 1: 精确词替换
  for (const word of EXACT_BLOCK_WORDS) {
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

  // Step 3: 按句拆分，移除高风险句和敏感句
  const sentences = result.split(/(?<=[。！？\n；;])/);
  const kept: string[] = [];
  for (const sentence of sentences) {
    let shouldRemove = false;

    // 激进模式：包含 [已过滤] 标记的句子直接移除
    if (aggressive && sentence.includes('[已过滤]')) {
      shouldRemove = true;
      highRiskRemovals++;
    }

    // 高风险词检查：移除包含高风险词的整句
    if (!shouldRemove) {
      for (const word of HIGH_RISK_WORDS) {
        if (sentence.includes(word) || sentence.includes('[已过滤]')) {
          // 如果句子包含高风险词或已经被替换的标记，检查是否上下文也有问题
          const cleaned = sentence.replace(/\[已过滤\]/g, '').trim();
          if (cleaned.length < 5) {
            // 替换后句子太短，整句移除
            shouldRemove = true;
            highRiskRemovals++;
            break;
          }
        }
      }
    }

    // 敏感句模式检查
    if (!shouldRemove) {
      for (const pattern of SENTENCE_PATTERNS) {
        if (pattern.test(sentence)) {
          shouldRemove = true;
          sentenceRemovals++;
          break;
        }
      }
    }

    if (!shouldRemove) {
      kept.push(sentence);
    }
  }
  result = kept.join('');

  // Step 4: 清理连续的 [已过滤] 标记和多余空白
  result = result.replace(/(\[已过滤]\s*){2,}/g, '[已过滤]');
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.trim();

  const wasFiltered = exactMatches > 0 || regexMatches > 0 || sentenceRemovals > 0 || highRiskRemovals > 0;

  return {
    filtered: result,
    wasFiltered,
    stats: { exactMatches, regexMatches, sentenceRemovals, highRiskRemovals },
  };
}

/**
 * 检查文本是否可能包含违规内容（用于决定是否使用降级策略）
 */
export function hasSuspiciousContent(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();

  // 检查精确词库
  for (const word of EXACT_BLOCK_WORDS) {
    if (lower.includes(word.toLowerCase())) return true;
  }

  // 检查正则模式
  for (const { pattern } of REGEX_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  // 检查高风险词
  for (const word of HIGH_RISK_WORDS) {
    if (lower.includes(word.toLowerCase())) return true;
  }

  return false;
}

/**
 * 过滤转写文本（用于 ASR 转写后、存储前）
 * 返回过滤后的文本
 */
export function filterTranscription(text: string): string {
  const result = filterContent(text);
  if (result.wasFiltered) {
    console.log(`[ContentFilter] 转写文本过滤: 精确词=${result.stats.exactMatches}, 正则=${result.stats.regexMatches}, 敏感句=${result.stats.sentenceRemovals}, 高风险=${result.stats.highRiskRemovals}`);
  }
  return result.filtered;
}

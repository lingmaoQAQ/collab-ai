// Mediator 类型定义

export interface WhatsNewResult {
  since: string;
  newEvents: { eventType: string; userName: string; detail: string }[];
  activeUsers: { userId: string; userName: string; currentTopic: string }[];
  newMemories: string[];
}

export interface EnhanceResult {
  /** 拼接在 systemPromptAddition 后面的跨用户上下文 */
  addition: string;
  /** 检测到的冲突提示（含关键词） */
  conflictHints: string[];
  /** 当前用户的风格偏好文本 */
  styleGuidance: string;
}

export interface EnhanceParams {
  roomId: string;
  userId: string;
  projectContext: string;  // ContextEngine 的输出
}

export interface AnalyzeParams {
  roomId: string;
  userId: string;
  userMessage: string;
  aiResponse: string;
}

/** 中文关键词提取：过滤停用词，取高频词 */
export function extractKeywords(text: string, maxWords = 8): string[] {
  const stopWords = new Set([
    "的", "了", "是", "我", "你", "他", "她", "它", "们", "在", "有", "和",
    "就", "不", "人", "都", "一", "一个", "上", "也", "很", "到", "说", "要",
    "去", "会", "着", "没有", "看", "好", "自己", "这", "那", "什么", "怎么",
    "可以", "这个", "那个", "还是", "只是", "如果", "因为", "所以", "但是",
    "然后", "应该", "需要", "已经", "可能", "比如", "一样", "一直", "不是",
    "就是", "的话", "而已", "吗", "呢", "吧", "啊", "哦", "嗯",
  ]);

  // 分词（简单按非中文字符分割）
  const segments = text.split(/[，。、；：！？\n\s,.!?;:]+/).filter(Boolean);

  const wordFreq = new Map<string, number>();
  for (const seg of segments) {
    // 提取2-4字的中文词组
    for (let len = 4; len >= 2; len--) {
      for (let i = 0; i <= seg.length - len; i++) {
        const w = seg.slice(i, i + len);
        if ([...w].every((c) => /[一-鿿]/.test(c)) && !stopWords.has(w)) {
          wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
        }
      }
    }
  }

  return [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxWords)
    .map(([w]) => w);
}

/** 计算两组关键词的重叠度 */
export function keywordOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const overlap = a.filter((w) => setB.has(w)).length;
  return overlap / Math.max(a.length, b.length);
}

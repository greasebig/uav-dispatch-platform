/**
 * 聊天敏感内容过滤服务
 * 包含：联系方式截流、违法内容过滤
 */

/**
 * 敏感内容类型
 */
export type SensitiveCategory = 
  | 'contact'      // 联系方式（手机、微信、QQ、邮箱）
  | 'illegal'      // 违法内容（黄赌毒）
  | 'fraud'        // 诈骗内容
  | 'politics';    // 政治敏感

/**
 * 过滤结果
 */
export interface FilterResult {
  isFiltered: boolean;
  filteredContent: string;
  reasons: { category: SensitiveCategory; keyword: string }[];
}

/**
 * 联系方式正则
 */
const CONTACT_PATTERNS = {
  // 中国手机号
  phone: /1[3-9]\d{9}/g,
  
  // 微信号
  wechat: /(?:wx|wechat|微信|vx|v信)[:：]?\s*[a-zA-Z][a-zA-Z0-9_-]{4,19}/gi,
  
  // QQ号
  qq: /(?:qq|QQ)[:：]?\s*\d{5,11}/g,
  
  // 邮箱
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  
  // 联系方式关键词
  keywords: /(?:加[我qq微信]|私[聊加]|联系[方式]?|电话|手机号|威信|+v|qq号|账号|账户)[:：]?\s*[a-zA-Z0-9]{4,20}/gi,
};

/**
 * 违法内容关键词（简化版，实际需要更完整的词库）
 */
const ILLEGAL_KEYWORDS = [
  // 赌博相关
  '赌博', '博彩', '皇冠', '百家乐', '时时彩', '赛马', '赌球', '外围', '庄家', '开庄',
  '下注', '投注', '买码', '中奖', '赔率', '水位',
  
  // 色情相关
  '黄色', '成人', '激情', '裸聊', '援交', '约炮', '买春', '卖淫', '嫖娼', '黄色视频',
  '成人网站', '黄色小说', '裸聊', '同城交友', '一夜情',
  
  // 毒品相关
  '毒品', '大麻', '海洛因', '冰毒', 'K粉', '摇头丸', '可卡因', '鸦片', '吗啡',
  '制毒', '贩毒', '吸毒', '运毒',
  
  // 诈骗相关
  '诈骗', '刷单', '返利', '投资', '理财', '分红', '本金', '保证金', '解冻',
  '中奖', '补贴', '退款', '客服', '公安局', '通缉令', '资金', '安全账户',
];

/**
 * 政治敏感词（简化版）
 */
const POLITICS_KEYWORDS = [
  '台独', '港独', '藏独', '疆独', '分裂', '颠覆', '反动', '暴动', '游行', '示威',
  '法轮功', '全能神', '门徒会', '统一教',
];

/**
 * 诈骗关键词
 */
const FRAUD_KEYWORDS = [
  '刷单', '点赞', '关注', '返现', '高额回报', '稳赚', '内幕', '老师', '带单',
  '群里', '跟我做', '加微信', '注册', '首充', '充值优惠', 'VIP', '升级',
];

/**
 * 过滤敏感内容
 * @param content 原始内容
 * @returns 过滤结果
 */
export function filterSensitiveContent(content: string): FilterResult {
  let filteredContent = content;
  const reasons: { category: SensitiveCategory; keyword: string }[] = [];

  // 1. 过滤联系方式
  // 手机号
  const phoneMatches = content.match(CONTACT_PATTERNS.phone);
  if (phoneMatches) {
    filteredContent = filteredContent.replace(CONTACT_PATTERNS.phone, '***');
    reasons.push({ category: 'contact', keyword: '手机号' });
  }

  // 微信号
  const wechatMatches = content.match(CONTACT_PATTERNS.wechat);
  if (wechatMatches) {
    filteredContent = filteredContent.replace(CONTACT_PATTERNS.wechat, 'wx:***');
    reasons.push({ category: 'contact', keyword: '微信号' });
  }

  // QQ号
  const qqMatches = content.match(CONTACT_PATTERNS.qq);
  if (qqMatches) {
    filteredContent = filteredContent.replace(CONTACT_PATTERNS.qq, 'qq:***');
    reasons.push({ category: 'contact', keyword: 'QQ号' });
  }

  // 邮箱
  const emailMatches = content.match(CONTACT_PATTERNS.email);
  if (emailMatches) {
    filteredContent = filteredContent.replace(CONTACT_PATTERNS.email, '***@***.***');
    reasons.push({ category: 'contact', keyword: '邮箱' });
  }

  // 联系方式关键词
  const keywordMatches = content.match(CONTACT_PATTERNS.keywords);
  if (keywordMatches) {
    filteredContent = filteredContent.replace(CONTACT_PATTERNS.keywords, '***');
    reasons.push({ category: 'contact', keyword: '联系方式' });
  }

  // 2. 过滤违法内容
  for (const keyword of ILLEGAL_KEYWORDS) {
    if (content.includes(keyword)) {
      filteredContent = filteredContent.replace(new RegExp(keyword, 'gi'), '***');
      reasons.push({ category: 'illegal', keyword });
    }
  }

  // 3. 过滤政治敏感
  for (const keyword of POLITICS_KEYWORDS) {
    if (content.includes(keyword)) {
      filteredContent = filteredContent.replace(new RegExp(keyword, 'gi'), '***');
      reasons.push({ category: 'politics', keyword });
    }
  }

  // 4. 过滤诈骗内容
  for (const keyword of FRAUD_KEYWORDS) {
    if (content.includes(keyword)) {
      filteredContent = filteredContent.replace(new RegExp(keyword, 'gi'), '***');
      reasons.push({ category: 'fraud', keyword });
    }
  }

  return {
    isFiltered: reasons.length > 0,
    filteredContent,
    reasons: [...new Map(reasons.map(r => [r.keyword + r.category, r])).values()], // 去重
  };
}

/**
 * 获取过滤原因描述
 */
export function getFilterReasonDescription(reasons: { category: SensitiveCategory; keyword: string }[]): string {
  const categories = new Set(reasons.map(r => r.category));
  
  if (categories.has('contact')) {
    return '为保护您的资金安全，请勿在聊天中私下交换联系方式，建议通过平台完成交易。';
  }
  if (categories.has('illegal')) {
    return '您发送的内容包含违规信息，无法发送。';
  }
  if (categories.has('politics')) {
    return '您发送的内容包含敏感信息，无法发送。';
  }
  if (categories.has('fraud')) {
    return '请注意防范诈骗，平台不会要求您转账到个人账户。';
  }
  
  return '您发送的内容无法通过审核。';
}

/**
 * 检查是否包含联系方式
 */
export function containsContactInfo(content: string): boolean {
  return CONTACT_PATTERNS.phone.test(content) ||
         CONTACT_PATTERNS.wechat.test(content) ||
         CONTACT_PATTERNS.qq.test(content) ||
         CONTACT_PATTERNS.email.test(content) ||
         CONTACT_PATTERNS.keywords.test(content);
}

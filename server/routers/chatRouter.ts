import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { db } from "../db";
import { conversations, messages, users, pilotProfiles, customerProfiles } from "../../drizzle/schema";
import { eq, and, desc, asc, gt, sql } from "drizzle-orm";

/**
 * 敏感内容过滤正则表达式
 */
const SENSITIVE_PATTERNS = {
  // 中国手机号
  phone: /1[3-9]\d{9}/g,
  // 微信号
  wechat: /(?:wx|wechat|微信|vx|v信)[:：]?\s*[a-zA-Z][a-zA-Z0-9_-]{4,19}/gi,
  // QQ号
  qq: /(?:qq|QQ)[:：]?\s*\d{5,11}/g,
  // 邮箱
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // 其他联系方式关键词
  keywords: /(?:加我|私聊|联系我|电话|手机号|联系方式|v[:：]|v\s)/gi,
};

/**
 * 过滤敏感内容
 */
function filterSensitiveContent(content: string): { filtered: string; reasons: string[] } {
  const reasons: string[] = [];
  let filtered = content;

  if (SENSITIVE_PATTERNS.phone.test(content)) {
    reasons.push("手机号码");
    filtered = filtered.replace(SENSITIVE_PATTERNS.phone, "***");
  }

  if (SENSITIVE_PATTERNS.wechat.test(content)) {
    reasons.push("微信号");
    filtered = filtered.replace(SENSITIVE_PATTERNS.wechat, "wx: ***");
  }

  if (SENSITIVE_PATTERNS.qq.test(content)) {
    reasons.push("QQ号");
    filtered = filtered.replace(SENSITIVE_PATTERNS.qq, "qq: ***");
  }

  if (SENSITIVE_PATTERNS.email.test(content)) {
    reasons.push("邮箱地址");
    filtered = filtered.replace(SENSITIVE_PATTERNS.email, "***@***.***");
  }

  if (SENSITIVE_PATTERNS.keywords.test(content)) {
    reasons.push("联系方式");
    filtered = filtered.replace(SENSITIVE_PATTERNS.keywords, "***");
  }

  return { filtered, reasons };
}

/**
 * 聊天路由
 */
export const chatRouter = router({
  /**
   * 获取对话列表
   */
  getConversations: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    const conversationList = await db
      .select({
        id: conversations.id,
        userId1: conversations.userId1,
        userId2: conversations.userId2,
        updatedAt: conversations.updatedAt,
        unreadCount: conversations.unreadCount,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.userId1, userId),
          eq(conversations.userId2, userId)
        )
      )
      .orderBy(desc(conversations.updatedAt));

    // 获取每个对话的对方信息
    const result = await Promise.all(
      conversationList.map(async (conv) => {
        const otherUserId = conv.userId1 === userId ? conv.userId2 : conv.userId1;
        
        const [userInfo] = await db
          .select({
            id: users.id,
            name: users.name,
            avatar: users.avatar,
            role: users.role,
          })
          .from(users)
          .where(eq(users.id, otherUserId));

        // 获取飞手或客户资料
        let additionalInfo = {};
        if (userInfo?.role === 'pilot') {
          const [pilotInfo] = await db
            .select({
              realName: pilotProfiles.realName,
            })
            .from(pilotProfiles)
            .where(eq(pilotProfiles.userId, otherUserId));
          additionalInfo = pilotInfo || {};
        } else if (userInfo?.role === 'customer') {
          const [customerInfo] = await db
            .select({
              companyName: customerProfiles.companyName,
            })
            .from(customerProfiles)
            .where(eq(customerProfiles.userId, otherUserId));
          additionalInfo = customerInfo || {};
        }

        // 获取最后一条消息
        const [lastMsg] = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conv.id))
          .orderBy(desc(messages.createdAt))
          .limit(1);

        return {
          ...conv,
          otherUser: { ...userInfo, ...additionalInfo },
          lastMessage: lastMsg,
        };
      })
    );

    return result;
  }),

  /**
   * 获取历史消息
   */
  getMessages: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ input }) => {
      const messageList = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, input.conversationId))
        .orderBy(asc(messages.createdAt));

      return messageList;
    }),

  /**
   * 发送消息
   */
  sendMessage: protectedProcedure
    .input(
      z.object({
        receiverId: z.number(),
        content: z.string().min(1).max(1000),
        type: z.enum(["text", "image", "location"]).default("text"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const senderId = ctx.user.id;
      
      // 检查是否已付费解锁联系方式
      // TODO: 检查订单状态

      // 查找或创建对话
      let [conversation] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.userId1, senderId),
            eq(conversations.userId2, input.receiverId)
          )
        );

      if (!conversation) {
        // 检查反向
        [conversation] = await db
          .select()
          .from(conversations)
          .where(
            and(
              eq(conversations.userId1, input.receiverId),
              eq(conversations.userId2, senderId)
            )
          );

        if (!conversation) {
          // 创建新对话
          const [newConversation] = await db
            .insert(conversations)
            .values({
              userId1: senderId,
              userId2: input.receiverId,
              unreadCount: 0,
            })
            .returning();
          conversation = newConversation;
        }
      }

      // 过滤敏感内容
      const { filtered, reasons } = filterSensitiveContent(input.content);
      const isFiltered = reasons.length > 0;

      // 插入消息
      const [newMessage] = await db
        .insert(messages)
        .values({
          conversationId: conversation.id,
          senderId: senderId,
          receiverId: input.receiverId,
          content: input.content,
          filteredContent: isFiltered ? filtered : null,
          isFiltered: isFiltered,
          type: input.type,
          status: "sent",
        })
        .returning();

      // 更新对话时间
      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversation.id));

      // 如果有敏感内容，记录警告
      if (isFiltered) {
        // TODO: 记录风控日志
        console.warn(`Sensitive content filtered for user ${senderId}:`, reasons);
      }

      return newMessage;
    }),

  /**
   * 标记消息为已读
   */
  markAsRead: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(conversations)
        .set({ unreadCount: 0 })
        .where(eq(conversations.id, input.conversationId));

      return { success: true };
    }),

  /**
   * 创建对话（用于获取联系方式后开始聊天）
   */
  createConversation: protectedProcedure
    .input(z.object({ pilotId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // 检查是否已存在对话
      let [conversation] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.userId1, userId),
            eq(conversations.userId2, input.pilotId)
          )
        );

      if (!conversation) {
        [conversation] = await db
          .insert(conversations)
          .values({
            userId1: userId,
            userId2: input.pilotId,
            unreadCount: 0,
          })
          .returning();
      }

      return conversation;
    }),
});

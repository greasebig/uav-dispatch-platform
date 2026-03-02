import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { db } from "../db";
import { 
  contactUnlocks, 
  orders, 
  tasks, 
  users, 
  pilotProfiles,
  systemConfig 
} from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import Stripe from "stripe";

/**
 * 联系方式解锁路由 - 用户付费获取飞手联系方式
 */
export const contactRouter = router({
  /**
   * 创建联系方式解锁订单
   */
  createUnlockOrder: protectedProcedure
    .input(z.object({
      pilotId: z.number(),
      taskId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // 获取解锁费用配置
      const [config] = await db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.key, "contact_unlock_fee"));
      
      const unlockFee = config ? JSON.parse(config.value as string).fee : 9.9;

      // 检查是否已解锁
      const [existing] = await db
        .select()
        .from(contactUnlocks)
        .where(
          and(
            eq(contactUnlocks.userId, userId),
            eq(contactUnlocks.pilotId, input.pilotId),
            eq(contactUnlocks.status, "paid")
          )
        );

      if (existing) {
        return {
          alreadyUnlocked: true,
          contact: {
            phone: existing.pilotPhone,
            wechat: existing.pilotWechat,
          },
        };
      }

      // 创建解锁记录
      const [unlock] = await db
        .insert(contactUnlocks)
        .values({
          userId,
          pilotId: input.pilotId,
          taskId: input.taskId,
          unlockFee,
          status: "pending",
          expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24小时过期
        })
        .returning();

      // 创建Stripe支付会话
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
        apiVersion: "2023-10-16",
      });

      // 获取飞手信息
      const [pilotProfile] = await db
        .select()
        .from(pilotProfiles)
        .where(eq(pilotProfiles.id, input.pilotId));

      const [pilotUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, pilotProfile?.userId || 0));

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "cny",
            product_data: {
              name: "获取飞手联系方式",
              description: `解锁 ${pilotProfile?.realName || "飞手"} 的联系方式`,
            },
            unit_amount: Math.round(unlockFee * 100),
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: `${process.env.FRONTEND_URL}/unlock/success?unlockId=${unlock.id}`,
        cancel_url: `${process.env.FRONTEND_URL}/unlock/cancel?unlockId=${unlock.id}`,
        metadata: {
          unlockId: unlock.id.toString(),
          userId: userId.toString(),
          pilotId: input.pilotId.toString(),
        },
      });

      return {
        unlockId: unlock.id,
        paymentUrl: session.url,
        unlockFee,
      };
    }),

  /**
   * 确认解锁（支付成功后调用）
   */
  confirmUnlock: protectedProcedure
    .input(z.object({
      unlockId: z.number(),
      paymentIntentId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 获取飞手联系方式（从飞手资料）
      const [unlock] = await db
        .select()
        .from(contactUnlocks)
        .where(eq(contactUnlocks.id, input.unlockId));

      if (!unlock) {
        throw new TRPCError({ code: "NOT_FOUND", message: "解锁记录不存在" });
      }

      const [pilotProfile] = await db
        .select()
        .from(pilotProfiles)
        .where(eq(pilotProfiles.userId, unlock.pilotId));

      // 更新解锁状态
      await db
        .update(contactUnlocks)
        .set({
          status: "paid",
          orderId: parseInt(input.paymentIntentId),
        })
        .where(eq(contactUnlocks.id, input.unlockId));

      return {
        success: true,
        contact: {
          phone: pilotProfile?.phone || "未设置",
          wechat: pilotProfile?.wechat || "未设置",
        },
      };
    }),

  /**
   * 获取已解锁的联系方式
   */
  getUnlockedContact: protectedProcedure
    .input(z.object({
      pilotId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const [unlock] = await db
        .select()
        .from(contactUnlocks)
        .where(
          and(
            eq(contactUnlocks.userId, userId),
            eq(contactUnlocks.pilotId, input.pilotId),
            eq(contactUnlocks.status, "paid")
          )
        );

      if (!unlock) {
        return { unlocked: false };
      }

      const [pilotProfile] = await db
        .select()
        .from(pilotProfiles)
        .where(eq(pilotProfiles.userId, unlock.pilotId));

      return {
        unlocked: true,
        contact: {
          phone: pilotProfile?.phone,
          wechat: pilotProfile?.wechat,
        },
      };
    }),

  /**
   * 获取解锁记录列表（用户）
   */
  getMyUnlocks: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    const unlocks = await db
      .select()
      .from(contactUnlocks)
      .where(eq(contactUnlocks.userId, userId))
      .orderBy(desc(contactUnlocks.createdAt));

    // 获取飞手信息
    const result = await Promise.all(
      unlocks.map(async (unlock) => {
        const [pilotProfile] = await db
          .select()
          .from(pilotProfiles)
          .where(eq(pilotProfiles.userId, unlock.pilotId));

        const [pilotUser] = await db
          .select({ name: users.name, avatar: users.avatar })
          .from(users)
          .where(eq(users.id, unlock.pilotId));

        return {
          ...unlock,
          pilotName: pilotProfile?.realName || pilotUser?.name || "未知飞手",
          pilotAvatar: pilotUser?.avatar,
        };
      })
    );

    return result;
  }),

  /**
   * Webhook处理支付回调
   */
  handlePaymentWebhook: protectedProcedure
    .input(z.object({
      paymentIntentId: z.string(),
      status: z.string(),
    }))
    .mutation(async ({ input }) => {
      // 在生产环境中应该通过Stripe Webhook处理
      // 这里简化为内部调用
      if (input.status === "succeeded") {
        // 更新订单状态
        // TODO: 实现完整的支付流程
      }
      return { received: true };
    }),
});

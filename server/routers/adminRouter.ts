import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { db } from "../db";
import { users, pilotProfiles, customerProfiles } from "../../drizzle/schema";
import { eq, and, like, or, desc } from "drizzle-orm";

/**
 * 管理员路由 - 用户管理
 */
export const adminRouter = router({
  /**
   * 获取用户列表
   */
  getUsers: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      role: z.enum(["customer", "pilot", "admin"]).optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      // 检查管理员权限
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可访问" });
      }

      const conditions = [];

      // 搜索条件
      if (input.search) {
        conditions.push(
          or(
            like(users.name, `%${input.search}%`),
            like(users.email, `%${input.search}%`),
            like(users.phone, `%${input.search}%`)
          )
        );
      }

      // 角色筛选
      if (input.role) {
        conditions.push(eq(users.role, input.role));
      }

      // 查询用户
      const userList = await db
        .select()
        .from(users)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(users.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      // 获取飞手和客户的附加信息
      const result = await Promise.all(
        userList.map(async (user) => {
          let additionalInfo = {};
          
          if (user.role === "pilot") {
            const [profile] = await db
              .select()
              .from(pilotProfiles)
              .where(eq(pilotProfiles.userId, user.id));
            additionalInfo = {
              realName: profile?.realName,
              level: profile?.level,
              status: profile?.status,
            };
          } else if (user.role === "customer") {
            const [profile] = await db
              .select()
              .from(customerProfiles)
              .where(eq(customerProfiles.userId, user.id));
            additionalInfo = {
              companyName: profile?.companyName,
              isVerified: profile?.isVerified,
            };
          }

          return {
            ...user,
            ...additionalInfo,
          };
        })
      );

      return result;
    }),

  /**
   * 获取单个用户详情
   */
  getUserById: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可访问" });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId));

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      // 获取附加信息
      let additionalInfo = {};
      if (user.role === "pilot") {
        const [profile] = await db
          .select()
          .from(pilotProfiles)
          .where(eq(pilotProfiles.userId, user.id));
        additionalInfo = { pilotProfile: profile };
      } else if (user.role === "customer") {
        const [profile] = await db
          .select()
          .from(customerProfiles)
          .where(eq(customerProfiles.userId, user.id));
        additionalInfo = { customerProfile: profile };
      }

      return { ...user, ...additionalInfo };
    }),

  /**
   * 更新用户状态（禁用/启用）
   */
  updateUserStatus: protectedProcedure
    .input(z.object({
      userId: z.number(),
      banned: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可执行此操作" });
      }

      // 不能禁用管理员自己
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能禁用自己的账户" });
      }

      await db
        .update(users)
        .set({ 
          // 这里可以添加 banned 字段
          updatedAt: new Date() 
        })
        .where(eq(users.id, input.userId));

      // TODO: 可以在 users 表中添加 banned 字段
      return { success: true };
    }),

  /**
   * 更新用户角色
   */
  updateUserRole: protectedProcedure
    .input(z.object({
      userId: z.number(),
      role: z.enum(["customer", "pilot", "admin"]),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可执行此操作" });
      }

      // 不能修改自己的角色
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能修改自己的角色" });
      }

      await db
        .update(users)
        .set({ 
          role: input.role,
          updatedAt: new Date() 
        })
        .where(eq(users.id, input.userId));

      return { success: true };
    }),

  /**
   * 获取统计数据
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可访问" });
    }

    // 统计用户数量
    const [totalUsers] = await db
      .select({ count: users.id })
      .from(users);

    const [customerCount] = await db
      .select({ count: users.id })
      .from(users)
      .where(eq(users.role, "customer"));

    const [pilotCount] = await db
      .select({ count: users.id })
      .from(users)
      .where(eq(users.role, "pilot"));

    // 统计飞手状态
    const [availablePilots] = await db
      .select({ count: pilotProfiles.id })
      .from(pilotProfiles)
      .where(eq(pilotProfiles.status, "available"));

    return {
      totalUsers: totalUsers?.count || 0,
      customers: customerCount?.count || 0,
      pilots: pilotCount?.count || 0,
      availablePilots: availablePilots?.count || 0,
    };
  }),
});

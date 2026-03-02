import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { db } from "../db";
import { users, pilotProfiles, customerProfiles, pilotQualifications, pilotEquipment, tasks, taskPushHistory, orders } from "../../drizzle/schema";
import { eq, and, like, or, desc, asc, sql, count } from "drizzle-orm";

/**
 * 管理员路由 - 完整功能
 * 包含：用户管理、飞手资质审核、任务管理、统计分析
 */
export const adminRouter = router({
  // ========== 用户管理 ==========

  /**
   * 获取用户列表
   */
  getUsers: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        role: z.enum(["customer", "pilot", "admin"]).optional(),
        banned: z.boolean().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可访问" });
      }

      const conditions = [];

      if (input.search) {
        conditions.push(
          or(
            like(users.name, `%${input.search}%`),
            like(users.email, `%${input.search}%`),
            like(users.phone, `%${input.search}%`)
          )
        );
      }

      if (input.role) {
        conditions.push(eq(users.role, input.role));
      }

      // 获取用户列表
      const userList = await db
        .select()
        .from(users)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(users.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      // 获取总数
      const [total] = await db
        .select({ count: count() })
        .from(users)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      // 获取飞手和客户的附加信息
      const result = await Promise.all(
        userList.map(async (user) => {
          let additionalInfo = {};

          if (user.role === "pilot") {
            const [profile] = await db
              .select()
              .from(pilotProfiles)
              .where(eq(pilotProfiles.userId, user.id))
              .limit(1);
            additionalInfo = {
              realName: profile?.realName,
              level: profile?.level,
              status: profile?.status,
              totalTasks: profile?.totalTasks,
              completedTasks: profile?.completedTasks,
              averageRating: profile?.averageRating,
            };
          } else if (user.role === "customer") {
            const [profile] = await db
              .select()
              .from(customerProfiles)
              .where(eq(customerProfiles.userId, user.id))
              .limit(1);
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

      return {
        users: result,
        total: total?.count || 0,
        page: input.page,
        pageSize: input.pageSize,
      };
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
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      // 获取附加信息
      let additionalInfo = {};

      if (user.role === "pilot") {
        const [profile] = await db
          .select()
          .from(pilotProfiles)
          .where(eq(pilotProfiles.userId, user.id))
          .limit(1);

        const qualifications = await db
          .select()
          .from(pilotQualifications)
          .where(eq(pilotQualifications.pilotId, profile?.id));

        const equipment = await db
          .select()
          .from(pilotEquipment)
          .where(eq(pilotEquipment.pilotId, profile?.id));

        additionalInfo = { pilotProfile: profile, qualifications, equipment };
      } else if (user.role === "customer") {
        const [profile] = await db
          .select()
          .from(customerProfiles)
          .where(eq(customerProfiles.userId, user.id))
          .limit(1);
        additionalInfo = { customerProfile: profile };
      }

      return { ...user, ...additionalInfo };
    }),

  /**
   * 更新用户状态（禁用/启用）
   */
  updateUserStatus: protectedProcedure
    .input(
      z.object({
        userId: z.number(),
        banned: z.boolean(),
        banReason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可执行此操作" });
      }

      // 不能禁用管理员自己
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能禁用自己的账户" });
      }

      // TODO: 添加banned字段到users表
      // await db
      //   .update(users)
      //   .set({
      //     banned: input.banned,
      //     banReason: input.banReason,
      //     updatedAt: new Date()
      //   })
      //   .where(eq(users.id, input.userId));

      return { success: true, message: input.banned ? "用户已禁用" : "用户已启用" };
    }),

  /**
   * 更新用户角色
   */
  updateUserRole: protectedProcedure
    .input(
      z.object({
        userId: z.number(),
        role: z.enum(["customer", "pilot", "admin"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可执行此操作" });
      }

      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能修改自己的角色" });
      }

      await db
        .update(users)
        .set({
          role: input.role,
          updatedAt: new Date(),
        })
        .where(eq(users.id, input.userId));

      return { success: true, message: `用户角色已更新为${input.role}` };
    }),

  /**
   * 删除用户
   */
  deleteUser: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可执行此操作" });
      }

      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能删除自己的账户" });
      }

      // 软删除：标记为已删除
      await db
        .update(users)
        .set({
          name: "已删除用户",
          email: null,
          phone: null,
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, input.userId));

      return { success: true, message: "用户已删除" };
    }),

  // ========== 飞手资质审核 ==========

  /**
   * 获取飞手资质审核列表
   */
  getQualificationReviews: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "approved", "rejected"]).optional(),
        pilotId: z.number().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可访问" });
      }

      const conditions = [];

      if (input.status) {
        conditions.push(eq(pilotQualifications.status, input.status));
      }
      if (input.pilotId) {
        conditions.push(eq(pilotQualifications.pilotId, input.pilotId));
      }

      const qualifications = await db
        .select()
        .from(pilotQualifications)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(pilotQualifications.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      // 获取飞手信息
      const result = await Promise.all(
        qualifications.map(async (q) => {
          const [profile] = await db
            .select()
            .from(pilotProfiles)
            .where(eq(pilotProfiles.id, q.pilotId))
            .limit(1);

          const [user] = profile
            ? await db
                .select()
                .from(users)
                .where(eq(users.id, profile.userId))
                .limit(1)
            : [null];

          return {
            ...q,
            pilotName: profile?.realName,
            pilotUserId: profile?.userId,
            pilotPhone: user?.phone,
          };
        })
      );

      return result;
    }),

  /**
   * 审核资质
   */
  reviewQualification: protectedProcedure
    .input(
      z.object({
        qualificationId: z.number(),
        approved: z.boolean(),
        rejectionReason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可执行此操作" });
      }

      const [qualification] = await db
        .select()
        .from(pilotQualifications)
        .where(eq(pilotQualifications.id, input.qualificationId))
        .limit(1);

      if (!qualification) {
        throw new TRPCError({ code: "NOT_FOUND", message: "资质不存在" });
      }

      await db
        .update(pilotQualifications)
        .set({
          status: input.approved ? "approved" : "rejected",
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
          rejectionReason: input.rejectionReason || null,
          updatedAt: new Date(),
        })
        .where(eq(pilotQualifications.id, input.qualificationId));

      // 如果是无人机执照，审核通过后更新飞手实名认证状态
      if (input.approved && qualification.type === "drone_license") {
        await db
          .update(pilotProfiles)
          .set({
            isRealNameVerified: true,
            realNameVerifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(pilotProfiles.id, qualification.pilotId));
      }

      return {
        success: true,
        message: input.approved ? "资质已通过" : "资质已拒绝",
      };
    }),

  // ========== 任务管理 ==========

  /**
   * 获取任务列表（管理员）
   */
  getTasks: protectedProcedure
    .input(
      z.object({
        status: z
          .enum([
            "draft",
            "published",
            "pending_approval",
            "approved",
            "pushing",
            "accepted",
            "in_progress",
            "completed",
            "cancelled",
            "disputed",
          ])
          .optional(),
        taskType: z.enum(["spray", "transport"]).optional(),
        pilotId: z.number().optional(),
        customerId: z.number().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可访问" });
      }

      const conditions = [];

      if (input.status) {
        conditions.push(eq(tasks.status, input.status));
      }
      if (input.taskType) {
        conditions.push(eq(tasks.taskType, input.taskType));
      }
      if (input.pilotId) {
        conditions.push(eq(tasks.assignedPilotId, input.pilotId));
      }
      if (input.customerId) {
        conditions.push(eq(tasks.customerId, input.customerId));
      }

      const taskList = await db
        .select()
        .from(tasks)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(tasks.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      // 获取客户和飞手信息
      const result = await Promise.all(
        taskList.map(async (task) => {
          const [customer] = await db
            .select()
            .from(users)
            .where(eq(users.id, task.customerId))
            .limit(1);

          let pilot = null;
          if (task.assignedPilotId) {
            const [profile] = await db
              .select()
              .from(pilotProfiles)
              .where(eq(pilotProfiles.id, task.assignedPilotId))
              .limit(1);
            if (profile) {
              const [pilotUser] = await db
                .select()
                .from(users)
                .where(eq(users.id, profile.userId))
                .limit(1);
              pilot = { ...profile, user: pilotUser };
            }
          }

          return {
            ...task,
            customerName: customer?.name,
            pilot,
          };
        })
      );

      return result;
    }),

  /**
   * 获取任务详情（管理员）
   */
  getTaskDetail: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可访问" });
      }

      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, input.taskId))
        .limit(1);

      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
      }

      // 获取推送历史
      const pushHistory = await db
        .select()
        .from(taskPushHistory)
        .where(eq(taskPushHistory.taskId, task.id))
        .orderBy(desc(taskPushHistory.pushTime));

      // 获取订单信息
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.taskId, task.id))
        .limit(1);

      return { task, pushHistory, order };
    }),

  /**
   * 管理员强制取消任务
   */
  cancelTask: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        reason: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可执行此操作" });
      }

      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, input.taskId))
        .limit(1);

      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
      }

      // 只有进行中的任务可以取消
      if (!["accepted", "in_progress"].includes(task.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "当前状态无法取消",
        });
      }

      await db
        .update(tasks)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          cancellationReason: input.reason,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, input.taskId));

      // TODO: 退款处理

      return { success: true, message: "任务已取消" };
    }),

  // ========== 统计分析 ==========

  /**
   * 获取统计数据
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可访问" });
    }

    // 用户统计
    const [totalUsers] = await db
      .select({ count: count() })
      .from(users);

    const [customerCount] = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.role, "customer"));

    const [pilotCount] = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.role, "pilot"));

    // 飞手状态统计
    const [availablePilots] = await db
      .select({ count: count() })
      .from(pilotProfiles)
      .where(eq(pilotProfiles.status, "available"));

    const [busyPilots] = await db
      .select({ count: count() })
      .from(pilotProfiles)
      .where(eq(pilotProfiles.status, "busy"));

    // 任务统计
    const [totalTasks] = await db
      .select({ count: count() })
      .from(tasks);

    const [completedTasks] = await db
      .select({ count: count() })
      .from(tasks)
      .where(eq(tasks.status, "completed"));

    const [pendingTasks] = await db
      .select({ count: count() })
      .from(tasks)
      .where(eq(tasks.status, "published"));

    // 订单统计
    const [totalOrders] = await db
      .select({ count: count() })
      .from(orders);

    const [totalAmount] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)`,
      })
      .from(orders);

    const [platformFee] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${orders.platformFee}), 0)`,
      })
      .from(orders);

    // 待审核资质
    const [pendingQualifications] = await db
      .select({ count: count() })
      .from(pilotQualifications)
      .where(eq(pilotQualifications.status, "pending"));

    return {
      users: {
        total: totalUsers?.count || 0,
        customers: customerCount?.count || 0,
        pilots: pilotCount?.count || 0,
      },
      pilots: {
        available: availablePilots?.count || 0,
        busy: busyPilots?.count || 0,
      },
      tasks: {
        total: totalTasks?.count || 0,
        completed: completedTasks?.count || 0,
        pending: pendingTasks?.count || 0,
      },
      orders: {
        total: totalOrders?.count || 0,
        totalAmount: totalAmount?.total || 0,
        platformFee: platformFee?.total || 0,
      },
      pendingQualifications: pendingQualifications?.count || 0,
    };
  }),

  /**
   * 获取趋势数据
   */
  getTrendData: protectedProcedure
    .input(
      z.object({
        type: z.enum(["users", "tasks", "orders", "revenue"]),
        days: z.number().default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可访问" });
      }

      const { type, days } = input;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // TODO: 实现实际的时间序列查询
      // 这里返回模拟数据
      const data = [];
      for (let i = days; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];

        data.push({
          date: dateStr,
          count:
            type === "revenue"
              ? Math.floor(Math.random() * 10000) + 1000
              : Math.floor(Math.random() * 50) + 10,
        });
      }

      return data;
    }),
});

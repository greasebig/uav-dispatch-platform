import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router, adminProcedure } from "./_core/trpc";
import { paymentRouter } from "./routers/paymentRouter";
import { dataRouter } from "./routers/dataRouter";
import { authRouter } from "./routers/authRouter";
import { adminRouter } from "./routers/adminRouter";
import { chatRouter } from "./routers/chatRouter";
import { configRouter } from "./routers/configRouter";
import { contactRouter } from "./routers/contactRouter";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getDb,
  getUserByOpenId,
  getPilotProfile,
  getCustomerProfile,
  getTask,
  getTasksByCustomer,
  getTasksByPilot,
  getTasksByStatus,
  getTaskPushHistory,
  getOrder,
  getOrderByTaskId,
  getTaskRating,
  getPilotRatings,
  getUserNotifications,
  getUserRiskControl,
  getSystemConfig,
} from "./db";
import {
  users,
  customerProfiles,
  pilotProfiles,
  pilotQualifications,
  pilotEquipment,
  tasks,
  taskPushHistory,
  taskExecutionData,
  taskRatings,
  orders,
  pilotSettlements,
  notifications,
  riskControls,
} from "../drizzle/schema";
import {
  getCandidatePilots,
  rankPilots,
  batchPushTask,
  calculatePilotScore,
} from "./services/schedulingService";
import { eq, and, desc } from "drizzle-orm";

// Helper to ensure user has specific role
function requireRole(allowedRoles: string[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!allowedRoles.includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next({ ctx });
  });
}

export const appRouter = router({
  system: systemRouter,
  payment: paymentRouter,
  data: dataRouter,
  // 认证路由 - 手机号登录、OAuth登录
  auth: authRouter,
  // 管理员路由 - 用户管理、资质审核、任务管理、统计分析
  admin: adminRouter,
  // 聊天路由 - 消息、敏感内容过滤
  chat: chatRouter,
  // 配置路由 - 定价、排序配置
  config: configRouter,
  // 联系解锁路由 - 付费获取飞手联系方式
  contact: contactRouter,

  // ========== User Management Routes ==========
  user: router({
    // Get current user profile
    profile: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const userResult = await db
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);
      if (userResult.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const user = userResult[0];
      // Get role-specific profile
      let roleProfile = null;
      if (user.role === "customer") {
        roleProfile = await getCustomerProfile(user.id);
      } else if (user.role === "pilot") {
        roleProfile = await getPilotProfile(user.id);
      }
      return { user, roleProfile };
    }),
    // Update user profile
    updateProfile: protectedProcedure
      .input(
        z.object({
          name: z.string().optional(),
          avatar: z.string().optional(),
          phone: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .update(users)
          .set({
            name: input.name,
            avatar: input.avatar,
            phone: input.phone,
            updatedAt: new Date(),
          })
          .where(eq(users.id, ctx.user.id));
        return { success: true };
      }),
  }),

  // ========== Customer Routes ==========
  customer: router({
    // Get customer profile
    getProfile: requireRole(["customer"]).query(async ({ ctx }) => {
      return await getCustomerProfile(ctx.user.id);
    }),
    // Update customer profile
    updateProfile: requireRole(["customer"])
      .input(
        z.object({
          companyName: z.string().optional(),
          contactPerson: z.string().optional(),
          contactPhone: z.string().optional(),
          address: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const profile = await getCustomerProfile(ctx.user.id);
        if (!profile) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await db
          .update(customerProfiles)
          .set({
            companyName: input.companyName,
            contactPerson: input.contactPerson,
            contactPhone: input.contactPhone,
            address: input.address,
            updatedAt: new Date(),
          })
          .where(eq(customerProfiles.userId, ctx.user.id));
        return { success: true };
      }),
    // Get customer's tasks
    getTasks: requireRole(["customer"]).query(async ({ ctx }) => {
      return await getTasksByCustomer(ctx.user.id);
    }),
    // Get customer's orders
    getOrders: requireRole(["customer"]).query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return await db
        .select()
        .from(orders)
        .where(eq(orders.customerId, ctx.user.id))
        .orderBy(desc(orders.createdAt));
    }),
  }),

  // ========== Pilot Routes ==========
  pilot: router({
    // Get pilot profile
    getProfile: requireRole(["pilot"]).query(async ({ ctx }) => {
      return await getPilotProfile(ctx.user.id);
    }),
    // Update pilot profile
    updateProfile: requireRole(["pilot"])
      .input(
        z.object({
          serviceRadius: z.number().optional(),
          baseLatitude: z.number().optional(),
          baseLongitude: z.number().optional(),
          bankAccount: z.string().optional(),
          bankName: z.string().optional(),
          accountHolder: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const profile = await getPilotProfile(ctx.user.id);
        if (!profile) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await db
          .update(pilotProfiles)
          .set({
            serviceRadius: input.serviceRadius,
            baseLatitude: input.baseLatitude?.toString(),
            baseLongitude: input.baseLongitude?.toString(),
            bankAccount: input.bankAccount,
            bankName: input.bankName,
            accountHolder: input.accountHolder,
            updatedAt: new Date(),
          })
          .where(eq(pilotProfiles.userId, ctx.user.id));
        return { success: true };
      }),
    // Get available tasks for pilot
    getAvailableTasks: requireRole(["pilot"]).query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const pilot = await getPilotProfile(ctx.user.id);
      if (!pilot) return [];
      // Get tasks that are in pushing state
      return await db
        .select()
        .from(tasks)
        .where(eq(tasks.status, "pushing"));
    }),
    // Get pilot's assigned tasks
    getAssignedTasks: requireRole(["pilot"]).query(async ({ ctx }) => {
      return await getTasksByPilot(ctx.user.id);
    }),
    // Accept a task
    acceptTask: requireRole(["pilot"])
      .input(z.object({ taskId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const task = await getTask(input.taskId);
        if (!task) throw new TRPCError({ code: "NOT_FOUND" });
        // Check if task is still available
        if (task.status !== "pushing") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Task is no longer available",
          });
        }
        // Update task assignment
        await db
          .update(tasks)
          .set({
            assignedPilotId: ctx.user.id,
            status: "accepted",
            assignmentTime: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, input.taskId));
        // Update push history
        await db
          .update(taskPushHistory)
          .set({
            status: "accepted",
            responseTime: new Date(),
            responseType: "accept",
          })
          .where(
            and(
              eq(taskPushHistory.taskId, input.taskId),
              eq(taskPushHistory.pilotId, ctx.user.id)
            )
          );
        return { success: true };
      }),
    // Reject a task
    rejectTask: requireRole(["pilot"])
      .input(z.object({ taskId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        // Update push history
        await db
          .update(taskPushHistory)
          .set({
            status: "rejected",
            responseTime: new Date(),
            responseType: "reject",
          })
          .where(
            and(
              eq(taskPushHistory.taskId, input.taskId),
              eq(taskPushHistory.pilotId, ctx.user.id)
            )
          );
        return { success: true };
      }),
    // Get pilot's ratings
    getRatings: requireRole(["pilot"]).query(async ({ ctx }) => {
      return await getPilotRatings(ctx.user.id);
    }),
  }),

  // ========== Task Routes ==========
  task: router({
    // Get task details
    getTask: publicProcedure
      .input(z.object({ taskId: z.number() }))
      .query(async ({ input }) => {
        return await getTask(input.taskId);
      }),
    // Create new task (customer only)
    create: requireRole(["customer"])
      .input(
        z.object({
          taskType: z.enum(["spray", "transport"]),
          title: z.string(),
          description: z.string().optional(),
          location: z.string(),
          latitude: z.number(),
          longitude: z.number(),
          area: z.number().optional(),
          weight: z.number().optional(),
          estimatedDuration: z.number().optional(),
          requiredEquipment: z.string().optional(),
          specialRequirements: z.string().optional(),
          scheduledDate: z.date(),
          scheduledEndDate: z.date().optional(),
          timeWindow: z.string().optional(),
          budgetAmount: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const result = await db.insert(tasks).values({
          customerId: ctx.user.id,
          taskType: input.taskType,
          title: input.title,
          description: input.description,
          location: input.location,
          latitude: input.latitude.toString(),
          longitude: input.longitude.toString(),
          area: input.area?.toString(),
          weight: input.weight?.toString(),
          estimatedDuration: input.estimatedDuration,
          requiredEquipment: input.requiredEquipment,
          specialRequirements: input.specialRequirements,
          scheduledDate: input.scheduledDate,
          scheduledEndDate: input.scheduledEndDate,
          timeWindow: input.timeWindow,
          budgetAmount: input.budgetAmount.toString(),
          status: "draft",
        });
        return { taskId: result[0].insertId };
      }),
    // Get tasks by status (admin)
    getByStatus: requireRole(["admin"])
      .input(z.object({ status: z.string() }))
      .query(async ({ input }) => {
        return await getTasksByStatus(input.status);
      }),
    // Approve task (admin)
    approve: requireRole(["admin"])
      .input(z.object({ taskId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const task = await getTask(input.taskId);
        if (!task) throw new TRPCError({ code: "NOT_FOUND" });
        // Update task status
        await db
          .update(tasks)
          .set({
            status: "approved",
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, input.taskId));
        return { success: true };
      }),
    // Start task dispatch (admin)
    startDispatch: requireRole(["admin"])
      .input(z.object({ taskId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const task = await getTask(input.taskId);
        if (!task) throw new TRPCError({ code: "NOT_FOUND" });
        // Get candidate pilots
        const candidates = await getCandidatePilots(task.taskType);
        if (candidates.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No available pilots for this task",
          });
        }
        // Rank pilots
        const rankedPilots = await rankPilots(
          candidates,
          input.taskId,
          parseFloat(task.latitude.toString()),
          parseFloat(task.longitude.toString()),
          task.taskType,
          task.area ? parseFloat(task.area.toString()) : null,
          task.weight ? parseFloat(task.weight.toString()) : null
        );
        // Batch push
        await batchPushTask(input.taskId, rankedPilots);
        // Update task status
        await db
          .update(tasks)
          .set({
            status: "pushing",
            currentBatchNumber: 1,
            lastPushTime: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, input.taskId));
        return { success: true, pilotCount: rankedPilots.length };
      }),
    // Update task status
    updateStatus: protectedProcedure
      .input(
        z.object({
          taskId: z.number(),
          status: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const task = await getTask(input.taskId);
        if (!task) throw new TRPCError({ code: "NOT_FOUND" });
        // Verify permission
        if (
          ctx.user.role !== "admin" &&
          task.customerId !== ctx.user.id &&
          task.assignedPilotId !== ctx.user.id
        ) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db
          .update(tasks)
          .set({
            status: input.status as any,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, input.taskId));
        return { success: true };
      }),
  }),

  // ========== Notification Routes ==========
  notification: router({
    // Get user notifications
    getNotifications: protectedProcedure
      .input(z.object({ limit: z.number().default(20) }))
      .query(async ({ ctx, input }) => {
        return await getUserNotifications(ctx.user.id, input.limit);
      }),
    // Mark notification as read
    markAsRead: protectedProcedure
      .input(z.object({ notificationId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .update(notifications)
          .set({
            isRead: true,
            readAt: new Date(),
          })
          .where(eq(notifications.id, input.notificationId));
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;

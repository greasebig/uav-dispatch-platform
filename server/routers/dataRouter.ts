import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb, getTask, getTaskExecutionData } from "../db";
import {
  taskExecutionData,
  taskRatings,
  riskControls,
  systemConfig,
} from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { publicProcedure } from "../_core/trpc";

// Helper to ensure user has specific role
function requireRole(allowedRoles: string[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!allowedRoles.includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next({ ctx });
  });
}

export const dataRouter = router({
  // ========== Task Execution Data ==========

  // Upload flight data for a task
  uploadFlightData: requireRole(["pilot"])
    .input(
      z.object({
        taskId: z.number(),
        flightLogUrl: z.string().optional(),
        flightDuration: z.number().optional(),
        actualArea: z.number().optional(),
        actualDistance: z.number().optional(),
        flightPath: z.string().optional(), // GeoJSON
        photoUrls: z.array(z.string()).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Verify task belongs to pilot
      const task = await getTask(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      if (task.assignedPilotId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Check if execution data already exists
      const existingData = await getTaskExecutionData(input.taskId);

      if (existingData) {
        // Update existing
        await db
          .update(taskExecutionData)
          .set({
            flightLogUrl: input.flightLogUrl,
            flightDuration: input.flightDuration,
            actualArea: input.actualArea?.toString(),
            actualDistance: input.actualDistance?.toString(),
            flightPath: input.flightPath,
            photoUrls: input.photoUrls ? JSON.stringify(input.photoUrls) : undefined,
            photoCount: input.photoUrls?.length || 0,
            notes: input.notes,
            updatedAt: new Date(),
          })
          .where(eq(taskExecutionData.taskId, input.taskId));
      } else {
        // Create new
        await db.insert(taskExecutionData).values({
          taskId: input.taskId,
          pilotId: ctx.user.id,
          flightLogUrl: input.flightLogUrl,
          flightDuration: input.flightDuration,
          actualArea: input.actualArea?.toString(),
          actualDistance: input.actualDistance?.toString(),
          flightPath: input.flightPath,
          photoUrls: input.photoUrls ? JSON.stringify(input.photoUrls) : undefined,
          photoCount: input.photoUrls?.length || 0,
          notes: input.notes,
        });
      }

      return { success: true };
    }),

  // Get execution data for a task
  getExecutionData: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ ctx, input }) => {
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

      return await getTaskExecutionData(input.taskId);
    }),

  // ========== Task Ratings ==========

  // Create or update task rating
  rateTask: requireRole(["customer"])
    .input(
      z.object({
        taskId: z.number(),
        rating: z.number().min(1).max(5),
        comment: z.string().optional(),
        qualityScore: z.number().min(1).max(5).optional(),
        timelinessScore: z.number().min(1).max(5).optional(),
        communicationScore: z.number().min(1).max(5).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Verify task belongs to customer
      const task = await getTask(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      if (task.customerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      if (!task.assignedPilotId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Task has no assigned pilot",
        });
      }

      // Check if rating already exists
      const existingRating = await getTaskRating(input.taskId);

      if (existingRating) {
        // Update existing
        await db
          .update(taskRatings)
          .set({
            rating: input.rating,
            comment: input.comment,
            qualityScore: input.qualityScore,
            timelinessScore: input.timelinessScore,
            communicationScore: input.communicationScore,
            updatedAt: new Date(),
          })
          .where(eq(taskRatings.taskId, input.taskId));
      } else {
        // Create new
        await db.insert(taskRatings).values({
          taskId: input.taskId,
          customerId: ctx.user.id,
          pilotId: task.assignedPilotId,
          rating: input.rating,
          comment: input.comment,
          qualityScore: input.qualityScore,
          timelinessScore: input.timelinessScore,
          communicationScore: input.communicationScore,
        });
      }

      return { success: true };
    }),

  // Get task rating
  getRating: publicProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input }) => {
      return await getTaskRating(input.taskId);
    }),

  // ========== Risk Control ==========

  // Create risk control record (admin)
  createRiskControl: requireRole(["admin"])
    .input(
      z.object({
        userId: z.number(),
        riskType: z.enum([
          "fraud",
          "safety_violation",
          "quality_issue",
          "payment_default",
          "complaint",
        ]),
        severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
        description: z.string(),
        evidence: z.any().optional(),
        action: z.enum(["warning", "suspension", "blacklist"]).default("warning"),
        actionDuration: z.number().optional(), // days
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const result = await db.insert(riskControls).values({
        userId: input.userId,
        riskType: input.riskType,
        severity: input.severity,
        description: input.description,
        evidence: input.evidence ? JSON.stringify(input.evidence) : undefined,
        action: input.action,
        actionDuration: input.actionDuration,
        status: "active",
      });

      return { riskControlId: result[0].insertId };
    }),

  // Get user risk controls (admin)
  getUserRiskControls: requireRole(["admin"])
    .input(z.object({ userId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      return await db
        .select()
        .from(riskControls)
        .where(eq(riskControls.userId, input.userId))
        .orderBy(desc(riskControls.createdAt));
    }),

  // Resolve risk control (admin)
  resolveRiskControl: requireRole(["admin"])
    .input(
      z.object({
        riskControlId: z.number(),
        resolution: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(riskControls)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
          resolvedBy: ctx.user.id,
          updatedAt: new Date(),
        })
        .where(eq(riskControls.id, input.riskControlId));

      return { success: true };
    }),

  // ========== System Configuration ==========

  // Get system config value
  getConfig: publicProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const result = await db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.key, input.key))
        .limit(1);

      return result.length > 0 ? result[0] : null;
    }),

  // Get all system configs (admin)
  getAllConfigs: requireRole(["admin"]).query(async () => {
    const db = await getDb();
    if (!db) return [];

    return await db.select().from(systemConfig);
  }),

  // Update system config (admin)
  updateConfig: requireRole(["admin"])
    .input(
      z.object({
        key: z.string(),
        value: z.string(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Check if config exists
      const existing = await db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.key, input.key))
        .limit(1);

      if (existing.length > 0) {
        // Update
        await db
          .update(systemConfig)
          .set({
            value: input.value,
            description: input.description,
            updatedAt: new Date(),
          })
          .where(eq(systemConfig.key, input.key));
      } else {
        // Create
        await db.insert(systemConfig).values({
          key: input.key,
          value: input.value,
          description: input.description,
        });
      }

      return { success: true };
    }),
});

// Helper function
async function getTaskRating(taskId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(taskRatings)
    .where(eq(taskRatings.taskId, taskId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

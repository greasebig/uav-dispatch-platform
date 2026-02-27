import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb, getOrder, getTask } from "../db";
import { orders, pilotSettlements } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import {
  createTaskPaymentSession,
  createPilotDepositSession,
} from "../services/paymentService";

// Helper to ensure user has specific role
function requireRole(allowedRoles: string[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!allowedRoles.includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next({ ctx });
  });
}

export const paymentRouter = router({
  // Create checkout session for task payment
  createTaskCheckout: requireRole(["customer"])
    .input(
      z.object({
        taskId: z.number(),
        taskTitle: z.string(),
        taskAmount: z.number(),
        platformFeePercentage: z.number().default(10),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Verify task exists and belongs to customer
      const task = await getTask(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      if (task.customerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Check if order already exists
      const existingOrder = await getOrderByTaskId(input.taskId);
      if (existingOrder && existingOrder.status === "paid") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Task already paid",
        });
      }

      const origin = ctx.req.headers.origin || "https://example.com";
      const successUrl = `${origin}/payment/success?taskId=${input.taskId}`;
      const cancelUrl = `${origin}/payment/cancel?taskId=${input.taskId}`;

      const checkoutUrl = await createTaskPaymentSession(
        ctx.user.id,
        ctx.user.email || "",
        ctx.user.name || "Customer",
        input.taskId,
        input.taskTitle,
        input.taskAmount,
        input.platformFeePercentage,
        successUrl,
        cancelUrl
      );

      return { checkoutUrl };
    }),

  // Create checkout session for pilot deposit
  createDepositCheckout: requireRole(["pilot"])
    .input(z.object({ depositAmount: z.number().min(50).max(10000) }))
    .mutation(async ({ ctx, input }) => {
      const origin = ctx.req.headers.origin || "https://example.com";
      const successUrl = `${origin}/pilot/deposit/success`;
      const cancelUrl = `${origin}/pilot/deposit/cancel`;

      const checkoutUrl = await createPilotDepositSession(
        ctx.user.id,
        ctx.user.email || "",
        ctx.user.name || "Pilot",
        input.depositAmount,
        successUrl,
        cancelUrl
      );

      return { checkoutUrl };
    }),

  // Get order details
  getOrder: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ ctx, input }) => {
      const order = await getOrder(input.orderId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      // Verify permission
      if (order.customerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return order;
    }),

  // Get customer's orders
  getCustomerOrders: requireRole(["customer"]).query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    return await db
      .select()
      .from(orders)
      .where(eq(orders.customerId, ctx.user.id))
      .orderBy(desc(orders.createdAt));
  }),

  // Get all orders (admin)
  getAllOrders: requireRole(["admin"])
    .input(
      z.object({
        status: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      if (input.status) {
        return await db
          .select()
          .from(orders)
          .where(eq(orders.status, input.status as any))
          .orderBy(desc(orders.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      }

      return await db
        .select()
        .from(orders)
        .orderBy(desc(orders.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // Get settlement details
  getSettlement: requireRole(["pilot"])
    .input(z.object({ settlementId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "NOT_FOUND" });

      const result = await db
        .select()
        .from(pilotSettlements)
        .where(eq(pilotSettlements.id, input.settlementId))
        .limit(1);

      if (result.length === 0) throw new TRPCError({ code: "NOT_FOUND" });

      const settlement = result[0];

      // Verify permission
      if (settlement.pilotId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return settlement;
    }),

  // Get pilot's settlements
  getPilotSettlements: requireRole(["pilot"]).query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    return await db
      .select()
      .from(pilotSettlements)
      .where(eq(pilotSettlements.pilotId, ctx.user.id))
      .orderBy(desc(pilotSettlements.createdAt));
  }),

  // Get all settlements (admin)
  getAllSettlements: requireRole(["admin"])
    .input(
      z.object({
        status: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      if (input.status) {
        return await db
          .select()
          .from(pilotSettlements)
          .where(eq(pilotSettlements.status, input.status as any))
          .orderBy(desc(pilotSettlements.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      }

      return await db
        .select()
        .from(pilotSettlements)
        .orderBy(desc(pilotSettlements.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // Create settlement (admin)
  createSettlement: requireRole(["admin"])
    .input(
      z.object({
        pilotId: z.number(),
        settlementPeriodStart: z.date(),
        settlementPeriodEnd: z.date(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const settlementNumber = `SETTLE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const result = await db.insert(pilotSettlements).values({
        pilotId: input.pilotId,
        settlementNumber,
        settlementPeriodStart: input.settlementPeriodStart,
        settlementPeriodEnd: input.settlementPeriodEnd,
        totalEarnings: "0",
        platformCommission: "0",
        depositDeduction: "0",
        netAmount: "0",
        status: "pending",
      });

      return { settlementId: result[0].insertId };
    }),

  // Update settlement status (admin)
  updateSettlementStatus: requireRole(["admin"])
    .input(
      z.object({
        settlementId: z.number(),
        status: z.enum(["pending", "processing", "completed", "failed"]),
        failureReason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(pilotSettlements)
        .set({
          status: input.status,
          failureReason: input.failureReason,
          processedAt: input.status === "completed" ? new Date() : undefined,
          updatedAt: new Date(),
        })
        .where(eq(pilotSettlements.id, input.settlementId));

      return { success: true };
    }),
});

// Helper function
async function getOrderByTaskId(taskId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(orders)
    .where(eq(orders.taskId, taskId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

import Stripe from "stripe";
import { getDb } from "../db";
import { orders, pilotSettlements } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

/**
 * Create a checkout session for task payment
 */
export async function createTaskPaymentSession(
  userId: number,
  userEmail: string,
  userName: string,
  taskId: number,
  taskTitle: string,
  taskAmount: number,
  platformFeePercentage: number,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const platformFee = (taskAmount * platformFeePercentage) / 100;
  const totalAmount = taskAmount + platformFee;

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer_email: userEmail,
    client_reference_id: userId.toString(),
    metadata: {
      user_id: userId.toString(),
      customer_email: userEmail,
      customer_name: userName,
      task_id: taskId.toString(),
      payment_type: "task",
    },
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Task Payment: ${taskTitle}`,
            description: `Payment for UAV task execution`,
          },
          unit_amount: Math.round(totalAmount * 100), // Convert to cents
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
  });

  if (!session.url) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create checkout session",
    });
  }

  return session.url;
}

/**
 * Create a checkout session for pilot deposit
 */
export async function createPilotDepositSession(
  pilotId: number,
  userEmail: string,
  userName: string,
  depositAmount: number,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer_email: userEmail,
    client_reference_id: pilotId.toString(),
    metadata: {
      user_id: pilotId.toString(),
      customer_email: userEmail,
      customer_name: userName,
      pilot_id: pilotId.toString(),
      payment_type: "deposit",
    },
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "Pilot Security Deposit",
            description: "Security deposit for platform operations",
          },
          unit_amount: Math.round(depositAmount * 100), // Convert to cents
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
  });

  if (!session.url) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create checkout session",
    });
  }

  return session.url;
}

/**
 * Handle successful payment - create order record
 */
export async function handlePaymentSuccess(
  paymentIntentId: string,
  metadata: Record<string, string>,
  amount: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const customerId = parseInt(metadata.user_id);
  const taskId = metadata.task_id ? parseInt(metadata.task_id) : null;
  const paymentType = metadata.payment_type;

  if (paymentType === "task" && taskId) {
    // Create order record
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await db.insert(orders).values({
      taskId,
      customerId,
      orderNumber,
      taskAmount: (amount / 100).toString(), // Convert from cents
      platformFee: "0", // Already included in amount
      totalAmount: (amount / 100).toString(),
      status: "paid",
      paymentMethod: "stripe",
      stripePaymentIntentId: paymentIntentId,
      paidAt: new Date(),
    });
  } else if (paymentType === "deposit") {
    // Update pilot deposit
    const pilotId = parseInt(metadata.pilot_id || metadata.user_id);
    // This would be handled by updating pilotProfiles table
    // Implementation depends on your deposit management strategy
  }
}

/**
 * Handle refund
 */
export async function handleRefund(
  paymentIntentId: string,
  refundAmount: number,
  reason: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Find order by payment intent ID
  const orderResult = await db
    .select()
    .from(orders)
    .where(eq(orders.stripePaymentIntentId, paymentIntentId))
    .limit(1);

  if (orderResult.length === 0) return;

  const order = orderResult[0];

  // Update order with refund info
  await db
    .update(orders)
    .set({
      status: "refunded",
      refundAmount: refundAmount.toString(),
      refundReason: reason,
      refundedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id));
}

/**
 * Create payout for pilot settlement
 */
export async function createPilotPayout(
  settlementId: number,
  pilotStripeCustomerId: string,
  amount: number
): Promise<string> {
  try {
    // Create a payout to the pilot's connected account
    const payout = await stripe.payouts.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: "usd",
      destination: pilotStripeCustomerId,
      description: `Settlement payout for pilot`,
    });

    return payout.id;
  } catch (error) {
    console.error("Payout creation failed:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create payout",
    });
  }
}

/**
 * Retrieve payment intent details
 */
export async function getPaymentIntentDetails(paymentIntentId: string) {
  try {
    return await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    console.error("Failed to retrieve payment intent:", error);
    return null;
  }
}

/**
 * Retrieve checkout session details
 */
export async function getCheckoutSessionDetails(sessionId: string) {
  try {
    return await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    console.error("Failed to retrieve checkout session:", error);
    return null;
  }
}

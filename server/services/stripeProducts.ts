/**
 * Stripe product and price configuration for UAV dispatch platform
 * Note: These are product definitions. Actual Stripe product/price IDs 
 * should be configured in environment variables or Settings → Payment
 */

export const stripeProducts = {
  // Task payment product - dynamic pricing based on task budget
  taskPayment: {
    name: "UAV Task Payment",
    description: "Payment for UAV service task execution",
    type: "service",
  },

  // Pilot deposit product - security deposit for pilots
  pilotDeposit: {
    name: "Pilot Security Deposit",
    description: "Security deposit for pilot account activation",
    type: "service",
  },

  // Platform subscription (optional future feature)
  premiumSubscription: {
    name: "Premium Platform Subscription",
    description: "Monthly subscription for premium features",
    type: "service",
    recurring: {
      interval: "month",
      intervalCount: 1,
    },
  },
};

/**
 * Create a checkout session for task payment
 * This is a one-time payment for a specific task
 */
export interface TaskPaymentSession {
  taskId: number;
  customerId: number;
  taskAmount: number;
  platformFee: number;
  totalAmount: number;
  taskTitle: string;
  taskDescription?: string;
}

/**
 * Create a checkout session for pilot deposit
 */
export interface PilotDepositSession {
  pilotId: number;
  depositAmount: number;
  reason: string;
}

/**
 * Payment metadata to include in Stripe checkout
 */
export interface PaymentMetadata {
  user_id: string;
  customer_email: string;
  customer_name: string;
  task_id?: string;
  pilot_id?: string;
  payment_type: "task" | "deposit" | "subscription";
}

import { eq, and, or, gte, lte, desc, asc, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  pilotProfiles,
  customerProfiles,
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
  systemConfig,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ========== Pilot Profile Queries ==========
export async function getPilotProfile(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(pilotProfiles)
    .where(eq(pilotProfiles.userId, userId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getPilotsByLevel(level: string) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(pilotProfiles)
    .where(eq(pilotProfiles.level, level as any));
}

export async function getPilotsByStatus(status: string) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(pilotProfiles)
    .where(eq(pilotProfiles.status, status as any));
}

// ========== Customer Profile Queries ==========
export async function getCustomerProfile(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(customerProfiles)
    .where(eq(customerProfiles.userId, userId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ========== Task Queries ==========
export async function getTask(taskId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getTasksByCustomer(customerId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(tasks)
    .where(eq(tasks.customerId, customerId))
    .orderBy(desc(tasks.createdAt));
}

export async function getTasksByPilot(pilotId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(tasks)
    .where(eq(tasks.assignedPilotId, pilotId))
    .orderBy(desc(tasks.createdAt));
}

export async function getTasksByStatus(status: string) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(tasks)
    .where(eq(tasks.status, status as any))
    .orderBy(desc(tasks.createdAt));
}

// ========== Task Push History Queries ==========
export async function getTaskPushHistory(taskId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(taskPushHistory)
    .where(eq(taskPushHistory.taskId, taskId))
    .orderBy(asc(taskPushHistory.batchNumber));
}

export async function getPilotTaskPushes(pilotId: number, taskId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(taskPushHistory)
    .where(and(eq(taskPushHistory.pilotId, pilotId), eq(taskPushHistory.taskId, taskId)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ========== Order Queries ==========
export async function getOrder(orderId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getOrderByTaskId(taskId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(orders)
    .where(eq(orders.taskId, taskId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getOrdersByCustomer(customerId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(orders.createdAt));
}

// ========== Task Execution Data Queries ==========
export async function getTaskExecutionData(taskId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(taskExecutionData)
    .where(eq(taskExecutionData.taskId, taskId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ========== Task Rating Queries ==========
export async function getTaskRating(taskId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(taskRatings)
    .where(eq(taskRatings.taskId, taskId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getPilotRatings(pilotId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(taskRatings)
    .where(eq(taskRatings.pilotId, pilotId))
    .orderBy(desc(taskRatings.createdAt));
}

// ========== Notification Queries ==========
export async function getUserNotifications(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

// ========== Risk Control Queries ==========
export async function getUserRiskControl(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(riskControls)
    .where(and(eq(riskControls.userId, userId), eq(riskControls.status, "active" as any)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ========== System Config Queries ==========
export async function getSystemConfig(key: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, key))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
  datetime,
  longtext,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Supports three roles: customer, pilot, admin
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["customer", "pilot", "admin"]).default("customer").notNull(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Customer profile - extends users table for customer-specific data
 */
export const customerProfiles = mysqlTable("customerProfiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  companyName: text("companyName"),
  companyLicense: text("companyLicense"),
  businessScope: text("businessScope"),
  contactPerson: varchar("contactPerson", { length: 100 }),
  contactPhone: varchar("contactPhone", { length: 20 }),
  address: text("address"),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  isVerified: boolean("isVerified").default(false),
  verifiedAt: timestamp("verifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CustomerProfile = typeof customerProfiles.$inferSelect;
export type InsertCustomerProfile = typeof customerProfiles.$inferInsert;

/**
 * Pilot profile - extends users table for pilot-specific data
 */
export const pilotProfiles = mysqlTable("pilotProfiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  realName: varchar("realName", { length: 100 }).notNull(),
  idNumber: varchar("idNumber", { length: 50 }).notNull().unique(),
  idPhotoFront: text("idPhotoFront"),
  idPhotoBack: text("idPhotoBack"),
  isRealNameVerified: boolean("isRealNameVerified").default(false),
  realNameVerifiedAt: timestamp("realNameVerifiedAt"),
  // Service area
  serviceRadius: int("serviceRadius").default(50), // km
  baseLatitude: decimal("baseLatitude", { precision: 10, scale: 8 }),
  baseLongitude: decimal("baseLongitude", { precision: 11, scale: 8 }),
  // Level system
  level: mysqlEnum("level", ["junior", "intermediate", "senior", "vip"]).default("junior"),
  totalScore: decimal("totalScore", { precision: 5, scale: 2 }).default("0.00"),
  // Performance metrics
  totalTasks: int("totalTasks").default(0),
  completedTasks: int("completedTasks").default(0),
  fulfillmentRate: decimal("fulfillmentRate", { precision: 5, scale: 2 }).default("0.00"),
  averageRating: decimal("averageRating", { precision: 3, scale: 2 }).default("0.00"),
  totalComplaints: int("totalComplaints").default(0),
  // Current status
  status: mysqlEnum("status", ["available", "busy", "offline", "blocked"]).default("offline"),
  currentLoad: int("currentLoad").default(0), // Number of tasks in progress
  maxConcurrentTasks: int("maxConcurrentTasks").default(3),
  // Account info
  bankAccount: varchar("bankAccount", { length: 50 }),
  bankName: varchar("bankName", { length: 100 }),
  accountHolder: varchar("accountHolder", { length: 100 }),
  // Deposit
  depositAmount: decimal("depositAmount", { precision: 10, scale: 2 }).default("0.00"),
  depositFrozen: decimal("depositFrozen", { precision: 10, scale: 2 }).default("0.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PilotProfile = typeof pilotProfiles.$inferSelect;
export type InsertPilotProfile = typeof pilotProfiles.$inferInsert;

/**
 * Pilot qualifications/certifications
 */
export const pilotQualifications = mysqlTable("pilotQualifications", {
  id: int("id").autoincrement().primaryKey(),
  pilotId: int("pilotId").notNull(),
  type: mysqlEnum("type", ["drone_license", "operation_cert", "safety_cert", "insurance"]).notNull(),
  certificateNumber: varchar("certificateNumber", { length: 100 }).notNull(),
  issueDate: datetime("issueDate"),
  expiryDate: datetime("expiryDate"),
  documentUrl: text("documentUrl"),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "expired"]).default("pending"),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  rejectionReason: text("rejectionReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PilotQualification = typeof pilotQualifications.$inferSelect;
export type InsertPilotQualification = typeof pilotQualifications.$inferInsert;

/**
 * Pilot equipment/drone information
 */
export const pilotEquipment = mysqlTable("pilotEquipment", {
  id: int("id").autoincrement().primaryKey(),
  pilotId: int("pilotId").notNull(),
  droneModel: varchar("droneModel", { length: 100 }).notNull(),
  droneSerialNumber: varchar("droneSerialNumber", { length: 100 }).notNull().unique(),
  dronePhoto: text("dronePhoto"),
  maxPayload: decimal("maxPayload", { precision: 8, scale: 2 }), // kg
  maxFlightTime: int("maxFlightTime"), // minutes
  maxDistance: int("maxDistance"), // km
  supportedServices: varchar("supportedServices", { length: 255 }), // JSON: ["spray", "transport"]
  registrationNumber: varchar("registrationNumber", { length: 50 }),
  insuranceExpiry: datetime("insuranceExpiry"),
  status: mysqlEnum("status", ["active", "maintenance", "inactive"]).default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PilotEquipment = typeof pilotEquipment.$inferSelect;
export type InsertPilotEquipment = typeof pilotEquipment.$inferInsert;

/**
 * Job/Task listings
 */
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  taskType: mysqlEnum("taskType", ["spray", "transport"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: longtext("description"),
  location: varchar("location", { length: 255 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  // Task specifications
  area: decimal("area", { precision: 10, scale: 2 }), // hectares or m²
  weight: decimal("weight", { precision: 10, scale: 2 }), // kg for transport
  estimatedDuration: int("estimatedDuration"), // minutes
  requiredEquipment: varchar("requiredEquipment", { length: 255 }),
  specialRequirements: text("specialRequirements"),
  // Schedule
  scheduledDate: datetime("scheduledDate").notNull(),
  scheduledEndDate: datetime("scheduledEndDate"),
  timeWindow: varchar("timeWindow", { length: 100 }), // e.g., "09:00-17:00"
  // Budget
  budgetAmount: decimal("budgetAmount", { precision: 10, scale: 2 }).notNull(),
  platformFeeRate: decimal("platformFeeRate", { precision: 5, scale: 2 }).default("10.00"), // percentage
  // Status
  status: mysqlEnum("status", [
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
    .default("draft")
    .notNull(),
  // Assignment
  assignedPilotId: int("assignedPilotId"),
  assignmentTime: timestamp("assignmentTime"),
  // Batch push info
  currentBatchNumber: int("currentBatchNumber").default(0),
  lastPushTime: timestamp("lastPushTime"),
  // Completion
  completedAt: timestamp("completedAt"),
  cancelledAt: timestamp("cancelledAt"),
  cancellationReason: text("cancellationReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

/**
 * Task push history - tracks which pilots were offered which tasks
 */
export const taskPushHistory = mysqlTable("taskPushHistory", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  pilotId: int("pilotId").notNull(),
  batchNumber: int("batchNumber").notNull(),
  pushTime: timestamp("pushTime").defaultNow().notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "rejected", "expired"]).default("pending"),
  responseTime: timestamp("responseTime"),
  responseType: mysqlEnum("responseType", ["accept", "reject"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TaskPushHistory = typeof taskPushHistory.$inferSelect;
export type InsertTaskPushHistory = typeof taskPushHistory.$inferInsert;

/**
 * Task execution data - flight logs, photos, etc.
 */
export const taskExecutionData = mysqlTable("taskExecutionData", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  pilotId: int("pilotId").notNull(),
  // Flight data
  flightLogUrl: text("flightLogUrl"),
  flightDuration: int("flightDuration"), // seconds
  actualArea: decimal("actualArea", { precision: 10, scale: 2 }), // calculated from flight path
  actualDistance: decimal("actualDistance", { precision: 10, scale: 2 }), // km
  flightPath: longtext("flightPath"), // GeoJSON format
  // Photos
  photoUrls: longtext("photoUrls"), // JSON array
  photoCount: int("photoCount").default(0),
  // Status updates
  arrivalTime: timestamp("arrivalTime"),
  departureTime: timestamp("departureTime"),
  completionTime: timestamp("completionTime"),
  // Notes
  notes: longtext("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TaskExecutionData = typeof taskExecutionData.$inferSelect;
export type InsertTaskExecutionData = typeof taskExecutionData.$inferInsert;

/**
 * Task ratings and reviews
 */
export const taskRatings = mysqlTable("taskRatings", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  customerId: int("customerId").notNull(),
  pilotId: int("pilotId").notNull(),
  rating: int("rating").notNull(), // 1-5
  comment: longtext("comment"),
  qualityScore: int("qualityScore"), // 1-5
  timelinessScore: int("timelinessScore"), // 1-5
  communicationScore: int("communicationScore"), // 1-5
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TaskRating = typeof taskRatings.$inferSelect;
export type InsertTaskRating = typeof taskRatings.$inferInsert;

/**
 * Orders and payments
 */
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull().unique(),
  customerId: int("customerId").notNull(),
  pilotId: int("pilotId"),
  orderNumber: varchar("orderNumber", { length: 50 }).notNull().unique(),
  // Amount breakdown
  taskAmount: decimal("taskAmount", { precision: 10, scale: 2 }).notNull(),
  platformFee: decimal("platformFee", { precision: 10, scale: 2 }).default("0.00"),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).notNull(),
  // Payment info
  status: mysqlEnum("status", ["pending", "paid", "refunded", "disputed"]).default("pending"),
  paymentMethod: mysqlEnum("paymentMethod", ["stripe", "bank_transfer"]),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 100 }),
  paidAt: timestamp("paidAt"),
  // Refund
  refundAmount: decimal("refundAmount", { precision: 10, scale: 2 }).default("0.00"),
  refundReason: text("refundReason"),
  refundedAt: timestamp("refundedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

/**
 * Pilot settlements/payouts
 */
export const pilotSettlements = mysqlTable("pilotSettlements", {
  id: int("id").autoincrement().primaryKey(),
  pilotId: int("pilotId").notNull(),
  settlementNumber: varchar("settlementNumber", { length: 50 }).notNull().unique(),
  // Period
  settlementPeriodStart: datetime("settlementPeriodStart").notNull(),
  settlementPeriodEnd: datetime("settlementPeriodEnd").notNull(),
  // Amount breakdown
  totalEarnings: decimal("totalEarnings", { precision: 10, scale: 2 }).default("0.00"),
  platformCommission: decimal("platformCommission", { precision: 10, scale: 2 }).default("0.00"),
  depositDeduction: decimal("depositDeduction", { precision: 10, scale: 2 }).default("0.00"),
  netAmount: decimal("netAmount", { precision: 10, scale: 2 }).default("0.00"),
  // Status
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending"),
  stripePayoutId: varchar("stripePayoutId", { length: 100 }),
  processedAt: timestamp("processedAt"),
  failureReason: text("failureReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PilotSettlement = typeof pilotSettlements.$inferSelect;
export type InsertPilotSettlement = typeof pilotSettlements.$inferInsert;

/**
 * Notifications
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", [
    "task_assigned",
    "task_accepted",
    "task_completed",
    "task_cancelled",
    "payment_received",
    "settlement_processed",
    "qualification_approved",
    "qualification_rejected",
    "rating_received",
    "system_alert",
  ]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: longtext("content"),
  relatedTaskId: int("relatedTaskId"),
  relatedOrderId: int("relatedOrderId"),
  isRead: boolean("isRead").default(false),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Risk control and blacklist
 */
export const riskControls = mysqlTable("riskControls", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  riskType: mysqlEnum("riskType", [
    "fraud",
    "safety_violation",
    "quality_issue",
    "payment_default",
    "complaint",
  ]).notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium"),
  description: longtext("description"),
  evidence: longtext("evidence"), // JSON
  status: mysqlEnum("status", ["active", "resolved", "appealed"]).default("active"),
  action: mysqlEnum("action", ["warning", "suspension", "blacklist"]).default("warning"),
  actionDuration: int("actionDuration"), // days, null for permanent
  appealedAt: timestamp("appealedAt"),
  appealReason: text("appealReason"),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: int("resolvedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RiskControl = typeof riskControls.$inferSelect;
export type InsertRiskControl = typeof riskControls.$inferInsert;

/**
 * System configuration
 */
export const systemConfig = mysqlTable("systemConfig", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: longtext("value"),
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemConfig = typeof systemConfig.$inferSelect;
export type InsertSystemConfig = typeof systemConfig.$inferInsert;

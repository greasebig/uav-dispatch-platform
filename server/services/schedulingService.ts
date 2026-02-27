import { eq, and, lte } from "drizzle-orm";
import { getDb } from "../db";
import { pilotProfiles, pilotEquipment, taskPushHistory } from "../../drizzle/schema";

/**
 * Pilot scoring model for intelligent task dispatch
 */
export interface PilotScore {
  pilotId: number;
  totalScore: number;
  distanceScore: number;
  abilityScore: number;
  fulfillmentScore: number;
  loadScore: number;
}

/**
 * Calculate distance score (0-100)
 * Closer pilots get higher scores
 */
function calculateDistanceScore(
  taskLat: number,
  taskLng: number,
  pilotLat: number | null,
  pilotLng: number | null,
  serviceRadius: number
): number {
  if (!pilotLat || !pilotLng) return 0;

  // Haversine formula for distance calculation
  const R = 6371; // Earth radius in km
  const dLat = ((taskLat - pilotLat) * Math.PI) / 180;
  const dLng = ((taskLng - pilotLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((pilotLat * Math.PI) / 180) *
      Math.cos((taskLat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  // If outside service radius, score is 0
  if (distance > serviceRadius) return 0;

  // Score decreases with distance
  return Math.max(0, 100 * (1 - distance / serviceRadius));
}

/**
 * Calculate ability score (0-100)
 * Based on equipment capability and task requirements
 */
export async function calculateAbilityScore(
  taskType: string,
  taskArea: number | null,
  taskWeight: number | null,
  pilotId: number
): Promise<number> {
  const db = await getDb();
  if (!db) return 50;

  // Get pilot equipment
  const equipmentResult = await db
    .select()
    .from(pilotEquipment)
    .where(eq(pilotEquipment.pilotId, pilotId))
    .limit(1);

  if (equipmentResult.length === 0) return 50;
  const equipment = equipmentResult[0];

  let score = 50; // Base score

  // Check if pilot supports the task type
  if (equipment.supportedServices) {
    try {
      const services = JSON.parse(equipment.supportedServices);
      if (Array.isArray(services) && services.includes(taskType)) {
        score += 20;
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  // Check payload capability for transport tasks
  if (taskType === "transport" && taskWeight && equipment.maxPayload) {
    if (taskWeight <= parseFloat(equipment.maxPayload.toString())) {
      score += 15;
    }
  }

  // Check distance capability for spray tasks
  if (taskType === "spray" && taskArea && equipment.maxDistance) {
    if (taskArea <= equipment.maxDistance * 100) {
      score += 15;
    }
  }

  return Math.min(100, score);
}

/**
 * Calculate fulfillment score (0-100)
 * Based on historical completion rate and ratings
 */
function calculateFulfillmentScore(
  fulfillmentRate: number | null,
  averageRating: number | null,
  totalComplaints: number
): number {
  let score = 50;

  // Fulfillment rate (0-40 points)
  if (fulfillmentRate) {
    score += (fulfillmentRate / 100) * 40;
  }

  // Average rating (0-30 points)
  if (averageRating) {
    score += (averageRating / 5) * 30;
  }

  // Complaint penalty (-10 per complaint, min 0)
  score = Math.max(0, score - totalComplaints * 10);

  return Math.min(100, score);
}

/**
 * Calculate load score (0-100)
 * Pilots with lower current load get higher scores
 */
function calculateLoadScore(
  currentLoad: number,
  maxConcurrentTasks: number
): number {
  if (maxConcurrentTasks === 0) return 0;
  const loadRatio = currentLoad / maxConcurrentTasks;
  return Math.max(0, 100 * (1 - loadRatio));
}

/**
 * Calculate comprehensive pilot score for a specific task
 */
export async function calculatePilotScore(
  pilotId: number,
  taskId: number,
  taskLat: number,
  taskLng: number,
  taskType: string,
  taskArea: number | null,
  taskWeight: number | null
): Promise<PilotScore | null> {
  const db = await getDb();
  if (!db) return null;

  // Get pilot profile
  const pilotResult = await db
    .select()
    .from(pilotProfiles)
    .where(eq(pilotProfiles.id, pilotId))
    .limit(1);

  if (pilotResult.length === 0) return null;
  const pilot = pilotResult[0];

  // Calculate individual scores
  const distanceScore = calculateDistanceScore(
    taskLat,
    taskLng,
    pilot.baseLatitude ? parseFloat(pilot.baseLatitude.toString()) : null,
    pilot.baseLongitude ? parseFloat(pilot.baseLongitude.toString()) : null,
    pilot.serviceRadius || 50
  );

  const abilityScore = await calculateAbilityScore(
    taskType,
    taskArea,
    taskWeight,
    pilotId
  );

  const fulfillmentScore = calculateFulfillmentScore(
    pilot.fulfillmentRate ? parseFloat(pilot.fulfillmentRate.toString()) : null,
    pilot.averageRating ? parseFloat(pilot.averageRating.toString()) : null,
    pilot.totalComplaints || 0
  );

  const loadScore = calculateLoadScore(
    pilot.currentLoad || 0,
    pilot.maxConcurrentTasks || 3
  );

  // Weighted calculation
  const weights = {
    distance: 0.3,
    ability: 0.25,
    fulfillment: 0.3,
    load: 0.15,
  };

  const totalScore =
    distanceScore * weights.distance +
    abilityScore * weights.ability +
    fulfillmentScore * weights.fulfillment +
    loadScore * weights.load;

  return {
    pilotId,
    totalScore,
    distanceScore,
    abilityScore,
    fulfillmentScore,
    loadScore,
  };
}

/**
 * Get candidate pilots for a task based on criteria
 */
export async function getCandidatePilots(
  taskType: string,
  maxServiceRadius: number = 100
): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];

  // Filter pilots by:
  // 1. Available status
  // 2. Service radius coverage
  const candidates = await db
    .select()
    .from(pilotProfiles)
    .where(
      and(
        eq(pilotProfiles.status, "available"),
        lte(pilotProfiles.serviceRadius, maxServiceRadius)
      )
    );

  // Further filter by task type support and equipment
  const supportingPilots: number[] = [];

  for (const pilot of candidates) {
    const equipmentResult = await db
      .select()
      .from(pilotEquipment)
      .where(eq(pilotEquipment.pilotId, pilot.id))
      .limit(1);

    if (equipmentResult.length === 0) continue;
    const equipment = equipmentResult[0];

    if (!equipment.supportedServices) continue;
    try {
      const services = JSON.parse(equipment.supportedServices);
      if (Array.isArray(services) && services.includes(taskType)) {
        supportingPilots.push(pilot.id);
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return supportingPilots;
}

/**
 * Rank candidate pilots by score
 */
export async function rankPilots(
  candidatePilotIds: number[],
  taskId: number,
  taskLat: number,
  taskLng: number,
  taskType: string,
  taskArea: number | null,
  taskWeight: number | null
): Promise<PilotScore[]> {
  const scores: PilotScore[] = [];

  for (const pilotId of candidatePilotIds) {
    const score = await calculatePilotScore(
      pilotId,
      taskId,
      taskLat,
      taskLng,
      taskType,
      taskArea,
      taskWeight
    );
    if (score) {
      scores.push(score);
    }
  }

  // Sort by total score descending
  return scores.sort((a, b) => b.totalScore - a.totalScore);
}

/**
 * Batch push task to pilots
 * Divides ranked pilots into batches and pushes sequentially
 */
export async function batchPushTask(
  taskId: number,
  rankedPilots: PilotScore[],
  batchSize: number = 5,
  batchIntervalSeconds: number = 300
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Create batch push records
  for (let i = 0; i < rankedPilots.length; i++) {
    const batchNumber = Math.floor(i / batchSize) + 1;
    const pushTime = new Date(
      Date.now() + (batchNumber - 1) * batchIntervalSeconds * 1000
    );

    await db.insert(taskPushHistory).values({
      taskId,
      pilotId: rankedPilots[i].pilotId,
      batchNumber,
      pushTime,
      status: "pending",
    });
  }
}

/**
 * Check if task has been accepted
 */
export async function isTaskAccepted(taskId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .select()
    .from(taskPushHistory)
    .where(
      and(
        eq(taskPushHistory.taskId, taskId),
        eq(taskPushHistory.status, "accepted")
      )
    )
    .limit(1);

  return result.length > 0;
}

/**
 * Get next batch of pilots to push
 */
export async function getNextBatchPilots(
  taskId: number,
  currentBatchNumber: number
): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select()
    .from(taskPushHistory)
    .where(
      and(
        eq(taskPushHistory.taskId, taskId),
        eq(taskPushHistory.batchNumber, currentBatchNumber)
      )
    );

  return result.map((r) => r.pilotId);
}

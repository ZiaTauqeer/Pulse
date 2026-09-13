import { prisma } from "@/lib/prisma";

export async function logAction(params: {
  organizationId: string;
  userId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        metadata: params.metadata,
      },
    });
  } catch (err) {
    // Audit logging must never break the request it's logging.
    console.error("Failed to write audit log", err);
  }
}

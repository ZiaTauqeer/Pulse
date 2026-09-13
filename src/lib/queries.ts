import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type CustomerListParams = {
  organizationId: string;
  search?: string;
  riskLevel?: string;
  segmentId?: string;
  sortBy?: "risk" | "name" | "lastActive" | "revenue";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export async function listCustomers(params: CustomerListParams) {
  const { organizationId, search, riskLevel, sortBy = "risk", sortDir = "desc", page = 1, pageSize = 25 } = params;

  const where: Prisma.CustomerWhereInput = {
    organizationId,
    ...(search
      ? { name: { contains: search, mode: "insensitive" as Prisma.QueryMode } }
      : {}),
    ...(riskLevel ? { prediction: { riskLevel: riskLevel as never } } : {}),
  };

  const orderBy: Prisma.CustomerOrderByWithRelationInput =
    sortBy === "risk"
      ? { prediction: { churnProbability: sortDir } }
      : sortBy === "revenue"
        ? { monthlyRevenue: sortDir }
        : sortBy === "name"
          ? { name: sortDir }
          : { updatedAt: sortDir };

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        prediction: true,
        segmentMembership: { include: { segment: true } },
        _count: { select: { supportTickets: true } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

export async function getCustomer(organizationId: string, customerId: string) {
  return prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    include: {
      prediction: true,
      segmentMembership: { include: { segment: true } },
    },
  });
}

export async function getCustomerTimeline(customerId: string, eventTypeFilter?: string[]) {
  const [events, transactions, tickets, sentiments, predictions] = await Promise.all([
    prisma.customerEvent.findMany({ where: { customerId }, orderBy: { occurredAt: "desc" }, take: 200 }),
    prisma.transaction.findMany({ where: { customerId }, orderBy: { occurredAt: "desc" }, take: 200 }),
    prisma.supportTicket.findMany({ where: { customerId }, orderBy: { openedAt: "desc" }, take: 100 }),
    prisma.sentimentResult.findMany({ where: { customerId }, orderBy: { occurredAt: "desc" }, take: 100 }),
    prisma.predictionHistory.findMany({ where: { customerId }, orderBy: { predictedAt: "desc" }, take: 50 }),
  ]);

  type TimelineEntry = { type: string; occurredAt: Date; summary: string; detail?: unknown };
  const entries: TimelineEntry[] = [
    ...events.map((e) => ({ type: e.eventType, occurredAt: e.occurredAt, summary: humanizeEventType(e.eventType) })),
    ...transactions.map((t) => ({
      type: t.type,
      occurredAt: t.occurredAt,
      summary: `${t.type === "refund" ? "Refund" : "Purchase"} of $${t.amount.toString()}`,
    })),
    ...tickets.map((t) => ({
      type: "support",
      occurredAt: t.openedAt,
      summary: `Support ticket opened${t.resolved ? " (resolved)" : ""}`,
    })),
    ...sentiments.map((s) => ({
      type: "sentiment",
      occurredAt: s.occurredAt,
      summary: `${s.sentimentLabel.toLowerCase()} sentiment detected (${s.source})`,
    })),
    ...predictions.map((p) => ({
      type: "prediction",
      occurredAt: p.predictedAt,
      summary: `Churn probability updated to ${(p.churnProbability * 100).toFixed(1)}% (${p.riskLevel.toLowerCase()})`,
    })),
  ];

  const filtered = eventTypeFilter?.length ? entries.filter((e) => eventTypeFilter.includes(e.type)) : entries;
  return filtered.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}

function humanizeEventType(eventType: string): string {
  const map: Record<string, string> = {
    login: "Customer logged in",
    feature_use: "Used a product feature",
    subscription_cancelled: "Subscription cancelled",
    subscription_upgrade: "Upgraded subscription",
    subscription_downgrade: "Downgraded subscription",
  };
  return map[eventType] ?? eventType.replace(/_/g, " ");
}

export async function getOrgSummary(organizationId: string) {
  const [total, active, riskGroups, avg] = await Promise.all([
    prisma.customer.count({ where: { organizationId } }),
    prisma.customer.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.prediction.groupBy({ by: ["riskLevel"], where: { customer: { organizationId } }, _count: { _all: true } }),
    prisma.prediction.aggregate({ where: { customer: { organizationId } }, _avg: { churnProbability: true } }),
  ]);
  return { total, active, riskGroups, avgProbability: avg._avg.churnProbability };
}

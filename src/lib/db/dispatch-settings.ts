import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { addColumnIfMissing, createIndexIfMissing } from "@/lib/db/schema-guard";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto/secret";
import {
  parseDispatchPolicy,
  type DispatchPolicy,
  shipdayWebhookUrl,
} from "@/lib/commerce/dispatch";
import { actorOrganizationId, ensureOrganizationSchema, SAMS_ORG_ID } from "@/lib/db/organization";
import { moneyNumber } from "@/lib/db/money";
import type { DeliveryChannel } from "@/lib/commerce/dispatch";
import type { UserProfile } from "@/types";

let ready = false;

export async function ensureDispatchSchema() {
  if (!isDbConfigured() || ready) return;
  await addColumnIfMissing(
    "locations",
    "internal_delivery_enabled",
    "BOOLEAN NOT NULL DEFAULT true",
  );
  await addColumnIfMissing("locations", "shipday_enabled", "BOOLEAN NOT NULL DEFAULT false");
  await addColumnIfMissing(
    "locations",
    "dispatch_policy",
    "VARCHAR(32) NOT NULL DEFAULT 'internal_first'",
  );

  await addColumnIfMissing("orders", "delivery_channel", "VARCHAR(32) NULL");
  await addColumnIfMissing("orders", "shipday_order_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("orders", "provider_status", "VARCHAR(64) NULL");
  await addColumnIfMissing("orders", "provider_tracking_url", "VARCHAR(1024) NULL");
  await addColumnIfMissing("orders", "provider_cost", "DECIMAL(12,2) NULL");
  await addColumnIfMissing("orders", "provider_name", "VARCHAR(191) NULL");
  await addColumnIfMissing("orders", "provider_courier_name", "VARCHAR(191) NULL");
  await addColumnIfMissing("orders", "provider_courier_phone", "VARCHAR(191) NULL");
  await addColumnIfMissing(
    "orders",
    "provider_failed",
    "BOOLEAN NOT NULL DEFAULT false",
  );
  await addColumnIfMissing("orders", "dispatched_at", "DATETIME(3) NULL");
  await createIndexIfMissing("orders", "orders_shipday_order_id_idx", "`shipday_order_id`");
  await createIndexIfMissing("orders", "orders_delivery_channel_idx", "`delivery_channel`");
  ready = true;
}

export type LocationDispatchSettings = {
  internalDeliveryEnabled: boolean;
  shipdayEnabled: boolean;
  dispatchPolicy: DispatchPolicy;
};

export function mapDispatchSettings(row: Record<string, unknown> | null | undefined): LocationDispatchSettings {
  const source = row ?? {};
  const internal =
    source.internalDeliveryEnabled ??
    source.internal_delivery_enabled ??
    true;
  const shipday = source.shipdayEnabled ?? source.shipday_enabled ?? false;
  const policy = source.dispatchPolicy ?? source.dispatch_policy;
  return {
    internalDeliveryEnabled: internal !== false && internal !== 0,
    shipdayEnabled: shipday === true || shipday === 1,
    dispatchPolicy: parseDispatchPolicy(policy),
  };
}

export async function loadLocationDispatch(locationId: string): Promise<LocationDispatchSettings> {
  await ensureDispatchSchema();
  const rows = await prisma.$queryRawUnsafe<
    {
      internal_delivery_enabled: number | boolean | null;
      shipday_enabled: number | boolean | null;
      dispatch_policy: string | null;
    }[]
  >(
    `SELECT internal_delivery_enabled, shipday_enabled, dispatch_policy
     FROM locations WHERE id = ? LIMIT 1`,
    locationId,
  );
  const row = rows[0];
  if (!row) {
    return {
      internalDeliveryEnabled: true,
      shipdayEnabled: false,
      dispatchPolicy: "internal_first",
    };
  }
  return mapDispatchSettings({
    internal_delivery_enabled: row.internal_delivery_enabled,
    shipday_enabled: row.shipday_enabled,
    dispatch_policy: row.dispatch_policy,
  });
}

export async function saveLocationDispatch(
  locationId: string,
  settings: Partial<LocationDispatchSettings>,
) {
  await ensureDispatchSchema();
  const current = await loadLocationDispatch(locationId);
  const next: LocationDispatchSettings = {
    internalDeliveryEnabled: settings.internalDeliveryEnabled ?? current.internalDeliveryEnabled,
    shipdayEnabled: settings.shipdayEnabled ?? current.shipdayEnabled,
    dispatchPolicy: settings.dispatchPolicy ?? current.dispatchPolicy,
  };
  await prisma.$executeRawUnsafe(
    `UPDATE locations
     SET internal_delivery_enabled = ?, shipday_enabled = ?, dispatch_policy = ?
     WHERE id = ?`,
    next.internalDeliveryEnabled,
    next.shipdayEnabled,
    next.dispatchPolicy,
    locationId,
  );
  return next;
}

type OrgShipdaySettings = {
  apiKeyEnc?: string;
  webhookSecretEnc?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

async function loadOrgSettings(organizationId: string) {
  await ensureOrganizationSchema();
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  return asRecord(org?.settings);
}

export async function resolveShipdayApiKey(organizationId?: string | null): Promise<string | null> {
  const orgId = organizationId || SAMS_ORG_ID;
  const settings = await loadOrgSettings(orgId);
  const shipday = asRecord(settings.shipday);
  const stored = decryptSecret(typeof shipday.apiKeyEnc === "string" ? shipday.apiKeyEnc : "");
  if (stored) return stored;
  const envKey = process.env.SHIPDAY_API_KEY?.trim();
  return envKey || null;
}

export async function resolveShipdayWebhookSecret(
  organizationId?: string | null,
): Promise<string | null> {
  const orgId = organizationId || SAMS_ORG_ID;
  const settings = await loadOrgSettings(orgId);
  const shipday = asRecord(settings.shipday);
  const stored = decryptSecret(
    typeof shipday.webhookSecretEnc === "string" ? shipday.webhookSecretEnc : "",
  );
  if (stored) return stored;
  const envSecret = process.env.SHIPDAY_WEBHOOK_SECRET?.trim();
  return envSecret || null;
}

export function isShipdayConfigured(apiKey: string | null | undefined) {
  return Boolean(apiKey && apiKey.trim().length > 8);
}

export async function getShipdaySettingsPublic(actor: UserProfile) {
  const organizationId = actorOrganizationId(actor) ?? SAMS_ORG_ID;
  const settings = await loadOrgSettings(organizationId);
  const shipday = asRecord(settings.shipday) as OrgShipdaySettings;
  const storedKey = decryptSecret(shipday.apiKeyEnc);
  const envKey = process.env.SHIPDAY_API_KEY?.trim() || null;
  const key = storedKey || envKey;
  const storedWebhook = decryptSecret(shipday.webhookSecretEnc);
  const envWebhook = process.env.SHIPDAY_WEBHOOK_SECRET?.trim() || null;
  return {
    organizationId,
    configured: isShipdayConfigured(key),
    apiKeyMasked: maskSecret(key),
    apiKeySource: storedKey ? ("organization" as const) : envKey ? ("env" as const) : ("none" as const),
    webhookSecretSet: Boolean(storedWebhook || envWebhook),
    webhookSecretSource: storedWebhook
      ? ("organization" as const)
      : envWebhook
        ? ("env" as const)
        : ("none" as const),
    webhookUrl: shipdayWebhookUrl(),
  };
}

export async function saveOrgShipdaySecrets(
  actor: UserProfile,
  input: { apiKey?: string; webhookSecret?: string },
) {
  const organizationId = actorOrganizationId(actor) ?? SAMS_ORG_ID;
  const settings = await loadOrgSettings(organizationId);
  const shipday = asRecord(settings.shipday);
  const apiKey = input.apiKey?.trim();
  const webhookSecret = input.webhookSecret?.trim();
  if (apiKey) shipday.apiKeyEnc = encryptSecret(apiKey);
  if (webhookSecret) shipday.webhookSecretEnc = encryptSecret(webhookSecret);
  await prisma.organization.update({
    where: { id: organizationId },
    data: { settings: { ...settings, shipday } as never },
  });
  return getShipdaySettingsPublic(actor);
}

export type DispatchFields = {
  deliveryChannel?: DeliveryChannel;
  shipdayOrderId?: string;
  providerStatus?: string;
  providerTrackingUrl?: string;
  providerCost?: number;
  providerName?: string;
  providerCourierName?: string;
  providerCourierPhone?: string;
  providerFailed?: boolean;
  dispatchedAt?: string;
};

export function dispatchFieldsFromRow(row: {
  delivery_channel?: string | null;
  shipday_order_id?: string | null;
  provider_status?: string | null;
  provider_tracking_url?: string | null;
  provider_cost?: unknown;
  provider_name?: string | null;
  provider_courier_name?: string | null;
  provider_courier_phone?: string | null;
  provider_failed?: number | boolean | null;
  dispatched_at?: Date | string | null;
}): DispatchFields {
  const failed = row.provider_failed === true || row.provider_failed === 1;
  return {
    deliveryChannel:
      row.delivery_channel === "shipday"
        ? "shipday"
        : row.delivery_channel === "internal"
          ? "internal"
          : undefined,
    shipdayOrderId: row.shipday_order_id ?? undefined,
    providerStatus: row.provider_status ?? undefined,
    providerTrackingUrl: row.provider_tracking_url ?? undefined,
    providerCost: row.provider_cost != null ? moneyNumber(row.provider_cost) : undefined,
    providerName: row.provider_name ?? undefined,
    providerCourierName: row.provider_courier_name ?? undefined,
    providerCourierPhone: row.provider_courier_phone ?? undefined,
    providerFailed: failed || undefined,
    dispatchedAt:
      row.dispatched_at instanceof Date
        ? row.dispatched_at.toISOString()
        : (row.dispatched_at ?? undefined),
  };
}

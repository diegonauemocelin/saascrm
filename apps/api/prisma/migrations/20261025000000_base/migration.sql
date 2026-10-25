-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LayoutMode" AS ENUM ('CLASSIC', 'MODERN');

-- CreateEnum
CREATE TYPE "ThemeMode" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('OWN', 'UNIT', 'ALL');

-- CreateEnum
CREATE TYPE "ServiceKind" AS ENUM ('PRE_VENDAS', 'POS_VENDAS');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('SIM', 'NAO', 'PENDENTE');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('SIM', 'NAO', 'NEGOCIACAO');

-- CreateEnum
CREATE TYPE "FollowStatus" AS ENUM ('PENDENTE', 'CONTATADO', 'ANALISANDO', 'RESOLVIDO', 'VOLTOU_AO_VENDEDOR');

-- CreateEnum
CREATE TYPE "LookupType" AS ENUM ('ORIGEM', 'TIPO_CLIENTE', 'MARCA', 'TIPO_PECA', 'MOTIVO_PERDA');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('LEAD', 'QUALIFICADO', 'OPORTUNIDADE', 'CLIENTE');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTISELECT', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "ScoreDimension" AS ENUM ('PERFIL', 'INTERESSE');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('RASCUNHO', 'AGENDADA', 'ENVIANDO', 'PAUSADA', 'ENVIADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('ATIVO', 'CONCLUIDO', 'SAIU', 'ERRO');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPlatform" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
    "planId" UUID,
    "trialEndsAt" TIMESTAMP(3),
    "paidUntil" TIMESTAMP(3),
    "extraUsers" INTEGER NOT NULL DEFAULT 0,
    "extraWhatsapp" INTEGER NOT NULL DEFAULT 0,
    "document" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "asaasCustomerId" TEXT,
    "asaasSubscriptionId" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "require2fa" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "module" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "canExport" BOOLEAN NOT NULL DEFAULT false,
    "scope" "PermissionScope" NOT NULL DEFAULT 'ALL',

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatarFileId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totpSecretEnc" TEXT,
    "totpPendingSecretEnc" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpLastStep" INTEGER,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "layout" "LayoutMode",
    "screens" TEXT,
    "savedViews" JSONB,
    "chatSignature" TEXT,
    "managerIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "trailDone" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "theme" "ThemeMode" NOT NULL DEFAULT 'SYSTEM',
    "unitId" UUID,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_codes" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "tenantId" UUID,
    "userId" UUID,
    "userEmail" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "data" JSONB,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_assets" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_releases" (
    "version" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_releases_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "state" CHAR(2),
    "isHeadquarters" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sellers" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unitId" UUID,
    "email" TEXT,
    "phone" TEXT,
    "userId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookup_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "type" "LookupType" NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lookup_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_records" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kind" "ServiceKind" NOT NULL,
    "leadAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "customerCode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "sellerId" UUID,
    "leadId" UUID,
    "unitId" UUID,
    "originId" UUID,
    "customerTypeId" UUID,
    "country" TEXT NOT NULL DEFAULT 'BR',
    "state" CHAR(2),
    "city" TEXT,
    "brandIds" UUID[],
    "partTypeIds" UUID[],
    "forwarded" BOOLEAN NOT NULL DEFAULT false,
    "forwardedAt" TIMESTAMP(3),
    "returnStatus" "ReturnStatus",
    "returnedAt" TIMESTAMP(3),
    "saleStatus" "SaleStatus" NOT NULL DEFAULT 'NEGOCIACAO',
    "lostReasonId" UUID,
    "invoiceNumber" TEXT,
    "saleValue" DECIMAL(12,2),
    "notes" TEXT,
    "parentId" UUID,
    "followStatus" "FollowStatus",
    "followNote" TEXT,
    "dueAt" TIMESTAMP(3),
    "firstActionAt" TIMESTAMP(3),
    "callDueAt" TIMESTAMP(3),
    "calledAt" TIMESTAMP(3),
    "autoMessageAt" TIMESTAMP(3),
    "autoMessageStatus" TEXT,
    "externalKey" TEXT,
    "importBatch" TEXT,
    "adsVia" TEXT,
    "adsCampaignId" TEXT,
    "adsCampaign" TEXT,
    "adsTouchAt" TIMESTAMP(3),
    "adsCheckedAt" TIMESTAMP(3),
    "entryPage" TEXT,
    "entryChannel" TEXT,
    "adsTerm" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "service_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_record_history" (
    "id" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "userId" UUID,
    "userName" TEXT,
    "action" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_record_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "jobTitle" TEXT,
    "country" TEXT NOT NULL DEFAULT 'BR',
    "state" CHAR(2),
    "city" TEXT,
    "stage" "LeadStage" NOT NULL DEFAULT 'LEAD',
    "ownerId" UUID,
    "unitId" UUID,
    "originId" UUID,
    "tags" TEXT[],
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "emailOptIn" BOOLEAN NOT NULL DEFAULT false,
    "emailOptOutAt" TIMESTAMP(3),
    "emailBouncedAt" TIMESTAMP(3),
    "firstConversionAt" TIMESTAMP(3),
    "lastConversionAt" TIMESTAMP(3),
    "firstConversion" JSONB,
    "lastConversion" JSONB,
    "lastOpportunityAt" TIMESTAMP(3),
    "lastSaleAt" TIMESTAMP(3),
    "lastSaleValue" DECIMAL(12,2),
    "scoreProfile" INTEGER NOT NULL DEFAULT 0,
    "scoreInterest" INTEGER NOT NULL DEFAULT 0,
    "scoreGrade" CHAR(1),
    "scoreUpdatedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "importBatch" TEXT,
    "ecommerceId" TEXT,
    "anonymizedAt" TIMESTAMP(3),
    "adsFirstCampaignId" TEXT,
    "adsFirstCampaign" TEXT,
    "adsFirstAt" TIMESTAMP(3),
    "adsLastCampaignId" TEXT,
    "adsLastCampaign" TEXT,
    "adsLastAt" TIMESTAMP(3),
    "adsCheckedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_visitors" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" TEXT NOT NULL,
    "leadId" UUID,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstTouch" JSONB,
    "lastTouch" JSONB,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "pageviews" INTEGER NOT NULL DEFAULT 0,
    "identifiedAt" TIMESTAMP(3),
    "firstDevice" TEXT,
    "device" TEXT,

    CONSTRAINT "site_visitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_pageviews" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "visitorId" UUID NOT NULL,
    "sessionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT,
    "title" TEXT,
    "newSession" BOOLEAN NOT NULL DEFAULT false,
    "touch" JSONB,
    "device" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_pageviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "visitorId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "value" DECIMAL(12,2),
    "items" JSONB,
    "url" TEXT,
    "device" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecommerce_carts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "hash" TEXT,
    "status" INTEGER NOT NULL,
    "leadId" UUID,
    "customerId" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "startedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "checkoutStarted" BOOLEAN NOT NULL DEFAULT false,
    "checkoutUrl" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "value" DECIMAL(12,2),
    "orderCode" TEXT,
    "contactStatus" TEXT NOT NULL DEFAULT 'PENDENTE',
    "contactNote" TEXT,
    "contactedAt" TIMESTAMP(3),
    "contactedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ecommerce_carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecommerce_orders" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "leadId" UUID,
    "customerId" TEXT,
    "orderedAt" TIMESTAMP(3) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "statusName" TEXT NOT NULL,
    "statusGroup" TEXT NOT NULL,
    "payment" TEXT,
    "channel" TEXT,
    "itemsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ecommerce_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecommerce_order_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "quantity" INTEGER NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ecommerce_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_products" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "price" DECIMAL(12,2),
    "priceFrom" DECIMAL(12,2),
    "stock" INTEGER,
    "image" TEXT,
    "url" TEXT,
    "path" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_receipts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "leadId" UUID,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capture_forms" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "submitLabel" TEXT NOT NULL DEFAULT 'Enviar',
    "successMessage" TEXT NOT NULL DEFAULT 'Recebemos seus dados. Em breve entraremos em contato.',
    "afterSubmit" TEXT NOT NULL DEFAULT 'mensagem',
    "redirectUrl" TEXT,
    "consentText" TEXT,
    "originName" TEXT NOT NULL DEFAULT 'Site - LP',
    "ownerId" UUID,
    "customerTypeId" UUID,
    "brandIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "tags" TEXT[],
    "createRecord" BOOLEAN NOT NULL DEFAULT true,
    "design" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "submissions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capture_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capture_popups" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "formId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT,
    "imageUrl" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'delay',
    "delaySec" INTEGER NOT NULL DEFAULT 10,
    "scrollPct" INTEGER NOT NULL DEFAULT 50,
    "include" TEXT[],
    "exclude" TEXT[],
    "device" TEXT NOT NULL DEFAULT 'todos',
    "frequencyDays" INTEGER NOT NULL DEFAULT 7,
    "color" TEXT NOT NULL DEFAULT '#1d4ed8',
    "design" JSONB,
    "ownerId" UUID,
    "customerTypeId" UUID,
    "brandIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "active" BOOLEAN NOT NULL DEFAULT false,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capture_popups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capture_whatsapps" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "buttonText" TEXT NOT NULL DEFAULT 'Fale no WhatsApp',
    "title" TEXT NOT NULL DEFAULT 'Fale com a gente',
    "subtitle" TEXT NOT NULL DEFAULT '',
    "askEmail" BOOLEAN NOT NULL DEFAULT false,
    "requireName" BOOLEAN NOT NULL DEFAULT true,
    "requireEmail" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT NOT NULL,
    "position" TEXT NOT NULL DEFAULT 'direita',
    "color" TEXT NOT NULL DEFAULT '#25D366',
    "include" TEXT[],
    "exclude" TEXT[],
    "device" TEXT NOT NULL DEFAULT 'todos',
    "ownerId" UUID,
    "customerTypeId" UUID,
    "brandIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "tags" TEXT[],
    "originName" TEXT NOT NULL DEFAULT 'WhatsApp',
    "createRecord" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capture_whatsapps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_segments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "fromName" TEXT,
    "replyTo" TEXT,
    "coupon" TEXT,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "links" TEXT[],
    "segmentId" UUID,
    "kind" TEXT NOT NULL DEFAULT 'CAMPANHA',
    "status" "CampaignStatus" NOT NULL DEFAULT 'RASCUNHO',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "total" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "opens" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "unsubscribes" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_recipients" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "opens" INTEGER NOT NULL DEFAULT 0,
    "clickedAt" TIMESTAMP(3),
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "unsubscribedAt" TIMESTAMP(3),
    "runId" UUID,

    CONSTRAINT "email_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_clicks" (
    "id" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "linkIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capture_submissions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "formId" UUID,
    "popupId" UUID,
    "whatsappId" UUID,
    "leadId" UUID,
    "recordId" UUID,
    "data" JSONB NOT NULL,
    "pageUrl" TEXT,
    "touch" JSONB,
    "device" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capture_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "data" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_consents" (
    "id" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "text" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_defs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "options" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_field_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_rules" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "dimension" "ScoreDimension" NOT NULL,
    "name" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" JSONB,
    "points" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_imports" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ENVIADO',
    "headers" TEXT[],
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "mapping" JSONB,
    "options" JSONB,
    "report" JSONB,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "lead_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "trigger" JSONB NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "reentry" TEXT NOT NULL DEFAULT 'nunca',
    "exitOnPurchase" BOOLEAN NOT NULL DEFAULT true,
    "activatedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "automationId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'ATIVO',
    "stepId" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "context" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "exitReason" TEXT,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_logs" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "automationId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "stepId" TEXT,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_reports" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'privado',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_ads_conversions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "leadId" UUID,
    "kind" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(12,2),
    "clickIds" JSONB,
    "campaign" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "error" TEXT,
    "requestId" TEXT,
    "googleStatus" TEXT,
    "googleDetail" TEXT,
    "googleCheckedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_ads_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_ads_campaign_days" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "cost" DECIMAL(14,2) NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "conversions" DECIMAL(12,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_ads_campaign_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_ads_keyword_days" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adGroupId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "cost" DECIMAL(14,2) NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "conversions" DECIMAL(12,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_ads_keyword_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_numbers" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "phone" TEXT,
    "profileName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DESCONECTADO',
    "statusReason" TEXT,
    "unitId" UUID,
    "sellerIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "userIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "splitAttendance" BOOLEAN NOT NULL DEFAULT false,
    "defaultUserId" UUID,
    "sectors" JSONB NOT NULL DEFAULT '[]',
    "createRecords" BOOLEAN NOT NULL DEFAULT true,
    "signMessages" BOOLEAN NOT NULL DEFAULT true,
    "connectingAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "whatsapp_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_flows" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "numberIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "trigger" TEXT NOT NULL DEFAULT 'NOVA_CONVERSA',
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "onlyAfterHours" BOOLEAN NOT NULL DEFAULT false,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "startStepId" TEXT NOT NULL DEFAULT '',
    "timeoutMinutes" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_sectors" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "numberIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "userIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "managerIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "visibility" TEXT NOT NULL DEFAULT 'PROPRIAS',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_sectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_conversations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "numberId" UUID NOT NULL,
    "jid" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "leadId" UUID,
    "recordId" UUID,
    "assignedSellerId" UUID,
    "assignedUserId" UUID,
    "helperUserIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "sectorId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'CLIENTE',
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "unread" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "lastPreview" TEXT,
    "lastFromMe" BOOLEAN NOT NULL DEFAULT false,
    "noReplyNeeded" BOOLEAN NOT NULL DEFAULT false,
    "lastInboundAt" TIMESTAMP(3),
    "noteUnread" BOOLEAN NOT NULL DEFAULT false,
    "awaySentAt" TIMESTAMP(3),
    "botFlowId" UUID,
    "botState" JSONB,
    "botAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "waId" TEXT NOT NULL,
    "fromMe" BOOLEAN NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT,
    "fileId" UUID,
    "fileName" TEXT,
    "mime" TEXT,
    "mediaStatus" TEXT,
    "sentById" UUID,
    "sentByName" TEXT,
    "status" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "quotedWaId" TEXT,
    "quotedText" TEXT,
    "reactions" JSONB,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "transcript" TEXT,
    "secret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_quick_replies" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "fileId" UUID,
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_quick_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_labels" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_conversation_labels" (
    "conversationId" UUID NOT NULL,
    "labelId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_conversation_labels_pkey" PRIMARY KEY ("conversationId","labelId")
);

-- CreateTable
CREATE TABLE "whatsapp_contacts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contactKey" TEXT NOT NULL,
    "name" TEXT,
    "category" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_reminders" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "userName" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "doneAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suggestions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "userName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "area" TEXT,
    "imageFileId" UUID,
    "status" TEXT NOT NULL DEFAULT 'NOVA',
    "reply" TEXT,
    "repliedById" UUID,
    "repliedByName" TEXT,
    "repliedAt" TIMESTAMP(3),
    "unreadByAuthor" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tcar_products" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ean" TEXT,
    "factoryCode" TEXT,
    "integrationCode" TEXT,
    "refs" TEXT[],
    "brand" TEXT,
    "groupName" TEXT,
    "subgroupName" TEXT,
    "application" TEXT,
    "usedIn" TEXT,
    "unit" TEXT,
    "stock" DECIMAL(14,3),
    "price" DECIMAL(12,2),
    "resalePrice" DECIMAL(12,2),
    "branches" JSONB NOT NULL DEFAULT '[]',
    "searchText" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,
    "stockAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tcar_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tcar_actions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "cmd" TEXT NOT NULL,
    "query" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAt" TIMESTAMP(3),
    "offset" INTEGER NOT NULL DEFAULT 0,
    "resultCode" INTEGER,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tcar_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_ads_detail_days" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "campaignId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "cost" DECIMAL(14,2) NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "conversions" DECIMAL(12,2) NOT NULL,
    "conversionValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "impressionShare" DECIMAL(6,4),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_ads_detail_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_ads_search_term_days" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adGroupId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "cost" DECIMAL(14,2) NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "conversions" DECIMAL(12,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_ads_search_term_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_ad_days" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "parentId" TEXT,
    "objective" TEXT,
    "date" DATE NOT NULL,
    "spend" DECIMAL(14,2) NOT NULL,
    "impressions" INTEGER NOT NULL,
    "reach" INTEGER,
    "clicks" INTEGER NOT NULL,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "conversations" INTEGER NOT NULL DEFAULT 0,
    "conversions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "videoViews" INTEGER,
    "creative" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mkt_ad_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_ad_breakdown_days" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "campaignId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "spend" DECIMAL(14,2) NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mkt_ad_breakdown_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_social_profile_days" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "network" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "followers" INTEGER,
    "reach" INTEGER,
    "impressions" INTEGER,
    "profileViews" INTEGER,
    "websiteClicks" INTEGER,
    "follows" INTEGER,
    "unfollows" INTEGER,
    "accountsEngaged" INTEGER,
    "interactions" INTEGER,
    "linkTaps" INTEGER,
    "views" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mkt_social_profile_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_social_posts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "network" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "profileId" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "format" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "permalink" TEXT,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "reach" INTEGER,
    "impressions" INTEGER,
    "videoViews" INTEGER,
    "extra" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mkt_social_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_seo_days" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "position" DECIMAL(8,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mkt_seo_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_editorial_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "theme" TEXT,
    "ownerId" UUID,
    "plannedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "postUrl" TEXT,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "mkt_editorial_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_competitor_days" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT,
    "followers" INTEGER NOT NULL,
    "mediaCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mkt_competitor_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_competitor_posts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "format" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "permalink" TEXT,
    "likes" INTEGER,
    "comments" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mkt_competitor_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mkt_competitor_notes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "storiesSeen" INTEGER,
    "adsActive" BOOLEAN,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "mkt_competitor_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_campaigns" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "marketplace" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "strategy" TEXT,
    "budget" DECIMAL(14,2),
    "roasTarget" DECIMAL(10,2),
    "acosTarget" DECIMAL(10,2),
    "startDate" DATE,
    "endDate" DATE,
    "extra" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_ads" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "marketplace" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "campaignId" TEXT,
    "externalId" TEXT,
    "type" TEXT,
    "title" TEXT,
    "thumbnail" TEXT,
    "status" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_ads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_ad_days" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "marketplace" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "directRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "indirectRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "units" INTEGER NOT NULL DEFAULT 0,
    "directUnits" INTEGER NOT NULL DEFAULT 0,
    "indirectUnits" INTEGER NOT NULL DEFAULT 0,
    "items" INTEGER NOT NULL DEFAULT 0,
    "organicUnits" INTEGER NOT NULL DEFAULT 0,
    "organicRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "addToCart" INTEGER NOT NULL DEFAULT 0,
    "checkouts" INTEGER NOT NULL DEFAULT 0,
    "eventRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'api',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_ad_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assist_questions" (
    "id" SERIAL NOT NULL,
    "tenantId" UUID NOT NULL,
    "marketplace" TEXT NOT NULL DEFAULT 'mercadolivre',
    "mlQuestionId" TEXT NOT NULL,
    "mlItemId" TEXT,
    "mlStatus" TEXT,
    "customerId" TEXT,
    "customerNickname" TEXT,
    "customerName" TEXT,
    "customerLookupAt" TIMESTAMP(3),
    "text" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'nova',
    "processingState" TEXT NOT NULL DEFAULT 'ocioso',
    "processingStartedAt" TIMESTAMP(3),
    "pendingReason" TEXT,
    "pendingSince" TIMESTAMP(3),
    "brand" TEXT,
    "model" TEXT,
    "partCode" TEXT,
    "purchaseIntent" BOOLEAN NOT NULL DEFAULT false,
    "relevance" INTEGER NOT NULL DEFAULT 0,
    "assignedToId" UUID,
    "assignedToName" TEXT,
    "confidence" DOUBLE PRECISION,
    "answeredAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "externalAnsweredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assist_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assist_attempts" (
    "id" SERIAL NOT NULL,
    "tenantId" UUID NOT NULL,
    "questionId" INTEGER NOT NULL,
    "origin" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'resposta',
    "authorId" UUID,
    "authorName" TEXT,
    "basedOnId" INTEGER,
    "text" TEXT NOT NULL,
    "ai" JSONB,
    "confidence" DOUBLE PRECISION,
    "sendStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sendRequestedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "mlResponse" JSONB,
    "mlAnswerRef" TEXT,
    "error" TEXT,
    "sendAttempts" INTEGER NOT NULL DEFAULT 0,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedById" UUID,
    "reviewedByName" TEXT,
    "flaggedForReview" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "assist_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assist_attempt_knowledge" (
    "attemptId" INTEGER NOT NULL,
    "knowledgeId" INTEGER NOT NULL,
    "knowledgeVersion" INTEGER NOT NULL,

    CONSTRAINT "assist_attempt_knowledge_pkey" PRIMARY KEY ("attemptId","knowledgeId")
);

-- CreateTable
CREATE TABLE "assist_notes" (
    "id" SERIAL NOT NULL,
    "tenantId" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "userId" UUID,
    "userName" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assist_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assist_events" (
    "id" SERIAL NOT NULL,
    "tenantId" UUID NOT NULL,
    "questionId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "userId" UUID,
    "userName" TEXT,
    "note" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assist_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assist_knowledge" (
    "id" SERIAL NOT NULL,
    "tenantId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "partCode" TEXT,
    "product" TEXT,
    "application" TEXT,
    "question" TEXT,
    "answer" TEXT NOT NULL,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'em_revisao',
    "version" INTEGER NOT NULL DEFAULT 1,
    "originQuestionId" INTEGER,
    "originImportId" INTEGER,
    "createdById" UUID,
    "createdByName" TEXT,
    "updatedById" UUID,
    "updatedByName" TEXT,
    "approvedById" UUID,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedByName" TEXT,
    "matchKey" TEXT,
    "autoLearned" BOOLEAN NOT NULL DEFAULT false,
    "mlItemId" TEXT,
    "learnedFrom" TEXT,

    CONSTRAINT "assist_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assist_knowledge_versions" (
    "id" SERIAL NOT NULL,
    "tenantId" UUID NOT NULL,
    "knowledgeId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changeType" TEXT NOT NULL,
    "changedById" UUID,
    "changedByName" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assist_knowledge_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assist_imports" (
    "id" SERIAL NOT NULL,
    "tenantId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "userId" UUID,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'previa',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "ignored" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "headerErrors" JSONB,
    "report" JSONB,

    CONSTRAINT "assist_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assist_import_rows" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "existingId" INTEGER,
    "existing" JSONB,
    "errors" JSONB,
    "warnings" JSONB,
    "decision" TEXT NOT NULL DEFAULT 'pendente',
    "result" TEXT,

    CONSTRAINT "assist_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assist_items" (
    "tenantId" UUID NOT NULL,
    "id" TEXT NOT NULL,
    "sellerId" TEXT,
    "officialStoreId" TEXT,
    "title" TEXT,
    "permalink" TEXT,
    "price" DECIMAL(14,2),
    "currency" TEXT,
    "availableQuantity" INTEGER,
    "status" TEXT,
    "sellerSku" TEXT,
    "partNumber" TEXT,
    "brand" TEXT,
    "description" TEXT,
    "attributes" JSONB,
    "mlLastUpdated" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assist_items_pkey" PRIMARY KEY ("tenantId","id")
);

-- CreateTable
CREATE TABLE "assist_applications" (
    "id" SERIAL NOT NULL,
    "tenantId" UUID NOT NULL,
    "partCode" TEXT NOT NULL,
    "productName" TEXT,
    "partBrand" TEXT,
    "machineBrand" TEXT,
    "machineModel" TEXT,
    "system" TEXT,
    "application" TEXT,
    "mlItemId" TEXT,
    "validationStatus" TEXT NOT NULL DEFAULT 'pendente',
    "knowledgeId" INTEGER,
    "source" TEXT,
    "validatedById" UUID,
    "validatedByName" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchKey" TEXT NOT NULL,

    CONSTRAINT "assist_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assist_sales" (
    "id" SERIAL NOT NULL,
    "tenantId" UUID NOT NULL,
    "mlOrderId" TEXT NOT NULL,
    "mlItemId" TEXT NOT NULL,
    "itemTitle" TEXT,
    "questionId" INTEGER NOT NULL,
    "buyerId" TEXT NOT NULL,
    "orderStatus" TEXT,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,2),
    "total" DECIMAL(14,2),
    "currency" TEXT,
    "matchType" TEXT NOT NULL,
    "hoursAfterQuestion" DOUBLE PRECISION,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidBefore" BOOLEAN NOT NULL DEFAULT false,
    "paymentStatus" TEXT,

    CONSTRAINT "assist_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landing_pages" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "theme" JSONB NOT NULL,
    "blocks" JSONB NOT NULL,
    "blocksB" JSONB,
    "abSplit" INTEGER NOT NULL DEFAULT 50,
    "abActive" BOOLEAN NOT NULL DEFAULT false,
    "seo" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "landing_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landing_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "variant" TEXT NOT NULL DEFAULT 'A',
    "type" TEXT NOT NULL,
    "visitor" TEXT NOT NULL,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "device" TEXT,
    "leadId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "landing_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_products" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productCode" TEXT NOT NULL,
    "derivationCode" TEXT NOT NULL,
    "derivations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attributes" JSONB NOT NULL,
    "ean" TEXT,
    "image" TEXT,
    "pageId" INTEGER,
    "fields" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "issues" JSONB NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_changes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "seoProductId" UUID NOT NULL,
    "before" JSONB NOT NULL,
    "proposed" JSONB NOT NULL,
    "sendFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'SUGERIDA',
    "source" TEXT NOT NULL DEFAULT 'ia',
    "error" TEXT,
    "createdById" UUID,
    "createdByName" TEXT,
    "sentByName" TEXT,
    "sentAt" TIMESTAMP(3),
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_stickers" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "hash" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_stickers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_media" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "width" INTEGER,
    "height" INTEGER,
    "size" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_posts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "accountIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "networks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "format" TEXT NOT NULL DEFAULT 'FEED',
    "mediaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduledAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "publicToken" TEXT NOT NULL,
    "results" JSONB,
    "error" TEXT,
    "reviewNote" TEXT,
    "createdById" UUID,
    "createdByName" TEXT,
    "updatedByName" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceCents" INTEGER NOT NULL,
    "systems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxUsers" INTEGER NOT NULL DEFAULT 5,
    "maxWhatsapp" INTEGER NOT NULL DEFAULT 1,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "public" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_domains" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "host" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_payments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "asaasPaymentId" TEXT NOT NULL,
    "valueCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "billingType" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "invoiceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenantId_name_key" ON "roles"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_module_key" ON "role_permissions"("roleId", "module");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "recovery_codes_userId_idx" ON "recovery_codes"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_settings_tenantId_key_key" ON "tenant_settings"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "units_tenantId_name_key" ON "units"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sellers_userId_key" ON "sellers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sellers_tenantId_name_key" ON "sellers"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_items_tenantId_type_name_key" ON "lookup_items"("tenantId", "type", "name");

-- CreateIndex
CREATE INDEX "service_records_tenantId_kind_leadAt_idx" ON "service_records"("tenantId", "kind", "leadAt");

-- CreateIndex
CREATE INDEX "service_records_sellerId_idx" ON "service_records"("sellerId");

-- CreateIndex
CREATE INDEX "service_records_unitId_idx" ON "service_records"("unitId");

-- CreateIndex
CREATE INDEX "service_records_tenantId_kind_callDueAt_idx" ON "service_records"("tenantId", "kind", "callDueAt");

-- CreateIndex
CREATE INDEX "service_records_leadId_idx" ON "service_records"("leadId");

-- CreateIndex
CREATE INDEX "service_records_phone_idx" ON "service_records"("phone");

-- CreateIndex
CREATE INDEX "service_records_parentId_idx" ON "service_records"("parentId");

-- CreateIndex
CREATE INDEX "service_records_tenantId_kind_followStatus_dueAt_idx" ON "service_records"("tenantId", "kind", "followStatus", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "service_records_tenantId_externalKey_key" ON "service_records"("tenantId", "externalKey");

-- CreateIndex
CREATE INDEX "service_record_history_recordId_createdAt_idx" ON "service_record_history"("recordId", "createdAt");

-- CreateIndex
CREATE INDEX "leads_tenantId_ecommerceId_idx" ON "leads"("tenantId", "ecommerceId");

-- CreateIndex
CREATE INDEX "leads_tenantId_phone_idx" ON "leads"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "leads_tenantId_stage_idx" ON "leads"("tenantId", "stage");

-- CreateIndex
CREATE INDEX "leads_tenantId_scoreGrade_idx" ON "leads"("tenantId", "scoreGrade");

-- CreateIndex
CREATE INDEX "leads_ownerId_idx" ON "leads"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "leads_tenantId_email_key" ON "leads"("tenantId", "email");

-- CreateIndex
CREATE INDEX "site_visitors_leadId_idx" ON "site_visitors"("leadId");

-- CreateIndex
CREATE INDEX "site_visitors_tenantId_lastSeenAt_idx" ON "site_visitors"("tenantId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "site_visitors_tenantId_clientId_key" ON "site_visitors"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "site_pageviews_visitorId_occurredAt_idx" ON "site_pageviews"("visitorId", "occurredAt");

-- CreateIndex
CREATE INDEX "site_pageviews_tenantId_occurredAt_idx" ON "site_pageviews"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "site_pageviews_tenantId_path_idx" ON "site_pageviews"("tenantId", "path");

-- CreateIndex
CREATE INDEX "site_events_visitorId_occurredAt_idx" ON "site_events"("visitorId", "occurredAt");

-- CreateIndex
CREATE INDEX "site_events_tenantId_name_occurredAt_idx" ON "site_events"("tenantId", "name", "occurredAt");

-- CreateIndex
CREATE INDEX "ecommerce_carts_tenantId_status_lastActivityAt_idx" ON "ecommerce_carts"("tenantId", "status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "ecommerce_carts_leadId_idx" ON "ecommerce_carts"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "ecommerce_carts_tenantId_externalId_key" ON "ecommerce_carts"("tenantId", "externalId");

-- CreateIndex
CREATE INDEX "ecommerce_orders_leadId_orderedAt_idx" ON "ecommerce_orders"("leadId", "orderedAt");

-- CreateIndex
CREATE INDEX "ecommerce_orders_tenantId_orderedAt_idx" ON "ecommerce_orders"("tenantId", "orderedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ecommerce_orders_tenantId_externalId_key" ON "ecommerce_orders"("tenantId", "externalId");

-- CreateIndex
CREATE INDEX "ecommerce_order_items_orderId_idx" ON "ecommerce_order_items"("orderId");

-- CreateIndex
CREATE INDEX "ecommerce_order_items_tenantId_idx" ON "ecommerce_order_items"("tenantId");

-- CreateIndex
CREATE INDEX "store_products_tenantId_active_name_idx" ON "store_products"("tenantId", "active", "name");

-- CreateIndex
CREATE INDEX "store_products_tenantId_path_idx" ON "store_products"("tenantId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "store_products_tenantId_externalId_key" ON "store_products"("tenantId", "externalId");

-- CreateIndex
CREATE INDEX "integration_receipts_tenantId_provider_receivedAt_idx" ON "integration_receipts"("tenantId", "provider", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "integration_receipts_tenantId_provider_externalId_key" ON "integration_receipts"("tenantId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "capture_forms_tenantId_idx" ON "capture_forms"("tenantId");

-- CreateIndex
CREATE INDEX "capture_popups_tenantId_idx" ON "capture_popups"("tenantId");

-- CreateIndex
CREATE INDEX "capture_whatsapps_tenantId_idx" ON "capture_whatsapps"("tenantId");

-- CreateIndex
CREATE INDEX "email_segments_tenantId_idx" ON "email_segments"("tenantId");

-- CreateIndex
CREATE INDEX "email_campaigns_tenantId_status_idx" ON "email_campaigns"("tenantId", "status");

-- CreateIndex
CREATE INDEX "email_campaigns_tenantId_kind_idx" ON "email_campaigns"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "email_recipients_campaignId_status_idx" ON "email_recipients"("campaignId", "status");

-- CreateIndex
CREATE INDEX "email_recipients_sentAt_idx" ON "email_recipients"("sentAt");

-- CreateIndex
CREATE INDEX "email_recipients_runId_idx" ON "email_recipients"("runId");

-- CreateIndex
CREATE INDEX "email_recipients_leadId_idx" ON "email_recipients"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "email_recipients_campaignId_leadId_runId_key" ON "email_recipients"("campaignId", "leadId", "runId");

-- CreateIndex
CREATE INDEX "email_clicks_campaignId_linkIndex_idx" ON "email_clicks"("campaignId", "linkIndex");

-- CreateIndex
CREATE INDEX "capture_submissions_tenantId_createdAt_idx" ON "capture_submissions"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "capture_submissions_formId_createdAt_idx" ON "capture_submissions"("formId", "createdAt");

-- CreateIndex
CREATE INDEX "capture_submissions_leadId_idx" ON "capture_submissions"("leadId");

-- CreateIndex
CREATE INDEX "lead_events_leadId_occurredAt_idx" ON "lead_events"("leadId", "occurredAt");

-- CreateIndex
CREATE INDEX "lead_events_tenantId_type_occurredAt_idx" ON "lead_events"("tenantId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "lead_consents_leadId_purpose_createdAt_idx" ON "lead_consents"("leadId", "purpose", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_defs_tenantId_key_key" ON "custom_field_defs"("tenantId", "key");

-- CreateIndex
CREATE INDEX "score_rules_tenantId_dimension_idx" ON "score_rules"("tenantId", "dimension");

-- CreateIndex
CREATE INDEX "lead_imports_tenantId_createdAt_idx" ON "lead_imports"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "automations_tenantId_active_idx" ON "automations"("tenantId", "active");

-- CreateIndex
CREATE INDEX "automation_runs_status_nextRunAt_idx" ON "automation_runs"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "automation_runs_automationId_leadId_idx" ON "automation_runs"("automationId", "leadId");

-- CreateIndex
CREATE INDEX "automation_runs_automationId_status_idx" ON "automation_runs"("automationId", "status");

-- CreateIndex
CREATE INDEX "automation_runs_leadId_idx" ON "automation_runs"("leadId");

-- CreateIndex
CREATE INDEX "automation_logs_runId_createdAt_idx" ON "automation_logs"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "automation_logs_automationId_createdAt_idx" ON "automation_logs"("automationId", "createdAt");

-- CreateIndex
CREATE INDEX "saved_reports_tenantId_pinned_position_idx" ON "saved_reports"("tenantId", "pinned", "position");

-- CreateIndex
CREATE INDEX "google_ads_conversions_tenantId_status_idx" ON "google_ads_conversions"("tenantId", "status");

-- CreateIndex
CREATE INDEX "google_ads_conversions_recordId_idx" ON "google_ads_conversions"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "google_ads_conversions_tenantId_transactionId_key" ON "google_ads_conversions"("tenantId", "transactionId");

-- CreateIndex
CREATE INDEX "google_ads_campaign_days_tenantId_date_idx" ON "google_ads_campaign_days"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "google_ads_campaign_days_tenantId_date_campaignId_key" ON "google_ads_campaign_days"("tenantId", "date", "campaignId");

-- CreateIndex
CREATE INDEX "google_ads_keyword_days_tenantId_date_idx" ON "google_ads_keyword_days"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "google_ads_keyword_days_tenantId_date_adGroupId_criterionId_key" ON "google_ads_keyword_days"("tenantId", "date", "adGroupId", "criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_numbers_instanceName_key" ON "whatsapp_numbers"("instanceName");

-- CreateIndex
CREATE INDEX "whatsapp_numbers_tenantId_status_idx" ON "whatsapp_numbers"("tenantId", "status");

-- CreateIndex
CREATE INDEX "whatsapp_flows_tenantId_active_idx" ON "whatsapp_flows"("tenantId", "active");

-- CreateIndex
CREATE INDEX "whatsapp_sectors_tenantId_idx" ON "whatsapp_sectors"("tenantId");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_tenantId_lastMessageAt_idx" ON "whatsapp_conversations"("tenantId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_leadId_idx" ON "whatsapp_conversations"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_numberId_jid_key" ON "whatsapp_conversations"("numberId", "jid");

-- CreateIndex
CREATE INDEX "whatsapp_messages_conversationId_sentAt_idx" ON "whatsapp_messages"("conversationId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_conversationId_waId_key" ON "whatsapp_messages"("conversationId", "waId");

-- CreateIndex
CREATE INDEX "whatsapp_quick_replies_tenantId_userId_idx" ON "whatsapp_quick_replies"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "whatsapp_labels_tenantId_userId_idx" ON "whatsapp_labels"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "whatsapp_conversation_labels_labelId_idx" ON "whatsapp_conversation_labels"("labelId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_contacts_tenantId_scope_contactKey_key" ON "whatsapp_contacts"("tenantId", "scope", "contactKey");

-- CreateIndex
CREATE INDEX "whatsapp_reminders_userId_doneAt_dueAt_idx" ON "whatsapp_reminders"("userId", "doneAt", "dueAt");

-- CreateIndex
CREATE INDEX "whatsapp_reminders_conversationId_idx" ON "whatsapp_reminders"("conversationId");

-- CreateIndex
CREATE INDEX "suggestions_tenantId_status_createdAt_idx" ON "suggestions"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "suggestions_userId_createdAt_idx" ON "suggestions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "tcar_products_tenantId_factoryCode_idx" ON "tcar_products"("tenantId", "factoryCode");

-- CreateIndex
CREATE INDEX "tcar_products_tenantId_integrationCode_idx" ON "tcar_products"("tenantId", "integrationCode");

-- CreateIndex
CREATE UNIQUE INDEX "tcar_products_tenantId_code_key" ON "tcar_products"("tenantId", "code");

-- CreateIndex
CREATE INDEX "tcar_actions_tenantId_status_createdAt_idx" ON "tcar_actions"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "google_ads_detail_days_tenantId_dimension_date_idx" ON "google_ads_detail_days"("tenantId", "dimension", "date");

-- CreateIndex
CREATE UNIQUE INDEX "google_ads_detail_days_tenantId_date_campaignId_dimension_k_key" ON "google_ads_detail_days"("tenantId", "date", "campaignId", "dimension", "key");

-- CreateIndex
CREATE INDEX "google_ads_search_term_days_tenantId_date_idx" ON "google_ads_search_term_days"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "google_ads_search_term_days_tenantId_date_adGroupId_term_key" ON "google_ads_search_term_days"("tenantId", "date", "adGroupId", "term");

-- CreateIndex
CREATE INDEX "mkt_ad_days_tenantId_platform_level_date_idx" ON "mkt_ad_days"("tenantId", "platform", "level", "date");

-- CreateIndex
CREATE UNIQUE INDEX "mkt_ad_days_tenantId_platform_level_entityId_date_key" ON "mkt_ad_days"("tenantId", "platform", "level", "entityId", "date");

-- CreateIndex
CREATE INDEX "mkt_ad_breakdown_days_tenantId_platform_dimension_date_idx" ON "mkt_ad_breakdown_days"("tenantId", "platform", "dimension", "date");

-- CreateIndex
CREATE UNIQUE INDEX "mkt_ad_breakdown_days_tenantId_platform_date_campaignId_dim_key" ON "mkt_ad_breakdown_days"("tenantId", "platform", "date", "campaignId", "dimension", "key");

-- CreateIndex
CREATE UNIQUE INDEX "mkt_social_profile_days_tenantId_network_profileId_date_key" ON "mkt_social_profile_days"("tenantId", "network", "profileId", "date");

-- CreateIndex
CREATE INDEX "mkt_social_posts_tenantId_publishedAt_idx" ON "mkt_social_posts"("tenantId", "publishedAt");

-- CreateIndex
CREATE INDEX "mkt_social_posts_tenantId_profileId_publishedAt_idx" ON "mkt_social_posts"("tenantId", "profileId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "mkt_social_posts_tenantId_network_postId_key" ON "mkt_social_posts"("tenantId", "network", "postId");

-- CreateIndex
CREATE INDEX "mkt_seo_days_tenantId_kind_date_idx" ON "mkt_seo_days"("tenantId", "kind", "date");

-- CreateIndex
CREATE UNIQUE INDEX "mkt_seo_days_tenantId_date_kind_key_key" ON "mkt_seo_days"("tenantId", "date", "kind", "key");

-- CreateIndex
CREATE INDEX "mkt_editorial_items_tenantId_plannedAt_idx" ON "mkt_editorial_items"("tenantId", "plannedAt");

-- CreateIndex
CREATE UNIQUE INDEX "mkt_competitor_days_tenantId_username_date_key" ON "mkt_competitor_days"("tenantId", "username", "date");

-- CreateIndex
CREATE INDEX "mkt_competitor_posts_tenantId_username_publishedAt_idx" ON "mkt_competitor_posts"("tenantId", "username", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "mkt_competitor_posts_tenantId_username_postId_key" ON "mkt_competitor_posts"("tenantId", "username", "postId");

-- CreateIndex
CREATE INDEX "mkt_competitor_notes_tenantId_username_date_idx" ON "mkt_competitor_notes"("tenantId", "username", "date");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_campaigns_tenantId_marketplace_product_campaign_key" ON "marketplace_campaigns"("tenantId", "marketplace", "product", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_ads_tenantId_marketplace_adId_key" ON "marketplace_ads"("tenantId", "marketplace", "adId");

-- CreateIndex
CREATE INDEX "marketplace_ad_days_tenantId_marketplace_product_level_date_idx" ON "marketplace_ad_days"("tenantId", "marketplace", "product", "level", "date");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_ad_days_tenantId_marketplace_product_level_enti_key" ON "marketplace_ad_days"("tenantId", "marketplace", "product", "level", "entityId", "date");

-- CreateIndex
CREATE INDEX "assist_questions_tenantId_status_idx" ON "assist_questions"("tenantId", "status");

-- CreateIndex
CREATE INDEX "assist_questions_tenantId_receivedAt_idx" ON "assist_questions"("tenantId", "receivedAt");

-- CreateIndex
CREATE INDEX "assist_questions_tenantId_customerId_idx" ON "assist_questions"("tenantId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "assist_questions_tenantId_mlQuestionId_key" ON "assist_questions"("tenantId", "mlQuestionId");

-- CreateIndex
CREATE INDEX "assist_attempts_tenantId_questionId_idx" ON "assist_attempts"("tenantId", "questionId");

-- CreateIndex
CREATE INDEX "assist_attempts_tenantId_sendStatus_idx" ON "assist_attempts"("tenantId", "sendStatus");

-- CreateIndex
CREATE INDEX "assist_attempt_knowledge_knowledgeId_idx" ON "assist_attempt_knowledge"("knowledgeId");

-- CreateIndex
CREATE INDEX "assist_notes_tenantId_entity_entityId_idx" ON "assist_notes"("tenantId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "assist_events_questionId_idx" ON "assist_events"("questionId");

-- CreateIndex
CREATE INDEX "assist_events_tenantId_type_createdAt_idx" ON "assist_events"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "assist_knowledge_tenantId_status_idx" ON "assist_knowledge"("tenantId", "status");

-- CreateIndex
CREATE INDEX "assist_knowledge_tenantId_matchKey_idx" ON "assist_knowledge"("tenantId", "matchKey");

-- CreateIndex
CREATE INDEX "assist_knowledge_tenantId_partCode_idx" ON "assist_knowledge"("tenantId", "partCode");

-- CreateIndex
CREATE INDEX "assist_knowledge_versions_knowledgeId_idx" ON "assist_knowledge_versions"("knowledgeId");

-- CreateIndex
CREATE INDEX "assist_imports_tenantId_createdAt_idx" ON "assist_imports"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "assist_import_rows_importId_idx" ON "assist_import_rows"("importId");

-- CreateIndex
CREATE INDEX "assist_items_tenantId_status_idx" ON "assist_items"("tenantId", "status");

-- CreateIndex
CREATE INDEX "assist_applications_tenantId_partCode_idx" ON "assist_applications"("tenantId", "partCode");

-- CreateIndex
CREATE INDEX "assist_applications_tenantId_machineModel_idx" ON "assist_applications"("tenantId", "machineModel");

-- CreateIndex
CREATE UNIQUE INDEX "assist_applications_tenantId_matchKey_key" ON "assist_applications"("tenantId", "matchKey");

-- CreateIndex
CREATE INDEX "assist_sales_tenantId_questionId_idx" ON "assist_sales"("tenantId", "questionId");

-- CreateIndex
CREATE INDEX "assist_sales_tenantId_orderDate_idx" ON "assist_sales"("tenantId", "orderDate");

-- CreateIndex
CREATE UNIQUE INDEX "assist_sales_tenantId_mlOrderId_mlItemId_key" ON "assist_sales"("tenantId", "mlOrderId", "mlItemId");

-- CreateIndex
CREATE UNIQUE INDEX "landing_pages_tenantId_slug_key" ON "landing_pages"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "landing_events_pageId_occurredAt_idx" ON "landing_events"("pageId", "occurredAt");

-- CreateIndex
CREATE INDEX "landing_events_tenantId_occurredAt_idx" ON "landing_events"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "seo_products_tenantId_score_idx" ON "seo_products"("tenantId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "seo_products_tenantId_productCode_key" ON "seo_products"("tenantId", "productCode");

-- CreateIndex
CREATE INDEX "seo_changes_tenantId_status_createdAt_idx" ON "seo_changes"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "seo_changes_seoProductId_idx" ON "seo_changes"("seoProductId");

-- CreateIndex
CREATE INDEX "whatsapp_stickers_tenantId_userId_createdAt_idx" ON "whatsapp_stickers"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_stickers_userId_hash_key" ON "whatsapp_stickers"("userId", "hash");

-- CreateIndex
CREATE INDEX "social_media_tenantId_createdAt_idx" ON "social_media"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "social_posts_tenantId_scheduledAt_idx" ON "social_posts"("tenantId", "scheduledAt");

-- CreateIndex
CREATE INDEX "social_posts_status_scheduledAt_idx" ON "social_posts"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_domains_host_key" ON "tenant_domains"("host");

-- CreateIndex
CREATE INDEX "tenant_domains_tenantId_idx" ON "tenant_domains"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_payments_asaasPaymentId_key" ON "tenant_payments"("asaasPaymentId");

-- CreateIndex
CREATE INDEX "tenant_payments_tenantId_dueDate_idx" ON "tenant_payments"("tenantId", "dueDate");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lookup_items" ADD CONSTRAINT "lookup_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_originId_fkey" FOREIGN KEY ("originId") REFERENCES "lookup_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_customerTypeId_fkey" FOREIGN KEY ("customerTypeId") REFERENCES "lookup_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_lostReasonId_fkey" FOREIGN KEY ("lostReasonId") REFERENCES "lookup_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "service_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_record_history" ADD CONSTRAINT "service_record_history_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "service_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_originId_fkey" FOREIGN KEY ("originId") REFERENCES "lookup_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visitors" ADD CONSTRAINT "site_visitors_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visitors" ADD CONSTRAINT "site_visitors_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_pageviews" ADD CONSTRAINT "site_pageviews_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "site_visitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_events" ADD CONSTRAINT "site_events_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "site_visitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecommerce_carts" ADD CONSTRAINT "ecommerce_carts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecommerce_carts" ADD CONSTRAINT "ecommerce_carts_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecommerce_orders" ADD CONSTRAINT "ecommerce_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecommerce_orders" ADD CONSTRAINT "ecommerce_orders_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecommerce_order_items" ADD CONSTRAINT "ecommerce_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ecommerce_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_receipts" ADD CONSTRAINT "integration_receipts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_forms" ADD CONSTRAINT "capture_forms_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_popups" ADD CONSTRAINT "capture_popups_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_popups" ADD CONSTRAINT "capture_popups_formId_fkey" FOREIGN KEY ("formId") REFERENCES "capture_forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_whatsapps" ADD CONSTRAINT "capture_whatsapps_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_segments" ADD CONSTRAINT "email_segments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "email_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_clicks" ADD CONSTRAINT "email_clicks_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "email_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_submissions" ADD CONSTRAINT "capture_submissions_formId_fkey" FOREIGN KEY ("formId") REFERENCES "capture_forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_submissions" ADD CONSTRAINT "capture_submissions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_consents" ADD CONSTRAINT "lead_consents_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_defs" ADD CONSTRAINT "custom_field_defs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_rules" ADD CONSTRAINT "score_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_imports" ADD CONSTRAINT "lead_imports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_runId_fkey" FOREIGN KEY ("runId") REFERENCES "automation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_reports" ADD CONSTRAINT "saved_reports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_ads_conversions" ADD CONSTRAINT "google_ads_conversions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversation_labels" ADD CONSTRAINT "whatsapp_conversation_labels_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversation_labels" ADD CONSTRAINT "whatsapp_conversation_labels_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "whatsapp_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_reminders" ADD CONSTRAINT "whatsapp_reminders_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_events" ADD CONSTRAINT "landing_events_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "landing_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_changes" ADD CONSTRAINT "seo_changes_seoProductId_fkey" FOREIGN KEY ("seoProductId") REFERENCES "seo_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_payments" ADD CONSTRAINT "tenant_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Auditoria imutável: nenhum UPDATE ou DELETE é permitido na tabela, nem pela própria aplicação.
CREATE OR REPLACE FUNCTION audit_logs_block_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs é somente inserção (operação % bloqueada)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_changes();

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_block_changes();

-- Integrações com ERPs (Bling, Tiny, Omie, Linx, CIGAM): produtos copiados, só leitura
CREATE TABLE "erp_products" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "ean" TEXT,
    "brand" TEXT,
    "category" TEXT,
    "ncm" TEXT,
    "unit" TEXT,
    "price" DECIMAL(12,2),
    "stock" DECIMAL(14,3),
    "cost" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "searchText" TEXT NOT NULL DEFAULT '',
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "erp_products_tenantId_provider_code_key" ON "erp_products"("tenantId", "provider", "code");
CREATE INDEX "erp_products_tenantId_provider_removedAt_idx" ON "erp_products"("tenantId", "provider", "removedAt");

-- Integrações com ERP liberadas uma a uma pela plataforma. Quem já tinha o sistema "erp" (no plano ou avulso) mantém
-- o acesso que tinha (Tcar e Trier); a plataforma retira o que a empresa não usa.
ALTER TABLE "tenants" ADD COLUMN "erpIntegrations" TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE "tenants" t SET "erpIntegrations" = ARRAY['tcar', 'trier']
 WHERE 'erp' = ANY(t."extraSystems")
    OR EXISTS (SELECT 1 FROM "plans" p WHERE p."id" = t."planId" AND 'erp' = ANY(p."systems"));

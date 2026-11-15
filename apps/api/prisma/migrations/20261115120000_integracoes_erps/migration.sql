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

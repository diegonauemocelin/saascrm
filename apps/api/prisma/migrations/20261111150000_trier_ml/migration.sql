-- Integração com a Trier (ERP de farmácias): produtos copiados pela API da Trier e publicações no Mercado Livre
-- (rascunho, envio e vínculo produto ↔ anúncio, com preço e estoque seguindo o ERP).
-- CreateTable
CREATE TABLE "trier_products" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "ean" TEXT,
    "name" TEXT NOT NULL,
    "ecommerceName" TEXT,
    "description" TEXT,
    "brand" TEXT,
    "brandCode" INTEGER,
    "department" TEXT,
    "groupName" TEXT,
    "category" TEXT,
    "classification" TEXT,
    "ncm" TEXT,
    "unit" TEXT,
    "price" DECIMAL(12,2),
    "ecommercePrice" DECIMAL(12,2),
    "stock" INTEGER,
    "ecommerceStock" INTEGER,
    "cost" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ecommerce" BOOLEAN NOT NULL DEFAULT false,
    "widthMm" INTEGER,
    "heightMm" INTEGER,
    "depthMm" INTEGER,
    "weightG" INTEGER,
    "typeName" TEXT,
    "typeCode" INTEGER,
    "activeIngredient" TEXT,
    "activeIngredientCode" TEXT,
    "compounded" BOOLEAN NOT NULL DEFAULT false,
    "listType" TEXT,
    "changedAt" TIMESTAMP(3),
    "searchText" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trier_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ml_publications" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'trier',
    "productCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "mode" TEXT NOT NULL DEFAULT 'tradicional',
    "catalogProductId" TEXT,
    "catalogName" TEXT,
    "categoryId" TEXT,
    "categoryName" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "listingType" TEXT NOT NULL DEFAULT 'gold_special',
    "freeShipping" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB NOT NULL DEFAULT '[]',
    "pictures" JSONB NOT NULL DEFAULT '[]',
    "price" DECIMAL(12,2),
    "quantity" INTEGER,
    "itemId" TEXT,
    "permalink" TEXT,
    "error" TEXT,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "desiredPrice" DECIMAL(12,2),
    "desiredQuantity" INTEGER,
    "sentPrice" DECIMAL(12,2),
    "sentQuantity" INTEGER,
    "syncError" TEXT,
    "syncedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ml_publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trier_products_tenantId_ean_idx" ON "trier_products"("tenantId", "ean");

-- CreateIndex
CREATE UNIQUE INDEX "trier_products_tenantId_code_key" ON "trier_products"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ml_publications_tenantId_status_idx" ON "ml_publications"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ml_publications_tenantId_itemId_idx" ON "ml_publications"("tenantId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ml_publications_tenantId_source_productCode_key" ON "ml_publications"("tenantId", "source", "productCode");


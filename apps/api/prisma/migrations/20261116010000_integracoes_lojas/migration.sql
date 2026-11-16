-- Integrações com loja virtual (Tray, Nuvemshop, Loja Integrada) liberadas uma a uma pela plataforma
ALTER TABLE "tenants" ADD COLUMN "ecomIntegrations" TEXT[] DEFAULT ARRAY[]::TEXT[];

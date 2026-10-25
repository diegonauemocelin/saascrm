-- Empresas fictícias de demonstração: ignoradas na cobrança, na receita, nas publicações e no WhatsApp.
ALTER TABLE "tenants" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

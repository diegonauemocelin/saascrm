-- Marca SG Multiconecta na empresa dona da plataforma (instalação já feita). Mantém os outros campos da marca.
UPDATE "tenants" SET "name" = 'SG Multiconecta' WHERE "isPlatform" = true AND "name" = 'sgmulticonecta';

INSERT INTO "tenant_settings" ("id", "tenantId", "key", "value", "updatedAt")
SELECT gen_random_uuid(), t."id", 'branding', '{}'::jsonb, NOW()
FROM "tenants" t
WHERE t."isPlatform" = true
  AND NOT EXISTS (SELECT 1 FROM "tenant_settings" s WHERE s."tenantId" = t."id" AND s."key" = 'branding');

UPDATE "tenant_settings" s
SET "value" = s."value" || '{"appName":"SG Multiconecta","shortName":"SG Multiconecta","primaryColor":"#5b3fd0","brandColor":"#5b3fd0","sidebarColor":"#16133a","loginTitle":"Bem-vindo ao SG Multiconecta","loginSubtitle":"Atendimento omnichannel com IA.","logoPath":"/marca/sg-icone.svg","logoDarkPath":"/marca/sg-icone.svg","faviconPath":"/marca/sg-icone.svg"}'::jsonb,
    "updatedAt" = NOW()
FROM "tenants" t
WHERE s."tenantId" = t."id" AND t."isPlatform" = true AND s."key" = 'branding';

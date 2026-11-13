-- Manual da marca SG Multiconecta (v1.0): atualiza a marca da empresa dona da plataforma, só nos campos que ainda
-- estão com os valores antigos (o que o administrador mudou à mão fica como está).
UPDATE "tenant_settings" s
SET "value" = s."value"
  || CASE WHEN lower(s."value"->>'primaryColor') = '#5b3fd0' THEN '{"primaryColor":"#5B3FD6"}'::jsonb ELSE '{}'::jsonb END
  || CASE WHEN lower(s."value"->>'brandColor') = '#5b3fd0' THEN '{"brandColor":"#5B3FD6"}'::jsonb ELSE '{}'::jsonb END
  || CASE WHEN lower(s."value"->>'sidebarColor') = '#16133a' THEN '{"sidebarColor":"#0F1222"}'::jsonb ELSE '{}'::jsonb END
  || CASE WHEN s."value"->>'loginSubtitle' = 'Atendimento omnichannel com IA.' THEN '{"loginSubtitle":"CRM e atendimento em um só sistema."}'::jsonb ELSE '{}'::jsonb END
  || CASE WHEN s."value"->>'logoDarkPath' = '/marca/sg-icone.svg' THEN '{"logoDarkPath":"/marca/sg-icone-negativo.svg"}'::jsonb ELSE '{}'::jsonb END
  || CASE WHEN s."value"->>'faviconPath' = '/marca/sg-icone.svg' THEN '{"faviconPath":"/marca/sg-favicon.svg"}'::jsonb ELSE '{}'::jsonb END,
  "updatedAt" = now()
FROM "tenants" t
WHERE t."id" = s."tenantId" AND t."isPlatform" = true AND s."key" = 'branding' AND jsonb_typeof(s."value") = 'object';

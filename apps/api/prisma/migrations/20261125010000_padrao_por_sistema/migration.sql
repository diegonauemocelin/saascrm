-- Visual "Por sistema" (nomes Multi) com as telas novas passa a ser o padrão. Empresas que estavam no padrão antigo
-- (Moderno com as telas de sempre) mudam; quem escolheu outro modelo e a escolha de cada usuário ficam como estão.
UPDATE "tenant_settings"
SET "value" = "value" || '{"defaultLayout":"SISTEMAS","defaultScreens":"NOVO"}'::jsonb
WHERE "key" = 'branding'
  AND COALESCE("value"->>'defaultLayout', 'MODERN') = 'MODERN'
  AND COALESCE("value"->>'defaultScreens', 'ATUAL') = 'ATUAL';

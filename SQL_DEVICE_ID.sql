-- Rei da Coxinha: proteção contra subscriptions Push duplicadas por aparelho
-- Execute UMA VEZ no SQL Editor do Supabase.

ALTER TABLE web_push_subscriptions
ADD COLUMN IF NOT EXISTS device_id TEXT;

-- Os registros antigos não possuem device_id confiável.
-- Eles serão recriados automaticamente pelo aplicativo após o próximo login.
DELETE FROM web_push_subscriptions
WHERE destinatario = 'cliente';

-- Um aparelho não pode ter duas subscriptions de cliente.
CREATE UNIQUE INDEX IF NOT EXISTS uq_web_push_cliente_device
ON web_push_subscriptions (device_id)
WHERE destinatario = 'cliente' AND device_id IS NOT NULL;

-- O mesmo endpoint também não pode aparecer duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_web_push_cliente_endpoint
ON web_push_subscriptions (endpoint)
WHERE destinatario = 'cliente' AND endpoint IS NOT NULL;

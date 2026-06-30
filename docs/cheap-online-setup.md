# Setup barato: Vercel + Supabase + VPS con sync

Objetivo: mantener la web online gratis o casi gratis, ejecutar el scanner largo fuera de Vercel, guardar primero en local y sincronizar solo los datos útiles con Supabase.

## Arquitectura

- Vercel: web, formularios, preferencias, confirmación, bajas y panel ops.
- Supabase: suscriptores, preferencias, deals y snapshots ya filtrados.
- VPS barato: scanner de 11 horas.
- Disco local del VPS: resultados pendientes y logs.

## Variables

En Vercel:

```text
NEXT_PUBLIC_SITE_URL=https://tu-dominio.com
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPS_BASIC_AUTH_USER=...
OPS_BASIC_AUTH_PASSWORD=...
RESEND_API_KEY=...
RESEND_FROM_EMAIL=...
RESEND_REPLY_TO_EMAIL=...
CRON_SECRET=...
UNSPLASH_ACCESS_KEY=...
```

En el VPS, en el archivo `.env` del proyecto:

```text
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SCANNER_STORAGE_MODE=local
SCANNER_CURRENCY=EUR
SCANNER_REVIEW_RATIO=0.72
SCANNER_FLASH_RATIO=0.6
SCANNER_HISTORY_WINDOW=180
```

`SCANNER_STORAGE_MODE=local` es importante: obliga al scanner a guardar primero en `scanner/state.json`, aunque existan claves de Supabase.

## Comandos del VPS

Instalar dependencias del scanner:

```bash
cd scanner
uv sync
```

Ejecutar scanner local y sincronizar después:

```bash
../scripts/run-vps-scanner-with-sync.sh
```

Solo sincronizar datos pendientes:

```bash
cd scanner
uv run luxflight-scan --sync-local-to-supabase --json
```

Probar con pocos datos:

```bash
cd scanner
uv run luxflight-scan --limit 1 --json
uv run luxflight-scan --sync-local-to-supabase --sync-limit 1 --json
```

## Programarlo en el VPS

Ejemplo con cron diario a las 02:15 del servidor:

```cron
15 2 * * * cd /ruta/a/Luxcheapflights && ./scripts/run-vps-scanner-with-sync.sh >> logs/vps-cron.log 2>&1
```

Si el sync falla, no se pierden datos: quedan en `scanner/state.json` y el siguiente sync reintenta.

## Qué se sincroniza

El sync sube:

- snapshots locales pendientes
- deals locales pendientes cuando su snapshot ya está en Supabase

Cada item queda marcado con `sync.supabase_id` y `sync.synced_at` en `scanner/state.json`, para evitar duplicados en siguientes ejecuciones.

## GitHub Actions

El workflow del scanner queda solo manual. La ejecución programada debe vivir en el VPS para evitar límites y costes de GitHub Actions con un scanner de 11 horas.

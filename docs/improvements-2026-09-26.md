# Mejoras implementadas el 26 de septiembre de 2026

## Dependencias

Next.js pasa de 15.5.14 a 15.5.26. El lockfile actualiza las dependencias transitivas y fija PostCSS mediante un override compatible de la serie 8.5. El override debe revisarse cuando Next incluya directamente una versión corregida. `npm audit` devuelve cero avisos.

El escáner usa `flights>=0.9.0,<0.10` y un nuevo `uv.lock`. La actualización elimina numerosas dependencias transitivas que ya no necesita el proveedor. `pip-audit` no encuentra vulnerabilidades conocidas en los paquetes publicados; el paquete local del proyecto no se audita contra PyPI. Se verificaron las importaciones y las firmas reales de `SearchFlights.search` y `SearchDates.search`, además de las 60 pruebas del escáner. GitHub Actions instala con `uv sync --frozen`.

Referencias oficiales: [aviso AVIF de Next.js](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), [avisos de PostCSS](https://github.com/postcss/postcss/security/advisories).

## Acceso a Operaciones

`lib/ops-auth.ts` contiene la regla compartida de autorización. Ambos valores `OPS_BASIC_AUTH_USER` y `OPS_BASIC_AUTH_PASSWORD` son obligatorios, también en desarrollo. La ausencia de cualquiera de ellos deniega el acceso. El middleware protege páginas y API; las rutas, páginas, layout y acciones comprueban la autorización también en el servidor. Las respuestas 401 impiden almacenamiento en caché.

## Paginación del buscador

`/api/public-deals/search` acepta `offset` y un máximo de 200 elementos por petición. Devuelve `nextOffset`, que es `null` al terminar. Los empates de ordenación se resuelven por identificador. El hook `components/public-deals/use-public-deals-search.ts` acumula páginas, cancela solicitudes al cambiar filtros y ofrece reintento si falla la carga. El tamaño visible puede reducirse sin volver a descargar páginas.

Prueba en navegador con una fuente local simulada: 10 → 200 → 280 ofertas, 280 tarjetas y desaparición del botón «Mostrar más». Filtrar por lunes reduce el conjunto a 40; cambiar el tamaño y volver a 10 muestra exactamente 10 tarjetas. Las ofertas simuladas solo existen en el directorio temporal de verificación.

## Resumen semanal

- Tipo de campaña `weekly`, destinado a `weekly_best_of` y compatible con las demás frecuencias elegidas por el suscriptor.
- Hasta seis destinos por destinatario, seleccionados después de aplicar sus preferencias. Incluye ofertas revisadas o enviadas de los últimos siete días, con verificación reciente y salida futura. No reactiva ofertas caducadas ni cambia el estado de las ofertas para el envío diario.
- Asunto, cabecera e introducción semanales en seis idiomas.
- Control independiente de activación, previsualización, correo de prueba y envío manual en Operaciones.
- Ejecución prevista los lunes a la hora local configurada en Operaciones, por defecto 09:05 Europe/Luxembourg. El workflow consulta cada hora en el minuto 27 y recupera un envío pendiente durante la misma semana.
- Una reserva persistente por lunes congela la selección. Cada destinatario usa una clave `lux-weekly-<lunes>-<id>` y conserva la confirmación del proveedor. La ejecución manual tampoco duplica una semana ya completada. Las bajas y cambios de frecuencia se vuelven a comprobar antes de los reintentos.
- Los resultados ambiguos del proveedor fuera de la ventana segura de 23 horas requieren conciliación, igual que el resumen diario; no se reenvían automáticamente.

### Activación en producción

La implementación y las pruebas son locales. No se han enviado correos reales, aplicado migraciones remotas ni publicado código.

1. Aplicar las migraciones previas pendientes, incluida `20260910120000_scheduled_digest_idempotency.sql`, y después `supabase/migrations/20260925100000_weekly_digest.sql`. La nueva migración es repetible, conserva la configuración diaria y restringe las tablas privadas a `service_role`.
2. Publicar únicamente mediante commit/push y la integración Git de Vercel, según `AGENTS.md`. El workflow semanal debe estar en la rama predeterminada de GitHub para ejecutarse por horario.
3. Confirmar que están configurados `APP_BASE_URL` y `CRON_SECRET` en GitHub Actions, y Supabase, Resend, `CRON_SECRET` y las dos variables de autenticación de Operaciones en la aplicación.
4. Revisar la previsualización y el control semanal en `/ops/email-campaigns`. El nuevo control semanal queda desactivado por defecto en la migración; actívalo desde Operaciones después de revisar la previsualización. Si la migración ya se aplicó con el valor anterior, el ajuste existente no cambia.

## Confirmaciones, bajas y errores públicos

Los enlaces `/confirm` y `/unsubscribe` muestran formularios. Solo las acciones POST explícitas confirman o cancelan la suscripción. Consultar `/preferences` o su API no confirma un correo pendiente. Los formularios validan el token y mantienen las operaciones idempotentes; una confirmación antigua no reactiva una baja.

JSON mal formado, vacío, `null`, cadenas o arrays se rechazan con 400 en alta y preferencias. Los errores de almacenamiento devuelven mensajes públicos genéricos; los detalles del servidor no se incluyen en la respuesta.

## Organización

`lib/ops.ts` y `components/public-deals-explorer.tsx` conservan sus puntos de entrada públicos. La implementación se separa en `lib/ops/` y `components/public-deals/`: datos públicos, enriquecimiento, audiencia, campañas, consultas, salud del escáner, tarjetas, filtros, formatos, iconos y modal. Los consumidores importan directamente los módulos necesarios. La extracción no introduce ciclos entre módulos de ejecución.

Las siete hojas grandes de CSS pasan a 36 módulos ordenados en `app/styles/`. Concatenarlos reproduce exactamente los 27.894 renglones originales, incluidos los overrides y las reglas responsive. Véase `app/styles/README.md`.

## Verificación

- 60 pruebas JavaScript: autenticación, paginación, formularios, selección semanal, envío simulado, reintentos, migración SQL y pruebas existentes.
- 60 pruebas Python aprobadas.
- TypeScript sin errores y compilación de producción con Next.js 15.5.26.
- 14 comprobaciones HTTP locales: 401 en rutas privadas y cron, 400 para JSON/offset incorrectos, confirmación y baja mediante formularios.
- Comprobación visual de la confirmación y prueba funcional del buscador con 280 ofertas simuladas.
- Durante una actualización en caliente del entorno de prueba apareció un error de reutilización del contenedor Leaflet; una recarga completa lo resolvió. No se observó durante el recorrido normal de paginación y filtros.

Comandos reproducibles:

```sh
npm ci
npm audit
npm run typecheck -- --incremental false
npm test
npm run build
cd scanner
uv sync --frozen
.venv/bin/python -m unittest discover -s tests -v
```

`pip-audit --path <site-packages-del-entorno>` debe apuntar al entorno Python real que haya creado `uv`.

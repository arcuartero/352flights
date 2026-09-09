# Envío de paquetes a Creatello

352 Flights puede enviar selecciones manuales y tres paquetes automáticos diarios a la bandeja **Datos recibidos** de Creatello. Los paquetes no incluyen imágenes, renderizado ni instrucciones de publicación. Los automáticos incluyen una plantilla sugerida, pero Creatello no crea el borrador hasta que el usuario lo confirma.

## Envío automático diario

Vercel llama a `GET /api/cron/creatello-daily` todos los días a las `07:15 UTC`. La ruta exige `Authorization: Bearer <CRON_SECRET>`; Vercel añade esta cabecera automáticamente cuando `CRON_SECRET` existe en producción. También admite `POST` con la misma autenticación para una ejecución operativa manual.

En cada fecha de Luxemburgo se prepara como máximo un paquete para cada plantilla:

- `flight-deals-352`
- `travel-offer`
- `cheap-flights-tiktok`

El tamaño se elige de forma pseudoaleatoria entre 3, 4 y 5, pero es determinista para `fecha + plantilla`; por ello un reintento conserva el mismo tamaño. Solo se consideran tarifas publicables de LUX, comprobadas dentro de las 24 horas anteriores al corte diario y con salida futura.

La selección reserva en Supabase tanto el snapshot como el `itineraryKey`. No se repite una oferta ya enviada en otro paquete ni otro día, y tampoco se repite destino entre los tres paquetes del mismo día. Se priorizan las ofertas de menor precio y, en empate, las más recientes. Si no hay al menos tres ofertas completas y compatibles para una plantilla, esa plantilla se omite y el cron devuelve un estado no exitoso para que el fallo sea visible; nunca rellena campos inventados.

Las reservas y el payload exacto se conservan en `creatello_daily_deliveries` y `creatello_daily_delivery_offers`. Un reintento reutiliza el payload guardado y la idempotencia de Creatello devuelve el mismo registro.

## Uso desde el panel

1. Abre `/ops/tiktok-json` e inicia sesión con las credenciales de Ops.
2. Pide propuestas y selecciona entre 1 y 20 ofertas.
3. Elige el idioma del contenido. En el flujo manual, la plantilla solo afecta a la vista previa local y no se envía.
4. Pulsa **Enviar datos a Creatello**.
5. Un mensaje muestra el UUID creado por Creatello o indica que el mismo paquete ya existía.

El navegador solo llama a `POST /api/ops/creatello-inbox`, protegido por la autenticación Basic existente. La clave HMAC nunca se entrega al cliente.

## Configuración privada de 352 Flights

```env
CREATELLO_CONTENT_INBOX_URL=https://<dominio-creatello>/api/content-inbox
CREATELLO_CONTENT_INBOX_HMAC_SECRET=<mismo-secreto-aleatorio-de-al-menos-32-caracteres>
CRON_SECRET=<secreto-aleatorio-para-las-rutas-cron>
```

El secreto debe coincidir con `CONTENT_INBOX_HMAC_SECRET` en Creatello. El ID de workspace solo se configura en Creatello mediante `CONTENT_INBOX_WORKSPACE_ID`; 352 Flights no lo conoce ni lo envía.

## Flujo de servidor a servidor

`POST /api/ops/creatello-inbox` recibe únicamente:

```json
{
  "selectedOfferIds": [59497, 59491],
  "language": "es",
  "revision": 1
}
```

El servidor vuelve a leer esas ofertas desde Supabase, comprueba que sigan siendo publicables, construye el contrato v1, lo serializa una sola vez y envía el cuerpo exacto a Creatello con:

- `Content-Type: application/json`
- `X-Creatello-Timestamp: <Unix seconds>`
- `X-Creatello-Signature: sha256=<HMAC-SHA256(timestamp.rawBody)>`

La petición caduca a los 15 segundos. No se registran el secreto, la firma ni el cuerpo completo. Los envíos automáticos añaden `targetTemplate` (`travel-offer`, `cheap-flights-tiktok` o `flight-deals-352`) como recomendación para la bandeja.

## Identidad e idempotencia

El `externalId` se deriva de forma determinista del idioma y del orden de los IDs seleccionados. `eventId` también es estable para ese `externalId + revision`, y `createdAt` usa la comprobación más reciente del conjunto. Por tanto, volver a pulsar enviar sin cambiar la selección genera el mismo cuerpo y Creatello devuelve el mismo registro.

Para cambiar el contenido de una identidad existente debe incrementarse `revision`. La interfaz crea identidades nuevas al cambiar la selección y usa revisión 1; el endpoint interno admite una revisión explícita para futuras herramientas.

## Mapeo al contrato v1

- `sourceSnapshotId`: ID del snapshot de precio.
- `itineraryKey`: hash estable de ruta, fechas y aerolínea.
- Fechas: `YYYY-MM-DD`.
- Precio: entero en unidades menores (`42100` representa 421 EUR).
- Moneda: código ISO de tres letras.
- Pasajeros y cabina: se leen de la URL original de búsqueda; no se presuponen.
- Escalas: máximo real entre ida y vuelta, leído de `outbound_stop_count` y `return_stop_count`.
- País: se añade cuando el aeropuerto existe en el catálogo local.
- Horarios: se añaden si están presentes en el snapshot, en formato local `HH:mm`.
- `checkedAt`: timestamp de la comprobación del snapshot.
- `expiresAt`: 24 horas después de `checkedAt`, que es la política de frescura pública actual de 352 Flights.
- `sourcePageUrl`: URL pública original de Skyscanner.

Las duraciones no se calculan a partir de horarios locales de aeropuertos distintos. El scanner guarda `outbound_duration_minutes` y `return_duration_minutes` usando las duraciones proporcionadas por el proveedor; solo esos valores fiables habilitan el paquete automático `flight-deals-352`. `travel-offer` y `cheap-flights-tiktok` no los requieren.

## Respuestas del endpoint interno

Creado (`201`) o repetido idempotente (`200`):

```json
{
  "ok": true,
  "inboxItem": {
    "id": "uuid-en-creatello",
    "externalId": "editorial:hash",
    "status": "new"
  },
  "idempotent": false
}
```

Errores locales de petición devuelven `400`, falta de configuración `503` y fallos de entrega/verificación `502`. El detalle es apto para la interfaz de Ops y no contiene secretos.

## Contrato completo de Creatello

La fuente canónica está en `shared/content-inbox-contract.js` del proyecto Creatello y la documentación de recepción en `docs/content-inbox.md`. Creatello limita cada paquete a 20 ofertas y 256 KiB.

## Puesta en marcha

1. Aplicar `supabase/migrations/20260909090000_creatello_daily_deliveries.sql` en el Supabase de 352 Flights.
2. Confirmar en producción `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CREATELLO_CONTENT_INBOX_URL`, `CREATELLO_CONTENT_INBOX_HMAC_SECRET` y `CRON_SECRET`.
3. Desplegar primero Creatello (para que acepte `targetTemplate`) y después 352 Flights.
4. Actualizar el código del scanner que corre en el VPS y ejecutar al menos un escaneo; los snapshots anteriores no contienen las duraciones fiables nuevas.
5. Ejecutar una vez `POST /api/cron/creatello-daily` con la cabecera Bearer para validar el flujo. Repetirlo el mismo día no crea paquetes nuevos.

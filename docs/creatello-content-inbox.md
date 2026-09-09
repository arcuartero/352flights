# Envío de paquetes a Creatello

352 Flights puede enviar una selección manual de ofertas a la bandeja **Datos recibidos** de Creatello. El paquete es neutral: no incluye plantilla, imágenes, renderizado ni instrucciones de publicación.

## Uso desde el panel

1. Abre `/ops/tiktok-json` e inicia sesión con las credenciales de Ops.
2. Pide propuestas y selecciona entre 1 y 20 ofertas.
3. Elige el idioma del contenido. La plantilla solo afecta a la vista previa local y no se envía.
4. Pulsa **Enviar datos a Creatello**.
5. Un mensaje muestra el UUID creado por Creatello o indica que el mismo paquete ya existía.

El navegador solo llama a `POST /api/ops/creatello-inbox`, protegido por la autenticación Basic existente. La clave HMAC nunca se entrega al cliente.

## Configuración privada de 352 Flights

```env
CREATELLO_CONTENT_INBOX_URL=https://<dominio-creatello>/api/content-inbox
CREATELLO_CONTENT_INBOX_HMAC_SECRET=<mismo-secreto-aleatorio-de-al-menos-32-caracteres>
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

La petición caduca a los 15 segundos. No se registran el secreto, la firma ni el cuerpo completo.

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

Las duraciones no se calculan a partir de horarios locales de aeropuertos distintos porque eso produciría datos incorrectos sin zonas horarias. Mientras el scanner no guarde duraciones fiables, Creatello indicará que falta ese campo al intentar usar `flight-deals-352`. `travel-offer` y `cheap-flights-tiktok` no lo requieren.

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

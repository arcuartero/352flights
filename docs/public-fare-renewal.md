# Renovación de ofertas públicas

Las ofertas públicas conservan una vigencia de siete días desde su comprobación real. A partir del sexto día el escáner vuelve a consultar el mismo itinerario. Un resultado confirmado permite mostrar el precio nuevo —también si sube— únicamente cuando sigue al menos un 12 % por debajo de la referencia. El nuevo snapshot conserva el historial anterior e inicia otros siete días.

El requisito del 12 % se aplica al entrar en renovación y permanece asociado al itinerario. Las ofertas nuevas conservan las reglas originales de selección. Una consulta ordinaria realizada dentro de la ventana de renovación también aplica el requisito; no es necesario esperar al trabajo específico.

La referencia es la mediana de hasta 180 observaciones comparables del patrón y mes. Si no hay ocho observaciones, se usa el mismo patrón en otros meses. Se excluyen la observación evaluada y las copias de una misma subida local; moneda, cabina, pasajeros y escalas deben coincidir. El precio y la referencia se comparan en céntimos. Sin ocho observaciones o con descuento inferior al 12 %, la oferta se retira.

## Comprobaciones y errores

- Se comparan aeropuertos, fechas, aerolíneas, horarios, escalas y contexto de búsqueda. Actualmente el proveedor del escáner busca un adulto en económica; otros contextos quedan pendientes, nunca se sustituyen por esos valores.
- Una consulta limitada a 50 resultados que no devuelve el mismo vuelo no demuestra que haya desaparecido. Se registra como inconclusa, al igual que un timeout, bloqueo o error del proveedor.
- Los intentos inconclusos se repiten después de una hora. No cambian `observed_at` ni `expires_at`. Al vencer, el precio se oculta sin período de gracia. Una comprobación válida que termine después del vencimiento puede publicarlo de nuevo con su hora real de comprobación.
- Las reservas duran quince minutos. La finalización exige el token y el snapshot esperado; un escaneo más reciente invalida el trabajo anterior. Una escritura con respuesta incierta no se reenvía como una observación nueva.

## Datos y caché

`public_fare_lifecycle` mantiene la observación vigente, la decisión, el vencimiento, los reintentos y la reserva. Un trigger en `price_snapshots` incorpora también las comprobaciones del escáner ordinario, con independencia de que lleguen por sincronización local o escritura directa. Los snapshots antiguos no se borran.

`public_current_fare_snapshots` es la vista privada que alimenta portada, buscador y destinos cuando está habilitada la función. Una comprobación negativa impide reutilizar un precio anterior más barato. Los datos de las ofertas pueden permanecer en caché, pero su vigencia se contrasta con la vista antes de responder. Si han cambiado se recargan; si no se puede consultar el estado se devuelve una lista vacía. No se usa el respaldo antiguo en ese caso.

Las páginas pasan a renderizar los datos por petición y la API del buscador no utiliza caché de CDN. Esto añade lecturas de vigencia, agrupadas en bloques de 200 IDs, pero evita mostrar retiradas o vencimientos desde el HTML almacenado. Las invalidaciones fallidas quedan marcadas mediante `cache_dirty` para reintentarlas; un acuse antiguo no borra una invalidación nueva.

Creatello mantiene su contrato y su vencimiento independiente de 24 horas. Los paquetes ya enviados no se actualizan con este mecanismo.

## Activación, pendiente de autorización de producción

1. Ejecutar las pruebas y revisar el diff preservando los cambios locales existentes.
2. Aplicar `supabase/migrations/20260911120000_public_fare_renewal.sql`. Inicializa únicamente observaciones de los últimos siete días, eligiendo la más reciente y conservando sus fechas. Las tablas, vistas y RPC de renovación solo son accesibles al servidor.
3. Publicar el código mediante commit/push e integración Git de Vercel, sin despliegue manual adicional. Mantener `PUBLIC_FARE_REVALIDATION_ENABLED=false` hasta que la migración y el escáner estén preparados.
4. Actualizar el código del VPS y configurar `PUBLIC_FARE_REVALIDATION_ENABLED=true` en su `.env`, junto a las credenciales existentes de Supabase. Configurar `PUBLIC_CACHE_REVALIDATION_URL=https://www.352flights.com/api/public-deals/revalidate`.
5. Instalar el temporizador con `sudo bash scripts/install-vps-fare-renewal-systemd.sh`. Se ejecuta cada hora al minuto 10, con hasta 60 segundos de dispersión. Reutiliza el bloqueo del escáner de precios. Cuando hay un escaneo largo, ese proceso atiende renovaciones entre patrones, hasta cinco por pasada, con un intervalo mínimo de un minuto.
6. Activar `PUBLIC_FARE_REVALIDATION_ENABLED=true` también en la web mediante el siguiente despliegue autorizado por Git. Revisar precios, fecha de comprobación y retiradas en portada, buscador y un destino.

La activación y los cambios de configuración de producción no forman parte de la preparación local. Para desactivar temporalmente la función, retirar el temporizador y apagar la bandera requiere volver al comportamiento anterior; no es una forma de conservar las garantías de retirada.

## Ejecución y validación

```sh
uv run --project scanner luxflight-scan --revalidate-public-fares --json
uv run --project scanner luxflight-scan --revalidate-public-fares --limit 5 --json
uv run --project scanner python -m unittest discover -s scanner/tests
npm test
npx tsc --noEmit --incremental false
```

El comando específico es explícito y funciona aunque la bandera del escaneo habitual esté apagada. Requiere la migración y credenciales. Procesa como máximo 200 trabajos por defecto o 45 minutos, respetando los límites del proveedor. También está disponible en GitHub Actions mediante **Recheck Public Fares**, solo con ejecución manual.

Los informes JSON registran `checked`, `renewed`, `updated` (subconjunto de renovadas con cambio de precio), `retired`, `pending`, `superseded`, los motivos y el estado de invalidación de caché. Consultar `journalctl -u 352flights-fare-renewal.service` y los logs del wrapper del VPS. Una acumulación de pendientes próximos a vencer requiere revisar el proveedor, el temporizador y la capacidad de procesamiento; no ampliar sus fechas de comprobación.

Las pruebas ejecutan la migración, triggers y RPC en PostgreSQL embebido, incluyendo sustitución de precios, retiradas, reservas, escrituras obsoletas, permisos y arranque inicial. Una prueba utiliza respuestas simuladas del proveedor con los constructores reales de Python y lleva el resultado hasta la vista pública. No consulta proveedores ni bases de datos de producción. El entorno embebido serializa conexiones; prueba las condiciones de carrera por intercalado, no el rendimiento de varias conexiones de producción.

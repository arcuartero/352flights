# Optimización Vercel Hobby — 352flights

Cambios locales preparados el 10 de septiembre de 2026. Next.js instalado: **15.5.14**. No se ha hecho commit, push, Preview ni despliegue de producción. No se han eliminado despliegues ni cambiado ajustes de la cuenta o secretos. El cambio previo de `tsconfig.tsbuildinfo` se conserva con sus bytes originales.

**Migración aplicada y verificada en Supabase el 10 de septiembre de 2026**, por autorización posterior del usuario. `20260910120000_scheduled_digest_idempotency.sql` se ejecutó en una transacción y quedó registrada en `supabase_migrations.schema_migrations` del proyecto `byehmkysjqrhpdrtdkjk`. Se verificaron RLS, restricciones únicas, denegación de acceso a `anon`/`authenticated` y acceso de la aplicación mediante PostgREST (200 en las dos tablas y la columna nueva). Las pruebas de reserva duplicada y confirmación se ejecutaron con `service_role` y terminaron con `ROLLBACK`, sin registros residuales ni correos. Evidencia: [supabase-migration-verification.json](./supabase-migration-verification.json).

## Causas y solución

| Consumo | Evidencia | Cambio |
| --- | --- | --- |
| Invocaciones y CPU de `/ops` | Cabecera con dos consultas al scanner cada 10 s; widgets cada 7 s; descubrimiento cada 10–15 s; historial de precios cada 15 s y fechas cada 4 s. Algunos consumidores seguían montados fuera de pantalla. | Un coordinador por pestaña agrupa recursos visibles en `/api/ops/status`. Una invocación cada 60 s en reposo; 7,5 s si hay un escaneo o comando pendiente. Respuestas reutilizadas, sin solapamientos, con aborto al ocultar/desconectar y timeout de 25 s. |
| Trabajo repetido dentro de las funciones | Los dos endpoints de descubrimiento llaman a `getPatternDiscoveryStatus()`. La consulta del progreso de precios reconciliaba la BD en cada lectura. | El agregado resuelve descubrimiento una vez por petición. Reconciliación trasladada al mantenimiento horario. Los detalles de historiales cerrados dejan de refrescarse automáticamente. |
| Cron costoso | El digest ejecutaba reconciliación, carga del dashboard para alertas y comprobación del envío cada 15 min. La hora admite cambios desde `/ops`. | Digest a los 17 minutos de cada hora; mantenimiento separado a los 43. Se conservan `workflow_dispatch` y `CRON_SECRET`. Creatello conserva sus dos cron originales. |
| Renderizado público | Ya existía `unstable_cache` de 30–60 min, pero `searchParams` se leía en servidor y convertía las páginas en dinámicas. Había headers públicos duplicados en middleware y configuración. | Filtros de URL en una pequeña frontera cliente bajo Suspense; ofertas, enlaces y JSON-LD siguen en servidor. Buscador estático y destinos/localizaciones con ISR bajo demanda. `React.cache` deduplica lecturas dentro del render. |
| Transferencia | Imágenes enormes, HTML público dinámico y sitemap sin header CDN explícito. | WebP para web, JPEG optimizados para email, ISR con frescura de 30 min y SWR de 30 min; sitemap con header CDN equivalente. Se elimina middleware de las rutas públicas. |
| Storage y despliegues | Siete imágenes sin uso sumaban unos 19,6 MiB. El mismo commit se desplegaba por Git y por CLI/Codex. | Eliminación recuperable por Git, compresión de imágenes utilizadas, `.vercelignore` y política de despliegue Git único en `AGENTS.md`. |

La pausa por visibilidad usa `IntersectionObserver`, `document.hidden` y `navigator.onLine`. Se aplica también al panel móvil del hub cuando está cerrado; sus hijos no generan polling mientras no intersectan la pantalla. La caché de estado es solamente memoria de esa pestaña: no usa almacenamiento persistente ni CDN. Varias pestañas visibles son coordinadores independientes; el presupuesto de 60/h se refiere a una pestaña estable.

## Digest y reintentos

El primer intento reserva atómicamente una instantánea diaria de audiencia y ofertas. Las selecciones de rutas se serializan a arrays y se reconstruyen como Sets al leerlas. Cada destinatario tiene una clave estable por fecha de Luxemburgo; su petición exacta y el identificador confirmado de Resend se guardan permanentemente. Un reintento reutiliza el cuerpo original aunque cambien las ofertas. Un fallo entre aceptación por Resend y escritura en Supabase puede reintentarse con la misma clave.

El estado `last_digest_sent_on` solo se actualiza cuando no hay entregas fallidas. `force=1` permite ignorar hora/habilitación, pero nunca omite el bloqueo de un día ya enviado. El botón de envío manual de digest de `/ops` usa este mismo camino; los emails de prueba y flash conservan sus flujos. Un envío parcial conserva las ofertas para los destinatarios pendientes. Antes de cada ejecución se vuelve a comprobar que los destinatarios siguen activos, confirmados y con onboarding completado. Los informes de entregas usan una clave propia para no duplicar filas en los reintentos.

Resend conserva las claves de idempotencia durante 24 h. Por prudencia, un resultado ambiguo sin confirmación persistida deja de reenviarse automáticamente a las 23 h: requiere reconciliar el identificador en Resend antes de continuar. Las entregas confirmadas siguen deduplicadas después de ese plazo. No se promete entrega exactamente una vez mediante una simple marca de fecha. [Documentación de Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).

Las tablas nuevas contienen datos privados y enlaces personales: RLS habilitado, sin permisos para `PUBLIC`, `anon` o `authenticated`, y acceso explícito solo para `service_role`. La migración no elimina datos existentes; añade dos tablas y una columna única nullable en `email_deliveries`.

La comprobación horaria admite cualquier hora/minuto configurados y puede enviar hasta unos 60 min más tarde, más el retraso propio de GitHub Actions. El cálculo de fecha/hora sigue usando Europe/Luxembourg, incluyendo los cambios estacionales. Los reintentos automáticos son horarios durante ese día; un pendiente que cruce medianoche requiere revisión operativa, no se vuelve a enviar indiscriminadamente al día siguiente.

## Comparación local

Tamaños asignados por `du -sk`, inmediatamente tras cada build y antes de generar destinos ISR durante la navegación. MiB = 1024 KiB.

| Directorio | Antes | Después | Diferencia |
| --- | ---: | ---: | ---: |
| `public` | 23.23 MiB | 1.96 MiB | −91.6% |
| `.next/server` | 13.26 MiB | 12.77 MiB | −3.7% |
| `.next/static` | 2.71 MiB | 2.73 MiB | +0.6% |

| Imagen | Antes | Después | Dimensiones |
| --- | ---: | ---: | --- |
| Fondo de ofertas, JPEG → WebP | 1,263,082 B | 547,256 B | 5632 × 2816 |
| Ilustración 404, PNG → WebP | 891,883 B | 88,998 B | 1254 × 1254 |
| `app/icon.png` | 543,674 B | 140,390 B | 1254 × 1254 |
| `email-airplane-window.jpg` | 318,582 B | 174,523 B | 900 × 1350 |
| `email-alerts-airport.jpg` | 91,235 B | 50,729 B | 450 × 600 |

Se revisaron referencias en código, CSS, email, metadatos y construcciones de rutas. La referencia a cabin-3 en un Lighthouse histórico es documentación de una versión anterior, no una dependencia actual. Los siete archivos sin uso estaban versionados y se pueden recuperar con Git. Las comparaciones visuales de las imágenes web conservan composición, transparencia y dimensiones.

Las trazas `.nft.json` iniciales y finales no incluyen `scanner/`, `docs/`, `test/`, `logs/` o `.git/`. `data/lux-routes.json` permanece disponible. Python se ejecuta en Mac, VPS o GitHub Actions; los handlers de Vercel consultan Supabase/el agente remoto y no importan su paquete Python. El fallback local sigue disponible en el checkout, al que `.vercelignore` no afecta. No se añade `outputFileTracingExcludes`: no hay evidencia que justifique excluir dependencias de funciones. Sharp/libvips y el WASM de imágenes OG sí tienen uso. Las trazas locales son macOS/ARM y no equivalen al almacenamiento facturado en Linux/Vercel.

| Ruta | Antes | Después |
| --- | --- | --- |
| `/deals/search` | Dinámica | Estática, ISR 30 min |
| `/deals/[city]` | Dinámica | ISR bajo demanda, 30 min |
| `/[locale]/[...segments]` | Dinámica | ISR bajo demanda, 30 min |
| `/sitemap.xml` | Estática, 30 min | Estática, 30 min + CDN explícita |
| `/ops`, confirmaciones, bajas, preferencias | Dinámicas | Dinámicas, privadas |

La tabla del build pasa de 9 rutas `○`, 1 `●` y 49 `ƒ` a 10 `○`, 3 `●` y 47 `ƒ`: se convierten tres familias públicas y se añade una API privada dinámica. Los destinos no se materializan todos en cada build, evitando multiplicar los artefactos por seis idiomas. Sus primeras visitas realizan trabajo de origen; las siguientes reutilizan ISR. Next controla los headers HTML/RSC y su expiración con `expireTime: 3600`. [Referencia oficial](https://nextjs.org/docs/app/api-reference/config/next-config-js/expireTime).

La etiqueta de ofertas de portada se invalida junto a búsqueda/destino. Se separa el fallback de búsqueda del de portada para evitar devolver accidentalmente un catálogo limitado a destacados cuando falle Supabase. No se añade caché a datos privados.

## Despliegues duplicados: evidencia verificable

Commit `a994f1f3323c30b6bdae3b7a532f4b850a69da0f`:

- `dpl_63P9gzSH85mpN5ytUEQVCe4aw4Yt`: `source: git`, producción.
- `dpl_ETTUYvEapr43q7uSgfrfSUEGkRQN`: `source: cli`, `actor: codex`, producción, 42,59 s después.

Los metadatos de otros commits muestran el mismo patrón. Los workflows del repositorio solo invocan scanner/digest; no contienen comandos de despliegue. La causa confirmada es la segunda invocación de CLI desde Codex, no un workflow GitHub duplicado. `AGENTS.md` exige usar la integración Git como único mecanismo y prohíbe añadir `vercel deploy`, Deploy Hook o API después de un push.

No hay que desactivar la integración Git de Vercel para resolver este caso. Debe dejar de ejecutarse el despliegue adicional desde agentes/CLI. La consulta del conector no expone el inventario completo de Deploy Hooks e integraciones, por lo que no atribuyo a un hook una causa no observada. Si hay automatizaciones externas adicionales, revisar **Project → Settings → Git → Deploy Hooks**, e inhabilitar el emisor o eliminar únicamente el hook que se confirme redundante; revisar también las integraciones con permiso de despliegue. No se ha cambiado ninguno de esos ajustes.

## Verificación y límites

- `npm run typecheck`: correcto.
- `npm test`: **18/18**. Incluye 60 invocaciones/hora simulada con seis recursos, consumidores repetidos, reuso al remontar, cambios activo/reposo, pausa/reanudación, abortos, ausencia de solapamiento, errores de red y deduplicación de emails ante concurrencia/fallo de escritura.
- `npm run build`: correcto, sin errores. Referencia inicial y resultado final adjuntos.
- Navegación HTTP: portada en seis idiomas, destino Milan en seis idiomas, buscador, sitemap y 404 responden correctamente. Canonical y siete alternates de destino se mantienen; la base local usa el valor/default local de `getSiteUrl`, sin cambiar secretos. El buscador mantiene su política SEO previa; no se han inventado alternates nuevos. Los filtros de URL se aplican tras la hidratación: sin JavaScript se ve el catálogo inicial, no el resultado filtrado de esa URL.
- Navegador: cero errores en la sesión final. Estado activo simulado: intervalos medidos de 7,51–7,52 s; reposo: 60,01–60,02 s. Cambio real a otra pestaña durante 152,4 s: el contador permanece en 7; vuelve a consultar al regresar. Offline durante 55 s: el contador permanece en 9; reanuda al conectar.
- Navegador: portada, buscador con `trip=weekend&budget=80&direct=0&sort=price_asc`, y destino francés con filtros. Se conserva el estado de URL al hidratar. El enlace `/deals/milan?fare=fare-60245` conserva la tarifa y abre su diálogo. Los buscadores en los seis idiomas responden 200 con caché de 30 min. La prueba detectó y corrigió un `Illegal invocation` de Chrome en el adaptador de timers.
- `/ops` sin credenciales: 401. Páginas de scanner con credenciales sintéticas del servidor local: 200. Los tres recursos de estado responden 200 dentro del agregado. No se ha usado una contraseña real en la salida.
- Preferencias, confirmación, baja, `/api/ops` y cron conservan `private, no-store`; rechazos de cron sin `CRON_SECRET`: 401. API pública: `Vercel-CDN-Cache-Control: public, s-maxage=1800, stale-while-revalidate=1800`.
- En móvil (390 × 844), con el hub cerrado solo se solicita `scanner-status` para el botón visible; los recursos de descubrimiento ocultos no aparecen. Se verifica la apertura y cambio de pestaña del hub. La navegación adicional a `/ops/prices` resultó lenta y se canceló; no se valida aquí su rendimiento integral.
- No se envían emails reales, no se dispara un escaneo y no se ejecutan crons de Creatello. Sus flujos externos no se validan en vivo. El scanner Python no se modifica.
- Migración validada contra la BD real: la segunda reserva conserva el primer payload, la confirmación se guarda y el rollback elimina los datos de prueba. Quedan pendientes el envío real y una prueba concurrente integral entre instancias. Las pruebas locales de reintentos usan almacenamiento/proveedor simulados; las restricciones únicas serializan las reservas en producción.
- No se hace Preview: **0 despliegues**. No se pueden afirmar las horas CPU ni los GB facturados después del cambio a partir de una compilación local.

## Ahorro estimado y acciones manuales

| Métrica | Estimación prudente |
| --- | --- |
| Invocaciones `/ops` en reposo | >1000/h → unas 60/h por pestaña estable; al menos 94% menos. Navegación, cambios de visibilidad y acciones manuales añaden consultas puntuales. |
| Digest | 2880 → 720 comprobaciones en 30 días, −75%. |
| Digest + mantenimiento | 2880 → 1440 invocaciones programadas en 30 días, −50%; las cargas operativas pesadas pasan a frecuencia horaria. |
| CPU | Reducción esperada del orden de 75–95% en el trabajo repetitivo aquí identificado, no en toda la cuenta. ISR evita renderizados en hits. El envío real, las consultas iniciales y los primeros accesos a destinos siguen consumiendo CPU. |
| Fast Origin Transfer | Menos JSON de polling y menos respuestas originadas en funciones para páginas públicas calientes. Entre 57% y 90% menos bytes en las dos imágenes web optimizadas. El porcentaje global depende del tráfico y del hit rate. |
| Deployment Storage | Unos 21,3 MiB menos de imágenes públicas por versión, icono menor y eliminación de la segunda versión por commit. En commits que antes generaban dos despliegues, aproximadamente la mitad de nuevos despliegues. La deduplicación física y los bundles de Vercel impiden convertir esto directamente a GB facturados. |

No se garantiza **CPU <3 h/30 días** ni **Deployment Storage <8 GB** sin medir el uso real. El trabajo no relacionado con estas rutas puede dominar el total. Tras el despliegue autorizado, comparar ventanas equivalentes en Vercel Usage; objetivo diario orientativo para CPU: menos de 6 minutos, teniendo en cuenta que la ventana móvil conserva consumo anterior.

La migración ya está aplicada y verificada. Orden de activación pendiente: publicar mediante un único push cuando se autorice; dejar que Vercel Git construya; comprobar contadores/cache y un digest controlado antes de confiar en la automatización. Las tablas nuevas deben existir antes de que empiece a ejecutarse la nueva versión.

Retención actual consultada por API el 10 de septiembre: **30 días** para previews, producción, cancelados y fallidos; `deploymentsToKeep: 10`. No se modificó. Política propuesta, **sin aplicarla**: producción 30 días; previews terminados y builds fallidos/cancelados 7 días; conservar la producción actual, aliases necesarios y varias versiones sanas para rollback. Ajuste: **Project → Settings → Security → Deployment Retention Policy**. Vercel documenta excepciones para la producción con alias, los 20 Ready recientes de producción y los 20 de no producción, entre otras: una política por antigüedad no implica que esos elementos desaparezcan. Revisar el tamaño del conjunto protegido antes de esperar bajar de 8 GB. La eliminación/recuperación también tiene demoras. [Política oficial de Vercel](https://vercel.com/docs/deployment-retention).

La consulta de consumo por CLI para el 12 de agosto–10 de septiembre devolvió `Costs not found (404)`. La consulta de CPU de 30 días devolvió `payment_required: Observability Plus is required for this query`. El navegador disponible no tiene sesión iniciada en Vercel. Por tanto, esta comprobación no acredita el consumo facturado actual ni los objetivos de CPU/almacenamiento. No se contrató ningún plan. Evidencia: [remote-followup.json](./remote-followup.json).

## Archivos

Los cambios se agrupan en:

- Polling: `lib/ops-polling.ts`, `lib/ops-polling-client.ts`, `app/api/ops/status/route.ts`, cabecera, widgets, tablero de rutas, controles VPS e historiales; exclusión del agregado del log de actividad.
- Digest: `lib/digest-idempotency.ts`, `lib/digest-schedule.ts`, `lib/scheduled-digest-store.ts`, `lib/ops.ts`, `lib/email.ts`, acción manual de `/ops`, cron ops-alerts, dos workflows y migración SQL.
- Público/SEO: páginas de destinos/búsqueda/localizadas, componentes de contenido/explorer/URL, `lib/destination-photo-storage.ts`, `lib/public-fare-cache.ts`, sitemap, middleware y configuración Next.
- Imágenes: CSS de ofertas, componente 404, icono y archivos de `public` descritos arriba.
- Entrega/verificación: `.vercelignore`, `AGENTS.md`, tres archivos de pruebas y este directorio de evidencias.

El inventario completo está en `files.txt`. Los tamaños, headers HTTP y resultados de pruebas se adjuntan como archivos legibles por máquina.

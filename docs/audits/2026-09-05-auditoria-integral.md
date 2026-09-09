**Auditoría integral de 352 Flights — 5 de septiembre de 2026**

La web tiene una identidad visual reconocible y bastante trabajo útil detrás. Mi recomendación es concentrar la siguiente etapa en que los precios, las alertas y los paneles transmitan información fiable. Después, simplificar las pantallas para que encontrar una oferta y gestionar el servicio requiera menos esfuerzo.

He revisado la [web publicada](https://www.352flights.com), la copia local y las ocho pantallas de `/ops`: revisión, precios, scanner de precios, scanner de fechas, campañas, contenido social, rutas e imágenes. He inspeccionado el scanner Python, la sincronización, preferencias, suscripción, APIs, configuración y SEO. La revisión visual incluye escritorio y un ancho móvil de 390 px. Las preferencias con token válido se han revisado en código; no he cambiado el perfil de un suscriptor real.

Las observaciones distinguen **comprobado en producción**, **comprobado localmente**, **comprobado en código** y **recomendación**. No se han enviado campañas ni formularios válidos, ejecutado escaneos, publicado cambios o aplicado correcciones al producto. Se han añadido únicamente este informe y sus evidencias. Había modificaciones locales previas que se han conservado. La copia local siguió recibiendo cambios durante la auditoría; los resultados describen las versiones observadas y no certifican modificaciones posteriores a cada comprobación.

**Qué haría primero**

| Orden | Cambio | Por qué importa | Esfuerzo orientativo |
|---|---|---|---|
| 1 | Resolver el resumen semanal y los estados de las preferencias | Se puede prometer una alerta que no llegará | 1–3 días |
| 2 | Corregir errores de `/ops/prices` y `/ops/active-routes` | Un fallo de consulta aparece acompañado de ceros engañosos | 1–3 días, después de medir SQL |
| 3 | Unificar antigüedad y publicación de precios | Hay tarifas de varios días presentadas como actuales | 1–3 días |
| 4 | Bloquear `/ops` cuando falte configuración y limitar envíos de formularios | Evita exposición accidental y abuso del correo | 1–2 días |
| 5 | Guardar reglas y preferencias sin pérdidas parciales | Una edición no debe borrar otra configuración | 1–3 días |
| 6 | Acelerar portada y buscador | La simulación móvil da 12 s y 6,7 s de LCP | 1–3 días y nueva medición |
| 7 | Simplificar tarjetas, portada y jerarquía de `/ops` | Facilita comparar y decidir | 3–5 días |
| 8 | Mejorar contenido por destino, analítica y pruebas automáticas | Permite crecer y comprobar si los cambios funcionan | Trabajo continuo |

Son estimaciones de trabajo de una persona familiarizada con el proyecto; no equivalen a un presupuesto cerrado y algunas tareas se solapan.

**Resultados medidos, con sus límites**

| Comprobación | Portada publicada | Buscador publicado |
|---|---:|---:|
| Lighthouse: rendimiento móvil | 67/100 | 72/100 |
| Lighthouse: accesibilidad automática | 92/100 | 93/100 |
| Lighthouse: buenas prácticas | 100/100 | 96/100 |
| Lighthouse: comprobaciones básicas de SEO | 100/100 | 69/100 |
| LCP: aparición del contenido principal | 12,0 s | 6,7 s |
| Tiempo total de bloqueo de JavaScript | 50 ms | 30 ms |
| Desplazamiento de contenido, CLS | 0 | 0 |
| Transferencia observada | 3.019 KiB | 1.097 KiB |

Lighthouse 13.4.1, una ejecución por página, emulación móvil con red y CPU ralentizadas. Son medidas de laboratorio y pueden variar; no representan el percentil de visitantes reales. El 69 de SEO del buscador incluye su `noindex` deliberado: no recomiendo retirarlo para mejorar una puntuación. El 100 de la portada tampoco mide calidad editorial, enlaces externos ni posicionamiento. [Criterios de Core Web Vitals](https://web.dev/articles/vitals).

`npm run typecheck`, ejecutado al inicio sobre la copia revisada, pasa. El scanner pasa **47 de 48 pruebas**. La prueba restante falla porque usa el 1 de septiembre de 2026, que ya es una fecha pasada para el proveedor. No demuestra un fallo del scanner en búsquedas reales.

La portada pública responde 200; el dominio sin `www` redirige al dominio principal con 308; `/ops` y la API de estado probada devuelven 401 sin autenticación. `robots.txt` y sitemap responden 200. El sitemap observado contiene **678 URL únicas**; he revisado su estructura y una muestra de destinos, no cada una de las 678 páginas. Las variantes con filtros devuelven `noindex`; un destino inexistente devuelve 404.

**Parte pública: confianza, diseño y facilidad de uso**

**1. Explicar con precisión qué precio está viendo el viajero. Prioridad alta.**

Comprobado en producción: una tarjeta de Niza muestra precio, horarios, fechas, tiempo en destino, antigüedad y comparación con el habitual. Eso está bien. Falta hacer igual de visible que es **ida y vuelta, por un adulto, en clase económica**, y qué se sabe del equipaje. El enlace abre una búsqueda en Skyscanner; no garantiza una reserva del vuelo concreto al precio observado.

Cambiaría la tarjeta a: **«Niza · 58 € ida y vuelta por persona»**, debajo fechas y compañía, y después «Comprobado hace 14 h». El botón sería **«Consultar precio en Skyscanner»**. Equipaje: mostrar el dato cuando exista y «Consulta el equipaje incluido» cuando no se conozca. Mantener horarios detallados en un desplegable. Archivo principal: [tarjetas de ofertas](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/public-deals-explorer.tsx:2397>).

Cómo comprobarlo: una persona debe poder identificar precio total de ida y vuelta, viajeros, fechas y web de reserva sin abrir otra pantalla. La auditoría no ha contrastado cada precio con el resultado final de Skyscanner.

**2. Resolver la contradicción entre “en directo” y precios de hace días. Prioridad alta.**

Comprobado en producción: en `/es/ofertas/nice` aparecen tarjetas con «Verificado hace 5 d». Comprobado en código: `PUBLIC_FARE_LOOKBACK_DAYS = 7`; el README todavía promete 24 horas. El tiempo de comprobación se muestra, pero el encabezado y otros textos hablan de tiempo real.

Definiría una política única, por ejemplo: hasta 24 h, oferta reciente; entre 24 y 72 h, precio pendiente de volver a comprobar; después, referencia histórica separada del listado principal. Estos umbrales son una propuesta y deben ajustarse a la capacidad del scanner. Aplicarla al servidor, tarjetas, correo, contenido social y JSON-LD. Cambiar «en directo» por **«precios encontrados recientemente»** donde no exista comprobación inmediata. [Ventana pública](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/ops.ts:60>).

Cómo comprobarlo: con datos de 1 h, 30 h y 5 días, cada canal debe aplicar la misma etiqueta y regla de publicación.

**3. Poner búsqueda y precio antes en la pantalla móvil. Prioridad media-alta.**

Comprobado visualmente: a 390 × 844 el botón principal de la portada comienza aproximadamente en el píxel 777. La fotografía ocupa mucho espacio antes de la búsqueda. En el buscador, los horarios de la primera tarjeta aparecen antes que su precio, que queda por debajo del primer encuadre.

Mantendría el azul, rojo y logotipo; reduciría la fotografía móvil a una franja más corta y el titular a dos o tres líneas. Pondría el precio junto al destino en las tarjetas, seguido de fechas y duración. La fotografía puede seguir siendo protagonista en escritorio. [Portada](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/v2-landing.tsx:747>), [estilos](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/app/home.css:2528>).

Propuesta de mensaje: **«Encuentra vuelos baratos desde Luxemburgo para tus fechas»**. Texto de apoyo: «Comparamos precios recientes. Elige cuándo viajar o recibe ofertas por email». Una acción principal para buscar y una secundaria para recibir alertas. Evitar la afirmación absoluta de vigilar “cada tarifa”.

**4. Sustituir prueba social sin procedencia visible por evidencia verificable. Prioridad alta antes de promocionar.**

Comprobado en código: las cifras «1.400+», «−38 %» y «100 %» son constantes; nombres, fotos y testimonios están definidos en archivos. Esto no permite concluir que sean falsos, pero tampoco acreditar su procedencia. Además, las tarifas públicas proceden de criterios automáticos; la revisión editorial de campañas es otro recorrido, por lo que «100 % seleccionadas a mano» necesita aclaración.

Usaría cifras calculadas con periodo y definición: «X tarifas comprobadas en las últimas 24 h». Para ahorro, indicar muestra y referencia. Mantener únicamente testimonios reales con autorización y registro de origen; si todavía no están verificados, sustituir la sección por ejemplos reales de ofertas. [Cifras](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/v2-bottom-sections.tsx:75>), [testimonios](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/v2-landing.tsx:88>).

**5. Ayudar a salir de una búsqueda vacía. Prioridad media.**

Comprobado en producción: con `price_max=1` aparece un mensaje que recomienda ampliar presupuesto, fechas o vuelos directos. Es una buena base, pero obliga a localizar y editar filtros otra vez.

Añadir botones **«Quitar límite de precio»**, **«Ampliar fechas»** y **«Ver todas las ofertas»**, conservando el resto de preferencias. Ofrecer guardar esa búsqueda como alerta cuando el producto soporte trasladar exactamente esos filtros. Los filtros móviles y la ordenación sí abren sus paneles al interactuar con los controles dentro de la pantalla.

**6. Terminar la coherencia lingüística. Prioridad media.**

Comprobado: la página española de Niza usa «Nice» en la explicación del precio habitual; `/ops/tiktok-json` combina navegación inglesa con formulario español. Confirmación y baja contienen textos ingleses escritos directamente en sus páginas.

Centralizar nombres de destinos y mensajes de estado, y elegir un idioma uniforme para operaciones. Revisar también los correos y el paso desde el email a preferencias. El slug `/es/ofertas/nice` funciona: no es necesario cambiarlo a `/niza` por estética. [Localización de destinos](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/destination-localization.ts>), [confirmación](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/app/confirm/page.tsx>).

**Alertas, preferencias y campañas**

**7. El resumen semanal no tiene un recorrido de envío. Prioridad alta.**

Comprobado en código: el asistente ofrece `weekly_best_of`. `deliveryModeMatches()` solo acepta `flash_only` para flash y `daily_digest` para digest. La automatización revisada envía digest; no existe un despacho semanal en los recorridos encontrados. Un usuario que marque únicamente semanal queda fuera de ambos tipos.

Implementar una campaña semanal con día y hora en Luxemburgo, selección de ofertas aún vigentes y un registro que impida enviarla dos veces en la misma semana. Mientras no exista, retirar temporalmente la opción del formulario y explicar el estado a quienes la tengan guardada. No convertirlos a diario sin una elección explícita. [Oferta semanal en preferencias](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/preferences-typeform-concept.tsx:347>), [selección de destinatarios](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/ops.ts:2888>).

Comprobación necesaria: perfiles solo diario, solo semanal, solo flash y combinaciones; cada uno debe recibir exclusivamente las campañas que solicitó. Flash se lanza desde operaciones en el recorrido revisado: no prometer inmediatez automática si depende de una revisión y envío manual.

**8. Guardar preferencias sin borrar opciones anteriores. Prioridad alta.**

Comprobado en código: el asistente actual envía `minTripNights: null`, `maxTripNights: null` y vuelve a calcular todas las rutas desde los grupos elegidos. Por tanto, puede sobrescribir límites o destinos previamente guardados aunque el usuario solo cambie el presupuesto.

Preservar los campos que la pantalla no edita, o actualizar solo las propiedades modificadas. Si se quiere sustituir selecciones antiguas por el nuevo modelo, hacerlo como una migración explícita. [Carga útil de guardado](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/preferences-typeform-concept.tsx:538>), [persistencia](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/preferences.ts:312>).

Comprobación necesaria: cargar un perfil con destinos concretos y 3–5 noches, cambiar únicamente presupuesto y verificar que esos límites y destinos permanecen.

**9. Distinguir “preferencias guardadas” de “alertas activas”. Prioridad alta.**

El asistente muestra siempre el mensaje de éxito «Tus alertas están activas…» tras un 200, sin leer la respuesta del servidor. La API sí distingue si falta confirmar el email. Esto puede ocurrir al acceder al enlace de preferencias de un correo antes de confirmar la suscripción.

Devolver un estado explícito `active` o `confirmation_required`, mostrarlo en el asistente y ofrecer reenviar confirmación cuando proceda. Mantener un resumen final editable y acceso sencillo para recuperar el enlace. [Mensaje de éxito](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/preferences-typeform-concept.tsx:554>), [API](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/app/api/preferences/route.ts>).

**10. Limitar solicitudes de suscripción y contacto. Prioridad alta.**

En el código revisado no hay límites por IP o dirección de correo para suscripción; cada petición puede programar un nuevo email. El contacto tiene un campo trampa para bots, pero no una cuota. La clave de idempotencia del email de bienvenida incluye la hora actual, por lo que no limita solicitudes repetidas.

Añadir cuota por IP y por correo normalizado, espera entre reenvíos, validación de tamaño y una respuesta genérica. Guardar la intención de envío en una cola persistente con reintentos limitados. No se ha realizado una prueba de abuso ni comprobado si existe una protección adicional configurada en Vercel. [Suscripción](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/app/api/subscribe/route.ts>), [envío de bienvenida](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/subscriptions.ts:142>), [contacto](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/app/api/contact/route.ts>).

Además, las peticiones locales con JSON mal formado devuelven **500** en suscripción y preferencias. Contacto devuelve correctamente **400**. Capturar el fallo de `request.json()` y devolver un error de entrada consistente, sin detalles internos.

**11. Seguir los envíos fallidos por destinatario. Prioridad media-alta.**

La aplicación ya registra entregas y utiliza claves estables para campañas, lo que conviene conservar. Sin embargo, un candidato puede marcarse globalmente como `sent` después de entregarse a una parte de la audiencia; la cola normal carga candidatos `reviewed`. Esto dificulta reintentar únicamente los destinatarios fallidos. No se ha provocado un envío parcial real.

Separar estado editorial de la oferta y estado de cada entrega. Mostrar «entregado, pendiente, fallido, rebotado», añadir reintento solo de fallidos y procesar eventos del proveedor. “Aceptado por Resend” no significa “entregado en la bandeja”. Añadir baja estándar para clientes de correo donde corresponda. [Entrega y estado global](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/ops.ts:5250>), [adaptador de email](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/email.ts:1706>).

**Operaciones: fiabilidad y organización**

**12. Corregir las consultas que agotan el tiempo. Prioridad alta.**

Comprobado localmente con los datos configurados: `/ops/prices` y `/ops/active-routes` mostraron `canceling statement due to statement timeout`. Después aparecieron cero series o cero rutas. El dashboard principal y el scanner sí mostraban 121 rutas; no había evidencia de que se hubieran borrado.

En precios, el código intenta traer todo el historial, incluido `metadata`, y construir las series en memoria. Limitar inicialmente a una ruta y periodo —por ejemplo 30 días—, paginar en servidor, cargar detalles bajo demanda y calcular agregados en SQL. En rutas, aislar las consultas de calendario, cambios y cobertura para identificar cuál agota el tiempo; revisar su plan de ejecución antes de añadir índices o cambiar el servicio contratado. [Consulta de precios](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/ops.ts:4955>), [consultas de rutas](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/active-routes.ts:614>).

Comprobación: con la base actual, devolver un primer resultado útil dentro de un objetivo acordado; por ejemplo, dos segundos con datos calientes. Si la consulta falla, mostrar «No disponible · Reintentar», conservar filtros y evitar ceros que parezcan una medición.

**13. Guardar reglas como una única operación. Prioridad alta.**

Comprobado en código: las funciones para guardar reglas borran primero registros de `route_search_rules` y después insertan los nuevos mediante otra petición. Si falla el segundo paso, pueden quedar eliminadas las reglas anteriores. No se ha ejecutado esta situación contra datos reales.

Crear una función SQL transaccional: validar, reemplazar y devolver el resultado dentro de la misma transacción. Incorporar una versión para detectar dos ediciones simultáneas. Aplicar el mismo principio al guardado de preferencias que modifica varias tablas. [Reemplazo mensual](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/active-routes.ts:987>), [reemplazo de varios meses](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/active-routes.ts:1077>).

Comprobación: simular un error de inserción en una base de pruebas y comprobar que las reglas anteriores siguen intactas.

**14. Convertir `/ops` en una pantalla de decisiones. Prioridad media-alta.**

La cabecera ocupa aproximadamente los primeros 420 px en la captura de escritorio, antes de entrar en métricas y trabajo. El registro flotante de actividad tapa parte de las tarjetas. La página principal mezcla revisión, suscriptores y salud del scanner.

Reducir cabecera y título. Arriba: **estado del servicio, última comprobación de precios, próxima ejecución y acciones pendientes**. Debajo: incidencias priorizadas y ofertas por revisar. Llevar suscriptores a una sección propia y dejar logs detrás de «Ver detalle técnico». Mantener las ocho funciones actuales agrupadas en Ofertas, Scanner, Audiencia y Contenido. [Navegación](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/ops-subnav.tsx>), [dashboard](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/app/ops/page.tsx:991>), [panel de actividad](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/web-activity-log.tsx:639>).

**15. Mostrar estado actualizado y pérdida de conexión por separado. Prioridad alta.**

El scanner de fechas mostraba «Synced» junto a «Last Supabase update 18d ago» y cobertura guardada de 112/121 rutas. Describe sincronización histórica, no necesariamente disponibilidad actual. En el widget de precios se ignoran errores de consulta y se mantiene el último estado; se consulta cada siete segundos sin las comprobaciones de pestaña oculta y solicitud pendiente que sí tiene el widget de fechas.

Mostrar por separado **proceso**, **conexión**, **último dato recibido** y **frescura de cobertura**. Tras varias consultas fallidas, cambiar a «Estado no actualizado desde…» y ofrecer reintento. Reutilizar una fuente de estado, impedir consultas solapadas y parar el refresco con la pestaña oculta. [Widget de precios](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/local-scanner-status.tsx:503>), [widget de fechas](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/local-pattern-discovery-status.tsx:123>).

**16. Hacer visibles las consecuencias de acciones delicadas. Prioridad media.**

El borrado de suscriptores es un formulario directo. En rutas existe «Clear all rules». Mostrar cantidad y alcance antes de aplicar operaciones amplias; para eliminar un suscriptor, una confirmación concreta o un borrado recuperable cuando resulte adecuado. Para revisar ofertas, dar un mensaje de resultado y continuar con la siguiente. [Borrado de suscriptores](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/app/ops/page.tsx:616>).

No hace falta pedir confirmación para navegar, filtrar o cada pequeño cambio. La confirmación aporta valor donde evita un borrado accidental o un envío a personas reales.

**17. Mantener el contenido social ligado a precios vigentes. Prioridad alta.**

La nueva pantalla local ya separa propuestas, selección y vista previa, y deja el JSON técnico desplegable: esa dirección es buena. La consulta de origen filtra fechas de viaje y elegibilidad, pero no impone antigüedad máxima a `scanned_at`. Elegir la observación más reciente de un itinerario no garantiza que sea reciente en términos absolutos.

Aplicar la misma regla de frescura que en la web, mostrar hora de comprobación y volver a validar la selección antes de exportar. Llamar a la acción principal «Preparar publicación», con formato e idioma claros. [Origen de propuestas](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/tiktok-carousel-data.ts:41>), [vista previa](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/tiktok-json-generator.tsx:393>).

**18. Usar la biblioteca de fotos para controlar calidad y peso. Prioridad media.**

La biblioteca tiene búsqueda y buena cobertura; se observaron 113/114 destinos con imagen disponible. Añadir filtros «sin imagen», «imagen pesada» y «usa alternativa», previsualización de recortes móvil/escritorio y datos de autoría/licencia para las cargas manuales. Comprimir al subir y conservar el original por separado. Esto conecta el trabajo editorial con el problema real de rendimiento medido. [Biblioteca](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/destination-photo-manager.tsx:98>).

**Scanner y sincronización**

**19. Priorizar la frescura del catálogo y medir trabajo útil. Prioridad media-alta.**

El historial local mostraba una ejecución del 5 de septiembre de 12 h 57 min y otra iniciada el 1 de septiembre contabilizada en 76 h 29 min. Es necesario distinguir duración total de tiempo activo: la cifra por sí sola no demuestra que el proceso trabajase 76 horas seguidas.

Ya existen puntos de reanudación, detección de fallos del proveedor, reintentos con espera, pruebas de rutas conocidas y bloqueo entre scanners. Mantenerlos. Añadir tiempos activo/pausado, edad de cada ruta y porcentaje de rutas con precios recientes. Dividir el trabajo en lotes que se puedan reanudar y priorizar ofertas vistas o próximas a caducar, sin dejar rutas sin cobertura indefinidamente. El despliegue que use Mac necesita explicar el efecto de reposo y desconexión; el VPS debe tener un estado separado cuando se use.

Los últimos diez registros agregaban 15.482 búsquedas del proveedor y 8.375 reintentos. Revisaría la definición de ambos contadores y el desglose por causa antes de calcular una tasa o aumentar concurrencia. [Resumen de ejecuciones](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/scanner/luxflight_scanner/run_summary.py>), [configuración](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/scanner/luxflight_scanner/config.py>).

**20. Arreglar mensajes de cambios de calendario que no explican el cambio. Prioridad media.**

Comprobado en pantalla: «departure days changed from SUN, THU to SUN, THU». El código crea el evento si cambian fechas concretas o días semanales, pero el resumen solo describe estos últimos.

Comparar conjuntos de fechas y mostrar algo como **«Septiembre: 2 salidas añadidas, 1 eliminada; siguen jueves y domingos»**. Usar “cambio de frecuencia semanal” únicamente cuando cambie ese dato. [Generación del resumen](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/scanner/luxflight_scanner/scanner.py:2336>).

**21. Unificar caché, caducidad y último resultado válido. Prioridad alta.**

Comprobado en código: la invalidación tras sincronizar actualiza destino y buscador, pero no la etiqueta de tarifas de portada. Portada y buscador comparten además la variable de último resultado válido, aunque sus límites son diferentes. Al fallar la carga, puede devolverse ese resultado sin una caducidad adicional.

Separar último resultado de portada, búsqueda y destino. Aplicar un límite de edad al servir una copia anterior, filtrar viajes ya pasados y marcar su estado. Incluir la portada en la actualización de precios o documentar claramente su retraso máximo. La degradación debe ser «Tenemos problemas para actualizar», no un listado silenciosamente antiguo. [Invalidación](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/public-fare-cache.ts:14>), [resultados de respaldo](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/ops.ts:4878>).

**22. Conservar precios orientativos separados y explicar la referencia estadística. Prioridad media.**

El scanner ya separa el calendario orientativo de la verificación exacta y calcula referencias por patrón/mes con alternativa cuando falta muestra. Es una buena base. Un mínimo observado no equivale automáticamente a una gran oferta, y una mediana de la muestra del scanner no representa todo el mercado.

Mostrar la base de comparación con lenguaje sencillo: «Comparado con X observaciones de viajes similares» y «Referencia limitada» cuando falte historial suficiente. Separar “precio interesante”, “bajada importante” y “oferta revisada”. Mantener ruta, mes, escalas y duración comparables; medir también observaciones independientes, no solo filas. [Criterios públicos](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/scanner/luxflight_scanner/scanner.py:3073>).

**23. Preparar almacenamiento y recuperación para crecer. Prioridad media.**

El almacenamiento local reescribe el JSON completo para diferentes actualizaciones. La escritura ya es atómica y usa `fsync`, lo cual es positivo; el archivo local observado era aproximadamente 1,55 MB, por lo que no hay evidencia de que actualmente sea el cuello de botella.

Si sigue creciendo el volumen, migrar a SQLite con transacciones y una cola de sincronización. Registrar pendientes, último envío confirmado y copias de seguridad comprobadas. Mantener la vinculación de cada precio a su ejecución, ya cubierta por pruebas. [Almacenamiento local](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/scanner/luxflight_scanner/storage.py:88>), [sincronización](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/scanner/luxflight_scanner/sync.py:228>).

**Rendimiento, accesibilidad y mantenimiento**

**24. Mostrar el contenido inicial sin esperar animaciones. Prioridad alta.**

Lighthouse identifica el H1 como elemento LCP de la portada. El título usa `data-reveal`; el CSS lo inicia con `opacity: 0` y espera a que JavaScript y un observador añadan una clase para mostrarlo. Es un contribuyente concreto al retraso; la auditoría no ha aislado cuánto de los 12 s se elimina con este único cambio.

Dejar titular, explicación y buscador visibles desde el HTML inicial. Reservar las animaciones de aparición para contenido secundario. Reducir trabajo inicial y mantener el modo de movimiento reducido. Comprobar también la página sin JavaScript. [Animación](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/app/home.css:71>), [observador](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/v2-landing.tsx:220>).

**25. Reducir peso de fotos e iconos. Prioridad alta.**

La portada transfirió unos 3 MB en la medición; Lighthouse estima **1.898 KiB** de ahorro potencial en imágenes. `app/icon.png` pesa **543.674 bytes**, excesivo para un icono de pestaña. Algunas fotos de tarjetas descargan unos 300–370 KB.

Crear iconos con tamaños adecuados a cada uso, revisar las dimensiones y compresión realmente servidas por Supabase y ajustar `sizes`: una tarjeta que ocupa media pantalla móvil no necesita declarar 92vw. Generar variantes WebP/AVIF cuando el servicio lo soporte y comprobar el contenido real de la respuesta. El cargador de Supabase establece un mínimo de 480 px; revisar si es necesario para cada uso. [Cargador](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/supabase-image-loader.ts>), [icono](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/app/icon.png>).

No basta con cambiar una extensión ni bajar calidad a ciegas: comparar nitidez, bytes transferidos y dimensiones después del cambio.

**26. Corregir el error de hidratación del buscador. Prioridad alta.**

Lighthouse capturó en producción **React #418**, que significa que el HTML inicial y la primera renderización del navegador no coinciden. La causa exacta no está aislada. Hay fechas relativas, detección de tamaño e idioma que conviene revisar.

Reproducir en una compilación de producción con idioma y zona horaria controlados; compartir el instante inicial entre servidor y cliente y actualizar textos relativos después de montar. Evitar duplicar árboles de contenido solo para móvil/escritorio si pueden adaptarse con CSS. Añadir una comprobación de consola al recorrido principal. No ocultar el problema globalmente con `suppressHydrationWarning`. [Explicación oficial de React](https://react.dev/errors/418), [explorador](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/public-deals-explorer.tsx>).

**27. Completar accesibilidad de ventanas, etiquetas y contraste. Prioridad alta.**

Prueba manual local: tras abrir alertas y pulsar Tab varias veces, el foco sale a la búsqueda del fondo. `aria-modal="true"` por sí solo no impide esto. Usar un diálogo nativo o un componente que mantenga el foco, haga inerte el fondo y devuelva el foco al botón de apertura. Extender la revisión a paneles móviles de filtros y operaciones. [Ventana de alertas](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/v2-alerts.tsx>), [patrón de diálogo W3C](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

Lighthouse detectó contraste insuficiente en etiquetas y el botón rojo de portada —4,39:1 en la medición frente a 4,5:1 requerido para ese texto—, nombres accesibles que no coinciden con la etiqueta visible del selector de fechas, `aria-label` no válido en elementos `dd` y ausencia de región `main` en portada. Oscurecer ligeramente colores, asociar etiqueta y valor visible, incluir texto accesible real en las cifras y estructurar el contenido principal con `main`. Añadir anuncio de resultado al formulario de newsletter. [Cifras](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/v2-bottom-sections.tsx:83>), [newsletter](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/newsletter-form.tsx>), [WCAG](https://www.w3.org/WAI/WCAG22/quickref/).

**28. Reducir concentración de lógica y crear controles automáticos útiles. Prioridad media-alta.**

`public-deals-explorer.tsx` tiene unas 5.670 líneas y `lib/ops.ts` unas 5.555. Hay lógica de clasificación/filtros en diferentes lugares y hojas CSS grandes. Esto aumenta el riesgo de que dos pantallas interpreten distinto un mismo precio.

Separar consultas públicas, operaciones, campañas, cálculo de precios y componentes visuales por responsabilidad, gradualmente. Compartir funciones puras de filtros, orden y vigencia. Añadir un flujo de CI que ejecute TypeScript, compilación, pruebas del scanner y unos pocos recorridos esenciales. Los workflows existentes revisados se centran en escaneo manual y digest.

Corregir la fecha fija del test y añadir casos para semanal, conservación de preferencias, caducidad, fallo de consultas y reemplazo transaccional. No hace falta probar cada clase CSS. [Test que falla](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/scanner/tests/test_route_discovery_scope.py:38>), [scripts web](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/package.json>).

**Seguridad, SEO, confianza y medición**

**29. Bloquear operaciones si faltan credenciales. Prioridad alta.**

Producción está protegida en las rutas probadas. El riesgo comprobado es de código: si falta usuario o contraseña, middleware, APIs y acciones permiten continuar. Un despliegue mal configurado podría exponer operaciones.

Centralizar autorización y devolver 503/401 cuando falte configuración en producción. Para desarrollo, permitir un modo local explícito, nunca una apertura implícita por variable ausente. Añadir comprobaciones de origen/CSRF en endpoints que inician o detienen procesos; su eficacia actual frente a un ataque no se ha probado. Si hay más operadores, usar sesiones individuales, cierre de sesión, permisos y registro de acciones. [Autorización](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/ops-auth.ts:12>), [middleware](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/middleware.ts>), [acciones](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/app/ops/actions.ts:28>).

Comprobación: credenciales válidas, incorrectas, ausentes y una sola variable configurada; todos los accesos no autorizados deben bloquear páginas, APIs y acciones.

**30. Mantener el SEO técnico y ampliar contenido que ayude a elegir. Prioridad media-alta.**

Se observaron canonical, `hreflang` en seis idiomas y `x-default`, títulos por destino, breadcrumbs y datos estructurados. No recomendaría rehacerlos. El buscador `noindex` es razonable; añadir una página editorial estable para la búsqueda general si se quiere captar esa intención.

La portada utiliza un eslogan como título SEO. Probar un título descriptivo, por ejemplo «Cheap flights from Luxembourg | 352 Flights», y su equivalente en cada idioma, midiendo CTR en Search Console. Es una hipótesis editorial, no una garantía de tráfico. Las páginas por destino comparten mucha estructura y texto genérico; solo hay tres excepciones editoriales en `destination-content.ts`.

Empezaría por los destinos con demanda y datos suficientes: meses que se suelen encontrar baratos, días habituales, duración útil, aeropuerto, traslado, equipaje y criterio de comparación. Usar datos propios y fecha de actualización; no generar centenares de párrafos equivalentes. [Contenido](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/destination-content.ts:112>), [metadatos](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/home-localization.ts>), [orientación de Google sobre contenido útil](https://developers.google.com/search/docs/fundamentals/creating-helpful-content).

La política local de indexación depende de tarifas recientes o contenido editorial. Definir qué páginas deben seguir siendo útiles aunque hoy no tengan oferta; mantener contenido estable y una alerta de disponibilidad en ellas. Comprobar en Search Console la indexación real antes de ampliar el sitemap. [Política](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/destination-seo-policy.ts>).

**31. Afinar datos estructurados y tratamiento de parámetros. Prioridad media.**

Comprobado en el navegador: `flightNumber` contiene «Volotea» o «Luxair». Ese campo requiere el identificador del vuelo; la compañía debe representarse como aerolínea o proveedor. Si no se conoce el número, omitirlo. Revisar también cómo se representa el precio de ida y vuelta frente al único tramo descrito y no afirmar disponibilidad actual a partir de un precio antiguo. [Generación JSON-LD](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/components/deals-city-page-content.tsx:118>), [definición de flightNumber](https://schema.org/flightNumber).

Comprobado en producción: tanto `?price_max=1` como `?utm_source=audit` provocan `noindex`. El código trata cualquier parámetro como filtro. Distinguir parámetros que cambian el contenido de etiquetas de atribución; para estas últimas, mantener canonical limpio y una política coherente. No implica que actualmente la URL canónica esté desindexada. [Metadatos de destino](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/app/deals/[city]/page.tsx:18>), [guía de noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

**32. Publicar contacto y completar información de privacidad. Prioridad alta antes de captar más audiencia.**

`/contact` devuelve 404 en producción y 200 localmente: está en el trabajo local pendiente. Publicar ese cambio cuando se complete y comprobar enlaces de pie e idiomas. No atribuir su ausencia a la versión local.

La política de privacidad revisada es muy breve. Completar identidad y contacto del responsable, finalidades y bases aplicables, conservación, proveedores/destinatarios, transferencias cuando existan, derechos y vía de reclamación. Debe describir la operación real de Supabase, Resend y alojamiento; no inventar datos societarios ni plazos. Es una recomendación para revisión de cumplimiento, no una certificación legal. [Texto actual](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/lib/legal-localization.ts:33>), [artículo 13 del RGPD](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng).

**33. Medir el recorrido completo y la calidad del dato. Prioridad media-alta.**

No he encontrado instrumentación de analítica de conversión en los recorridos públicos revisados. El registro de actividad existente está destinado a `/ops` y vive en la sesión del navegador. No he accedido a Search Console, estadísticas de Vercel ni métricas de correo del proveedor.

Registrar de forma agregada: búsqueda, filtros, cero resultados, clic de salida a reserva, solicitud de alerta, confirmación y preferencias completadas. No enviar emails, tokens privados ni cuerpos de mensajes a analítica. Relacionar esas métricas con cobertura reciente y errores del scanner. Para SEO, medir impresiones, clics y páginas útiles indexadas por idioma; para correo, confirmación, entregas, bajas y fallos.

Un clic a Skyscanner es un clic de salida, no una reserva: solo medir reservas si existe una señal de conversión legítima del socio.

**Cómo organizaría la siguiente versión**

| Pantalla | Contenido principal propuesto | Detalles secundarios |
|---|---|---|
| Portada | Promesa concreta → búsqueda → mejores ofertas recientes | Explicación, destinos, newsletter, confianza |
| Buscador | Destino + precio → fechas → directo/escalas → consultar precio | Horarios completos, comparación, mapa |
| Destino | Mejor precio reciente + filtros + ofertas | Guía propia, meses, preguntas, destinos relacionados |
| Preferencias | Viaje → límites → frecuencia → resumen del estado real | Ajustes adicionales sin perder valores anteriores |
| `/ops` | Incidencias → próxima acción → ofertas por revisar | Audiencia y logs en sus secciones |
| Scanner | Estado y frescura → ejecución actual → cobertura | Errores, reintentos, trazas y referencias de precio |
| Contenido social | Propuestas vigentes → selección → vista previa → exportar | JSON y datos técnicos desplegables |

**Orden de ejecución propuesto**

Primera entrega: corregir semanal y preferencias, autorización por defecto, límites de formularios, manejo de errores y guardado transaccional. Incluir pruebas de estos comportamientos antes de publicar.

Segunda entrega: resolver consultas de operaciones, fijar política de vigencia para todos los canales y mostrar estado de conexión/frescura. Medir con la base actual, no únicamente con datos vacíos.

Tercera entrega: retirar aparición retardada del contenido principal, reducir imágenes/iconos, corregir hidratación y accesibilidad. Repetir Lighthouse bajo las mismas condiciones y revisar manualmente teclado y móvil.

Cuarta entrega: reorganizar portada, tarjetas y operaciones; publicar contacto; añadir analítica mínima y mejorar un primer grupo de páginas de destino. Medir varias semanas antes de ampliar el trabajo editorial.

No recomiendo ampliar la cantidad de destinos, automatizar más publicaciones o escanear con mayor concurrencia como primer paso. Los hallazgos actuales apuntan a que es más valioso asegurar que la información existente sea reciente, que las alertas solicitadas se envíen y que los paneles permitan detectar errores con claridad.

**Evidencias y aspectos que quedan fuera de esta revisión**

Se conservan [Lighthouse de portada](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/docs/audits/2026-09-05-evidencias/lighthouse-portada.json>), [Lighthouse del buscador](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/docs/audits/2026-09-05-evidencias/lighthouse-buscador.json>), [respuestas públicas](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/docs/audits/2026-09-05-evidencias/respuestas-publicas.json>) y [muestra de destinos](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/docs/audits/2026-09-05-evidencias/muestra-destinos.json>). Las respuestas incluyen una ruta exploratoria `/es/ofertas/niza` con 404; la URL real anunciada por el sitio es `/es/ofertas/nice`, que sí funciona. No se considera un enlace roto del producto.

Capturas: [portada móvil local](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/docs/audits/2026-09-05-evidencias/portada-movil.png>), [buscador móvil publicado](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/docs/audits/2026-09-05-evidencias/buscador-movil.png>) y [operaciones local en escritorio](</Users/albertorodriguez/Documents/Luxcheapflights copia 2/docs/audits/2026-09-05-evidencias/ops-escritorio.png>).

No se ha realizado una compra, envío real de correo, escaneo prolongado nuevo, prueba destructiva, pentest exhaustivo, auditoría de backlinks ni verificación de restauración de copias de seguridad. No se han obtenido métricas de usuarios reales, planes SQL ni configuración externa de seguridad o entregabilidad. Por tanto, las recomendaciones sobre esas áreas indican qué verificar, y no afirman que haya una incidencia confirmada en ellas. No se ha ejecutado una nueva compilación de producción local; sí se han comprobado TypeScript, pruebas Python, páginas locales y la aplicación ya publicada.

Durante las últimas comprobaciones el servidor de desarrollo también registró errores de archivos ausentes en la caché de compilación de `.next`. No se han atribuido a producción ni usado como prueba de un defecto del producto. Se ha detenido el servidor de auditoría y cerrado sus sesiones de navegador.

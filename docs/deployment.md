# Cómo se publica la web

## En resumen

- La web vive en un servidor de OVH (`vps-90e46f23`, IP `51.91.127.128`, Ubuntu 24.04).
- En ese servidor, **Coolify** coge el código de GitHub (`arcuartero/352flights`, rama `main`), lo compila y lo publica en `352flights.com`.
- **Aprobar (merge) un PR en `main` publica la web automáticamente**: GitHub avisa a Coolify mediante un webhook y Coolify despliega en unos minutos.
- En el mismo servidor viven otros proyectos (Creatello). Cualquier cambio en Coolify o en el servidor les puede afectar.

## Panel de Coolify

- Dirección: <https://coolify.51.91.127.128.sslip.io> (con candado, certificado de Let's Encrypt).
- El puerto antiguo sin cifrar (`:8000`) y los de tiempo real (`6001`, `6002`) están cerrados a internet con
  `/usr/local/sbin/coolify-dashboard-firewall`, que el servicio `coolify-local-dashboard.service` vuelve a aplicar en cada arranque.
- Variables de entorno de la web: app **+352 Flights** → *Environment Variables*. Tras cambiarlas hay que volver a desplegar.

## Publicar un cambio

1. Si el cambio añade migraciones en `supabase/migrations/`, aplícalas **antes** en Supabase (SQL editor o `supabase db push`).
   El código nuevo falla si escribe columnas o llama funciones que todavía no existen.
2. Aprueba el PR en GitHub. Coolify empieza a desplegar solo; el progreso se ve en el panel → +352 Flights → *Deployments*.
3. Comprueba la web: portada, una página de destino y `/ops`.

## Volver atrás

Panel de Coolify → +352 Flights → *Deployments* → elige el despliegue anterior que funcionaba → *Redeploy*.
Después revierte el commit en GitHub para que el siguiente despliegue no vuelva a traer el problema.

## Webhook de GitHub

- GitHub → repositorio → *Settings* → *Webhooks*: envía solo eventos `push` a
  `https://coolify.51.91.127.128.sslip.io/webhooks/source/github/events/manual`, firmados con un secreto.
- El mismo secreto está en Coolify (app → *Webhooks* → *GitHub manual webhook secret*). Si se cambia en un lado hay que cambiarlo en el otro.

## Acceso al servidor

`ssh -i ~/.ssh/352flights_vps ubuntu@51.91.127.128` (solo con llave; no acepta contraseñas).
Si se pierde el acceso: panel de OVH → VPS → *Boot* → *Reiniciar en modo rescue*, montar `/dev/sdb1` y añadir la llave pública a
`/home/ubuntu/.ssh/authorized_keys`; después *Reiniciar en modo normal*.

## Tareas programadas

Los crons de la web (resumen diario y semanal, alertas, Creatello) los lanza el workflow `Scheduled Jobs` de GitHub Actions cada hora,
con los secretos `APP_BASE_URL` y `CRON_SECRET` de GitHub. No dependen de Coolify.

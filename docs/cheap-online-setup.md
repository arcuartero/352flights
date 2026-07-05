# Setup barato: Vercel + Supabase + Hetzner

Objetivo: la web vive en Vercel, los datos viven en Supabase y el scanner largo vive en un VPS barato de Hetzner. El scanner guarda primero en el disco del VPS y luego sincroniza a Supabase.

## Antes de empezar

Necesitas tener a mano:

- La URL de Supabase.
- La clave `SUPABASE_SERVICE_ROLE_KEY`.
- El repo de GitHub: `https://github.com/arcuartero/352flights.git`.

La clave de Supabase no se pega en GitHub ni en Vercel como texto visible. Solo va en el archivo `.env` privado del VPS.

## 1. Crear el servidor en Hetzner

En Hetzner Console:

1. Entra en el proyecto `352flights`.
2. Pulsa `Servers`.
3. Pulsa `Create Server`.
4. Elige ubicación europea, por ejemplo `Falkenstein`.
5. En imagen, elige Ubuntu. Si aparece una versión LTS, elige la LTS.
6. En tipo, elige el más barato disponible que tenga al menos 2 GB de RAM. El `CX23` va sobrado para empezar.
7. En `SSH keys`, añade tu clave SSH de tu Mac. Si no tienes una, créala antes desde tu Mac.
8. No añadas volumen extra.
9. No actives backups por ahora si quieres mantener el coste mínimo.
10. Ponle nombre: `352flights-scanner`.
11. Pulsa `Create & Buy now`.

## 2. Entrar al VPS desde tu Mac

Cuando Hetzner termine de crear el servidor, copia la IP pública.

En tu Mac, abre Terminal y entra así:

```bash
ssh root@IP_DEL_SERVIDOR
```

La primera vez puede preguntar si confías en el servidor. Escribe `yes` y pulsa Enter.

## 3. Preparar el VPS

Dentro del VPS, ejecuta:

```bash
apt update
apt install -y git curl ca-certificates bash
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
```

Comprueba que `uv` existe:

```bash
uv --version
```

## 4. Descargar el proyecto

Dentro del VPS:

```bash
mkdir -p /opt/352flights
git clone https://github.com/arcuartero/352flights.git /opt/352flights/app
cd /opt/352flights/app
```

## 5. Crear el archivo privado `.env`

Dentro del VPS, estando en `/opt/352flights/app`, abre el archivo:

```bash
nano .env
```

Pega esto, cambiando los valores reales:

```text
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SCANNER_STORAGE_MODE=local
SCANNER_CURRENCY=EUR
SCANNER_REVIEW_RATIO=0.72
SCANNER_FLASH_RATIO=0.6
SCANNER_HISTORY_WINDOW=180
```

Para guardar en `nano`:

1. Pulsa `Ctrl + O`.
2. Pulsa Enter.
3. Pulsa `Ctrl + X`.

## 6. Instalar el scanner

Dentro del VPS:

```bash
cd /opt/352flights/app/scanner
uv sync
```

## 7. Probar con una ruta

Primero hacemos una prueba pequeña:

```bash
cd /opt/352flights/app
./scripts/run-vps-scanner-with-sync.sh --limit 1
```

Si termina bien, se crean archivos en:

```text
/opt/352flights/app/logs/
```

Y Supabase debería recibir algunos `price_snapshots`.

## 8. Instalar el scanner automático

Cuando la prueba pequeña funcione:

```bash
cd /opt/352flights/app
sudo bash scripts/install-vps-scanner-systemd.sh
```

Esto programa el scanner todos los días sobre las `02:15` del servidor.

## 9. Comprobar que quedó activo

Mira si el temporizador está activo:

```bash
systemctl status 352flights-scanner.timer
```

Lanzar una ejecución manual:

```bash
sudo systemctl start 352flights-scanner.service
```

Ver si está corriendo:

```bash
systemctl status 352flights-scanner.service
```

Ver logs:

```bash
journalctl -u 352flights-scanner.service -n 100 --no-pager
```

## 9.1. Controlarlo desde `/ops`

Para poder lanzar el scanner y ver logs desde `/ops`, instala el agente privado del VPS:

```bash
cd /opt/352flights/app
sudo bash scripts/install-vps-scanner-agent-systemd.sh
```

El instalador:

- crea un token aleatorio en `/etc/352flights-scanner-agent.env`
- instala el servicio `352flights-scanner-agent`
- deja el agente escuchando solo en `127.0.0.1:8787`
- permite al usuario `ubuntu` ejecutar solo estas acciones con `sudo` sin contraseña:
  - `systemctl start --no-block 352flights-scanner.service`
  - `systemctl stop 352flights-scanner.service`

Comprueba el agente:

```bash
systemctl status 352flights-scanner-agent --no-pager
```

Lee el token:

```bash
sudo grep VPS_SCANNER_AGENT_TOKEN /etc/352flights-scanner-agent.env
```

El agente debe exponerse con HTTPS. Una forma simple es usar Caddy como reverse proxy:

```bash
sudo apt install -y caddy
```

Edita el Caddyfile:

```bash
sudo nano /etc/caddy/Caddyfile
```

Ejemplo con un subdominio propio:

```text
scanner-control.tudominio.com {
  reverse_proxy 127.0.0.1:8787
}
```

Aplica la configuración:

```bash
sudo systemctl reload caddy
```

En Vercel, añade estas variables de entorno a la app:

```text
VPS_SCANNER_AGENT_URL=https://scanner-control.tudominio.com
VPS_SCANNER_AGENT_TOKEN=el_token_del_vps
```

Después redepliega la web. En `/ops/scanner-live` aparecerá una tarjeta `VPS Scanner`
con botones para lanzar, parar, refrescar y ver logs.

No publiques el token. Ese endpoint solo acepta tres acciones fijas: consultar estado,
arrancar el servicio y pararlo. No acepta comandos arbitrarios. La app rechazará
`VPS_SCANNER_AGENT_URL` por HTTP salvo que fuerces `VPS_SCANNER_ALLOW_INSECURE_HTTP=1`,
que no deberías usar en producción.

## 10. Actualizar código en el VPS

Cuando subas cambios nuevos a GitHub:

```bash
cd /opt/352flights/app
git pull
cd scanner
uv sync
```

## Qué pasa si falla la sincronización

No se pierden los precios. Quedan guardados en:

```text
/opt/352flights/app/scanner/state.json
```

El siguiente sync vuelve a intentarlo.

## Coste esperado

Con el VPS pequeño, el coste principal será el servidor de Hetzner. Vercel puede seguir en gratis y Supabase debería aguantar al principio si no subimos millones de filas.

# Deploy online — probar Google login fuera de localhost

GitHub Pages **no** ejecuta el Studio (solo estáticos). Para login Google **online** hace falta un host Node (Express + SQLite).

## Opción rápida: Render (Docker)

1. Push a `main` / merge el PR de Google auth.
2. En [Render](https://render.com): **New → Blueprint** y conecta este repo (usa `render.yaml`), o **Web Service** + Docker.
3. Disco persistente montado en `/data` (`DATA_DIR=/data`) para no perder el roster.
4. Variables (Dashboard → Environment):

| Variable | Valor |
|----------|--------|
| `HOST` | `0.0.0.0` |
| `TRUST_PROXY` | `1` |
| `COOKIE_SECURE` | `1` |
| `DATA_DIR` | `/data` |
| `STUDIO_PIN` | PIN **≠ 1234** (obligatorio en bind público) |
| `SESSION_SECRET` | secreto largo (o generate) |
| `ENABLE_GOOGLE_AUTH` | `1` |
| `GOOGLE_CLIENT_ID` | de Google Cloud |
| `GOOGLE_CLIENT_SECRET` | de Google Cloud |
| `PUBLIC_BASE_URL` | `https://TU-SERVICIO.onrender.com` |
| `GOOGLE_REDIRECT_URI` | `https://TU-SERVICIO.onrender.com/api/auth/google/callback` |

5. Google Cloud Console → credenciales OAuth **Web**:
   - Authorized JavaScript origins: `https://TU-SERVICIO.onrender.com`
   - Authorized redirect URIs: `https://TU-SERVICIO.onrender.com/api/auth/google/callback`
6. Arranca el servicio → abre la URL → **Continuar con Google**.

## Opción local Docker

```bash
docker build -t influ-json .
docker run --rm -p 3000:3000 \
  -e HOST=0.0.0.0 \
  -e STUDIO_PIN='tu-pin-seguro' \
  -e SESSION_SECRET='largo-aleatorio' \
  -e ENABLE_GOOGLE_AUTH=1 \
  -e GOOGLE_CLIENT_ID=... \
  -e GOOGLE_CLIENT_SECRET=... \
  -e PUBLIC_BASE_URL=http://127.0.0.1:3000 \
  -e GOOGLE_REDIRECT_URI=http://127.0.0.1:3000/api/auth/google/callback \
  -v influ-data:/data \
  -e DATA_DIR=/data \
  influ-json
```

## Enlace desde GitHub Pages

Edita [`studio-online.json`](../studio-online.json) en `main`:

```json
{ "studioUrl": "https://TU-SERVICIO.onrender.com", "label": "Abrir Studio online (Google / PIN)" }
```

La landing de Pages mostrará el botón hacia el Studio hospedado.

## Seguridad mínima

- Nunca dejes `STUDIO_PIN=1234` con `HOST=0.0.0.0` (la API responde 503 hasta que lo cambies).
- `SESSION_SECRET` y `GOOGLE_CLIENT_SECRET` solo en el panel del host (no en el repo).
- Free tiers sin disco: el SQLite se pierde al redeploy — usa volumen/`DATA_DIR` persistente para demos serias.
- Cada login Google = entorno aislado (`profile_id`). Reglas: [SAAS_TENANCY.md](./SAAS_TENANCY.md).

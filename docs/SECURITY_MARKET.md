# Seguridad de mercado — checklist influ-JSON

> Antes de exponer el Studio más allá de `127.0.0.1` (LAN / VPS / reverse proxy).
> Free path (Copiar JSON / Pollinations opt-in) **no** depende de este documento.
> Continuidad: [HANDOFF.md](../HANDOFF.md) · [ROADMAP.md](../ROADMAP.md) · [AGENTS.md](../AGENTS.md)

## 1. Modelo de amenazas (corto)

| Escenario | Qué protegemos | Qué no es este producto |
|-----------|----------------|-------------------------|
| Localhost (default) | Roster SQLite, assets, PIN, tokens en `.env` | — |
| `HOST=0.0.0.0` en LAN/VPS | Lo mismo + que vecinos no lean API sin PIN | Multi-tenant cloud, OAuth, billing |
| Detrás de HTTPS proxy | Cookies de sesión, XFF real | CDN / WAF gestionado |

**No negociable:** face-lock / LoRA / Gemini de pago siguen **opt-in**. El path gratis no debe exigir tarjeta.

## 2. Checklist — exponer más allá de localhost

Marca cada ítem antes de poner `HOST=0.0.0.0` (o publicar un puerto).

| # | Ítem | Estado código | Ops |
|---|------|---------------|-----|
| 1 | `HOST` default `127.0.0.1` | ✅ `first-run.resolveListenHost` | Déjalo así salvo intención explícita |
| 2 | PIN ≠ `1234` y no vacío en bind público (si no → API 503) | ✅ Sec #1 | Completa el asistente / Ajustes → Perfiles |
| 3 | `SESSION_SECRET` persistido (auto en primer arranque) | ✅ `ensureSessionSecret` | Opcional: fíjalo a mano en `.env` |
| 4 | Con HTTPS / reverse proxy: `COOKIE_SECURE=1` | ✅ flag | **Ops:** actívalo si hay TLS |
| 5 | `TRUST_PROXY=1` solo detrás de proxy conocido | ✅ Sec #2 | No lo actives en bind directo |
| 6 | Rate-limit API ON (`API_RATE_LIMIT` default) | ✅ Sec #4 | No pongas `API_RATE_LIMIT=0` en LAN |
| 7 | CSP en enforce (no `CSP_REPORT_ONLY` en prod) | ✅ | Escape solo para debug |
| 8 | `ENABLE_GIT_BACKUP` off salvo intención | ✅ | Opt-in |
| 9 | `ENABLE_LEGACY_MIRRORS` off | ✅ W6 | Fuente de verdad = `data/influ.sqlite` |
| 10 | Backup: Ajustes → Backup SQLite (+ export ZIP sin `.env`) | ✅ | Tras restaurar: reinicia `npm start` |
| 11 | `/api/status` sin auth no filtra paths/URLs internas | ✅ (esta entrega) | — |
| 12 | `/api/queue-status` requiere sesión (auth on) | ✅ (esta entrega) | — |
| 13 | CSRF token en mutaciones cookie | ⬜ pendiente | Mitigado parcial con `SameSite=Lax` |
| 14 | HSTS | ⬜ N/A localhost | Solo si terminas TLS tú |

## 3. Runbook operador

### Primer arranque (Administración)

1. `cp .env.example .env` → ajusta `STUDIO_PIN` (o deja `1234` y usa el asistente).
2. `npm install && npm start` → abre `http://127.0.0.1:3000`.
3. Cambia el PIN (asistente o **Ajustes → Perfiles**).
4. Happy path: Influencers → crear / inspirar → **Copiar JSON**.

### Fresh clone / otra máquina

1. Clona el repo; **no** esperes `data/influ.sqlite` versionado.
2. Copia `.env` (o recrea desde `.env.example`) — PIN, `POLLINATIONS_TOKEN` opcional, `SESSION_SECRET` opcional.
3. `npm start` crea/migra `data/influ.sqlite` (mirror raíz / scratch / vacío).
4. Restaura un ZIP de Ajustes → Backup si lo tienes; **reinicia** el proceso Node.

### Backup / restore

- **Crear:** Ajustes (admin) → Backup SQLite → copia en `data/backups/`.
- **Export studio ZIP:** no incluye `.env` (tokens/PIN quedan fuera a propósito).
- **Restaurar:** UI restore → reinicia `npm start`. Vuelve a pegar tokens en Ajustes si hace falta.

### LAN / VPS (solo si hace falta)

```bash
# Ejemplo — NO uses PIN 1234
HOST=0.0.0.0
PORT=3000
STUDIO_PIN=tu-pin-largo
SESSION_SECRET=otro-secreto-largo-aleatorio
# Si hay HTTPS delante:
COOKIE_SECURE=1
TRUST_PROXY=1
```

Arranque con PIN default o auth off en bind público → **503** en `/api/*` protegido (wizard / `/api/status` siguen para poder arreglarlo).

## 4. Mapa de tests

| Tema | Archivo |
|------|---------|
| Sec #1 bind + PIN | `test/localhost-bind.test.js` |
| Sec #2 assets / cookie / XFF | `test/sec2-assets-session-xff.test.js` |
| Sec #3 session regenerate | `test/sec3-session-regenerate.test.js` |
| Sec #4 rate-limit | `test/sec4-api-rate-limit.test.js` |
| CSP + Sec #5 headers | `test/csp.test.js` |
| W17 audit | `test/audit-log.test.js` |
| W6 mirrors | `test/untrack-mirrors.test.js`, `test/sqlite-mirror-policy.test.js` |
| P0 paths / ownership | `test/p0-security.test.js`, `test/backup-ownership.test.js` |
| Mercado (status slim + cookies + queue auth) | `test/sec-market.test.js` |

## 5. Fuera de alcance (ahora)

- PR #99 Google / SaaS, billing, empaquetado Windows, Replicate por defecto, rewrite React.
- CSRF completo y HSTS — siguientes cortes si el Studio se publica con TLS de forma habitual.

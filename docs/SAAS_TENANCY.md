# SaaS: auth → tenant → billing

Norte de producto para comercializar influ-JSON **sin romper** el Studio local free (PIN + Pollinations + Copiar JSON).

## Principio

| Modo | Identidad | Datos | Pago |
|------|-----------|-------|------|
| **Local / dueño** | `STUDIO_PIN` + perfiles PIN | SQLite en `DATA_DIR`, roster por `profile_id` | No requerido |
| **Online / cuenta** | Google OAuth (`ENABLE_GOOGLE_AUTH=1`) | Mismo SQLite; un `studio_profiles` por `google_sub` | Futuro (Stripe etc.) |

**Cuenta = entorno.** Un usuario autenticado solo ve y muta filas con su `profile_id`.

## Capas ya implementadas

1. **Identidad** — login PIN, invitaciones member, Google opt-in (`auth-google.js`, schema v12).
2. **Tenant** — `personas` / `products` / `campaigns` / `prompt_gallery` con `profile_id`; asserts fail-closed; assets `references`/`generated` deniegan rutas indexadas de otro perfil; lotes de ads atados a `profileId`; `/api/profiles` lista completa solo admin.
3. **Billing (pendiente)** — ligar plan / `stripe_customer_id` a `studio_profiles`; cuotas free por perfil antes de cobrar. El path local PIN **sigue** sin tarjeta.

## Reglas de aislamiento (API)

- Sin `profileId` de sesión → 401 (no abrir roster global).
- `assertPersonaOwnedBy` / `assertProductOwnedBy` / `assertCampaignOwnedBy`: fail-closed si falta perfil o no coincide.
- Updates por `id` de otro tenant → 404 (no filtrar existencia).
- Login PIN: perfiles `google-oauth-only` **no** aparecen en el selector (`listStudioProfilesPublic({ forLogin: true })`).
- Admin/PIN dueño: su roster es el suyo; **no** mezcla automáticamente los de members/Google (métricas/auditoría admin sí pueden ver agregados).

## Deploy online

Ver [DEPLOY_ONLINE.md](./DEPLOY_ONLINE.md) (Render/Docker + `PUBLIC_BASE_URL` + redirect Google HTTPS).

GitHub Pages **no** es el Studio: solo CTA hacia el host Node.

## Roadmap comercial (orden)

1. Merge + deploy con Google real.
2. Cuotas por perfil (gens/día, # influencers) — free online.
3. Stripe (o similar) → plan en `studio_profiles`.
4. Si un solo SQLite no escala: Postgres/Supabase **sin** obligar pago en el Studio local.

## Relación con Dropdeep / Ulpan

Allí: front estático + **Supabase Auth**. Aquí el valor es Express + SQLite + gen → hace falta host Node; el *resultado* (Google → entorno aislado) es el mismo.

## Regresión P0

- Local: crear → portafolio → Copiar JSON / Pollinations sin Google ni tarjeta.
- Online: usuario A no ve personas/productos/imágenes indexadas de usuario B.

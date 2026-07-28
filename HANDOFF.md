# HANDOFF — continuidad Cursor ↔ Antigravity

> **Al retomar:** `git pull` → **leer este archivo antes de codear.**  
> Luego: [AGENTS.md](./AGENTS.md) · [ROADMAP.md](./ROADMAP.md) · [README.md](./README.md)

---

## Idea central (no negociable)

**Producto:** prompts + JSON `character_lock` → chatbots gratis para desarrollar influencers consistentes (desde cero o inspirados). Pollinations = boceto opcional. Replicate = opt-in futuro (**no** implementado).

```
Crear/importar → guardar JSON → copiar pack chatbot
(+ Script: pack campaña = lock + guión + producto)
```

Regresión P0: “guardé y no aparece”, o free path roto por feature de pago.

---

## Foco actual

| Campo | Valor |
|-------|--------|
| **Etapa** | Docs bots + free path estable (import 1.1/1.2 ✅); listo para merge / checklist |
| **Rama / PR** | `cursor/usabilidad-seguridad-b0f8` · https://github.com/oscarkleinkopf/influ-json/pull/1 |
| **Servidor** | `npm start` → `server.js`. `AUTO_GIT_BACKUP` off por defecto |
| **No tocar ahora** | Replicate obligatorio, video full, multi-tenant, React rewrite |
| **Última plataforma** | Cursor |
| **Última actualización** | 2026-07-28 |

---

## Sesión reciente (Cursor, 2026-07-28)

**Docs + estabilización:**
- README reescrito para humanos y bots (estado, mapa de lectura, checklist, anti-regresiones).
- HANDOFF / AGENTS / ROADMAP alineados al código real.
- Import 1.1/1.2: confirmación, errores honestos, CTA post-import hacia pack chatbot.
- Cache-bust unificado en `index.html`.

**Ya en la rama (commits previos):**
- Usabilidad F4/F6, nav primario/secundario, save sin Pollinations obligatorio.
- Seguridad mínima (SESSION_SECRET, rate-limit, logout, AUTO_GIT_BACKUP off).
- Pack campaña lean `copyCampaignPack` (2.5–2.6).

---

## Próximos pasos (para el robot que retome)

1. `git fetch && git checkout cursor/usabilidad-seguridad-b0f8` (o merge PR #1 a `main`).
2. Correr checklist de regresión del README (6 pasos).
3. Tras merge: siguiente foco = seguridad de mercado o UX fina — **no** Replicate salvo petición explícita.

---

## Log de cambios (más reciente arriba)

| Fecha | Plataforma | Resumen | Commit / PR |
|-------|------------|---------|-------------|
| 2026-07-28 | Cursor | Docs para bots + import QA 1.1/1.2 + cache-bust | *(este commit)* |
| 2026-07-28 | Cursor | 2.5–2.6 pack campaña (lock+guión) | `ad1da79` |
| 2026-07-28 | Cursor | Usabilidad F4/F6 + seguridad mínima | `923479f` · PR #1 |

---

## Cómo actualizar este archivo

Al terminar **cualquier** tarea con cambios:

1. Fila en el log + foco + sesión.
2. Línea en log de `ROADMAP.md` si aplica.
3. `git commit` + `git push` (respaldar en GitHub).

## Qué no commitear

- `.env`
- `data/`

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
| **Etapa** | Free path UX (cola/429 + CTA post-save) + seguridad ligera mercado |
| **Rama / PR** | `cursor/usabilidad-seguridad-b0f8` · https://github.com/oscarkleinkopf/influ-json/pull/1 |
| **Servidor** | `npm start` → `server.js`. `AUTO_GIT_BACKUP` off por defecto |
| **No tocar ahora** | Replicate obligatorio, video full, multi-tenant, React rewrite |
| **Última plataforma** | Cursor |
| **Última actualización** | 2026-07-28 |

---

## Sesión reciente (Cursor, 2026-07-28)

**Cola / happy path / seguridad ligera:**
- `/api/ai/generate-image` devuelve **429** + `Retry-After` (antes siempre 500).
- QueuePoller: refresca en `persona-engine` (no tab `vault`); limpia toast sticky al idle.
- CTA post-save = post-import (`offerPrimaryChatbotPackCopy`).
- `safe-paths.js`: path traversal bloqueado; SSRF en URL import; headers `nosniff` / `SAMEORIGIN`.
- Aviso PIN débil / SESSION_SECRET efímero en login + `/api/status`.

**Previo en la rama:** docs bots, import 1.1/1.2, F4/F6, pack campaña, seguridad mínima.

---

## Próximos pasos (para el robot que retome)

1. Correr checklist de regresión del README (6 pasos) + gen con cooldown 429.
2. Merge PR #1 cuando esté estable.
3. Siguiente: hardening de deploy (HTTPS/`COOKIE_SECURE`) o UX fina — **no** Replicate salvo petición explícita.

---

## Log de cambios (más reciente arriba)

| Fecha | Plataforma | Resumen | Commit / PR |
|-------|------------|---------|-------------|
| 2026-07-28 | Cursor | 429/cola UX + CTA post-save + path/SSRF + avisos PIN | `36ae9a4` · PR #1 |
| 2026-07-28 | Cursor | Docs para bots + import QA 1.1/1.2 + cache-bust | `0bac0ad` · PR #1 |
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

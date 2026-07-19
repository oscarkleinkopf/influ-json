# Regla: seguir ROADMAP de mecánica/usabilidad

Antes de proponer o implementar trabajo en influ-JSON:

1. Abre y respeta `ROADMAP.md` en la raíz del repo.
2. Prioridad: **mecánica → usabilidad → seguridad mínima**.
3. No implementes multi-tenant, OAuth, billing ni video full pipeline salvo que el usuario lo pida.
4. El happy path a proteger es: crear influencer → aparece en lista → UGC → export pack.
5. Tras crear/importar/guardar personas, la UI debe actualizar portafolio y grids sin F5.
6. Si el usuario dice “semana N” o “roadmap”, trabaja solo entregables de esa semana.
7. Al cerrar un entregable, ofrece actualizar la tabla **Log de progreso** en `ROADMAP.md`.

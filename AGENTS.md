# Planilla Patty · entrada para agentes

Código de producción y mantenible. Mantener cada issue acotada, conservar el vocabulario del dominio, añadir pruebas de comportamiento y no crear commits mientras fallen pruebas, tipos o build. Resolver los riesgos de arquitectura e integración antes que el pulido.

## Qué leer antes de cambiar algo

- [README.md](README.md): producto, arranque y comandos.
- [CONTEXT.md](CONTEXT.md): glosario del único contexto de dominio. Usar su vocabulario canónico en issues, planes, pruebas y código.
- [docs/adr/](docs/adr): decisiones y motivos. Si una propuesta contradice un ADR, exponer el conflicto; no anularlo en silencio.
- [docs/diseno-software.md](docs/diseno-software.md): reglas de producto, responsabilidades y contratos de toda la app. Es vinculante.
- [docs/diseno-visual.md](docs/diseno-visual.md): patrones, pantallas, textos y estados. Es vinculante para cualquier cambio de interfaz: reutilizar sus tokens y patrones de interacción.
- [docs/desarrollo.md](docs/desarrollo.md): worktree por issue, validación, `pnpm revisar`, QA manual y entrega.

No añadir rutas, flujos, roles ni capacidades de producto que no exijan la issue en curso o estos documentos aprobados. Una issue funcional no modifica los diseños salvo que lo declare en su alcance; si descubre una contradicción, se detiene y la expone.

## Validación

El hook de pre-commit ejecuta `pnpm validate:commit`: PostgreSQL desechable, migraciones, pruebas de código e integración con `TEST_DATABASE_URL` y revisión de tipos. No hace build ni ejecuta Chromium.

Antes de publicar el candidato final, ejecutar `pnpm validate` una vez sobre su contenido final. Repetirlo si cambian código, pruebas, configuración o dependencias. Agrega build, datos de demostración y pruebas de Chromium sobre ese build con `next start`. `pnpm test:e2e` crea por su cuenta su base desechable y su build. CI mantiene la validación completa en los pull requests y al integrar en master.

Una prueba de integración de PostgreSQL omitida es una validación fallida. No ejecutar pruebas contra la base local `planilla`.

## Issues

Las issues y especificaciones están en GitHub, en `diego-valdettaro/gestor-planilla-patty`. Usar `gh` para todas las operaciones: `gh issue view <n> --comments` para leer una issue con su discusión.

- `type:epic`: alcance de producto y decisiones de implementación. Su título empieza con `[Epic]`, no lleva `ready-for-agent` y ningún agente la ejecuta.
- `type:task`: una porción de implementación verificable por separado, con o sin épica madre. Es el único tipo que un agente ejecuta. Si tiene épica, leer la épica y sus documentos enlazados.
- Los pull requests no son una vía para pedir trabajo.
- Cuando una skill pide «publicar en el issue tracker», crea una issue en ese repo: una especificación se publica como `type:epic`; su división, como tareas `type:task` enlazadas a la épica y con sus bloqueos.

Toda tarea declara sus bloqueos en esta forma exacta, legible por máquina:

```md
## Blocked by

- #123
- #456
```

Sin bloqueos, escribir `None (can start immediately)`. El workflow `.github/workflows/sincronizar-frontera-issues.yml` es dueño de `ready-for-agent`: la pone cuando todos los bloqueos están cerrados, la quita si uno se reabre e ignora issues mal formadas o sin tipo. No poner esa etiqueta a mano.

Una tarea con recorrido en la app incluye `## QA manual` con hasta seis pasos; el formato está en [docs/desarrollo.md](docs/desarrollo.md).

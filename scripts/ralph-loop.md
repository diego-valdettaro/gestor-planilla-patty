# Ralph loop

Una vuelta:

```powershell
.\scripts\ralph-loop.ps1 -MaxIssues 1
```

Modo AFK, limitado a tres issues:

```powershell
.\scripts\ralph-loop.ps1 -Afk -MaxIssues 3
```

Comprobar requisitos sin llamar a Codex:

```powershell
.\scripts\ralph-loop.ps1 -DryRun
```

Elegir modelo:

```powershell
.\scripts\ralph-loop.ps1 -MaxIssues 1 -Model gpt-5.6-sol
```

Crear un worktree y rama aislada para AFK:

```powershell
.\scripts\crear-ralph-worktree.ps1
```

Luego entra al directorio indicado y ejecuta el modo AFK. Los commits no caen en `master`.

Durante la vuelta, Ralph muestra decisiones y validaciones con líneas breves. El log técnico completo queda fuera del repo en `%LOCALAPPDATA%\gestor-planilla-patty\ralph`.

## Repo limpio

`git status --short` no debe mostrar nada. Eso significa que no hay cambios editados, borrados o archivos nuevos sin commit. El loop lo exige para no mezclar ni commitear trabajo que ya estaba en tu carpeta.

Revisa qué falta con:

```powershell
git status
```

# Ralph loop

Una vuelta:

```powershell
.\scripts\ralph-loop.ps1 -MaxIssues 1
```

Hasta terminar o bloquearse:

```powershell
.\scripts\ralph-loop.ps1
```

Comprobar requisitos sin llamar a Codex:

```powershell
.\scripts\ralph-loop.ps1 -DryRun
```

Elegir modelo:

```powershell
.\scripts\ralph-loop.ps1 -MaxIssues 1 -Model gpt-5.6-sol
```

## Repo limpio

`git status --short` no debe mostrar nada. Eso significa que no hay cambios editados, borrados o archivos nuevos sin commit. El loop lo exige para no mezclar ni commitear trabajo que ya estaba en tu carpeta.

Revisa qué falta con:

```powershell
git status
```

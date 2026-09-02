[CmdletBinding()]
param(
  [int]$MaxIssues = 0,
  [string]$Model,
  [switch]$DryRun,
  [switch]$SkipDatabaseCheck
)

$ErrorActionPreference = "Stop"

function Invoke-External {
  param([string]$File, [string[]]$Arguments)
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Falló: $File $($Arguments -join ' ')" }
}

function Get-GitText {
  param([string[]]$Arguments)
  $value = & git @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Falló: git $($Arguments -join ' ')" }
  return ($value -join "`n").Trim()
}

$repoRoot = Get-GitText @("rev-parse", "--show-toplevel")
Set-Location $repoRoot
$schema = Join-Path $repoRoot "scripts/ralph-loop.schema.json"
$logRoot = Join-Path $env:LOCALAPPDATA "gestor-planilla-patty/ralph"
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

foreach ($command in @("git", "gh", "codex", "pnpm")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "No encuentro '$command' en PATH." }
}

Invoke-External gh @("auth", "status", "--hostname", "github.com")

if (-not $SkipDatabaseCheck) {
  $databaseUrl = Get-Content ".env" | Where-Object { $_ -match "^DATABASE_URL=" } | Select-Object -First 1
  if (-not $databaseUrl) { throw "Falta DATABASE_URL en .env. Use -SkipDatabaseCheck solo si los tests no requieren PostgreSQL." }
  if (-not (Test-NetConnection -ComputerName "localhost" -Port 5432 -InformationLevel Quiet)) {
    throw "PostgreSQL no responde en localhost:5432. Levante patty-postgres o use -SkipDatabaseCheck."
  }
}

$prompt = @'
Trabajas en el repositorio gestor-planilla-patty dentro de un Ralph loop.

Tu única tarea en esta ejecución es completar como máximo UN issue elegible. No cierres issues ni escribas comentarios en GitHub: el orquestador lo hará después de verificar tu trabajo.

Invoca explícitamente la skill `/implement` para ejecutar el trabajo del issue. Esta es una instrucción del usuario, no una sugerencia. La skill determina el flujo de implementación y revisión antes del commit.

Proceso obligatorio:
1. Ejecuta `gh issue list --repo diego-valdettaro/gestor-planilla-patty --state open --limit 100` y lee con `gh issue view NUMERO --comments` el contenido completo de todos los issues abiertos. Examina también labels, dependencias y el estado del código.
2. Selecciona el siguiente issue con label `ready-for-agent` que sea implementable. No elijas el épico #1. Respeta dependencias de dominio. Si ninguno es implementable, devuelve outcome `no-issue` o `blocked`, sin modificar archivos.
3. Antes de cambiar código, lee AGENTS.md, CONTEXT.md y los ADRs relevantes. Usa el vocabulario canónico.
4. Implementa solo el alcance del issue elegido. Añade o ajusta tests cuando haga falta. No descartes ni modifiques cambios ajenos.
5. Ejecuta obligatoriamente `pnpm test`, `pnpm typecheck` y `pnpm build` después de la revisión. Corrige los fallos provocados por tu cambio.
6. Si y solo si los tres comandos pasan, crea un commit único y descriptivo que incluya `(#NUMERO)`.

Condiciones de salida:
- `completed`: el issue se implementó, los tres comandos pasaron, existe un commit nuevo y el árbol de trabajo está limpio.
- `blocked`: no puedes continuar sin una decisión humana, sin ocultar el problema ni hacer commit.
- `no-issue`: no hay issue elegible; no hagas cambios.

Tu respuesta final debe ser exclusivamente un JSON válido con las propiedades issue, outcome, summary, commit y tests. `commit` es el SHA completo para completed, y null en otro caso.
'@

$completed = 0
while ($MaxIssues -eq 0 -or $completed -lt $MaxIssues) {
  $statusBefore = Get-GitText @("status", "--porcelain")
  if ($statusBefore) { throw "El árbol de trabajo no está limpio. Resuelva o haga commit de estos cambios antes del loop:`n$statusBefore" }

  if ($DryRun) {
    Write-Host "Dry run: el preflight pasó. Se detiene antes de llamar a Codex."
    break
  }

  $runId = Get-Date -Format "yyyyMMdd-HHmmss"
  $resultFile = Join-Path $logRoot "$runId-result.json"
  $eventFile = Join-Path $logRoot "$runId-events.jsonl"
  $arguments = @("exec", "--output-schema", $schema, "--output-last-message", $resultFile, "--json", "--color", "never")
  if ($Model) { $arguments += @("--model", $Model) }
  $arguments += $prompt

  & codex @arguments 2>&1 | Tee-Object -FilePath $eventFile
  if ($LASTEXITCODE -ne 0) { throw "Codex terminó con error. Log: $eventFile" }
  if (-not (Test-Path $resultFile)) { throw "Codex no produjo el resultado estructurado. Log: $eventFile" }

  try { $result = Get-Content -Raw $resultFile | ConvertFrom-Json } catch { throw "El resultado de Codex no es JSON válido. Archivo: $resultFile" }

  if ($result.outcome -ne "completed") {
    Write-Host "Loop detenido: $($result.outcome). $($result.summary)"
    break
  }

  if (-not $result.commit -or -not (Get-GitText @("rev-parse", "--verify", "$($result.commit)^{commit}"))) {
    throw "Codex informó completion sin un commit verificable. Resultado: $resultFile"
  }
  if ((Get-GitText @("rev-parse", "HEAD")) -ne $result.commit) { throw "El commit informado no es HEAD. Resultado: $resultFile" }
  $statusAfter = Get-GitText @("status", "--porcelain")
  if ($statusAfter) { throw "El agente dejó cambios sin commitear:`n$statusAfter" }

  Invoke-External pnpm @("test")
  Invoke-External pnpm @("typecheck")
  Invoke-External pnpm @("build")

  Invoke-External gh @("issue", "comment", "$($result.issue)", "--repo", "diego-valdettaro/gestor-planilla-patty", "--body", "Implementado en $($result.commit). Validado con pnpm test, pnpm typecheck y pnpm build.")
  Invoke-External gh @("issue", "close", "$($result.issue)", "--repo", "diego-valdettaro/gestor-planilla-patty", "--reason", "completed")
  $completed++
  Write-Host "Issue #$($result.issue) completado en $($result.commit)."
}

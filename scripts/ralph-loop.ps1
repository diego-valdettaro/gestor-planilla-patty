[CmdletBinding()]
param(
  [ValidateRange(1, 50)]
  [int]$MaxIssues = 1,
  [switch]$Afk,
  [string]$Model,
  [switch]$DryRun,
  [switch]$SkipDatabaseCheck
)

$ErrorActionPreference = "Stop"

if ($MaxIssues -gt 1 -and -not $Afk) {
  throw "Para más de una vuelta, confirme el modo autónomo con -Afk."
}

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

$pnpm = Get-Command "pnpm" -ErrorAction SilentlyContinue
$pnpmPrefix = @()
if (-not $pnpm) {
  $corepack = Get-Command "corepack" -ErrorAction SilentlyContinue
  if (-not $corepack) {
    throw "No encuentro pnpm ni Corepack en PATH. Instale pnpm o instale Node.js con Corepack."
  }
  $pnpm = $corepack
  $pnpmPrefix = @("pnpm")
}

$pnpmShimDirectory = Join-Path $env:TEMP "ralph-loop-bin"
New-Item -ItemType Directory -Force -Path $pnpmShimDirectory | Out-Null
$pnpmShim = Join-Path $pnpmShimDirectory "pnpm.cmd"
$pnpmCall = "call `"$($pnpm.Source)`" $($pnpmPrefix -join ' ') %*"
Set-Content -LiteralPath $pnpmShim -Value @("@echo off", $pnpmCall) -Encoding ascii
$env:PATH = "$pnpmShimDirectory;$env:PATH"

function Invoke-Pnpm {
  param([string[]]$Arguments)
  & $script:pnpm.Source @script:pnpmPrefix @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Falló: pnpm $($Arguments -join ' ')" }
}

function Write-LoopHeader {
  param([string]$Title)
  Write-Host ""
  Write-Host "=== $Title ===" -ForegroundColor Cyan
}

function Get-AgentStatus {
  param([string]$Command)
  if ($Command -match "gh issue (list|view)") { return "Revisando issues de GitHub..." }
  if ($Command -match "CONTEXT\.md|docs[/\\]adr") { return "Leyendo contexto y ADRs..." }
  if ($Command -match "pnpm.*(test|vitest)") { return "Ejecutando tests..." }
  if ($Command -match "pnpm.*typecheck") { return "Ejecutando typecheck..." }
  if ($Command -match "pnpm.*build") { return "Generando build..." }
  if ($Command -match "git commit") { return "Creando commit..." }
  if ($Command -match "git status|rg |Get-ChildItem") { return "Explorando el repositorio..." }
  return "Trabajando..."
}

function Write-RunState {
  param([hashtable]$State)
  $State | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8
}

$repoRoot = Get-GitText @("rev-parse", "--show-toplevel")
Set-Location $repoRoot
$schema = Join-Path $repoRoot "scripts/ralph-loop.schema.json"
$logRoot = Join-Path $env:LOCALAPPDATA "gestor-planilla-patty/ralph"
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$stateFile = Join-Path $logRoot "current-run.json"
$progressFile = Join-Path $repoRoot "docs/ralph-progress.md"

foreach ($command in @("git", "gh", "codex")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "No encuentro '$command' en PATH." }
}

$ghAuthOutput = & gh auth status --hostname "github.com" 2>&1
if ($LASTEXITCODE -ne 0) { throw "No se pudo autenticar GitHub: $($ghAuthOutput -join ' ')" }

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

Para informar progreso legible, llama a `./scripts/ralph-status.ps1 "mensaje corto"` después de elegir el issue, al encontrar un bloqueo o fallo relevante, después de las validaciones y antes de terminar. No informes cada comando.

Sigue este flujo de implementación, basado en la skill `implement` del usuario:
- Implementa el trabajo descrito por el issue seleccionado.
- Usa `/tdd` donde sea posible, en seams ya acordados.
- Ejecuta typecheck regularmente, tests individuales regularmente y la suite completa al final.
- Cuando termines, usa `/code-review` para revisar el trabajo.
- Haz commit en la rama actual solo después de la revisión y las validaciones.

Proceso obligatorio:
1. Lee `docs/ralph-progress.md`. Ejecuta `gh issue list --repo diego-valdettaro/gestor-planilla-patty --state open --limit 100` y lee con `gh issue view NUMERO --comments` el contenido completo de todos los issues abiertos. Examina también labels, dependencias y el estado del código.
2. Selecciona el siguiente issue con label `ready-for-agent` que sea implementable. No elijas el épico #1. Prioriza dependencias, decisiones arquitectónicas, integraciones y riesgos antes de mejoras cosméticas. Si ninguno es implementable, devuelve outcome `no-issue` o `blocked`, sin modificar archivos.
3. Antes de cambiar código, lee AGENTS.md, CONTEXT.md y los ADRs relevantes. Usa el vocabulario canónico.
4. Implementa solo el alcance del issue elegido. Añade o ajusta tests cuando haga falta. No descartes ni modifiques cambios ajenos.
5. Ejecuta obligatoriamente `pnpm test`, `pnpm typecheck` y `pnpm build` después de la revisión. Corrige los fallos provocados por tu cambio.
6. Si y solo si los tres comandos pasan, añade una entrada concisa a `docs/ralph-progress.md` con issue, decisión relevante, archivos afectados y bloqueos pendientes. Crea un commit único y descriptivo que incluya `(#NUMERO)`.

Condiciones de salida:
- `completed`: el issue se implementó, los tres comandos pasaron, existe un commit nuevo y el árbol de trabajo está limpio.
- `blocked`: no puedes continuar sin una decisión humana, sin ocultar el problema ni hacer commit.
- `no-issue`: no hay issue elegible; no hagas cambios.

Tu respuesta final debe ser exclusivamente un JSON válido con las propiedades issue, outcome, summary, commit y tests. `commit` es el SHA completo para completed, y null en otro caso.
'@

$completed = 0
Write-LoopHeader "RALPH LOOP"
Write-Host "Repo:       $(Split-Path -Leaf $repoRoot)"
Write-Host "GitHub:     autenticado"
Write-Host "Modo:       $(if ($Afk) { 'AFK' } else { 'HITL' })"
Write-Host "Iteraciones: $MaxIssues"
while ($completed -lt $MaxIssues) {
  $statusBefore = Get-GitText @("status", "--porcelain")
  if ($statusBefore) { throw "El árbol de trabajo no está limpio. Resuelva o haga commit de estos cambios antes del loop:`n$statusBefore" }

  if ($DryRun) {
    Write-Host "Dry run: el preflight pasó. Se detiene antes de llamar a Codex."
    break
  }

  $runId = Get-Date -Format "yyyyMMdd-HHmmss"
  $resultFile = Join-Path $logRoot "$runId-result.json"
  $eventFile = Join-Path $logRoot "$runId-events.jsonl"
  $iteration = $completed + 1
  $baseCommit = Get-GitText @("rev-parse", "HEAD")
  Write-RunState @{ status = "running"; iteration = $iteration; baseCommit = $baseCommit; startedAt = (Get-Date).ToString("o") }
  Write-LoopHeader "Iteración $iteration$(if ($MaxIssues -gt 0) { "/$MaxIssues" })"
  Write-Host "Ejecutando agente..." -ForegroundColor Yellow
  $arguments = @("--dangerously-bypass-approvals-and-sandbox", "exec", "--output-schema", $schema, "--output-last-message", $resultFile, "--json", "--color", "never")
  if ($Model) { $arguments += @("--model", $Model) }
  # En Windows, un prompt multilínea pasado como argumento nativo puede llegar
  # fragmentado a Codex. "-" indica que Codex debe leerlo completo desde stdin.
  $arguments += "-"

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $prompt | & codex @arguments 2>&1 | ForEach-Object {
    $line = $_.ToString()
    Add-Content -LiteralPath $eventFile -Value $line
    try {
      $event = $line | ConvertFrom-Json -ErrorAction Stop
    } catch {
      return
    }

    if ($event.type -eq "item.started" -and $event.item.type -eq "command_execution") {
      Write-Host "  > $(Get-AgentStatus $event.item.command)" -ForegroundColor DarkGray
    }
    if ($event.type -eq "item.completed" -and $event.item.type -eq "command_execution" -and $event.item.exit_code -ne 0) {
      Write-Host "  ! Un comando falló. El agente está revisando y corrigiendo el problema..." -ForegroundColor DarkYellow
    }
    if ($event.type -eq "item.completed" -and $event.item.type -eq "command_execution" -and $event.item.aggregated_output) {
      foreach ($status in ([regex]::Matches($event.item.aggregated_output, '(?m)^\[RALPH\]\s*(.+)$'))) {
        Write-Host "  $($status.Groups[1].Value)" -ForegroundColor White
      }
    }
    if ($event.type -eq "item.completed" -and $event.item.type -eq "agent_message") {
      $message = $event.item.text.Trim()
      if ($message -and $message -notmatch '^\{') { Write-Host $message }
    }
  }
  $codexExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($codexExitCode -ne 0) { throw "Codex terminó con error. Log: $eventFile" }
  if (-not (Test-Path $resultFile)) { throw "Codex no produjo el resultado estructurado. Log: $eventFile" }

  try { $result = Get-Content -Raw $resultFile | ConvertFrom-Json } catch { throw "El resultado de Codex no es JSON válido. Archivo: $resultFile" }

  if ($result.outcome -ne "completed") {
    Write-RunState @{ status = $result.outcome; iteration = $iteration; baseCommit = $baseCommit; summary = $result.summary; finishedAt = (Get-Date).ToString("o") }
    Write-Host "Loop detenido: $($result.outcome). $($result.summary)"
    break
  }

  if (-not $result.commit -or -not (Get-GitText @("rev-parse", "--verify", "$($result.commit)^{commit}"))) {
    throw "Codex informó completion sin un commit verificable. Resultado: $resultFile"
  }
  if ((Get-GitText @("rev-parse", "HEAD")) -ne $result.commit) { throw "El commit informado no es HEAD. Resultado: $resultFile" }
  $statusAfter = Get-GitText @("status", "--porcelain")
  if ($statusAfter) { throw "El agente dejó cambios sin commitear:`n$statusAfter" }

  Write-Host "Validando: pnpm test" -ForegroundColor Yellow
  Invoke-Pnpm @("test")
  Write-Host "Validando: pnpm typecheck" -ForegroundColor Yellow
  Invoke-Pnpm @("typecheck")
  Write-Host "Validando: pnpm build" -ForegroundColor Yellow
  Invoke-Pnpm @("build")

  Invoke-External gh @("issue", "comment", "$($result.issue)", "--repo", "diego-valdettaro/gestor-planilla-patty", "--body", "Implementado en $($result.commit). Validado con pnpm test, pnpm typecheck y pnpm build.")
  Invoke-External gh @("issue", "close", "$($result.issue)", "--repo", "diego-valdettaro/gestor-planilla-patty", "--reason", "completed")
  $completed++
  Write-RunState @{ status = "completed"; iteration = $iteration; baseCommit = $baseCommit; issue = $result.issue; commit = $result.commit; finishedAt = (Get-Date).ToString("o") }
  Write-Host "Issue #$($result.issue) completado en $($result.commit)."
}

Write-LoopHeader "RESUMEN"
Write-Host "Vueltas completadas: $completed"
Write-Host "Estado y logs: $logRoot"

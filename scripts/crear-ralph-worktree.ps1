[CmdletBinding()]
param(
  [string]$Branch = "codex/ralph",
  [string]$DirectoryName = "planilla-ralph"
)

$ErrorActionPreference = "Stop"
$repoRoot = (git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw "Ejecute este script desde un repositorio Git." }
if (git status --porcelain) { throw "El repo principal debe estar limpio antes de crear un worktree." }

$worktree = Join-Path (Split-Path -Parent $repoRoot) $DirectoryName
if (Test-Path $worktree) { throw "Ya existe: $worktree" }
git worktree add -b $Branch $worktree HEAD
if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el worktree." }

Write-Host "Worktree AFK creado: $worktree"
Write-Host "Ejecute allí: .\scripts\ralph-loop.ps1 -Afk -MaxIssues 3"

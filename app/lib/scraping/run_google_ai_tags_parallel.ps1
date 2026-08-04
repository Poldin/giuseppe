# Lancia N worker paralleli EFFICIENTI:
#  1) UN solo scan Supabase → coda locale
#  2) N worker claimano 1 prodotto alla volta (niente rescan catalogo)
#
# Esempio:
#   powershell -File app/lib/scraping/run_google_ai_tags_parallel.ps1 -Workers 10 -Limit 15
#   → coda da 150, ogni worker max 15 claim

param(
    [int]$Workers = 10,
    [double]$StaggerSec = 1.0,
    [double]$PauseMin = 8.0,
    [double]$PauseMax = 20.0,
    [int]$BrowserRestartEvery = 0,
    [int]$Limit = 0,
    [switch]$DryRun,
    [string]$QueueDir = ""
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$Script = Join-Path $PSScriptRoot "google_ai_product_tags.py"
$LogDir = Join-Path $PSScriptRoot "logs\google_ai_tags\parallel"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if ($Workers -lt 1) { throw "Workers deve essere >= 1" }

if ([string]::IsNullOrWhiteSpace($QueueDir)) {
    $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $QueueDir = Join-Path $LogDir "queue_$stamp"
}

# Limit per worker → totale in coda
$QueueLimit = 0
if ($Limit -gt 0) {
    $QueueLimit = $Workers * $Limit
}

Write-Host "Root: $Root"
Write-Host "Workers: $Workers | stagger: ${StaggerSec}s | pause: $PauseMin-$PauseMax | restart ogni $BrowserRestartEvery"
Write-Host "Coda: $QueueDir (build totale=$QueueLimit, claim/worker=$Limit)"
Write-Host "Log worker: $LogDir"
Write-Host ""

# 1) UN solo scan DB
$buildArgs = @("-u", $Script, "--build-queue", $QueueDir)
if ($QueueLimit -gt 0) { $buildArgs += @("--limit", "$QueueLimit") }
Write-Host ">>> Build coda (1 scan Supabase)…"
& python @buildArgs
if ($LASTEXITCODE -ne 0) { throw "build-queue fallito (exit $LASTEXITCODE)" }
Write-Host ""

# 2) Worker da coda
$procs = @()
for ($i = 0; $i -lt $Workers; $i++) {
    $outLog = Join-Path $LogDir "worker_$i.out.log"
    $errLog = Join-Path $LogDir "worker_$i.err.log"
    $args = @(
        "-u", $Script,
        "--from-queue", $QueueDir,
        "--worker", "$i",
        "--pause-min", "$PauseMin",
        "--pause-max", "$PauseMax",
        "--browser-restart-every", "$BrowserRestartEvery"
    )
    if ($Limit -gt 0) { $args += @("--limit", "$Limit") }
    if ($DryRun) { $args += "--dry-run" }

    Write-Host "[$i/$Workers] start → $outLog"
    $p = Start-Process -FilePath "python" `
        -ArgumentList $args `
        -WorkingDirectory $Root `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -PassThru `
        -WindowStyle Normal
    $procs += $p

    if ($i -lt $Workers - 1 -and $StaggerSec -gt 0) {
        Start-Sleep -Seconds $StaggerSec
    }
}

Write-Host ""
Write-Host "Avviati $($procs.Count) processi. PID: $($procs.Id -join ', ')"
Write-Host "Monitor: Get-Content $LogDir\worker_0.out.log -Wait -Tail 30"
Write-Host "Coda:   Get-ChildItem $QueueDir\pending, $QueueDir\done | Measure-Object"

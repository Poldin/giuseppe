# Aggancia lo scraper al TUO Chrome (profilo reale: cookie, login Google, cronologia).
#
# Vincolo: Chrome NON espone CDP se e' gia' aperto "normale".
# Devi chiudere tutte le finestre Chrome e riaprirlo con questo script.
#
# Uso:
#   1) Chiudi TUTTE le finestre di Google Chrome
#   2) powershell -File app/lib/scraping/start_chrome_human.ps1 -UseMyChrome
#   3) python -u app/lib/scraping/google_ai_product_tags.py --missing-only --attach --limit 10
#
# Profilo dedicato (isolato, senza i tuoi cookie):
#   powershell -File app/lib/scraping/start_chrome_human.ps1

param(
    [int]$Port = 9222,
    [string]$ProfileDir = "",
    [switch]$UseMyChrome,
    [switch]$KillExisting
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")

$chromeCandidates = @(
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
    throw "Chrome non trovato."
}

$defaultUserData = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"

if ($UseMyChrome) {
    $ProfileDir = $defaultUserData
} elseif ([string]::IsNullOrWhiteSpace($ProfileDir)) {
    $ProfileDir = Join-Path $Root "app\lib\scraping\logs\google_ai_tags\chrome_human_profile"
    New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null
}

# Se la porta e' gia' in ascolto, riusa quel Chrome
try {
    $probe = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 2
    if ($probe.StatusCode -eq 200) {
        Write-Host "Chrome debug gia attivo su porta $Port - puoi usare --attach"
        Write-Host $probe.Content
        Write-Host ""
        Write-Host "Se questo NON e il tuo Chrome quotidiano, chiudi e rilancia con:"
        Write-Host "  powershell -File app/lib/scraping/start_chrome_human.ps1 -UseMyChrome -KillExisting"
        exit 0
    }
} catch {
    # porta libera
}

$chromeProcs = @(Get-Process -Name "chrome" -ErrorAction SilentlyContinue)
$chromeCount = $chromeProcs.Count
if ($chromeCount -gt 0) {
    if (-not $KillExisting) {
        Write-Host "Chrome e gia in esecuzione ($chromeCount processi)."
        Write-Host "Non posso agganciarmi a caldo: Chrome va riavviato con remote debugging."
        Write-Host ""
        Write-Host "Opzioni:"
        Write-Host "  A) Chiudi TUTTE le finestre Chrome a mano, poi rilancia:"
        Write-Host "       powershell -File app/lib/scraping/start_chrome_human.ps1 -UseMyChrome"
        Write-Host "  B) Oppure lascia che lo script chiuda Chrome e lo riapra:"
        Write-Host "       powershell -File app/lib/scraping/start_chrome_human.ps1 -UseMyChrome -KillExisting"
        exit 1
    }
    Write-Host "Chiudo i processi Chrome esistenti..."
    Get-Process -Name "chrome" -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2
}

Write-Host "Avvio Chrome..."
Write-Host "  exe:     $chrome"
Write-Host "  profilo: $ProfileDir"
if ($UseMyChrome) {
    Write-Host "  mode:    TUO Chrome reale (cookie/login)"
} else {
    Write-Host "  mode:    profilo dedicato scraper"
}
Write-Host "  CDP:     http://127.0.0.1:$Port"
Write-Host ""
Write-Host "Poi: python -u app/lib/scraping/google_ai_product_tags.py --missing-only --attach --limit 10"
Write-Host ""

$launchArgs = @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=$ProfileDir",
    "--no-first-run",
    "--no-default-browser-check"
)
if ($UseMyChrome) {
    $launchArgs += "--profile-directory=Default"
}
$launchArgs += "https://www.google.com/?hl=it"

Start-Process -FilePath $chrome -ArgumentList $launchArgs

Start-Sleep -Seconds 3
try {
    $ok = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 5
    Write-Host "CDP OK:"
    Write-Host $ok.Content
} catch {
    Write-Warning "Chrome avviato ma CDP non ancora raggiungibile su porta $Port. Attendi e riprova --attach."
}

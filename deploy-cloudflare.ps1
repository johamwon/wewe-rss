param(
  [string]$DbName = "wewe_rss"
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) {
  Write-Host "==> $msg"
}

Write-Step "Checking prerequisites"
if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) {
  throw "wrangler not found. Install with: npm i -g wrangler"
}

Write-Step "Logging in to Cloudflare"
wrangler login

Write-Step "Creating D1 database (if it already exists, we will reuse it)"
$dbId = $null
$createOutput = $null
try {
  $createOutput = wrangler d1 create $DbName 2>&1
  $createOutput | Write-Host

  foreach ($line in $createOutput) {
    if ($line -match '"database_id"\s*:\s*"([^"]+)"') {
      $dbId = $matches[1]
    }
  }
} catch {
  Write-Host "Create failed or database already exists. Will try to resolve existing database_id."
}

if (-not $dbId) {
  Write-Step "Database already exists, locating database_id"
  $listOutput = wrangler d1 list 2>&1
  $listOutput | Write-Host
  foreach ($line in $listOutput) {
    if ($line -match $DbName -and $line -match '([0-9a-fA-F-]{36})') {
      $dbId = $matches[1]
      break
    }
  }
}

if ($dbId) {
  Write-Step "Updating wrangler.toml database_id"
  $wranglerPath = "apps/worker/wrangler.toml"
  $wranglerContent = Get-Content $wranglerPath -Raw
  $updatedContent = $wranglerContent -replace 'database_id\s*=\s*".*"', "database_id = `"$dbId`""
  Set-Content -Path $wranglerPath -Value $updatedContent
} else {
  Write-Host "Could not resolve database_id. Update apps/worker/wrangler.toml manually."
}

Write-Step "Apply schema to D1 (remote)"
Push-Location "apps/worker"
wrangler d1 execute $DbName --file=.\schema.sql --remote
Pop-Location

Write-Step "Set secrets"
Push-Location "apps/worker"
wrangler secret put AUTH_CODE
wrangler secret put ACCOUNT_CHECK_WEBHOOK_URL
Pop-Location

Write-Step "Deploy Worker"
Push-Location "apps/worker"
wrangler deploy
Pop-Location

Write-Host ""
Write-Host "Next: deploy Pages"
Write-Host "- Build command: pnpm --filter web build"
Write-Host "- Output directory: apps/web/dist"
Write-Host "- Env vars: VITE_SERVER_ORIGIN_URL, VITE_ENABLED_AUTH_CODE"

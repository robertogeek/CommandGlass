# Busca la carpeta LIVE de Star Citizen para el instalador de CommandGlass. Solo lee.
# Devuelve la ruta por la salida estándar, o nada si no la encuentra.
$ErrorActionPreference = 'SilentlyContinue'

function Test-GameDir([string]$dir) {
  if (-not $dir) { return $false }
  return (Test-Path -LiteralPath (Join-Path $dir 'Data.p4k')) -or (Test-Path -LiteralPath (Join-Path $dir 'Game.log'))
}

# 1. El lanzador de RSI apunta desde dónde arranca el juego.
foreach ($name in @('log.log', 'log.old.log')) {
  $log = Join-Path $env:APPDATA "rsilauncher\logs\$name"
  if (-not (Test-Path -LiteralPath $log)) { continue }
  $hits = Select-String -LiteralPath $log -Pattern 'Launching Star Citizen (\w+) from \((.+?)\)' -AllMatches
  $dirs = @($hits | ForEach-Object { $_.Matches } | ForEach-Object {
      [pscustomobject]@{ Channel = $_.Groups[1].Value; Dir = ($_.Groups[2].Value -replace '\\\\', '\') }
    })
  [array]::Reverse($dirs)
  foreach ($d in @($dirs | Where-Object { $_.Channel -eq 'LIVE' }) + @($dirs | Where-Object { $_.Channel -ne 'LIVE' })) {
    if (Test-GameDir $d.Dir) { Write-Output $d.Dir; exit 0 }
  }
}

# 2. Rutas habituales en todas las unidades.
$subs = @(
  'Program Files\Roberts Space Industries\StarCitizen\LIVE',
  'Roberts Space Industries\StarCitizen\LIVE',
  'StarCitizen\LIVE',
  'Games\Roberts Space Industries\StarCitizen\LIVE',
  'Games\StarCitizen\LIVE',
  'Program Files (x86)\Roberts Space Industries\StarCitizen\LIVE'
)
foreach ($drive in (Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root -match '^[A-Z]:\\$' })) {
  foreach ($s in $subs) {
    $dir = Join-Path $drive.Root $s
    if (Test-GameDir $dir) { Write-Output $dir; exit 0 }
  }
}
exit 0

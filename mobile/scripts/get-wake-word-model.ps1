# Downloads the free Vosk English model used for the "Gigi" wake word into the Android assets.
# The model (~68 MB) is not stored in git. Run once before building the Android app:
#   powershell -ExecutionPolicy Bypass -File mobile/scripts/get-wake-word-model.ps1
$ErrorActionPreference = 'Stop'
$name = 'vosk-model-small-en-us-0.15'
$assets = Join-Path $PSScriptRoot '..\android\app\src\main\assets'
$target = Join-Path $assets 'vosk-model-en'
if (Test-Path (Join-Path $target 'am\final.mdl')) { Write-Host 'Wake word model already present.'; exit 0 }

$temp = Join-Path ([IO.Path]::GetTempPath()) "vosk-$([guid]::NewGuid())"
New-Item -ItemType Directory -Force $temp | Out-Null
try {
  $zip = Join-Path $temp "$name.zip"
  Write-Host "Downloading $name..."
  Invoke-WebRequest "https://alphacephei.com/vosk/models/$name.zip" -OutFile $zip
  Expand-Archive $zip -DestinationPath $temp
  New-Item -ItemType Directory -Force $assets | Out-Null
  if (Test-Path $target) { Remove-Item -Recurse -Force $target }
  Move-Item (Join-Path $temp $name) $target
  Write-Host "Saved to $target"
} finally {
  Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
}

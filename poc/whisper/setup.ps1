$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$pocLocal = Join-Path $repoRoot '.local/whisper-poc'
$pocLock = Get-Content (Join-Path $PSScriptRoot 'lock.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force $pocLocal | Out-Null
$sourcePath = Join-Path $pocLocal 'source'
if (-not (Test-Path $sourcePath)) {
    git -c core.autocrlf=false clone --branch echogarden-fork --single-branch $pocLock.fork $sourcePath
    if ($LASTEXITCODE -ne 0) { throw 'Clone failed' }
    git -C $sourcePath checkout --detach $pocLock.commit
    if ($LASTEXITCODE -ne 0) { throw 'Checkout failed' }
}
$modelPath = Join-Path $pocLocal $pocLock.model.file
if (-not (Test-Path $modelPath)) {
    curl.exe -L --fail --retry 3 -o "$modelPath.partial" $pocLock.model.url
    if ($LASTEXITCODE -ne 0) { throw 'Download failed' }
    if ((Get-FileHash "$modelPath.partial" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pocLock.model.sha256) { throw 'Model hash mismatch' }
    Move-Item -LiteralPath "$modelPath.partial" -Destination $modelPath
}
node (Join-Path $PSScriptRoot 'prepare.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Input verification failed' }
$dockerExe = if ($env:DOCKER) { $env:DOCKER } else { 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' }
& $dockerExe run --rm --name whisper-poc-build -v "${repoRoot}:/work" -w /work $pocLock.buildImage bash poc/whisper/build.sh
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }

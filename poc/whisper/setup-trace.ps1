$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$pocLocal = Join-Path $repoRoot '.local/whisper-poc'
$pocLock = Get-Content (Join-Path $PSScriptRoot 'lock.json') -Raw | ConvertFrom-Json
node (Join-Path $PSScriptRoot 'prepare.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Baseline input verification failed; run setup.ps1 first' }
$sourcePath = Join-Path $pocLocal 'source-trace'
if (-not (Test-Path $sourcePath)) {
    # Independent objects: paths remain valid both on Windows and in Docker.
    git clone --no-hardlinks --config core.autocrlf=false (Join-Path $pocLocal 'source') $sourcePath
    if ($LASTEXITCODE -ne 0) { throw 'Diagnostic clone failed' }
}
node (Join-Path $PSScriptRoot 'instrument.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Instrumentation failed' }
$dockerExe = if ($env:DOCKER) { $env:DOCKER } else { 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' }
& $dockerExe run --rm --name whisper-trace-build -v "${repoRoot}:/work" -w /work $pocLock.buildImage bash poc/whisper/build-trace.sh
if ($LASTEXITCODE -ne 0) { throw 'Diagnostic build failed' }

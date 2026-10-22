param([int]$IntervalSeconds = 5, [ValidatePattern('^[a-zA-Z0-9-]+$')][string]$OutputName = 'chrome-memory')
$ErrorActionPreference = 'Stop'
$resultsDir = Join-Path $PSScriptRoot '../../.local/results'
New-Item -ItemType Directory -Force -Path $resultsDir | Out-Null
$outputPath = Join-Path $resultsDir "$OutputName.jsonl"
[System.IO.File]::WriteAllText($outputPath, '')
Set-Content -LiteralPath (Join-Path $resultsDir 'memory-monitor.pid') -Value $PID
Write-Output "Recording all-Chrome memory samples. PID: $PID"
while ($true) {
    $chromeGpuIds = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
        Where-Object { $_.CommandLine -like '*--type=gpu-process*' } |
        ForEach-Object { $_.ProcessId })
    $gpuMemory = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory |
        Where-Object {
            $entryName = $_.Name
            @($chromeGpuIds | Where-Object { $entryName -like "pid_$($_)_*" }).Count -gt 0
        } | Select-Object Name, DedicatedUsage, SharedUsage, TotalCommitted)
    $chromePrivateBytes = (Get-Process chrome -ErrorAction SilentlyContinue |
        Measure-Object -Property PrivateMemorySize64 -Sum).Sum
    $sample = @{
        at = [DateTime]::UtcNow.ToString('o')
        scope = 'all Chrome processes and Chrome GPU processes, includes other tabs'
        chromePrivateBytes = $chromePrivateBytes
        gpu = $gpuMemory
    }
    $sample | ConvertTo-Json -Compress -Depth 5 | Add-Content -LiteralPath $outputPath -Encoding utf8
    Start-Sleep -Seconds $IntervalSeconds
}

param([switch]$CheckOnly, [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
try {
    $ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
    $manifest = Get-Content -LiteralPath (Join-Path $ProjectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $versionedExe = Join-Path $ProjectRoot "dist\v$($manifest.version)\LiveShoppingSimulator-win32-x64\LiveShoppingSimulator.exe"
    $developmentExe = Join-Path $ProjectRoot 'node_modules\electron\dist\electron.exe'
    if (Test-Path -LiteralPath $versionedExe) {
        $targetExe = $versionedExe
        $launchArguments = @()
    } elseif (Test-Path -LiteralPath $developmentExe) {
        $targetExe = $developmentExe
        $launchArguments = @('"' + $ProjectRoot + '"')
    } else {
        throw 'Current build is missing. Run pnpm package or install dependencies. The old build was not launched.'
    }
    # Inspection mode has no process or save side effects.
    if ($CheckOnly) {
        [pscustomobject]@{ version = $manifest.version; executable = $targetExe; arguments = $launchArguments } | ConvertTo-Json -Compress
        exit 0
    }
    $distributionRoot = (Join-Path $ProjectRoot 'dist') + [IO.Path]::DirectorySeparatorChar
    $oldProcesses = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -and $_.Path.StartsWith($distributionRoot, [StringComparison]::OrdinalIgnoreCase) -and
        $_.ProcessName -eq 'LiveShoppingSimulator' -and $_.Path -ne $targetExe
    })
    foreach ($running in $oldProcesses) {
        if ($running.MainWindowHandle -ne 0) { [void]$running.CloseMainWindow() }
    }
    foreach ($running in $oldProcesses) {
        if (-not $running.HasExited -and -not $running.WaitForExit(10000)) {
            throw 'The old game is still running. Please close its window, then launch again. No process was force-terminated.'
        }
    }
    $launch = @{ FilePath = $targetExe; WorkingDirectory = $ProjectRoot }
    if ($launchArguments.Count) { $launch.ArgumentList = $launchArguments }
    Start-Process @launch
} catch {
    if ($CheckOnly) { Write-Error $_; exit 1 }
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Live Shopping Simulator - Launch', 'OK', 'Warning')
    exit 1
}

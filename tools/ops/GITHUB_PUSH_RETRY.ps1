$ErrorActionPreference = "Stop"

Write-Host "=== GitHub push retry ===" -ForegroundColor Cyan

$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
    foreach ($candidate in @(
        "C:\Program Files\Git\cmd\git.exe",
        "C:\Program Files\Git\bin\git.exe"
    )) {
        if (Test-Path -LiteralPath $candidate) {
            $git = Get-Item $candidate
            break
        }
    }
}
if (-not $git) { throw "Git not found." }

$GitExe = $git.Source
if (-not $GitExe) { $GitExe = $git.FullName }

& $GitExe rev-parse --is-inside-work-tree | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Not inside a Git repository." }

$origin = (& $GitExe remote get-url origin 2>$null)
if (-not $origin) { throw "Git origin is not configured." }

Write-Host "Origin: $origin" -ForegroundColor Green
Write-Host "`n=== Local status ===" -ForegroundColor Cyan
& $GitExe status --short

Write-Host "`n=== Recent local commits ===" -ForegroundColor Cyan
& $GitExe log --oneline -5

# Lightweight connectivity diagnostics. Failure here does not immediately stop push attempts.
Write-Host "`n=== github.com:443 connectivity ===" -ForegroundColor Cyan
try {
    $tnc = Test-NetConnection github.com -Port 443 -WarningAction SilentlyContinue
    Write-Host ("TcpTestSucceeded: " + $tnc.TcpTestSucceeded)
} catch {
    Write-Host "Connectivity diagnostic unavailable; continuing." -ForegroundColor Yellow
}

$attempts = @(
    @{ Label = "normal"; Args = @("push","origin","HEAD") },
    @{ Label = "HTTP/1.1"; Args = @("-c","http.version=HTTP/1.1","push","origin","HEAD") },
    @{ Label = "normal retry"; Args = @("push","origin","HEAD") },
    @{ Label = "HTTP/1.1 retry"; Args = @("-c","http.version=HTTP/1.1","push","origin","HEAD") },
    @{ Label = "final normal"; Args = @("push","origin","HEAD") },
    @{ Label = "final HTTP/1.1"; Args = @("-c","http.version=HTTP/1.1","push","origin","HEAD") }
)

for ($i = 0; $i -lt $attempts.Count; $i++) {
    $item = $attempts[$i]
    Write-Host ("`nPush attempt {0}/{1} [{2}]" -f ($i+1), $attempts.Count, $item.Label) -ForegroundColor Cyan

    & $GitExe @($item.Args)
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`nPUSH_SUCCEEDED" -ForegroundColor Green

        Write-Host "`n=== Post-push status ===" -ForegroundColor Cyan
        & $GitExe status -sb

        exit 0
    }

    if ($i -lt $attempts.Count - 1) {
        $sleep = 5 * ($i + 1)
        Write-Host "Push failed; waiting $sleep seconds before retry..." -ForegroundColor Yellow
        Start-Sleep -Seconds $sleep
    }
}

throw "GitHub push failed after all retries. Local commits are preserved and can be pushed later."

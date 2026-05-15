# Project Bronco — Sequential Issue Runner
# Run from project root: .\bronco\run.ps1
# Requires Claude Code CLI to be installed (claude command available)

$issues = @(
    @{ file = "170-b2-request-modal";           number = 170; branch = "jake/170-b2-request-modal" },
    @{ file = "171-b3-floating-pill";            number = 171; branch = "jake/171-b3-floating-pill" },
    @{ file = "172-b4-requests-overlay";         number = 172; branch = "jake/172-b4-requests-overlay" },
    @{ file = "173-p2-a1-editorial-collections"; number = 173; branch = "jake/173-p2-a1-editorial-collections" },
    @{ file = "174-p2-a2-spots";                 number = 174; branch = "jake/174-p2-a2-spots" },
    @{ file = "175-p2-a3-waitlist";              number = 175; branch = "jake/175-p2-a3-waitlist" },
    @{ file = "176-p2-a4-analytics";             number = 176; branch = "jake/176-p2-a4-analytics" },
    @{ file = "177-p2-b1-push-notifications";    number = 177; branch = "jake/177-p2-b1-push-notifications" },
    @{ file = "178-p3-a1-native-prep";           number = 178; branch = "jake/178-p3-a1-native-prep" },
    @{ file = "179-p3-a2-pos-integration";       number = 179; branch = "jake/179-p3-a2-pos-integration" },
    @{ file = "180-p4-a1-diner-deposit";         number = 180; branch = "jake/180-p4-a1-diner-deposit" },
    @{ file = "181-p4-a2-venue-saas";            number = 181; branch = "jake/181-p4-a2-venue-saas" }
)

# Allow starting from a specific issue (e.g. .\bronco\run.ps1 172)
$startFrom = if ($args[0]) { [int]$args[0] } else { 0 }

$contextContent = Get-Content "$PSScriptRoot\context.md" -Raw

foreach ($issue in $issues) {
    if ($issue.number -lt $startFrom) {
        Write-Host "Skipping #$($issue.number) (resume mode)" -ForegroundColor DarkGray
        continue
    }

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host " Issue #$($issue.number): $($issue.file)"    -ForegroundColor Cyan
    Write-Host " Branch: $($issue.branch)"                   -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan

    $issueFile = "$PSScriptRoot\issues\$($issue.file).md"
    if (-not (Test-Path $issueFile)) {
        Write-Host "ERROR: Issue file not found: $issueFile" -ForegroundColor Red
        break
    }

    $issueContent = Get-Content $issueFile -Raw
    $fullPrompt = $contextContent + "`n`n---`n`n" + $issueContent

    # Write combined prompt to temp file so claude reads it cleanly
    $tmpPrompt = "$PSScriptRoot\.current-prompt.md"
    $fullPrompt | Out-File $tmpPrompt -Encoding utf8

    # Run Claude non-interactively with the combined prompt
    claude -p (Get-Content $tmpPrompt -Raw)

    Remove-Item $tmpPrompt -ErrorAction SilentlyContinue

    Write-Host ""
    Write-Host "Issue #$($issue.number) complete." -ForegroundColor Green
    Write-Host "Next: Review the PR on GitHub, run any Supabase migrations Claude flagged," -ForegroundColor Yellow
    Write-Host "      then check bronco/issues/$($issues[$issues.IndexOf($issue) + 1].file).md for upstream learnings." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Press Enter to start the next issue, or Ctrl+C to stop here." -ForegroundColor White
    Read-Host
}

Write-Host ""
Write-Host "All Bronco issues complete." -ForegroundColor Green

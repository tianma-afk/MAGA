<#
.SYNOPSIS
Render original book/Chapter N*.pptx slides using installed Windows PowerPoint.
.DESCRIPTION
No downloads or online conversion services. Requires an interactive Windows
desktop and an activated PowerPoint installation. Refuses an existing PowerPoint
process because COM activation does not guarantee an isolated application.
Do not open PowerPoint while this script runs. Office itself may display security
or activation dialogs; this script never requests a visible presentation window,
changes trust settings, kills processes, or dismisses dialogs.
Output is data/slides/chapter-N/1.png, 2.png, ... (one-based, unpadded).
Existing images require -Overwrite. Only matching numeric PNGs are replaced.
.EXAMPLE
pwsh -NoProfile -STA -File scripts/render-slides.ps1
.EXAMPLE
pwsh -NoProfile -STA -File scripts/render-slides.ps1 -Chapter 1 -Overwrite
#>
[CmdletBinding()]
param(
    [string]$BookDirectory,
    [string]$OutputDirectory,
    [int[]]$Chapter,
    [ValidateRange(320, 7680)][int]$Width = 1600,
    [switch]$Overwrite
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $BookDirectory) { $BookDirectory = Join-Path $scriptDirectory '../book' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $scriptDirectory '../data/slides' }

function Release-ComObject($Object) {
    if ($null -ne $Object -and [Runtime.InteropServices.Marshal]::IsComObject($Object)) {
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($Object)
    }
}

if ([Environment]::OSVersion.Platform -ne 'Win32NT') {
    throw 'Rendering requires Windows and desktop Microsoft PowerPoint.'
}
if ([Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') {
    throw 'Run with powershell.exe -STA or pwsh -STA.'
}
if (@(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count -gt 0) {
    throw 'PowerPoint is already running. Close it yourself before retrying; no COM calls were made.'
}
if ($null -eq [type]::GetTypeFromProgID('PowerPoint.Application')) {
    throw 'PowerPoint COM is unavailable. Install/activate desktop PowerPoint, or use LibreOffice with a PDF renderer.'
}

$book = (Resolve-Path -LiteralPath $BookDirectory).Path
$output = [IO.Path]::GetFullPath($OutputDirectory)
$decks = @(Get-ChildItem -LiteralPath $book -File | ForEach-Object {
    if ($_.Name -match '^Chapter\s+(\d+).*\.pptx$') {
        $number = [int]$Matches[1]
        if (-not $Chapter -or $number -in $Chapter) {
            [pscustomobject]@{ Number = $number; File = $_.FullName }
        }
    }
} | Sort-Object Number)
if ($decks.Count -eq 0) { throw "No matching Chapter N*.pptx files in $book." }
if (@($decks | Group-Object Number | Where-Object Count -gt 1).Count) {
    throw 'Multiple source decks map to the same chapter. Resolve duplicate chapter numbers first.'
}
foreach ($requested in $Chapter) {
    if ($requested -notin $decks.Number) { throw "No source deck for chapter $requested." }
}
foreach ($deck in $decks) {
    $target = Join-Path $output "chapter-$($deck.Number)"
    if (-not $Overwrite -and (Test-Path -LiteralPath $target)) {
        $existing = @(Get-ChildItem -LiteralPath $target -File | Where-Object Name -Match '^\d+\.png$')
        if ($existing.Count) { throw "PNG output exists in $target. Use -Overwrite to replace it." }
    }
}

$app = $null
$presentations = $null
$ownsApplication = $false
$securityChanged = $false
$oldSecurity = $null
$total = 0
try {
    # Recheck immediately before COM activation to narrow the startup race.
    if (@(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count) {
        throw 'PowerPoint started during preflight. Aborting without COM activation.'
    }
    $app = New-Object -ComObject PowerPoint.Application
    $presentations = $app.Presentations
    if ($presentations.Count -ne 0) {
        throw 'COM returned an application with open decks. Leaving it untouched.'
    }
    $ownsApplication = $true
    $oldSecurity = $app.AutomationSecurity
    $app.AutomationSecurity = 3 # msoAutomationSecurityForceDisable
    $securityChanged = $true
    foreach ($deck in $decks) {
        $presentation = $null
        $slides = $null
        $pageSetup = $null
        $target = Join-Path $output "chapter-$($deck.Number)"
        [void][IO.Directory]::CreateDirectory($target)
        # Stage a complete chapter before publishing any image.
        $staging = Join-Path $target ('.render-' + [guid]::NewGuid().ToString('N'))
        [void][IO.Directory]::CreateDirectory($staging)
        try {
            if ($presentations.Count -ne 0) {
                throw 'Another presentation was opened. Stopping without touching that deck.'
            }
            $presentation = $presentations.Open($deck.File, -1, 0, 0)
            $slides = $presentation.Slides
            $pageSetup = $presentation.PageSetup
            $height = [int][Math]::Round($Width * $pageSetup.SlideHeight / $pageSetup.SlideWidth)
            $count = $slides.Count
            for ($i = 1; $i -le $count; $i++) {
                $slide = $null
                try {
                    $slide = $slides.Item($i)
                    $image = Join-Path $staging "$i.png"
                    $slide.Export($image, 'PNG', $Width, $height)
                    if (-not (Test-Path -LiteralPath $image) -or (Get-Item -LiteralPath $image).Length -lt 8) {
                        throw "PowerPoint did not produce slide $i."
                    }
                } finally {
                    Release-ComObject $slide
                }
            }
            for ($i = 1; $i -le $count; $i++) {
                Move-Item -LiteralPath (Join-Path $staging "$i.png") -Destination (Join-Path $target "$i.png") -Force:$Overwrite
            }
            if ($Overwrite) {
                Get-ChildItem -LiteralPath $target -File | Where-Object {
                    $_.Name -match '^(\d+)\.png$' -and [int]$Matches[1] -gt $count
                } | ForEach-Object { Remove-Item -LiteralPath $_.FullName }
            }
            $total += $count
            Write-Output "Chapter $($deck.Number): $count PNGs ($Width x $height) -> $target"
        } finally {
            Release-ComObject $pageSetup
            Release-ComObject $slides
            if ($null -ne $presentation) {
                try { $presentation.Close() }
                catch { Write-Warning "Could not close the script's deck: $($_.Exception.Message)" }
                finally { Release-ComObject $presentation }
            }
            # Delete only this run's verified staging path, never the chapter folder.
            $resolvedStaging = [IO.Path]::GetFullPath($staging)
            $expectedParent = [IO.Path]::GetFullPath($target)
            if ([IO.Path]::GetDirectoryName($resolvedStaging) -eq $expectedParent -and
                [IO.Path]::GetFileName($resolvedStaging) -match '^\.render-[a-f0-9]{32}$') {
                Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
            }
        }
    }
    Write-Output "Rendered $total original slide images."
} catch {
    throw "Slide rendering failed: $($_.Exception.Message) No visible-window fallback or process termination was attempted."
} finally {
    if ($null -ne $app -and $ownsApplication) {
        try {
            if ($securityChanged) { $app.AutomationSecurity = $oldSecurity }
            # A user may have opened a deck during export. Never quit with any deck open.
            if ($null -ne $presentations -and $presentations.Count -eq 0) { $app.Quit() }
            else { Write-Warning 'PowerPoint still has a presentation open; leaving the application running.' }
        } catch { Write-Warning "PowerPoint cleanup: $($_.Exception.Message)" }
    }
    Release-ComObject $presentations
    Release-ComObject $app
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

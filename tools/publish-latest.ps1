$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$postsRoot = Join-Path $root 'source\_posts'

if (-not (Test-Path -LiteralPath (Join-Path $root '.git'))) {
  throw "Git repository not found: $root"
}

$posts = Get-ChildItem -LiteralPath $postsRoot -Filter '*.md' -File
if (-not $posts) {
  throw "No Markdown posts found in $postsRoot"
}

$candidates = foreach ($post in $posts) {
  $content = Get-Content -LiteralPath $post.FullName -Raw -Encoding UTF8
  $frontMatter = [regex]::Match($content, '(?ms)^---\s*(.*?)\s*---')
  $dateText = ''
  $title = [IO.Path]::GetFileNameWithoutExtension($post.Name)
  if ($frontMatter.Success) {
    $dateMatch = [regex]::Match($frontMatter.Groups[1].Value, '(?m)^date:\s*["'' ]?([^"''\r\n]+)')
    if ($dateMatch.Success) { $dateText = $dateMatch.Groups[1].Value.Trim() }
    $titleMatch = [regex]::Match($frontMatter.Groups[1].Value, '(?m)^title:\s*["'' ]?([^"''\r\n]+)')
    if ($titleMatch.Success) { $title = $titleMatch.Groups[1].Value.Trim() }
  }

  $date = [datetime]::MinValue
  $parsed = [datetime]::TryParse($dateText, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AllowWhiteSpaces, [ref]$date)
  if (-not $parsed) { $date = $post.LastWriteTime }
  [pscustomobject]@{ File = $post; Date = $date; Title = $title }
}

$latest = $candidates | Sort-Object Date, @{ Expression = { $_.File.LastWriteTime }; Descending = $true } -Descending | Select-Object -First 1
$relative = $latest.File.FullName.Substring($root.Length).TrimStart('\')
$relativeGit = $relative -replace '\\', '/'
$latestContent = Get-Content -LiteralPath $latest.File.FullName -Raw -Encoding UTF8
$filesToStage = [System.Collections.Generic.List[string]]::new()
$filesToStage.Add($relativeGit)

# Include local images referenced by the post; remote URLs need no Git file.
$assetMatches = [regex]::Matches($latestContent, '(?:!\[[^\]]*\]\(|(?:^|\s)cover:\s*)(/img/[^\s\)]+)')
foreach ($match in $assetMatches) {
  $assetUrl = $match.Groups[1].Value -replace '[?#].*$', ''
  try { $assetPath = [Uri]::UnescapeDataString($assetUrl) } catch { $assetPath = $assetUrl }
  $assetRelative = ('source' + $assetPath) -replace '/', '\'
  if ((Test-Path -LiteralPath (Join-Path $root $assetRelative)) -and -not $filesToStage.Contains($assetRelative)) {
    $filesToStage.Add($assetRelative)
  }
}

Write-Host "Newest post: $($latest.Title)"
Write-Host "Date: $($latest.Date.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Host "File: $relativeGit"

& git -C $root add -- $filesToStage
if ($LASTEXITCODE -ne 0) { throw 'git add failed' }

$staged = (& git -C $root diff --cached --name-only -- $filesToStage)
if (-not $staged) {
  Write-Host 'No changes in the newest post. Nothing to commit.'
  exit 0
}

Write-Host 'Staged files:'
$staged | ForEach-Object { Write-Host "  $_" }

$messageTitle = ($latest.Title -replace '[\r\n]+', ' ').Trim()
if ($messageTitle.Length -gt 60) { $messageTitle = $messageTitle.Substring(0, 60).Trim() }
$commitMessage = "docs: publish $messageTitle"
& git -C $root commit -m $commitMessage
if ($LASTEXITCODE -ne 0) { throw 'git commit failed' }

& git -C $root push origin main
if ($LASTEXITCODE -ne 0) { throw 'git push failed' }

Write-Host 'Pushed successfully to origin/main.'

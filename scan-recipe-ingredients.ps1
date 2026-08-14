# ============================================================
#  SCAN-RECIPE-INGREDIENTS — The Kitchen Notebook
#
#  Scans every recipe .json file in the specified folder and builds:
#
#    1. all-ingredients.json
#       Every unique ingredient name + which recipes use it.
#
#    2. ingredient-review.txt
#       A human-readable report flagging variants, potential typos,
#       and a full A-Z list of all ingredients.
# ============================================================

Add-Type -AssemblyName System.Windows.Forms

# ── Where to save the output ───────────────────────────────
$outputDir = $PSScriptRoot
if (-not $outputDir) { $outputDir = (Get-Location).Path }

# ── Step 1: Set the folder path containing the recipe JSON files ──
$recipeFolder = "D:\mysites\ajpc\data\recipes"

# Verify the path exists before proceeding
if (-not (Test-Path -Path $recipeFolder -PathType Container)) {
    Write-Host "The specified folder does not exist: $recipeFolder" -ForegroundColor Red
    exit
}

Write-Host "`nScanning: $recipeFolder" -ForegroundColor Cyan

# ── Step 2: Find every .json file (including subfolders) ──
$jsonFiles = Get-ChildItem -Path $recipeFolder -Filter *.json -Recurse -File

if ($jsonFiles.Count -eq 0) {
    Write-Host "No .json files found in that folder." -ForegroundColor Red
    exit
}

Write-Host "Found $($jsonFiles.Count) JSON file(s). Reading...`n" -ForegroundColor Cyan

# ── Step 3: Parse each file and pull out ingredients ──
$ingredientMap = @{}
$skippedFiles  = New-Object System.Collections.Generic.List[string]
$badFiles      = New-Object System.Collections.Generic.List[object]
$recipeCount   = 0

foreach ($file in $jsonFiles) {
    try {
        $raw = Get-Content -Path $file.FullName -Raw -Encoding UTF8
        $recipe = $raw | ConvertFrom-Json -ErrorAction Stop
    } catch {
        $badFiles.Add([PSCustomObject]@{ File = $file.FullName; Error = $_.Exception.Message })
        continue
    }

    if (-not $recipe.ingredients -or $recipe.ingredients.Count -eq 0) {
        $skippedFiles.Add($file.FullName)
        continue
    }

    $recipeCount++
    $title = if ($recipe.title) { $recipe.title } elseif ($recipe.name) { $recipe.name } else { $file.BaseName }
    $id    = if ($recipe.id) { $recipe.id } else { $file.BaseName }

    foreach ($ing in $recipe.ingredients) {
        if ($ing -is [string]) {
            $rawName = $ing
        } else {
            # Skip structural headings. Preserve toTaste ingredients.
            if ($ing.heading -eq $true) { continue }
            $rawName = if ($ing.item) { $ing.item } elseif ($ing.name) { $ing.name } else { $null }
        }
        if (-not $rawName) { continue }

        $key = $rawName.ToString().Trim().ToLower()
        if (-not $key) { continue }

        if (-not $ingredientMap.ContainsKey($key)) {
            $ingredientMap[$key] = New-Object System.Collections.Generic.List[object]
        }

        $alreadyListed = $ingredientMap[$key] | Where-Object { $_.id -eq $id }
        if (-not $alreadyListed) {
            $ingredientMap[$key].Add([PSCustomObject]@{
                title = $title
                id    = $id
                file  = $file.FullName
            })
        }
    }
}

Write-Host "Parsed $recipeCount recipe file(s) with ingredients."
Write-Host "Found $($ingredientMap.Count) unique ingredient name(s)."
if ($skippedFiles.Count -gt 0) {
    Write-Host "$($skippedFiles.Count) file(s) had no ingredients array (skipped)." -ForegroundColor DarkYellow
}
if ($badFiles.Count -gt 0) {
    Write-Host "$($badFiles.Count) file(s) failed to parse:" -ForegroundColor Red
    $badFiles | ForEach-Object { Write-Host "  $($_.File) - $($_.Error)" -ForegroundColor Red }
}

# ── Step 4: Write all-ingredients.json ──
$allIngredients = $ingredientMap.Keys | Sort-Object | ForEach-Object {
    [PSCustomObject]@{
        name        = $_
        recipeCount = $ingredientMap[$_].Count
        recipes     = @($ingredientMap[$_] | Sort-Object title) # Force array structure
    }
}

$jsonOutPath = Join-Path $outputDir "all-ingredients.json"
$jsonString  = $allIngredients | ConvertTo-Json -Depth 6

# Unescape unicode sequences (like \u0026 -> &) safely without breaking standard JSON escapes
$decodedJson = [regex]::Replace($jsonString, '\\u([0-9a-fA-F]{4})', {
    param($match)
    [char][int]"0x$($match.Groups[1].Value)"
})

$decodedJson | Out-File -FilePath $jsonOutPath -Encoding UTF8
Write-Host "`nWrote: $jsonOutPath" -ForegroundColor Green

# ── Step 5: Flag possible duplicates / near-duplicates for review ──

# Levenshtein edit distance using a jagged array to prevent casting errors
function Get-LevenshteinDistance {
    param([string]$a, [string]$b)
    $lenA = $a.Length
    $lenB = $b.Length
    
    # Initialize the jagged array
    $d = New-Object 'int[][]' ($lenA + 1)
    for ($i = 0; $i -le $lenA; $i++) {
        $d[$i] = New-Object 'int[]' ($lenB + 1)
        $d[$i][0] = $i
    }
    for ($j = 0; $j -le $lenB; $j++) {
        $d[0][$j] = $j
    }
    
    for ($i = 1; $i -le $lenA; $i++) {
        for ($j = 1; $j -le $lenB; $j++) {
            $cost = if ($a[$i - 1] -eq $b[$j - 1]) { 0 } else { 1 }
            
            $delete = $d[$i - 1][$j] + 1
            $insert = $d[$i][$j - 1] + 1
            $substitute = $d[$i - 1][$j - 1] + $cost
            
            # Simple minimum calculation
            $minVal = if ($delete -lt $insert) { $delete } else { $insert }
            $d[$i][$j] = if ($substitute -lt $minVal) { $substitute } else { $minVal }
        }
    }
    return $d[$lenA][$lenB]
}

$names = $ingredientMap.Keys | Sort-Object

# Group A: shares the same leading word (e.g. all "pineapple ..." variants)
$byFirstWord = @{}
foreach ($n in $names) {
    $firstWord = ($n -split '\s+')[0]
    if (-not $byFirstWord.ContainsKey($firstWord)) { $byFirstWord[$firstWord] = @() }
    $byFirstWord[$firstWord] += $n
}
$variantGroups = $byFirstWord.GetEnumerator() | Where-Object { $_.Value.Count -gt 1 } | Sort-Object Name

# Group B: near-identical spelling (likely typos rather than real variants)
$typoPairs = New-Object System.Collections.Generic.List[object]
for ($i = 0; $i -lt $names.Count; $i++) {
    for ($j = $i + 1; $j -lt $names.Count; $j++) {
        $a = $names[$i]
        $b = $names[$j]
        # Cheap pre-filter before the more expensive distance calculation
        if ([Math]::Abs($a.Length - $b.Length) -gt 3) { continue }
        $dist = Get-LevenshteinDistance $a $b
        if ($dist -gt 0 -and $dist -le 2) {
            $typoPairs.Add([PSCustomObject]@{ A = $a; B = $b; Distance = $dist })
        }
    }
}

# ── Step 6: Write the human-readable review report ──
$reportPath = Join-Path $outputDir "ingredient-review.txt"
$lines = New-Object System.Collections.Generic.List[string]

$divider = "-" * 70
$lines.Add("=" * 70)
$lines.Add("INGREDIENT REVIEW REPORT - The Kitchen Notebook")
$lines.Add("Generated: $(Get-Date -Format 'dd/MM/yyyy HH:mm')")
$lines.Add("Scanned:   $recipeFolder")
$lines.Add("=" * 70)
$lines.Add("")
$lines.Add("$recipeCount recipe(s) scanned, $($ingredientMap.Count) unique ingredient name(s) found.")
$lines.Add("")

$lines.Add($divider)
$lines.Add("VARIANT GROUPS - ingredients that share a leading word")
$lines.Add("These might be genuinely different (e.g. sliced vs crushed")
$lines.Add("pineapple) or might be the same thing typed two different")
$lines.Add("ways by mistake. Check each group and decide.")
$lines.Add($divider)
if ($variantGroups.Count -eq 0) {
    $lines.Add("(none found)")
} else {
    foreach ($group in $variantGroups) {
        $lines.Add("")
        $lines.Add("  $($group.Name):")
        foreach ($item in ($group.Value | Sort-Object)) {
            $lines.Add("    - $item  (used in $($ingredientMap[$item].Count) recipe(s))")
        }
    }
}
$lines.Add("")

$lines.Add($divider)
$lines.Add("TYPO PAIRS - near-identical spelling (likely a genuine mistake)")
$lines.Add($divider)
if ($typoPairs.Count -eq 0) {
    $lines.Add("(none found)")
} else {
    foreach ($pair in $typoPairs) {
        $lines.Add("  '$($pair.A)'  <->  '$($pair.B)'   (edit distance: $($pair.Distance))")
    }
}
$lines.Add("")

$lines.Add($divider)
$lines.Add("FULL A-Z INGREDIENT LIST")
$lines.Add($divider)
foreach ($n in $names) {
    $lines.Add("  $n  ($($ingredientMap[$n].Count) recipe(s))")
}

if ($skippedFiles.Count -gt 0) {
    $lines.Add("")
    $lines.Add($divider)
    $lines.Add("FILES SKIPPED (no ingredients array found)")
    $lines.Add($divider)
    $skippedFiles | ForEach-Object { $lines.Add("  $_") }
}

if ($badFiles.Count -gt 0) {
    $lines.Add("")
    $lines.Add($divider)
    $lines.Add("FILES THAT FAILED TO PARSE")
    $lines.Add($divider)
    $badFiles | ForEach-Object { $lines.Add("  $($_.File) - $($_.Error)") }
}

$lines | Out-File -FilePath $reportPath -Encoding UTF8
Write-Host "Wrote: $reportPath" -ForegroundColor Green

Write-Host "`nDone. Open ingredient-review.txt to see the variant groups and typo pairs to check through." -ForegroundColor Cyan
$ErrorActionPreference = "Stop"

function Write-Ok($msg) {
  Write-Output "OK: $msg"
}

function Write-Fail($msg) {
  Write-Output "FAIL: $msg"
  $script:HasFail = $true
}

function Normalize-Text([string]$v) {
  if ($null -eq $v) { return "" }
  return (($v -replace "\s+", " ").Trim())
}

function Strip-Accents([string]$v) {
  $norm = Normalize-Text $v
  $formD = $norm.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $formD.ToCharArray()) {
    $cat = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch)
    if ($cat -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$sb.Append($ch)
    }
  }
  return $sb.ToString().ToLowerInvariant()
}

function Parse-LeadingInt([string]$v) {
  if ($null -eq $v) { $v = "" }
  $m = [regex]::Match($v, "-?\d+")
  if (-not $m.Success) { return $null }
  return [int]$m.Value
}

function To-Hashtable($obj) {
  if ($null -eq $obj) { return $null }
  if ($obj -is [System.Collections.IDictionary]) {
    $h = @{}
    foreach ($k in $obj.Keys) { $h[$k] = To-Hashtable $obj[$k] }
    return $h
  }
  if ($obj -is [System.Management.Automation.PSCustomObject]) {
    $h = @{}
    foreach ($p in $obj.PSObject.Properties) { $h[$p.Name] = To-Hashtable $p.Value }
    return $h
  }
  if (($obj -is [System.Collections.IEnumerable]) -and -not ($obj -is [string])) {
    $arr = @()
    foreach ($x in $obj) { $arr += ,(To-Hashtable $x) }
    return ,$arr
  }
  return $obj
}

function Map-DocRowToKey([string]$symbol, [string]$nameRaw) {
  $s = Normalize-Text $symbol
  $name = Strip-Accents $nameRaw

  # Stable ASCII symbols first.
  if ($s -eq "X") { return "X" }
  if ($s -eq "O") { return "O" }

  # Fallback by semantic row name (robust against glyph font/encoding changes).
  if ($name.Contains("attaque legere")) { return "X" }
  if ($name.Contains("attaque lourde")) { return "<>" }
  if ($name.Contains("attaque finale")) { return "FINAL" }
  if ($name.Contains("garde legere")) { return "GUARD" }
  if ($name.Contains("garde lourde")) { return "BULWARK" }
  if ($name.Contains("parade")) { return "PARRY" }
  if ($name.Contains("roulade")) { return "ROLL" }
  if ($name.Contains("feinte")) { return "FEINT" }
  if ($name -eq "saut" -or $name.Contains("saut")) { return "^" }
  if ($name.Contains("respiration")) { return "O" }
  if ($name.Contains("aura")) { return "AURA" }
  if ($name.Contains("observation")) { return "?" }
  if ($name.Contains("action speciale")) { return "ITEM" }
  if ($name.Contains("vulnerable")) { return "VULN" }
  return $null
}

$root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $root "package.json"))) {
  $root = (Get-Location).Path
}

$docxPath = Join-Path $root "docs/SOARA_V6_Table_Symboles.docx"
if (-not (Test-Path $docxPath)) {
  Write-Error "Docx introuvable: $docxPath"
}

$tmp = Join-Path $env:TEMP ("soara_docx_" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tmp | Out-Null
$zipPath = Join-Path $tmp "symbols.zip"
Copy-Item $docxPath $zipPath
Expand-Archive -Path $zipPath -DestinationPath $tmp -Force

$xmlPath = Join-Path $tmp "word/document.xml"
if (-not (Test-Path $xmlPath)) {
  Write-Error "document.xml introuvable apres extraction du docx."
}

[xml]$xml = Get-Content $xmlPath
$ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
$ns.AddNamespace("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")
$rows = $xml.SelectNodes("//w:tbl[1]/w:tr", $ns)
if (-not $rows -or $rows.Count -lt 2) {
  Write-Error "Table des symboles introuvable dans le docx."
}

$docRows = @()
for ($i = 1; $i -lt $rows.Count; $i++) {
  $cells = @()
  foreach ($tc in $rows[$i].SelectNodes("./w:tc", $ns)) {
    $txt = ($tc.SelectNodes(".//w:t", $ns) | ForEach-Object { $_.'#text' }) -join ""
    $cells += (Normalize-Text $txt)
  }
  if ($cells.Count -lt 7) { continue }

  $symbol = $cells[0]
  $name = $cells[1]
  if ([string]::IsNullOrWhiteSpace($symbol) -or [string]::IsNullOrWhiteSpace($name)) { continue }
  if ($symbol.Contains("/")) { continue } # team-target rows are not base symbols.

  $key = Map-DocRowToKey $symbol $name
  if (-not $key) { continue }

  $docRows += @{
    key = $key
    symbol = $symbol
    name = $name
    cost = Parse-LeadingInt $cells[2]
    damage = Parse-LeadingInt $cells[4]
    defense = Parse-LeadingInt $cells[5]
    evasion = Parse-LeadingInt $cells[6]
  }
}

if ($docRows.Count -eq 0) {
  Write-Error "Aucune ligne symbole mappee depuis le docx."
}
Write-Ok "Docx charge: $($docRows.Count) lignes symboles mappees."

$nodeCmd = @"
const fs = require('fs');
const path = require('path');
const filePath = path.join(process.cwd(), 'public/js/data/symbolsV6.js');
const src = fs.readFileSync(filePath, 'utf8');
const m = src.match(/export const SYMBOLS_V6\s*=\s*\{[\s\S]*?\n\};/);
if (!m) { console.error('SYMBOLS_V6 export not found'); process.exit(1); }
const literal = m[0]
  .replace(/^export const SYMBOLS_V6\s*=\s*/, '')
  .replace(/;\s*$/, '');
const obj = Function('return (' + literal + ');')();
process.stdout.write(JSON.stringify(obj || {}));
"@

$symbolsJson = & node -e $nodeCmd
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($symbolsJson)) {
  Write-Error "Impossible de charger SYMBOLS_V6 via node."
}
$runtime = To-Hashtable ($symbolsJson | ConvertFrom-Json)

$script:HasFail = $false
$baselineAtk = 4
$baselineDef = 3
$baselineEsq = 2

foreach ($row in $docRows) {
  if (-not $runtime.ContainsKey($row.key)) {
    Write-Fail "Symbole manquant dans SYMBOLS_V6: $($row.key) ($($row.name))"
    continue
  }
  $r = $runtime[$row.key]

  if ($null -ne $row.cost) {
    if ([int]$r.cost -ne [int]$row.cost) {
      Write-Fail "Cout incoherent $($row.key): doc=$($row.cost), runtime=$($r.cost)"
    }
  }

  if ($null -ne $row.damage -and $row.key -ne "PARRY") {
    $expectedAtkFactor = [double]$row.damage / $baselineAtk
    $runtimeAtkFactor = if ($null -ne $r.atkFactor) { [double]$r.atkFactor } elseif ($null -ne $r.atkDice) { [double]$r.atkDice } else { 0.0 }
    if ($runtimeAtkFactor -ne $expectedAtkFactor) {
      Write-Fail "AtkFactor incoherent $($row.key): doc=$expectedAtkFactor, runtime=$runtimeAtkFactor"
    }
  }

  if ($null -ne $row.defense) {
    $expectedDefFactor = [double]$row.defense / $baselineDef
    $runtimeDefFactor = if ($null -ne $r.defFactor) { [double]$r.defFactor } elseif ($null -ne $r.defDice) { [double]$r.defDice } else { 0.0 }
    if ($runtimeDefFactor -ne $expectedDefFactor) {
      Write-Fail "DefFactor incoherent $($row.key): doc=$expectedDefFactor, runtime=$runtimeDefFactor"
    }
  }

  if ($null -ne $row.evasion) {
    $expectedEsqFactor = [double]$row.evasion / $baselineEsq
    $runtimeEsqFactor = if ($null -ne $r.esqFactor) { [double]$r.esqFactor } elseif ($null -ne $r.esqDice) { [double]$r.esqDice } else { 0.0 }
    if ($runtimeEsqFactor -ne $expectedEsqFactor) {
      Write-Fail "EsqFactor incoherent $($row.key): doc=$expectedEsqFactor, runtime=$runtimeEsqFactor"
    }
  }
}

if ($runtime.ContainsKey("PARRY")) {
  $parry = $runtime["PARRY"]
  $cap = 0
  if ($null -ne $parry.counterAtkCapMultiplier) { $cap = [int]$parry.counterAtkCapMultiplier }
  if ($cap -ne 2) {
    Write-Fail "PARRY doit garder counterAtkCapMultiplier=2 (doc officiel)."
  } else {
    Write-Ok "PARRY cap 2xATK aligne."
  }
} else {
  Write-Fail "PARRY absent de SYMBOLS_V6."
}

if ($script:HasFail) {
  Write-Output "Docx symbol sync checks finished with errors."
  exit 1
}

Write-Output "Docx symbol sync checks passed."
exit 0

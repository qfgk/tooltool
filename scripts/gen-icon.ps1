# Generate tooltool app icon (dark base + purple-blue gradient bento tiles)
# Outputs: icon.png(1024) / 256.png / 128x128.png / 32x32.png
param([int]$Size = 1024)
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\src-tauri\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function RoundRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function Make-IconBitmap([int]$S) {
  $bmp = New-Object System.Drawing.Bitmap($S, $S)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $k = $S / 1024.0
  $basePath = RoundRectPath 0 0 $S $S (232 * $k)

  # 1. Dark rounded base
  $baseBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point($S, $S)),
    [System.Drawing.Color]::FromArgb(255, 26, 29, 40),
    [System.Drawing.Color]::FromArgb(255, 9, 11, 16)
  )
  $g.FillPath($baseBrush, $basePath)
  $baseBrush.Dispose()

  # 2. Glows: purple top-right / blue bottom-left
  $g.SetClip($basePath)
  $glow1 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 138, 134, 255))
  $g.FillEllipse($glow1, 500 * $k, -320 * $k, 860 * $k, 620 * $k)
  $glow1.Dispose()
  $glow2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(52, 93, 176, 255))
  $g.FillEllipse($glow2, -300 * $k, 640 * $k, 780 * $k, 560 * $k)
  $glow2.Dispose()

  # 3. Bento tiles: top-left main gradient, others glass w/ stroke
  $tile = 272 * $k
  $gap = 44 * $k
  $ox = [math]::Floor(($S - ($tile * 2 + $gap)) / 2)
  $oy = [math]::Floor(($S - ($tile * 2 + $gap)) / 2)
  $tr = 66 * $k

  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point([int]$ox, [int]$oy)),
    (New-Object System.Drawing.Point([int]($ox + $tile), [int]($oy + $tile))),
    [System.Drawing.Color]::FromArgb(255, 142, 138, 255),
    [System.Drawing.Color]::FromArgb(255, 93, 176, 255)
  )
  $p1 = RoundRectPath $ox $oy $tile $tile $tr
  $g.FillPath($grad, $p1)
  $grad.Dispose(); $p1.Dispose()

  $glass = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(26, 255, 255, 255))
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(95, 255, 255, 255), (2.6 * $k))
  foreach ($pos in @(@(($ox + $tile + $gap), $oy), @($ox, ($oy + $tile + $gap)), @(($ox + $tile + $gap), ($oy + $tile + $gap)))) {
    $pp = RoundRectPath $pos[0] $pos[1] $tile $tile $tr
    $g.FillPath($glass, $pp)
    $g.DrawPath($pen, $pp)
    $pp.Dispose()
  }
  $glass.Dispose(); $pen.Dispose()

  # 4. Top inner highlight
  $hl = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(24, 255, 255, 255))
  $g.FillEllipse($hl, 110 * $k, -170 * $k, 800 * $k, 460 * $k)
  $hl.Dispose()
  $g.ResetClip()

  $g.Dispose()
  return $bmp
}

foreach ($s in @(1024, 256, 128, 32)) {
  $bmp = Make-IconBitmap $s
  $name = switch ($s) {
    1024 { 'icon.png' }
    256 { '256.png' }
    128 { '128x128.png' }
    32 { '32x32.png' }
  }
  $bmp.Save((Join-Path $outDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "saved $name ($s px)"
}

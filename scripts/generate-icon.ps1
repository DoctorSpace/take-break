$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class IconNative { [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr h); }'
$assets = Join-Path $PSScriptRoot '..\Assets'
[System.IO.Directory]::CreateDirectory($assets) | Out-Null
$bitmap = New-Object System.Drawing.Bitmap 64, 64
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)
$gray = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(200,200,200))
$dark = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(32,32,32))
$graphics.FillEllipse($gray, 2, 2, 60, 60)
$graphics.FillRectangle($dark, 22, 19, 7, 26)
$graphics.FillRectangle($dark, 35, 19, 7, 26)
$handle = $bitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($handle)
$stream = [System.IO.File]::Create((Join-Path $assets 'app.ico'))
try { $icon.Save($stream) }
finally {
    $stream.Dispose()
    $icon.Dispose()
    [IconNative]::DestroyIcon($handle) | Out-Null
    $graphics.Dispose()
    $bitmap.Dispose()
    $gray.Dispose()
    $dark.Dispose()
}

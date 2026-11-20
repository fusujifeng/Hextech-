param(
  [string]$OutPath = "",
  [string]$PngPath = ""
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Runtime.WindowsRuntime

Add-Type @"
using System.Runtime.InteropServices;
public static class DpiHelper {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[DpiHelper]::SetProcessDPIAware() | Out-Null

[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType = WindowsRuntime] > $null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] > $null

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) {
  [Console]::Error.WriteLine('no OCR engine')
  exit 1
}

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod
})[0]

function Invoke-OcrText($bmp) {
  $rect = New-Object System.Drawing.Rectangle(0, 0, $bmp.Width, $bmp.Height)
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $width = $data.Width
  $height = $data.Height
  $stride = $data.Stride
  $bytes = New-Object byte[] ($stride * $height)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $bmp.UnlockBits($data)

  $buffer = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeBufferExtensions]::AsBuffer($bytes)
  $sb = [Windows.Graphics.Imaging.SoftwareBitmap]::CreateCopyFromBuffer(
    $buffer,
    [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,
    [int]$width,
    [int]$height
  )
  $op = $engine.RecognizeAsync($sb)
  $task = $asTask.MakeGenericMethod([Windows.Media.Ocr.OcrResult]).Invoke($null, @($op))
  $task.Wait(20000) | Out-Null
  return $task.Result.Text
}

$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$graphics.Dispose()

# Save a copy of the screenshot for diagnosing failed recognition.
if ($PngPath) {
  $bitmap.Save($PngPath, [System.Drawing.Imaging.ImageFormat]::Png)
}

# The three augment cards are in the center. Windows OCR misses the stylized
# card font on a 4K full-screen image, but reads it when the card area is
# cropped and scaled 2x. Fall back to the full screen if the crop is empty.
$cx = [int]($bitmap.Width * 0.22)
$cy = [int]($bitmap.Height * 0.16)
$cw = [int]($bitmap.Width * 0.56)
$ch = [int]($bitmap.Height * 0.51)
$crop = New-Object System.Drawing.Bitmap([int]($cw * 2), [int]($ch * 2))
$g2 = [System.Drawing.Graphics]::FromImage($crop)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g2.DrawImage(
  $bitmap,
  (New-Object System.Drawing.Rectangle(0, 0, $crop.Width, $crop.Height)),
  (New-Object System.Drawing.Rectangle($cx, $cy, $cw, $ch)),
  [System.Drawing.GraphicsUnit]::Pixel
)
$g2.Dispose()

$text = Invoke-OcrText $crop
$crop.Dispose()

if (-not $text -or $text.Trim().Length -eq 0) {
  $text = Invoke-OcrText $bitmap
}
$bitmap.Dispose()

# Write UTF-8 file instead of relying on redirected stdout encoding.
if ($OutPath) {
  [System.IO.File]::WriteAllText($OutPath, $text, (New-Object System.Text.UTF8Encoding($false)))
}

[Console]::Out.Write($text)

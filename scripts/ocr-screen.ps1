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
using System;
using System.Runtime.InteropServices;
public static class DpiHelper {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
public static class Win32Capture {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
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

function Get-GameBitmap {
  $hwnd = [IntPtr]::Zero
  $game = Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessName -eq 'League of Legends' -and $_.MainWindowHandle -ne 0 } |
    Select-Object -First 1
  if ($game) { $hwnd = $game.MainWindowHandle }
  if ($hwnd -eq [IntPtr]::Zero) {
    $hwnd = [Win32Capture]::FindWindow($null, 'League of Legends (TM) Client')
  }
  if ($hwnd -eq [IntPtr]::Zero) { return $null }

  $r = New-Object Win32Capture+RECT
  if (-not [Win32Capture]::GetWindowRect($hwnd, [ref]$r)) { return $null }
  $w = $r.Right - $r.Left
  $h = $r.Bottom - $r.Top
  if ($w -le 0 -or $h -le 0) { return $null }

  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  $ok = [Win32Capture]::PrintWindow($hwnd, $hdc, 2)
  $g.ReleaseHdc($hdc)
  $g.Dispose()
  if (-not $ok) {
    $bmp.Dispose()
    return $null
  }

  # Reject an all-black capture.
  $bright = 0
  for ($gy = 0; $gy -lt 10; $gy++) {
    for ($gx = 0; $gx -lt 10; $gx++) {
      $px = [int]($bmp.Width * ($gx + 0.5) / 10)
      $py = [int]($bmp.Height * ($gy + 0.5) / 10)
      $c = $bmp.GetPixel($px, $py)
      if ($c.R + $c.G + $c.B -gt 45) { $bright++ }
    }
  }
  if ($bright -lt 3) {
    $bmp.Dispose()
    return $null
  }
  return $bmp
}

$bitmap = Get-GameBitmap

# Fallback: capture the screen if the game window cannot be captured.
if (-not $bitmap) {
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
  $graphics.Dispose()
}

if ($PngPath) {
  $bitmap.Save($PngPath, [System.Drawing.Imaging.ImageFormat]::Png)
}

# The three augment cards are in the center. Windows OCR misses the stylized
# card font on a full-screen image, but reads it when the card area is
# cropped and scaled 2x. Fall back to the full image if the crop is empty.
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

if ($OutPath) {
  [System.IO.File]::WriteAllText($OutPath, $text, (New-Object System.Text.UTF8Encoding($false)))
}

[Console]::Out.Write($text)

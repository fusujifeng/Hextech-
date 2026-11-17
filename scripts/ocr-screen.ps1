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

$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$graphics.Dispose()

$rect = New-Object System.Drawing.Rectangle(0, 0, $bounds.Width, $bounds.Height)
$data = $bitmap.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$width = $data.Width
$height = $data.Height
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $height)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bitmap.UnlockBits($data)
$bitmap.Dispose()

# Format32bppArgb is BGRA in memory, which is what SoftwareBitmap expects.
$buffer = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeBufferExtensions]::AsBuffer($bytes)
$softwareBitmap = [Windows.Graphics.Imaging.SoftwareBitmap]::CreateCopyFromBuffer(
  $buffer,
  [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,
  [int]$width,
  [int]$height
)

$operation = $engine.RecognizeAsync($softwareBitmap)
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod
})[0]
$task = $asTask.MakeGenericMethod([Windows.Media.Ocr.OcrResult]).Invoke($null, @($operation))
$task.Wait(20000) | Out-Null
$result = $task.Result

[Console]::Out.Write($result.Text)

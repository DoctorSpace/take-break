using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media.Imaging;

namespace TakeBreak.Services;

internal static class DesktopCapture
{
    internal static BitmapSource? Capture(Rectangle bounds)
    {
        try
        {
            using var full = new Bitmap(bounds.Width, bounds.Height);
            using (var graphics = Graphics.FromImage(full))
                graphics.CopyFromScreen(bounds.Location, System.Drawing.Point.Empty, bounds.Size, CopyPixelOperation.SourceCopy);
            // A low-resolution frozen snapshot keeps blur cheap even on multiple 4K displays.
            using var small = new Bitmap(Math.Max(1, bounds.Width / 4), Math.Max(1, bounds.Height / 4));
            using (var graphics = Graphics.FromImage(small))
            {
                graphics.InterpolationMode = InterpolationMode.HighQualityBilinear;
                graphics.DrawImage(full, 0, 0, small.Width, small.Height);
            }
            var handle = small.GetHbitmap();
            try
            {
                var source = Imaging.CreateBitmapSourceFromHBitmap(handle, IntPtr.Zero, Int32Rect.Empty, BitmapSizeOptions.FromEmptyOptions());
                var gray = new FormatConvertedBitmap(source, System.Windows.Media.PixelFormats.Gray8, null, 0);
                gray.Freeze();
                return gray;
            }
            finally { NativeMethods.DeleteObject(handle); }
        }
        catch (Exception ex)
        {
            SettingsStore.Log(ex);
            return null; // A dark gradient is still a usable overlay if capture is unavailable.
        }
    }
}

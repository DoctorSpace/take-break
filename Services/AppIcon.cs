using System.Drawing;
using System.Drawing.Drawing2D;

namespace TakeBreak.Services;

internal static class AppIcon
{
    internal static Icon Create()
    {
        using var bitmap = new Bitmap(64, 64);
        using (var g = Graphics.FromImage(bitmap))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);
            using var background = new SolidBrush(Color.FromArgb(200, 200, 200));
            using var foreground = new SolidBrush(Color.FromArgb(32, 32, 32));
            g.FillEllipse(background, 2, 2, 60, 60);
            g.FillRectangle(foreground, 22, 19, 7, 26);
            g.FillRectangle(foreground, 35, 19, 7, 26);
        }
        var handle = bitmap.GetHicon();
        try { using var original = Icon.FromHandle(handle); return (Icon)original.Clone(); }
        finally { NativeMethods.DestroyIcon(handle); }
    }
}

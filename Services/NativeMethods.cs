using System;
using System.Drawing;
using System.Runtime.InteropServices;

namespace TakeBreak.Services;

internal static class NativeMethods
{
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(IntPtr hwnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr hwnd);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
    private static extern int GetWindowLong(IntPtr hwnd, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongW")]
    private static extern int SetWindowLong(IntPtr hwnd, int index, int value);
    [DllImport("user32.dll")]
    internal static extern bool DestroyIcon(IntPtr handle);
    [DllImport("gdi32.dll")]
    internal static extern bool DeleteObject(IntPtr handle);
    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    internal static void PositionOverlay(IntPtr handle, Rectangle bounds) =>
        SetWindowPos(handle, new IntPtr(-1), bounds.X, bounds.Y, bounds.Width, bounds.Height, 0x0010 | 0x0040);

    internal static void PositionIsland(IntPtr handle, Rectangle workArea, double width, double height)
    {
        // Move onto the primary display before measuring its DPI. Do not steal keyboard focus.
        SetWindowPos(handle, new IntPtr(-1), workArea.X, workArea.Y, 0, 0, 0x0001 | 0x0010);
        double scale = GetDpiForWindow(handle) / 96.0;
        int pixelWidth = (int)Math.Round(width * scale);
        int pixelHeight = (int)Math.Round(height * scale);
        SetWindowPos(handle, new IntPtr(-1), workArea.X + (workArea.Width - pixelWidth) / 2,
            workArea.Y + (int)Math.Round(8 * scale), pixelWidth, pixelHeight, 0x0010);
    }

    internal static void MakeToolWindow(IntPtr handle) =>
        SetWindowLong(handle, -20, (GetWindowLong(handle, -20) | 0x80) & ~0x40000);

    internal static void DarkTitleBar(IntPtr handle)
    {
        int enabled = 1;
        try { DwmSetWindowAttribute(handle, 20, ref enabled, sizeof(int)); }
        catch (DllNotFoundException) { }
    }
}

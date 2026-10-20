using System;
using System.Globalization;
using System.Linq;

namespace TakeBreak.Models;

internal static class AccentColorValue
{
    internal static bool IsValid(string? value) => value is { Length: 7 } && value[0] == '#'
        && value.Skip(1).All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f' or >= 'A' and <= 'F');

    internal static (double Hue, double Saturation, double Value) ToHsv(string hex)
    {
        double r = byte.Parse(hex.Substring(1, 2), NumberStyles.HexNumber) / 255.0;
        double g = byte.Parse(hex.Substring(3, 2), NumberStyles.HexNumber) / 255.0;
        double b = byte.Parse(hex.Substring(5, 2), NumberStyles.HexNumber) / 255.0;
        double max = Math.Max(r, Math.Max(g, b)), min = Math.Min(r, Math.Min(g, b)), delta = max - min;
        double hue = delta == 0 ? 0 : max == r ? ((g - b) / delta + 6) % 6
            : max == g ? (b - r) / delta + 2 : (r - g) / delta + 4;
        return (hue * 60, max == 0 ? 0 : delta / max, max);
    }

    internal static string FromHsv(double hue, double saturation, double value)
    {
        hue = (hue % 360 + 360) % 360 / 60;
        saturation = Math.Clamp(saturation, 0, 1);
        value = Math.Clamp(value, 0, 1);
        double c = value * saturation, x = c * (1 - Math.Abs(hue % 2 - 1)), m = value - c;
        (double r, double g, double b) = (int)hue switch
        {
            0 => (c, x, 0.0), 1 => (x, c, 0.0), 2 => (0.0, c, x),
            3 => (0.0, x, c), 4 => (x, 0.0, c), _ => (c, 0.0, x)
        };
        return $"#{(int)Math.Round((r + m) * 255):X2}{(int)Math.Round((g + m) * 255):X2}{(int)Math.Round((b + m) * 255):X2}";
    }

    internal static string Foreground(string hex)
    {
        double Channel(int offset)
        {
            double channel = byte.Parse(hex.Substring(offset, 2), NumberStyles.HexNumber) / 255.0;
            return channel <= 0.04045 ? channel / 12.92 : Math.Pow((channel + 0.055) / 1.055, 2.4);
        }
        double luminance = 0.2126 * Channel(1) + 0.7152 * Channel(3) + 0.0722 * Channel(5);
        return luminance > 0.179 ? "#202020" : "#F2F2F2";
    }
}

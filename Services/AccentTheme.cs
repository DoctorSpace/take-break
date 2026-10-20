using System.Windows;
using System.Windows.Media;
using TakeBreak.Models;

namespace TakeBreak.Services;

internal static class AccentTheme
{
    internal static string CurrentColor
    {
        get
        {
            var color = ((SolidColorBrush)Application.Current.Resources["AccentBrush"]).Color;
            return $"#{color.R:X2}{color.G:X2}{color.B:X2}";
        }
    }

    internal static void Apply(string color)
    {
        var brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(color));
        brush.Freeze();
        Application.Current.Resources["AccentBrush"] = brush;
        var foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(AccentColorValue.Foreground(color)));
        foreground.Freeze();
        Application.Current.Resources["AccentForegroundBrush"] = foreground;
    }
}

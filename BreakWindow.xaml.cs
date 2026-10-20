using System;
using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using Forms = System.Windows.Forms;
using TakeBreak.Services;

namespace TakeBreak;

public partial class BreakWindow : Window
{
    private readonly Action _continue;
    private readonly Action _collapse;
    private readonly Forms.Screen _screen;
    private bool _allowClose;

    public BreakWindow(Forms.Screen screen, BitmapSource? snapshot, Action onContinue, Action onCollapse)
    {
        _screen = screen;
        _continue = onContinue;
        _collapse = onCollapse;
        InitializeComponent();
        if (screen.Primary) HeadingText.Text = BreakHeadings.Next();
        DesktopImage.Source = snapshot;
        if (!screen.Primary)
        {
            MainCard.Visibility = Visibility.Collapsed;
            SecondaryContent.Visibility = Visibility.Visible;
        }
        SourceInitialized += (_, _) =>
        {
            var handle = new WindowInteropHelper(this).Handle;
            NativeMethods.MakeToolWindow(handle);
            NativeMethods.PositionOverlay(handle, _screen.Bounds);
        };
        Loaded += (_, _) =>
        {
            NativeMethods.PositionOverlay(new WindowInteropHelper(this).Handle, _screen.Bounds);
            MainCard.BeginAnimation(OpacityProperty, new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(450)));
        };
        PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.Escape) { e.Handled = true; _continue(); }
        };
        Closing += OnClosing;
        Deactivated += (_, _) => FinishButton.CancelHold();
    }

    public void UpdateCountdown(TimeSpan remaining, TimeSpan total)
    {
        if (!_screen.Primary) return;
        int seconds = Math.Max(0, (int)Math.Ceiling(remaining.TotalSeconds));
        CountdownText.Text = $"{seconds / 60:00}:{seconds % 60:00}";
        int minutes = (int)Math.Ceiling(seconds / 60.0);
        RemainingText.Text = seconds < 60 ? $"Осталось {seconds} {Plural(seconds, "секунда", "секунды", "секунд")}" : $"Осталось {minutes} {Plural(minutes, "минута", "минуты", "минут")}";
        double fraction = Math.Clamp(remaining.TotalSeconds / total.TotalSeconds, 0, 0.99999);
        double angle = fraction * Math.PI * 2;
        const double center = 110, radius = 102;
        var geometry = new StreamGeometry();
        using (var context = geometry.Open())
        {
            context.BeginFigure(new Point(center, center - radius), false, false);
            context.ArcTo(new Point(center + radius * Math.Sin(angle), center - radius * Math.Cos(angle)),
                new Size(radius, radius), 0, fraction > 0.5, SweepDirection.Clockwise, true, false);
        }
        geometry.Freeze();
        ProgressArc.Data = geometry;
    }

    private static string Plural(int value, string one, string few, string many) =>
        value % 100 is >= 11 and <= 14 ? many : value % 10 == 1 ? one : value % 10 is >= 2 and <= 4 ? few : many;

    private void Continue_Click(object sender, RoutedEventArgs e) => _continue();
    private void Collapse_Click(object sender, RoutedEventArgs e) => _collapse();

    public void SetSnapshot(BitmapSource? snapshot) => DesktopImage.Source = snapshot;
    private void OnClosing(object? sender, CancelEventArgs e)
    {
        if (_allowClose) return;
        e.Cancel = true;
        Dispatcher.BeginInvoke(_continue);
    }

    public void CloseOverlay()
    {
        _allowClose = true;
        DesktopImage.Source = null;
        Close();
    }
}

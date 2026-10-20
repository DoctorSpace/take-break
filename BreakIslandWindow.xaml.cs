using System;
using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media.Animation;
using TakeBreak.Services;
using Forms = System.Windows.Forms;

namespace TakeBreak;

public partial class BreakIslandWindow : Window
{
    private readonly Action _restore;
    private readonly Action _finish;
    private bool _allowClose;

    public BreakIslandWindow(Action onRestore, Action onFinish)
    {
        _restore = onRestore;
        _finish = onFinish;
        InitializeComponent();
        SourceInitialized += (_, _) =>
        {
            NativeMethods.MakeToolWindow(new WindowInteropHelper(this).Handle);
            PositionAtTop();
        };
        Loaded += (_, _) => PositionAtTop();
        PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.Escape) { e.Handled = true; _finish(); }
        };
        Closing += OnClosing;
    }

    public void ShowIsland()
    {
        Show();
        PositionAtTop();
        IslandCard.BeginAnimation(OpacityProperty, new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(180)));
    }

    private void PositionAtTop()
    {
        var screen = Forms.Screen.PrimaryScreen;
        if (screen != null)
            NativeMethods.PositionIsland(new WindowInteropHelper(this).Handle, screen.WorkingArea, Width, Height);
    }

    public void UpdateCountdown(TimeSpan remaining)
    {
        int seconds = Math.Max(0, (int)Math.Ceiling(remaining.TotalSeconds));
        CountdownText.Text = $"{seconds / 60:00}:{seconds % 60:00}";
        EndTimeText.Text = $"Завершится в {DateTime.Now.Add(remaining):HH:mm:ss}";
    }

    private void Restore_Click(object sender, RoutedEventArgs e) => _restore();

    private void OnClosing(object? sender, CancelEventArgs e)
    {
        if (_allowClose) return;
        e.Cancel = true;
        Dispatcher.BeginInvoke(_finish);
    }

    public void CloseIsland()
    {
        _allowClose = true;
        Close();
    }
}

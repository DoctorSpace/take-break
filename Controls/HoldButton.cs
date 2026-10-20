using System;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;

namespace TakeBreak.Controls;

// A short click never completes the action. Mouse and keyboard share the same hold timer.
public sealed class HoldButton : Button
{
    private static readonly DependencyPropertyKey ProgressPropertyKey = DependencyProperty.RegisterReadOnly(
        nameof(Progress), typeof(double), typeof(HoldButton), new PropertyMetadata(0.0));
    public static readonly DependencyProperty ProgressProperty = ProgressPropertyKey.DependencyProperty;
    public double Progress => (double)GetValue(ProgressProperty);
    private readonly Stopwatch _watch = new();
    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromMilliseconds(16) };
    private Key? _heldKey;

    public HoldButton()
    {
        _timer.Tick += (_, _) =>
        {
            SetValue(ProgressPropertyKey, Math.Min(1, _watch.Elapsed.TotalSeconds / 1.2));
            if (Progress < 1) return;
            CancelHold();
            base.OnClick();
        };
        IsVisibleChanged += (_, _) => { if (!IsVisible) CancelHold(); };
        IsEnabledChanged += (_, _) => { if (!IsEnabled) CancelHold(); };
        Unloaded += (_, _) => CancelHold();
    }

    protected override void OnClick() { } // Prevent normal clicks and key-up from bypassing the hold.

    protected override void OnPreviewMouseLeftButtonDown(MouseButtonEventArgs e)
    {
        base.OnPreviewMouseLeftButtonDown(e);
        e.Handled = true;
        Focus();
        if (IsEnabled && CaptureMouse()) StartHold();
    }

    protected override void OnPreviewMouseLeftButtonUp(MouseButtonEventArgs e)
    {
        e.Handled = true;
        CancelHold();
        base.OnPreviewMouseLeftButtonUp(e);
    }

    protected override void OnMouseLeave(MouseEventArgs e) { CancelHold(); base.OnMouseLeave(e); }
    protected override void OnLostMouseCapture(MouseEventArgs e) { CancelHold(); base.OnLostMouseCapture(e); }
    protected override void OnLostKeyboardFocus(KeyboardFocusChangedEventArgs e) { CancelHold(); base.OnLostKeyboardFocus(e); }

    protected override void OnPreviewKeyDown(KeyEventArgs e)
    {
        if (e.Key is Key.Space or Key.Enter)
        {
            e.Handled = true;
            if (!e.IsRepeat && !_watch.IsRunning) { _heldKey = e.Key; StartHold(); }
        }
        base.OnPreviewKeyDown(e);
    }

    protected override void OnPreviewKeyUp(KeyEventArgs e)
    {
        if (e.Key == _heldKey) { e.Handled = true; CancelHold(); }
        base.OnPreviewKeyUp(e);
    }

    private void StartHold()
    {
        if (_watch.IsRunning) return;
        _watch.Restart();
        _timer.Start();
    }

    public void CancelHold()
    {
        _timer.Stop();
        _watch.Reset();
        _heldKey = null;
        SetValue(ProgressPropertyKey, 0.0);
        if (IsMouseCaptured) ReleaseMouseCapture();
    }
}

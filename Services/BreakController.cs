using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text.Json;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Win32;
using TakeBreak.Models;
using Forms = System.Windows.Forms;

namespace TakeBreak.Services;

public sealed class BreakController : IDisposable
{
    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromMilliseconds(250) };
    private readonly Stopwatch _breakWatch = new();
    private readonly Stopwatch _previewWatch = new();
    private readonly List<BreakWindow> _windows = new();
    private BreakIslandWindow? _island;
    private TimeSpan _duration;
    private DateTime _lastTick = DateTime.Now;
    private bool _sessionLocked;
    private bool _disposed;
    public BreakSettings Settings { get; private set; }
    public DateTime? NextBreak { get; private set; }
    public bool IsBreaking => _windows.Count > 0;
    public bool IsBreakCollapsed => _island?.IsVisible == true;
    public bool IsPreviewPending => _previewWatch.IsRunning;
    public int PreviewSeconds => Math.Max(0, (int)Math.Ceiling(3 - _previewWatch.Elapsed.TotalSeconds));
    public event Action? Changed;
    public event Action<string>? Failed;

    public BreakController(BreakSettings settings)
    {
        Settings = settings;
        NextBreak = BreakSchedule.Next(Settings, DateTime.Now);
        _timer.Tick += Tick;
        SystemEvents.SessionSwitch += OnSessionSwitch;
        SystemEvents.PowerModeChanged += OnPowerModeChanged;
        SystemEvents.DisplaySettingsChanged += OnDisplaySettingsChanged;
        _timer.Start();
    }

    public void ApplySettings(BreakSettings settings)
    {
        if (JsonSerializer.Serialize(Settings) == JsonSerializer.Serialize(settings)) return;
        SettingsStore.Save(settings); // Only change live settings after a successful write.
        bool scheduleChanged = Settings.IntervalMinutes != settings.IntervalMinutes
            || Settings.DurationMinutes != settings.DurationMinutes || Settings.StartTime != settings.StartTime
            || Settings.EndTime != settings.EndTime || Settings.Enabled != settings.Enabled
            || !Settings.Days.SequenceEqual(settings.Days);
        Settings = settings;
        AccentTheme.Apply(settings.AccentColor);
        if (scheduleChanged) NextBreak = BreakSchedule.Next(Settings, DateTime.Now);
        Changed?.Invoke();
    }

    public void Preview()
    {
        if (IsBreaking || _sessionLocked) return;
        _previewWatch.Restart();
        Changed?.Invoke();
    }

    public void StartBreak()
    {
        if (IsBreaking || _sessionLocked || _disposed) return;
        _previewWatch.Reset();
        try
        {
            // Capture every display before showing any overlay, including mirrored edges.
            var captures = Forms.Screen.AllScreens.Select(s => (Screen: s, Image: DesktopCapture.Capture(s.Bounds))).ToList();
            _duration = TimeSpan.FromMinutes(Settings.DurationMinutes);
            foreach (var capture in captures)
            {
                var window = new BreakWindow(capture.Screen, capture.Image, FinishBreak, CollapseBreak);
                _windows.Add(window);
                window.UpdateCountdown(_duration, _duration);
                window.Show();
            }
            _breakWatch.Restart();
            _windows.FirstOrDefault(w => Forms.Screen.FromHandle(new System.Windows.Interop.WindowInteropHelper(w).Handle).Primary)?.Activate();
            Changed?.Invoke();
        }
        catch (Exception ex)
        {
            SettingsStore.Log(ex);
            FinishBreak();
            Failed?.Invoke("Не удалось открыть экран перерыва. Подробности: %LocalAppData%\\TakeBreak\\errors.log");
        }
    }

    public void FinishBreak()
    {
        _previewWatch.Reset();
        _breakWatch.Reset();
        _island?.CloseIsland();
        _island = null;
        foreach (var window in _windows.ToArray()) window.CloseOverlay();
        _windows.Clear();
        NextBreak = BreakSchedule.Next(Settings, DateTime.Now);
        Changed?.Invoke();
    }

    public void CollapseBreak()
    {
        if (!IsBreaking || IsBreakCollapsed) return;
        try
        {
            foreach (var window in _windows)
            {
                window.Hide();
                window.SetSnapshot(null);
            }
            _island ??= new BreakIslandWindow(RestoreBreak, FinishBreak);
            _island.UpdateCountdown(_duration - _breakWatch.Elapsed);
            _island.ShowIsland();
            Changed?.Invoke();
        }
        catch (Exception ex) { HandlePresentationFailure(ex); }
    }

    public void RestoreBreak()
    {
        if (!IsBreaking || !IsBreakCollapsed) return;
        try
        {
            _island!.Hide();
            // Capture the current desktop, not the stale images from before minimization.
            var captures = Forms.Screen.AllScreens.Select(s => DesktopCapture.Capture(s.Bounds)).ToList();
            var remaining = _duration - _breakWatch.Elapsed;
            if (remaining <= TimeSpan.Zero) { FinishBreak(); return; }
            for (int i = 0; i < _windows.Count; i++)
            {
                _windows[i].SetSnapshot(captures[i]);
                _windows[i].UpdateCountdown(remaining, _duration);
                _windows[i].Show();
            }
            _windows.FirstOrDefault(w => w.MainCard.Visibility == Visibility.Visible)?.Activate();
            Changed?.Invoke();
        }
        catch (Exception ex) { HandlePresentationFailure(ex); }
    }

    private void HandlePresentationFailure(Exception ex)
    {
        SettingsStore.Log(ex);
        FinishBreak();
        Failed?.Invoke("Не удалось переключить экран перерыва. Подробности: %LocalAppData%\\TakeBreak\\errors.log");
    }

    private void Tick(object? sender, EventArgs e)
    {
        var now = DateTime.Now;
        // No missed-break flood after suspend or a manual wall-clock change.
        if (Math.Abs((now - _lastTick).TotalSeconds) > 10)
        {
            FinishBreak();
            _lastTick = now;
            return;
        }
        _lastTick = now;
        if (_sessionLocked) return;
        if (IsBreaking)
        {
            var remaining = _duration - _breakWatch.Elapsed;
            if (remaining <= TimeSpan.Zero) FinishBreak();
            else if (IsBreakCollapsed) _island!.UpdateCountdown(remaining);
            else foreach (var window in _windows) window.UpdateCountdown(remaining, _duration);
        }
        else if (IsPreviewPending)
        {
            if (_previewWatch.Elapsed >= TimeSpan.FromSeconds(3)) StartBreak();
        }
        else if (NextBreak is DateTime due && now >= due)
        {
            if (BreakSchedule.IsAllowed(Settings, now)) StartBreak();
            else NextBreak = BreakSchedule.Next(Settings, now);
        }
        Changed?.Invoke();
    }

    private void OnSessionSwitch(object sender, SessionSwitchEventArgs e) => Dispatch(() =>
    {
        if (e.Reason is SessionSwitchReason.SessionLock or SessionSwitchReason.SessionLogoff or SessionSwitchReason.RemoteDisconnect or SessionSwitchReason.ConsoleDisconnect)
        {
            _sessionLocked = true;
            FinishBreak();
        }
        else if (e.Reason is SessionSwitchReason.SessionUnlock or SessionSwitchReason.SessionLogon or SessionSwitchReason.RemoteConnect or SessionSwitchReason.ConsoleConnect)
        {
            _sessionLocked = false;
            FinishBreak();
        }
    });

    private void OnPowerModeChanged(object sender, PowerModeChangedEventArgs e)
    {
        if (e.Mode is PowerModes.Suspend or PowerModes.Resume) Dispatch(FinishBreak);
    }

    private void OnDisplaySettingsChanged(object? sender, EventArgs e) => Dispatch(FinishBreak);

    private void Dispatch(Action action)
    {
        if (!_disposed) Application.Current.Dispatcher.BeginInvoke(new Action(() => { if (!_disposed) action(); }));
    }

    public void Dispose()
    {
        _disposed = true;
        _timer.Stop();
        SystemEvents.SessionSwitch -= OnSessionSwitch;
        SystemEvents.PowerModeChanged -= OnPowerModeChanged;
        SystemEvents.DisplaySettingsChanged -= OnDisplaySettingsChanged;
        FinishBreak();
    }
}

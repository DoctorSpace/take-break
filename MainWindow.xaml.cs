using System;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Security;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Threading;
using TakeBreak.Models;
using TakeBreak.Services;

namespace TakeBreak;

public partial class MainWindow : Window
{
    private readonly BreakController _controller;
    private readonly DispatcherTimer _saveTimer = new() { Interval = TimeSpan.FromMilliseconds(500) };
    private bool _loading = true;
    private bool _notified;
    private string _accentColor = "#B8CDB5";
    public bool AllowClose { get; set; }

    public MainWindow(BreakController controller)
    {
        _controller = controller;
        InitializeComponent();
        _saveTimer.Tick += (_, _) => { _saveTimer.Stop(); SaveInputs(); };
        _controller.Changed += UpdateStatus;
        SyncSettings();
        _loading = false;
        UpdateStatus();
        Closing += OnClosing;
        StateChanged += (_, _) => { if (WindowState == WindowState.Minimized) Hide(); };
    }

    private void SyncSettings()
    {
        _loading = true;
        var s = _controller.Settings;
        IntervalInput.Text = s.IntervalMinutes.ToString();
        DurationInput.Text = s.DurationMinutes.ToString();
        StartInput.Text = s.StartTime;
        EndInput.Text = s.EndTime;
        EnabledSwitch.IsChecked = s.Enabled;
        _accentColor = s.AccentColor;
        AccentHexText.Text = _accentColor;
        try { StartupSwitch.IsChecked = StartupRegistration.IsEnabled(); }
        catch (Exception ex) when (ex is SecurityException or UnauthorizedAccessException or IOException)
        {
            SettingsStore.Log(ex);
            StartupSwitch.IsEnabled = false;
            ShowError("Не удалось проверить автозапуск Windows.");
        }
        foreach (ToggleButton day in DaysPanel.Children)
            day.IsChecked = s.Days.Contains(Enum.Parse<DayOfWeek>((string)day.Tag));
        _loading = false;
    }

    public void RefreshSettings() => SyncSettings();

    private void SettingsChanged(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _saveTimer.Stop();
        _saveTimer.Start();
    }

    private bool SaveInputs()
    {
        _saveTimer.Stop();
        var settings = new BreakSettings
        {
            IntervalMinutes = int.TryParse(IntervalInput.Text, out var interval) ? interval : 0,
            DurationMinutes = int.TryParse(DurationInput.Text, out var duration) ? duration : 0,
            StartTime = StartInput.Text.Trim(),
            EndTime = EndInput.Text.Trim(),
            Enabled = EnabledSwitch.IsChecked == true,
            AccentColor = _accentColor,
            Days = DaysPanel.Children.OfType<ToggleButton>().Where(d => d.IsChecked == true)
                .Select(d => Enum.Parse<DayOfWeek>((string)d.Tag)).ToList()
        };
        if (!settings.IsValid(out var error))
        {
            AccentTheme.Apply(_controller.Settings.AccentColor);
            ShowError(error);
            return false;
        }
        try
        {
            _controller.ApplySettings(settings);
            SettingsError.Visibility = Visibility.Collapsed;
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            AccentTheme.Apply(_controller.Settings.AccentColor);
            SettingsStore.Log(ex);
            ShowError("Не удалось сохранить настройки. Проверьте доступ к папке %LocalAppData%\\TakeBreak.");
            return false;
        }
    }

    private void ShowError(string message)
    {
        SettingsError.Text = message + " Предыдущие настройки остаются активными.";
        SettingsError.Visibility = Visibility.Visible;
    }

    private void IntervalPreset_Click(object sender, RoutedEventArgs e) => IntervalInput.Text = (string)((Button)sender).Tag;
    private void DurationPreset_Click(object sender, RoutedEventArgs e) => DurationInput.Text = (string)((Button)sender).Tag;
    private void BreakNow_Click(object sender, RoutedEventArgs e) { if (SaveInputs()) _controller.StartBreak(); }

    private void AccentPicker_Click(object sender, RoutedEventArgs e)
    {
        if (_saveTimer.IsEnabled) SaveInputs();
        var palette = new AccentColorWindow(_accentColor) { Owner = this };
        palette.ColorChanged += color => AccentHexText.Text = color;
        if (palette.ShowDialog() != true)
        {
            AccentHexText.Text = _accentColor;
            return;
        }
        _accentColor = palette.SelectedColor;
        AccentHexText.Text = _accentColor;
        AccentTheme.Apply(_accentColor);
        SettingsChanged(sender, e);
    }

    private void StartupChanged(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        bool enabled = StartupSwitch.IsChecked == true;
        try
        {
            StartupRegistration.SetEnabled(enabled);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or SecurityException)
        {
            SettingsStore.Log(ex);
            _loading = true;
            StartupSwitch.IsChecked = !enabled;
            _loading = false;
            ShowError("Не удалось изменить автозапуск Windows.");
        }
    }

    private void UpdateStatus()
    {
        if (!IsInitialized) return;
        if (_controller.IsBreaking)
        {
            StatusLabel.Text = "СЕЙЧАС ПЕРЕРЫВ";
            NextBreakText.Text = "Время для себя";
            NextBreakDetail.Text = "Таймер уже запущен на основном экране.";
        }
        else if (!_controller.Settings.Enabled)
        {
            StatusLabel.Text = "ПЕРЕРЫВЫ НА ПАУЗЕ";
            NextBreakText.Text = "В вашем темпе";
            NextBreakDetail.Text = "Включите переключатель, когда будете готовы.";
        }
        else if (_controller.NextBreak is DateTime next)
        {
            StatusLabel.Text = "ВАШ СЛЕДУЮЩИЙ ПЕРЕРЫВ";
            var remaining = next - DateTime.Now;
            NextBreakText.Text = remaining.TotalMinutes < 1 ? "меньше чем через минуту"
                : remaining.TotalHours < 1 ? $"через {Math.Ceiling(remaining.TotalMinutes):0} мин"
                : next.Date == DateTime.Today ? $"сегодня в {next:HH:mm}" : $"{next:ddd, dd MMM · HH:mm}";
            NextBreakDetail.Text = $"{next:HH:mm}  ·  {_controller.Settings.DurationMinutes} мин отдыха";
        }
        else
        {
            StatusLabel.Text = "НЕТ ПОДХОДЯЩЕГО ВРЕМЕНИ";
            NextBreakText.Text = "Расширьте расписание";
            NextBreakDetail.Text = "Рабочее окно должно быть длиннее интервала между перерывами.";
        }
    }

    private void OnClosing(object? sender, CancelEventArgs e)
    {
        if (AllowClose)
        {
            _saveTimer.Stop();
            _controller.Changed -= UpdateStatus;
            return;
        }
        e.Cancel = true;
        if (_saveTimer.IsEnabled) SaveInputs();
        Hide();
        if (!_notified)
        {
            ((App)Application.Current).TrayHint();
            _notified = true;
        }
    }
}

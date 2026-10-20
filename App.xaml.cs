using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Threading;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using TakeBreak.Services;
using Forms = System.Windows.Forms;
using Point = System.Windows.Point;

namespace TakeBreak;

public partial class App : Application
{
    private Mutex? _mutex;
    private EventWaitHandle? _wake;
    private Thread? _wakeThread;
    private bool _ownsMutex;
    private volatile bool _stopping;
    private Forms.NotifyIcon? _tray;
    private Forms.ContextMenuStrip? _menu;
    private Forms.ToolStripMenuItem? _pauseItem;
    private Icon? _icon;
    private BreakController? _controller;
    private MainWindow? _settings;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        DispatcherUnhandledException += (_, args) =>
        {
            SettingsStore.Log(args.Exception);
            args.Handled = true;
            _controller?.FinishBreak();
            MessageBox.Show("Произошла ошибка. Подробности сохранены в %LocalAppData%\\TakeBreak\\errors.log.", "Сделай перерыв", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown(1);
        };
        _mutex = new Mutex(false, "Local\\TakeBreak.App.v1");
        try { _ownsMutex = _mutex.WaitOne(0); }
        catch (AbandonedMutexException) { _ownsMutex = true; }
        _wake = new EventWaitHandle(false, EventResetMode.AutoReset, "Local\\TakeBreak.Wake.v1");
        if (!_ownsMutex)
        {
            _wake.Set();
            Shutdown();
            return;
        }

        _controller = new BreakController(SettingsStore.Load());
        AccentTheme.Apply(_controller.Settings.AccentColor);
        _settings = new MainWindow(_controller);
        MainWindow = _settings;
        _icon = AppIcon.Create();
        var source = Imaging.CreateBitmapSourceFromHIcon(_icon.Handle, Int32Rect.Empty, BitmapSizeOptions.FromEmptyOptions());
        source.Freeze();
        _settings.Icon = source;
        _settings.SourceInitialized += (_, _) => NativeMethods.DarkTitleBar(new WindowInteropHelper(_settings).Handle);
        CreateTray();
        _controller.Changed += UpdateTray;
        _controller.Failed += message => _tray?.ShowBalloonTip(5000, "Сделай перерыв", message, Forms.ToolTipIcon.Warning);
        UpdateTray();

        _wakeThread = new Thread(() =>
        {
            while (!_stopping)
            {
                _wake.WaitOne();
                if (!_stopping) Dispatcher.BeginInvoke(new Action(ShowSettings));
            }
        }) { IsBackground = true, Name = "TakeBreak activation" };
        _wakeThread.Start();

        if (!e.Args.Contains("--tray")) ShowSettings();
        if (e.Args.Contains("--smoke-test")) StartSmokeTest();
    }

    private void CreateTray()
    {
        _menu = new Forms.ContextMenuStrip();
        _menu.Items.Add("Открыть настройки", null, (_, _) => ShowSettings());
        _menu.Items.Add("Сделать перерыв сейчас", null, (_, _) => _controller!.StartBreak());
        _menu.Items.Add("Пробный запуск через 3 секунды", null, (_, _) => _controller!.Preview());
        _menu.Items.Add(new Forms.ToolStripSeparator());
        _pauseItem = new Forms.ToolStripMenuItem("Приостановить перерывы");
        _pauseItem.Click += (_, _) =>
        {
            var settings = System.Text.Json.JsonSerializer.Deserialize<Models.BreakSettings>(System.Text.Json.JsonSerializer.Serialize(_controller!.Settings))!;
            settings.Enabled = !settings.Enabled;
            try { _controller.ApplySettings(settings); _settings!.RefreshSettings(); }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                SettingsStore.Log(ex);
                _tray?.ShowBalloonTip(4000, "Сделай перерыв", "Не удалось сохранить настройки.", Forms.ToolTipIcon.Warning);
            }
        };
        _menu.Items.Add(_pauseItem);
        _menu.Items.Add("Продолжить работу", null, (_, _) => _controller!.FinishBreak());
        _menu.Items.Add(new Forms.ToolStripSeparator());
        _menu.Items.Add("Выход", null, (_, _) => Shutdown());
        _tray = new Forms.NotifyIcon { Icon = _icon, Text = "Сделай перерыв", ContextMenuStrip = _menu, Visible = true };
        _tray.DoubleClick += (_, _) => ShowSettings();
        _tray.BalloonTipClicked += (_, _) => ShowSettings();
    }

    private void UpdateTray()
    {
        if (_tray == null || _controller == null || _pauseItem == null) return;
        _pauseItem.Text = _controller.Settings.Enabled ? "Приостановить перерывы" : "Возобновить перерывы";
        var text = _controller.IsBreaking ? "Сделай перерыв · время отдыха"
            : !_controller.Settings.Enabled ? "Сделай перерыв · на паузе"
            : _controller.NextBreak is DateTime next ? $"Сделай перерыв · следующий: {next:ddd HH:mm}" : "Сделай перерыв · вне расписания";
        if (_tray.Text != text) _tray.Text = text;
    }

    private void ShowSettings()
    {
        if (_stopping || _settings == null) return;
        if (_controller?.IsBreaking == true) _controller.FinishBreak();
        _settings.Show();
        _settings.WindowState = WindowState.Normal;
        _settings.Activate();
    }

    public void TrayHint() => _tray?.ShowBalloonTip(3000, "Сделай перерыв", "Приложение работает в трее. Двойной щелчок по значку — настройки.", Forms.ToolTipIcon.Info);

    // Runtime check: exercise real buttons, both break presentations and overlay cleanup.
    private void StartSmokeTest()
    {
        var controller = _controller ?? throw new InvalidOperationException("Controller not initialized.");
        var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        int tick = 0;
        bool hiddenWindowPassed = false;
        bool success = true;
        var failures = new System.Collections.Generic.List<string>();
        void Check(string name, bool condition)
        {
            success &= condition;
            if (!condition) failures.Add(name);
        }
        string beforeCollapse = "";
        string directory = Path.Combine(Path.GetTempPath(), "opencode");
        Directory.CreateDirectory(directory);
        timer.Tick += (_, _) =>
        {
            tick++;
            if (tick == 1)
            {
                _settings!.UpdateLayout();
                Check("fixed settings size", _settings.Width == 650 && _settings.Height == 720 && _settings.ResizeMode == ResizeMode.CanMinimize);
                Check($"settings fit without scrolling ({_settings.SettingsScroll.ScrollableHeight})", _settings.SettingsScroll.ScrollableHeight < 1);
                var startRect = _settings.StartInput.GetRectFromCharacterIndex(0);
                var endRect = _settings.EndInput.GetRectFromCharacterIndex(0);
                Check("schedule text is vertically aligned", Math.Abs(startRect.Top - endRect.Top) < 0.5 && startRect.Height == endRect.Height
                    && _settings.StartInput.FontFamily.Source == "Consolas" && _settings.StartInput.TextAlignment == TextAlignment.Center);
                Check("work unit label is centered", Math.Abs(_settings.IntervalUnitText.TranslatePoint(
                    new Point(0, _settings.IntervalUnitText.ActualHeight / 2), _settings.IntervalInput).Y - _settings.IntervalInput.ActualHeight / 2) < 1);
                Check("rest unit label is centered", Math.Abs(_settings.DurationUnitText.TranslatePoint(
                    new Point(0, _settings.DurationUnitText.ActualHeight / 2), _settings.DurationInput).Y - _settings.DurationInput.ActualHeight / 2) < 1);
                Check("no automatic-save status or preview block", _settings.FindName("SaveStatus") == null && _settings.FindName("TestButton") == null
                    && _settings.SettingsError.Visibility == Visibility.Collapsed);
                SavePreview(_settings, Path.Combine(directory, "TakeBreak-settings-preview.png"));
                var originalColor = controller.Settings.AccentColor;
                var palette = new AccentColorWindow(originalColor) { Owner = _settings };
                string previewNotification = "";
                palette.ColorChanged += color => previewNotification = color;
                palette.Show();
                palette.UpdateLayout();
                Check("palette initial color", palette.SelectedColor == originalColor.ToUpperInvariant());
                palette.HexInput.Text = "#1E3264";
                Check("palette hex entry", palette.ApplyButton.IsEnabled && palette.SelectedColor == "#1E3264");
                Check("hex entry previews theme immediately", AccentTheme.CurrentColor == "#1E3264" && previewNotification == "#1E3264");
                palette.HueSlider.Value = 180;
                Check("palette hue slider", palette.SelectedColor != "#1E3264");
                Check("hue slider previews theme immediately", AccentTheme.CurrentColor == palette.SelectedColor && previewNotification == palette.SelectedColor
                    && palette.ApplyButton.Background == Resources["AccentBrush"] && _settings.AccentSwatch.Background == Resources["AccentBrush"]);
                palette.UpdateLayout();
                var firstPreset = (System.Windows.Controls.Button)palette.PresetColors.Children[0];
                var lastPreset = (System.Windows.Controls.Button)palette.PresetColors.Children[5];
                Check("palette swatches align with content edges", firstPreset.TranslatePoint(new Point(0, 0), palette).X == palette.PreviewSwatch.TranslatePoint(new Point(0, 0), palette).X
                    && lastPreset.TranslatePoint(new Point(lastPreset.ActualWidth, 0), palette).X == palette.HexInput.TranslatePoint(new Point(palette.HexInput.ActualWidth, 0), palette).X);
                SavePreview(palette, Path.Combine(directory, "TakeBreak-palette-preview.png"));
                palette.HexInput.Text = "#ZZZZZZ";
                Check("palette rejects invalid hex", !palette.ApplyButton.IsEnabled);
                Check("invalid hex keeps last valid preview", AccentTheme.CurrentColor == palette.SelectedColor);
                palette.Close();
                Check("cancel palette restores theme and preserves settings", controller.Settings.AccentColor == originalColor && AccentTheme.CurrentColor == originalColor.ToUpperInvariant());
                var quickPalette = new AccentColorWindow(originalColor) { Owner = _settings };
                Check("six valid quick colors", quickPalette.PresetColors.Children.Count == 6
                    && quickPalette.PresetColors.Children.OfType<System.Windows.Controls.Button>()
                        .All(b => Models.AccentColorValue.IsValid((string)b.Tag)));
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    quickPalette.HexInput.Text = "#ZZZZZZ";
                    ((System.Windows.Controls.Button)quickPalette.PresetColors.Children[1]).RaiseEvent(
                        new RoutedEventArgs(System.Windows.Controls.Primitives.ButtonBase.ClickEvent));
                }));
                Check("quick color applies immediately from invalid input", quickPalette.ShowDialog() == true && quickPalette.SelectedColor == "#A5FF6D");
                Check("accepted palette keeps preview", AccentTheme.CurrentColor == "#A5FF6D");
                AccentTheme.Apply(originalColor);
                controller.Preview();
            }
            if (tick == 2)
            {
                _settings!.Close();
                hiddenWindowPassed = !_settings.IsVisible && controller.IsPreviewPending;
            }
            if (tick == 6)
            {
                var overlays = Windows.OfType<BreakWindow>().ToList();
                var primary = overlays.FirstOrDefault(w => w.MainCard.Visibility == Visibility.Visible);
                success &= hiddenWindowPassed && controller.IsBreaking && !controller.IsPreviewPending
                    && overlays.Count == Forms.Screen.AllScreens.Length && primary != null
                    && primary.CountdownText.Text != $"{controller.Settings.DurationMinutes:00}:00";
                beforeCollapse = primary?.CountdownText.Text ?? "";
                if (primary != null)
                {
                    var nextBreak = controller.NextBreak;
                    AccentTheme.Apply("#C4B8DB");
                    var accent = (System.Windows.Media.Brush)Resources["AccentBrush"];
                    success &= primary.ProgressArc.Stroke == accent && primary.CollapseButton.Foreground == accent
                        && primary.FinishButton.Foreground == accent && controller.NextBreak == nextBreak;
                    AccentTheme.Apply(controller.Settings.AccentColor);
                    primary.MainCard.UpdateLayout();
                    // Only render the card: never write a desktop capture to disk.
                    SavePreview(primary.MainCard, Path.Combine(directory, "TakeBreak-break-card-preview.png"));
                }
                primary?.CollapseButton.RaiseEvent(new RoutedEventArgs(System.Windows.Controls.Primitives.ButtonBase.ClickEvent));
                success &= controller.IsBreakCollapsed && overlays.All(w => !w.IsVisible && w.DesktopImage.Source == null);
            }
            if (tick == 7)
            {
                var island = Windows.OfType<BreakIslandWindow>().FirstOrDefault();
                success &= controller.IsBreaking && controller.IsBreakCollapsed && island != null
                    && island.IsVisible && island.Topmost && !island.ShowInTaskbar
                    && island.Width == 520 && island.Height == 72
                    && Forms.Screen.FromHandle(new WindowInteropHelper(island).Handle).Primary
                    && string.CompareOrdinal(island.CountdownText.Text, beforeCollapse) < 0
                    && island.EndTimeText.Text.StartsWith("Завершится в ");
                if (island != null)
                {
                    island.UpdateLayout();
                    var timerPosition = island.CountdownText.TranslatePoint(new Point(0, 0), island.IslandCard);
                    string savedCountdown = island.CountdownText.Text, savedEnd = island.EndTimeText.Text;
                    foreach (string countdown in new[] { "00:09", "11:11", "120:00" })
                    {
                        island.CountdownText.Text = countdown;
                        island.EndTimeText.Text = countdown == "11:11" ? "До 12:00" : "Завершится в 23:59:59";
                        island.UpdateLayout();
                        Check("mini-panel positions stay fixed at " + countdown,
                            island.CountdownText.TranslatePoint(new Point(0, 0), island.IslandCard) == timerPosition);
                    }
                    island.CountdownText.Text = savedCountdown;
                    island.EndTimeText.Text = savedEnd;
                    island.UpdateLayout();
                    double titleCenter = island.TitleText.TranslatePoint(new Point(0, island.TitleText.ActualHeight / 2), island.IslandCard).Y;
                    double timerCenter = island.CountdownText.TranslatePoint(new Point(0, island.CountdownText.ActualHeight / 2), island.IslandCard).Y;
                    Check("mini-panel text centers align", Math.Abs(titleCenter - timerCenter) < 0.5 && island.TitleText.FontSize == island.CountdownText.FontSize);
                    SavePreview(island, Path.Combine(directory, "TakeBreak-island-preview.png"));
                }
            }
            if (tick == 8)
            {
                Windows.OfType<BreakIslandWindow>().FirstOrDefault()?.RestoreButton.RaiseEvent(
                    new RoutedEventArgs(System.Windows.Controls.Primitives.ButtonBase.ClickEvent));
                var overlays = Windows.OfType<BreakWindow>().ToList();
                var primary = overlays.FirstOrDefault(w => w.MainCard.Visibility == Visibility.Visible);
                success &= controller.IsBreaking && !controller.IsBreakCollapsed
                    && overlays.Count == Forms.Screen.AllScreens.Length && overlays.All(w => w.IsVisible)
                    && primary != null && string.CompareOrdinal(primary.CountdownText.Text, beforeCollapse) < 0;
            }
            if (tick == 9)
            {
                var primary = Windows.OfType<BreakWindow>().First(w => w.MainCard.Visibility == Visibility.Visible);
                primary.FinishButton.Focus();
                SendHoldKey(primary.FinishButton, true);
            }
            if (tick == 10)
            {
                var primary = Windows.OfType<BreakWindow>().First(w => w.MainCard.Visibility == Visibility.Visible);
                success &= controller.IsBreaking && primary.FinishButton.Progress > 0 && primary.FinishButton.Progress < 1;
                SavePreview(primary.MainCard, Path.Combine(directory, "TakeBreak-hold-preview.png"));
                SendHoldKey(primary.FinishButton, false);
                success &= controller.IsBreaking && primary.FinishButton.Progress == 0;
            }
            if (tick == 11)
            {
                var primary = Windows.OfType<BreakWindow>().First(w => w.MainCard.Visibility == Visibility.Visible);
                SendHoldKey(primary.FinishButton, true);
            }
            if (tick == 13)
            {
                success &= !controller.IsBreaking && !controller.IsBreakCollapsed
                    && !Windows.OfType<BreakWindow>().Any() && !Windows.OfType<BreakIslandWindow>().Any();
                ShowSettings();
                success &= _settings!.IsVisible;
                timer.Stop();
                File.WriteAllText(Path.Combine(directory, "TakeBreak-smoke-result.txt"), success ? "PASS" : "FAIL\n" + string.Join("\n", failures));
                Shutdown(success ? 0 : 2);
            }
        };
        timer.Start();
    }

    private static void SendHoldKey(UIElement button, bool down)
    {
        button.RaiseEvent(new KeyEventArgs(Keyboard.PrimaryDevice, PresentationSource.FromVisual(button), Environment.TickCount, Key.Space)
        {
            RoutedEvent = down ? Keyboard.PreviewKeyDownEvent : Keyboard.PreviewKeyUpEvent
        });
    }

    private static void SavePreview(FrameworkElement visual, string path)
    {
        visual.UpdateLayout();
        var bitmap = new RenderTargetBitmap((int)visual.ActualWidth, (int)visual.ActualHeight, 96, 96, System.Windows.Media.PixelFormats.Pbgra32);
        bitmap.Render(visual);
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(bitmap));
        using var stream = File.Create(path);
        encoder.Save(stream);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _stopping = true;
        if (_ownsMutex)
        {
            _wake?.Set();
            _wakeThread?.Join(1000);
            _controller?.Dispose();
            if (_settings != null) { _settings.AllowClose = true; _settings.Close(); }
            if (_tray != null) { _tray.Visible = false; _tray.Dispose(); }
            _menu?.Dispose();
            _icon?.Dispose();
            _mutex?.ReleaseMutex();
        }
        _wake?.Dispose();
        _mutex?.Dispose();
        base.OnExit(e);
    }
}

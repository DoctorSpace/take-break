using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using TakeBreak.Models;
using TakeBreak.Services;

namespace TakeBreak;

public partial class AccentColorWindow : Window
{
    private bool _updating = true;
    private double _saturation;
    private double _value;
    private readonly string _originalColor;
    public string SelectedColor { get; private set; }
    public event Action<string>? ColorChanged;

    public AccentColorWindow(string color)
    {
        SelectedColor = color;
        _originalColor = AccentTheme.CurrentColor;
        InitializeComponent();
        var hsv = AccentColorValue.ToHsv(color);
        HueSlider.Value = hsv.Hue;
        _saturation = hsv.Saturation;
        _value = hsv.Value;
        _updating = false;
        RefreshColor();
        Loaded += (_, _) => MoveMarker();
        ColorPlane.SizeChanged += (_, _) => MoveMarker();
        Closed += (_, _) => { if (DialogResult != true) AccentTheme.Apply(_originalColor); };
        SourceInitialized += (_, _) => NativeMethods.DarkTitleBar(new WindowInteropHelper(this).Handle);
    }

    private void RefreshColor()
    {
        _updating = true;
        SelectedColor = AccentColorValue.FromHsv(HueSlider.Value, _saturation, _value);
        ColorPlane.Background = Brush(AccentColorValue.FromHsv(HueSlider.Value, 1, 1));
        PreviewSwatch.Background = Brush(SelectedColor);
        HexInput.Text = SelectedColor;
        ColorError.Text = "";
        ColorError.Visibility = Visibility.Collapsed;
        ApplyButton.IsEnabled = true;
        MoveMarker();
        _updating = false;
        PreviewColor();
    }

    private void PreviewColor()
    {
        AccentTheme.Apply(SelectedColor);
        ColorChanged?.Invoke(SelectedColor);
    }

    private static SolidColorBrush Brush(string hex) => new((Color)ColorConverter.ConvertFromString(hex));
    private void MoveMarker()
    {
        Canvas.SetLeft(ColorMarker, Math.Clamp(_saturation * ColorPlane.ActualWidth - 6, 0, Math.Max(0, ColorPlane.ActualWidth - 12)));
        Canvas.SetTop(ColorMarker, Math.Clamp((1 - _value) * ColorPlane.ActualHeight - 6, 0, Math.Max(0, ColorPlane.ActualHeight - 12)));
    }

    private void Hue_Changed(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (!_updating) RefreshColor();
    }

    private void Hex_Changed(object sender, TextChangedEventArgs e)
    {
        if (_updating) return;
        if (!AccentColorValue.IsValid(HexInput.Text))
        {
            ColorError.Text = "Введите цвет в формате #RRGGBB";
            ColorError.Visibility = Visibility.Visible;
            ApplyButton.IsEnabled = false;
            return;
        }
        _updating = true;
        SelectedColor = HexInput.Text.ToUpperInvariant();
        var hsv = AccentColorValue.ToHsv(SelectedColor);
        _saturation = hsv.Saturation;
        _value = hsv.Value;
        if (hsv.Saturation > 0) HueSlider.Value = hsv.Hue;
        ColorPlane.Background = Brush(AccentColorValue.FromHsv(HueSlider.Value, 1, 1));
        PreviewSwatch.Background = Brush(SelectedColor);
        ColorError.Text = "";
        ColorError.Visibility = Visibility.Collapsed;
        ApplyButton.IsEnabled = true;
        MoveMarker();
        _updating = false;
        PreviewColor();
    }

    private void PickPoint(MouseEventArgs e)
    {
        var point = e.GetPosition(ColorPlane);
        _saturation = Math.Clamp(point.X / Math.Max(1, ColorPlane.ActualWidth), 0, 1);
        _value = 1 - Math.Clamp(point.Y / Math.Max(1, ColorPlane.ActualHeight), 0, 1);
        RefreshColor();
    }

    private void Plane_MouseDown(object sender, MouseButtonEventArgs e)
    {
        if (ColorPlane.CaptureMouse()) PickPoint(e);
        e.Handled = true;
    }

    private void Plane_MouseMove(object sender, MouseEventArgs e)
    {
        if (ColorPlane.IsMouseCaptured && e.LeftButton == MouseButtonState.Pressed) PickPoint(e);
    }

    private void Plane_MouseUp(object sender, MouseButtonEventArgs e)
    {
        if (ColorPlane.IsMouseCaptured) { PickPoint(e); ColorPlane.ReleaseMouseCapture(); }
        e.Handled = true;
    }

    private void Apply_Click(object sender, RoutedEventArgs e)
    {
        if (AccentColorValue.IsValid(HexInput.Text)) DialogResult = true;
    }

    private void Preset_Click(object sender, RoutedEventArgs e)
    {
        HexInput.Text = (string)((Button)sender).Tag;
        DialogResult = true;
    }
}

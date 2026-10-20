using System;
using System.IO;
using Microsoft.Win32;

namespace TakeBreak.Services;

internal static class StartupRegistration
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "TakeBreak";

    internal static bool IsEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKey);
        return key?.GetValue(ValueName) is string value && !string.IsNullOrWhiteSpace(value);
    }

    internal static void SetEnabled(bool enabled)
    {
        // Per-user startup needs no administrator rights. Never touch other Run entries.
        using var key = Registry.CurrentUser.CreateSubKey(RunKey, writable: true);
        if (!enabled) { key.DeleteValue(ValueName, throwOnMissingValue: false); return; }
        string executable = Environment.ProcessPath ?? throw new IOException("Не удалось определить путь к приложению.");
        if (!string.Equals(Path.GetFileName(executable), "TakeBreak.exe", StringComparison.OrdinalIgnoreCase))
            throw new IOException("Автозапуск доступен в собранном TakeBreak.exe.");
        key.SetValue(ValueName, $"\"{executable}\" --tray", RegistryValueKind.String);
    }
}

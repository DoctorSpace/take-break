using System;
using System.IO;
using System.Text.Json;
using TakeBreak.Models;

namespace TakeBreak.Services;

public static class SettingsStore
{
    public static string DirectoryPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TakeBreak");
    public static string FilePath => Path.Combine(DirectoryPath, "settings.json");

    public static BreakSettings Load()
    {
        try
        {
            if (File.Exists(FilePath))
            {
                var settings = JsonSerializer.Deserialize<BreakSettings>(File.ReadAllText(FilePath));
                if (settings != null && settings.IsValid(out _)) return settings;
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
        {
            Log(ex);
        }
        return new BreakSettings();
    }

    public static void Save(BreakSettings settings)
    {
        Directory.CreateDirectory(DirectoryPath);
        string temporaryPath = FilePath + ".tmp";
        File.WriteAllText(temporaryPath, JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true }));
        File.Move(temporaryPath, FilePath, overwrite: true);
    }

    public static void Log(Exception exception)
    {
        try
        {
            Directory.CreateDirectory(DirectoryPath);
            File.AppendAllText(Path.Combine(DirectoryPath, "errors.log"), $"{DateTime.Now:O} {exception}\n");
        }
        catch { /* Logging must never prevent cleanup or startup. */ }
    }
}

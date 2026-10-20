using System;
using System.Collections.Generic;
using System.Linq;

namespace TakeBreak.Models;

public sealed class BreakSettings
{
    public int IntervalMinutes { get; set; } = 40;
    public int DurationMinutes { get; set; } = 3;
    public string StartTime { get; set; } = "09:00";
    public string EndTime { get; set; } = "18:00";
    public List<DayOfWeek> Days { get; set; } = new()
    {
        DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday,
        DayOfWeek.Thursday, DayOfWeek.Friday
    };
    public bool Enabled { get; set; } = true;
    public string AccentColor { get; set; } = "#B8CDB5";

    public bool IsValid(out string error)
    {
        error = "";
        if (IntervalMinutes < 1 || IntervalMinutes > 480)
            error = "Интервал должен быть от 1 до 480 минут.";
        else if (DurationMinutes < 1 || DurationMinutes > 120)
            error = "Перерыв должен длиться от 1 до 120 минут.";
        else if (!TimeSpan.TryParseExact(StartTime, @"hh\:mm", null, out var start) || start >= TimeSpan.FromDays(1)
            || !TimeSpan.TryParseExact(EndTime, @"hh\:mm", null, out var end) || end >= TimeSpan.FromDays(1))
            error = "Укажите время в формате ЧЧ:ММ, например 09:00.";
        else if (Days == null || Days.Count == 0 || Days.Any(d => !Enum.IsDefined(d)))
            error = "Выберите хотя бы один день недели.";
        else if (!AccentColorValue.IsValid(AccentColor))
            error = "Выберите акцентный цвет из палитры.";
        return error.Length == 0;
    }
}

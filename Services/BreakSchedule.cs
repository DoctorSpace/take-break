using System;
using TakeBreak.Models;

namespace TakeBreak.Services;

// Pure scheduling logic; overnight windows belong to the day on which they start.
public static class BreakSchedule
{
    public static bool IsAllowed(BreakSettings settings, DateTime now)
    {
        if (!settings.Enabled) return false;
        for (int i = -1; i <= 0; i++)
        {
            var day = now.Date.AddDays(i);
            if (!settings.Days.Contains(day.DayOfWeek)) continue;
            var (start, end) = Window(settings, day);
            if (now >= start && now < end) return true;
        }
        return false;
    }

    public static DateTime? Next(BreakSettings settings, DateTime now)
    {
        if (!settings.Enabled || settings.Days.Count == 0) return null;
        var earliest = now.AddMinutes(settings.IntervalMinutes);
        for (int i = -1; i <= 8; i++)
        {
            var day = now.Date.AddDays(i);
            if (!settings.Days.Contains(day.DayOfWeek)) continue;
            var (start, end) = Window(settings, day);
            // Start a fresh work interval at the beginning of each active window.
            var firstInWindow = start.AddMinutes(settings.IntervalMinutes);
            var candidate = earliest > firstInWindow ? earliest : firstInWindow;
            if (candidate >= start && candidate < end) return candidate;
        }
        return null;
    }

    private static (DateTime Start, DateTime End) Window(BreakSettings settings, DateTime day)
    {
        var start = day.Add(TimeSpan.Parse(settings.StartTime));
        var end = day.Add(TimeSpan.Parse(settings.EndTime));
        if (end <= start) end = end.AddDays(1); // Equal times mean a full day.
        return (start, end);
    }
}

using TakeBreak.Models;
using TakeBreak.Services;

int passed = 0;
void Check(string name, bool result)
{
    if (!result) throw new Exception($"FAIL: {name}");
    Console.WriteLine($"PASS: {name}");
    passed++;
}
DateTime Monday(int hour, int minute = 0) => new(2026, 10, 12, hour, minute, 0);
var settings = new BreakSettings();
Check("defaults valid", settings.IsValid(out _));
Check("default accent is sage", settings.AccentColor == "#B8CDB5");
foreach (var accent in new[] { "#B8CDB5", "#C4B8DB", "#DCC8A3", "#D9B4B5", "#C8C8C8", "#a13c8e", "#000000", "#FFFFFF", "#123456" })
{
    settings.AccentColor = accent;
    Check($"accent {accent} valid", settings.IsValid(out _));
}
settings.AccentColor = "not a color";
Check("invalid accent rejected", !settings.IsValid(out _));
settings.AccentColor = null!;
Check("null accent rejected", !settings.IsValid(out _));
foreach (var accent in new[] { "#ABC", "#FF123456", "1234567", "#12GG56", "#１２３４５６", "#12345 ", "" })
{
    settings.AccentColor = accent;
    Check($"malformed accent '{accent}' rejected", !settings.IsValid(out _));
}
Check("HSV red", AccentColorValue.FromHsv(0, 1, 1) == "#FF0000");
Check("HSV green", AccentColorValue.FromHsv(120, 1, 1) == "#00FF00");
Check("HSV blue", AccentColorValue.FromHsv(240, 1, 1) == "#0000FF");
Check("HSV hue wraps", AccentColorValue.FromHsv(360, 1, 1) == "#FF0000");
Check("HSV grayscale", AccentColorValue.FromHsv(120, 0, 0.5) == "#808080");
foreach (var hex in new[] { "#B8CDB5", "#A13C8E", "#FFFFFF", "#000000", "#123456", "#FF0000", "#0000FF" })
{
    var hsv = AccentColorValue.ToHsv(hex);
    Check($"HSV round trip {hex}", AccentColorValue.FromHsv(hsv.Hue, hsv.Saturation, hsv.Value) == hex);
}
Check("dark accent gets light text", AccentColorValue.Foreground("#000000") == "#F2F2F2");
Check("light accent gets dark text", AccentColorValue.Foreground("#FFFFFF") == "#202020");
settings.AccentColor = "#B8CDB5";
var migrated = System.Text.Json.JsonSerializer.Deserialize<BreakSettings>("{\"IntervalMinutes\":30}")!;
Check("old settings acquire default accent", migrated.IsValid(out _) && migrated.AccentColor == "#B8CDB5" && migrated.IntervalMinutes == 30);
var restored = System.Text.Json.JsonSerializer.Deserialize<BreakSettings>(System.Text.Json.JsonSerializer.Serialize(new BreakSettings { AccentColor = "#C4B8DB" }))!;
Check("accent survives serialization", restored.AccentColor == "#C4B8DB");
Check("twenty unique headings", BreakHeadings.All.Length == 20 && BreakHeadings.All.Distinct().Count() == 20);
string previousHeading = "";
bool validHeadings = true;
var seenHeadings = new HashSet<string>();
for (int i = 0; i < 1000; i++)
{
    string heading = BreakHeadings.Next();
    validHeadings &= BreakHeadings.All.Contains(heading) && heading != previousHeading;
    seenHeadings.Add(heading);
    previousHeading = heading;
}
Check("random headings belong to set and do not repeat consecutively", validHeadings);
Check("random selection reaches all headings", seenHeadings.Count == 20);
Check("interval during work", BreakSchedule.Next(settings, Monday(10)) == Monday(10, 40));
Check("first interval starts at opening", BreakSchedule.Next(settings, Monday(8)) == Monday(9, 40));
Check("launch shortly before opening still waits full interval", BreakSchedule.Next(settings, Monday(8, 50)) == Monday(9, 40));
Check("after closing goes to next day", BreakSchedule.Next(settings, Monday(17, 50)) == Monday(9, 40).AddDays(1));
Check("skip weekend", BreakSchedule.Next(settings, Monday(17, 50).AddDays(4)) == Monday(9, 40).AddDays(7));
Check("start inclusive", BreakSchedule.IsAllowed(settings, Monday(9)));
Check("end exclusive", !BreakSchedule.IsAllowed(settings, Monday(18)));
Check("outside active hours", !BreakSchedule.IsAllowed(settings, Monday(8)));
Check("weekend excluded", !BreakSchedule.IsAllowed(settings, Monday(10).AddDays(5)));
settings.Enabled = false;
Check("pause disables scheduling", BreakSchedule.Next(settings, Monday(10)) == null);
Check("pause disables triggers", !BreakSchedule.IsAllowed(settings, Monday(10)));
settings.Enabled = true;
settings.StartTime = "22:00";
settings.EndTime = "06:00";
settings.Days = new() { DayOfWeek.Monday };
Check("overnight begins on selected day", BreakSchedule.IsAllowed(settings, Monday(23)));
Check("overnight extends to unselected day", BreakSchedule.IsAllowed(settings, Monday(2).AddDays(1)));
Check("overnight not previous morning", !BreakSchedule.IsAllowed(settings, Monday(2)));
Check("overnight excludes closing", !BreakSchedule.IsAllowed(settings, Monday(6).AddDays(1)));
Check("overnight next crossing midnight", BreakSchedule.Next(settings, Monday(23, 50)) == Monday(0, 30).AddDays(1));
settings.StartTime = settings.EndTime = "09:00";
Check("equal times mean full day", BreakSchedule.IsAllowed(settings, Monday(5).AddDays(1)));
settings.StartTime = "09:00";
settings.EndTime = "09:30";
Check("too short window returns no break", BreakSchedule.Next(settings, Monday(8)) == null);
settings.IntervalMinutes = 0;
Check("zero interval invalid", !settings.IsValid(out _));
settings.IntervalMinutes = 481;
Check("excess interval invalid", !settings.IsValid(out _));
settings.IntervalMinutes = 30;
settings.DurationMinutes = 121;
Check("excess duration invalid", !settings.IsValid(out _));
settings.DurationMinutes = 3;
settings.StartTime = "25:00";
Check("invalid clock time", !settings.IsValid(out _));
settings.StartTime = "9:00";
Check("strict time format", !settings.IsValid(out _));
settings.StartTime = "09:00";
settings.Days.Clear();
Check("no days invalid", !settings.IsValid(out _));
settings.Days.Add((DayOfWeek)42);
Check("invalid day rejected", !settings.IsValid(out _));
settings.Days = null!;
Check("null days rejected", !settings.IsValid(out _));
Console.WriteLine($"\n{passed} checks passed.");

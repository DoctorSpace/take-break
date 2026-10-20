using System;

namespace TakeBreak.Services;

internal static class BreakHeadings
{
    internal static readonly string[] All =
    {
        "Время выдохнуть.",
        "Побудьте в моменте.",
        "Можно не спешить.",
        "Маленькая пауза для вас.",
        "Дела подождут.",
        "Пора перевести дух.",
        "Отпустите суету.",
        "Вернитесь к себе.",
        "Пусть мир подождёт.",
        "Немного тишины.",
        "Вдох. И выдох.",
        "Сейчас можно просто быть.",
        "Дайте мыслям отдохнуть.",
        "Пауза — тоже часть пути.",
        "Замедлитесь на минуту.",
        "Вы уже многое сделали.",
        "Время восстановить силы.",
        "Оставьте спешку за окном.",
        "Подарите себе передышку.",
        "Новый вдох — новые силы."
    };
    private static int _previous = -1;

    internal static string Next()
    {
        // Random without an immediate repeat, including when a new break follows a short one.
        int index = Random.Shared.Next(All.Length - (_previous < 0 ? 0 : 1));
        if (_previous >= 0 && index >= _previous) index++;
        _previous = index;
        return All[index];
    }
}

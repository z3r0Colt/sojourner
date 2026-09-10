using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace SojournersStudy.Services;

public enum AppTheme
{
    Geneva,
    Parchment,
    Covenanter,
}

/// <summary>
/// Applies one of the three named themes (architecture doc section 6) by
/// mutating the app's named brush resources in place, rather than swapping
/// resource dictionaries: a StaticResource binding resolves once at load
/// time, so replacing the resource under an existing key would not update
/// controls already on screen. Every control that wants live theme support
/// must bind to {StaticResource PageBackgroundBrush} etc. rather than a
/// literal color.
/// </summary>
public static class ThemeService
{
    public static AppTheme Current { get; private set; } = AppTheme.Geneva;

    /// <summary>
    /// Raised after the shared brush resources are updated, so each open
    /// window can flip its own root element's RequestedTheme (Light/Dark) --
    /// that's what makes built-in Fluent control chrome (NavigationView,
    /// buttons, etc., which use system brushes like TextFillColorPrimary,
    /// not this app's custom ones) actually look right for Covenanter's dark
    /// theme. The shared brushes themselves need no such per-window step:
    /// mutating them in place already updates every window immediately.
    /// </summary>
    public static event Action<AppTheme>? ThemeChanged;

    public static ElementTheme ElementThemeFor(AppTheme theme) => theme == AppTheme.Covenanter ? ElementTheme.Dark : ElementTheme.Light;

    public static void Apply(AppTheme theme)
    {
        Current = theme;
        var resources = Application.Current.Resources;
        var background = (SolidColorBrush)resources["PageBackgroundBrush"];
        var foreground = (SolidColorBrush)resources["PageForegroundBrush"];
        var floatingMenu = (AcrylicBrush)resources["FloatingMenuBackgroundBrush"];

        (Color backgroundColor, Color foregroundColor, double acrylicTintOpacity) = theme switch
        {
            AppTheme.Geneva => (Rgb(0xFF, 0xFF, 0xFF), Rgb(0x1A, 0x1A, 0x1A), 0.6),
            AppTheme.Parchment => (Rgb(0xF4, 0xF0, 0xE6), Rgb(0x3E, 0x32, 0x22), 0.85),
            AppTheme.Covenanter => (Rgb(0x1E, 0x1E, 0x1E), Rgb(0xD4, 0xB8, 0x86), 0.6),
            _ => throw new ArgumentOutOfRangeException(nameof(theme)),
        };

        background.Color = backgroundColor;
        foreground.Color = foregroundColor;
        floatingMenu.TintColor = backgroundColor;
        floatingMenu.FallbackColor = backgroundColor;
        floatingMenu.TintOpacity = acrylicTintOpacity;

        ThemeChanged?.Invoke(theme);
    }

    private static Color Rgb(byte r, byte g, byte b) => new() { A = 255, R = r, G = g, B = b };
}

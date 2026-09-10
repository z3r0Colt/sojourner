using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Navigation;
using SojournersStudy.Pages;
using SojournersStudy.Services;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace SojournersStudy;

public sealed partial class MainWindow : Window
{
    private bool _zenMode;
    private NavigationViewPaneDisplayMode _paneDisplayModeBeforeZen;

    public MainWindow()
    {
        InitializeComponent();

        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);
        AppWindow.TitleBar.PreferredHeightOption = TitleBarHeightOption.Tall;
        AppWindow.SetIcon("Assets/AppIcon.ico");

        ThemeService.ThemeChanged += OnThemeChanged;
        RootGrid.RequestedTheme = ThemeService.ElementThemeFor(ThemeService.Current);

        Closed += (_, _) =>
        {
            ThemeService.ThemeChanged -= OnThemeChanged;
            TabTearOutCoordinator.Unregister(AppWindow.Id);
        };
    }

    private void OnThemeChanged(AppTheme theme) => RootGrid.RequestedTheme = ThemeService.ElementThemeFor(theme);

    private void ThemeButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button { Tag: string tagName } && Enum.TryParse(tagName, out AppTheme theme))
        {
            ThemeService.Apply(theme);
        }
    }

    private void ZenModeAccelerator_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        _zenMode = !_zenMode;
        if (_zenMode)
        {
            _paneDisplayModeBeforeZen = NavView.PaneDisplayMode;
            NavView.PaneDisplayMode = NavigationViewPaneDisplayMode.LeftMinimal;
            NavView.IsPaneOpen = false;
            TitleBarRow.Height = new GridLength(0);
        }
        else
        {
            NavView.PaneDisplayMode = _paneDisplayModeBeforeZen;
            TitleBarRow.Height = new GridLength(48);
        }

        args.Handled = true;
    }

    private void NavFrame_Navigated(object sender, NavigationEventArgs e)
    {
        // The Library page's TabView participates in tear-out (tabs can be
        // dragged out to a StudyTabHostWindow, or dragged back in) -- it has
        // to register itself with the coordinator every time it's navigated
        // to, since Frame.Navigate creates a fresh Page instance each time.
        if (e.Content is LibraryPage libraryPage)
        {
            TabTearOutCoordinator.Register(AppWindow.Id, libraryPage.TabViewControl, libraryPage.Items);
        }
    }

    private void TitleBar_PaneToggleRequested(TitleBar sender, object args)
    {
        NavView.IsPaneOpen = !NavView.IsPaneOpen;
    }

    private void TitleBar_BackRequested(TitleBar sender, object args)
    {
        NavFrame.GoBack();
    }

    private void NavView_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.IsSettingsSelected)
        {
            NavFrame.Navigate(typeof(SettingsPage));
        }
        else if (args.SelectedItem is NavigationViewItem item)
        {
            switch (item.Tag)
            {
                case "library":
                    NavFrame.Navigate(typeof(LibraryPage));
                    break;
                case "sermons":
                    NavFrame.Navigate(typeof(SermonBuilderPage));
                    break;
                case "family":
                    NavFrame.Navigate(typeof(FamilyWorshipPage));
                    break;
                case "about":
                    NavFrame.Navigate(typeof(AboutPage));
                    break;
                default:
                    throw new InvalidOperationException($"Unknown navigation item tag: {item.Tag}");
            }
        }
    }
}

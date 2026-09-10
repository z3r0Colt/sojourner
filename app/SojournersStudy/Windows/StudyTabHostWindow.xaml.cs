using System.Collections.ObjectModel;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SojournersStudy.Models;
using SojournersStudy.Services;

namespace SojournersStudy.Windows;

/// <summary>
/// A secondary window that exists only to receive tabs torn out of another
/// study TabView (the main window's, or another StudyTabHostWindow's) --
/// this is what lets a pastor drag a lexicon or commentary tab onto a second
/// monitor. Closes itself once its last tab is dragged away, mirroring how a
/// browser's torn-out window behaves.
/// </summary>
public sealed partial class StudyTabHostWindow : Window
{
    public ObservableCollection<StudyTabItem> Items { get; } = new();

    public StudyTabHostWindow()
    {
        InitializeComponent();
        Items.CollectionChanged += Items_CollectionChanged;
        TabTearOutCoordinator.Register(AppWindow.Id, HostTabView, Items);
        Closed += (_, _) => TabTearOutCoordinator.Unregister(AppWindow.Id);
    }

    private void Items_CollectionChanged(object? sender, System.Collections.Specialized.NotifyCollectionChangedEventArgs e)
    {
        if (Items.Count == 0)
        {
            Close();
        }
    }

    private void HostTabView_TabTearOutWindowRequested(TabView sender, TabViewTabTearOutWindowRequestedEventArgs args)
        => TabTearOutCoordinator.HandleTearOutWindowRequested(sender, args);

    private void HostTabView_TabTearOutRequested(TabView sender, TabViewTabTearOutRequestedEventArgs args)
        => TabTearOutCoordinator.HandleTearOutRequested(args, Items);
}

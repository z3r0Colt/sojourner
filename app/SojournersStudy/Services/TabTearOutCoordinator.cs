using System.Collections.ObjectModel;
using Microsoft.UI;
using Microsoft.UI.Xaml.Controls;
using SojournersStudy.Models;
using SojournersStudy.Windows;

namespace SojournersStudy.Services;

/// <summary>
/// Tracks which <see cref="WindowId"/> hosts which study TabView + backing
/// collection, so a torn-out tab's data item can be moved from its origin
/// window's collection into the destination window's collection (new or
/// already-open) rather than just visually relocated. TabView's tear-out
/// events only hand back the dragged item(s) and a WindowId -- actually
/// moving the underlying data across windows is left to the app, which is
/// why every window that can host a study TabView must register itself here
/// (see MainWindow's NavFrame.Navigated handler and StudyTabHostWindow's
/// constructor).
/// </summary>
public static class TabTearOutCoordinator
{
    private sealed record Host(TabView TabView, ObservableCollection<StudyTabItem> Items);

    private static readonly Dictionary<WindowId, Host> Hosts = new();

    public static void Register(WindowId windowId, TabView tabView, ObservableCollection<StudyTabItem> items)
    {
        Hosts[windowId] = new Host(tabView, items);
    }

    public static void Unregister(WindowId windowId)
    {
        Hosts.Remove(windowId);
    }

    /// Fires when a drag would need a brand-new window to drop into (i.e. the
    /// tab was released somewhere that isn't an existing tab strip). Creates
    /// that window up front and reports its id back through <paramref
    /// name="args"/> so the framework can finish the tear-out against it.
    public static void HandleTearOutWindowRequested(TabView sender, TabViewTabTearOutWindowRequestedEventArgs args)
    {
        var window = new StudyTabHostWindow();
        window.Activate();
        args.NewWindowId = window.AppWindow.Id;
    }

    /// Fires once the destination window (new or existing) is known. Moves
    /// the dragged item(s) out of the source collection and into the
    /// destination's -- both windows must already be registered.
    public static void HandleTearOutRequested(TabViewTabTearOutRequestedEventArgs args, ObservableCollection<StudyTabItem> sourceItems)
    {
        if (!Hosts.TryGetValue(args.NewWindowId, out var destination))
        {
            return;
        }

        foreach (var obj in args.Items)
        {
            if (obj is StudyTabItem item)
            {
                sourceItems.Remove(item);
                destination.Items.Add(item);
            }
        }
    }
}

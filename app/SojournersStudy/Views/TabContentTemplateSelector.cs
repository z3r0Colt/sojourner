using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SojournersStudy.Models;

namespace SojournersStudy.Views;

/// <summary>Picks a tab's body template from its <see cref="StudyTabItem.Kind"/> -- see StudyTabItem's own doc comment for why this is data-driven rather than embedding a live control.</summary>
public sealed class TabContentTemplateSelector : DataTemplateSelector
{
    public DataTemplate? PlainTextTemplate { get; set; }

    public DataTemplate? InterlinearTemplate { get; set; }

    protected override DataTemplate? SelectTemplateCore(object item) =>
        item is StudyTabItem { Kind: TabContentKind.Interlinear } ? InterlinearTemplate : PlainTextTemplate;

    protected override DataTemplate? SelectTemplateCore(object item, DependencyObject container) => SelectTemplateCore(item);
}

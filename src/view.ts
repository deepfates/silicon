import { ItemView, WorkspaceLeaf } from "obsidian";

export const VIEW_TYPE_SILICON = "silicon-view";

export class SiliconView extends ItemView {
  filenames: string[];
  ribbonName: string;
  ribbonIcon: string;
  
  constructor(leaf: WorkspaceLeaf, filenames: string[]) {
    super(leaf);
    this.ribbonName = 'Silicon';
    this.ribbonIcon = 'mountain';
    this.getIcon = () => this.ribbonIcon;
    this.filenames = filenames;
  }

  getViewType() {
    return VIEW_TYPE_SILICON;
  }

  getDisplayText() {
    return "Example view";
  }

  async onOpen() {
    this.update(this.filenames)
  }

  async update(filenames: string[]) {
    console.log("Updating view")
    // THis is called when the view is opened, or when the user switches to another file
    // We want to search again, and update the view
      // Get the list of filenames
      const container = this.containerEl.children[1];
      container.empty();
      console.log(filenames)
      if (filenames === undefined) {
        container.createEl("div", { text: "There was an error" });
        return;
      }
      if (filenames.length === 0) {
        container.createEl("div", { text: "No results" });
        return;
      }
      // Create a link for each filename
      const outerDiv = container.createEl("div", { cls: "outgoing-link-pane node-insert-event"});
      const header = outerDiv.createEl("div", { cls: "outgoing-link-header", text: "Related pages" });
      outerDiv.createEl("br")
      const resultsDiv = outerDiv.createEl("div", { cls: "search-result-container" });
      for (const filename of filenames) {
        const link = resultsDiv.createEl("a", { href: filename, cls: "tree-item-self is-clickable outgoing-link-item", attr: { "data-path": filename } });
        link.createEl("span", {   
                  text: filename.split("/").pop()?.split(".md")[0],
                  cls: "tree-item-inner"    });
        link.addEventListener("click", () => {
          console.log("Clicked link");
          this.app.workspace.openLinkText(filename, "", false);
        });

      }
  }
  

  async onClose() {
    // Nothing to clean up.
  }
}
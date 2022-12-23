import { ItemView, WorkspaceLeaf } from "obsidian";

export const VIEW_TYPE_SILICON = "silicon-view";

export class SiliconView extends ItemView {
  embeds: { path: string, similarity: number }[];
  threshold: number;
  ribbonName: string;
  ribbonIcon: string;
  
  constructor(leaf: WorkspaceLeaf, embeds: { path: string, similarity: number }[], threshold: number = 0.85) {
    super(leaf);
    this.ribbonName = 'Silicon';
    this.ribbonIcon = 'mountain';
    this.getIcon = () => this.ribbonIcon;
    this.embeds = embeds;
    this.threshold = threshold;
  }

  getViewType() {
    return VIEW_TYPE_SILICON;
  }

  getDisplayText() {
    return "Silicon";
  }

  async onOpen() {
    this.update(this.embeds)
  }

  async update(embeds: { path: string, similarity: number }[]) {
    // console.log("Updating view")
    // THis is called when the view is opened, or when the user switches to another file
    // We want to search again, and update the view
      // Get the list of embeds
      const container = this.containerEl.children[1];
      container.empty();
      const outerDiv = container.createEl("div", { cls: "outgoing-link-pane node-insert-event"});
      // console.log(embeds)
      if (embeds === undefined) {
        outerDiv.createEl("div", { text: "There was an error" });
        return;
      }
      if (embeds.length === 0) {
        outerDiv.createEl("div", { text: "⛰" });
        return;
      }
      // Create a link for each path
      outerDiv.createEl("div", { cls: "outgoing-link-header", text: "⛰" });
      outerDiv.createEl("br")
      const resultsDiv = outerDiv.createEl("div", { cls: "search-result-container" });
      // get the top value
      const topValue = embeds[0].similarity;
      for (const embed of embeds) {
        const [path, similarity] = [embed.path, embed.similarity];
        const opacity = sCurve(similarity, this.threshold, topValue);
        const link = resultsDiv.createEl("a", { href: path, cls: "tree-item-self is-clickable outgoing-link-item", attr: { "data-path": path } });
        link.createEl("span", {   
                  text: path.split("/").pop()?.split(".md")[0],
                  cls: "tree-item-inner",
                  // show similarity in hover tooltip
                  attr: { title: `Similarity: ${similarity.toPrecision(2)}, Opacity: ${opacity.toPrecision(2)}`, style: `opacity: ${opacity}` }
                  
                    });
        link.addEventListener("click", () => {
          // console.log("Clicked link");
          this.app.workspace.openLinkText(path, "", false);
        });

      }
  }
  

  async onClose() {
    // Nothing to clean up.
  }
}

// this is a utility function to convert linear opacity to an S-curve
// this is used to make the opacity of the links more gradual
// the opacity is 0.4 from 0 to the bottomThreshold, and then increases in an S curve to 1 at the topThreshold
function sCurve(x: number, bottomThreshold: number, topThreshold: number =0.95) {
  if (x < bottomThreshold) {
    return 0.4;
  }
  if (x > topThreshold) {
    return 1;
  }
  const a = 1 / (topThreshold - bottomThreshold);
  const b = -a * bottomThreshold;
  const y = a * x + b;
  return 0.4 + 0.6 * y;
}
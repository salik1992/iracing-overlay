export interface GarageView {
  show(visible: boolean): void;
}

export function createView(parent: ParentNode): GarageView {
  const cover = document.createElement("div");
  cover.className = "cover";
  const image = document.createElement("img");
  image.src = "/garage/cover.png";
  image.alt = "";
  cover.append(image);
  parent.append(cover);
  return {
    show(visible: boolean): void {
      cover.classList.toggle("is-shown", visible);
    },
  };
}

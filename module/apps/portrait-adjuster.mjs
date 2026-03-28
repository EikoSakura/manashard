const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * A small dialog that lets the user drag-to-reposition a portrait image
 * inside a diamond-shaped frame and optionally swap the image file.
 *
 * Usage:
 *   const result = await PortraitAdjuster.open({ img, offsetX, offsetY });
 *   // result = { img, offsetX, offsetY } or null if closed without confirming
 */
export class PortraitAdjuster extends HandlebarsApplicationMixin(ApplicationV2) {

  static PARTS = {
    body: { template: "systems/manashard/templates/apps/portrait-adjuster.hbs" }
  };

  static DEFAULT_OPTIONS = {
    id: "portrait-adjuster",
    classes: ["manashard", "portrait-adjuster-app"],
    position: { width: 320, height: "auto" },
    window: {
      title: "Adjust Portrait",
      resizable: false
    },
    tag: "div",
    actions: {
      changeImage: PortraitAdjuster.#onChangeImage,
      flipImage: PortraitAdjuster.#onFlipImage,
      confirm: PortraitAdjuster.#onConfirm
    }
  };

  #img;
  #offsetX;
  #offsetY;
  #mirrored;
  #resolve;

  // Drag state
  #dragging = false;
  #startPointerX = 0;
  #startPointerY = 0;
  #startOffsetX = 0;
  #startOffsetY = 0;

  // Bound handlers for cleanup
  #boundMove = null;
  #boundUp = null;

  constructor({ img, offsetX = 50, offsetY = 0, mirrored = false, resolve }, options = {}) {
    super(options);
    this.#img = img;
    this.#offsetX = offsetX;
    this.#offsetY = offsetY;
    this.#mirrored = mirrored;
    this.#resolve = resolve;
  }

  /**
   * Open the adjuster and return a Promise that resolves with the result.
   * @param {object} opts  { img, offsetX, offsetY }
   * @returns {Promise<{img: string, offsetX: number, offsetY: number}|null>}
   */
  static open({ img, offsetX = 50, offsetY = 0, mirrored = false }) {
    return new Promise(resolve => {
      const app = new this({ img, offsetX, offsetY, mirrored, resolve });
      app.render(true);
    });
  }

  /* -------------------------------------------- */

  async _prepareContext(options) {
    return {
      img: this.#img,
      offsetX: this.#offsetX,
      offsetY: this.#offsetY,
      mirrored: this.#mirrored
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const diamond = this.element.querySelector(".pa-diamond");
    if (!diamond) return;

    diamond.addEventListener("pointerdown", (e) => this.#onDragStart(e));

    this.#boundMove = (e) => this.#onDragMove(e);
    this.#boundUp = (e) => this.#onDragEnd(e);
  }

  _onClose(options) {
    // If closed without confirming, resolve null
    if (this.#resolve) {
      this.#resolve(null);
      this.#resolve = null;
    }
    // Clean up global listeners
    window.removeEventListener("pointermove", this.#boundMove);
    window.removeEventListener("pointerup", this.#boundUp);
    super._onClose(options);
  }

  /* -------------------------------------------- */
  /*  Drag Handlers                                */
  /* -------------------------------------------- */

  #onDragStart(event) {
    event.preventDefault();
    this.#dragging = true;
    this.#startPointerX = event.clientX;
    this.#startPointerY = event.clientY;
    this.#startOffsetX = this.#offsetX;
    this.#startOffsetY = this.#offsetY;

    const diamond = this.element.querySelector(".pa-diamond");
    diamond.classList.add("dragging");

    window.addEventListener("pointermove", this.#boundMove);
    window.addEventListener("pointerup", this.#boundUp);
  }

  #onDragMove(event) {
    if (!this.#dragging) return;
    const img = this.element.querySelector(".pa-diamond img");
    if (!img) return;

    const dx = event.clientX - this.#startPointerX;
    const dy = event.clientY - this.#startPointerY;

    // Convert pixel delta to percentage of the diamond container
    const diamond = this.element.querySelector(".pa-diamond");
    const w = diamond.offsetWidth;
    const h = diamond.offsetHeight;

    // Dragging right means showing more of the left side → decrease offsetX
    // When mirrored, the visual axis is flipped, so invert the X delta
    const pctX = (dx / w) * 100 * (this.#mirrored ? -1 : 1);
    const pctY = (dy / h) * 100;

    this.#offsetX = Math.round(Math.min(100, Math.max(0, this.#startOffsetX - pctX)));
    this.#offsetY = Math.round(Math.min(100, Math.max(0, this.#startOffsetY - pctY)));

    img.style.objectPosition = `${this.#offsetX}% ${this.#offsetY}%`;
  }

  #onDragEnd(event) {
    this.#dragging = false;
    const diamond = this.element.querySelector(".pa-diamond");
    diamond?.classList.remove("dragging");

    window.removeEventListener("pointermove", this.#boundMove);
    window.removeEventListener("pointerup", this.#boundUp);
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  static async #onChangeImage(event, target) {
    const fp = new FilePicker({
      type: "image",
      current: this.#img,
      callback: (path) => {
        this.#img = path;
        this.#offsetX = 50;
        this.#offsetY = 0;
        this.render();
      }
    });
    fp.render(true);
  }

  static async #onFlipImage(event, target) {
    this.#mirrored = !this.#mirrored;
    const img = this.element.querySelector(".pa-diamond img");
    if (img) img.style.transform = this.#mirrored ? "scaleX(-1)" : "";
    target.classList.toggle("active", this.#mirrored);
  }

  static async #onConfirm(event, target) {
    if (this.#resolve) {
      this.#resolve({
        img: this.#img,
        offsetX: this.#offsetX,
        offsetY: this.#offsetY,
        mirrored: this.#mirrored
      });
      this.#resolve = null;
    }
    this.close();
  }
}

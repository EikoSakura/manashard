/**
 * Reusable tag/chip input widget with inline autocomplete dropdown.
 * Renders chips inline with a text input; typing filters a dropdown of suggestions.
 * Supports free-text entry — press Enter to add any custom tag.
 */

/**
 * Render the tag input HTML.
 * @param {object} options
 * @param {string} options.name - Field name for data collection (used as data attribute)
 * @param {Object<string,string>} options.choices - { key: localizedLabel } suggested options
 * @param {string[]} options.selected - Array of already-selected keys
 * @param {string} [options.placeholder="Add..."] - Placeholder text for the input
 * @returns {string} HTML string
 */
export function renderTagInput({ name, choices, selected = [], placeholder = "Add..." }) {
  const chips = selected.map(k => {
    const label = choices[k] ?? k;
    return `<span class="tag-chip" data-value="${k}">${label}<button type="button" class="tag-chip-remove" title="Remove">&times;</button></span>`;
  }).join("");

  return `
    <div class="tag-input-wrapper" data-tag-name="${name}">
      <div class="tag-input-chips">
        ${chips}
        <input type="text" class="tag-input-field" placeholder="${placeholder}" autocomplete="off" />
      </div>
      <ul class="tag-autocomplete"></ul>
    </div>`;
}

/**
 * Bind interactivity to a rendered tag input widget.
 * @param {HTMLElement} container - Parent element containing the tag widget
 * @param {string} name - The data-tag-name to find the widget
 * @param {Object<string,string>} choices - { key: localizedLabel } suggested options
 * @param {Function} [onChange] - Called with current array of selected keys whenever it changes
 */
export function bindTagInput(container, name, choices, onChange) {
  const wrapper = container.querySelector(`.tag-input-wrapper[data-tag-name="${name}"]`);
  if (!wrapper) return;

  const chipsContainer = wrapper.querySelector(".tag-input-chips");
  const input = wrapper.querySelector(".tag-input-field");
  const dropdown = wrapper.querySelector(".tag-autocomplete");

  function getSelected() {
    return [...wrapper.querySelectorAll(".tag-chip")].map(el => el.dataset.value);
  }

  function fireChange() {
    if (onChange) onChange(getSelected());
  }

  function addChip(key) {
    // Normalize: lowercase, trimmed
    key = key.trim().toLowerCase();
    if (!key) return;

    // Prevent duplicates
    if (getSelected().includes(key)) {
      input.value = "";
      hideDropdown();
      return;
    }

    const label = choices[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.dataset.value = key;
    chip.innerHTML = `${label}<button type="button" class="tag-chip-remove" title="Remove">&times;</button>`;
    chipsContainer.insertBefore(chip, input);

    chip.querySelector(".tag-chip-remove").addEventListener("click", (e) => {
      e.stopPropagation();
      chip.remove();
      fireChange();
    });

    input.value = "";
    hideDropdown();
    fireChange();
  }

  function removeChip(chip) {
    chip.remove();
    fireChange();
  }

  function showDropdown(filter = "") {
    const selected = new Set(getSelected());
    const lowerFilter = filter.toLowerCase();
    const available = Object.entries(choices)
      .filter(([k]) => !selected.has(k))
      .filter(([, label]) => !lowerFilter || label.toLowerCase().includes(lowerFilter));

    if (!available.length) {
      hideDropdown();
      return;
    }

    dropdown.innerHTML = available.map(([k, label]) =>
      `<li class="tag-autocomplete-item" data-value="${k}">${label}</li>`
    ).join("");
    dropdown.style.display = "block";

    dropdown.querySelectorAll(".tag-autocomplete-item").forEach(li => {
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        addChip(li.dataset.value);
        input.focus();
      });
    });
  }

  function hideDropdown() {
    dropdown.style.display = "none";
    dropdown.innerHTML = "";
  }

  // Text input events
  input.addEventListener("focus", () => showDropdown(input.value));
  input.addEventListener("input", () => showDropdown(input.value));
  input.addEventListener("blur", () => {
    // Small delay to allow mousedown on dropdown items to fire
    setTimeout(hideDropdown, 150);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // If dropdown has a match, use it; otherwise add free-text
      const first = dropdown.querySelector(".tag-autocomplete-item");
      if (first) {
        addChip(first.dataset.value);
      } else if (input.value.trim()) {
        addChip(input.value.trim());
      }
      input.focus();
    }
    if (e.key === "Backspace" && !input.value) {
      const chips = wrapper.querySelectorAll(".tag-chip");
      if (chips.length) removeChip(chips[chips.length - 1]);
    }
    if (e.key === "Escape") {
      hideDropdown();
      input.blur();
    }
  });

  // Click on wrapper focuses the input
  chipsContainer.addEventListener("click", (e) => {
    if (e.target === chipsContainer || e.target === wrapper) input.focus();
  });

  // Bind remove on pre-existing chips
  wrapper.querySelectorAll(".tag-chip-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      btn.closest(".tag-chip").remove();
      fireChange();
    });
  });
}

/**
 * Read current selected values from a tag input widget.
 * @param {HTMLElement} container - Parent element
 * @param {string} name - data-tag-name
 * @returns {string[]} Array of selected keys
 */
export function readTagInput(container, name) {
  const wrapper = container.querySelector(`.tag-input-wrapper[data-tag-name="${name}"]`);
  if (!wrapper) return [];
  return [...wrapper.querySelectorAll(".tag-chip")].map(el => el.dataset.value);
}

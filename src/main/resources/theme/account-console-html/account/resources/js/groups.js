import { LitElement, html, css } from "lit";
import { getGroups } from "./api.js";
import { consumeMessages } from "./i18n.js";
import {
  emitEvent,
  pageChromeStyles,
  renderLoadError,
  renderLoading,
  renderMessage,
} from "./page.js";

/**
 * Add ancestor path groups that are not already in the list (mirrors account-ui).
 * @param {{ name: string, path: string, id?: string }} group
 * @param {{ name: string, path: string, id?: string }[]} groups
 * @param {string[]} groupPaths
 */
function addParents(group, groups, groupPaths) {
  const path = group.path ?? "";
  const parentPath = path.slice(0, path.lastIndexOf("/"));
  if (!parentPath || groupPaths.includes(parentPath)) {
    return;
  }
  const parent = {
    name: parentPath.slice(parentPath.lastIndexOf("/") + 1),
    path: parentPath,
  };
  groups.push(parent);
  groupPaths.push(parentPath);
  addParents(parent, groups, groupPaths);
}

/**
 * Groups page (mirrors account-ui Groups).
 *
 * Loads `/groups`. By default ancestor path groups are included; toggle
 * “direct membership” to show only groups returned by the API.
 *
 * Overridable slots: `title`, `description`, `toolbar`.
 * Events (bubbles, composed): `load`, `error`.
 *
 * Style via `--account-groups-*` or
 * ::part(title|description|toolbar|list|item|message|empty).
 */
export class Groups extends LitElement {
  static properties = {
    /** @type {any[] | undefined} */
    groups: { state: true },
    /** @type {any[] | undefined} */
    directGroups: { state: true },
    directMembership: { type: Boolean, state: true },
    status: { state: true },
    message: { state: true },
  };

  static styles = [
    pageChromeStyles,
    css`
    :host {
      --account-gap: 1.25rem;
      --account-message-margin: var(--account-gap);
      --account-groups-max-width: var(--account-max-width, 42rem);
      --account-groups-muted-color: var(--account-muted-color, currentColor);
      --account-groups-border: var(--account-border-color, currentColor);
      --account-groups-radius: var(--account-radius, 0.5rem);

      display: block;
      width: 100%;
      max-width: var(--account-groups-max-width);
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
      margin: 0 0 var(--account-gap);
    }

    .filter {
      display: inline-flex;
      gap: 0.5rem;
      align-items: center;
      font-size: 0.95rem;
    }

    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid var(--account-groups-border);
      border-radius: var(--account-groups-radius);
      overflow: hidden;
    }

    .header,
    .item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto;
      gap: 0.75rem 1rem;
      align-items: center;
      padding: 0.75rem 1rem;
    }

    .header {
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: var(--account-groups-muted-color);
      background: color-mix(in srgb, currentColor 4%, transparent);
      border-bottom: 1px solid var(--account-groups-border);
    }

    .item {
      border-top: 1px solid var(--account-groups-border);
    }

    .item:first-of-type {
      border-top: none;
    }

    .name {
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .path {
      color: var(--account-groups-muted-color);
      font-family: ui-monospace, monospace;
      font-size: 0.9rem;
      overflow-wrap: anywhere;
    }

    .direct {
      justify-self: end;
      font-size: 0.85rem;
      color: var(--account-groups-muted-color);
    }

    .direct[data-yes="true"] {
      color: inherit;
      font-weight: 600;
    }

    .empty {
      margin: 0;
      padding: 0.85rem 1rem;
      color: var(--account-groups-muted-color);
    }

    @media (max-width: 36rem) {
      .header {
        display: none;
      }

      .item {
        grid-template-columns: 1fr;
        gap: 0.35rem;
      }

      .direct {
        justify-self: start;
      }
    }
  `,
  ];

  #i18n = consumeMessages(this);

  constructor() {
    super();
    this.directMembership = false;
    this.status = "loading";
    this.message = "";
  }

  /** @returns {(key: string, params?: Record<string, string | number>) => string} */
  get #t() {
    return this.#i18n.value?.t ?? ((key) => key);
  }

  connectedCallback() {
    super.connectedCallback();
    this.#load();
  }

  async #load() {
    this.status = "loading";
    try {
      const groups = await getGroups();
      this.directGroups = groups;
      this.#applyFilter();
      this.status = "ready";
      emitEvent(this, "load", this.groups);
    } catch (error) {
      this.status = "error";
      this.message = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", { phase: "load", error, message: this.message });
    }
  }

  #applyFilter() {
    const direct = structuredClone(this.directGroups ?? []);
    if (this.directMembership) {
      this.groups = direct;
      return;
    }
    const paths = direct.map((group) => group.path);
    for (const group of [...direct]) {
      addParents(group, direct, paths);
    }
    this.groups = direct;
  }

  /**
   * @param {Event} event
   */
  #onDirectToggle(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    this.directMembership = target.checked;
    this.#applyFilter();
  }

  /**
   * @param {any} group
   */
  #renderGroup(group) {
    const isDirect = Boolean(group.id);
    return html`
      <li class="item" part="item" data-path=${group.path ?? ""}>
        <span class="name">${group.name ?? ""}</span>
        <span class="path">${group.path ?? ""}</span>
        <span class="direct" data-yes=${isDirect ? "true" : "false"}>
          ${isDirect ? this.#t("directMembership") : ""}
        </span>
      </li>
    `;
  }

  render() {
    if (this.status === "loading" && !this.groups) {
      return renderLoading("Loading groups…");
    }

    if (this.status === "error" && !this.groups) {
      return renderLoadError(this.message);
    }

    const groups = this.groups ?? [];

    return html`
      <slot name="title">
        <h1 part="title">${this.#t("groups")}</h1>
      </slot>
      <slot name="description">
        <p part="description" class="description">
          ${this.#t("groupDescriptionLabel")}
        </p>
      </slot>
      <slot name="toolbar">
        <div class="toolbar" part="toolbar">
          <label class="filter">
            <input
              type="checkbox"
              .checked=${this.directMembership}
              @change=${this.#onDirectToggle}
            />
            ${this.#t("directMembership")}
          </label>
        </div>
      </slot>
      ${groups.length
        ? html`
            <ul class="list" part="list">
              <li class="header" aria-hidden="true">
                <span>${this.#t("name")}</span>
                <span>${this.#t("path")}</span>
                <span>${this.#t("directMembership")}</span>
              </li>
              ${groups.map((group) => this.#renderGroup(group))}
            </ul>
          `
        : html`<p class="empty" part="empty">${this.#t("groups")}</p>`}
      ${renderMessage(this, this.message, "error")}
    `;
  }
}

customElements.define("account-groups", Groups);

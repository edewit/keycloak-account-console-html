import { LitElement, html, css } from "lit";
import { getOrganizations } from "./api.js";
import { consumeMessages } from "./i18n.js";
import {
  emitEvent,
  pageChromeStyles,
  renderLoadError,
  renderLoading,
  renderMessage,
} from "./page.js";

/**
 * Organizations page (mirrors account-ui Organizations).
 *
 * Loads `/organizations` and lists memberships.
 *
 * Overridable slots: `title`, `description`.
 * Events (bubbles, composed): `load`, `error`.
 *
 * Style via `--account-orgs-*` or
 * ::part(title|description|list|item|message|empty).
 */
export class Organizations extends LitElement {
  static properties = {
    /** @type {any[] | undefined} */
    organizations: { state: true },
    status: { state: true },
    message: { state: true },
  };

  static styles = [
    pageChromeStyles,
    css`
      :host {
        --account-gap: 1.25rem;
        --account-message-margin: var(--account-gap);
        --account-orgs-max-width: var(--account-max-width, 42rem);
        --account-orgs-muted-color: var(--account-muted-color, currentColor);
        --account-orgs-border: var(--account-border-color, currentColor);
        --account-orgs-radius: var(--account-radius, 0.5rem);

        display: block;
        width: 100%;
        max-width: var(--account-orgs-max-width);
      }

      .list {
        list-style: none;
        margin: 0;
        padding: 0;
        border: 1px solid var(--account-orgs-border);
        border-radius: var(--account-orgs-radius);
        overflow: hidden;
      }

      .header,
      .item {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.4fr);
        gap: 0.75rem 1rem;
        align-items: start;
        padding: 0.75rem 1rem;
      }

      .header {
        font-size: 0.8rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: var(--account-orgs-muted-color);
        background: color-mix(in srgb, currentColor 4%, transparent);
        border-bottom: 1px solid var(--account-orgs-border);
      }

      .item {
        border-top: 1px solid var(--account-orgs-border);
      }

      .item:first-of-type {
        border-top: none;
      }

      .name {
        font-weight: 600;
        overflow-wrap: anywhere;
      }

      .alias,
      .description-cell {
        color: var(--account-orgs-muted-color);
        font-size: 0.95rem;
        overflow-wrap: anywhere;
      }

      .domains {
        margin: 0.35rem 0 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }

      .domains li {
        padding: 0.1rem 0.45rem;
        border: 1px solid var(--account-orgs-border);
        border-radius: 999px;
        font-size: 0.75rem;
      }

      .empty {
        margin: 0;
        padding: 0.85rem 1rem;
        color: var(--account-orgs-muted-color);
      }

      @media (max-width: 36rem) {
        .header {
          display: none;
        }

        .item {
          grid-template-columns: 1fr;
          gap: 0.35rem;
        }
      }
    `,
  ];

  #i18n = consumeMessages(this);

  constructor() {
    super();
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
      this.organizations = await getOrganizations();
      this.status = "ready";
      emitEvent(this, "load", this.organizations);
    } catch (error) {
      this.status = "error";
      this.message = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", { phase: "load", error, message: this.message });
    }
  }

  /**
   * @param {any} org
   */
  #renderOrg(org) {
    const domains = Array.isArray(org.domains) ? org.domains : [];
    return html`
      <li class="item" part="item" data-id=${org.id ?? ""}>
        <div>
          <div class="name">${org.name ?? org.alias ?? ""}</div>
          ${domains.length
            ? html`
                <ul class="domains">
                  ${domains.map(
                    (domain) =>
                      html`<li>${domain.name ?? domain}</li>`,
                  )}
                </ul>
              `
            : ""}
        </div>
        <div class="alias">${org.alias ?? ""}</div>
        <div class="description-cell">${org.description ?? ""}</div>
      </li>
    `;
  }

  render() {
    if (this.status === "loading" && !this.organizations) {
      return renderLoading("Loading organizations…");
    }

    if (this.status === "error" && !this.organizations) {
      return renderLoadError(this.message);
    }

    const orgs = this.organizations ?? [];

    return html`
      <slot name="title">
        <h1 part="title">${this.#t("organizations")}</h1>
      </slot>
      <slot name="description">
        <p part="description" class="description">
          ${this.#t("organizationDescription")}
        </p>
      </slot>
      ${orgs.length
        ? html`
            <ul class="list" part="list">
              <li class="header" aria-hidden="true">
                <span>${this.#t("name")}</span>
                <span>${this.#t("alias")}</span>
                <span>${this.#t("description")}</span>
              </li>
              ${orgs.map((org) => this.#renderOrg(org))}
            </ul>
          `
        : html`<p class="empty" part="empty">
            ${this.#t("emptyUserOrganizations")}
          </p>`}
      ${renderMessage(this, this.message, "error")}
    `;
  }
}

customElements.define("account-organizations", Organizations);

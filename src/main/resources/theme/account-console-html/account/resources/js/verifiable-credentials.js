import { LitElement, html, css, nothing } from "lit";
import {
  deleteVerifiableCredential,
  getKeycloak,
  getVerifiableCredentials,
} from "./api.js";
import { consumeMessages } from "./i18n.js";
import {
  emitEvent,
  pageChromeStyles,
  renderLoadError,
  renderLoading,
  renderMessage,
} from "./page.js";

/**
 * @param {number | string | undefined | null} value
 * @param {string | undefined} locale
 */
function formatDate(value, locale) {
  if (value == null || value === "") {
    return "—";
  }
  const date =
    typeof value === "number"
      ? new Date(value)
      : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  try {
    return date.toLocaleDateString(locale);
  } catch {
    return date.toLocaleDateString();
  }
}

/**
 * Verifiable credentials page (mirrors account-ui VerifiableCredentials).
 *
 * Loads `/verifiable-credentials`. **Issue to wallet** runs AIA
 * `verifiable_credential_offer:<base64>`; **Revoke** calls
 * `DELETE /verifiable-credentials/{credentialScopeName}`.
 *
 * Overridable slots: `title`, `description`.
 * Events (bubbles, composed): `load`, cancelable `issue` / `revoke`,
 * `revoked`, `error`.
 *
 * Style via `--account-vc-*` or
 * ::part(title|description|list|item|actions|message|empty).
 */
export class VerifiableCredentials extends LitElement {
  static properties = {
    /** @type {any[] | undefined} */
    credentials: { state: true },
    canManage: { state: true },
    status: { state: true },
    message: { state: true },
    /** @type {"" | "error" | "success"} */
    messageTone: { state: true },
  };

  static styles = [
    pageChromeStyles,
    css`
      :host {
        --account-gap: 1.25rem;
        --account-message-margin: var(--account-gap);
        --account-vc-max-width: var(--account-max-width, 42rem);
        --account-vc-muted-color: var(--account-muted-color, currentColor);
        --account-vc-border: var(--account-border-color, currentColor);
        --account-vc-radius: var(--account-radius, 0.5rem);
        --account-vc-error-color: var(--account-error-color, #b42318);
        --account-vc-button-padding: var(
          --account-button-padding,
          0.5rem 1rem
        );

        display: block;
        width: 100%;
        max-width: var(--account-vc-max-width);
      }

      .list {
        list-style: none;
        margin: 0;
        padding: 0;
        border: 1px solid var(--account-vc-border);
        border-radius: var(--account-vc-radius);
        overflow: hidden;
      }

      .header,
      .item {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.9fr) minmax(0, 0.9fr) auto;
        gap: 0.75rem 1rem;
        align-items: center;
        padding: 0.75rem 1rem;
      }

      .header {
        font-size: 0.8rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: var(--account-vc-muted-color);
        background: color-mix(in srgb, currentColor 4%, transparent);
        border-bottom: 1px solid var(--account-vc-border);
      }

      .item {
        border-top: 1px solid var(--account-vc-border);
      }

      .item:first-of-type {
        border-top: none;
      }

      .name {
        font-weight: 600;
        overflow-wrap: anywhere;
      }

      .date {
        color: var(--account-vc-muted-color);
        font-size: 0.95rem;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        justify-content: flex-end;
      }

      button {
        font: inherit;
        cursor: pointer;
        border: 1px solid var(--account-vc-border);
        border-radius: var(--account-vc-radius);
        padding: var(--account-vc-button-padding);
        background: transparent;
        color: inherit;
      }

      button.danger {
        border-color: var(--account-vc-error-color);
        color: var(--account-vc-error-color);
      }

      .empty {
        margin: 0;
        padding: 0.85rem 1rem;
        color: var(--account-vc-muted-color);
      }

      @media (max-width: 40rem) {
        .header {
          display: none;
        }

        .item {
          grid-template-columns: 1fr;
          gap: 0.35rem;
          align-items: start;
        }

        .actions {
          justify-content: flex-start;
        }
      }
    `,
  ];

  #i18n = consumeMessages(this);

  constructor() {
    super();
    this.status = "loading";
    this.message = "";
    this.messageTone = "";
    this.canManage = false;
  }

  /** @returns {(key: string, params?: Record<string, string | number>) => string} */
  get #t() {
    return this.#i18n.value?.t ?? ((key) => key);
  }

  get #locale() {
    return this.#i18n.value?.locale;
  }

  connectedCallback() {
    super.connectedCallback();
    this.#load();
  }

  async #load() {
    this.status = "loading";
    try {
      const keycloak = await getKeycloak();
      const roles =
        keycloak.tokenParsed?.resource_access?.account?.roles ?? [];
      this.canManage =
        roles.includes("manage-account") ||
        roles.includes("manage-verifiable-credentials");

      this.credentials = await getVerifiableCredentials();
      this.status = "ready";
      emitEvent(this, "load", this.credentials);
    } catch (error) {
      this.status = "error";
      this.messageTone = "error";
      this.message = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", { phase: "load", error, message: this.message });
    }
  }

  /**
   * @param {any} credential
   */
  async #issue(credential) {
    if (
      !emitEvent(this, "issue", { credential }, { cancelable: true })
    ) {
      return;
    }
    try {
      const keycloak = await getKeycloak();
      const config = {
        credentialConfigurationId: credential.credentialConfigurationId,
        preAuthorized: false,
      };
      const encoded = btoa(JSON.stringify(config));
      await keycloak.login({
        action: `verifiable_credential_offer:${encoded}`,
      });
    } catch (error) {
      this.messageTone = "error";
      this.message = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", {
        phase: "issue",
        error,
        message: this.message,
      });
    }
  }

  /**
   * @param {any} credential
   */
  async #revoke(credential) {
    const name = credential.credentialScopeName ?? "";
    if (
      !confirm(
        this.#t("deleteCredentialConfirm", { credentialName: name }),
      )
    ) {
      return;
    }
    if (
      !emitEvent(this, "revoke", { credential }, { cancelable: true })
    ) {
      return;
    }
    try {
      this.status = "saving";
      await deleteVerifiableCredential(name);
      this.messageTone = "success";
      this.message = this.#t("credentialDeletedSuccess");
      emitEvent(this, "revoked", { credential });
      await this.#load();
    } catch (error) {
      this.status = "ready";
      this.messageTone = "error";
      this.message = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", {
        phase: "revoke",
        error,
        message: this.message,
      });
    }
  }

  /**
   * @param {any} credential
   */
  #renderCredential(credential) {
    const name = credential.credentialScopeName ?? "";
    return html`
      <li class="item" part="item" data-scope=${name}>
        <div class="name">${name}</div>
        <div class="date">
          ${formatDate(credential.createdDate, this.#locale)}
        </div>
        <div class="date">
          ${formatDate(credential.updatedDate, this.#locale)}
        </div>
        <div class="actions" part="actions">
          <button type="button" @click=${() => this.#issue(credential)}>
            ${this.#t("issueToWallet")}
          </button>
          ${this.canManage
            ? html`
                <button
                  type="button"
                  class="danger"
                  @click=${() => this.#revoke(credential)}
                >
                  ${this.#t("doRevoke")}
                </button>
              `
            : nothing}
        </div>
      </li>
    `;
  }

  render() {
    if (this.status === "loading" && !this.credentials) {
      return renderLoading("Loading verifiable credentials…");
    }

    if (this.status === "error" && !this.credentials) {
      return renderLoadError(this.message);
    }

    const credentials = this.credentials ?? [];

    return html`
      <slot name="title">
        <h1 part="title">${this.#t("verifiableCredentialsTitle")}</h1>
      </slot>
      <slot name="description">
        <p part="description" class="description">
          ${this.#t("verifiableCredentialsDescription")}
        </p>
      </slot>
      ${credentials.length
        ? html`
            <ul class="list" part="list">
              <li class="header" aria-hidden="true">
                <span>${this.#t("credentialScopeName")}</span>
                <span>${this.#t("credentialCreatedDate")}</span>
                <span>${this.#t("credentialUpdatedDate")}</span>
                <span></span>
              </li>
              ${credentials.map((c) => this.#renderCredential(c))}
            </ul>
          `
        : html`<p class="empty" part="empty">
            ${this.#t("noVerifiableCredentials")}
          </p>`}
      ${renderMessage(this, this.message, this.messageTone || undefined)}
    `;
  }
}

customElements.define("account-verifiable-credentials", VerifiableCredentials);

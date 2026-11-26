import { LitElement, html, css, nothing } from "lit";
import { getEnvironment, getKeycloak } from "../account-client.js";
import { consumeMessages } from "../i18n.js";
import { emitEvent, label } from "../page.js";

/**
 * @param {Record<string, unknown> | undefined} token
 * @returns {{ displayName: string, initials: string }}
 */
function userFromToken(token) {
  if (!token) {
    return { displayName: "", initials: "?" };
  }
  const first =
    (typeof token.given_name === "string" && token.given_name) ||
    (typeof token.firstName === "string" && token.firstName) ||
    "";
  const last =
    (typeof token.family_name === "string" && token.family_name) ||
    (typeof token.lastName === "string" && token.lastName) ||
    "";
  const username =
    (typeof token.preferred_username === "string" &&
      token.preferred_username) ||
    (typeof token.username === "string" && token.username) ||
    "";
  const name =
    (typeof token.name === "string" && token.name) ||
    [first, last].filter(Boolean).join(" ") ||
    username ||
    (typeof token.email === "string" && token.email) ||
    "";
  const initialsSource = [first, last].filter(Boolean).join(" ") || name;
  const parts = initialsSource.trim().split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : (parts[0] || "?").slice(0, 2).toUpperCase();
  return { displayName: name, initials };
}

/**
 * Read referrer from the current URL (`referrer`, `referrer_uri`), matching
 * stock account-ui query params.
 *
 * @returns {{ name: string, url: string }}
 */
export function referrerFromLocation() {
  try {
    const params = new URLSearchParams(window.location.search);
    const name = params.get("referrer")?.trim() || "";
    const url = (params.get("referrer_uri") || "")
      .trim()
      .replace(/_hash_/g, "#");
    return { name, url };
  } catch {
    return { name: "", url: "" };
  }
}

/**
 * Top account toolbar: back-to-app link, avatar, sign out.
 *
 * Defaults can be replaced via slots (projected from `account-shell` or used
 * directly):
 *
 *   <account-toolbar>
 *     <a slot="back" href="https://app.example">Back to App</a>
 *     <span slot="avatar" title="Ada">AD</span>
 *     <button slot="sign-out" type="button">Log out</button>
 *   </account-toolbar>
 *
 * Or omit a section with an empty slot from the shell. Properties override
 * referrer defaults when set: `referrer-url`, `referrer-name`, `home-href`.
 *
 * Events: cancelable `sign-out`, then `signed-out` / `error`.
 *
 * Style via `--account-toolbar-*` or
 * ::part(toolbar|start|back|end|avatar|sign-out).
 */
export class AccountToolbar extends LitElement {
  static properties = {
    /** Override back-link URL (else `referrer_uri` query / empty). */
    referrerUrl: { type: String, attribute: "referrer-url" },
    /** Override back-link label key/name (else `referrer` query). */
    referrerName: { type: String, attribute: "referrer-name" },
    /**
     * Fallback “back to console” URL when no referrer props/query
     * (default: realm Admin Console).
     */
    homeHref: { type: String, attribute: "home-href" },
    /** @type {string} */
    displayName: { state: true },
    /** @type {string} */
    initials: { state: true },
    /** @type {string} */
    resolvedReferrerUrl: { state: true },
    /** @type {string} */
    resolvedReferrerName: { state: true },
    status: { state: true },
  };

  static styles = css`
    :host {
      --account-toolbar-gap: 1rem;
      --account-toolbar-padding: 0 0 1rem;
      --account-toolbar-border: var(
        --account-border-color,
        color-mix(in srgb, currentColor 25%, transparent)
      );
      --account-toolbar-muted: var(
        --account-muted-color,
        color-mix(in srgb, currentColor 55%, transparent)
      );
      --account-toolbar-radius: var(--account-radius, 0.5rem);
      --account-toolbar-avatar-size: 2.25rem;
      --account-toolbar-avatar-bg: color-mix(
        in srgb,
        currentColor 12%,
        transparent
      );
      --account-toolbar-button-padding: var(
        --account-button-padding,
        0.5rem 1rem
      );

      display: block;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--account-toolbar-gap);
      padding: var(--account-toolbar-padding);
      border-bottom: 1px solid var(--account-toolbar-border);
      margin-bottom: var(--account-shell-gap, 2rem);
    }

    .start,
    .end {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      min-width: 0;
    }

    .end {
      margin-inline-start: auto;
    }

    a.back,
    button.sign-out {
      font: inherit;
      color: inherit;
      text-decoration: none;
      border: 1px solid var(--account-toolbar-border);
      border-radius: var(--account-toolbar-radius);
      padding: var(--account-toolbar-button-padding);
      background: transparent;
      cursor: pointer;
    }

    a.back:hover,
    button.sign-out:hover {
      background: color-mix(in srgb, currentColor 6%, transparent);
    }

    .avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--account-toolbar-avatar-size);
      height: var(--account-toolbar-avatar-size);
      border-radius: 999px;
      background: var(--account-toolbar-avatar-bg);
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      line-height: 1;
      user-select: none;
    }

    .avatar[hidden] {
      display: none;
    }
  `;

  #i18n = consumeMessages(this);

  constructor() {
    super();
    this.referrerUrl = "";
    this.referrerName = "";
    this.homeHref = "";
    this.displayName = "";
    this.initials = "?";
    this.resolvedReferrerUrl = "";
    this.resolvedReferrerName = "";
    this.status = "loading";
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
    const fromQuery = referrerFromLocation();

    try {
      const [env, keycloak] = await Promise.all([
        getEnvironment(),
        getKeycloak(),
      ]);
      // Prefer explicit props, then ?referrer_uri=, else home-href / Admin Console.
      this.resolvedReferrerUrl =
        this.referrerUrl ||
        fromQuery.url ||
        this.homeHref ||
        `${env.serverBaseUrl}/admin/${encodeURIComponent(env.realm)}/console/`;
      this.resolvedReferrerName =
        this.referrerName || fromQuery.name || "console";
      const user = userFromToken(
        /** @type {Record<string, unknown> | undefined} */ (
          keycloak.tokenParsed
        ),
      );
      this.displayName = user.displayName;
      this.initials = user.initials;
      this.status = "ready";
    } catch (error) {
      this.resolvedReferrerUrl = this.referrerUrl || fromQuery.url;
      this.resolvedReferrerName = this.referrerName || fromQuery.name;
      this.status = "ready";
      console.warn("account-toolbar: failed to load user", error);
    }
  }

  async #signOut() {
    if (!emitEvent(this, "sign-out", {}, { cancelable: true })) {
      return;
    }
    try {
      const keycloak = await getKeycloak();
      emitEvent(this, "signed-out", {});
      await keycloak.logout();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", { phase: "sign-out", error, message });
    }
  }

  #backLabel() {
    const app =
      label(this.#t, this.resolvedReferrerName) ||
      this.resolvedReferrerName ||
      this.resolvedReferrerUrl;
    return this.#t("backTo", { 0: app, app });
  }

  #renderBack() {
    if (!this.resolvedReferrerUrl) {
      return nothing;
    }
    return html`
      <a
        class="back"
        part="back"
        data-testid="referrer-link"
        href=${this.resolvedReferrerUrl}
      >
        ${this.#backLabel()}
      </a>
    `;
  }

  render() {
    return html`
      <div class="toolbar" part="toolbar">
        <div class="start" part="start">
          <slot name="start"></slot>
          <slot name="back">${this.#renderBack()}</slot>
        </div>
        <div class="end" part="end">
          <slot name="end"></slot>
          <slot name="sign-out">
            <button
              type="button"
              class="sign-out"
              part="sign-out"
              @click=${() => this.#signOut()}
            >
              ${this.#t("doSignOut")}
            </button>
          </slot>
          <slot name="avatar">
            <span
              class="avatar"
              part="avatar"
              title=${this.displayName || nothing}
              aria-label=${this.displayName || this.#t("account")}
            >
              ${this.initials}
            </span>
          </slot>
        </div>
      </div>
    `;
  }
}

customElements.define("account-toolbar", AccountToolbar);

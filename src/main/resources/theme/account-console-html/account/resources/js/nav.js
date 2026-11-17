import { LitElement, html, css, nothing } from "lit";
import { getEnvironment, getKeycloak } from "./account-client.js";
import { consumeMessages } from "./i18n.js";

/**
 * @typedef {{
 *   label?: string,
 *   labelKey?: string,
 *   href?: string,
 *   isVisible?: string,
 *   children?: NavLink[],
 * }} NavLink
 */

/**
 * Default account console menu (mirrors Keycloak content.json / message keys).
 * `isVisible` keys match `environment.features` from the stock account console.
 */
export const DEFAULT_LINKS = Object.freeze([
  { labelKey: "personalInfo", href: "./" },
  {
    labelKey: "accountSecurity",
    children: [
      { labelKey: "signingIn", href: "signing-in.html" },
      { labelKey: "deviceActivity", href: "device-activity.html" },
      {
        labelKey: "linkedAccounts",
        href: "linked-accounts.html",
        isVisible: "isLinkedAccountsEnabled",
      },
    ],
  },
  {
    labelKey: "applications",
    href: "applications.html",
    isVisible: "isViewApplicationsEnabled",
  },
  {
    labelKey: "groups",
    href: "groups.html",
    isVisible: "isViewGroupsEnabled",
  },
  {
    labelKey: "organizations",
    href: "organizations.html",
    isVisible: "isViewOrganizationsEnabled",
  },
  {
    labelKey: "resources",
    href: "resources.html",
    isVisible: "isMyResourcesEnabled",
  },
  {
    labelKey: "verifiableCredentialsTitle",
    href: "verifiable-credentials.html",
    isVisible: "isOid4VciEnabled",
  },
]);

/**
 * Account console sidebar.
 *
 * Links — use defaults, replace via the `links` property/attribute, call
 * `addLink()`, or project extra items into the `link` slot:
 *
 *   <account-sidebar></account-sidebar>
 *   <account-sidebar .links=${[...DEFAULT_LINKS, { label: "Help", href: "help.html" }]}></account-sidebar>
 *   <account-sidebar links='[{"label":"Help","href":"help.html"}]'></account-sidebar>
 *   <account-sidebar>
 *     <a slot="link" href="help.html">Help</a>
 *   </account-sidebar>
 *
 * Visibility — items with `isVisible` are shown only when that key is true in
 * `environment.json` → `features` (same flags as Keycloak content.json).
 *
 * Style — override CSS custom properties on the host, or target parts:
 *
 *   account-sidebar {
 *     --account-nav-link-color: #444;
 *     --account-nav-link-active-color: #000;
 *   }
 *   account-sidebar::part(link-active) { font-weight: 700; }
 */
export class NavBar extends LitElement {
  static properties = {
    /** @type {NavLink[] | undefined} */
    links: { type: Array },
    /** @type {Record<string, boolean>} */
    features: { state: true },
    featuresReady: { state: true },
  };

  #i18n = consumeMessages(this);

  constructor() {
    super();
    this.features = {};
    this.featuresReady = false;
  }

  /** @returns {(key: string, params?: Record<string, string | number>) => string} */
  get #t() {
    return this.#i18n.value?.t ?? ((key) => key);
  }

  /**
   * @param {NavLink} item
   */
  #labelOf(item) {
    if (item.labelKey) {
      return this.#t(item.labelKey);
    }
    return item.label ?? "";
  }

  static styles = css`
    :host {
      --account-nav-bg: transparent;
      --account-nav-fg: inherit;
      --account-nav-link-color: color-mix(
        in srgb,
        currentColor 70%,
        transparent
      );
      --account-nav-link-hover-color: currentColor;
      --account-nav-link-active-color: currentColor;
      --account-nav-link-active-weight: 600;
      --account-nav-gap: 0.25rem;
      --account-nav-indent: 1rem;
      --account-nav-padding: 0;
      --account-nav-font-size: inherit;
      --account-nav-group-label-color: color-mix(
        in srgb,
        currentColor 55%,
        transparent
      );
      --account-nav-group-label-weight: 600;
      --account-nav-group-label-size: 0.75em;
      --account-nav-group-label-transform: uppercase;
      --account-nav-group-label-tracking: 0.04em;

      display: block;
      color: var(--account-nav-fg);
      font-size: var(--account-nav-font-size);
    }

    nav {
      background: var(--account-nav-bg);
      padding: var(--account-nav-padding);
    }

    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--account-nav-gap);
    }

    ul ul {
      padding-inline-start: var(--account-nav-indent);
      margin-block: var(--account-nav-gap);
    }

    .group-label {
      display: block;
      margin: 0.75rem 0 0.25rem;
      color: var(--account-nav-group-label-color);
      font-size: var(--account-nav-group-label-size);
      font-weight: var(--account-nav-group-label-weight);
      letter-spacing: var(--account-nav-group-label-tracking);
      text-transform: var(--account-nav-group-label-transform);
    }

    a {
      color: var(--account-nav-link-color);
      text-decoration: none;
    }

    a:hover {
      color: var(--account-nav-link-hover-color);
    }

    a[aria-current="page"] {
      color: var(--account-nav-link-active-color);
      font-weight: var(--account-nav-link-active-weight);
    }

    [part="extra"] {
      display: flex;
      flex-direction: column;
      gap: var(--account-nav-gap);
      margin-block-start: var(--account-nav-gap);
    }

    ::slotted(a) {
      color: var(--account-nav-link-color);
      text-decoration: none;
    }

    ::slotted(a:hover) {
      color: var(--account-nav-link-hover-color);
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.#loadFeatures();
  }

  async #loadFeatures() {
    try {
      // Wait for SSO so environment.features reflects the signed-in user.
      await getKeycloak();
      const env = await getEnvironment();
      this.features = env.features ?? {};
    } catch (error) {
      console.warn("Failed to load account features for navigation", error);
      this.features = {};
    } finally {
      this.featuresReady = true;
    }
  }

  /**
   * Replace or seed the link list, then append one entry.
   * @param {NavLink} link
   */
  addLink(link) {
    this.links = [...(this.links ?? structuredClone(DEFAULT_LINKS)), link];
  }

  /** @returns {NavLink[]} */
  get resolvedLinks() {
    return this.links ?? DEFAULT_LINKS;
  }

  /**
   * @param {NavLink} item
   */
  #isVisible(item) {
    if (!item.isVisible) {
      return true;
    }
    return Boolean(this.features?.[item.isVisible]);
  }

  /**
   * @param {NavLink[]} items
   * @returns {NavLink[]}
   */
  #visibleLinks(items) {
    /** @type {NavLink[]} */
    const visible = [];
    for (const item of items) {
      if (item.children?.length) {
        if (!this.#isVisible(item)) {
          continue;
        }
        const children = this.#visibleLinks(item.children);
        if (children.length) {
          visible.push({ ...item, children });
        }
        continue;
      }
      if (this.#isVisible(item)) {
        visible.push(item);
      }
    }
    return visible;
  }

  /**
   * @param {string | undefined} href
   * @returns {boolean}
   */
  #isActive(href) {
    if (!href) {
      return false;
    }
    const path = location.pathname.replace(/\/+$/, "");
    if (href === "./" || href === "." || href === "") {
      return path.endsWith("account");
    }
    return path.endsWith("/" + href.replace(/^\.\//, ""));
  }

  /**
   * @param {NavLink[]} items
   */
  #renderItems(items) {
    return html`
      <ul part="list">
        ${items.map((item) => this.#renderItem(item))}
      </ul>
      <div part="extra">
        <slot name="link"></slot>
      </div>
    `;
  }

  /**
   * @param {NavLink} item
   */
  #renderItem(item) {
    const label = this.#labelOf(item);

    if (item.children?.length) {
      return html`
        <li part="group">
          <span class="group-label" part="group-label">${label}</span>
          <ul part="list">
            ${item.children.map((child) => this.#renderItem(child))}
          </ul>
        </li>
      `;
    }

    if (!item.href) {
      return nothing;
    }

    const active = this.#isActive(item.href);
    return html`
      <li part="item">
        <a
          part=${active ? "link link-active" : "link"}
          href=${item.href}
          aria-current=${active ? "page" : nothing}
          >${label}</a
        >
      </li>
    `;
  }

  render() {
    if (!this.featuresReady) {
      return html`<nav part="nav"></nav>`;
    }
    const links = this.#visibleLinks(this.resolvedLinks);
    return html`<nav part="nav">${this.#renderItems(links)}</nav>`;
  }
}

customElements.define("account-sidebar", NavBar);

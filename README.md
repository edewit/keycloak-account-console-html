# Keycloak Account Console HTML

Account console theme where **every page is a simple HTML file**. Pages are served by a custom `AccountResourceProvider`; browser JavaScript calls the Account REST API (no React, no Qute).

Requires **Keycloak 26.8+**.

## What’s included

- Theme `account-console-html` (`account` type)
- Provider id `html-account` — serves `pages/*.html` as-is; redirects bare `/account` → `/account/` so relative URLs resolve
- `GET …/account/environment.json` — bootstrap for keycloak-js / REST (includes `features` flags)
- Sidebar hides pages gated by feature flags / roles (same keys as Keycloak `content.json`)
- Theme messages via `GET /resources/{realm}/account/{locale}` (parent `keycloak.v3`)
- Shared design tokens (`resources/css/tokens.css`)
- Lit / `@lit/context` / `keycloak-js` vendored under `resources/js/vendor/` (no CDN) — works air-gapped; no third-party script hosts
- Lit web components under `resources/js/`
  - `account-shell` — page chrome; loads messages and provides Lit context
  - `account-sidebar` — navigation
  - `account-personal-info` — profile form (user-profile metadata driven)
  - `account-signing-in` — credential types (password, OTP, passkeys, …)
  - `account-device-activity` — signed-in devices / sessions
  - `account-applications` — applications with consent / session controls
  - `account-groups` — group memberships (optional direct-only filter)
  - `account-linked-accounts` — federated IdP link / unlink
  - `account-organizations` — organization memberships
  - `account-resources` — UMA resources (my + shared with me)
  - `account-resource-share-dialog` / `account-resource-edit-dialog` / `account-resource-requests-dialog`
  - `account-dialog` — reusable native `<dialog>` shell
  - `account-verifiable-credentials` — OID4VCI issue / revoke
  - `account-field`, `account-input`, `account-save-button` — form primitives

## Local development (live HTML)

Edit HTML under the theme directory and refresh the browser — no Maven rebuild for page changes.

```bash
npm install
npm run start-keycloak
```

Then open `http://127.0.0.1:8080/realms/master/account/` (admin `admin` / `admin`).

`start-keycloak`:

- Builds the provider JAR once if missing (`mvn package`)
- Symlinks `src/main/resources/theme/account-console-html` into Keycloak’s `themes/` so filesystem edits are live
- Disables theme caching
- Sets the master realm **Account theme** to `account-console-html`

When you change Java under `org.keycloak.account.html`, rebuild and restart:

```bash
npm run build
# stop Keycloak, then:
npm run start-keycloak
```

## Vendored JS (Lit / keycloak-js)

Runtime modules live under `resources/js/vendor/` and are declared in `resources/js/importmap.json`. Pages load classic [`boot.js`](src/main/resources/theme/account-console-html/account/resources/js/boot.js), which injects an import map then `import()`s the modules in `data-modules`.

If `vendor/` is missing, `boot.js` falls back to a jsDelivr CDN import map (fine for local experiments; not for air-gapped / strict CSP).

```bash
npm run vendor   # refresh vendor/ + importmap.json from package.json pins
npm run build    # vendor + mvn package
```

Bump versions in `package.json`, run `npm install` / `pnpm install`, then `npm run vendor`. Commit the updated `vendor/` tree and `importmap.json` so production stays offline-friendly.

**CSP:** with vendored modules there are no third-party hosts. `boot.js` still injects an inline import map, so a strict `script-src 'self'` without `'unsafe-inline'` (or a hash/nonce) will block that step — same constraint as much of Keycloak’s own UI. The CDN fallback needs network egress to `cdn.jsdelivr.net`.

## Production build & deploy

```bash
npm run build
# or, if vendor/ is already up to date:
mvn clean package
cp target/keycloak-account-console-html-*.jar $KEYCLOAK_HOME/providers/
$KEYCLOAK_HOME/bin/kc.sh build
```

In the Admin Console, set the realm **Account theme** to `account-console-html`.

## Adding a page

1. Add `src/main/resources/theme/account-console-html/account/pages/<name>.html`
2. Load tokens and `boot.js` with `data-modules` (trailing-slash redirect keeps relative URLs correct)
3. Compose with `<account-shell>`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My page</title>
    <link rel="stylesheet" href="resource/css/tokens.css" />
    <script
      src="resource/js/boot.js"
      data-modules="components/shell.js"
    ></script>
  </head>
  <body>
    <account-shell>
      <h1>My page</h1>
    </account-shell>
  </body>
</html>
```

4. With `start-keycloak` running, open `/realms/<realm>/account/<name>` (refresh only)
5. For a packaged deploy, rebuild the JAR as above

Authenticated reads/writes go through Account REST via `accountFetch` in `resources/js/account-client.js`.

## Extending components

### Slots (`account-personal-info`)

| Slot | Purpose |
|------|---------|
| `title` | Page heading |
| `description` | Intro text |
| `attribute:<name>` | Replace a profile field (e.g. `attribute:department`) |
| `<attribute-name>` | Same as above (legacy; prefer the `attribute:` prefix) |
| `field` | Append extra named fields (include a `name` to save) |
| `actions` | Replace the save button row |

Override a single profile field from HTML. Use `slot="attribute:<name>"` so the override cannot clash with reserved slots (`title`, `description`, `actions`, `field`). Control `name` may be bare (`department`) or `attributes.department`:

```html
<account-shell>
  <account-personal-info>
    <div slot="attribute:department" class="field">
      <label for="dept">Department</label>
      <select name="attributes.department" id="dept">
        <option value="engineering">Engineering</option>
        <option value="product">Product</option>
      </select>
    </div>
  </account-personal-info>
</account-shell>
```

After load, slotted native controls with a `name` are hydrated from the user. Listen to the `load` event if you need the raw user object.

### Events (`account-personal-info`)

All bubble and are composed.

| Event | When | Notes |
|-------|------|--------|
| `load` | User profile loaded | `detail` is the user |
| `save` | Before POST | Cancelable; `detail` is `{ user, payload }` |
| `saved` | After successful save | `detail` is the refreshed user |
| `error` | Load or save failure | `detail` is `{ phase, error, message }` |

### i18n (Lit context)

`account-shell` fetches theme messages and provides them on `messagesContext`. Any descendant can consume:

```js
import { consumeMessages } from "./i18n.js";

class MyPage extends LitElement {
  #i18n = consumeMessages(this);

  get #t() {
    return this.#i18n.value?.t ?? ((key) => key);
  }

  render() {
    return html`<h1>${this.#t("personalInfo")}</h1>`;
  }
}
```

`t(key, params?)` interpolates `{{name}}` / `{0}` and strips account-ui Trans tags (`<0>…</0>`).

### Signing in (`account-signing-in`)

Loads `/credentials` and groups types by category (basic / two-factor / passwordless). Set up, update, and delete call `keycloak.login({ action })` so Keycloak runs the matching required action.

| Slot | Purpose |
|------|---------|
| `title` | Page heading |
| `description` | Intro text |

| Event | When | Notes |
|-------|------|--------|
| `load` | Credentials loaded | `detail` is the credential container list |
| `action` | Before create/update/delete redirect | Cancelable; `detail` is `{ action, kind, type?, credentialId? }` |
| `error` | Load or action failure | `detail` is `{ phase, error, message }` |

```html
<account-shell>
  <account-signing-in></account-signing-in>
</account-shell>
```

### Device activity (`account-device-activity`)

Loads `/sessions/devices` (current device/session first). Refresh reloads the list; sign out calls `DELETE /sessions/{id}` (or all sessions, then keycloak-js logout).

| Slot | Purpose |
|------|---------|
| `title` | Page heading |
| `description` | Intro text |
| `actions` | Toolbar (refresh / sign out all) |

| Event | When | Notes |
|-------|------|--------|
| `load` | Devices loaded | `detail` is the device list |
| `sign-out` | Before sign-out | Cancelable; `detail` is `{ kind: "session"|"all", … }` |
| `signed-out` | After a successful sign-out | Same `detail` shape |
| `error` | Load or sign-out failure | `detail` is `{ phase, error, message }` |

```html
<account-shell>
  <account-device-activity></account-device-activity>
</account-shell>
```

### Applications (`account-applications`)

Loads `/applications` (sorted by name). Expand a row for client details / scopes; end sessions via `DELETE /applications/{id}/sessions`, remove consent via `DELETE /applications/{id}/consent`.

| Slot | Purpose |
|------|---------|
| `title` | Page heading |
| `description` | Intro text |

| Event | When | Notes |
|-------|------|--------|
| `load` | Applications loaded | `detail` is the client list |
| `end-session` / `remove-consent` | Before the action | Cancelable; `detail` is `{ application }` |
| `removed` | After success | `detail` is `{ kind: "session"|"consent", application }` |
| `error` | Load or action failure | `detail` is `{ phase, error, message }` |

```html
<account-shell>
  <account-applications></account-applications>
</account-shell>
```

### Groups (`account-groups`)

Loads `/groups`. By default ancestor path groups are included; enable **Direct membership** to show only API groups.

| Slot | Purpose |
|------|---------|
| `title` | Page heading |
| `description` | Intro text |
| `toolbar` | Direct-membership filter |

| Event | When | Notes |
|-------|------|--------|
| `load` | Groups loaded | `detail` is the (possibly expanded) group list |
| `error` | Load failure | `detail` is `{ phase, error, message }` |

```html
<account-shell>
  <account-groups></account-groups>
</account-shell>
```

### Linked accounts (`account-linked-accounts`)

Loads `/linked-accounts?linked=true|false`. **Link** runs `keycloak.login({ action: "idp_link:<alias>" })`; **Unlink** calls `DELETE /linked-accounts/{providerName}`.

| Slot | Purpose |
|------|---------|
| `title` | Page heading |
| `description` | Intro text |

| Event | When | Notes |
|-------|------|--------|
| `load` | Lists loaded | `detail` is `{ linked, available }` |
| `link` / `unlink` | Before the action | Cancelable; `detail` is `{ account, providerAlias }` |
| `unlinked` | After successful unlink | Same `detail` shape |
| `error` | Load or action failure | `detail` is `{ phase, error, message }` |

```html
<account-shell>
  <account-linked-accounts></account-linked-accounts>
</account-shell>
```

### Organizations (`account-organizations`)

Loads `/organizations` and lists memberships (name, alias, description, domains).

| Slot | Purpose |
|------|---------|
| `title` | Page heading |
| `description` | Intro text |

| Event | When | Notes |
|-------|------|--------|
| `load` | Organizations loaded | `detail` is the org list |
| `error` | Load failure | `detail` is `{ phase, error, message }` |

```html
<account-shell>
  <account-organizations></account-organizations>
</account-shell>
```

### Resources (`account-resources`)

Tabs for **My resources** (`GET /resources`) and **Shared with me** (`GET /resources/shared-with-me`). Owned rows load pending permission requests and open dedicated dialogs: `account-resource-share-dialog`, `account-resource-edit-dialog`, `account-resource-requests-dialog` (`GET`/`PUT /resources/{id}/permissions`).

| Slot | Purpose |
|------|---------|
| `title` | Page heading |
| `description` | Intro text |

| Event | When | Notes |
|-------|------|--------|
| `load` | Tab data loaded | `detail` is `{ tab, resources }` |
| `share` / `unshare` / `update-permissions` / `approve-request` / `deny-request` | Before the action | Cancelable |
| `shared` / `unshared` / `permissions-updated` | After success | Includes resource (+ username/scopes or permissions) |
| `error` | Load or action failure | `detail` is `{ phase, error, message }` |

```html
<account-shell>
  <account-resources></account-resources>
</account-shell>
```

### Verifiable credentials (`account-verifiable-credentials`)

Loads `/verifiable-credentials`. **Issue to wallet** runs `keycloak.login({ action: "verifiable_credential_offer:<base64>" })`; **Revoke** (when the user has `manage-account` or `manage-verifiable-credentials`) calls `DELETE /verifiable-credentials/{credentialScopeName}`.

| Slot | Purpose |
|------|---------|
| `title` | Page heading |
| `description` | Intro text |

| Event | When | Notes |
|-------|------|--------|
| `load` | Credentials loaded | `detail` is the credential list |
| `issue` / `revoke` | Before the action | Cancelable; `detail` is `{ credential }` |
| `revoked` | After successful revoke | Same `detail` shape |
| `error` | Load or action failure | `detail` is `{ phase, error, message }` |

```html
<account-shell>
  <account-verifiable-credentials></account-verifiable-credentials>
</account-shell>
```

```html
<script type="module">
  const form = document.querySelector("account-personal-info");
  form.addEventListener("save", (event) => {
    // event.preventDefault(); // cancel the POST
    console.log(event.detail.payload);
  });
</script>
```

### Styling

Shared tokens live in `resource/css/tokens.css` (`--account-radius`, `--account-button-bg`, `--account-error-color`, …). Override on `:root` or `account-shell`.

Components also expose `::part(...)` hooks, for example:

- `account-shell::part(layout|nav|main)`
- `account-personal-info::part(form|field|actions|message)`
- `account-signing-in::part(title|description|category|type|list|item|actions|message|empty)`
- `account-device-activity::part(title|description|toolbar|list|item|details|actions|message|empty|badge)`
- `account-applications::part(title|description|list|item|details|actions|message|empty)`
- `account-groups::part(title|description|toolbar|list|item|message|empty)`
- `account-linked-accounts::part(title|description|section|list|item|actions|message|empty|badge)`
- `account-organizations::part(title|description|list|item|message|empty)`
- `account-resources::part(title|description|tabs|list|item|actions|message|empty|badge)`
- `account-dialog::part(dialog|body|title|content|actions)`
- `account-verifiable-credentials::part(title|description|list|item|actions|message|empty)`
- `account-input::part(input)`
- `account-save-button::part(button)`

### Primitives

- `<account-input>` — form-associated; props: `name`, `type`, `value` / `.values`, `.options`, `required`, `readonly`, `disabled`, `placeholder`
- `<account-field>` — label + slotted control (+ optional `help` / `error`)
- `<account-save-button>` — `saving`, `label`, `saving-label`

User-profile metadata is mapped to input props via `attributeToInputProps()` in `resources/js/user-profile.js` (kept out of the input component so inputs stay reusable).

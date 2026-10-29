# Keycloak Account Console HTML

Account console theme where **every page is a simple HTML file**. Pages are served by a custom `AccountResourceProvider`; browser JavaScript will call the Account REST API (no React, no Qute).

Requires **Keycloak 26.x**.

## What’s included

- Theme `account-console-html` (`account` type)
- Provider id `html-account` — serves `pages/*.html` from the theme
- `GET …/account/environment.json` — bootstrap for future keycloak-js / REST calls
- Stub `pages/index.html` that loads and displays the environment

Account pages (profile, sessions, credentials, …) are not implemented yet.

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

## Production build & deploy

```bash
mvn clean package
cp target/keycloak-account-console-html-*.jar $KEYCLOAK_HOME/providers/
$KEYCLOAK_HOME/bin/kc.sh build
```

In the Admin Console, set the realm **Account theme** to `account-console-html`.

## Adding a page

1. Add `src/main/resources/theme/account-console-html/account/pages/<name>.html`
2. With `start-keycloak` running, open `/realms/<realm>/account/<name>` (refresh only)
3. For a packaged deploy, rebuild the JAR as above

Mutations and authenticated reads go through Account REST (`Accept: application/json`) with a Bearer token from the `account-console` client — wire that in page JS when you add real pages.

package org.keycloak.account.html;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriBuilder;

import org.jboss.logging.Logger;
import org.keycloak.common.Version;
import org.keycloak.common.util.MimeTypeUtil;
import org.keycloak.models.ClientModel;
import org.keycloak.models.Constants;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.services.Urls;
import org.keycloak.services.managers.AppAuthManager;
import org.keycloak.services.managers.Auth;
import org.keycloak.services.managers.AuthenticationManager;
import org.keycloak.services.resource.AccountResourceProvider;
import org.keycloak.services.resources.RealmsResource;
import org.keycloak.theme.Theme;
import org.keycloak.urls.UrlType;
import org.keycloak.util.JsonSerialization;

public class HtmlAccountResourceProvider implements AccountResourceProvider {

    private static final Logger LOG = Logger.getLogger(HtmlAccountResourceProvider.class);

    private final KeycloakSession session;
    private final RealmModel realm;
    private final ClientModel client;
    private final Theme theme;
    private final AppAuthManager authManager;

    private Auth auth;

    public HtmlAccountResourceProvider(KeycloakSession session, ClientModel client, Theme theme) {
        this.session = session;
        this.realm = session.getContext().getRealm();
        this.client = client;
        this.theme = theme;
        this.authManager = new AppAuthManager();
        init();
    }

    private void init() {
        AuthenticationManager.AuthResult authResult = authManager.authenticateIdentityCookie(session, realm);
        if (authResult != null) {
            auth = new Auth(realm, authResult.getToken(), authResult.getUser(), client, authResult.getSession(), true);
        }
    }

    @Override
    public Object getResource() {
        return this;
    }

    @Override
    public void close() {
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Path("environment.json")
    public Response getEnvironment() throws IOException {
        return noCache(Response.ok(JsonSerialization.writeValueAsString(buildEnvironment()))
                .type(MediaType.APPLICATION_JSON_TYPE))
                .build();
    }

    /**
     * keycloak-js often lands on {@code /account} without a trailing slash; relative
     * {@code resource/…} URLs then resolve under the realm path. Redirect to {@code /account/}.
     */
    @GET
    @Produces(MediaType.TEXT_HTML)
    public Response getIndex() throws IOException {
        Response redirect = redirectIfAccountPathMissingSlash();
        if (redirect != null) {
            return redirect;
        }
        return servePage("index");
    }

    /**
     * Serve theme resources under {@code /account/resource/…} directly (no ThemeResource
     * redirect). Keeps module and CSS URLs same-origin under {@code /account/}.
     */
    @GET
    @Path("resource/{path:.*}")
    public Response getResource(@PathParam("path") String path) throws IOException {
        if (path == null || path.isBlank() || path.contains("..") || path.startsWith("/") || path.contains("\\")) {
            throw new NotFoundException();
        }

        InputStream stream = theme.getResourceAsStream(path);
        if (stream == null) {
            throw new NotFoundException();
        }

        String contentType = MimeTypeUtil.getContentType(path);
        if (contentType == null || contentType.isBlank()) {
            contentType = "application/octet-stream";
        }

        return noCache(Response.ok(stream).type(contentType)).build();
    }

    @GET
    @Produces(MediaType.TEXT_HTML)
    @Path("{path:.*}")
    public Response getPage(@PathParam("path") String path) throws IOException {
        // Empty path can match here instead of getIndex depending on the runtime.
        if (path == null || path.isBlank() || "index.html".equals(path)) {
            Response redirect = redirectIfAccountPathMissingSlash();
            if (redirect != null) {
                return redirect;
            }
            return servePage("index");
        }

        String segment = path;
        if (segment.endsWith(".html")) {
            segment = segment.substring(0, segment.length() - 5);
        }
        if (segment.contains("..") || segment.startsWith("/") || segment.contains("\\")) {
            throw new NotFoundException();
        }

        return servePage(segment);
    }

    /**
     * @return a redirect response when the browser path is {@code …/account} (no trailing slash),
     *         otherwise {@code null}
     */
    private Response redirectIfAccountPathMissingSlash() {
        URI requestUri = session.getContext().getUri().getRequestUri();
        String path = requestUri.getPath() == null ? "" : requestUri.getPath();
        if (session.getContext().getHttpRequest() != null) {
            String raw = session.getContext().getHttpRequest().getUri().getRequestUri().getPath();
            if (raw != null && !raw.isBlank()) {
                path = raw;
            }
        }
        if (path.endsWith("/")) {
            return null;
        }
        URI location = UriBuilder.fromUri(requestUri).replacePath(path + "/").build();
        return Response.seeOther(location).build();
    }

    private Response servePage(String pageId) throws IOException {
        String templateName = "pages/" + pageId + ".html";
        URL templateUrl = theme.getTemplate(templateName);
        if (templateUrl == null) {
            LOG.debugf("Account HTML page not found: %s", templateName);
            throw new NotFoundException("Page not found: " + pageId);
        }

        String html;
        try (InputStream in = templateUrl.openStream()) {
            html = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }

        UserModel user = auth != null ? auth.getUser() : null;
        Locale locale = session.getContext().resolveLocale(user);
        return noCache(Response.ok(html)
                .type(org.keycloak.utils.MediaType.TEXT_HTML_UTF_8_TYPE)
                .language(locale))
                .build();
    }

    private String accountBaseUrl() {
        URI accountBaseUrl = session.getContext().getUri(UrlType.FRONTEND).getBaseUriBuilder()
                .path(RealmsResource.class)
                .path(realm.getName())
                .path(Constants.ACCOUNT_MANAGEMENT_CLIENT_ID)
                .path("/")
                .build(realm);
        return accountBaseUrl.getPath().endsWith("/") ? accountBaseUrl.toString() : accountBaseUrl + "/";
    }

    private static Response.ResponseBuilder noCache(Response.ResponseBuilder builder) {
        return builder.header("Cache-Control", "no-cache");
    }

    private Map<String, Object> buildEnvironment() {
        var serverUriInfo = session.getContext().getUri(UrlType.FRONTEND);
        var serverBaseUri = serverUriInfo.getBaseUri();
        String serverBaseUrl = serverBaseUri.toString().replaceFirst("/+$", "");

        UserModel user = auth != null ? auth.getUser() : null;
        Locale locale = session.getContext().resolveLocale(user);

        Map<String, Object> env = new HashMap<>();
        env.put("serverBaseUrl", serverBaseUrl);
        env.put("realm", realm.getName());
        env.put("clientId", Constants.ACCOUNT_CONSOLE_CLIENT_ID);
        env.put("baseUrl", accountBaseUrl());
        env.put("resourceUrl", Urls.themeRoot(serverBaseUri).getPath() + "/"
                + Constants.ACCOUNT_MANAGEMENT_CLIENT_ID + "/" + theme.getName());
        env.put("resourceVersion", Version.RESOURCES_VERSION);
        env.put("locale", locale.toLanguageTag());
        env.put("features", AccountFeatures.resolve(session, realm, user));
        return env;
    }
}

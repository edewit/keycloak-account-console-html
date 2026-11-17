package org.keycloak.account.html;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import org.keycloak.authentication.requiredactions.DeleteAccount;
import org.keycloak.authentication.requiredactions.UpdateEmail;
import org.keycloak.common.Profile;
import org.keycloak.models.AccountRoles;
import org.keycloak.models.ClientModel;
import org.keycloak.models.Constants;
import org.keycloak.models.FederatedIdentityModel;
import org.keycloak.models.IdentityProviderModel;
import org.keycloak.models.IdentityProviderQuery;
import org.keycloak.models.IdentityProviderStorageProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.RoleModel;
import org.keycloak.models.UserModel;
import org.keycloak.protocol.oidc.TokenManager;

/**
 * Feature flags for the HTML account console — same keys as the stock account
 * console ({@code content.json} / {@code index.ftl} {@code features} object).
 */
final class AccountFeatures {

    private AccountFeatures() {
    }

    static Map<String, Object> resolve(KeycloakSession session, RealmModel realm, UserModel user) {
        boolean deleteAccountAllowed = false;
        boolean isViewGroupsEnabled = false;
        boolean isViewApplicationsEnabled = false;
        boolean isOid4VciEnabled = false;
        if (user != null) {
            AccountRoleChecker roleChecker = new AccountRoleChecker(session, realm, user);
            var deleteAccountAction = realm.getRequiredActionProviderByAlias(DeleteAccount.PROVIDER_ID);
            deleteAccountAllowed = roleChecker.hasOneOfRole(AccountRoles.MANAGE_ACCOUNT, AccountRoles.DELETE_ACCOUNT)
                    && deleteAccountAction != null
                    && deleteAccountAction.isEnabled();
            isViewGroupsEnabled = roleChecker.hasOneOfRole(AccountRoles.MANAGE_ACCOUNT, AccountRoles.VIEW_GROUPS)
                    && user.getGroupsCount() > 0;
            isViewApplicationsEnabled = roleChecker.hasOneOfRole(AccountRoles.MANAGE_ACCOUNT, AccountRoles.VIEW_APPLICATIONS);
            isOid4VciEnabled = Profile.isFeatureEnabled(Profile.Feature.OID4VC_VCI)
                    && realm.isVerifiableCredentialsEnabled()
                    && roleChecker.hasOneOfRole(AccountRoles.MANAGE_ACCOUNT, AccountRoles.VIEW_VERIFIABLE_CREDENTIALS);
        }

        Map<String, Object> features = new HashMap<>();
        features.put("isRegistrationEmailAsUsername", realm.isRegistrationEmailAsUsername());
        features.put("isEditUserNameAllowed", realm.isEditUsernameAllowed());
        features.put("isInternationalizationEnabled", realm.isInternationalizationEnabled());
        features.put("isLinkedAccountsEnabled", isLinkedAccountsEnabled(session, realm, user));
        features.put("isMyResourcesEnabled",
                realm.isUserManagedAccessAllowed() && Profile.isFeatureEnabled(Profile.Feature.AUTHORIZATION));
        features.put("isViewOrganizationsEnabled", realm.isOrganizationsEnabled());
        features.put("deleteAccountAllowed", deleteAccountAllowed);
        features.put("updateEmailFeatureEnabled", Profile.isFeatureEnabled(Profile.Feature.UPDATE_EMAIL));
        features.put("updateEmailActionEnabled", UpdateEmail.isEnabled(realm));
        features.put("isViewApplicationsEnabled", isViewApplicationsEnabled);
        features.put("isViewGroupsEnabled", isViewGroupsEnabled);
        features.put("isOid4VciEnabled", isOid4VciEnabled);
        return features;
    }

    private static boolean isLinkedAccountsEnabled(KeycloakSession session, RealmModel realm, UserModel user) {
        if (user == null) {
            return false;
        }

        IdentityProviderStorageProvider identityProviders = session.identityProviders();
        Stream<IdentityProviderModel> realmBrokers = identityProviders.getAllStream(
                IdentityProviderQuery.userAuthentication()
                        .with(IdentityProviderModel.ENABLED, "true")
                        .with(IdentityProviderModel.ORGANIZATION_ID, ""),
                0, 1);
        Stream<IdentityProviderModel> linkedBrokers = session.users().getFederatedIdentitiesStream(realm, user)
                .map(FederatedIdentityModel::getIdentityProvider)
                .map(identityProviders::getByAlias);

        return Stream.concat(realmBrokers, linkedBrokers).findAny().isPresent();
    }

    /**
     * Checks whether a user has account roles that will be present in the access token
     * issued for the {@code account-console} client (mirrors AccountConsole).
     */
    private static final class AccountRoleChecker {

        private final ClientModel accountClient;
        private final Set<RoleModel> scopeResolvedRoles;

        AccountRoleChecker(KeycloakSession session, RealmModel realm, UserModel user) {
            this.accountClient = realm.getClientByClientId(Constants.ACCOUNT_MANAGEMENT_CLIENT_ID);
            ClientModel accountConsoleClient = realm.getClientByClientId(Constants.ACCOUNT_CONSOLE_CLIENT_ID);
            this.scopeResolvedRoles = TokenManager.getAccess(user, accountConsoleClient,
                    TokenManager.getRequestedClientScopes(session, null, accountConsoleClient, user));
        }

        boolean hasRole(String roleName) {
            if (accountClient == null) {
                return false;
            }
            RoleModel role = accountClient.getRole(roleName);
            return role != null && scopeResolvedRoles.contains(role);
        }

        boolean hasOneOfRole(String... roleNames) {
            for (String roleName : roleNames) {
                if (hasRole(roleName)) {
                    return true;
                }
            }
            return false;
        }
    }
}

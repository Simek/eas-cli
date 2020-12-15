import gql from 'graphql-tag';

import Analytics from '../analytics';
import { apiClient } from '../api';
import { graphqlClient } from '../graphql/client';
import { CurrentUserQuery } from '../graphql/generated';
import { UserQuery } from '../graphql/queries/UserQuery';
import { getAccessToken, getSessionSecret, setSessionAsync } from './sessionStorage';

// Re-export, but keep in separate file to avoid dependency cycle
export { getSessionSecret, getAccessToken };

export type Actor = NonNullable<CurrentUserQuery['meActor']>;

let currentUser: Actor | undefined;

/**
 * Resolve the name of the actor, either normal user or robot user.
 * This should be used whenever the "current user" needs to be displayed.
 * The display name CANNOT be used as project owner.
 */
export function getActorDisplayName(user?: Actor): string {
  switch (user?.__typename) {
    case 'User':
      return user.username;
    case 'Robot':
      return user.firstName ? `${user.firstName} (robot)` : 'robot';
    default:
      return 'anonymous';
  }
}

export async function getUserAsync(): Promise<Actor | undefined> {
  if (!currentUser && (getAccessToken() || getSessionSecret())) {
    const user = await UserQuery.currentUserAsync();
    currentUser = user ?? undefined;
    if (user) {
      Analytics.setUserProperties(user.id, {
        username: getActorDisplayName(user),
        userId: user.id,
        userType: user.__typename,
      });
    }
  }
  return currentUser;
}

export async function loginAsync({
  username,
  password,
}: {
  username: string;
  password: string;
}): Promise<void> {
  const body = await apiClient.post('auth/loginAsync', { json: { username, password } }).json();
  const { sessionSecret } = (body as any).data;
  const result = await graphqlClient
    .query(
      gql`
        {
          viewer {
            id
            username
          }
        }
      `,
      {},
      {
        fetchOptions: {
          headers: {
            'expo-session': sessionSecret,
          },
        },
      }
    )
    .toPromise();
  const { data } = result;
  await setSessionAsync({
    sessionSecret,
    userId: data.viewer.id,
    username: data.viewer.username,
    currentConnection: 'Username-Password-Authentication',
  });
}

export async function logoutAsync() {
  currentUser = undefined;
  await setSessionAsync(undefined);
}

/*
 * Copyright 2022 Larder Software Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { OktaOrgEntityProvider } from './OktaOrgEntityProvider';
import { ConfigReader } from '@backstage/config';
import { EntityProviderConnection } from '@backstage/plugin-catalog-backend';
import { MockOktaCollection } from '../test-utls';
import { getVoidLogger } from '@backstage/backend-common';
import { ProfileFieldGroupNamingStrategy } from './groupNamingStrategies';

let listGroups: () => MockOktaCollection = () => {
  return new MockOktaCollection([]);
};

let listUsers: () => MockOktaCollection = () => {
  return new MockOktaCollection([]);
};

jest.mock('@okta/okta-sdk-nodejs', () => {
  return {
    Client: jest.fn().mockImplementation(() => {
      return {
        listGroups,
        listUsers,
      };
    }),
  };
});

const logger = getVoidLogger();

describe('OktaOrgEntityProvider', () => {
  const config = new ConfigReader({
    catalog: {
      providers: {
        okta: [
          {
            orgUrl: 'https://okta',
            token: 'secret',
            userFilter: 'profile.organization eq "engineering"',
          },
        ],
      },
    },
  });

  describe('where there is no groups', () => {
    beforeEach(() => {
      listGroups = () => new MockOktaCollection([]);
      listUsers = () => new MockOktaCollection([]);
    });

    it('creates no okta groups', async () => {
      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };
      const provider = OktaOrgEntityProvider.fromConfig(config, { logger });
      await provider.connect(entityProviderConnection);
      await provider.run();
      expect(entityProviderConnection.applyMutation).toBeCalledWith({
        type: 'full',
        entities: [],
      });
    });
  });

  describe('where there is a group', () => {
    beforeEach(() => {
      listGroups = () => {
        return new MockOktaCollection([
          {
            id: 'asdfwefwefwef',
            profile: {
              name: 'Everyone@the-company',
              description: 'Everyone in the company',
              org_id: '1234',
            },
            listUsers: () => {
              return new MockOktaCollection([
                {
                  id: 'asdfwefwefwef',
                  profile: {
                    email: 'fname@domain.com',
                  },
                },
              ]);
            },
          },
          {
            id: 'group-with-null-description',
            profile: {
              name: 'Everyone@the-company',
              description: null,
            },
            listUsers: () => {
              return new MockOktaCollection([
                {
                  id: 'asdfwefwefwef',
                  profile: {
                    email: 'fname@domain.com',
                  },
                },
              ]);
            },
          },
          {
            id: 'group-with-no-members',
            profile: {
              name: 'no-members@the-company',
              description: null,
            },
            listUsers: () => {
              return new MockOktaCollection([]);
            },
          },
        ]);
      };
    });

    it('creates okta groups', async () => {
      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };
      const provider = OktaOrgEntityProvider.fromConfig(config, { logger });
      await provider.connect(entityProviderConnection);
      await provider.run();
      expect(entityProviderConnection.applyMutation).toBeCalledWith({
        type: 'full',
        entities: expect.arrayContaining([
          expect.objectContaining({
            entity: expect.objectContaining({
              kind: 'Group',
              metadata: expect.objectContaining({
                name: 'asdfwefwefwef',
                description: 'Everyone in the company',
              }),
              spec: expect.objectContaining({
                members: ['asdfwefwefwef'],
              }),
            }),
          }),
          expect.objectContaining({
            entity: expect.objectContaining({
              kind: 'Group',
              metadata: expect.objectContaining({
                name: 'asdfwefwefwef',
                description: expect.stringContaining(''),
              }),
              spec: expect.objectContaining({
                members: ['asdfwefwefwef'],
              }),
            }),
          }),
        ]),
      });
    });

    it('optionally creates okta groups with no members', async () => {
      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };
      const provider = OktaOrgEntityProvider.fromConfig(config, {
        logger,
        includeEmptyGroups: true,
      });
      await provider.connect(entityProviderConnection);
      await provider.run();
      expect(entityProviderConnection.applyMutation).toBeCalledWith({
        type: 'full',
        entities: expect.arrayContaining([
          expect.objectContaining({
            entity: expect.objectContaining({
              kind: 'Group',
              metadata: expect.objectContaining({
                name: 'group-with-no-members',
              }),
            }),
          }),
        ]),
      });
    });

    it('allows kebab casing of the group name and user name for the name', async () => {
      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };
      const provider = OktaOrgEntityProvider.fromConfig(config, {
        logger,
        groupNamingStrategy: 'kebab-case-name',
        userNamingStrategy: 'strip-domain-email',
      });
      await provider.connect(entityProviderConnection);
      await provider.run();
      expect(entityProviderConnection.applyMutation).toBeCalledWith({
        type: 'full',
        entities: expect.arrayContaining([
          expect.objectContaining({
            entity: expect.objectContaining({
              kind: 'Group',
              metadata: expect.objectContaining({
                name: 'everyone-the-company',
              }),
              spec: expect.objectContaining({
                members: ['fname'],
              }),
            }),
          }),
        ]),
      });
    });

    it('allows selecting a custom field for the name', async () => {
      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };
      const provider = OktaOrgEntityProvider.fromConfig(config, {
        logger,
        groupNamingStrategy: new ProfileFieldGroupNamingStrategy('org_id')
          .nameForGroup,
        userNamingStrategy: 'strip-domain-email',
      });
      await provider.connect(entityProviderConnection);
      await provider.run();
      expect(entityProviderConnection.applyMutation).toBeCalledWith({
        type: 'full',
        entities: expect.arrayContaining([
          expect.objectContaining({
            entity: expect.objectContaining({
              kind: 'Group',
              metadata: expect.objectContaining({
                name: '1234',
              }),
              spec: expect.objectContaining({
                members: ['fname'],
              }),
            }),
          }),
        ]),
      });
    });

    it('passes over a group if I provide a broken group naming strategy', async () => {
      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };
      const provider = OktaOrgEntityProvider.fromConfig(config, {
        logger,
        groupNamingStrategy: () => {
          throw new Error('bork');
        },
        userNamingStrategy: 'strip-domain-email',
      });
      await provider.connect(entityProviderConnection);
      await provider.run();
      expect(entityProviderConnection.applyMutation).toBeCalledWith({
        type: 'full',
        entities: [],
      });
    });

    it('passes over a user if I provide a broken user naming strategy', async () => {
      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };

      listGroups = () => {
        return new MockOktaCollection([
          {
            id: 'asdfwefwefwef',
            profile: {
              name: 'Everyone@the-company',
              description: 'Everyone in the company',
            },
            listUsers: () => {
              return new MockOktaCollection([
                {
                  id: 'user-1',
                  profile: {
                    email: 'fname@domain.com',
                  },
                },
                {
                  id: 'user-2',
                  profile: {
                    email: 'fname2@domain.com',
                  },
                },
              ]);
            },
          },
        ]);
      };

      const provider = OktaOrgEntityProvider.fromConfig(config, {
        logger,
        groupNamingStrategy: 'kebab-case-name',
        userNamingStrategy: user => {
          if (user.id === 'user-1') {
            return user.id;
          }
          throw new Error('bork');
        },
      });
      await provider.connect(entityProviderConnection);
      await provider.run();
      expect(entityProviderConnection.applyMutation).toBeCalledWith({
        type: 'full',
        entities: expect.arrayContaining([
          expect.objectContaining({
            entity: expect.objectContaining({
              kind: 'Group',
              metadata: expect.objectContaining({
                name: 'everyone-the-company',
                title: 'Everyone@the-company',
              }),
              spec: expect.objectContaining({
                members: ['user-1'],
              }),
            }),
          }),
        ]),
      });
    });

    it('can be provided with a mechanism to create a hierarchy', async () => {
      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };

      listGroups = () => {
        return new MockOktaCollection([
          {
            id: 'asdfwefwefwef',
            profile: {
              name: 'Everyone@the-company',
              description: 'Everyone in the company',
              org_id: '1',
              parent_org_id: '1',
            },
            listUsers: () => {
              return new MockOktaCollection([
                {
                  id: 'user-1',
                  profile: {
                    email: 'fname@domain.com',
                  },
                },
                {
                  id: 'user-2',
                  profile: {
                    email: 'fname2@domain.com',
                  },
                },
              ]);
            },
          },
          {
            id: 'asdfwefwefwef',
            profile: {
              name: 'Some@the-company',
              description: 'Some in the company',
              org_id: '2',
              parent_org_id: '1',
            },
            listUsers: () => {
              return new MockOktaCollection([
                {
                  id: 'user-1',
                  profile: {
                    email: 'fname@domain.com',
                  },
                },
              ]);
            },
          },
        ]);
      };

      const provider = OktaOrgEntityProvider.fromConfig(config, {
        logger,
        groupNamingStrategy: new ProfileFieldGroupNamingStrategy('org_id')
          .nameForGroup,
        parentGroupField: 'parent_org_id',
      });
      await provider.connect(entityProviderConnection);
      await provider.run();
      expect(entityProviderConnection.applyMutation).toBeCalledWith({
        type: 'full',
        entities: expect.arrayContaining([
          expect.objectContaining({
            entity: expect.objectContaining({
              kind: 'Group',
              metadata: expect.objectContaining({
                name: '1',
                title: 'Everyone@the-company',
              }),
              spec: expect.objectContaining({
                members: ['user-1', 'user-2'],
                parent: '1',
              }),
            }),
          }),
          expect.objectContaining({
            entity: expect.objectContaining({
              kind: 'Group',
              metadata: expect.objectContaining({
                name: '2',
                title: 'Some@the-company',
              }),
              spec: expect.objectContaining({
                members: ['user-1'],
                parent: '1',
              }),
            }),
          }),
        ]),
      });
    });
  });
});

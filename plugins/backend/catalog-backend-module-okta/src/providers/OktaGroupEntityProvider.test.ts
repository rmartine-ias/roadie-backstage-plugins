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

import { OktaGroupEntityProvider } from './OktaGroupEntityProvider';
import { ConfigReader } from '@backstage/config';
import { EntityProviderConnection } from '@backstage/plugin-catalog-backend';
import { MockOktaCollection } from '../test-utls';
import { getVoidLogger } from '@backstage/backend-common';
import { ProfileFieldGroupNamingStrategy } from './groupNamingStrategies';

let listGroups: () => MockOktaCollection = () => {
  return new MockOktaCollection([]);
};

jest.mock('@okta/okta-sdk-nodejs', () => {
  return {
    Client: jest.fn().mockImplementation(() => {
      return {
        listGroups,
      };
    }),
  };
});

const logger = getVoidLogger();

describe('OktaGroupProvider', () => {
  const config = new ConfigReader({
    orgUrl: 'https://okta',
    token: 'secret',
  });

  describe('where there is no groups', () => {
    beforeEach(() => {
      listGroups = () => new MockOktaCollection([]);
    });

    it('creates no okta groups', async () => {
      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };
      const provider = OktaGroupEntityProvider.fromConfig(config, { logger });
      provider.connect(entityProviderConnection);
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
              parent_org_id: '1234',
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
              org_id: '1235',
              parent_org_id: '1234',
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
        ]);
      };
    });

    it('creates okta groups', async () => {
      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };
      const provider = OktaGroupEntityProvider.fromConfig(config, { logger });
      provider.connect(entityProviderConnection);
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

    it('allows kebab casing of the group name and user name for the name', async () => {
      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };
      const provider = OktaGroupEntityProvider.fromConfig(config, {
        logger,
        namingStrategy: 'kebab-case-name',
        userNamingStrategy: 'strip-domain-email',
      });
      provider.connect(entityProviderConnection);
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
      const provider = OktaGroupEntityProvider.fromConfig(config, {
        logger,
        namingStrategy: new ProfileFieldGroupNamingStrategy('org_id')
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

    it('allows creating a hierarchy for groups', async () => {
      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };
      const provider = OktaGroupEntityProvider.fromConfig(config, {
        logger,
        parentGroupField: 'parent_org_id',
        namingStrategy: new ProfileFieldGroupNamingStrategy('org_id')
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
                parent: '1234',
              }),
            }),
          }),
          expect.objectContaining({
            entity: expect.objectContaining({
              kind: 'Group',
              metadata: expect.objectContaining({
                name: '1235',
              }),
              spec: expect.objectContaining({
                members: ['fname'],
                parent: '1234',
              }),
            }),
          }),
        ]),
      });
    });

    it('where a failing naming strategy is provided it passes over the group', async () => {
      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };
      const provider = OktaGroupEntityProvider.fromConfig(config, {
        logger,
        namingStrategy: () => {
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

    it('where a failing user naming strategy is provided it passes over the user', async () => {
      const entityProviderConnection: EntityProviderConnection = {
        applyMutation: jest.fn(),
        refresh: jest.fn(),
      };
      const provider = OktaGroupEntityProvider.fromConfig(config, {
        logger,
        namingStrategy: new ProfileFieldGroupNamingStrategy('org_id')
          .nameForGroup,
        userNamingStrategy: () => {
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
                name: '1234',
              }),
              spec: expect.objectContaining({
                members: [],
              }),
            }),
          }),
        ]),
      });
    });
  });
});

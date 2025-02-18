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
import { GroupEntity } from '@backstage/catalog-model';
import { Group } from '@okta/okta-sdk-nodejs';
import { GroupNamingStrategy } from './groupNamingStrategies';

export const groupEntityFromOktaGroup = (
  group: Group,
  namingStrategy: GroupNamingStrategy,
  options: {
    annotations: Record<string, string>;
    members: string[];
    parentGroupField?: string;
  },
): GroupEntity => {
  const parentFieldValue = options.parentGroupField
    ? group.profile[options.parentGroupField]
    : undefined;
  let parent: string | undefined = undefined;
  if (typeof parentFieldValue === 'string') {
    parent = parentFieldValue;
  }
  if (typeof parentFieldValue === 'number') {
    parent = parentFieldValue.toString();
  }
  const groupEntity: GroupEntity = {
    kind: 'Group',
    apiVersion: 'backstage.io/v1alpha1',
    metadata: {
      annotations: {
        ...options.annotations,
      },
      name: namingStrategy(group),
      title: group.profile.name,
      description: group.profile.description || '',
    },
    spec: {
      members: options.members,
      type: 'group',
      children: [],
    },
  };
  if (parent !== '') {
    groupEntity.spec.parent = parent;
  }
  return groupEntity;
};

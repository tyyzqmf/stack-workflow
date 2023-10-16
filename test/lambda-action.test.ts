/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import {
  CloudFormationClient,
  CloudFormationServiceException,
  CreateStackCommand,
  DescribeStacksCommand, Stack, StackStatus, UpdateStackCommand, UpdateTerminationProtectionCommand,
} from '@aws-sdk/client-cloudformation';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { CdkCustomResourceResponse } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { getMockContext } from './mock';
import { handler, StackEvent, StackAction } from '../src/lambda/action';
import 'aws-sdk-client-mock-jest';

describe('Action Lambda Function', () => {

  const context = getMockContext();
  const s3Mock = mockClient(S3Client);
  const cloudFormationMock = mockClient(CloudFormationClient);

  const baseStackActionEvent: StackEvent = {
    Action: StackAction.CREATE,
    Input: {
      Region: 'ap-southeast-1',
      TemplateURL: 'https://aws-gcr-solutions.s3.us-east-1.amazonaws.com/default/test-stack.template.json',
      Parameters: [],
      StackName: 'TestStackName',
      Tags: [],
    },
    ExecutionName: '5b6971e0-f261-11ed-a7e3-02a848659f60',
  };

  const stackResult: Stack = {
    StackId: 'arn:aws:cloudformation:ap-southeast-1:555555555555:stack/TestStackName',
    StackName: 'TestStackName',
    Description: '',
    Parameters: [],
    CreationTime: new Date(),
    DeletionTime: new Date(),
    RollbackConfiguration: {},
    StackStatus: StackStatus.DELETE_IN_PROGRESS,
    DisableRollback: true,
    NotificationARNs: [],
    Capabilities: [
      'CAPABILITY_IAM',
      'CAPABILITY_NAMED_IAM',
      'CAPABILITY_AUTO_EXPAND',
    ],
    Tags: [],
    EnableTerminationProtection: false,
    DriftInformation: {
      StackDriftStatus: 'NOT_CHECKED',
    },
  };

  beforeEach(() => {
    s3Mock.reset();
    cloudFormationMock.reset();
  });

  test('Create stack', async () => {
    const event: StackEvent = baseStackActionEvent;
    cloudFormationMock.on(CreateStackCommand).resolves({
      StackId: 'arn:aws:cloudformation:ap-southeast-1:555555555555:stack/TestStackName',
    });
    const resp = await handler(event, context) as CdkCustomResourceResponse;
    expect(resp.Action).toEqual(StackAction.DESCRIBE);
    expect(resp.Result.StackId).toEqual('arn:aws:cloudformation:ap-southeast-1:555555555555:stack/TestStackName');
    expect(resp.Result.StackName).toEqual('TestStackName');
    expect(resp.Result.StackStatus).toEqual(StackStatus.CREATE_IN_PROGRESS);
    expect(cloudFormationMock).toHaveReceivedCommandTimes(CreateStackCommand, 1);
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 0);
  });

  test('Update stack', async () => {
    const event: StackEvent = {
      ...baseStackActionEvent,
      Action: StackAction.UPDATE,
    };
    cloudFormationMock.on(UpdateStackCommand).resolves({
      StackId: 'arn:aws:cloudformation:ap-southeast-1:555555555555:stack/TestStackName',
    });
    const resp = await handler(event, context) as CdkCustomResourceResponse;
    expect(resp.Action).toEqual(StackAction.DESCRIBE);
    expect(resp.Result.StackId).toEqual('arn:aws:cloudformation:ap-southeast-1:555555555555:stack/TestStackName');
    expect(resp.Result.StackName).toEqual('TestStackName');
    expect(resp.Result.StackStatus).toEqual(StackStatus.UPDATE_IN_PROGRESS);
    expect(cloudFormationMock).toHaveReceivedCommandTimes(UpdateStackCommand, 1);
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 0);
  });

  test('Update stack with rollback exception', async () => {
    const event: StackEvent = {
      ...baseStackActionEvent,
      Action: StackAction.UPDATE,
    };
    const mockValidationError = new CloudFormationServiceException({
      $metadata: {
        httpStatusCode: 200,
        requestId: 'asdsad',
      },
      $fault: 'client',
      name: 'ValidationError',
      message: 'please use the disable-rollback parameter with update-stack API',
    });

    cloudFormationMock.on(UpdateStackCommand)
      .rejectsOnce(mockValidationError)
      .resolves({
        StackId: 'arn:aws:cloudformation:ap-southeast-1:555555555555:stack/TestStackName',
      });
    const resp = await handler(event, context) as CdkCustomResourceResponse;
    expect(resp.Action).toEqual(StackAction.DESCRIBE);
    expect(resp.Result.StackId).toEqual('arn:aws:cloudformation:ap-southeast-1:555555555555:stack/TestStackName');
    expect(resp.Result.StackName).toEqual('TestStackName');
    expect(resp.Result.StackStatus).toEqual(StackStatus.UPDATE_IN_PROGRESS);
    expect(cloudFormationMock).toHaveReceivedCommandTimes(UpdateStackCommand, 2);
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 0);
  });

  test('Upgrade stack', async () => {
    const event: StackEvent = {
      ...baseStackActionEvent,
      Action: StackAction.UPGRADE,
    };
    cloudFormationMock.on(UpdateStackCommand).resolves({
      StackId: 'arn:aws:cloudformation:ap-southeast-1:555555555555:stack/TestStackName',
    });
    const resp = await handler(event, context) as CdkCustomResourceResponse;
    expect(resp.Action).toEqual(StackAction.DESCRIBE);
    expect(resp.Result.StackId).toEqual('arn:aws:cloudformation:ap-southeast-1:555555555555:stack/TestStackName');
    expect(resp.Result.StackName).toEqual('TestStackName');
    expect(resp.Result.StackStatus).toEqual(StackStatus.UPDATE_IN_PROGRESS);
    expect(cloudFormationMock).toHaveReceivedCommandTimes(UpdateStackCommand, 1);
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 0);
  });

  test('Callback', async () => {
    const event: StackEvent = {
      ...baseStackActionEvent,
      Action: StackAction.CALLBACK,
      Result: stackResult,
    };
    s3Mock.on(PutObjectCommand).resolves({});
    const resp = await handler(event, context) as CdkCustomResourceResponse;
    expect(resp).toEqual(event);
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 1);
  });

  test('Callback with stack failed', async () => {
    const event: StackEvent = {
      ...baseStackActionEvent,
      Action: StackAction.CALLBACK,
      Result: {
        ...stackResult,
        StackStatus: StackStatus.DELETE_FAILED,
        StackStatusReason: 'mock failed reason',
      },
    };
    s3Mock.on(PutObjectCommand).resolves({});
    try {
      await handler(event, context) as CdkCustomResourceResponse;
    } catch (err) {
      expect((err as Error).message).toEqual('mock failed reason');
    }
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 1);
  });

  test('Describe stack with delete_in_progress', async () => {
    const event: StackEvent = {
      ...baseStackActionEvent,
      Action: StackAction.DESCRIBE,
      Result: {
        ...stackResult,
        StackStatus: StackStatus.DELETE_IN_PROGRESS,
      },
    };
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          ...stackResult,
          StackStatus: StackStatus.DELETE_COMPLETE,
        },
      ],
    });
    const resp = await handler(event, context) as CdkCustomResourceResponse;
    expect(resp).toEqual({
      ...event,
      Action: StackAction.CALLBACK,
      Result: {
        ...stackResult,
        StackStatus: StackStatus.DELETE_COMPLETE,
      },
    });
    expect(cloudFormationMock).toHaveReceivedNthSpecificCommandWith(1, DescribeStacksCommand, {
      StackName: 'arn:aws:cloudformation:ap-southeast-1:555555555555:stack/TestStackName',
    });
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 0);
  });

  test('Describe stack with delete_complete', async () => {
    const event: StackEvent = {
      ...baseStackActionEvent,
      Action: StackAction.DESCRIBE,
      Result: {
        ...stackResult,
        StackStatus: StackStatus.DELETE_COMPLETE,
      },
    };
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          ...stackResult,
          StackStatus: StackStatus.DELETE_COMPLETE,
        },
      ],
    });
    const resp = await handler(event, context) as CdkCustomResourceResponse;
    expect(resp).toEqual({
      ...event,
      Action: StackAction.CALLBACK,
      Result: {
        ...stackResult,
        StackStatus: StackStatus.DELETE_COMPLETE,
      },
    });
    expect(cloudFormationMock).toHaveReceivedNthSpecificCommandWith(1, DescribeStacksCommand, {
      StackName: 'arn:aws:cloudformation:ap-southeast-1:555555555555:stack/TestStackName',
    });
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 0);
  });

  test('Delete stack with protection', async () => {
    const event: StackEvent = {
      ...baseStackActionEvent,
      Action: StackAction.DELETE,
      Result: {
        ...stackResult,
        StackStatus: StackStatus.CREATE_COMPLETE,
      },
    };
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          ...stackResult,
          StackStatus: StackStatus.CREATE_COMPLETE,
        },
      ],
    });
    cloudFormationMock.on(UpdateTerminationProtectionCommand).resolves({
      StackId: 'arn:aws:cloudformation:ap-southeast-1:555555555555:stack/TestStackName',
    });
    const resp = await handler(event, context) as CdkCustomResourceResponse;
    expect(resp.Action).toEqual(StackAction.DESCRIBE);
    expect(resp.Result.StackId).toEqual('arn:aws:cloudformation:ap-southeast-1:555555555555:stack/TestStackName');
    expect(resp.Result.StackName).toEqual('TestStackName');
    expect(resp.Result.StackStatus).toEqual(StackStatus.DELETE_IN_PROGRESS);
    expect(cloudFormationMock).toHaveReceivedNthSpecificCommandWith(1, DescribeStacksCommand, {
      StackName: 'arn:aws:cloudformation:ap-southeast-1:555555555555:stack/TestStackName',
    });
    expect(cloudFormationMock).toHaveReceivedNthSpecificCommandWith(1, UpdateTerminationProtectionCommand, {
      EnableTerminationProtection: false,
      StackName: 'arn:aws:cloudformation:ap-southeast-1:555555555555:stack/TestStackName',
    });
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 0);
  });

});

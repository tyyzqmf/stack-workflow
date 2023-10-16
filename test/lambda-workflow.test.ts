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
  CloudFormationClient, DescribeStacksCommand, StackStatus,
} from '@aws-sdk/client-cloudformation';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { CdkCustomResourceResponse } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { mockS3GetObject } from './mock';
import { handler, WorkFlowEventType, WorkFlowInitialEvent, WorkflowState, WorkflowStateType } from '../src/lambda/workflow';
import 'aws-sdk-client-mock-jest';

describe('SFN workflow Lambda Function', () => {

  const s3Mock = mockClient(S3Client);
  const cloudFormationMock = mockClient(CloudFormationClient);

  const baseStackEvent: WorkFlowInitialEvent = {
    Type: WorkFlowEventType.INITIAL,
    Data: {
      ExecutionName: 'main-d1f8f94d',
      Input: {
        value: {
          Type: WorkflowStateType.STACK,
          Data: {
            Input: {
              Region: 'ap-southeast-1',
              TemplateURL: 'https://s3-us-west-2.amazonaws.com/cloudformation-templates-us-west-2/SQSWithQueueName.template',
              Action: 'Create',
              Parameters: [
                {
                  ParameterKey: 'QueueName',
                  ParameterValue: 'test1',
                },
              ],
              StackName: 'Stack-test1',
            },
          },
          End: true,
        } as WorkflowState,
      },
    },
  };

  beforeEach(() => {
    s3Mock.reset();
    cloudFormationMock.reset();
  });

  test('Initial Pass', async () => {
    const event: WorkFlowInitialEvent = {
      ...baseStackEvent,
      Data: {
        ...baseStackEvent.Data,
        Input: {
          ...baseStackEvent.Data.Input,
          value: {
            ...baseStackEvent.Data.Input.value,
            Type: WorkflowStateType.PASS,
          },
        },
      },
    };
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'Stack-test1',
          Outputs: [
            {
              OutputKey: 'QueueName',
              OutputValue: 'test1',
            },
          ],
          StackStatus: StackStatus.CREATE_COMPLETE,
          CreationTime: new Date(),
        },
      ],
    });
    s3Mock.on(PutObjectCommand).resolves({});
    const resp = await handler(event) as CdkCustomResourceResponse;
    expect(resp).toEqual({
      Type: WorkflowStateType.PASS,
      ExecutionName: 'main-d1f8f94d',
      Data: {
        Input: {
          Region: 'ap-southeast-1',
          TemplateURL: 'https://s3-us-west-2.amazonaws.com/cloudformation-templates-us-west-2/SQSWithQueueName.template',
          Action: 'Create',
          Parameters: [
            {
              ParameterKey: 'QueueName',
              ParameterValue: 'test1',
            },
          ],
          StackName: 'Stack-test1',
        },
      },
      End: true,
    });
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 1);
    expect(cloudFormationMock).toHaveReceivedCommandTimes(DescribeStacksCommand, 1);
  });

  test('Initial Stack', async () => {
    const resp = await handler(baseStackEvent) as CdkCustomResourceResponse;
    expect(resp).toEqual({
      Type: WorkflowStateType.STACK,
      ExecutionName: 'main-d1f8f94d',
      Data: {
        ExecutionName: 'main-d1f8f94d',
        Input: {
          Region: 'ap-southeast-1',
          TemplateURL: 'https://s3-us-west-2.amazonaws.com/cloudformation-templates-us-west-2/SQSWithQueueName.template',
          Action: 'Create',
          Parameters: [
            {
              ParameterKey: 'QueueName',
              ParameterValue: 'test1',
            },
          ],
          StackName: 'Stack-test1',
        },
      },
      End: true,
    });
    expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 0);
  });

  test('Initial Serial', async () => {
    const event: WorkFlowInitialEvent = {
      ...baseStackEvent,
      Data: {
        ...baseStackEvent.Data,
        Input: {
          value: {
            Type: WorkflowStateType.PARALLEL,
            End: true,
            Branches: [
              {
                States: {
                  'Stack-test1': {
                    Type: WorkflowStateType.STACK,
                    Data: {
                      Input: {
                        Region: 'ap-southeast-1',
                        TemplateURL: 'https://s3-us-west-2.amazonaws.com/cloudformation-templates-us-west-2/SQSWithQueueName.template',
                        Action: 'Create',
                        Parameters: [
                          {
                            ParameterKey: 'QueueName',
                            ParameterValue: 'test1',
                          },
                        ],
                        StackName: 'Stack-test1',
                      },
                    },
                    Next: 'Stack-test2',
                  },
                  'Stack-test2': {
                    Type: WorkflowStateType.STACK,
                    Data: {
                      Input: {
                        Region: 'ap-southeast-1',
                        TemplateURL: 'https://s3-us-west-2.amazonaws.com/cloudformation-templates-us-west-2/SQSWithQueueName.template',
                        Action: 'Create',
                        Parameters: [
                          {
                            ParameterKey: 'QueueName',
                            ParameterValue: 'test2',
                          },
                        ],
                        StackName: 'Stack-test2',
                      },
                    },
                    End: true,
                  },
                },
                StartAt: 'Stack-test1',
              },
            ],
          } as WorkflowState,
        },
      },
    };
    const resp = await handler(event) as CdkCustomResourceResponse;
    expect(resp).toEqual({
      Type: WorkflowStateType.SERIAL,
      Data: [
        {
          Type: WorkflowStateType.STACK,
          Data: {
            Input: {
              Region: 'ap-southeast-1',
              TemplateURL: 'https://s3-us-west-2.amazonaws.com/cloudformation-templates-us-west-2/SQSWithQueueName.template',
              Action: 'Create',
              Parameters: [
                {
                  ParameterKey: 'QueueName',
                  ParameterValue: 'test1',
                },
              ],
              StackName: 'Stack-test1',
            },
          },
          ExecutionName: 'main-d1f8f94d',
          Next: 'Stack-test2',
        },
        {
          Type: WorkflowStateType.STACK,
          Data: {
            Input: {
              Region: 'ap-southeast-1',
              TemplateURL: 'https://s3-us-west-2.amazonaws.com/cloudformation-templates-us-west-2/SQSWithQueueName.template',
              Action: 'Create',
              Parameters: [
                {
                  ParameterKey: 'QueueName',
                  ParameterValue: 'test2',
                },
              ],
              StackName: 'Stack-test2',
            },
          },
          ExecutionName: 'main-d1f8f94d',
          End: true,
        },
      ],
    });
    expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 0);
  });

  test('Initial Parallel', async () => {
    const event: WorkFlowInitialEvent = {
      ...baseStackEvent,
      Data: {
        ...baseStackEvent.Data,
        Input: {
          value: {
            Type: WorkflowStateType.PARALLEL,
            End: true,
            Branches: [
              {
                States: {
                  'Stack-test1': {
                    Type: WorkflowStateType.STACK,
                    Data: {
                      Input: {
                        Region: 'ap-southeast-1',
                        TemplateURL: 'https://s3-us-west-2.amazonaws.com/cloudformation-templates-us-west-2/SQSWithQueueName.template',
                        Action: 'Create',
                        Parameters: [
                          {
                            ParameterKey: 'QueueName',
                            ParameterValue: 'test1',
                          },
                        ],
                        StackName: 'Stack-test1',
                      },
                    },
                    End: true,
                  },
                },
                StartAt: 'Stack-test1',
              },
              {
                States: {
                  'Stack-test2': {
                    Type: WorkflowStateType.STACK,
                    Data: {
                      Input: {
                        Region: 'ap-southeast-1',
                        TemplateURL: 'https://s3-us-west-2.amazonaws.com/cloudformation-templates-us-west-2/SQSWithQueueName.template',
                        Action: 'Create',
                        Parameters: [
                          {
                            ParameterKey: 'QueueName',
                            ParameterValue: 'test2',
                          },
                        ],
                        StackName: 'Stack-test2',
                      },
                    },
                    End: true,
                  },
                },
                StartAt: 'Stack-test2',
              },
            ],
          } as WorkflowState,
        },
      },
    };
    const resp = await handler(event) as CdkCustomResourceResponse;
    expect(resp).toEqual({
      Type: WorkflowStateType.PARALLEL,
      Data: [
        {
          States: {
            'Stack-test1': {
              Type: WorkflowStateType.STACK,
              Data: {
                Input: {
                  Region: 'ap-southeast-1',
                  TemplateURL: 'https://s3-us-west-2.amazonaws.com/cloudformation-templates-us-west-2/SQSWithQueueName.template',
                  Action: 'Create',
                  Parameters: [
                    {
                      ParameterKey: 'QueueName',
                      ParameterValue: 'test1',
                    },
                  ],
                  StackName: 'Stack-test1',
                },
              },
              ExecutionName: 'main-d1f8f94d',
              End: true,
            },
          },
          StartAt: 'Stack-test1',
        },
        {
          States: {
            'Stack-test2': {
              Type: WorkflowStateType.STACK,
              Data: {
                Input: {
                  Region: 'ap-southeast-1',
                  TemplateURL: 'https://s3-us-west-2.amazonaws.com/cloudformation-templates-us-west-2/SQSWithQueueName.template',
                  Action: 'Create',
                  Parameters: [
                    {
                      ParameterKey: 'QueueName',
                      ParameterValue: 'test2',
                    },
                  ],
                  StackName: 'Stack-test2',
                },
              },
              ExecutionName: 'main-d1f8f94d',
              End: true,
            },
          },
          StartAt: 'Stack-test2',
        },
      ],
    });
    expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 0);
  });

  test('Create stack with parameter get from JSONPath', async () => {
    const event: WorkFlowInitialEvent = {
      ...baseStackEvent,
      Data: {
        ...baseStackEvent.Data,
        Input: {
          ...baseStackEvent.Data.Input,
          value: {
            ...baseStackEvent.Data.Input.value,
            Data: {
              Input: {
                Region: 'ap-southeast-1',
                TemplateURL: 'https://s3-us-west-2.amazonaws.com/cloudformation-templates-us-west-2/SQSWithQueueName.template',
                Action: 'Create',
                Parameters: [
                  {
                    ParameterKey: 'QueueName.$',
                    ParameterValue: '$.Stack-test0.Outputs[0].OutputValue',
                  },
                ],
                StackName: 'Stack-test1',
              },
            },
          } as WorkflowState,
        },
      },
    };
    const obj = {
      'Stack-test0': {
        Outputs: [{
          OutputKey: 'OutputKey0',
          OutputValue: 'OutputValue0',
        }],
      },
    };
    mockS3GetObject(s3Mock, obj);

    const resp = await handler(event) as CdkCustomResourceResponse;
    expect(resp).toEqual({
      Type: WorkflowStateType.STACK,
      ExecutionName: 'main-d1f8f94d',
      Data: {
        ExecutionName: 'main-d1f8f94d',
        Input: {
          Region: 'ap-southeast-1',
          TemplateURL: 'https://s3-us-west-2.amazonaws.com/cloudformation-templates-us-west-2/SQSWithQueueName.template',
          Action: 'Create',
          Parameters: [
            {
              ParameterKey: 'QueueName',
              ParameterValue: 'OutputValue0',
            },
          ],
          StackName: 'Stack-test1',
        },
      },
      End: true,
    });
    expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 1);
  });

  test('Create stack with parameter get from stack output suffix', async () => {
    const event: WorkFlowInitialEvent = {
      ...baseStackEvent,
      Data: {
        ...baseStackEvent.Data,
        Input: {
          ...baseStackEvent.Data.Input,
          value: {
            ...baseStackEvent.Data.Input.value,
            Data: {
              Input: {
                Region: 'ap-southeast-1',
                TemplateURL: 'https://s3-us-west-2.amazonaws.com/cloudformation-templates-us-west-2/SQSWithQueueName.template',
                Action: 'Create',
                Parameters: [
                  {
                    ParameterKey: 'QueueName.#',
                    ParameterValue: '#.Stack-test0.OutputKey0',
                  },
                ],
                StackName: 'Stack-test1',
              },
            },
          } as WorkflowState,
        },
      },
    };
    const obj = {
      'Stack-test0': {
        Outputs: [{
          OutputKey: 'xxxxxxx-sssssss-OutputKey0',
          OutputValue: 'OutputValue0',
        }],
      },
    };
    mockS3GetObject(s3Mock, obj);

    const resp = await handler(event) as CdkCustomResourceResponse;
    expect(resp).toEqual({
      Type: WorkflowStateType.STACK,
      ExecutionName: 'main-d1f8f94d',
      Data: {
        ExecutionName: 'main-d1f8f94d',
        Input: {
          Region: 'ap-southeast-1',
          TemplateURL: 'https://s3-us-west-2.amazonaws.com/cloudformation-templates-us-west-2/SQSWithQueueName.template',
          Action: 'Create',
          Parameters: [
            {
              ParameterKey: 'QueueName',
              ParameterValue: 'OutputValue0',
            },
          ],
          StackName: 'Stack-test1',
        },
      },
      End: true,
    });
    expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 1);
  });

});

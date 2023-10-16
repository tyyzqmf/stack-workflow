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

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CSDCStackWorkflow } from '../src/index';

describe('Stack Test', () => {

  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack');
  new CSDCStackWorkflow(stack, 'MyTestConstruct');
  const template = Template.fromStack(stack);

  test('Resources Count', () => {
    template.resourceCountIs('AWS::Lambda::Function', 2);
    template.resourceCountIs('AWS::IAM::Role', 4);
    template.resourceCountIs('AWS::IAM::Policy', 6);
    template.resourceCountIs('AWS::S3::Bucket', 2);
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 2);
  });

  test('Lambda Function Created', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Architectures: [
        'x86_64',
      ],
      Description: 'Lambda function for action state machine',
      Runtime: 'nodejs18.x',
    });

    template.hasResourceProperties('AWS::Lambda::Function', {
      Architectures: [
        'x86_64',
      ],
      Description: 'Lambda function for workflow state machine',
      Runtime: 'nodejs18.x',
    });
  });

  test('S3 Bucket Created', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: {
        'Fn::Join': [
          '',
          [
            'stack-workflow-callback-',
            {
              'Fn::Select': [
                2,
                {
                  'Fn::Split': [
                    '/',
                    {
                      Ref: 'AWS::StackId',
                    },
                  ],
                },
              ],
            },
          ],
        ],
      },
    });
  });

  test('IAM Role Created', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com',
            },
          },
        ],
        Version: '2012-10-17',
      },
      ManagedPolicyArns: [
        {
          'Fn::Join': [
            '',
            [
              'arn:',
              {
                Ref: 'AWS::Partition',
              },
              ':iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
            ],
          ],
        },
      ],
    });
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: {
                'Fn::FindInMap': [
                  'ServiceprincipalMap',
                  {
                    Ref: 'AWS::Region',
                  },
                  'states',
                ],
              },
            },
          },
        ],
        Version: '2012-10-17',
      },
    });
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com',
            },
          },
        ],
        Version: '2012-10-17',
      },
      ManagedPolicyArns: [
        {
          'Fn::Join': [
            '',
            [
              'arn:',
              {
                Ref: 'AWS::Partition',
              },
              ':iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
            ],
          ],
        },
      ],
    });
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: {
                'Fn::FindInMap': [
                  'ServiceprincipalMap',
                  {
                    Ref: 'AWS::Region',
                  },
                  'states',
                ],
              },
            },
          },
        ],
        Version: '2012-10-17',
      },
    });
  });

});

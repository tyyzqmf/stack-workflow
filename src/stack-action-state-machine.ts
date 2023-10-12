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

import * as fs from 'fs';
import * as path from 'path';
import * as defaults from '@aws-solutions-constructs/core';
import { Aws, aws_lambda, Duration } from 'aws-cdk-lib';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { Effect, Policy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Architecture, IFunction, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Choice, Condition, DefinitionBody, Pass, StateMachine, TaskInput, Wait, WaitTime } from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

export interface StackActionStateMachineProps {
  readonly vpc?: IVpc;
  readonly targetToCNRegions?: boolean;
  readonly policyStatementForRunStack?: PolicyStatement[];
}

export class StackActionStateMachine extends Construct {

  public readonly actionStateMachine: StateMachine;
  public readonly actionFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: StackActionStateMachineProps) {
    super(scope, id);

    // Create Lambda function for action state machine
    this.actionFunction = this._createActionFunction(props);

    // Define a chainable task to execute the action
    const startTask = this._chain();

    // Define a state machine
    const builder = defaults.buildStateMachine(this, {
      definitionBody: DefinitionBody.fromChainable(startTask),
      tracingEnabled: true,
      timeout: Duration.minutes(120),
    }, {});
    this.actionStateMachine = builder.stateMachine;
  }

  private _createActionFunction = (props: StackActionStateMachineProps) => {

    const actionFunctionRole = new Role(this, 'ActionFunctionRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });

    // Obtain Lambda function for construct
    const lambdaFile = path.join(__dirname, './lambda/workflow/index');
    const extension = fs.existsSync(lambdaFile + '.ts') ? '.ts' : '.js';
    const entry = `${lambdaFile}${extension}`;
    const nodejsFunc = new NodejsFunction(this, 'ActionFunction', {
      description: 'Lambda function for action state machine',
      entry: entry,
      handler: 'handler',
      runtime: Runtime.NODEJS_18_X,
      tracing: aws_lambda.Tracing.ACTIVE,
      role: actionFunctionRole,
      architecture: Architecture.X86_64,
      timeout: Duration.seconds(15),
      bundling: {
        externalModules: [
          '@aws-lambda-powertools/logger',
          '@aws-sdk/client-cloudformation',
          '@aws-sdk/client-s3',
          'jsonpath-plus',
        ],
      },
    });
    const func = defaults.buildLambdaFunction(this, {
      existingLambdaObj: nodejsFunc,
      vpc: props.vpc,
    });
    this._attachPolicy(func, props.policyStatementForRunStack ?? []);
    return func;
  };

  private _attachPolicy = (actionFunction: IFunction, additionalPolicyStatements: PolicyStatement[]) => {
    if (!actionFunction.role) {
      throw Error('Action function role is undefined.');
    }
    const actionFunctionDefaultPolicy = new Policy(this, 'ActionFunctionDefaultPolicy', {
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: [`arn:${Aws.PARTITION}:cloudformation:*:${Aws.ACCOUNT_ID}:stack/*`],
          actions: [
            'cloudformation:CreateStack',
            'cloudformation:UpdateStack',
            'cloudformation:DeleteStack',
            'cloudformation:DescribeStacks',
            'cloudformation:UpdateTerminationProtection',
          ],
        }),
        ...additionalPolicyStatements,
      ],
    });
    actionFunctionDefaultPolicy.attachToRole(actionFunction.role);
  };

  private _chain = () => {
    const executeTask = new LambdaInvoke(this, 'Execute Task', {
      lambdaFunction: this.actionFunction,
      payload: TaskInput.fromJsonPathAt('$'),
      outputPath: '$.Payload',
    });

    const describeStack = new LambdaInvoke(this, 'Describe Stack', {
      lambdaFunction: this.actionFunction,
      payload: TaskInput.fromJsonPathAt('$'),
      outputPath: '$.Payload',
    });

    const callbackTask = new LambdaInvoke(this, 'Callback Task', {
      lambdaFunction: this.actionFunction,
      payload: TaskInput.fromJsonPathAt('$'),
      outputPath: '$.Payload',
    });

    const endState = new Pass(this, 'EndState');

    const wait15 = new Wait(this, 'Wait 15 Seconds', {
      time: WaitTime.duration(Duration.seconds(15)),
    });

    const endChoice = new Choice(this, 'End?')
      .when(Condition.stringEquals('$.Action', 'End'), endState)
      .otherwise(wait15);

    executeTask.next(endChoice);
    wait15.next(describeStack);

    const progressChoice = new Choice(this, 'Stack in progress?')
      .when(Condition.stringMatches('$.Result.StackStatus', '*_IN_PROGRESS'), wait15)
      .otherwise(callbackTask);

    describeStack.next(progressChoice);

    callbackTask.next(endState);

    return executeTask;
  };
}
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
import { Aws, aws_lambda, CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { Effect, Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, IFunction, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Choice, Condition, DefinitionBody, IntegrationPattern, IStateMachine, JsonPath, Pass, StateMachine, TaskInput, Map as SFNMap } from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke, StepFunctionsStartExecution } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { StackActionStateMachine } from './stack-action-state-machine';

export interface CSDCStackWorkflowProps {
  readonly vpc?: IVpc;
  readonly targetToCNRegions?: boolean;
  readonly policyStatementForRunStack?: PolicyStatement[];
}

export class CSDCStackWorkflow extends Construct {

  public readonly actionStateMachine: StateMachine;
  public readonly workflowStateMachine: StateMachine;
  public readonly workflowFunction: NodejsFunction;
  public readonly callbackBucket: Bucket;

  constructor(scope: Construct, id: string, props: CSDCStackWorkflowProps) {
    super(scope, id);

    // Create S3 bucket for callback
    this.callbackBucket = defaults.buildS3Bucket(this, {
      bucketProps: {
        bucketName: this._generatePhysicalName('stack-workflow-callback', 32),
      },
    }).bucket;

    // Create action state machine
    this.actionStateMachine = new StackActionStateMachine(this, 'ActionStateMachine', {
      callbackBucket: this.callbackBucket,
      vpc: props.vpc,
      policyStatementForRunStack: props.policyStatementForRunStack,
    }).actionStateMachine;

    // Create Lambda function for workflow state machine
    this.workflowFunction = this._createWorkflowFunction(this, props);

    // Define a chainable task to execute the workflow
    const workflowMachineName = this._generatePhysicalName('Workflow', 80);
    const workflowMachineNameArn = `arn:${Aws.PARTITION}:states:${Aws.REGION}:${Aws.ACCOUNT_ID}:stateMachine:${workflowMachineName}`;
    const startTask = this._chain(workflowMachineNameArn);

    // Define a state machine
    const builder = defaults.buildStateMachine(this, {
      stateMachineName: workflowMachineName,
      definitionBody: DefinitionBody.fromChainable(startTask),
      tracingEnabled: true,
      timeout: Duration.hours(2),
    }, {});
    this.workflowStateMachine = builder.stateMachine;

    this._output();
  }

  private _generatePhysicalName = (prefix: string, maxLength?: number) => {
    const maxNameLength = maxLength ?? 64;
    const namePrefix = prefix ?? 'PhysicalName';
    const maxGeneratedNameLength = maxNameLength - namePrefix.length;
    const nameParts: string[] = [
      Stack.of(this).stackName, // Name of the stack
      this.node.id, // Construct ID
    ];
    return defaults.generatePhysicalName(namePrefix, nameParts, maxGeneratedNameLength);
  };

  private _createWorkflowFunction = (scope: Construct, props: CSDCStackWorkflowProps) => {
    // Obtain Lambda function for construct
    const lambdaFile = path.join(__dirname, './lambda/workflow/index');
    const extension = fs.existsSync(lambdaFile + '.ts') ? '.ts' : '.js';
    const entry = `${lambdaFile}${extension}`;
    const nodejsFunc = new NodejsFunction(this, 'WorkflowFunction', {
      description: 'Lambda function for workflow state machine',
      entry: entry,
      handler: 'handler',
      runtime: Runtime.NODEJS_18_X,
      tracing: aws_lambda.Tracing.ACTIVE,
      architecture: Architecture.X86_64,
      timeout: Duration.seconds(15),
      environment: {
        CALLBACK_BUCKET_NAME: this.callbackBucket.bucketName,
      },
    });
    const func = defaults.buildLambdaFunction(scope, {
      existingLambdaObj: nodejsFunc,
      vpc: props.vpc,
    });
    this._attachPolicy(func);
    this.callbackBucket.grantReadWrite(func);
    return func;
  };

  private _attachPolicy = (workflowFunction: IFunction) => {
    if (!workflowFunction.role) {
      throw Error('Workflow function role is undefined.');
    }
    const workflowFunctionDefaultPolicy = new Policy(this, 'WorkflowFunctionDefaultPolicy', {
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: [`arn:${Aws.PARTITION}:cloudformation:*:${Aws.ACCOUNT_ID}:stack/*`],
          actions: [
            'cloudformation:DescribeStacks',
          ],
        }),
      ],
    });
    workflowFunctionDefaultPolicy.attachToRole(workflowFunction.role);
  };

  private _chain = (workflowMachineNameArn: string) => {
    const inputTask = new LambdaInvoke(this, 'InputTask', {
      lambdaFunction: this.workflowFunction,
      payload: TaskInput.fromObject({
        Type: 'Initial',
        Data: {
          ExecutionName: JsonPath.executionName,
          Input: TaskInput.fromJsonPathAt('$'),
        },
      }),
      outputPath: '$.Payload',
    });

    const stackExecution = new StepFunctionsStartExecution(this, 'StackExecution', {
      stateMachine: this.actionStateMachine,
      integrationPattern: IntegrationPattern.RUN_JOB,
      input: TaskInput.fromObject({
        Action: JsonPath.stringAt('$.Input.Action'),
        Token: JsonPath.taskToken,
        Input: JsonPath.stringAt('$.Input'),
        ExecutionName: JsonPath.stringAt('$.ExecutionName'),
      }),
    });

    const serialCallSelf = new StepFunctionsStartExecution(this, 'SerialCallSelf', {
      stateMachine: {
        stateMachineArn: workflowMachineNameArn,
      } as IStateMachine,
      integrationPattern: IntegrationPattern.RUN_JOB,
      input: TaskInput.fromObject({
        Token: JsonPath.taskToken,
        Type: 'CallSelf',
        Data: JsonPath.stringAt('$'),
      }),
    });

    const parallelCallSelf = new StepFunctionsStartExecution(this, 'ParallelCallSelf', {
      stateMachine: {
        stateMachineArn: workflowMachineNameArn,
      } as IStateMachine,
      integrationPattern: IntegrationPattern.RUN_JOB,
      input: TaskInput.fromObject({
        Token: JsonPath.taskToken,
        Type: 'CallSelf',
        Data: JsonPath.stringAt('$'),
      }),
    });

    const serialMap = new SFNMap(this, 'SerialMap', {
      maxConcurrency: 1,
      itemsPath: JsonPath.stringAt('$'),
    });
    serialMap.iterator(serialCallSelf);

    const parallelMap = new SFNMap(this, 'ParallelMap', {
      maxConcurrency: 40,
      itemsPath: JsonPath.stringAt('$'),
    });
    parallelMap.iterator(parallelCallSelf);

    const pass = new Pass(this, 'Pass');

    const typeChoice = new Choice(this, 'TypeChoice', {
      outputPath: '$.Data',
    }).when(Condition.stringEquals('$.Type', 'Stack'), stackExecution)
      .when(Condition.stringEquals('$.Type', 'Serial'), serialMap)
      .when(Condition.stringEquals('$.Type', 'Parallel'), parallelMap)
      .otherwise(pass);

    inputTask.next(typeChoice);
    return inputTask;
  };

  private _output = () => {
    new CfnOutput(this, 'WorkflowStateMachineArn', {
      description: 'Workflow State Machine Arn',
      value: this.workflowStateMachine.stateMachineArn,
    }).overrideLogicalId('WorkflowStateMachineArn');

    new CfnOutput(this, 'ActionStateMachineArn', {
      description: 'Action State Machine Arn',
      value: this.actionStateMachine.stateMachineArn,
    }).overrideLogicalId('ActionStateMachineArn');

    new CfnOutput(this, 'CallbackBucketName', {
      description: 'Callback Bucket Name',
      value: this.callbackBucket.bucketName,
    }).overrideLogicalId('CallbackBucketName');

  };
}
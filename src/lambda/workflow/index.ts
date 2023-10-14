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

import { Logger } from '@aws-lambda-powertools/logger';
import { Parameter, Output, CloudFormationClient, DescribeStacksCommand, Tag } from '@aws-sdk/client-cloudformation';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { JSONPath } from 'jsonpath-plus';

const logger = new Logger();
const callbackBucketName = process.env.CALLBACK_BUCKET_NAME;

export enum WorkFlowEventType {
  INITIAL = 'Initial',
  CALLSELF = 'CallSelf',
}

export interface WorkFlowInitialEvent {
  Type: WorkFlowEventType;
  readonly Data: {
    readonly ExecutionName: string;
    readonly Input: {
      readonly value: WorkflowOriginInput;
    };
  };
}

export interface StackData {
  ExecutionName: string;
  Input: {
    Region: string;
    Action: string;
    StackName: string;
    TemplateURL: string;
    Parameters: Parameter[];
    Tags?: Tag[];
  };
}

export interface WorkflowOriginInput {
  Type: WorkflowStateType;
}

export interface WorkflowState extends WorkflowOriginInput {
  ExecutionName: string;
  Data?: StackData;
  Branches?: WorkflowParallelBranch[];
  End?: boolean;
  Next?: string;
}

export interface WorkflowCallSelfState extends WorkflowOriginInput {
  Type: WorkflowStateType.CALL_SELF;
  Data: WorkflowState;
  Token: string;
}

export enum WorkflowStateType {
  PASS = 'Pass',
  STACK = 'Stack',
  SERIAL = 'Serial',
  PARALLEL = 'Parallel',
  CALL_SELF = 'CallSelf',
}

export interface WorkflowParallelBranch {
  StartAt: string;
  States: {
    [name: string]: WorkflowState;
  };
}

export const handler = async (event: WorkFlowInitialEvent): Promise<any> => {
  logger.info('Lambda is invoked', JSON.stringify(event, null, 2));
  try {
    const curExecutionName = event.Data?.ExecutionName ?? '';
    let originInput = event.Data?.Input?.value;

    if (!originInput) {
      throw new Error('Origin input is undefined.');
    }

    logger.info('originInput', { originInput });

    if (originInput.Type === WorkflowStateType.CALL_SELF) {
      originInput = (originInput as WorkflowCallSelfState).Data;
    }

    switch (originInput.Type) {
      case 'Pass':
        await callback(_pathExecutionName(originInput as WorkflowState, curExecutionName));
        return event;
      case 'Stack':
        return await stackParametersResolve(_pathExecutionName(originInput as WorkflowState, curExecutionName));
      case 'Parallel':
        const branches = (originInput as WorkflowState).Branches;
        if (!branches || branches.length === 0) {
          throw new Error('Branches is undefined.');
        }
        if (branches.length === 1) {
          return serial(branches[0], curExecutionName);
        }
        return {
          Type: 'Parallel',
          Data: _pathExecutionNameToBranches(branches, curExecutionName),
        };
      default:
        const branch: WorkflowParallelBranch = {
          States: (originInput as any).States,
          StartAt: (originInput as any).StartAt,
        };
        return serial(branch, curExecutionName);
    }
  } catch (err) {
    logger.error('Stack workflow input failed.', {
      error: err,
      event: event,
    });
    throw new Error('Stack workflow input failed.');
  }
};

export const serial = (branch: WorkflowParallelBranch, executionName: string) => {
  const states = branch.States;
  const data: WorkflowState[] = [];
  let currentKey = branch.StartAt;
  let currentStep = states[currentKey];
  while (true) {
    if (!currentStep.ExecutionName || currentStep.ExecutionName === '') {
      currentStep.ExecutionName = executionName;
    }
    data.push(currentStep);
    if (currentStep.End || !currentStep.Next) {
      break;
    }
    currentKey = currentStep.Next;
    currentStep = states[currentKey];
  }
  return {
    Type: 'Serial',
    Data: data,
  };
};

export const callback = async (state: WorkflowState) => {
  if (!callbackBucketName || !state.ExecutionName) {
    throw new Error('Callback bucket name or execution name is undefined.');
  }
  if (!state.Data) {
    throw new Error('Stack data is undefined.');
  }
  const stackData = state.Data;
  const stack = await describe(stackData.Input.Region, stackData.Input.StackName);
  if (!stack) {
    throw Error('Describe Stack failed.');
  }
  await putObject(
    callbackBucketName,
    `${state.ExecutionName}/${stackData.Input.StackName}/output.json`,
    JSON.stringify({ [stackData.Input.StackName]: stack }),
  );
};

export const describe = async (region: string, stackName: string) => {
  try {
    const cloudFormationClient = new CloudFormationClient({
      region,
    });
    const params: DescribeStacksCommand = new DescribeStacksCommand({
      StackName: stackName,
    });
    const result = await cloudFormationClient.send(params);
    if (result.Stacks) {
      return result.Stacks[0];
    }
    return undefined;
  } catch (err) {
    logger.error((err as Error).message, { error: err });
    return undefined;
  }
};

async function stackParametersResolve(state: WorkflowState) {
  if (!state.Data) {
    throw new Error('Stack data is undefined.');
  }
  if (!callbackBucketName || !state.ExecutionName) {
    throw new Error('Callback bucket name or execution name is undefined.');
  }
  const prefix = state.ExecutionName;
  for (let param of state.Data.Input.Parameters) {
    let key = param.ParameterKey;
    let value = param.ParameterValue;
    // Find the value in output accurately through JSONPath
    if (param.ParameterKey?.endsWith('.$') && param.ParameterValue?.startsWith('$.')) {
      ({ key, value } = await _getParameterKeyAndValueByJSONPath(param.ParameterKey, param.ParameterValue, callbackBucketName, prefix));
    } else if (param.ParameterKey?.endsWith('.#') && param.ParameterValue?.startsWith('#.')) { // Find the value in output by suffix
      ({ key, value } = await _getParameterKeyAndValueByStackOutput(param.ParameterKey, param.ParameterValue, callbackBucketName, prefix));
    }
    param.ParameterKey = key;
    param.ParameterValue = value;
  }
  state.Data.ExecutionName = state.ExecutionName;
  return state;
}

async function _getParameterKeyAndValueByStackOutput(paramKey: string, paramValue: string, bucket: string, prefix: string) {
  // get stack name
  const splitValues = paramValue.split('.');
  const stackName = splitValues[1];
  // get output from s3
  let stackOutputs;
  try {
    const output = await getObject(bucket, `${prefix}/${stackName}/output.json`);
    stackOutputs = JSON.parse(output as string)[stackName].Outputs;
  } catch (err) {
    logger.error('Stack workflow output error.', {
      error: err,
      output: `${prefix}/${stackName}/output.json`,
    });
  }
  let value = '';
  if (stackOutputs) {
    for (let out of stackOutputs as Output[]) {
      if (out.OutputKey?.endsWith(splitValues[2])) {
        value = out.OutputValue ?? '';
        break;
      }
    }
  }
  return {
    key: paramKey.substring(0, paramKey.length - 2),
    value: value ?? '',
  };
}

async function _getParameterKeyAndValueByJSONPath(paramKey: string, paramValue: string, bucket: string, prefix: string) {
  const splitValues = paramValue.split('.');
  const stackName = splitValues[1];
  // get output from s3
  let stackOutputs;
  try {
    const output = await getObject(bucket, `${prefix}/${stackName}/output.json`);
    stackOutputs = JSON.parse(output as string);
  } catch (err) {
    logger.error('Stack workflow output error.', {
      error: err,
      output: `${prefix}/${stackName}/output.json`,
    });
  }
  let value = '';
  if (stackOutputs) {
    const values = JSONPath({ path: paramValue, json: stackOutputs });
    if (Array.prototype.isPrototypeOf(values) && values.length > 0) {
      value = values[0] as string;
    }
  }
  return {
    key: paramKey.substring(0, paramKey.length - 2),
    value,
  };
}

async function getObject(bucket: string, key: string) {
  const streamToString = (stream: any) => new Promise((resolve, reject) => {
    const chunks: any = [];
    stream.on('data', (chunk: any) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  try {
    const s3Client = new S3Client();
    const { Body } = await s3Client.send(command);
    const bodyContents = await streamToString(Body);
    return bodyContents;
  } catch (error) {
    logger.error((error as Error).message, { error });
    return undefined;
  }
}

async function putObject(bucket: string, key: string, body: string) {
  try {
    const s3Client = new S3Client();
    const input = {
      Body: body,
      Bucket: bucket,
      Key: key,
      ContentType: 'application/json',
    };
    const command = new PutObjectCommand(input);
    await s3Client.send(command);
  } catch (err) {
    logger.error((err as Error).message, { error: err });
    throw Error((err as Error).message);
  }
}

function _pathExecutionName(state: WorkflowState, executionName: string) {
  if (state.ExecutionName === undefined || executionName === '') {
    state.ExecutionName = executionName;
  }
  return state;
};

function _pathExecutionNameToBranches(branches: WorkflowParallelBranch[], executionName: string) {
  for (let branch of branches) {
    for (let state of Object.values(branch.States)) {
      if (state.ExecutionName === undefined || executionName === '') {
        state.ExecutionName = executionName;
      }
    }
  }
  return branches;
};

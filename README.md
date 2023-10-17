# Stack Workflow Construct

## Overview
This AWS Solutions Construct implements a state machine (AWS Step Functions) to manage the execution flow of multiple stacks (AWS CloudFormation).

Here is a minimal deployable pattern definition:

**Typescript**

```ts
import { Construct } from 'constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import { CSDCStackWorkflow } from 'stack-workflow';

new CSDCStackWorkflow(this, 'test-stack-workflow');
```

## Deployment

### Preparations

- Make sure you have an AWS account
- Configure [credential of aws cli](https://docs.aws.amazon.com/zh_cn/cli/latest/userguide/cli-chap-configure.html)
- Install Node.js LTS version 18.17.0 or later
- Install Docker Engine
- Install the dependencies of the solution by executing the command `yarn install --check-files && npx projen`
- Initialize the CDK toolkit stack into AWS environment (only for deploying via [AWS CDK](https://aws.amazon.com/cdk/) for the first time), and run `npx cdk bootstrap`

### Deploy the construct

```shell
cdk deploy --app='./lib/integ.default.js' --require-approval never
```

### Test

```shell
yarn test
```

## Getting Started

After creating the Stack, you can see the following output:
｜----｜----｜----｜
｜ WorkflowStateMachineArn ｜ arn:aws:states:ap-southeast-1:*:stateMachine:<workflow-state-machine-name> ｜ Workflow State Machine Arn ｜
｜ ActionStateMachineArn ｜ arn:aws:states:ap-southeast-1:*:stateMachine:<action-state-machine-name> ｜ Action State Machine Arn ｜
｜ CallbackBucketName ｜ stack-workflow-callback-xxx ｜ Callback Bucket Name ｜

Access the AWS Step Functions console, select the workflow state machine, click the **Start Execution** button, and enter the following JSON data to complete the tasks.

### Task1: Run stack

**Target:** Use stack to create/update/delete a DynamoDB table in `ap-southeast-1` region.

**Execution input:**
```json
{
  "Type": "Stack",
  "Data": {
    "Input": {
      "Region": "ap-southeast-1",
      "TemplateURL": "https://s3-us-west-1.amazonaws.com/cloudformation-templates-us-west-1/DynamoDBSI.template",
      "Action": "Create",
      "Parameters": [
        {
          "ParameterKey": "ReadCapacityUnits",
          "ParameterValue": "5"
        },
        {
          "ParameterKey": "WriteCapacityUnits",
          "ParameterValue": "10"
        }
      ],
      "StackName": "Stack-test1"
    }
  },
  "End": true
}
```

**Tips:**

You only need to modify `Data.Input.Action` to complete other stack operations: **Update**, **Delete**.

### Task2: Run stacks concurrently

**Target:** Concurrently executing two stacks in `ap-southeast-1` region, one for creating DynamoDB table and one for creating SQS queue with a specific name.

**Execution input:**
```json
{
  "Type": "Parallel",
  "End": true,
  "Branches": [
    {
      "States": {
        "Stack-test21": {
          "Type": "Stack",
          "Data": {
            "Input": {
              "Region": "ap-southeast-1",
              "TemplateURL": "https://s3-us-west-1.amazonaws.com/cloudformation-templates-us-west-1/DynamoDBSI.template",
              "Action": "Create",
              "Parameters": [
                {
                  "ParameterKey": "ReadCapacityUnits",
                  "ParameterValue": "5"
                },
                {
                  "ParameterKey": "WriteCapacityUnits",
                  "ParameterValue": "10"
                }
              ],
              "StackName": "Stack-test21"
            }
          },
          "End": true
        }
      },
      "StartAt": "Stack-test21"
    },
    {
      "States": {
        "Stack-test22": {
          "Type": "Stack",
          "Data": {
            "Input": {
              "Region": "ap-southeast-1",
              "TemplateURL": "https://s3-us-west-2.amazonaws.com/cloudformation-templates-us-west-2/SQSWithQueueName.template",
              "Action": "Create",
              "Parameters": [
                {
                  "ParameterKey": "QueueName",
                  "ParameterValue": "test22"
                }
              ],
              "StackName": "Stack-test22"
            }
          },
          "End": true
        }
      },
      "StartAt": "Stack-test22"
    }
  ]
}
```

### Task3: Run stacks serially

**Target:** Serially executing two stacks in `ap-southeast-1` region. First, create a DynamoDB table, and after the first stack is completed, create SQS queue with a specific name.

**Execution input:**
```json
{
  "Type": "Parallel",
  "End": true,
  "Branches": [
    {
      "States": {
        "Stack-test31": {
          "Type": "Stack",
          "Data": {
            "Input": {
              "Region": "ap-southeast-1",
              "TemplateURL": "https://s3-us-west-1.amazonaws.com/cloudformation-templates-us-west-1/DynamoDBSI.template",
              "Action": "Create",
              "Parameters": [
                {
                  "ParameterKey": "ReadCapacityUnits",
                  "ParameterValue": "5"
                },
                {
                  "ParameterKey": "WriteCapacityUnits",
                  "ParameterValue": "10"
                }
              ],
              "StackName": "Stack-test31"
            }
          },
          "Next": "Stack-test32"
        },
        "Stack-test32": {
          "Type": "Stack",
          "Data": {
            "Input": {
              "Region": "ap-southeast-1",
              "TemplateURL": "https://s3-us-west-2.amazonaws.com/cloudformation-templates-us-west-2/SQSWithQueueName.template",
              "Action": "Create",
              "Parameters": [
                {
                  "ParameterKey": "QueueName",
                  "ParameterValue": "test32"
                }
              ],
              "StackName": "Stack-test32"
            }
          },
          "End": true
        }
      },
      "StartAt": "Stack-test31"
    }
  ]
}
```

### Task4: Run stacks with input/output dependency

**Target:** Serially executing two stacks in `ap-southeast-1` region. First, create a DynamoDB table, and after the first stack is completed, create SQS queue with a specific name that is first stack output(first stack **output** DynamoDB table name as second stack **input** queue name).

**Execution input:**
```json
{
  "Type": "Parallel",
  "End": true,
  "Branches": [
    {
      "States": {
        "Stack-test41": {
          "Type": "Stack",
          "Data": {
            "Input": {
              "Region": "ap-southeast-1",
              "TemplateURL": "https://s3-us-west-1.amazonaws.com/cloudformation-templates-us-west-1/DynamoDBSI.template",
              "Action": "Create",
              "Parameters": [
                {
                  "ParameterKey": "ReadCapacityUnits",
                  "ParameterValue": "5"
                },
                {
                  "ParameterKey": "WriteCapacityUnits",
                  "ParameterValue": "10"
                }
              ],
              "StackName": "Stack-test41"
            }
          },
          "Next": "Stack-test42"
        },
        "Stack-test42": {
          "Type": "Stack",
          "Data": {
            "Input": {
              "Region": "ap-southeast-1",
              "TemplateURL": "https://s3-us-west-2.amazonaws.com/cloudformation-templates-us-west-2/SQSWithQueueName.template",
              "Action": "Create",
              "Parameters": [
                {
                  "ParameterKey": "QueueName.#",
                  "ParameterValue": "#.Stack-test41.TableName"
                },
              ],
              "StackName": "Stack-test42"
            }
          },
          "End": true
        }
      },
      "StartAt": "Stack-test41"
    }
  ]
}
```

**Tips:**

Of course, you can also use **JsonPath** to obtain values from Outputs, and such parameters can achieve the same effect:

```json
{
  "ParameterKey": "QueueName.$",
  "ParameterValue": "$.Stack-test41.Outputs[0].OutputValue"
}
```
                
## Architecture
![Architecture Diagram](architecture.png)

## Default settings
Out of the box implementation of the Construct without any override will set the following defaults:

### AWS Step Functions
- Workflow state machine timeout is 2 hours, stack action state machine timeout is 1 hour
- Specifies Amazon X-Ray tracing is enabled for state machine

### AWS Lambda
- The runtime environment: `NODEJS_18_X`
- The system architectures compatible with this lambda function: `X86_64`
- The function execution time (`15 seconds`) after which Lambda terminates the function

### AWS CloudFormation
- Create stack with `DisableRollback:true`
- **Disable** termination protection on the specified stack
- Explicitly acknowledge that stack template contains certain capabilities(`CAPABILITY_IAM, CAPABILITY_NAMED_IAM, CAPABILITY_AUTO_EXPAND`) in order for CloudFormation to create the stack

### Amazon S3 Bucket
- Configure Access logging for S3 Bucket
- Enable server-side encryption for S3 Bucket using AWS managed KMS Key
- Enforce encryption of data in transit
- **Turn on** the versioning for S3 Bucket
- **Don't allow** public access for S3 Bucket
- **Retain** the S3 Bucket when deleting the CloudFormation stack
- Applies Lifecycle rule to move noncurrent object versions to Glacier storage after 90 days

## License

This project is licensed under the Apache-2.0 License.

## Acknowledgements

This project utilizes [projen](https://github.com/projen/projen).
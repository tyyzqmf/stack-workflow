import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CSDCStackWorkflow } from '../src/index';

// example test. To run these tests, uncomment this file along with the
// example resource in lib/index.ts
test('Lambda Function Created', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack');
  // WHEN
  new CSDCStackWorkflow(stack, 'MyTestConstruct', {});
  // THEN
  const template = Template.fromStack(stack);

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
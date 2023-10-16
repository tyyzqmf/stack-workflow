import { awscdk } from 'projen';

const cdkVersion = '2.100.0';
const minNodeVersion = '18.17.0';
const project = new awscdk.AwsCdkConstructLibrary({
  cdkVersion,
  minNodeVersion,
  author: 'mingfeiq',
  authorAddress: 'mingfeiq@amazon.com',
  defaultReleaseBranch: 'main',
  jsiiVersion: '~5.0.0',
  name: 'stack-workflow',
  description: 'A CDK construct library that creates a workflow to run stacks',
  license: 'MIT',
  projenrcTs: true,
  repositoryUrl: 'https://github.com/tyyzqmf/stack-workflow.git',
  mergify: true,
  docgen: false,
  eslint: true,
  gitignore: [
    'cdk.out',
    'cdk.context.json',
    '.idea/',
    '.vscode/',
    '.DS_Store',
    '*.iml',
    '*.ipr',
    '*.iws',
  ],
  deps: [
    '@types/aws-lambda@^8.10.110',
    '@aws-solutions-constructs/core@^2.44.0',
    '@aws-sdk/client-cloudformation@^3.405.0',
    '@aws-sdk/client-s3@^3.405.0',
    '@aws-lambda-powertools/logger@^1.14.0',
    '@smithy/util-stream-node@^2.0.7',
    'jsonpath-plus@^7.2.0',
  ], /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  devDeps: [
    'aws-sdk-client-mock@^2.1.1',
    'aws-sdk-client-mock-jest@^2.1.1',
  ], /* Build dependencies for this module. */
  // packageName: undefined,  /* The "name" in package.json. */
  bundledDeps: [
    '@types/aws-lambda',
    '@aws-sdk/client-cloudformation',
    '@aws-sdk/client-s3',
    '@aws-lambda-powertools/logger',
    '@smithy/util-stream-node',
    'jsonpath-plus',
    'aws-sdk-client-mock',
    'aws-sdk-client-mock-jest',
  ],
  keywords: [
    'aws',
    'cdk',
    'awscdk',
    'AWS Step Functions',
    'AWS CloudFormation',
  ],
  jestOptions: {
    jestConfig: {
      setupFiles: ['./test/jestEnv.js'],
    },
  },
});
project.synth();
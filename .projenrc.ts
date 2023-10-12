import { awscdk } from 'projen';
import { NodePackageManager } from 'projen/lib/javascript/node-package';

const cdkVersion = '2.100.0';
const minNodeVersion = '18.17.0';
const project = new awscdk.AwsCdkConstructLibrary({
  cdkVersion,
  minNodeVersion,
  author: 'mingfeiq',
  authorAddress: 'mingfeiq@amazon.com',
  defaultReleaseBranch: 'main',
  jsiiVersion: '~5.0.0',
  name: '@tyyzqmf/stack-workflow',
  description: 'A CDK construct library that creates a workflow to run stacks',
  license: 'Apache-2.0',
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
  packageManager: NodePackageManager.PNPM,

  deps: [
    '@aws-solutions-constructs/core@^2.44.0',
    '@aws-sdk/client-cloudformation@^3.405.0',
    '@aws-sdk/client-s3@^3.405.0',
    '@aws-lambda-powertools/logger@^1.14.0',
    'jsonpath-plus@^7.2.0',
  ], /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],             /* Build dependencies for this module. */
  // packageName: undefined,  /* The "name" in package.json. */
  bundledDeps: [
    '@aws-sdk/client-cloudformation',
    '@aws-sdk/client-s3',
    '@aws-lambda-powertools/logger',
    'jsonpath-plus',
  ],
  keywords: [
    'aws',
    'cdk',
    'awscdk',
    'AWS Solutions Constructs',
    'AWS Step Functions',
    'AWS CloudFormation',
  ],
});
project.synth();
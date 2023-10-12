import * as cdk from 'aws-cdk-lib';
import { CSDCStackWorkflow } from './index';

const app = new cdk.App();
const stack = new cdk.Stack(app, 'MyStack');

new CSDCStackWorkflow(stack, 'CSDC-Stack-Workflow', {});

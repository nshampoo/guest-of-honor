#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { GuestOfHonorStack } from '../lib/guest-of-honor-stack';

const app = new cdk.App();

new GuestOfHonorStack(app, 'GuestOfHonor', {
  env: { account: '404933715334', region: 'us-east-1' },
  tags: { project: 'guest-of-honor' },
});

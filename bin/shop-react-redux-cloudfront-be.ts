#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { ShopReactReduxCloudfrontBeStack } from '../lib/shop-react-redux-cloudfront-be-stack';

const app = new cdk.App();
new ShopReactReduxCloudfrontBeStack(app, 'ShopReactReduxCloudfrontBeStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-west-1',
  },
});

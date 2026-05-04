#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { ProductServiceStack } from "../lib/product-service-stack";
import { ImportServiceStack } from "../lib/import-service-stack";

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: "eu-west-1",
};

new ProductServiceStack(app, "ProductServiceStack", { env });
new ImportServiceStack(app, "ImportServiceStack", { env });

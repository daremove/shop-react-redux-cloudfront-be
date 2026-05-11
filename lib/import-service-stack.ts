import * as cdk from "aws-cdk-lib/core";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as path from "path";
import { Construct } from "constructs";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";

const UPLOADED_FOLDER = "uploaded";

export interface ImportServiceStackProps extends cdk.StackProps {
  catalogItemsQueue: sqs.IQueue;
}

export class ImportServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ImportServiceStackProps) {
    super(scope, id, props);

    const { catalogItemsQueue } = props;

    const importBucket = new s3.Bucket(this, "ImportBucket", {
      bucketName: `rs-import-service-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.PUT,
            s3.HttpMethods.GET,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
        },
      ],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new s3deploy.BucketDeployment(this, "InitUploadedFolder", {
      sources: [s3deploy.Source.data(`${UPLOADED_FOLDER}/.keep`, "")],
      destinationBucket: importBucket,
      prune: false,
    });

    const commonLambdaProps: Omit<NodejsFunctionProps, "entry" | "functionName"> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      environment: {
        IMPORT_BUCKET_NAME: importBucket.bucketName,
        UPLOADED_FOLDER,
      },
      timeout: cdk.Duration.seconds(30),
    };

    const importProductsFile = new NodejsFunction(this, "ImportProductsFile", {
      ...commonLambdaProps,
      entry: path.join(
        __dirname,
        "..",
        "src",
        "services",
        "import-service",
        "importProductsFile.ts"
      ),
      functionName: "importProductsFile",
    });

    importBucket.grantPut(importProductsFile, `${UPLOADED_FOLDER}/*`);

    const importFileParser = new NodejsFunction(this, "ImportFileParser", {
      ...commonLambdaProps,
      entry: path.join(
        __dirname,
        "..",
        "src",
        "services",
        "import-service",
        "importFileParser.ts"
      ),
      functionName: "importFileParser",
      environment: {
        ...commonLambdaProps.environment,
        CATALOG_ITEMS_QUEUE_URL: catalogItemsQueue.queueUrl,
      },
    });

    importBucket.grantRead(importFileParser, `${UPLOADED_FOLDER}/*`);
    catalogItemsQueue.grantSendMessages(importFileParser);

    importBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(importFileParser),
      { prefix: `${UPLOADED_FOLDER}/` }
    );

    const api = new apigateway.RestApi(this, "ImportServiceApi", {
      restApiName: "Import Service",
      deployOptions: { stageName: "dev" },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    const importResource = api.root.addResource("import");
    importResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(importProductsFile),
      {
        requestParameters: {
          "method.request.querystring.name": true,
        },
      }
    );

    new cdk.CfnOutput(this, "ImportApiUrl", {
      value: api.url,
      description: "Import Service API URL",
    });
    new cdk.CfnOutput(this, "ImportBucketName", {
      value: importBucket.bucketName,
      description: "Import S3 bucket name",
    });
  }
}

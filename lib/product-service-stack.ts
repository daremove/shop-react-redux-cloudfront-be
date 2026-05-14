import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as path from "path";
import { Construct } from "constructs";
import { NodejsFunction, NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

const PRODUCTS_TABLE_NAME = "products";
const STOCKS_TABLE_NAME = "stocks";
const CATALOG_ITEMS_QUEUE_NAME = "catalogItemsQueue";
const CREATE_PRODUCT_TOPIC_NAME = "createProductTopic";
const SUBSCRIBER_EMAIL = "daremove1@gmail.com";

export class ProductServiceStack extends cdk.Stack {
  public readonly catalogItemsQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const productsTable = new dynamodb.Table(this, "ProductsTable", {
      tableName: PRODUCTS_TABLE_NAME,
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const stocksTable = new dynamodb.Table(this, "StocksTable", {
      tableName: STOCKS_TABLE_NAME,
      partitionKey: { name: "product_id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const catalogItemsQueue = new sqs.Queue(this, "CatalogItemsQueue", {
      queueName: CATALOG_ITEMS_QUEUE_NAME,
      visibilityTimeout: cdk.Duration.seconds(60),
    });
    this.catalogItemsQueue = catalogItemsQueue;

    const createProductTopic = new sns.Topic(this, "CreateProductTopic", {
      topicName: CREATE_PRODUCT_TOPIC_NAME,
      displayName: "Create Product Notifications",
    });
    createProductTopic.addSubscription(
      new snsSubscriptions.EmailSubscription(SUBSCRIBER_EMAIL)
    );

    const commonLambdaProps: Omit<NodejsFunctionProps, "entry" | "functionName"> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      environment: {
        PRODUCTS_TABLE_NAME,
        STOCKS_TABLE_NAME,
      },
    };

    const getProductsList = new NodejsFunction(this, "GetProductsList", {
      ...commonLambdaProps,
      entry: path.join(__dirname, "..", "src", "services", "product-service", "getProductsList.ts"),
      functionName: "getProductsList",
    });

    const getProductsById = new NodejsFunction(this, "GetProductsById", {
      ...commonLambdaProps,
      entry: path.join(__dirname, "..", "src", "services", "product-service", "getProductsById.ts"),
      functionName: "getProductsById",
    });

    const createProduct = new NodejsFunction(this, "CreateProduct", {
      ...commonLambdaProps,
      entry: path.join(__dirname, "..", "src", "services", "product-service", "createProduct.ts"),
      functionName: "createProduct",
    });

    const catalogBatchProcess = new NodejsFunction(this, "CatalogBatchProcess", {
      ...commonLambdaProps,
      entry: path.join(
        __dirname,
        "..",
        "src",
        "services",
        "product-service",
        "catalogBatchProcess.ts"
      ),
      functionName: "catalogBatchProcess",
      timeout: cdk.Duration.seconds(30),
      environment: {
        ...commonLambdaProps.environment,
        SNS_TOPIC_ARN: createProductTopic.topicArn,
      },
    });

    catalogBatchProcess.addEventSource(
      new SqsEventSource(catalogItemsQueue, {
        batchSize: 5,
        reportBatchItemFailures: true,
      })
    );

    productsTable.grantReadData(getProductsList);
    stocksTable.grantReadData(getProductsList);
    productsTable.grantReadData(getProductsById);
    stocksTable.grantReadData(getProductsById);
    productsTable.grantWriteData(createProduct);
    stocksTable.grantWriteData(createProduct);
    productsTable.grantWriteData(catalogBatchProcess);
    stocksTable.grantWriteData(catalogBatchProcess);

    catalogItemsQueue.grantConsumeMessages(catalogBatchProcess);
    createProductTopic.grantPublish(catalogBatchProcess);

    const api = new apigateway.RestApi(this, "ProductServiceApi", {
      restApiName: "Product Service",
      deployOptions: {
        stageName: "dev",
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const productsResource = api.root.addResource("products");
    productsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getProductsList)
    );
    productsResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(createProduct)
    );

    const productByIdResource = productsResource.addResource("{productId}");
    productByIdResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getProductsById)
    );

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "Product Service API URL",
    });
    new cdk.CfnOutput(this, "CatalogItemsQueueUrl", {
      value: catalogItemsQueue.queueUrl,
      description: "Catalog Items SQS Queue URL",
    });
    new cdk.CfnOutput(this, "CatalogItemsQueueArn", {
      value: catalogItemsQueue.queueArn,
      description: "Catalog Items SQS Queue ARN",
    });
    new cdk.CfnOutput(this, "CreateProductTopicArn", {
      value: createProductTopic.topicArn,
      description: "Create Product SNS Topic ARN",
    });
  }
}

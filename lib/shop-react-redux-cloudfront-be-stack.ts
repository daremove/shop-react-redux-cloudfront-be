import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as path from "path";
import { Construct } from "constructs";
import { NodejsFunction, NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs";

const PRODUCTS_TABLE_NAME = "products";
const STOCKS_TABLE_NAME = "stocks";

export class ShopReactReduxCloudfrontBeStack extends cdk.Stack {
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

    productsTable.grantReadData(getProductsList);
    stocksTable.grantReadData(getProductsList);
    productsTable.grantReadData(getProductsById);
    stocksTable.grantReadData(getProductsById);
    productsTable.grantWriteData(createProduct);
    stocksTable.grantWriteData(createProduct);

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
  }
}

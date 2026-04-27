import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  docClient,
  PRODUCTS_TABLE,
  STOCKS_TABLE,
  corsHeaders,
} from "./lib/dynamo";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const productId = event.pathParameters?.productId;

  if (!productId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: "productId is required" }),
    };
  }

  try {
    const [productRes, stockRes] = await Promise.all([
      docClient.send(
        new GetCommand({ TableName: PRODUCTS_TABLE, Key: { id: productId } })
      ),
      docClient.send(
        new GetCommand({
          TableName: STOCKS_TABLE,
          Key: { product_id: productId },
        })
      ),
    ]);

    if (!productRes.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ message: "Product not found" }),
      };
    }

    const joined = {
      ...productRes.Item,
      count: stockRes.Item?.count ?? 0,
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(joined),
    };
  } catch (err) {
    console.error("getProductsById error", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};

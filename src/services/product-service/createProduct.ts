import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import {
  docClient,
  PRODUCTS_TABLE,
  STOCKS_TABLE,
  corsHeaders,
} from "./lib/dynamo";

interface CreateProductBody {
  title?: unknown;
  description?: unknown;
  price?: unknown;
  count?: unknown;
}

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;
const isNonNegativeNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: "Request body is required" }),
      };
    }

    let parsed: CreateProductBody;
    try {
      parsed = JSON.parse(event.body);
    } catch {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: "Invalid JSON" }),
      };
    }

    const { title, description, price, count } = parsed;

    if (
      !isNonEmptyString(title) ||
      !isNonNegativeNumber(price) ||
      (description !== undefined && typeof description !== "string") ||
      (count !== undefined && !isNonNegativeNumber(count))
    ) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: "Invalid product payload" }),
      };
    }

    const id = randomUUID();
    const product = {
      id,
      title: title.trim(),
      description: typeof description === "string" ? description : "",
      price,
    };
    const stock = {
      product_id: id,
      count: typeof count === "number" ? count : 0,
    };

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: PRODUCTS_TABLE, Item: product } },
          { Put: { TableName: STOCKS_TABLE, Item: stock } },
        ],
      })
    );

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({ ...product, count: stock.count }),
    };
  } catch (err) {
    console.error("createProduct error", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};

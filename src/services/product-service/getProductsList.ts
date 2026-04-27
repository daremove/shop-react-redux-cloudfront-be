import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import {
  docClient,
  PRODUCTS_TABLE,
  STOCKS_TABLE,
  corsHeaders,
} from "./lib/dynamo";

interface ProductRow {
  id: string;
  title: string;
  description: string;
  price: number;
}

interface StockRow {
  product_id: string;
  count: number;
}

export const handler = async (
  _event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const [productsRes, stocksRes] = await Promise.all([
      docClient.send(new ScanCommand({ TableName: PRODUCTS_TABLE })),
      docClient.send(new ScanCommand({ TableName: STOCKS_TABLE })),
    ]);

    const products = (productsRes.Items ?? []) as ProductRow[];
    const stocks = (stocksRes.Items ?? []) as StockRow[];

    const stockByProduct = new Map(stocks.map((s) => [s.product_id, s.count]));
    const joined = products.map((p) => ({
      ...p,
      count: stockByProduct.get(p.id) ?? 0,
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(joined),
    };
  } catch (err) {
    console.error("getProductsList error", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};

import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { products } from "./mocks/products";

export const handler = async (
  _event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
    },
    body: JSON.stringify(products),
  };
};

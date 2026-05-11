import { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from "aws-lambda";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { randomUUID } from "crypto";
import {
  docClient,
  PRODUCTS_TABLE,
  STOCKS_TABLE,
} from "./lib/dynamo";

const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN as string;
const snsClient = new SNSClient({});

interface IncomingProduct {
  title?: unknown;
  description?: unknown;
  price?: unknown;
  count?: unknown;
}

interface CreatedProduct {
  id: string;
  title: string;
  description: string;
  price: number;
  count: number;
}

const toNumber = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const buildProduct = (raw: IncomingProduct): CreatedProduct => {
  const { title, description, price, count } = raw;

  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error("Invalid product: 'title' is required");
  }
  const priceNum = toNumber(price);
  if (priceNum === null || priceNum < 0) {
    throw new Error("Invalid product: 'price' must be a non-negative number");
  }
  const countNum = count === undefined ? 0 : toNumber(count);
  if (countNum === null || countNum < 0) {
    throw new Error("Invalid product: 'count' must be a non-negative number");
  }

  return {
    id: randomUUID(),
    title: title.trim(),
    description: typeof description === "string" ? description : "",
    price: priceNum,
    count: countNum,
  };
};

const persistProduct = async (p: CreatedProduct): Promise<void> => {
  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: PRODUCTS_TABLE,
            Item: {
              id: p.id,
              title: p.title,
              description: p.description,
              price: p.price,
            },
          },
        },
        {
          Put: {
            TableName: STOCKS_TABLE,
            Item: { product_id: p.id, count: p.count },
          },
        },
      ],
    })
  );
};

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchItemFailure[] = [];
  const created: CreatedProduct[] = [];

  for (const record of event.Records) {
    try {
      const parsed = JSON.parse(record.body) as IncomingProduct;
      const product = buildProduct(parsed);
      await persistProduct(product);
      created.push(product);
      console.log(`Created product ${product.id} (${product.title})`);
    } catch (err) {
      console.error(
        `Failed to process SQS message ${record.messageId}`,
        err
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  if (created.length > 0 && SNS_TOPIC_ARN) {
    try {
      await snsClient.send(
        new PublishCommand({
          TopicArn: SNS_TOPIC_ARN,
          Subject: `Products created: ${created.length}`,
          Message: JSON.stringify(
            {
              createdCount: created.length,
              products: created,
            },
            null,
            2
          ),
          MessageAttributes: {
            createdCount: {
              DataType: "Number",
              StringValue: String(created.length),
            },
          },
        })
      );
      console.log(`Published SNS notification for ${created.length} product(s)`);
    } catch (err) {
      console.error("Failed to publish SNS notification", err);
    }
  }

  return { batchItemFailures };
};

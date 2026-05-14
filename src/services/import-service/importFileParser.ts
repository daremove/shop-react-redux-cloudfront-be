import { S3Event } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { Readable } from "stream";
import csvParser = require("csv-parser");

const s3 = new S3Client({});
const sqs = new SQSClient({});

const QUEUE_URL = process.env.CATALOG_ITEMS_QUEUE_URL as string;

const sendRowToQueue = async (
  row: Record<string, unknown>,
  key: string
): Promise<void> => {
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(row),
      MessageAttributes: {
        sourceKey: { DataType: "String", StringValue: key },
      },
    })
  );
};

const streamRowsToQueue = (stream: Readable, key: string): Promise<number> =>
  new Promise((resolve, reject) => {
    let total = 0;
    const pending: Promise<void>[] = [];

    stream
      .pipe(csvParser())
      .on("data", (row: Record<string, unknown>) => {
        total += 1;
        pending.push(sendRowToQueue(row, key));
      })
      .on("end", () => {
        Promise.all(pending)
          .then(() => resolve(total))
          .catch(reject);
      })
      .on("error", (err) => reject(err));
  });

export const handler = async (event: S3Event): Promise<void> => {
  if (!QUEUE_URL) {
    throw new Error("CATALOG_ITEMS_QUEUE_URL env variable is not set");
  }

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    console.log(`Processing s3://${bucket}/${key}`);

    try {
      const response = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      );
      if (!response.Body) {
        console.warn(`No body for object ${key}`);
        continue;
      }
      const total = await streamRowsToQueue(response.Body as Readable, key);
      console.log(`Forwarded ${total} record(s) from ${key} to SQS`);
    } catch (err) {
      console.error(`Failed to parse ${key}`, err);
      throw err;
    }
  }
};

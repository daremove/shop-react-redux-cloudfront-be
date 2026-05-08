import { S3Event } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import csvParser = require("csv-parser");

const s3 = new S3Client({});

const parseCsv = (stream: Readable, key: string): Promise<number> =>
  new Promise((resolve, reject) => {
    let count = 0;
    stream
      .pipe(csvParser())
      .on("data", (row: Record<string, unknown>) => {
        count += 1;
        console.log(`[${key}] record:`, JSON.stringify(row));
      })
      .on("end", () => resolve(count))
      .on("error", (err) => reject(err));
  });

export const handler = async (event: S3Event): Promise<void> => {
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
      const total = await parseCsv(response.Body as Readable, key);
      console.log(`Finished parsing ${key}, ${total} record(s) processed`);
    } catch (err) {
      console.error(`Failed to parse ${key}`, err);
      throw err;
    }
  }
};

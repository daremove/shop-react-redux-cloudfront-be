import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({});
const BUCKET = process.env.IMPORT_BUCKET_NAME as string;
const FOLDER = process.env.UPLOADED_FOLDER ?? "uploaded";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const isCsvFileName = (name: string): boolean =>
  name.length > 0 && /^[\w\-. ]+\.csv$/i.test(name);

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const fileName = event.queryStringParameters?.name;
    if (!fileName || !isCsvFileName(fileName)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          message: "Query parameter 'name' must be a valid .csv file name",
        }),
      };
    }

    const key = `${FOLDER}/${fileName}`;
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 60 });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(url),
    };
  } catch (err) {
    console.error("importProductsFile error", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};

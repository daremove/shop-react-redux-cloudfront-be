import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE_NAME ?? "products";
const STOCKS_TABLE = process.env.STOCKS_TABLE_NAME ?? "stocks";

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface SeedItem {
  title: string;
  description: string;
  price: number;
  count: number;
}

const seed: SeedItem[] = [
  { title: "ProductOne", description: "Short Product Description1", price: 24, count: 1 },
  { title: "ProductTitle", description: "Short Product Description2", price: 15, count: 2 },
  { title: "Product", description: "Short Product Description3", price: 23, count: 3 },
  { title: "ProductTest", description: "Short Product Description4", price: 15, count: 4 },
  { title: "Product2", description: "Short Product Description5", price: 23, count: 5 },
  { title: "ProductName", description: "Short Product Description6", price: 15, count: 6 },
];

async function main() {
  const products = seed.map((s) => ({
    id: randomUUID(),
    title: s.title,
    description: s.description,
    price: s.price,
  }));
  const stocks = products.map((p, i) => ({
    product_id: p.id,
    count: seed[i].count,
  }));

  await docClient.send(
    new BatchWriteCommand({
      RequestItems: {
        [PRODUCTS_TABLE]: products.map((Item) => ({ PutRequest: { Item } })),
      },
    })
  );

  await docClient.send(
    new BatchWriteCommand({
      RequestItems: {
        [STOCKS_TABLE]: stocks.map((Item) => ({ PutRequest: { Item } })),
      },
    })
  );

  console.log(`Seeded ${products.length} products into "${PRODUCTS_TABLE}"`);
  console.log(`Seeded ${stocks.length} stock rows into "${STOCKS_TABLE}"`);
  console.table(products.map((p, i) => ({ ...p, count: stocks[i].count })));
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});

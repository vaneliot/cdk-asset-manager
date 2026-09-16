// https://docs.aws.amazon.com/lambda/latest/dg/with-ddb.html
// https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/programming-with-javascript.html
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

export const docClient = DynamoDBDocumentClient.from(new DynamoDBClient());
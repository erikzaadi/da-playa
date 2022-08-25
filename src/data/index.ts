import {
  DynamoDBClient,
  CreateTableCommand, CreateTableCommandInput, ScalarAttributeType,
} from '@aws-sdk/client-dynamodb'
import {
  ScanCommand, ScanCommandInput,
  GetCommand, PutCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb'

import { v4 as uuidv4 } from 'uuid'

export type DynamoTableModel = {
  tableName: string
  primaryKey: string
  rangeKey: string
  schema: Record<string, ScalarAttributeType>
}

export type InitParams = {
  model: DynamoTableModel
  dynamoDBRegion?: string
  dynamoDbUri?: string
}

export type GetParams = {
  filterExpression: string
  filterAttributeValues: Record<string, any>
  filterAttributeNames: Record<string, string>
}

export type CreateParams = any

export type UpdateParams = Partial<{
  id: string
}> & Record<string, any>

export type IData<TModel> = {
  get: (getParams: GetParams) => Promise<Array<TModel>>
  set: (updateParams: UpdateParams) => Promise<TModel>
  create: (createParams: CreateParams) => Promise<TModel>
  init: () => Promise<void>
}

export const Data = <TModel>({
  model,
  dynamoDBRegion,
  dynamoDbUri,
}: InitParams): IData<TModel> => {
  const client = new DynamoDBClient({ region: dynamoDBRegion, endpoint: dynamoDbUri })
  const docClient = DynamoDBDocumentClient.from(client)

  const setAndGet = async (params: CreateParams): Promise<TModel> => {
    const item = {
      ...params,
      ...{
        [model.primaryKey]: params[model.primaryKey] || uuidv4(),
        HashKey: model.primaryKey,
      },
    }

    const input = {
      TableName: model.tableName,
      Item: item,
    }

    await docClient.send(new PutCommand(input))

    const getItemInput = {
      TableName: model.tableName,
      Key: {
        [model.primaryKey]: item[model.primaryKey],
        [model.rangeKey]: item[model.rangeKey],
      },
    }

    const getItemResult = await docClient.send(
      new GetCommand(getItemInput)
    )

    return getItemResult.Item as unknown as TModel
  }

  return {
    get: async ({
      filterExpression,
      filterAttributeNames,
      filterAttributeValues,
    }) => {
      const input: ScanCommandInput = {
        FilterExpression: filterExpression,
        ExpressionAttributeNames: filterAttributeNames,
        ExpressionAttributeValues: filterAttributeValues,
        TableName: model.tableName,
      }

      const command = new ScanCommand(input)

      const result = await client.send(command)

      return (result.Items || []) as unknown as Array<TModel>
    },
    set: setAndGet,
    create: setAndGet,
    init: async () => {
      const input: CreateTableCommandInput = {
        AttributeDefinitions: Object.entries(model.schema).map(([attrName, attrType]) => ({
          AttributeName: attrName,
          AttributeType: attrType,
        })),
        KeySchema: [
          {
            AttributeName: model.primaryKey,
            KeyType: 'HASH',
          },
          {
            AttributeName: model.rangeKey,
            KeyType: 'RANGE',
          },
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1,
        },
        TableName: model.tableName,
        StreamSpecification: {
          StreamEnabled: false,
        },
      }
      try {
        await client.send(new CreateTableCommand(input))
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('failed to create da playa tables', e)
        throw e
      }
    },
  }
}

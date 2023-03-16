import dynamo from 'dynamodb'

export type ModelDetails<TModel> = {
  Model: dynamo.DefineConfig<TModel>
  ModelName: string
}

export type InitParams<TModel> = {
  model: dynamo.DefineConfig<TModel>
  modelName: string
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
  modelName,
  dynamoDBRegion,
  dynamoDbUri,
}: InitParams<TModel>): IData<TModel> => {
  if (dynamoDBRegion || dynamoDbUri) {
    dynamo.AWS.config.update({
      ...(dynamoDBRegion
        ? {
          region: dynamoDBRegion,
        }
        : {}),
      ...(dynamoDbUri
        ? {
          endpoint: dynamoDbUri,
        }
        : {}),
    })
  }
  const Model = dynamo.define(modelName, model)
  return {
    get: ({
      filterExpression,
      filterAttributeNames,
      filterAttributeValues,
    }) => new Promise<Array<TModel>>((resolve, reject) => {
      Model.scan()
        .filterExpression(filterExpression)
        .expressionAttributeValues(filterAttributeValues)
        .expressionAttributeNames(filterAttributeNames)
        .exec((err, result) => {
          if (err) {
            reject(err)
          } else {
            resolve(result.Items.map((x: any) => x.attrs) as TModel[])
          }
        })
    }),
    set: updateParams => new Promise((resolve, reject) => {
      Model.update(
        updateParams,
        (err, result) => {
          if (err) {
            reject(err)
          } else {
            resolve(result.attrs as TModel)
          }
        },
      )
    }),
    create: async createParams => {
      const newItem = new Model(createParams)
      const created = await newItem.save()
      return created.attrs as TModel
    },
    init: async () => {
      try {
        await dynamo.createTables()
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('failed to create da playa tables', e)
        throw e
      }
    },
  }
}

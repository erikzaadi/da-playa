import dynamo from 'dynamodb'
import Joi from 'joi'
import { Data, ModelDetails } from '../data'

const TTL = 20 * 60 * 1000

export const ModelName = 'lock'

export type Lock = {
  id: string
  createdAt: Date
  updatedAt?: Date
  user: string
  env: string
  active: boolean
  uberlock: boolean
  meta: string
}

export type LockRejected = {
  currentLock: Lock
}

export type LockNotActiveByUser = {
  notLockedBy: string
}

export type LockInputArgs = {
  user: string
  env: string
  meta?: string
  uberlock?: boolean
}

export type ILock = {
  lock: (args: LockInputArgs) => Promise<Lock | LockRejected>
  release: (args: LockInputArgs) => Promise<Lock | LockNotActiveByUser | LockRejected>
  locks: (env: string, user?: string) => Promise<Lock[]>
}

export type LockOptionArgs = {
  dynamoDBRegion?: string
  dynamoDbUri?: string
}

const locksDynamoDbModel: dynamo.DefineConfig<Lock> = {
  hashKey: 'id',
  rangeKey: 'env',
  timestamps: false,
  schema: {
    user: Joi.string().required(),
    id: dynamo.types.uuid(),
    env: Joi.string().required(),
    active: Joi.boolean(),
    started: Joi.number().required(),
    ended: Joi.number(),
    uberlock: Joi.boolean(),
    meta: Joi.string(),
  },
  tableName: 'DaPlayaLocks',
}

export const LockModelDetails: ModelDetails<Lock> = {
  Model: locksDynamoDbModel,
  ModelName,
}

export const Locker = async ({
  dynamoDBRegion,
  dynamoDbUri,
}: LockOptionArgs): Promise<ILock> => {
  const LocksDB = Data<Lock>({
    model: locksDynamoDbModel,
    modelName: ModelName,
    dynamoDBRegion,
    dynamoDbUri,
  })

  const getActiveLocks = (env: string, user?: string): Promise<Lock[]> => {
    const ttl = new Date().getTime() - TTL
    const userFilterString = user ? ' AND #user = :user' : ''
    const filterEnvExpression = '#env = :env'
    const filterActiveOrUber = '(#started > :ttl OR #uberlock = :true) AND #active = :true'
    const filterExpression = `${filterEnvExpression} AND (${filterActiveOrUber})${userFilterString}`
    const filterAttributeValues = {
      ':true': true,
      ':env': env,
      ':ttl': ttl,
      ...(user
        ? {
          ':user': user,
        }
        : {}),
    }
    const filterAttributeNames = {
      '#env': 'env',
      '#active': 'active',
      '#started': 'started',
      '#uberlock': 'uberlock',
      ...(user
        ? {
          '#user': 'user',
        }
        : {}),
    }

    return LocksDB.get({
      filterExpression,
      filterAttributeValues,
      filterAttributeNames,
    })
  }

  const updatePromiseByUser = async (
    env: string,
    user: string,
    uberlock = false,
  ): Promise<Lock | LockNotActiveByUser | LockRejected> => {
    const currentLock = await getActiveLocks(env, user)
    if (!currentLock.length) {
      return {
        notLockedBy: user.toLowerCase(),
      }
    }
    if (currentLock[0].uberlock && !uberlock) {
      return {
        currentLock: currentLock[0],
      }
    }
    return LocksDB.set(
      {
        ...currentLock[0],
        active: false,
        ended: new Date().getTime(),
      }
    )
  }

  const createLock = async ({
    user, env, meta, uberlock,
  }: LockInputArgs): Promise<Lock> => LocksDB.create({
    user: user.toLowerCase(),
    env: env.toLowerCase(),
    active: true,
    started: new Date().getTime(),
    meta,
    uberlock,
  })

  return {
    lock: async ({ user, env, meta, uberlock = false }) => {
      const activeLocks = await getActiveLocks(env)
      const existingUberLock = activeLocks.find(x => x.uberlock)

      if (existingUberLock) {
        return existingUberLock.user !== user ? {
          // LockRejected due to other user uberlocking
          currentLock: existingUberLock,
        } : existingUberLock
      }

      if (uberlock) {
        return createLock({ user, env, meta, uberlock })
      }

      const currentUserLock = activeLocks.find(x => x.user === user)
      if (currentUserLock) {
        return currentUserLock
      }

      if (!activeLocks.length) {
        return createLock({ user, env, meta, uberlock })
      }

      return {
        currentLock: activeLocks[0],
      }
    },
    release: async ({ env, user, uberlock }) => updatePromiseByUser(env, user, uberlock),
    locks: async (env: string, user?: string) => getActiveLocks(env, user),
  }
}

import dynamo from 'dynamodb'
import Joi from 'joi'

const TTL = 20 * 60 * 1000

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
  locks: (env: string) => Promise<Lock[]>
  init: () => Promise<void>
}

export type LockOptionArgs = {
  dynamoDBRegion?: string
  dynamoDbUri?: string
}

const dynamoDbModel: dynamo.DefineConfig = {
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

export const Locker = async ({ dynamoDBRegion, dynamoDbUri }: LockOptionArgs): Promise<ILock> => {
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
  const LockDb = dynamo.define('Lock', dynamoDbModel)

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

    return new Promise<Lock[]>((resolve, reject) => {
      LockDb.scan()
        .filterExpression(filterExpression)
        .expressionAttributeValues(filterAttributeValues)
        .expressionAttributeNames(filterAttributeNames)
        .exec((err, result) => {
          if (err) {
            reject(err)
          } else {
            resolve(result.Items.map((x: any) => x.attrs) as Lock[])
          }
        })
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
    return new Promise((resolve, reject) => {
      LockDb.update(
        {
          id: currentLock[0].id,
          env,
          active: false,
          ended: new Date().getTime(),
        },
        (err, result) => {
          if (err) {
            reject(err)
          } else {
            resolve(result.attrs as Lock)
          }
        },
      )
    })
  }

  const createLock = async ({ user, env, meta, uberlock }: LockInputArgs): Promise<Lock> => {
    const newLock = new LockDb({
      user: user.toLowerCase(),
      env: env.toLowerCase(),
      active: true,
      started: new Date().getTime(),
      meta,
      uberlock,
    })
    const created = await newLock.save()
    return created.attrs as Lock
  }

  return {
    lock: async ({ user, env, meta, uberlock = false }) => {
      if (uberlock) {
        return createLock({ user, env, meta, uberlock })
      }
      const activeLocks = await getActiveLocks(env)
      const currentUserLock = activeLocks.find(x => x.user === user)
      if (currentUserLock) {
        return currentUserLock
      }
      if (!activeLocks.length) {
        return createLock({ user, env, meta, uberlock })
      }
      return {
        currentLock: activeLocks[0] as Lock,
      }
    },
    release: async ({ env, user, uberlock }) => updatePromiseByUser(env, user, uberlock),
    locks: async (env: string, user?: string) => getActiveLocks(env, user),
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

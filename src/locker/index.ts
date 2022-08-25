import { Data, DynamoTableModel } from '../data'

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
  locks: (env: string, user?: string) => Promise<Lock[]>
}

export type LockOptionArgs = {
  dynamoDBRegion?: string
  dynamoDbUri?: string
}

const locksDynamoDbModel: DynamoTableModel = {
  primaryKey: 'id',
  rangeKey: 'env',
  schema: {
    user: 'S',
    id: 'S',
    env: 'S',
    active: 'B',
    started: 'N',
    ended: 'N',
    uberlock: 'B',
    meta: 'S',
  },
  tableName: 'DaPlayaLocks',
}

export const Locker = async ({
  dynamoDBRegion,
  dynamoDbUri,
}: LockOptionArgs): Promise<ILock> => {
  const LocksDB = Data<Lock>({
    model: locksDynamoDbModel,
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
        id: currentLock[0].id,
        env,
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
        currentLock: activeLocks[0],
      }
    },
    release: async ({ env, user, uberlock }) => updatePromiseByUser(env, user, uberlock),
    locks: async (env: string, user?: string) => getActiveLocks(env, user),
  }
}

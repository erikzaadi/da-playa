import { Data, DynamoTableModel } from '../data'

const RELEVANT_JOBS_TIMESPAN = 50 * 60 * 1000

export type RunningJob = {
  id: string
  started: Date
  ended?: Date
  skipped: boolean
  jobname: string
  version: string
  user: string
}

export type StartJobArgs = {
  jobname: string
  version: string
  user: string
}

export type EndJobArgs = StartJobArgs & {
  skipped?: boolean
  ttl?: number
}

export type GetRunningJobsArgs = {
  jobname: string
  ttl?: number
}

export type GetRunningJobArgs = {
  jobname: string
  version: string
  ttl?: number
}

export type IRunningJobs = {
  startJob: (args: StartJobArgs) => Promise<RunningJob>
  endJob: (args: EndJobArgs) => Promise<RunningJob | null>
  getRunningJobs: (args: GetRunningJobsArgs) => Promise<Array<RunningJob>>
  getSkippedJobs: (args: GetRunningJobsArgs) => Promise<Array<RunningJob>>
  getJob: (args: GetRunningJobArgs) => Promise<RunningJob | undefined>
}

export type RunningJobsOptionArgs = {
  dynamoDBRegion?: string
  dynamoDbUri?: string
}

const runningJobsDynamoDbModel: DynamoTableModel = {
  primaryKey: 'id',
  rangeKey: 'jobname',
  schema: {
    user: 'S',
    id: 'S',
    version: 'S',
    started: 'N',
    skipped: 'B',
    ended: 'N',
    jobname: 'S',
  },
  tableName: 'DaPlayaRunningJobs',
}

export const RunningJobs = async ({
  dynamoDBRegion, dynamoDbUri,
}: RunningJobsOptionArgs): Promise<IRunningJobs> => {
  const RunningJobsDb = Data<RunningJob>({
    model: runningJobsDynamoDbModel,
    dynamoDBRegion,
    dynamoDbUri,
  })
  const getJobs = (
    jobname: string,
    ttl = RELEVANT_JOBS_TIMESPAN,
    skipped = false
  ): Promise<RunningJob[]> => {
    const timeframe = new Date().getTime() - ttl
    const filterJobNameExpression = '#jobname = :jobname'
    const filterActive = '#started > :ttl'
    const filterAdditional = skipped ? '#skipped = :skipped' : 'attribute_not_exists(ended)'
    const filterExpression = `(${filterJobNameExpression}) AND (${filterActive} AND ${filterAdditional})`
    const filterAttributeValues = {
      ':jobname': jobname,
      ':ttl': timeframe,
      ...(skipped ? {
        ':skipped': true,
      } : {}),
    }
    const filterAttributeNames = {
      '#started': 'started',
      '#jobname': 'jobname',
      ...(skipped ? {
        '#skipped': 'skipped',
      } : {}),
    }

    return RunningJobsDb.get({
      filterExpression,
      filterAttributeValues,
      filterAttributeNames,
    })
  }

  const getJob = async ({
    jobname,
    version,
  }: GetRunningJobArgs): Promise<RunningJob | undefined> => {
    const filterExpression = '#jobname = :jobname AND #version = :version'
    const filterAttributeValues = {
      ':jobname': jobname,
      ':version': version,
    }
    const filterAttributeNames = {
      '#jobname': 'jobname',
      '#version': 'version',
    }

    const result = await RunningJobsDb.get({
      filterExpression,
      filterAttributeValues,
      filterAttributeNames,
    })

    return result?.[0]
  }

  return {
    getJob,
    startJob: async ({ user, version, jobname }) =>
      RunningJobsDb.create({
        user: user.toLowerCase(),
        started: new Date().getTime(),
        version,
        jobname,
        skipped: false,
      }),
    getRunningJobs: ({ ttl, jobname }) => getJobs(jobname, ttl),
    getSkippedJobs: ({ ttl, jobname }) => getJobs(jobname, ttl, true),
    endJob: async ({ jobname, version, user, skipped = false }) => {
      const relevantRunningJobs = await RunningJobsDb.get({
        filterExpression: '(#jobname = :jobname) AND (#version = :version) AND (#user = :user)',
        filterAttributeValues: {
          ':jobname': jobname,
          ':version': version,
          ':user': user,
        },
        filterAttributeNames: {
          '#jobname': 'jobname',
          '#version': 'version',
          '#user': 'user',
        },
      })
      if (!relevantRunningJobs || !relevantRunningJobs.length) {
        return null
      }
      return RunningJobsDb.set(
        {
          ...relevantRunningJobs[0],
          skipped,
          ended: new Date().getTime(),
        }
      )
    },
  }
}

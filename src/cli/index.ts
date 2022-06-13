import { Command } from 'commander'
import chalk from 'chalk'
import { Locker, LockRejected } from '../locker'
import { RunningJobs } from '../running'
import { Tag, Hash } from '../version'

const { log } = console

const prettify = {
  user: chalk.green,
  env: chalk.blue,
  misc: chalk.gray,
  error: chalk.red,
}

const UBERLOCK_UNIVERSAL_SIGN = '(ノ≥∇≤)ノ'

const RETRY_SECONDS = 5

const program = new Command()

program.version(`${Tag}-${Hash}`)

const {
  DAPLAYA_AWS_REGION: envDynamoDBRegion,
} = process.env

program
  .command('start-job')
  .description('start a job')
  .requiredOption('--jobname <jobname>', 'Name')
  .requiredOption('--user <user>', 'Trigger user')
  .requiredOption('--gitversion <version>', 'Version')
  .option(
    '--dynamoDBRegion <dynamoDBRegion>',
    'DynamoDB Region (Optional, Taken from DAPLAYA_AWS_REGION if set)',
    envDynamoDBRegion,
  )
  .action(async ({ jobname, user, gitversion, ...rest }) => {
    const runningJobs = await RunningJobs(rest)
    const created = await runningJobs.startJob({ user, version: gitversion, jobname })

    log(
      `Created job ${prettify.env(
        created.jobname,
      )} for ${prettify.user(created.user)} with version ${prettify.misc(created.version)}`,
    )
  })

program
  .command('end-job')
  .description('end a job')
  .requiredOption('--jobname <jobname>', 'Name')
  .requiredOption('--user <user>', 'Trigger user')
  .requiredOption('--gitversion <version>', 'Version')
  .option(
    '--dynamoDBRegion <dynamoDBRegion>',
    'DynamoDB Region (Optional, Taken from DAPLAYA_AWS_REGION if set)',
    envDynamoDBRegion,
  )
  .option('--skipped', 'Set job as skipped')
  .action(async ({ jobname, user, gitversion, skipped, ...rest }) => {
    const runningJobs = await RunningJobs(rest)
    const ended = await runningJobs.endJob({ user, version: gitversion, jobname, skipped })

    if (!ended) {
      log(
        'Did not find any job to end!'
      )
    } else {
      log(
        `Ended job ${prettify.env(
          ended.jobname,
        )} for ${prettify.user(ended.user)} with version ${prettify.misc(ended.version)}${skipped
          ? ` and marked as ${prettify.misc('skipped')}`
          : ''
        }`,
      )
    }
  })

const getJobs = async ({
  jobname,
  ttl,
  dynamoDBRegion,
  skipped = false,
  json = false,
}: {
  jobname: string
  dynamoDBRegion: string
  ttl?: number
  skipped?: boolean
  json?: boolean
}): Promise<void> => {
  const runningJobs = await RunningJobs({ dynamoDBRegion })
  const listOfJobs = await runningJobs[skipped ? 'getSkippedJobs' : 'getRunningJobs']({ ttl, jobname })

  if (json) {
    log(listOfJobs)
    return
  }

  log(
    `Found ${prettify.misc(listOfJobs.length)} job${listOfJobs.length > 1 || listOfJobs.length === 0 ? 's' : ''} for ${prettify.env(
      jobname,
    )}${listOfJobs.length > 0 ? ':' : ''}`,
  )
  listOfJobs.forEach(job => {
    log(
      `User: ${prettify.user(job.user)}, Version: ${prettify.env(job.version)}`,
    )
  })
}

program
  .command('active-jobs')
  .description('Get\'s all running jobs')
  .requiredOption('--jobname <jobname>', 'Job name')
  .option(
    '--dynamoDBRegion <dynamoDBRegion>',
    'DynamoDB Region (Optional, Taken from DAPLAYA_AWS_REGION if set)',
    envDynamoDBRegion,
  )
  .option('--ttl <ttl>', 'Timeframe in minutes to lookup active jobs')
  .option('--json', 'Output raw json')
  .action(getJobs)

program
  .command('skipped-jobs')
  .description('Get\'s all skipped jobs')
  .requiredOption('--jobname <jobname>', 'Job Name')
  .option(
    '--dynamoDBRegion <dynamoDBRegion>',
    'DynamoDB Region (Optional, Taken from DAPLAYA_AWS_REGION if set)',
    envDynamoDBRegion,
  )
  .option('--ttl <ttl>', 'Timeframe in minutes to lookup active jobs')
  .option('--json', 'Output raw json')
  .action(params => getJobs({ ...params, skipped: true }))

program
  .command('lock')
  .description('Locks an environment for a user')
  .requiredOption('--user <user>', 'User to lock for')
  .requiredOption('--env <env>', 'Environment to lock')
  .option(
    '--dynamoDBRegion <dynamoDBRegion>',
    'DynamoDB Region (Optional, Taken from DAPLAYA_AWS_REGION if set)',
    envDynamoDBRegion,
  )
  .option('--uberlock', 'Lock current env until explicitly released')
  .option('--meta <meta>', 'Extra metadata to save')
  .action(async ({ user, env, uberlock, meta, ...rest }) => {
    const locker = await Locker(rest)
    const lockInterval = setInterval(async () => {
      const lockResult = await locker.lock({ user, env, uberlock, meta })
      if ('currentLock' in lockResult) {
        const { currentLock } = lockResult as LockRejected
        if (currentLock.uberlock) {
          log(
            `${prettify.env(env)} is uberlocked ${prettify.misc(
              UBERLOCK_UNIVERSAL_SIGN,
            )} by ${prettify.user(currentLock.user)}`,
          )
          process.exit(1)
        }
        log(
          `${prettify.env(env)} is currently locked by ${prettify.user(
            currentLock.user,
          )}, retrying in ${prettify.misc(RETRY_SECONDS)} seconds`,
        )
      } else {
        log(
          `${prettify.env(env)} succesfully locked for ${prettify.user(user)}${lockResult.uberlock ? ` uberlock ${prettify.misc(UBERLOCK_UNIVERSAL_SIGN)}` : ''
          }`,
        )
        clearInterval(lockInterval)
      }
    }, RETRY_SECONDS * 1000)
  })
program
  .command('release')
  .description('Releases an environment for a user')
  .requiredOption('--user <user>', 'User to release')
  .requiredOption('--env <env>', 'Environment to release')
  .option('--uberlock', 'Release even if UBERLOCKED')
  .option(
    '--dynamoDBRegion <dynamoDBRegion>',
    'DynamoDB Region (Optional, Taken from DAPLAYA_AWS_REGION if set)',
    envDynamoDBRegion,
  )
  .action(async ({ user, env, uberlock, ...rest }) => {
    const locker = await Locker(rest)
    const releaseResult = await locker.release({ user, env, uberlock })
    if ('notLockedBy' in releaseResult) {
      log(`${prettify.env(env)} was not locked...`)
    } else if ('currentLock' in releaseResult) {
      log(`${prettify.env(env)} is uberlocked ${prettify.misc(UBERLOCK_UNIVERSAL_SIGN)} by user ${prettify.user(user)}...`)
    } else {
      log(
        `Released ${prettify.env(env)} for user ${prettify.user(user)}${releaseResult.uberlock
          ? ` no longer uberlocked ${prettify.misc(UBERLOCK_UNIVERSAL_SIGN)}`
          : ''
        }`,
      )
    }
  })
program
  .command('locks')
  .description('List current locks')
  .requiredOption('--env <env>', 'Environment to release')
  .option(
    '--dynamoDBRegion <dynamoDBRegion>',
    'DynamoDB Region (Optional, Taken from DAPLAYA_AWS_REGION if set)',
    envDynamoDBRegion,
  )
  .action(async ({ env, ...rest }) => {
    const locker = await Locker(rest)
    const locks = await locker.locks(env)
    if (!locks.length) {
      log(`No locks found for ${prettify.env(env)}`)
    } else {
      log(
        `Found ${prettify.misc(locks.length)} lock${locks.length > 1 ? 's' : ''} for ${prettify.env(
          env,
        )}:`,
      )
      locks.forEach(lock => {
        log(
          `User: ${prettify.user(lock.user)}${lock.uberlock ? ` uberlock ${prettify.misc(UBERLOCK_UNIVERSAL_SIGN)}` : ''
          }${lock.meta ? ` ${prettify.misc(lock.meta)}` : ''}`,
        )
      })
    }
  })
program
  .command('init')
  .description('Creates DynamoDB Tables')
  .option(
    '--dynamoDBRegion <dynamoDBRegion>',
    'DynamoDB Region (Optional, Taken from DAPLAYA_AWS_REGION if set)',
    envDynamoDBRegion,
  )
  .action(async options => {
    const locker = await Locker(options)
    const runningJobs = await RunningJobs(options)
    try {
      await locker.init()
      await runningJobs.init()
    } catch (err) {
      log(`${prettify.error('Error:')} Unable to create DynamoDb table:\n${prettify.error(err)}`)
      process.exit(1)
    }
    log(prettify.misc('DynamoDB Tables up and working!'))
  })

export const cli = (args: string[]): void => {
  program.parse(args)
}

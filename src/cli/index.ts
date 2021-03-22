import { Command } from 'commander'
import chalk from 'chalk'
import { Locker, LockRejected } from '../locker'
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
          `${prettify.env(env)} succesfully locked for ${prettify.user(user)}${
            lockResult.uberlock ? ` uberlock ${prettify.misc(UBERLOCK_UNIVERSAL_SIGN)}` : ''
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
  .option(
    '--dynamoDBRegion <dynamoDBRegion>',
    'DynamoDB Region (Optional, Taken from DAPLAYA_AWS_REGION if set)',
    envDynamoDBRegion,
  )
  .action(async ({ user, env, ...rest }) => {
    const locker = await Locker(rest)
    const releaseResult = await locker.release({ user, env })
    if ('notLockedBy' in releaseResult) {
      log(`${prettify.env(env)} was not locked...`)
    } else {
      log(
        `Released ${prettify.env(env)} for user ${prettify.user(user)}${
          releaseResult.uberlock
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
          `User: ${prettify.user(lock.user)}${
            lock.uberlock ? ` uberlock ${prettify.misc(UBERLOCK_UNIVERSAL_SIGN)}` : ''
          }`,
        )
      })
    }
  })

program
  .command('init')
  .description('Creates DynamoDB Table')
  .option(
    '--dynamoDBRegion <dynamoDBRegion>',
    'DynamoDB Region (Optional, Taken from DAPLAYA_AWS_REGION if set)',
    envDynamoDBRegion,
  )
  .action(async options => {
    const locker = await Locker(options)
    try {
      await locker.init()
    } catch (err) {
      log(`${prettify.error('Error:')} Unable to create DynamoDb table:\n${prettify.error(err)}`)
      process.exit(1)
    }
    log(prettify.misc('DynamoDB Table up and working!'))
  })

export const cli = (args: string[]): void => {
  program.parse(args)
}

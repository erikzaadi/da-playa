import { Command } from 'commander'
import { Locker, LockRejected } from '../locker'
import { log, prettify } from './common'

const UBERLOCK_UNIVERSAL_SIGN = '(ノ≥∇≤)ノ'

const RETRY_SECONDS = 5

export const lockCommands = (
  envDynamoDBRegion?: string
): Command => {
  const program = new Command('locks')
    .description('Manage locks')

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
    .command('list')
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

  return program
}

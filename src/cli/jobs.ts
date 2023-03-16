import { Command } from 'commander'
import { RunningJobs } from '../running'
import { log, prettify } from './common'

export { RunningJobsModelDetails } from '../running'

export const jobCommands = (
  envDynamoDBRegion?: string
): Command => {
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
      log(JSON.stringify(listOfJobs))
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
  const program = new Command('jobs')
    .description('Manage running jobs')

  program
    .command('get')
    .description('get a job')
    .requiredOption('--jobname <jobname>', 'Name')
    .requiredOption('--gitversion <version>', 'Version')
    .option('--json', 'Output raw json')
    .option(
      '--dynamoDBRegion <dynamoDBRegion>',
      'DynamoDB Region (Optional, Taken from DAPLAYA_AWS_REGION if set)',
      envDynamoDBRegion,
    )
    .action(async ({ jobname, json, gitversion, ...rest }) => {
      const runningJobs = await RunningJobs(rest)
      const job = await runningJobs.getJob({ version: gitversion, jobname })

      if (!job) {
        if (json) {
          return
        }
        log(`No job found for version ${gitversion} on job ${jobname}`)
        return
      }

      if (json) {
        log(JSON.stringify(job))
        return
      }

      log(
        `Found job ${prettify.env(
          job.jobname,
        )} for ${prettify.user(job.user)} with version ${prettify.misc(job.version)}${prettify.error(job.skipped ? ' (skipped)' : '')}${prettify.user(job.ended !== undefined ? ' (ended)' : '')}`,
      )
    })

  program
    .command('start')
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
    .command('end')
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

  program
    .command('active')
    .description('Get\'s all running jobs')
    .requiredOption('--jobname <jobname>', 'Job name')
    .option(
      '--dynamoDBRegion <dynamoDBRegion>',
      'DynamoDB Region (Optional, Taken from DAPLAYA_AWS_REGION if set)',
      envDynamoDBRegion,
    )
    .option('--ttl <ttl>', 'Timeframe in milliseconds to lookup active jobs')
    .option('--json', 'Output raw json')
    .action(getJobs)

    .command('skipped')
    .description('Get\'s all skipped jobs')
    .requiredOption('--jobname <jobname>', 'Job Name')
    .option(
      '--dynamoDBRegion <dynamoDBRegion>',
      'DynamoDB Region (Optional, Taken from DAPLAYA_AWS_REGION if set)',
      envDynamoDBRegion,
    )
    .option('--ttl <ttl>', 'Timeframe in milliseconds to lookup active jobs')
    .option('--json', 'Output raw json')
    .action(params => getJobs({ ...params, skipped: true }))

  return program
}

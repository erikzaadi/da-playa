import { Command } from 'commander'
import { Tag, Hash } from '../version'
import { Data } from '../data'
import { jobCommands } from './jobs'
import { lockCommands } from './locks'
import { log, prettify } from './common'

const program = new Command('da-playa')
  .description('Your friendly build and deploy helper')

program.version(`${Tag}-${Hash}`)

const {
  DAPLAYA_AWS_REGION: envDynamoDBRegion,
} = process.env

program.addCommand(jobCommands(envDynamoDBRegion))
program.addCommand(lockCommands(envDynamoDBRegion))

program
  .command('init')
  .description('Creates DynamoDB Tables')
  .option(
    '--dynamoDBRegion <dynamoDBRegion>',
    'DynamoDB Region (Optional, Taken from DAPLAYA_AWS_REGION if set)',
    envDynamoDBRegion,
  )
  .action(async options => {
    const data = Data(options)
    try {
      await data.init()
    } catch (err) {
      log(`${prettify.error('Error:')} Unable to create DynamoDb table:\n${prettify.error(err)}`)
      process.exit(1)
    }
    log(prettify.misc('DynamoDB Tables up and working!'))
  })

export const cli = (args: string[]): void => {
  program.parse(args)
}

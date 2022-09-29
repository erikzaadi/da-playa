import chalk from 'chalk'

export const { log } = console

export const prettify = {
  user: chalk.green,
  env: chalk.blue,
  misc: chalk.gray,
  error: chalk.red,
}

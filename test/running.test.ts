import {
  RunningJobs, IRunningJobs,
} from '../src/running'

const mockDataCreate = jest.fn()
const mockDataGet = jest.fn()
const mockDataSet = jest.fn()

jest.mock('../src/data', () => ({
  Data: () => ({
    create: jest.fn((...args) => mockDataCreate(...args)),
    set: jest.fn((...args) => mockDataSet(...args)),
    get: jest.fn((...args) => mockDataGet(...args)),
  }),
}))

describe('Running jobs', () => {
  let runningJobs: IRunningJobs
  beforeEach(async () => {
    runningJobs = await RunningJobs({})
    jest.clearAllMocks()
  })
  const jobBeforeCreate = {
    user: 'bla',
    version: 'master',
    jobname: 'deploy',
  }
  const jobAfterCreate = {
    ...jobBeforeCreate,
    id: 123,
  }

  it('should be able to start a job', () => {
    mockDataCreate.mockResolvedValue(jobAfterCreate)
    return expect(runningJobs.startJob(jobBeforeCreate)).resolves.toEqual(jobAfterCreate)
  })
  it('should be able to end an existing job without setting as skipped', async () => {
    mockDataGet.mockResolvedValue([jobAfterCreate])
    mockDataSet.mockResolvedValue(jobAfterCreate)
    const result = await runningJobs.endJob(jobBeforeCreate)
    expect(mockDataSet).toHaveBeenCalledWith(expect.objectContaining({
      skipped: false,
    }))
    expect(result).toEqual(jobAfterCreate)
  })
  it('should be able to end an existing job when setting as skipped', async () => {
    mockDataGet.mockResolvedValue([jobAfterCreate])
    mockDataSet.mockResolvedValue(jobAfterCreate)
    const result = await runningJobs.endJob({
      ...jobBeforeCreate,
      skipped: true,
    })
    expect(mockDataSet).toHaveBeenCalledWith(expect.objectContaining({
      skipped: true,
    }))
    expect(result).toEqual(jobAfterCreate)
  })
  it('should return null when trying to end a non existing job', async () => {
    mockDataGet.mockResolvedValue([])
    const result = await runningJobs.endJob(jobBeforeCreate)
    expect(result).toBeNull()
  })
  it('should be able all running jobs within timeframe', async () => {
    mockDataGet.mockResolvedValue([])
    const result = await runningJobs.getRunningJobs({ jobname: jobAfterCreate.jobname })

    expect(mockDataGet).toHaveBeenCalledWith(expect.objectContaining({
      filterExpression: '(#jobname = :jobname) AND (#started > :ttl AND attribute_not_exists(ended))',
    }))
    expect(result).toHaveLength(0)
  })
  it('should be able all skipped jobs within timeframe', async () => {
    mockDataGet.mockResolvedValue([])
    const result = await runningJobs.getSkippedJobs({ jobname: jobAfterCreate.jobname })

    expect(mockDataGet).toHaveBeenCalledWith(expect.objectContaining({
      filterExpression: '(#jobname = :jobname) AND (#started > :ttl AND #skipped = :skipped)',
    }))
    expect(result).toHaveLength(0)
  })
})

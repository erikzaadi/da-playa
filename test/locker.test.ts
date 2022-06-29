import {
  Locker, ILock,
} from '../src/locker'

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

describe('locker', () => {
  let locker: ILock
  const testLockBeforeCreate = { user: 'joe', env: 'prod' }
  const testLockAfterCreate = {
    ...testLockBeforeCreate,
    id: 'bla',
  }
  const uberLockAfter = {
    ...testLockAfterCreate,
    uberlock: true,
  }
  const uberLockBefore = {
    ...testLockBeforeCreate,
    uberlock: true,
  }
  const otherLocks = new Array(5).fill(0).map(() => ({
    ...testLockBeforeCreate,
    user: `bla${Math.round(Math.random() * 3213213)}`,
  }))
  beforeEach(async () => {
    locker = await Locker({})
    jest.clearAllMocks()
  })
  describe('lock', () => {
    it('regular lock', async () => {
      mockDataGet.mockResolvedValue([])
      mockDataCreate.mockResolvedValue(testLockAfterCreate)
      const result = await locker.lock(testLockBeforeCreate)

      expect(result).toEqual(testLockAfterCreate)
    })
    it('when a lock already exists for the same user', async () => {
      mockDataGet.mockResolvedValue([testLockAfterCreate])
      mockDataCreate.mockResolvedValue(testLockAfterCreate)
      const result = await locker.lock(testLockBeforeCreate)

      expect(result).toEqual(testLockAfterCreate)
    })
    it('when a lock already exists for a different user', async () => {
      const otherUser = {
        ...testLockAfterCreate,
        user: 'other',
      }
      mockDataGet.mockResolvedValue([otherUser])
      mockDataCreate.mockResolvedValue(testLockAfterCreate)
      const result = await locker.lock(testLockBeforeCreate)

      expect(result).toHaveProperty('currentLock', otherUser)
    })
    it('uberlock creates when no other users', async () => {
      mockDataGet.mockResolvedValue([])
      mockDataCreate.mockResolvedValue(uberLockAfter)
      const result = await locker.lock(uberLockBefore)
      expect(result).toEqual(uberLockAfter)
    })
    it('uberlock creates even with other users', async () => {
      mockDataGet.mockResolvedValue(otherLocks)
      mockDataCreate.mockResolvedValue(uberLockAfter)
      const result = await locker.lock(uberLockBefore)
      expect(result).toEqual(uberLockAfter)
    })
  })
  describe('release', () => {
    it('should release for existing lock', async () => {
      const nonActiveAfter = {
        ...testLockAfterCreate,
        active: false,
      }
      mockDataGet.mockResolvedValue([testLockAfterCreate])
      mockDataSet.mockResolvedValue(nonActiveAfter)
      const released = await locker.release(testLockAfterCreate)
      expect(released).toEqual(nonActiveAfter)
    })
    it('should work even if no existing lock', async () => {
      mockDataGet.mockResolvedValue([])
      const released = await locker.release(testLockAfterCreate)
      expect(released).toHaveProperty('notLockedBy', testLockBeforeCreate.user)
    })
    it('should not release for uberlock if not specified', async () => {
      mockDataGet.mockResolvedValue([uberLockAfter])
      const released = await locker.release(testLockAfterCreate)
      expect(released).toHaveProperty('currentLock', uberLockAfter)
    })
    it('should release for uberlock if specified', async () => {
      const nonActiveAfter = {
        ...uberLockAfter,
        active: false,
      }
      mockDataGet.mockResolvedValue([uberLockAfter])
      mockDataSet.mockResolvedValue(nonActiveAfter)
      const released = await locker.release(uberLockAfter)
      expect(released).toEqual(nonActiveAfter)
    })
  })
  describe('locks', () => {
    it('should return locks per env', async () => {
      mockDataGet.mockResolvedValue(otherLocks)
      expect(locker.locks('prod')).resolves.toEqual(otherLocks)
      expect(mockDataGet).toHaveBeenCalledWith({
        filterAttributeNames: expect.anything(),
        filterAttributeValues: expect.objectContaining({
          ':env': 'prod',
        }),
        filterExpression: '#env = :env AND ((#started > :ttl OR #uberlock = :true) AND #active = :true)',
      })
    })
    it('should be able to filter by user', async () => {
      mockDataGet.mockResolvedValue([testLockAfterCreate])
      expect(locker.locks('prod', testLockAfterCreate.user)).resolves.toEqual([testLockAfterCreate])
      expect(mockDataGet).toHaveBeenCalledWith({
        filterAttributeNames: expect.anything(),
        filterAttributeValues: expect.objectContaining({
          ':env': 'prod',
          ':user': testLockAfterCreate.user,
        }),
        filterExpression: '#env = :env AND ((#started > :ttl OR #uberlock = :true) AND #active = :true) AND #user = :user',
      })
    })
  })
})

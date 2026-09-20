type Task<T> = {
  key: string
  priority: number
  run: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

const queue: Task<unknown>[] = []
const inFlight = new Map<string, Promise<unknown>>()
let active = 0

export function enqueueImage<T>(key: string, run: () => Promise<T>, priority = 0): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) return existing as Promise<T>
  const promise = new Promise<T>((resolve, reject) => {
    queue.push({ key, priority, run, resolve: resolve as (value: unknown) => void, reject })
    queue.sort((left, right) => right.priority - left.priority)
    void pump()
  })
  inFlight.set(key, promise)
  void promise.finally(() => inFlight.delete(key)).catch(() => undefined)
  return promise
}

export function imageRequestsActive(): number {
  return active
}

async function pump(): Promise<void> {
  while (active < 4 && queue.length > 0) {
    const task = queue.shift()!
    active += 1
    void Promise.resolve().then(task.run).then(task.resolve, task.reject).finally(() => {
      active -= 1
      void pump()
    })
  }
}

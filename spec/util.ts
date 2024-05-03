export async function arrayFromAsync<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const array: T[] = []

  for await (const item of iter) {
    array.push(item)
  }

  return array
}

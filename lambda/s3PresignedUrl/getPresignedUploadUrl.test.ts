import { getPresignedUploadUrl } from "./getPresignedUploadUrl";

test('With valid params', async () => {
  const { data, error } = await getPresignedUploadUrl({
    bucket: 'some-bucket',
    filename: 'some-key.jpg',
  })

  expect(error).toBeNull()
  expect(data).toMatchObject({
    url: expect.any(String),
    key: expect.stringContaining('some-key.jpg'),
  })
});

test('With valid params and no filename (uses default)', async () => {
  const { data, error } = await getPresignedUploadUrl({
    bucket: 'some-bucket',
  })

  expect(error).toBeNull()
  expect(data).toMatchObject({
    url: expect.any(String),
    key: expect.stringContaining('file'),
  })
});

test('With invalid params: empty bucket', async () => {
  const { data, error } = await getPresignedUploadUrl({
    bucket: '',
  })

  expect(data).toBeNull()
  expect(error).toBeInstanceOf(Error)
});

test('With invalid params: falsy bucket value', async () => {
  const { data, error } = await getPresignedUploadUrl({
    bucket: null,
  } as any)

  expect(data).toBeNull()
  expect(error).toBeInstanceOf(Error)
});

test('With invalid params: missing bucket', async () => {
  const { data, error } = await getPresignedUploadUrl({
  } as any)

  expect(data).toBeNull()
  expect(error).toBeInstanceOf(Error)
});

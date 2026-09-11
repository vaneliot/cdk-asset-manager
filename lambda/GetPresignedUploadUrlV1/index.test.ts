import { handler } from './index';
import { getPresignedUploadUrl } from './getPresignedUploadUrl';

jest.mock('./getPresignedUploadUrl');
const mockGetPresignedUploadUrl = getPresignedUploadUrl as jest.Mock;

test('passes filename from the payload', async () => {
  mockGetPresignedUploadUrl.mockResolvedValue('https://example.com/signed');

  await handler({ body: JSON.stringify({ filename: 'cat.jpg' }) } as any, {} as any, () => {});

  expect(mockGetPresignedUploadUrl).toHaveBeenCalledWith({
    filename: 'cat.jpg',
  });
});

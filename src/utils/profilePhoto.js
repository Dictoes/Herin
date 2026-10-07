export const PROFILE_PHOTO_BUCKET = 'herin-profile-photos';
export const MAX_PROFILE_PHOTO_SIZE = 5 * 1024 * 1024;

const PROFILE_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function validateProfilePhoto(file) {
  if (!file || !PROFILE_PHOTO_TYPES.has(file.type)) {
    throw Error('Choose a JPG, PNG, WebP, or GIF image.');
  }
  if (file.size === 0) {
    throw Error('Choose an image that is not empty.');
  }
  if (file.size > MAX_PROFILE_PHOTO_SIZE) {
    throw Error('Profile pictures must be 5 MB or smaller.');
  }
}

export async function getProfilePhotoUrl(client, path) {
  const { data, error } = await client.storage.from(PROFILE_PHOTO_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PROFILE_PHOTO_SIZE, PROFILE_PHOTO_BUCKET, validateProfilePhoto } from '../src/utils/profilePhoto.js';

test('profile picture accepts supported image formats up to 5 MB', () => {
  assert.equal(PROFILE_PHOTO_BUCKET, 'herin-profile-photos');
  for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
    assert.doesNotThrow(() => validateProfilePhoto({ type, size: MAX_PROFILE_PHOTO_SIZE }));
  }
});

test('profile picture rejects unsupported formats and files over 5 MB', () => {
  assert.throws(() => validateProfilePhoto({ type: 'image/svg+xml', size: 10 }), /JPG, PNG, WebP, or GIF/);
  assert.throws(() => validateProfilePhoto({ type: 'image/png', size: 0 }), /not empty/);
  assert.throws(() => validateProfilePhoto({ type: 'image/png', size: MAX_PROFILE_PHOTO_SIZE + 1 }), /5 MB or smaller/);
  assert.throws(() => validateProfilePhoto(null), /JPG, PNG, WebP, or GIF/);
});

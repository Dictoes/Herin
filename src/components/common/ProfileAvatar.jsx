import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { getProfilePhotoUrl } from '../../utils/profilePhoto';

export default function ProfileAvatar({ displayName = '', className = '' }) {
  const auth = useAuth();
  const user = auth?.session?.user;
  const avatarPath = user?.user_metadata?.avatar_path;
  const [photoUrl, setPhotoUrl] = useState('');
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setPhotoUrl('');
    setImageFailed(false);
    if (supabase && avatarPath) {
      getProfilePhotoUrl(supabase, avatarPath)
        .then((url) => { if (active) setPhotoUrl(url); })
        .catch(() => { if (active) setImageFailed(true); });
    }
    return () => { active = false; };
  }, [avatarPath]);

  const name = displayName || user?.user_metadata?.full_name || user?.email || '';
  const initials = name.trim().split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  return (
    <span className={`profile-avatar ${className}`} aria-hidden="true">
      {photoUrl && !imageFailed
        ? <img src={photoUrl} alt="" onError={() => setImageFailed(true)} />
        : <span>{initials || 'H'}</span>}
    </span>
  );
}

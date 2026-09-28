// Public browser configuration for this Herin project, not server credentials.
// Vercel environment variables can override these values for another project.
const defaults = {
  url: 'https://ycejqtvemiesuiflyqmw.supabase.co',
  key: 'sb_publishable_AijWNHD9Yhl39nMhB1HwOA_pCeE5ySV',
};

export function resolveSupabaseConfig(env = {}) {
  const url = env.VITE_SUPABASE_URL?.trim() || defaults.url;
  const key = env.VITE_SUPABASE_ANON_KEY?.trim() || defaults.key;
  if (key.startsWith('sb_secret_')) throw new Error('Use a Supabase publishable key in the frontend.');
  return { url, key };
}

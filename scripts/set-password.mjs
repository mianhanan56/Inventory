/**
 * Changes the app login password. Run it on your own machine:
 *
 *   OLD_PASSWORD='OnTarget#Temp2026' NEW_PASSWORD='jo-bhi-rakhna-ho' node scripts/set-password.mjs
 *
 * Signs in with the current password, then updates it. Nothing is stored and no
 * service-role key is needed — the account changes its own password.
 */
import { createClient } from '@supabase/supabase-js';

const URL = 'https://uytybsrcjxcxzcpspgeu.supabase.co';
const KEY = 'sb_publishable_rkuvC2hXb_ZttapLgyxgww_l1SPSQ7t';
const EMAIL = 'aleemyaseen39@gmail.com';

const { OLD_PASSWORD, NEW_PASSWORD } = process.env;
if (!OLD_PASSWORD || !NEW_PASSWORD) {
  console.error('Set OLD_PASSWORD and NEW_PASSWORD. See the comment at the top of this file.');
  process.exit(1);
}
if (NEW_PASSWORD.length < 8) {
  console.error('New password must be at least 8 characters.');
  process.exit(1);
}

const supabase = createClient(URL, KEY);

const { error: signInError } = await supabase.auth.signInWithPassword({
  email: EMAIL,
  password: OLD_PASSWORD,
});
if (signInError) {
  console.error('Sign-in failed:', signInError.message);
  process.exit(1);
}

const { error: updateError } = await supabase.auth.updateUser({ password: NEW_PASSWORD });
if (updateError) {
  console.error('Password change failed:', updateError.message);
  process.exit(1);
}

console.log('Password changed. Sign in with the new one from now on.');
